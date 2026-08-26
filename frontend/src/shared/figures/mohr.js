/**
 * 모어원 — 조합응력.
 *
 * 다른 도해와 성격이 다르다. 형상이 아니라 **응력 공간의 그림**이고, 여기서는
 * 그림이 곧 계산이다. 원을 그려 놓으면 주응력은 원이 가로축을 자르는 자리,
 * 최대전단응력은 원의 꼭대기 — 식을 외울 필요 없이 읽힌다.
 *
 * 그리고 이 도해에만 있는 사정이 둘 있다.
 *
 * **부호가 뜻을 갖는다.** 다른 도해에서 음수는 형상이 안 되는 값이라 없는 것으로
 * 보지만, 여기서는 음수가 압축이고 0 이 무응력이다. 둘 다 정상이라 `finite` 로
 * 받는다 — `positive` 로 받으면 압축응력이 조용히 사라져 인장만 걸린 그림이 된다.
 *
 * **부호 규약이 교재마다 다르다.** τ 를 위로 양수로 잡느냐, X 점을 (σx, τxy) 에
 * 두느냐 (σx, −τxy) 에 두느냐에 따라 원이 위아래로 뒤집힌다. 주응력과 최대전단
 * 크기는 어느 규약에서나 같지만 **회전 방향이 반대로 읽힌다.** 그림이 어느
 * 규약으로 그렸는지 스스로 밝히지 않으면, 각도를 읽는 사람이 반대로 돌린다.
 */

import { ROLE, bounds, circle, finite, line, tag } from './geometry'

const PARAMS = [
  { key: 'sx', label: 'σx (x 방향 수직응력)', required: true },
  { key: 'sy', label: 'σy (y 방향 수직응력)', required: true },
  { key: 'txy', label: 'τxy (전단응력)', required: true },
]

const EXAMPLE = { sx: 80, sy: -20, txy: 30 }

/** 자릿수. 응력은 소수점이 길면 그림을 덮는다. */
const round = (v) => Math.round(v * 100) / 100

