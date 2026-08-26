/**
 * 힌지 토크 — 노트북 덮개, TV 스탠드, 문.
 *
 * 마찰 힌지가 버텨야 하는 토크는 무게가 아니라 **무게 × 수평 팔**이다:
 *
 *     T(θ) = W · Lg · cosθ     (θ 는 바닥면에서 잰 열림각)
 *
 * 여기서 직관이 두 번 어긋난다. 첫째, **가장 힘든 각은 활짝 연 각이 아니라
 * 막 열리기 시작하는 낮은 각**이다 — 무게중심이 축에서 수평으로 가장 멀 때.
 * 둘째, 90° 를 넘으면 부호가 뒤집힌다 — 무게중심이 축 뒤로 넘어가 이제는
 * 뒤로 넘어가려 하고, 힌지는 반대 방향으로 버틴다.
 *
 * 그리고 위쪽 한계도 있다. 힌지를 무작정 세게 조이면 덮개를 여는 손이 본체를
 * 함께 들어 올린다 — 한 손 개폐는 본체 무게가 정하는 상한 아래에서만 된다.
 * W 와 Lg 두 숫자에는 이 이야기가 하나도 없다.
 */

import { ROLE, bounds, circle, dim, flow, line, moment, path, positive, rect, tag }
  from './geometry'

const PARAMS = [
  { key: 'W', label: '덮개 무게', required: true },
  { key: 'Lg', label: '축~무게중심 거리', required: true },
  { key: 'theta', label: '열림각 (°)', required: false },
  { key: 'Tf', label: '힌지 마찰토크', required: false },
]

const EXAMPLE = { W: 15, Lg: 120 }

/** 열림각을 안 주면 이 각도로 그린다. 노트북을 쓰는 흔한 각이다. */
const DEFAULT_THETA = 105
const THETA_MIN = 15
const THETA_MAX = 170

const round2 = (v) => Math.round(v * 100) / 100

