/**
 * 축 — 둥근 축 한 토막. 속이 찬 것과 빈 것을 **같은 도해가** 그린다.
 *
 * 축 계산은 대개 **지름 하나로 끝난다.** 토크에서 지름을 구하거나, 지름에서
 * 자중을 구하거나. 그래서 이 도해가 반드시 말해야 하는 것도 지름 하나다.
 *
 * 단면과 옆면을 나란히 둔다. 단면의 **해칭이 어디까지 차 있는지**를 말하고,
 * 옆면이 축이라는 것을 말한다.
 *
 * ## 중실과 중공을 한 도해로 두는 이유
 *
 * 둘은 계산식이 다르지만 **그림은 안쪽 원 하나 차이**다. 도해를 둘로 나누면
 * 사람이 카드마다 어느 쪽인지 골라야 하는데, 그 판단의 근거는 이미 카드에 있다 —
 * 안지름 변수가 있느냐 없느냐. 골라야 할 것을 하나라도 줄이는 편이 낫다.
 *
 * ## 길이는 치수를 안 붙인다
 *
 * 축 길이는 이 계산들 어디에도 없는 값이다. 그림에는 있어야 축처럼 보이므로
 * 적당히 그리되 **치수를 안 붙인다.** 치수가 붙는 순간 사람은 그것을 자기가
 * 정한 값으로 읽는다. 카드에 길이 변수가 있으면 그때는 진짜 값으로 그린다.
 */

import {
  ROLE, bounds, circle, crosshair, dim, flow, line, moment, positive, rect,
} from './geometry'

const PARAMS = [
  { key: 'd', label: '축 지름', required: true },
  { key: 'di', label: '안지름 (속 빈 축)', required: false },
  { key: 'L', label: '축 길이', required: false },
  { key: 'T', label: '전달토크', required: false },
  { key: 'F', label: '하중', required: false },
]

/** 값이 없을 때 그릴 비율. 숫자는 하나도 안 적는다. */
const EXAMPLE = { d: 40 }

/** 길이를 안 주면 지름의 이만큼으로. 축처럼 보이는 가장 짧은 비율쯤이다. */
const LENGTH_RATIO = 2.6

function build(values) {
  const missing = PARAMS.filter(p => p.required && !positive(values[p.key]))
  const example = missing.length > 0
  const d = example ? EXAMPLE.d : positive(values.d)

  const R = d / 2
  const bore = example ? 0 : (positive(values.di) || 0)
  if (bore >= d) {
    return {
      ok: false,
      impossible: `안지름(${bore})이 바깥지름(${d})보다 작아야 합니다.`,
    }
  }
  const givenL = example ? null : positive(values.L)
  const L = givenL || d * LENGTH_RATIO
  const shapes = []

  // --- 단면 -------------------------------------------------------------------
  const cx = 0
  const cy = 0
  // `circle` 의 다섯째는 **반지름**이다. 지름을 그대로 넘기면 안쪽 원이 바깥 원과
  // 겹쳐 도넛이 사라지고, 정면도가 속 빈 축을 속 찬 축으로 그린다 — 오류 없이
  // 조용히 틀린 그림이 된다.
  shapes.push(circle(cx, cy, R, ROLE.cut, bore / 2))
  shapes.push(...crosshair(cx, cy, R))

  // --- 옆면 -------------------------------------------------------------------
  const gap = d * 0.6
  const sx = cx + R + gap
  shapes.push(rect(sx, cy - R, L, d))
  if (bore > 0) {
    // 속 빈 축은 옆면에서 구멍이 안 보인다. 숨은선으로 그려야 「이 안이 비었다」
    // 가 옆면에서도 읽힌다 — 단면 하나만 보고 넘어가는 사람이 있다.
    shapes.push(line(sx, cy - bore / 2, sx + L, cy - bore / 2, ROLE.hidden))
    shapes.push(line(sx, cy + bore / 2, sx + L, cy + bore / 2, ROLE.hidden))
  }
  shapes.push(line(sx - d * 0.12, cy, sx + L + d * 0.12, cy, ROLE.center))

  // --- 무엇이 이 축에 걸리나 ------------------------------------------------------
  const moments = []
  const flows = []
  if (!example && positive(values.T)) {
    // 비트는 힘은 단면 쪽에 건다. 옆면에 걸면 축을 감은 띠처럼 보인다.
    moments.push(moment(cx, cy, R * 1.42, 'T'))
  }
  if (!example && positive(values.F)) {
    // 하중은 옆면 가운데로 내리꽂는다.
    const mid = sx + L / 2
    flows.push(flow(mid, cy - R - d * 0.62, mid, cy - R - d * 0.06, 'F'))
  }

  const pad = d * 0.32
  const at = (key) => (example ? null : positive(values[key]))
  const dims = [
    dim([cx - R, cy + R], [cx + R, cy + R],
        { offset: pad, label: 'Ø{}', symbol: 'd',
          value: at('d'), unit: values._units?.d }),
  ]
  if (bore > 0) {
    // 안지름은 바깥지름과 높이를 어긋나게 — 나란히 두면 글자가 겹친다.
    dims.push(dim([cx - bore / 2, cy - R], [cx + bore / 2, cy - R],
                  { offset: -pad, label: 'Ø{}', symbol: 'di', along: 0.5,
                    value: at('di'), unit: values._units?.di }))
  }
  // 길이는 **준 값이 있을 때만** 잰다. 그림에 있다고 다 치수는 아니다.
  if (givenL) {
    dims.push(dim([sx, cy + R], [sx + L, cy + R],
                  { offset: pad, label: '{}', symbol: 'L',
                    value: L, unit: values._units?.L }))
  }

  const notes = []
  if (!example && !givenL) {
    notes.push('축 길이는 이 계산에 쓰이지 않아 보기 좋은 비율로만 그렸습니다.')
  }

  return {
    ok: true,
    example,
    missing: missing.map(p => p.key),
    shapes,
    flows,
    moments,
    dims,
    notes,
    box: bounds([...shapes, ...dims, ...flows, ...moments]),
  }
}

export default {
  id: 'shaft',
  name: '축 (중실·중공)',
  summary: '축 지름 하나면 그려집니다. 안지름을 묶으면 속 빈 축으로, '
    + '토크·하중을 묶으면 화살표로 함께 보입니다.',
  params: PARAMS,
  build,
}
