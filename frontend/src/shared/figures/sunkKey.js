/**
 * 묻힘키 — 축에 키홈을 파고 키를 반쯤 묻은 모양.
 *
 * 교과서마다 똑같이 그리는 그림이라 여기서도 그 관례를 따른다: **단면과 옆면을
 * 나란히.** 단면이 축 지름과 키 폭의 비율을 말하고, 옆면이 키 길이를 말한다.
 * 하나만 그리면 전단면적(b × L)의 두 변 중 하나가 그림에 안 나온다.
 *
 * 키는 **절반이 축에, 절반이 보스에** 묻힌다. 그래서 축 위로 h/2 만 나온다.
 * 그림에서 키가 축 위에 통째로 얹혀 보이면 그건 묻힘키가 아니라 안장키다.
 *
 * ## 키 높이(h)를 안 주면
 *
 * 전단검토는 b × L 로 하므로 h 없이도 계산이 된다. 그림은 h 가 있어야 그릴 수
 * 있어서, 없으면 **정사각 단면(h = b)으로 그리고 그렇게 그렸다고 적는다.**
 * 조용히 아무 값이나 넣으면 그림이 실제와 다른데 아무도 모른다.
 */

import { ROLE, bounds, circle, crosshair, dim, line, positive, rect } from './geometry'

const PARAMS = [
  { key: 'd', label: '축 지름', required: true },
  { key: 'b', label: '키 폭', required: true },
  { key: 'L', label: '키 길이', required: true },
  { key: 'h', label: '키 높이', required: false },
]

/**
 * 옆면에 그릴 축의 길이.
 *
 * **축 길이는 이 계산의 변수가 아니다** — 카드에 없다. 그래서 여기서 정하는데,
 * 정하는 값이 그림의 뜻을 바꾸지 않도록 두 가지만 지킨다: 키보다 넉넉히 길 것
 * (키가 축 끝에 걸친 것처럼 보이면 안 된다), 그리고 지름보다 길 것 (안 그러면
 * 축이 아니라 세로로 선 토막처럼 보인다).
 *
 * 치수를 붙이지 않는 것도 그래서다. 치수가 붙는 순간 사람은 그것을 값으로 읽는다.
 */
function shaftLength(L, d) {
  return Math.max(L * 1.5, d * 1.35)
}

/**
 * 값이 없을 때 그릴 비율.
 *
 * 도해의 **첫 일은 「이 계산이 어떤 형상인가」 를 보여 주는 것**이고,
 * 그건 값이 없어도 할 수 있다. 카드를 열자마자 「아직 그릴 수 없습니다」 만
 * 보이면 도해를 붙인 뜻이 절반 사라진다.
 *
 * 대신 이때는 **숫자를 하나도 안 적는다.** 치수 자리에는 기호만 넣는다 —
 * 「Ø40 mm」 이 아니라 「Ød」. 지어낸 숫자를 보여 주면 그림이 거짓말을
 * 하고, 치수를 통째로 빼면 「어디가 무엇인지」 를 못 말한다.
 *
 * 한 개라도 빠지면 전부 기호로 간다. 진짜 값과 보기 값을 섞어 그리면
 * 어느 치수가 진짜인지 알 수 없고, 그게 가장 나쁜 쪽이다.
 */
const EXAMPLE = { d: 40, b: 12, L: 50, h: 8 }

