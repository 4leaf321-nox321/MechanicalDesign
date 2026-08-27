/**
 * 공차 누적 — 부품 n 개가 한 줄로 쌓일 때 틈은 얼마나 움직이나.
 *
 * 기구설계의 본업이다. 부품 하나하나는 ±t 안에 있는데, n 개가 늘어서면
 * 끝의 틈은 그 합만큼 움직인다. 여기서 갈림길이 있다:
 *
 *     최악 합       n · t      전부 한쪽으로 몰린 경우
 *     통계 합(RSS)  √n · t     실제 생산에서 겪는 폭
 *
 * 직관은 최악 합으로 가는데, **n 개가 전부 최악으로 겹치는 일은 드물다.**
 * 다섯 개 ±0.1 이 전부 +0.1 일 확률은 로트에서 거의 안 나온다. 최악 합으로만
 * 설계하면 부품 공차를 필요보다 두 배 넘게 조이게 되고, 그 비용은 금형과
 * 성형 조건이 낸다. 반대로 RSS 로 갔다면 최악 조합 로트가 간섭할 수 있다는
 * 것을 알고 가야 한다 — 어느 쪽이든 선택이지, 공짜는 없다.
 */

import { ROLE, bounds, dim, positive, rect, tag } from './geometry'

const PARAMS = [
  { key: 'n', label: '부품 수', required: true },
  { key: 't', label: '부품 하나의 공차 (±)', required: true },
  { key: 'g', label: '설계 틈', required: false },
]

const EXAMPLE = { n: 5, t: 0.1 }

/** 부품을 몇 개까지 그릴까. */
const MAX_PARTS = 8

const round2 = (v) => Math.round(v * 100) / 100

function build(values) {
  const missing = PARAMS.filter(p => p.required && !positive(values[p.key]))
  const example = missing.length > 0
  const asked = Math.round(example ? EXAMPLE.n : positive(values.n))
  const t = example ? EXAMPLE.t : positive(values.t)

  if (!example && asked < 2) {
    return { ok: false, impossible: '부품이 둘은 되어야 누적이랄 것이 있습니다.' }
  }

  const notes = []
  const n = Math.min(asked, MAX_PARTS)
  if (asked > MAX_PARTS) {
    notes.push(`부품 ${asked}개 중 ${MAX_PARTS}개만 그렸습니다 — 계산은 ${asked}개 값입니다.`)
  }

  const g = example ? null : positive(values.g)

  // 부품 길이는 이 계산에 없는 값이다. 보기 좋은 비율로 그리고, 그렇다고 적는다.
  const bw = 30
  const bh = 18
  const gapVis = bw * 0.45
  const wallT = bh * 0.5
  const innerW = n * bw + gapVis

  const shapes = [
    // 하우징 — 부품들이 들어앉는 틀. 다른 부재라 해칭을 반대로 친다.
    rect(-wallT, bh, innerW + wallT * 2, wallT, ROLE.cut, true),
    rect(-wallT, -bh * 0.55, wallT, bh * 1.55 + wallT, ROLE.cut, true),
    rect(innerW, -bh * 0.55, wallT, bh * 1.55 + wallT, ROLE.cut, true),
  ]
  for (let k = 0; k < n; k += 1) {
    // 부품끼리도 서로 다른 부재다. 해칭을 교대로 쳐야 경계가 읽힌다 —
    // 같은 방향으로 치면 다섯 개가 한 덩어리로 보여, 누적이랄 것이 안 보인다.
    shapes.push(rect(k * bw, 0, bw, bh, ROLE.cut, k % 2 === 1))
  }

  const pad = bh * 0.9
  const dims = [
    // 대표 부품 하나에 ±t. 모든 부품에 다 붙이면 치수가 형상을 덮는다.
    dim([0, 0], [bw, 0],
        { offset: -pad, label: '±{}', symbol: 't',
          value: example ? null : t, unit: values._units?.t }),
  ]
  if (example || g) {
    dims.push(dim([n * bw, 0], [n * bw + gapVis, 0],
                  { offset: -pad, label: '{}', symbol: 'g',
                    value: example ? null : g, unit: values._units?.g }))
  }

  const tags = [tag(n * bw * 0.5, bh + wallT + pad * 0.9,
                    example ? '부품 n개' : `부품 ${asked}개, 각 ±${t}`, 'middle')]

  if (!example) {
    const worst = round2(asked * t)
    const rss = round2(Math.sqrt(asked) * t)
    notes.push(`틈은 최악 합으로 ±${worst}, 통계 합(RSS = √n·t)으로 ±${rss} 움직입니다`
      + ' (구한 값) — 전부 최악으로 겹치는 로트는 드물어, 최악 합으로만 잡으면'
      + ' 부품 공차를 필요보다 훨씬 조이게 됩니다.')
    if (g) {
      if (g >= worst) {
        notes.push(`설계 틈 ${g} 은 최악 합까지 덮습니다 — 어떤 조합에서도 간섭하지 않습니다.`)
      } else if (g >= rss) {
        notes.push(`설계 틈 ${g} 은 통계 합은 덮지만 최악 합에는 못 미칩니다 —`
          + ' 대량생산은 대개 지나가지만, 최악 조합 로트가 나오면 간섭합니다.'
          + ' 그 위험을 알고 고르는 것이 통계 공차입니다.')
      } else {
        notes.push(`설계 틈 ${g} 은 통계 합 ${rss} 보다도 작습니다 — 정상 산포에서도`
          + ' 간섭이 잦습니다. 틈을 키우거나 공차를 조여야 합니다.')
      }
    }
    notes.push('부품마다 공차가 다르면 RSS 는 √(t₁²+t₂²+…) 입니다 — 여기서는 같은'
      + ' 공차 n 개로 보였습니다.')
  }
  notes.push('부품 길이와 틈은 보이도록 그린 비율입니다 — 치수는 준 값 그대로입니다.')

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
  id: 'tol_stack',
  name: '공차 누적',
  summary: '부품 n 개의 틈 — 최악 합 n·t 와 통계 합 √n·t 를 함께 말합니다.',
  params: PARAMS,
  build,
}