function build(values) {
  const missing = PARAMS.filter(p => p.required && !positive(values[p.key]))
  const example = missing.length > 0
  const W = example ? EXAMPLE.W : positive(values.W)
  const Lg = example ? EXAMPLE.Lg : positive(values.Lg)

  const notes = []
  const givenTheta = example ? null : positive(values.theta)
  let theta = givenTheta || DEFAULT_THETA
  if (givenTheta && (givenTheta < THETA_MIN || givenTheta > THETA_MAX)) {
    theta = Math.min(Math.max(givenTheta, THETA_MIN), THETA_MAX)
    notes.push(`열림각 ${givenTheta}° 는 그리기 어려워 ${theta}° 로 눌러 그렸습니다.`)
  } else if (!givenTheta && !example) {
    notes.push(`열림각이 배선되지 않아 ${DEFAULT_THETA}° 로 그렸습니다.`)
  }

  const rad = (theta * Math.PI) / 180
  const dirX = Math.cos(rad)
  const dirY = -Math.sin(rad)          // SVG 는 위가 음수
  const nx = Math.sin(rad)
  const ny = Math.cos(rad)

  const rh = Lg * 0.06
  const tl = Lg * 0.045
  const Ll = Lg * 1.3
  const shapes = []

  // 본체 — 축 오른쪽으로 뻗는다. 덮개를 열면 이쪽이 들리려 한다.
  const baseTop = rh * 0.5
  shapes.push(rect(rh * 0.4, baseTop, Lg * 1.15, Lg * 0.09))
  // 힌지 축.
  shapes.push(circle(0, 0, rh))
  shapes.push(line(-rh * 1.6, 0, rh * 1.6, 0, ROLE.center))
  shapes.push(line(0, -rh * 1.6, 0, rh * 1.6, ROLE.center))

  // 덮개 — 열림각 방향으로 뻗는 판.
  const sx = dirX * rh * 0.7
  const sy = dirY * rh * 0.7
  const ex = dirX * Ll
  const ey = dirY * Ll
  shapes.push(path(
    `M ${sx + nx * tl} ${sy + ny * tl} L ${ex + nx * tl} ${ey + ny * tl}`
    + ` L ${ex - nx * tl} ${ey - ny * tl} L ${sx - nx * tl} ${sy - ny * tl} Z`,
  ))

  // 무게중심과 무게. 토크는 이 점의 **수평 거리**에서 나온다.
  const cgX = dirX * Lg
  const cgY = dirY * Lg
  shapes.push(circle(cgX, cgY, tl * 0.55))
  const flows = [flow(cgX, cgY + tl * 1.2, cgX, cgY + tl * 1.2 + Lg * 0.22, 'W')]

  // 축에서 무게중심까지 — 비스듬한 거리라 지시선으로 적는다.
  shapes.push(line(0, 0, cgX, cgY, ROLE.ghost))
  const tags = [
    tag(cgX + nx * tl * 3, cgY + ny * tl * 3,
        example ? 'Lg' : `Lg = ${Lg}${values._units?.Lg ? ' ' + values._units.Lg : ''}`,
        'start'),
    tag(rh * 2.4, -rh * 1.5, example ? 'θ' : `θ = ${theta}°`, 'start'),
  ]

  // 수평 팔 — 이 도해의 요점. 무게중심에서 수직으로 내려 축과의 수평 거리를 잰다.
  const arm = Lg * Math.cos(rad)
  const dims = []
  if (Math.abs(arm) > Lg * 0.05) {
    const yRef = baseTop + Lg * 0.09
    shapes.push(line(cgX, cgY + tl * 1.1, cgX, yRef, ROLE.ghost))
    dims.push(dim([0, yRef], [cgX, yRef],
                  { offset: Lg * 0.14, label: '{}', symbol: 'a',
                    value: example ? null : round2(Math.abs(arm)),
                    unit: values._units?.Lg }))
  }

  const givenTf = example ? null : positive(values.Tf)
  const moments = []
  if (givenTf) {
    moments.push(moment(0, 0, rh * 2.1,
                        `Tf = ${givenTf}${values._units?.Tf ? ' ' + values._units.Tf : ''}`))
  }

  if (!example) {
    const need = W * Lg * Math.cos(rad)
    const worst = W * Lg
    if (Math.abs(arm) <= Lg * 0.05) {
      notes.push('무게중심이 축 바로 위입니다 — 이 각도 근처에서 필요한 토크가'
        + ' 0 을 지나며 방향이 바뀝니다.')
    } else {
      notes.push(`이 각도에서 버텨야 하는 토크는 T = W·Lg·cosθ ≈ ${round2(Math.abs(need))}`
        + ' 입니다 (구한 값, W 단위 × Lg 단위).')
    }
    if (theta > 90 && Math.abs(arm) > Lg * 0.05) {
      notes.push('90° 를 넘어 무게중심이 축 뒤로 넘어갔습니다 — 덮개는 뒤로'
        + ' 넘어가려 하고, 힌지는 반대 방향으로 버팁니다.')
    }
    notes.push(`가장 힘든 각은 활짝 연 각이 아니라 막 열리기 시작하는 낮은 각입니다`
      + ` — 그때 T = W·Lg = ${round2(worst)} 까지 갑니다.`)
    if (givenTf) {
      const needHere = Math.abs(need)
      if (givenTf >= worst) {
        notes.push(`힌지 토크(${givenTf})가 최악각의 ${round2(worst)} 이상이라 어느`
          + ' 각도에서도 버팁니다.')
      } else if (givenTf >= needHere) {
        notes.push(`힌지 토크(${givenTf})는 이 각도는 버티지만 최악각의`
          + ` ${round2(worst)} 에는 못 미칩니다 — 낮은 각으로 눕히면 스르르 닫힙니다.`)
      } else {
        notes.push(`힌지 토크(${givenTf})가 이 각도에 필요한 ${round2(needHere)} 보다`
          + ' 작습니다 — 여기서 이미 미끄러집니다.')
      }
    }
  }
  notes.push('힌지를 무작정 세게 조이면 여는 손이 본체를 함께 들어 올립니다 —'
    + ' 한 손 개폐는 본체 무게가 정하는 상한 아래에서만 됩니다.')
  notes.push('본체·덮개의 두께와 길이는 보기 좋은 비율일 뿐, 계산에는 W·Lg·θ 만 쓰입니다.')

  return {
    ok: true,
    example,
    missing: missing.map(p => p.key),
    shapes,
    flows,
    moments,
    dims,
    tags,
    notes,
    box: bounds([...shapes, ...dims, ...flows, ...moments, ...tags]),
  }
}

export default {
  id: 'hinge_torque',
  name: '힌지 토크',
  summary: '열림각과 수평 팔. 최악각이 어디이고 90° 에서 무엇이 뒤집히는지 보입니다.',
  params: PARAMS,
  build,
}
