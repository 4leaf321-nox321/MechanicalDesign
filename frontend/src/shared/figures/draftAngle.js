/**
 * 구배각 — 사출물이 금형에서 빠지기 위한 기울기.
 *
 * 구배는 도면에서 가장 안 보이는 값이면서 **치수를 먹는 값**이다:
 *
 *     한쪽이 먹는 폭  Δ = H · tanθ
 *
 * 1° 는 아무것도 아닌 것 같지만 깊이 30 에서 한쪽 0.52, 양쪽이면 위아래
 * 치수가 1.05 다르다 — 웬만한 조립 공차보다 크다. 그래서 「폭 60」 이라고만
 * 적으면 위를 잰 사람과 아래를 잰 사람이 서로 다른 물건을 이야기하게 된다.
 * 어느 높이에서 잰 치수인지가 치수 자체만큼 중요하다.
 *
 * 그림은 구배 없는 벽(참고선)과 구배 진 벽을 겹쳐, 먹힌 폭이 어디서 왔는지
 * 보인다. 실제 1° 는 눈에 안 보이므로 부풀려 그리고, 부풀렸다고 적는다.
 */

import { ROLE, bounds, dim, flow, line, path, positive, tag } from './geometry'

const PARAMS = [
  { key: 'H', label: '깊이 (빼기 방향)', required: true },
  { key: 'theta', label: '구배각 (°)', required: true },
  { key: 'w', label: '아래 폭', required: false },
]

const EXAMPLE = { H: 30, theta: 1 }

/** 이보다 완만하면 부풀려 그린다 — 1° 는 실척으로 안 보인다. */
const THETA_VIS_MIN = 8

const round2 = (v) => Math.round(v * 100) / 100

function build(values) {
  const missing = PARAMS.filter(p => p.required && !positive(values[p.key]))
  const example = missing.length > 0
  const H = example ? EXAMPLE.H : positive(values.H)
  const theta = example ? EXAMPLE.theta : positive(values.theta)

  if (!example && theta >= 45) {
    return {
      ok: false,
      impossible: `구배각(${theta}°)이 45° 를 넘으면 벽이 아니라 경사면입니다.`,
    }
  }

  const notes = []
  const thetaVis = Math.max(theta, THETA_VIS_MIN)
  if (!example && thetaVis > theta) {
    notes.push('구배는 실척으로 안 보이는 기울기라 부풀려 그렸습니다 — 수치는'
      + ' 준 값 그대로입니다.')
  }

  const givenW = example ? null : positive(values.w)
  const w = givenW || H * 1.4
  if (!example && !givenW) {
    notes.push('아래 폭이 배선되지 않아 보기 좋은 비율로 그렸습니다.')
  }

  const dVis = H * Math.tan((thetaVis * Math.PI) / 180)
  const half = w / 2

  // 빼기 방향으로 갈수록 넓어져야 금형에서 긁히지 않고 빠진다.
  // 아래(깊은 쪽)가 좁고 위(빼기 쪽)가 넓은 사다리꼴.
  const shapes = [
    path(`M ${-half} 0 L ${-half - dVis} ${-H} L ${half + dVis} ${-H}`
      + ` L ${half} 0 Z`, ROLE.cut),
    // 구배가 없다면 섰을 자리 — 먹힌 폭이 이 선에서 온다.
    line(-half, 0, -half, -H, ROLE.ghost),
    line(half, 0, half, -H, ROLE.ghost),
  ]
  const flows = [flow(0, -H * 1.12, 0, -H * 1.5, '빼기 방향')]

  const pad = Math.max(H, w) * 0.2
  const dims = []
  if (example || givenW) {
    dims.push(dim([-half, 0], [half, 0],
                  { offset: pad, label: '{}', symbol: 'w',
                    value: example ? null : givenW, unit: values._units?.w }))
  }
  dims.push(dim([half + dVis, -H], [half + dVis, 0],
                { offset: pad * 1.2, label: '{}', symbol: 'H',
                  value: example ? null : H, unit: values._units?.H }))

  // 먹힌 폭 — 참고선과 실제 벽 사이. 이 도해가 보여 주려는 것이 이 틈이다.
  shapes.push(line(-half - dVis, -H, -half - dVis - pad * 0.7, -H - pad * 0.6,
                   ROLE.ghost))
  const tags = [
    tag(-half - dVis - pad * 0.8, -H - pad * 0.75,
        example ? 'Δ = H·tanθ' : `Δ = ${round2(H * Math.tan((theta * Math.PI) / 180))} (한쪽, 구한 값)`,
        'end'),
    tag(half + dVis + pad * 0.3, -H * 0.45,
        example ? 'θ' : `θ = ${theta}°`, 'start'),
  ]

  if (!example) {
    const d = H * Math.tan((theta * Math.PI) / 180)
    notes.push(`위 폭과 아래 폭이 2Δ = ${round2(2 * d)} 다릅니다 — 어느 높이에서 잰`
      + ' 치수인지 정하지 않으면 도면과 실물이 서로 다른 자리를 잽니다.')
    if (theta < 0.5) {
      notes.push(`구배 ${theta}° 는 0.5° 아래라 빼기 어렵습니다 — 긁히거나 백화가`
        + ' 남기 쉽고, 시보(부식 무늬)가 있으면 더 필요합니다.')
    } else {
      notes.push('외관면·시보면은 보통 더 큰 구배를 요구합니다 (대개 1~3°,'
        + ' 시보 깊이에 따라 다릅니다).')
    }
  }
  notes.push('벽 두께 방향은 그리지 않았습니다 — 이 그림은 폭 방향 단면 하나입니다.')

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
  id: 'draft_angle',
  name: '구배각',
  summary: '구배가 먹는 폭 Δ = H·tanθ — 위아래 치수가 2Δ 다르다는 것을 보입니다.',
  params: PARAMS,
  build,
}
