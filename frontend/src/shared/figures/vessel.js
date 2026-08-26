/**
 * 얇은 원통 압력용기.
 *
 * 벽에 걸리는 응력이 **방향에 따라 두 배 다르다:**
 *
 *     후프(원주) 응력  σθ = pD/2t   ← 이쪽이 크다
 *     축 방향 응력     σz = pD/4t
 *
 * 숫자 두 개만 보면 어느 쪽이 어느 방향인지 알 수 없다. 그런데 그 방향이 곧
 * **어떻게 터지느냐**다 — 후프응력이 크므로 세로로 갈라진다. 소시지가 구울 때
 * 세로로 터지는 것과 같은 이유다. 그림은 그 두 방향을 화살표로 나눠 보인다.
 *
 * 그리고 이 식은 **얇은 벽일 때만** 맞는다. 벽이 두꺼워지면 안쪽과 바깥쪽 응력이
 * 달라져 하나의 값으로 말할 수 없다. 숫자는 그 경계를 안 알려 주므로 그림이
 * 말한다.
 */

import { ROLE, bounds, breakLine, dim, flow, line, positive, rect, tag } from './geometry'

const PARAMS = [
  { key: 'D', label: '안지름', required: true },
  { key: 't', label: '벽 두께', required: true },
  { key: 'p', label: '내압', required: false },
]

const EXAMPLE = { D: 500, t: 8 }

/** 얇은 벽으로 볼 수 있는 한계. 넘으면 식이 달라진다. */
const THIN_LIMIT = 20

function build(values) {
  const missing = PARAMS.filter(p => p.required && !positive(values[p.key]))
  const example = missing.length > 0
  const D = example ? EXAMPLE.D : positive(values.D)
  const t = example ? EXAMPLE.t : positive(values.t)

  const R = D / 2
  const W = D * 1.5                 // 그려 보일 길이 — 계산에 안 쓰인다
  const notes = []

  // 벽 둘. 잘린 면이라 해칭하고, 맞붙은 게 아니라 같은 부재라 방향은 같다.
  const shapes = [
    rect(0, -R - t, W, t, ROLE.cut),
    rect(0, R, W, t, ROLE.cut),
    line(0, 0, W, 0, ROLE.center),
  ]
  // 양끝은 끊어 그린다 — 용기가 여기서 끝나는 게 아니라 계속된다는 뜻이다.
  shapes.push(breakLine(0, R + t, R * 0.09))
  shapes.push(breakLine(W, R + t, R * 0.09))

  const reach = R * 0.42
  // 후프응력은 **세로로** 벌린다 — 길이 방향으로 갈라지려는 힘이다.
  // 축응력은 **가로로** 벌린다. 방향이 곧 이 도해의 전부다.
  const flows = [
    flow(W * 0.3, -R - t, W * 0.3, -R - t - reach, 'σθ'),
    flow(W * 0.3, R + t, W * 0.3, R + t + reach, 'σθ'),
    flow(W * 0.68, 0, W * 0.68 + reach, 0, 'σz'),
    flow(W * 0.68, 0, W * 0.68 - reach, 0, 'σz'),
  ]

  const pad = R * 0.3
  const shown = (v) => (example ? null : v)
  const dims = [
    dim([W * 0.86, -R], [W * 0.86, R],
        { offset: pad, label: 'Ø{}', symbol: 'D',
          value: shown(D), unit: values._units?.D }),
    dim([W * 0.12, -R - t], [W * 0.12, -R],
        { offset: -pad * 0.8, label: '{}', symbol: 't',
          value: shown(t), unit: values._units?.t }),
  ]

  const tags = [tag(W * 0.3, -R - t - reach - R * 0.16, 'σθ = 2 σz')]

  if (!example) {
    const ratio = D / t
    if (ratio < THIN_LIMIT) {
      notes.push(`벽이 두껍습니다 (D/t = ${Math.round(ratio)}). 얇은 벽 식은 보통`
        + ` D/t ≥ ${THIN_LIMIT} 에서 씁니다 — 안쪽과 바깥쪽 응력이 달라집니다.`)
    } else {
      notes.push(`D/t = ${Math.round(ratio)} 이라 얇은 벽으로 봅니다.`)
    }
  }
  notes.push('후프응력이 축응력의 2배라서 세로로 갈라집니다 — 방향이 곧 파손 모양입니다.')
  notes.push('그려 보인 길이는 형상을 나타낸 것일 뿐, 이 계산에 쓰이지 않습니다.')

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

export default {
  id: 'vessel_cylinder',
  name: '원통 압력용기',
  summary: '후프응력과 축응력의 방향을 나눠 보이고, 얇은 벽 조건을 확인합니다.',
  params: PARAMS,
  build,
}
