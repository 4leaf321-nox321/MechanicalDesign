/**
 * 응력집중 — 단이 진 곳과 구멍 뚫린 곳.
 *
 * 이 계산은 어렵지 않다. 표에서 `Kt` 를 읽어 공칭응력에 곱하면 끝이다. 실제로
 * 틀리는 자리는 **어느 치수를 넣느냐**다:
 *
 *     필렛   Kt 는 D/d 와 **r/d** 로 정해진다 — r 을 큰 쪽 지름으로 나누는 실수
 *     구멍   Kt 는 d/w 로 정해지고, 공칭응력을 **어느 단면**으로 잡느냐가 갈린다
 *
 * 구멍 쪽은 특히 조용히 틀린다. 표에 따라 공칭응력을 원래 폭(총단면)으로 잡기도
 * 하고 남은 살(순단면)로 잡기도 하는데, 둘은 값이 다르다. 어느 쪽 표를 쓰는지
 * 모르고 곱하면 결과가 몇 십 퍼센트씩 어긋난다 — 그런데 숫자는 아무 말도 안 한다.
 *
 * 그림이 할 일은 그 자리들을 손가락으로 짚는 것이다.
 */

import { ROLE, bounds, circle, dim, flow, line, path, positive, tag } from './geometry'

const FILLET_PARAMS = [
  { key: 'D', label: '큰 쪽 지름', required: true },
  { key: 'd', label: '작은 쪽 지름', required: true },
  { key: 'r', label: '필렛 반지름', required: true },
]

const FILLET_EXAMPLE = { D: 60, d: 40, r: 4 }

function buildFillet(values) {
  const missing = FILLET_PARAMS.filter(p => p.required && !positive(values[p.key]))
  const example = missing.length > 0
  const D = example ? FILLET_EXAMPLE.D : positive(values.D)
  const d = example ? FILLET_EXAMPLE.d : positive(values.d)
  const r = example ? FILLET_EXAMPLE.r : positive(values.r)

  if (!example && d >= D) {
    return {
      ok: false,
      impossible: `작은 쪽(${d})이 큰 쪽(${D})보다 작아야 단이 집니다.`,
    }
  }
  const step = (D - d) / 2
  if (!example && r > step) {
    return {
      ok: false,
      impossible: `필렛 반지름(${r})이 단 높이(${step})보다 크면 들어가지 않습니다.`,
    }
  }

  const R = D / 2
  const h = d / 2
  const big = D * 0.75          // 그려 보일 길이 — 계산에 안 쓰인다
  const small = D * 0.95

  // 위아래가 대칭이라 한쪽을 그리고 뒤집는다. 필렛은 어깨면과 작은 쪽 겉면에
  // 모두 접해야 한다 — 접선이 아니면 그림이 다른 형상을 말한다.
  const side = (s) => `M ${-big} ${s * R} L 0 ${s * R} L 0 ${s * (h + r)}`
    + ` A ${r} ${r} 0 0 ${s > 0 ? 1 : 0} ${r} ${s * h} L ${small} ${s * h}`
  const shapes = [
    path(side(-1)),
    path(side(1)),
    line(-big * 1.05, 0, small * 1.05, 0, ROLE.center),
  ]

  const pad = D * 0.26
  const shown = (v) => (example ? null : v)
  const dims = [
    dim([-big * 0.72, -R], [-big * 0.72, R],
        { offset: -pad, label: 'Ø{}', symbol: 'D',
          value: shown(D), unit: values._units?.D }),
    dim([small * 0.82, -h], [small * 0.82, h],
        { offset: pad, label: 'Ø{}', symbol: 'd',
          value: shown(d), unit: values._units?.d }),
  ]

  // 반지름은 **필렛 자리에서 끌어낸다.** 표 옆에 숫자만 적으면 어느 모서리
  // 이야기인지 알 수 없고, 그 헷갈림이 이 도해가 있는 이유다.
  const touch = [r * 0.3, -(h + r * 0.3)]
  const elbow = [r + pad * 0.9, -(h + step * 0.55) - pad * 0.5]
  shapes.push(line(touch[0], touch[1], elbow[0], elbow[1], ROLE.ghost))
  shapes.push(line(elbow[0], elbow[1], elbow[0] + pad * 0.5, elbow[1], ROLE.ghost))
  const tags = [tag(elbow[0] + pad * 0.65, elbow[1] + D * 0.03,
                    example ? 'R r' : `R${r}`, 'start')]

  const notes = []
  if (!example) {
    notes.push(`Kt 는 D/d = ${Math.round((D / d) * 100) / 100} 와`
      + ` r/d = ${Math.round((r / d) * 1000) / 1000} 로 정해집니다`
      + ' — r 을 나누는 것은 큰 쪽이 아니라 작은 쪽 지름입니다.')
  }
  notes.push('그려 보인 길이는 형상을 나타낸 것일 뿐, 이 계산에 쓰이지 않습니다.')

  return {
    ok: true,
    example,
    missing: missing.map(p => p.key),
    shapes,
    dims,
    tags,
    notes,
    box: bounds([...shapes, ...dims, ...tags]),
  }
}

