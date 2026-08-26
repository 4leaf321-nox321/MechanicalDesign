/**
 * 낙하 충격 — 높이와 멈추는 거리.
 *
 * 핸드폰이든 리모컨이든, 낙하에서 부품이 받는 충격은 결국 하나의 비다:
 *
 *     G = H / s     (H 낙하 높이, s 멈출 때까지 밀리는 거리)
 *
 * 단위가 붙지 않는 비라서 어떤 단위로 재도 맞다. 그리고 이 비가 하는 말이
 * 직관과 반대다 — **낙하 설계는 세게 버티기가 아니라 길게 멈추기다.** 케이스를
 * 단단히 할수록 s 가 줄어 G 가 치솟는다. 1 m 낙하가 1 mm 에서 멈추면 1000 g,
 * 3 mm 에서 멈추면 333 g 다. 완충 조금이 강성 훨씬보다 크다.
 *
 * H 는 시험 규격이 정해 주고 m(질량)은 G 를 바꾸지 못한다. 설계가 만질 수 있는
 * 것은 s 하나뿐이라, 그림도 s 를 짚는 데 전부를 쓴다.
 */

import { ROLE, bounds, dim, flow, line, path, positive, rect, tag } from './geometry'

const PARAMS = [
  { key: 'H', label: '낙하 높이', required: true },
  { key: 's', label: '멈추는 거리', required: false },
]

const EXAMPLE = { H: 1000 }

function build(values) {
  const missing = PARAMS.filter(p => p.required && !positive(values[p.key]))
  const example = missing.length > 0
  const H = example ? EXAMPLE.H : positive(values.H)

  const notes = []
  const s = example ? null : positive(values.s)

  const wDev = H * 0.14
  const hDev = H * 0.26
  const F = wDev * 3.4
  const ft = H * 0.035

  const shapes = [
    rect(-F / 2, 0, F, ft, ROLE.cut),                    // 바닥
    rect(-wDev / 2, -H - hDev, wDev, hDev, ROLE.front),  // 기기 — 바닥까지 H
  ]
  const flows = [flow(0, -H * 0.82, 0, -H * 0.12, '')]

  // 멈추는 거리 — 케이스 휨·완충재·틈이 다 여기 든다. 실제로는 눈에 안 보이는
  // 크기라 부풀려 그리되, 치수는 준 값 그대로 적는다.
  const sVis = s ? Math.max(s, H * 0.045) : 0
  const xs = wDev * 1.05
  if (s) {
    shapes.push(path(
      `M ${-wDev * 0.3} 0 L ${-wDev * 0.15} ${-sVis} L 0 0`
      + ` L ${wDev * 0.15} ${-sVis} L ${wDev * 0.3} 0`, ROLE.ghost,
    ))
    if (sVis > s) {
      notes.push('멈추는 거리는 보이도록 부풀려 그렸습니다 — 치수는 준 값 그대로입니다.')
    }
  }

  const pad = H * 0.12
  const dims = [
    dim([wDev / 2, -H], [wDev / 2, 0],
        { offset: pad, label: '{}', symbol: 'H',
          value: example ? null : H, unit: values._units?.H }),
  ]
  if (s) {
    dims.push(dim([xs, -sVis], [xs, 0],
                  { offset: pad * 0.5, label: '{}', symbol: 's',
                    value: s, unit: values._units?.s }))
  }

  const tags = []
  if (s) {
    shapes.push(line(0, -sVis * 0.5, -wDev * 0.9, -H * 0.1, ROLE.ghost))
    tags.push(tag(-wDev * 0.95, -H * 0.115, '여기서 s 만큼 밀리며 멈춥니다', 'end'))
  }

  if (!example && s) {
    if (s >= H) {
      notes.push('멈추는 거리가 낙하 높이 이상입니다 — G ≤ 1, 충격이랄 것이 없습니다.')
    } else {
      const g = Math.round(H / s)
      notes.push(`평균 충격은 G = H/s ≈ ${g} g 입니다 (구한 값, 등감속 기준)`
        + ' — s 가 조금만 늘어도 G 가 크게 떨어집니다.')
    }
  }
  if (!example && !s) {
    notes.push('멈추는 거리(s)가 배선되지 않았습니다 — G = H/s 는 s 가 있어야 나옵니다.'
      + ' 케이스 휨과 완충재 눌림이 다 s 에 듭니다.')
  }
  notes.push('낙하 설계는 세게 버티기가 아니라 길게 멈추기입니다 — 케이스를 단단히'
    + ' 할수록 s 가 줄어 G 가 치솟습니다.')
  notes.push('기기와 바닥의 크기는 보기 좋은 비율일 뿐, 계산에는 H 와 s 만 쓰입니다.')

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
  id: 'drop_impact',
  name: '낙하 충격',
  summary: '낙하 높이와 멈추는 거리. 충격 G = H/s 가 왜 그 비인지 보입니다.',
  params: PARAMS,
  build,
}
