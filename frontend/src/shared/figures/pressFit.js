/**
 * 압입 — 억지끼워맞춤. 축이 구멍보다 굵다.
 *
 * 압입의 전부인 간섭량 δ 는 **도면에서 보이지 않는 값**이다. 축 Ø20.03 과
 * 구멍 Ø20.00 — 숫자 두 개의 차이 0.03 이 무는 힘의 전부인데, 실척으로
 * 그리면 완전히 같은 그림이 된다. 그래서 이 도해는 그 차이를 부풀려 그리고,
 * 부풀렸다는 사실을 적는다. 관로가 파단선으로 하는 일과 같다.
 *
 * 하나 더, 직관이 놓치는 것: **무는 힘은 δ 만으로 정해지지 않는다.** 허브
 * 살이 얇으면 같은 간섭에서도 허브가 풍선처럼 늘어나 면압이 떨어진다.
 * δ 를 키웠는데 안 물리면 허브 살두께부터 봐야 한다.
 */

import { ROLE, bounds, dim, line, path, positive, rect, tag } from './geometry'

const PARAMS = [
  { key: 'd', label: '축 지름', required: true },
  { key: 'delta', label: '간섭량 (지름 기준)', required: true },
  { key: 'D', label: '허브 바깥지름', required: false },
  { key: 'L', label: '물림 길이', required: false },
]

const EXAMPLE = { d: 20, delta: 0.03 }

const round3 = (v) => Math.round(v * 1000) / 1000

function build(values) {
  const missing = PARAMS.filter(p => p.required && !positive(values[p.key]))
  const example = missing.length > 0
  const d = example ? EXAMPLE.d : positive(values.d)
  const delta = example ? EXAMPLE.delta : positive(values.delta)

  if (!example && delta >= d * 0.2) {
    return {
      ok: false,
      impossible: `간섭량(${delta})이 지름(${d})에 비해 너무 큽니다 — 압입 간섭은`
        + ' 지름의 1 % 미만대입니다.',
    }
  }

  const notes = []
  const givenD = example ? null : positive(values.D)
  if (givenD && givenD <= d) {
    return {
      ok: false,
      impossible: `허브 바깥지름(${givenD})이 축 지름(${d})보다 커야 살이 남습니다.`,
    }
  }
  const givenL = example ? null : positive(values.L)

  // 간섭을 부풀린다 — 실척이면 축과 구멍이 같은 그림이 된다.
  const deltaVis = Math.max(delta, d * 0.06)
  if (!example && deltaVis > delta) {
    notes.push('간섭은 실제로 눈에 안 보이는 크기라 부풀려 그렸습니다 — 치수와'
      + ' 판정은 준 값 그대로입니다.')
  }

  const holeH = d - deltaVis
  const wallT = givenD ? (givenD - d) / 2 : d * 0.45
  const hubL = givenL || d * 1.2
  const shapes = [
    rect(0, -holeH / 2 - wallT, hubL, wallT, ROLE.cut),
    rect(0, holeH / 2, hubL, wallT, ROLE.cut),
  ]

  // 축 — 박기 직전. 구멍 앞에 세워야 「구멍보다 굵다」 가 보인다.
  // 체결 상대라 단면을 안 치고, 끝에는 압입을 안내하는 모따기를 둔다.
  const gap = d * 0.28
  const Ls = d * 1.5
  const xs = hubL + gap
  const cham = deltaVis * 1.1
  shapes.push(path(
    `M ${xs + cham} ${-d / 2} L ${xs + Ls} ${-d / 2} L ${xs + Ls} ${d / 2}`
    + ` L ${xs + cham} ${d / 2} L ${xs} ${d / 2 - cham} L ${xs} ${-d / 2 + cham} Z`,
    ROLE.front,
  ))
  shapes.push(line(-d * 0.15, 0, xs + Ls + d * 0.15, 0, ROLE.center))

  // 턱 — 축이 구멍보다 굵어 걸리는 그 자리. 이 도해가 보여 주려는 것이 이 턱이다.
  shapes.push(line(xs, -d / 2 + cham * 0.4, hubL + gap * 0.35, -d / 2 - d * 0.16,
                   ROLE.ghost))
  const tags = [tag(hubL + gap * 0.35, -d / 2 - d * 0.22,
                    example ? 'δ (지름 기준)' : `δ = ${delta} (지름 기준)`, 'middle')]

  const pad = d * 0.3
  const dims = [
    dim([xs + Ls, -d / 2], [xs + Ls, d / 2],
        { offset: pad, label: 'Ø{}', symbol: 'd',
          value: example ? null : d, unit: values._units?.d }),
    // 구멍은 d − δ 로 **구한** 값이다. 아래 노트가 그 사실을 말한다.
    dim([0, -holeH / 2], [0, holeH / 2],
        { offset: -pad, label: 'Ø{}', symbol: 'dh', along: 0.5,
          value: example ? null : round3(d - delta), unit: values._units?.d }),
  ]
  if (givenD) {
    // 구멍 치수와 높이를 어긋나게 — 나란히 두면 글자가 겹친다. 베어링의
    // 안지름·바깥지름과 같은 사정, 같은 처방이다.
    dims.push(dim([0, -holeH / 2 - wallT], [0, holeH / 2 + wallT],
                  { offset: -pad * 2.3, label: 'Ø{}', symbol: 'D', along: 0.22,
                    value: givenD, unit: values._units?.D }))
  }
  if (givenL) {
    dims.push(dim([0, holeH / 2 + wallT], [hubL, holeH / 2 + wallT],
                  { offset: pad, label: '{}', symbol: 'L',
                    value: givenL, unit: values._units?.L }))
  }

  if (!example) {
    notes.push(`구멍 지름은 d − δ = ${round3(d - delta)} 로 구한 값입니다.`)
    const ratio = (delta / d) * 100
    const shown = Math.round(ratio * 1000) / 1000
    if (ratio > 0.3) {
      notes.push(`δ/d = ${shown} % 입니다 — 흔한 압입(대략 0.05~0.25 %)보다 큽니다.`
        + ' 허브가 터지거나 압입력이 감당이 안 되기 쉽습니다.')
    } else if (ratio < 0.03) {
      notes.push(`δ/d = ${shown} % 입니다 — 흔한 압입(대략 0.05~0.25 %)보다 헐겁습니다.`
        + ' 토크를 못 넘기고 미끄러질 수 있습니다.')
    } else {
      notes.push(`δ/d = ${shown} % 입니다 (흔한 압입은 대략 0.05~0.25 %).`)
    }
    if (givenD && givenD / d < 1.5) {
      notes.push(`허브 살이 얇습니다 (D/d = ${Math.round((givenD / d) * 100) / 100})`
        + ' — 같은 간섭에서도 허브가 늘어나 면압이 떨어집니다. 무는 힘은 δ 만으로'
        + ' 정해지지 않습니다.')
    }
  }
  notes.push('모따기와 축 길이는 보기 좋은 비율일 뿐, 계산에 쓰이지 않습니다.')

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

export default {
  id: 'press_fit',
  name: '압입',
  summary: '축이 구멍보다 δ 만큼 굵다 — 안 보이는 간섭을 부풀려 보이고 그렇다고 적습니다.',
  params: PARAMS,
  build,
}