const HOLE_PARAMS = [
  { key: 'w', label: '판 폭', required: true },
  { key: 'd', label: '구멍 지름', required: true },
]

const HOLE_EXAMPLE = { w: 80, d: 20 }

function buildHole(values) {
  const missing = HOLE_PARAMS.filter(p => p.required && !positive(values[p.key]))
  const example = missing.length > 0
  const w = example ? HOLE_EXAMPLE.w : positive(values.w)
  const d = example ? HOLE_EXAMPLE.d : positive(values.d)

  if (!example && d >= w) {
    return {
      ok: false,
      impossible: `구멍 지름(${d})이 판 폭(${w})보다 작아야 합니다.`,
    }
  }

  const half = w / 2
  const long = w * 1.25         // 그려 보일 길이 — 계산에 안 쓰인다
  const shapes = [
    line(-long, -half, long, -half),
    line(-long, half, long, half),
    circle(0, 0, d / 2),
    line(-d, 0, d, 0, ROLE.center),
    line(0, -d, 0, d, ROLE.center),
  ]

  const reach = w * 0.3
  const flows = example ? [] : [
    flow(-long, 0, -long - reach, 0, 'P'),
    flow(long, 0, long + reach, 0, 'P'),
  ]

  const pad = w * 0.22
  const shown = (v) => (example ? null : v)
  const dims = [
    dim([-long * 0.75, -half], [-long * 0.75, half],
        { offset: -pad, label: '{}', symbol: 'w',
          value: shown(w), unit: values._units?.w }),
    dim([-d / 2, half], [d / 2, half],
        { offset: pad, label: 'Ø{}', symbol: 'd',
          value: shown(d), unit: values._units?.d }),
  ]

  // 남은 살이 어디인지 눈으로 짚는다. 공칭응력을 어느 단면으로 잡느냐가
  // 갈리는 자리가 바로 여기다.
  const tags = [tag(long * 0.66, -half - pad * 0.35, '남은 살 (w − d)/2', 'end')]
  shapes.push(line(long * 0.5, -half, long * 0.5, -d / 2, ROLE.ghost))
  shapes.push(line(long * 0.5, -half, long * 0.66, -half - pad * 0.22, ROLE.ghost))

  const notes = []
  if (!example) {
    notes.push(`Kt 는 d/w = ${Math.round((d / w) * 1000) / 1000} 로 정해집니다.`)
  }
  notes.push('공칭응력을 원래 폭(총단면)으로 잡는 표와 남은 살(순단면)로 잡는 표가'
    + ' 따로 있습니다 — 쓰시는 표가 어느 쪽인지 확인해야 값이 맞습니다.')

  return {
    ok: true,
    example,
    missing: missing.map(p => p.key),
    shapes,
    flows,
    dims,
    tags,
    notes,
    box: bounds([...shapes, ...dims, ...flows, ...tags]),
  }
}

export const fillet = {
  id: 'notch_fillet',
  name: '단 (필렛)',
  summary: 'Kt 를 정하는 r 이 어느 모서리이고 무엇으로 나누는지 짚습니다.',
  params: FILLET_PARAMS,
  build: buildFillet,
}

export const hole = {
  id: 'notch_hole',
  name: '구멍 뚫린 판',
  summary: '구멍과 남은 살. 공칭응력을 어느 단면으로 잡을지 갈리는 자리입니다.',
  params: HOLE_PARAMS,
  build: buildHole,
}