function build(values) {
  const missing = PARAMS.filter(p => p.required && !positive(values[p.key]))
  // 필요한 값이 하나라도 빠지면 **전부** 보기 비율로 간다. 진짜 값과 보기
  // 값을 섞어 그리면 어느 치수가 진짜인지 알 수 없다.
  const example = missing.length > 0
  const use = example
    ? EXAMPLE
    : {
      d: positive(values.d),
      b: positive(values.b),
      L: positive(values.L),
      h: positive(values.h) || positive(values.b),
    }

  const notes = []
  if (!example && !positive(values.h)) {
    notes.push('키 높이(h)를 안 주어 정사각 단면(h = b)으로 그렸습니다.')
  }

  // 키 폭이 축보다 넓으면 형상이 성립하지 않는다. 억지로 그리면 키가 축을
  // 뚫고 나간 그림이 되어, 그게 우리 버그인지 값이 이상한 건지 알 수 없다.
  if (!example && use.b >= use.d) {
    return {
      ok: false,
      impossible: `키 폭(${use.b})이 축 지름(${use.d})보다 작아야 합니다.`,
    }
  }

  const R = use.d / 2
  const h = use.h
  const shapes = []

  // --- 단면 -------------------------------------------------------------------
  const cx = 0
  const cy = 0
  const top = cy - R                       // 축 맨 위 (SVG 는 y 가 아래로)

  shapes.push(circle(cx, cy, R))
  shapes.push(...crosshair(cx, cy, R))
  // 키: 위 절반이 보스 쪽, 아래 절반이 축의 키홈 안.
  shapes.push(rect(cx - use.b / 2, top - h / 2, use.b, h, ROLE.cut))
  // 키홈 바닥을 실선으로 한 번 더 — 축의 원과 겹쳐 안 보이면 홈이 없어 보인다.
  shapes.push(line(cx - use.b / 2, top + h / 2, cx + use.b / 2, top + h / 2))

  // --- 옆면 -------------------------------------------------------------------
  const gap = use.d * 0.55                 // 두 그림 사이
  const shaftLen = shaftLength(use.L, use.d)
  const sx = cx + R + gap
  shapes.push(rect(sx, cy - R, shaftLen, use.d))
  shapes.push(line(sx, cy, sx + shaftLen, cy, ROLE.center))

  const keyX = sx + (shaftLen - use.L) / 2
  shapes.push(rect(keyX, top - h / 2, use.L, h, ROLE.cut))
  shapes.push(line(keyX, top + h / 2, keyX + use.L, top + h / 2))

  // --- 치수 -------------------------------------------------------------------
  const pad = use.d * 0.28
  // 보기 비율일 때는 **숫자를 하나도 안 적는다.** 기호만 남겨 「어디가 무엇인지」
  // 를 말한다 — 지어낸 숫자를 보여 주면 그림이 거짓말을 한다.
  const at = (key) => (example ? null : use[key])
  const dims = [
    // 축 지름은 단면 아래에.
    dim([cx - R, cy + R], [cx + R, cy + R],
        { offset: pad, label: 'Ø{}', symbol: 'd',
          value: at('d'), unit: values._units?.d }),
    // 키 폭은 단면 위에. 키가 작아도 이 치수가 어디를 가리키는지 보이게.
    dim([cx - use.b / 2, top - h / 2], [cx + use.b / 2, top - h / 2],
        { offset: -pad, label: '{}', symbol: 'b',
          value: at('b'), unit: values._units?.b }),
    // 키 길이는 옆면 아래에 — 전단면적의 나머지 한 변이다.
    dim([keyX, cy + R], [keyX + use.L, cy + R],
        { offset: pad, label: '{}', symbol: 'L',
          value: at('L'), unit: values._units?.L }),
  ]

  if (example || positive(values.h)) {
    // 축 밖으로 내보낸다. 키 바로 옆에 두면 글자가 축 외곽선 위에 엉힌다 —
    // 그러면 치수인지 형상인지 구분이 안 된다.
    const clear = (shaftLen - use.L) / 2 + pad * 0.55
    dims.push(dim([keyX + use.L, top - h / 2], [keyX + use.L, top + h / 2],
                  { offset: clear, label: '{}', symbol: 'h',
                    value: at('h'), unit: values._units?.h }))
  }

  return {
    ok: true,
    // 보기 비율로 그렸다는 사실과, 무엇이 있어야 진짜가 되는지.
    example,
    missing: missing.map(p => p.key),
    shapes,
    dims,
    notes,
    box: bounds([...shapes, ...dims]),
  }
}

export default {
  id: 'sunk_key',
  name: '묻힘키',
  summary: '축·키 폭·키 길이. 전단면적(b × L)의 두 변이 그림에 함께 나옵니다.',
  params: PARAMS,
  build,
}
