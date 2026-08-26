/**
 * 구름베어링 — 카탈로그에 실리는 그 단면.
 *
 * 베어링은 치수 세 개로 불린다: 안지름 `d`, 바깥지름 `D`, 폭 `B`. 「6205」 를
 * 찾으면 나오는 것이 정확히 이 셋이고, 도면에서도 늘 이 글자를 쓴다. 그래서
 * 카드가 같은 기호를 쓰면 아무것도 고르지 않아도 저절로 물린다.
 *
 * 중심선 위아래로 **대칭인 단면**을 그린다. 반쪽만 그리는 도면도 있지만, 위아래
 * 둘을 다 그려야 안지름과 바깥지름이 무엇을 재는 값인지 한눈에 읽힌다.
 *
 * ## 링 두께와 볼 크기는 값이 아니다
 *
 * 카드에는 안지름·바깥지름·폭만 있다. 링이 얼마나 두껍고 볼이 얼마나 큰지는
 * 계산에 안 쓰이고 카탈로그마다 다르다. 그래서 **반경 방향 빈 곳을 정해진
 * 비율로 나눠 그린다** — 형상을 알아보게 하는 것이 목적이지 그 값을 말하려는
 * 것이 아니다. 그 셋에는 치수를 안 붙이므로 값으로 읽힐 일이 없다.
 */

import {
  ROLE, bounds, circle, dim, line, positive, rect,
} from './geometry'

const PARAMS = [
  { key: 'd', label: '안지름', required: true },
  { key: 'D', label: '바깥지름', required: true },
  { key: 'B', label: '폭', required: false },
]

/** 값이 없을 때 그릴 비율. 6205 쯤 되는 모양. */
const EXAMPLE = { d: 25, D: 52, B: 15 }

/** 반경 방향 빈 곳을 링·볼·링으로 나누는 비율. 합이 1 이어야 한다. */
const RING = 0.28
const BALL = 1 - RING * 2

function build(values) {
  const missing = PARAMS.filter(p => p.required && !positive(values[p.key]))
  let example = missing.length > 0
  const use = example
    ? EXAMPLE
    : { d: positive(values.d), D: positive(values.D), B: positive(values.B) }

  // 바깥지름이 안지름보다 작으면 베어링이 아니다. 억지로 그리면 링이 서로를
  // 뚫고 나간 그림이 되어, 우리 버그인지 값이 이상한 건지 알 수 없다.
  if (!example && use.D <= use.d) {
    return {
      ok: false,
      impossible: `바깥지름(${use.D})이 안지름(${use.d})보다 커야 합니다.`,
    }
  }

  const notes = []
  const givenB = !example && positive(values.B)
  const B = givenB || (use.D - use.d) * 0.55
  if (!example && !givenB) {
    notes.push('폭(B)을 안 주어 보기 좋은 비율로만 그렸습니다.')
  }

  const ri = use.d / 2                 // 안지름 반경
  const ro = use.D / 2                 // 바깥지름 반경
  const space = ro - ri                // 반경 방향으로 채울 자리
  const ring = space * RING
  const ball = space * BALL

  const shapes = []
  const x0 = 0

  // 위아래 대칭. 부호만 뒤집어 같은 것을 두 번 그린다.
  for (const sign of [-1, 1]) {
    // 안쪽 링 (축에 끼는 쪽)
    shapes.push(rect(x0, sign > 0 ? ri : -(ri + ring), B, ring, ROLE.cut))
    // 바깥 링 (하우징에 앉는 쪽)
    shapes.push(rect(x0, sign > 0 ? ro - ring : -ro, B, ring, ROLE.cut))
    // 볼 하나
    shapes.push(circle(x0 + B / 2, sign * (ri + ring + ball / 2), ball / 2))
  }

  shapes.push(line(x0 - use.D * 0.08, 0, x0 + B + use.D * 0.08, 0, ROLE.center))

  // 치수 간격을 바깥지름에 맞추면 안 된다. 베어링은 지름에 비해 폭이 얇아서,
  // 지름 기준으로 띄우면 치수선이 그림보다 넓게 퍼져 그림이 한쪽으로 밀린다.
  // 반경 방향으로 채운 자리(`space`)가 이 그림의 실제 크기에 가깝다.
  const pad = space * 0.42
  const at = (key) => (example ? null : use[key])
  const dims = [
    // 안지름이 안쪽, 바깥지름이 그 바깥. 도면에서 겹치는 치수를 쌓는 방식이다.
    dim([x0, -ri], [x0, ri],
        { offset: -pad, label: 'Ø{}', symbol: 'd', along: 0.5,
          value: at('d'), unit: values._units?.d }),
    dim([x0, -ro], [x0, ro],
        // 안지름 이름표와 높이를 어긋나게. 나란히 두면 글자가 겹친다.
        { offset: -pad * 2.2, label: 'Ø{}', symbol: 'D', along: 0.24,
          value: at('D'), unit: values._units?.D }),
  ]
  // 폭은 준 값이 있을 때만. 없으면 그리기만 하고 재지 않는다.
  if (example || givenB) {
    dims.push(dim([x0, ro], [x0 + B, ro],
                  { offset: pad, label: '{}', symbol: 'B',
                    value: at('B'), unit: values._units?.B }))
  }

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
  id: 'bearing',
  name: '구름베어링',
  summary: '안지름·바깥지름·폭. 카탈로그가 쓰는 d·D·B 와 같은 기호입니다.',
  params: PARAMS,
  build,
}
