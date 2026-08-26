/**
 * 스프링 — 코일과 판.
 *
 * 코일 스프링에서 숫자로는 감이 안 오는 값이 **스프링지수** `C = D/d` 다. 계산에
 * 직접 들어가고(응력 보정계수가 여기서 나온다), 만들 수 있느냐까지 여기서 갈린다:
 *
 *     C < 4    감기가 어렵고 소선 안쪽에 응력이 몰린다
 *     4 ~ 12   보통 쓰는 범위
 *     C > 12   하중을 받을 때 옆으로 흔들리기 쉽다
 *
 * 그런데 `D = 30, d = 4` 라는 두 숫자를 봐서는 그 비가 7.5 인지 눈에 안 들어온다.
 * 그림에서는 소선 굵기와 코일 지름의 비가 그냥 보인다 — 실처럼 가늘면 C 가 크고,
 * 뭉툭하면 작다. 그래서 이 도해는 **소선을 실제 비율로** 그린다.
 *
 * 판 스프링은 다른 이야기다. 거기서 안 보이는 것은 **판이 몇 장이냐**로, 장수가
 * 그대로 강성에 곱해진다.
 */

import { ROLE, bounds, circle, dim, flow, line, path, positive, tag } from './geometry'

const COIL_PARAMS = [
  { key: 'D', label: '코일 평균지름', required: true },
  { key: 'd', label: '소선 지름', required: true },
  { key: 'n', label: '유효 감김수', required: false },
  { key: 'L', label: '자유길이', required: false },
]

const COIL_EXAMPLE = { D: 30, d: 4, n: 5 }

/** 감김을 몇 권까지 그릴까. 넘으면 촘촘하기만 하고 뜻이 안 는다. */
const MAX_TURNS = 9

/** 스프링지수가 이 밖이면 만들기가 곤란하다. 그림이 그 사실을 말한다. */
const INDEX_LOW = 4
const INDEX_HIGH = 12

