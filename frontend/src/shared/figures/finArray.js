/**
 * 방열 핀 — 자연대류 핀 무리의 단면.
 *
 * TV·셋톱·어댑터처럼 팬 없이 식히는 물건의 방열은 핀 사이 **굴뚝**이 전부다.
 * 데워진 공기가 핀 사이로 떠오르며 열을 실어 나가는데, 여기서 직관이 배신한다 —
 * **핀을 촘촘히 세우면 면적은 늘지만 공기가 못 지나가 오히려 안 식는다.**
 * 간격에는 최적값이 있다(핀 높이·온도차에 따라 대략 5~15 mm 언저리).
 *
 * 면적(핀 수 × 넓이)만 적힌 숫자는 이 이야기를 통째로 숨긴다. 그림은 간격을
 * **실제 비율로** 그려서, 굴뚝이 살아 있는지 막혔는지를 눈이 판단하게 한다.
 * 그래서 이 도해에서 간격을 보기 좋게 부풀리는 일은 없다 — 부풀리는 순간
 * 이 도해가 있는 이유가 사라진다.
 */

import { ROLE, bounds, dim, flow, positive, rect } from './geometry'

const PARAMS = [
  { key: 's', label: '핀 간격', required: true },
  { key: 't', label: '핀 두께', required: true },
  { key: 'H', label: '핀 높이', required: true },
  { key: 'n', label: '핀 수', required: false },
]

const EXAMPLE = { s: 8, t: 1.2, H: 35 }

/** 핀을 몇 장까지 그릴까. 넘으면 촘촘하기만 하고 뜻이 늘지 않는다. */
const MAX_FINS = 12

function build(values) {
  const missing = PARAMS.filter(p => p.required && !positive(values[p.key]))
  const example = missing.length > 0
  const s = example ? EXAMPLE.s : positive(values.s)
  const t = example ? EXAMPLE.t : positive(values.t)
  const H = example ? EXAMPLE.H : positive(values.H)

  const notes = []
  const asked = Math.round((example ? 6 : positive(values.n)) || 6)
  const givenN = !example && positive(values.n)
  const n = Math.min(Math.max(asked, 2), MAX_FINS)
  if (asked > MAX_FINS) {
    notes.push(`핀 ${asked}장 중 ${MAX_FINS}장만 그렸습니다 — 나머지도 같은 간격입니다.`)
  }
  if (!example && !givenN) {
    notes.push('핀 수가 배선되지 않아 6장으로 그렸습니다.')
  }

  const edge = s * 0.6
  const W = n * t + (n - 1) * s + edge * 2
  const tb = Math.max(t * 2, H * 0.14)

  const shapes = [rect(-W / 2, 0, W, tb, ROLE.cut)]
  const finX = []
  for (let k = 0; k < n; k += 1) {
    const x = -W / 2 + edge + k * (t + s)
    finX.push(x)
    shapes.push(rect(x, -H, t, H, ROLE.cut))
  }

  // 굴뚝 — 데워진 공기가 핀 사이로 떠오른다. 이 흐름이 이 도해의 주인공이다.
  const flows = []
  const mids = [Math.floor(n / 2) - 1, Math.floor(n / 2)].filter(i => i >= 0 && i < n - 1)
  for (const i of mids) {
    const xg = finX[i] + t + s / 2
    flows.push(flow(xg, -H * 0.08, xg, -H * 0.9, i === mids[0] ? '공기' : ''))
  }

  const pad = H * 0.18
  const shown = (v) => (example ? null : v)
  const x0 = finX[0]
  const dims = [
    dim([x0, -H], [x0 + t, -H],
        { offset: -pad * 0.7, label: '{}', symbol: 't',
          value: shown(t), unit: values._units?.t }),
    dim([x0 + t, -H], [x0 + t + s, -H],
        { offset: -pad * 1.6, label: '{}', symbol: 's',
          value: shown(s), unit: values._units?.s }),
    dim([x0, -H], [x0, 0],
        { offset: -(x0 + W / 2 + pad * 0.8), label: '{}', symbol: 'H',
          value: shown(H), unit: values._units?.H }),
  ]

  notes.push('핀을 촘촘히 하면 면적은 늘지만 공기가 못 지나 오히려 식지 않습니다'
    + ' — 자연대류 간격에는 최적값이 있습니다(높이·온도차에 따라 대략 5~15 mm 언저리).')
  notes.push('바닥판 두께는 보기 좋은 비율일 뿐, 이 계산에 쓰이지 않습니다.')

  return {
    ok: true,
    example,
    missing: missing.map(p => p.key),
    shapes,
    flows,
    dims,
    notes,
    box: bounds([...shapes, ...dims, ...flows]),
  }
}

export default {
  id: 'fin_array',
  name: '방열 핀',
  summary: '핀 간격·두께·높이를 실제 비율로. 굴뚝이 살았는지 눈이 판단합니다.',
  params: PARAMS,
  build,
}