function build(values) {
  const missing = PARAMS.filter(p => p.required && finite(values[p.key]) === null)
  const example = missing.length > 0
  const sx = example ? EXAMPLE.sx : finite(values.sx)
  const sy = example ? EXAMPLE.sy : finite(values.sy)
  const txy = example ? EXAMPLE.txy : finite(values.txy)

  if (!example && sx === 0 && sy === 0 && txy === 0) {
    return { ok: false, impossible: '응력이 모두 0이라 그릴 원이 없습니다.' }
  }

  const mid = (sx + sy) / 2
  const R = Math.hypot((sx - sy) / 2, txy)
  const s1 = mid + R
  const s2 = mid - R

  // 그림이 차지할 범위. 0 이 어디인지 늘 보이게 원점을 범위에 넣는다 —
  // 인장인지 압축인지는 0 을 봐야 읽힌다.
  const lo = Math.min(s2, 0)
  const hi = Math.max(s1, 0)
  const reach = Math.max(hi - lo, R * 2) || 1
  const margin = reach * 0.18

  const shapes = [
    line(lo - margin, 0, hi + margin, 0, ROLE.center),      // σ 축
    line(0, -R - margin, 0, R + margin, ROLE.center),       // τ 축
    circle(mid, 0, R),
  ]

  // **τ 를 그릴 때는 부호를 뒤집는다.** SVG 는 y 가 아래로 가므로, 「τ 를 위로
  // 양수로 잡는다」 고 말해 놓고 값을 그대로 쓰면 그림이 제 말과 반대로 그려진다.
  // 크기는 다 맞고 회전 방향만 뒤집히는 종류의 잘못이라, 눈으로는 못 잡는다.
  const X = [sx, -txy]
  const Y = [sy, txy]

  // X 와 Y 를 잇는 선이 원의 지름이다. 두 점이 마주 보는 것이 이 그림의 뼈대다.
  const mark = reach * 0.022
  const dot = ([x, y]) => [
    line(x - mark, y - mark, x + mark, y + mark, ROLE.ghost),
    line(x - mark, y + mark, x + mark, y - mark, ROLE.ghost),
  ]
  shapes.push(line(X[0], X[1], Y[0], Y[1], ROLE.ghost))
  shapes.push(...dot(X), ...dot(Y))
  // 중심에서 꼭대기까지 — 최대전단응력이 반지름이라는 것을 눈으로 잇는다.
  shapes.push(line(mid, 0, mid, -R, ROLE.ghost))

  const unit = values._units?.sx ? ` ${values._units.sx}` : ''
  const at = (label, value) => (example ? label : `${label} = ${round(value)}${unit}`)
  const lift = reach * 0.09

  // X·Y 이름표는 **중심에서 바깥으로** 밀어낸다. 두 점이 원 어디에 오든 원 밖에
  // 놓이고 서로 마주 보게 되어, 자리마다 따로 손볼 일이 없다.
  const outward = ([x, y]) => {
    const len = Math.hypot(x - mid, y) || 1
    return [x + ((x - mid) / len) * lift * 1.15, y + (y / len) * lift * 1.15]
  }
  const [xl, xt] = outward(X)
  const [yl, yt] = outward(Y)

  const tags = [
    // 축 이름은 눈금값과 **다른 쪽**에 둔다. 같은 쪽이면 σ1 글자에 붙는다.
    tag(hi + margin * 1.5, -lift * 0.6, 'σ', 'end'),
    // τ 글자는 축의 **아래끝**에 둔다. 위끝은 늘 τmax 와 X·Y 이름표가 모이는
    // 자리라, 순수전단처럼 X 가 꼭대기에 오는 경우 셋이 한 줄에 겹친다.
    tag(-lift * 0.5, R + margin, 'τ', 'end'),
    tag(s1, lift * 1.2, at('σ1', s1), 'middle'),
    tag(s2, lift * 1.2, at('σ2', s2), 'middle'),
    tag(mid, -R - lift * 2.5, at('τmax', R), 'middle'),
  ]
  // 전단이 0 이면 X·Y 가 주응력 자리와 같은 점이다. 이름표를 겹쳐 놓는 대신
  // **그 사실을 말한다** — 그것이 이 경우에 알아야 할 전부다.
  const principalAlready = !example && txy === 0
  if (!principalAlready) {
    tags.push(tag(xl, xt, example ? 'X' : 'X (σx, τxy)', 'middle'))
    tags.push(tag(yl, yt, example ? 'Y' : 'Y (σy, −τxy)', 'middle'))
  }

  const notes = [
    'τ 를 위로 양수로 잡고 X 를 (σx, τxy) 에 둔 그림입니다 — 교재에 따라 규약이'
    + ' 달라 원이 뒤집혀 보일 수 있고, 그러면 회전 방향이 반대로 읽힙니다.',
  ]
  if (principalAlready) {
    notes.push('τxy 가 0 이라 준 축이 이미 주축입니다 — σx 와 σy 가 그대로'
      + ' 주응력이고, 더 돌릴 것이 없습니다.')
  }
  if (!example && R === 0) {
    notes.push('두 주응력이 같고 전단이 없어 원이 한 점입니다 — 어느 방향으로'
      + ' 잘라도 전단응력이 0 입니다.')
  }
  if (!example && s1 * s2 < 0) {
    notes.push('주응력의 부호가 서로 다릅니다 — 한쪽은 당기고 한쪽은 누릅니다.')
  }

  return {
    ok: true,
    example,
    missing: missing.map(p => p.key),
    shapes,
    dims: [],
    tags,
    notes,
    box: bounds([...shapes, ...tags]),
  }
}

export default {
  id: 'mohr_circle',
  name: '모어원',
  summary: '주응력과 최대전단응력을 원에서 바로 읽습니다. 부호 규약을 밝힙니다.',
  params: PARAMS,
  build,
}