function buildCoil(values) {
  const missing = COIL_PARAMS.filter(p => p.required && !positive(values[p.key]))
  const example = missing.length > 0
  const D = example ? COIL_EXAMPLE.D : positive(values.D)
  const d = example ? COIL_EXAMPLE.d : positive(values.d)

  if (!example && d >= D) {
    return {
      ok: false,
      impossible: `소선 지름(${d})이 코일 평균지름(${D})보다 작아야 합니다.`,
    }
  }

  const notes = []
  const asked = Math.round((example ? COIL_EXAMPLE.n : positive(values.n)) || 5)
  const givenN = !example && positive(values.n)
  const n = Math.min(Math.max(asked, 2), MAX_TURNS)
  if (asked > MAX_TURNS) {
    notes.push(`${asked}권 중 ${MAX_TURNS}권만 그렸습니다 — 나머지도 같은 간격입니다.`)
  }
  if (!givenN) {
    notes.push('감김수가 배선되지 않아 5권으로 그렸습니다.')
  }

  const givenL = example ? null : positive(values.L)
  let pitch = givenL ? (givenL - d) / n : d * 2.4
  if (pitch <= d) {
    // 코일이 서로 닿는다. 겹쳐 그리면 몇 권인지도 안 보이므로 벌려 그리고,
    // **벌렸다는 사실을 적는다** — 그림이 자유길이를 지키는 척하면 안 된다.
    pitch = d * 1.15
    notes.push('자유길이가 감김수에 비해 짧아 코일이 서로 닿습니다 — 그림은 벌려 그렸습니다.')
  }

  const r = d / 2
  const half = D / 2
  const wires = []
  const strands = []
  for (let k = 0; k <= n; k += 1) {
    const yl = k * pitch
    wires.push(circle(-half, yl, r, ROLE.cut))
    if (k < n) {
      const yr = yl + pitch / 2
      wires.push(circle(half, yr, r, ROLE.cut))
      strands.push(line(-half, yl, half, yr))
      strands.push(line(half, yr, -half, yl + pitch))
    }
  }
  // 소선 단면을 나중에 그려 이어지는 선을 가린다 — 앞뒤가 안 갈리면 감긴
  // 모양이 아니라 그물처럼 보인다.
  const bottom = n * pitch
  const shapes = [...strands, ...wires, line(0, -d, 0, bottom + d, ROLE.center)]

  const pad = D * 0.3
  const shown = (v) => (example ? null : v)
  const dims = [
    dim([-half, bottom + r], [half, bottom + r],
        { offset: pad, label: '{}', symbol: 'D',
          value: shown(D), unit: values._units?.D }),
    // 소선은 코일 하나에만 잰다. 전부 붙이면 치수가 형상을 덮는다.
    dim([-half - r, 0], [-half + r, 0],
        { offset: -pad * 0.75, label: 'Ø{}', symbol: 'd',
          value: shown(d), unit: values._units?.d }),
  ]
  if (givenL) {
    dims.push(dim([half + r, -r], [half + r, bottom + r],
                  { offset: pad, label: '{}', symbol: 'L',
                    value: givenL, unit: values._units?.L }))
  }

  const index = D / d
  const rounded = Math.round(index * 10) / 10
  const tags = example ? [] : [tag(0, -d - pad * 0.4, `C = D/d = ${rounded}`)]
  if (!example) {
    if (index < INDEX_LOW) {
      notes.push(`스프링지수 C = ${rounded} — ${INDEX_LOW} 미만이라 감기가 어렵고`
        + ' 소선 안쪽에 응력이 몰립니다.')
    } else if (index > INDEX_HIGH) {
      notes.push(`스프링지수 C = ${rounded} — ${INDEX_HIGH} 를 넘어 하중을 받을 때`
        + ' 옆으로 흔들리기 쉽습니다.')
    } else {
      notes.push(`스프링지수 C = ${rounded} (보통 ${INDEX_LOW}~${INDEX_HIGH} 를 씁니다).`)
    }
  }

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

const LEAF_PARAMS = [
  { key: 'L', label: '스팬', required: true },
  { key: 't', label: '판 두께', required: true },
  { key: 'n', label: '판 수', required: false },
]

const LEAF_EXAMPLE = { L: 1000, t: 8, n: 5 }

/** 판을 몇 장까지 그릴까. */
const MAX_LEAVES = 8

function buildLeaf(values) {
  const missing = LEAF_PARAMS.filter(p => p.required && !positive(values[p.key]))
  const example = missing.length > 0
  const L = example ? LEAF_EXAMPLE.L : positive(values.L)
  const t = example ? LEAF_EXAMPLE.t : positive(values.t)

  const notes = []
  const asked = Math.round((example ? LEAF_EXAMPLE.n : positive(values.n)) || 5)
  const givenN = !example && positive(values.n)
  const n = Math.min(Math.max(asked, 1), MAX_LEAVES)
  if (asked > MAX_LEAVES) {
    notes.push(`판 ${asked}장 중 ${MAX_LEAVES}장만 그렸습니다.`)
  }
  if (!givenN) {
    notes.push('판 수가 배선되지 않아 5장으로 그렸습니다.')
  }

  // 판 두께를 실제 비율로 그리면 스팬에 비해 실처럼 가늘어 장수가 안 보인다.
  // 두께만 부풀리고 **그 사실을 적는다** — 치수는 준 값 그대로 적는다.
  const draw = Math.max(t, L / 55)
  if (!example && draw > t * 1.05) {
    notes.push('판 두께는 장수가 보이도록 부풀려 그렸습니다 — 치수는 준 값 그대로입니다.')
  }

  // 판 스프링은 **휘어 있다.** 곧게 그리면 스팬에 비해 납작해 몇 장인지 안 보이고,
  // 무엇보다 판 스프링처럼 안 보인다 — 휘어 있는 것이 이 물건의 생김새다.
  const camber = L / 11
  const shapes = []
  for (let k = 0; k < n; k += 1) {
    // 가장 긴 판(모판)이 맨 위. 아래로 갈수록 짧아진다.
    const a = (L * (1 - (k * 0.82) / n)) / 2
    const top = k * draw
    const low = top + draw
    // 이차 곡선은 조절점 높이의 **절반**만큼 가운데가 처진다. 두 배로 준다.
    shapes.push(path(
      `M ${-a} ${top} Q 0 ${top - camber * 2} ${a} ${top}`
      + ` L ${a} ${low} Q 0 ${low - camber * 2} ${-a} ${low} Z`,
      ROLE.cut,
    ))
  }

  const flows = []
  if (!example) {
    const reach = L * 0.1
    const crest = -L / 11
    flows.push(flow(0, crest - reach, 0, crest - reach * 0.15, 'P'))
  }

  const pad = L * 0.06
  const shown = (v) => (example ? null : v)
  const dims = [
    // 스팬은 **모판의 두 끝** 사이다. 휜 부분이 아니라 받침 사이 거리다.
    dim([-L / 2, n * draw], [L / 2, n * draw],
        { offset: pad * 1.6, label: '{}', symbol: 'L',
          value: shown(L), unit: values._units?.L }),
    dim([-L / 2, 0], [-L / 2, draw],
        { offset: -pad, label: '{}', symbol: 't',
          value: shown(t), unit: values._units?.t }),
  ]

  const tags = example ? []
    : [tag(L * 0.46, -camber * 1.1, `판 ${n}장`, 'end')]

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

export const coil = {
  id: 'spring_coil',
  name: '코일 스프링',
  summary: '소선을 실제 비율로 그려 스프링지수 C = D/d 가 눈에 보이게 합니다.',
  params: COIL_PARAMS,
  build: buildCoil,
}

export const leaf = {
  id: 'spring_leaf',
  name: '판 스프링',
  summary: '겹친 판의 장수와 스팬. 장수가 그대로 강성에 곱해집니다.',
  params: LEAF_PARAMS,
  build: buildLeaf,
}
