/**
 * 벨트 전동 — 풀리 둘과 그 둘을 감는 벨트.
 *
 * 벨트 계산에서 정작 눈에 안 잡히는 값이 **접촉각**이다. 작은 풀리에 벨트가
 * 얼마나 감기느냐가 전달할 수 있는 힘을 좌우하는데, `D1`·`D2`·`C` 라는 숫자
 * 셋만 봐서는 그 각이 얼마인지 감이 안 온다. 그림이 그것을 보여 준다 — 두 원이
 * 크기가 많이 다르거나 축간거리가 짧으면 작은 쪽 감김이 눈에 띄게 줄어든다.
 *
 * 벨트는 두 원의 **바깥 공통접선**이다. 접선을 대충 두 중심을 잇는 선과 나란히
 * 그으면 지름이 다를 때 벨트가 풀리를 뚫고 지나간다. 제대로 푼다:
 *
 *     두 원의 반지름 차이를 축간거리로 나눈 것이 접선의 기울기 각이다.
 */

import { ROLE, bounds, circle, crosshair, dim, line, positive } from './geometry'

const PARAMS = [
  { key: 'D1', label: '작은 풀리 지름', required: true },
  { key: 'D2', label: '큰 풀리 지름', required: true },
  { key: 'C', label: '축간거리', required: true },
]

const EXAMPLE = { D1: 100, D2: 200, C: 400 }

function build(values) {
  const missing = PARAMS.filter(p => p.required && !positive(values[p.key]))
  const example = missing.length > 0
  let D1 = example ? EXAMPLE.D1 : positive(values.D1)
  let D2 = example ? EXAMPLE.D2 : positive(values.D2)
  const C = example ? EXAMPLE.C : positive(values.C)

  const notes = []
  // 「작은 쪽」 이 이름일 뿐 값이 뒤집혀 올 수도 있다. 그림은 큰 쪽을 오른쪽에
  // 두는 것이 관례라 여기서 맞춰 놓고, 바꿨다는 사실은 적지 않는다 —
  // 어느 쪽이 큰지는 치수가 이미 말한다.
  if (D1 > D2) { const t = D1; D1 = D2; D2 = t }

  const r1 = D1 / 2
  const r2 = D2 / 2

  if (!example && C <= r1 + r2) {
    return {
      ok: false,
      impossible: `축간거리(${C})가 두 풀리 반지름의 합(${r1 + r2})보다 커야 합니다.`,
    }
  }

  const x1 = 0
  const x2 = C
  // 바깥 공통접선의 **법선.** 접점은 중심에서 이 방향으로 반지름만큼 간 자리다.
  //
  // 두 접점을 잇는 선이 법선과 직교해야 하므로
  //     (c2 + r2·n − c1 − r1·n) · n = 0  →  C·nx + (r2 − r1) = 0
  // 즉 nx 는 **음수**다. 부호를 반대로 두면 선이 두 원을 스치듯 지나가는데,
  // 눈으로는 접한 것처럼 보여서 그림만 봐서는 못 잡는다.
  const nx = -(r2 - r1) / C
  const ny = Math.sqrt(Math.max(0, 1 - nx * nx))

  const shapes = [
    circle(x1, 0, r1),
    circle(x2, 0, r2),
    ...crosshair(x1, 0, r1 * 1.35),
    ...crosshair(x2, 0, r2 * 1.15),
    // 벨트 — 위아래 두 가닥. 접점은 중심에서 접선의 법선 방향으로 반지름만큼.
    line(x1 + r1 * nx, -r1 * ny, x2 + r2 * nx, -r2 * ny),
    line(x1 + r1 * nx, r1 * ny, x2 + r2 * nx, r2 * ny),
    // 축간거리를 눈으로 잇는 선.
    line(x1, 0, x2, 0, ROLE.ghost),
  ]

  const pad = Math.max(r1, r2) * 0.55
  const at = (v) => (example ? null : v)
  const dims = [
    // 치수선을 **원 밖으로** 뺀다. 중심선 기준으로 조금만 띄우면 큰 풀리에서는
    // 그 선이 원 안에 들어가, 치수가 형상 위에 얹힌 그림이 된다.
    dim([x1 - r1, 0], [x1 + r1, 0],
        { offset: -(r1 + pad * 0.6), label: 'Ø{}', symbol: 'D1',
          value: at(D1), unit: values._units?.D1 }),
    dim([x2 - r2, 0], [x2 + r2, 0],
        { offset: -(r2 + pad * 0.6), label: 'Ø{}', symbol: 'D2',
          value: at(D2), unit: values._units?.D2 }),
    dim([x1, r2], [x2, r2],
        { offset: pad, label: '{}', symbol: 'C',
          value: at(C), unit: values._units?.C }),
  ]

  return {
    ok: true,
    example,
    missing: missing.map(p => p.key),
    shapes,
    dims,
    notes,
    box: bounds([...shapes, ...dims]),
  }
}

export default {
  id: 'belt',
  name: '벨트 전동',
  summary: '풀리 둘과 축간거리. 작은 쪽에 벨트가 얼마나 감기는지 보입니다.',
  params: PARAMS,
  build,
}
