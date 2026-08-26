/**
 * 컨테이너를 **안에 든 것에 딱 맞게** 키우거나 줄인다.
 *
 * 손으로 맞추기가 유난히 나쁜 자리였다. 내용이 컨테이너 안에서 **스크롤**되기
 * 때문에 넘쳤다는 사실 자체가 안 보이고, 모서리를 조금씩 끌면서 눈으로 맞춰야
 * 한다. 도해가 들어오면서 더 나빠졌다 — 그림 높이는 폭과 비율이 정하는 값이라
 * 사람이 미리 알 수가 없다.
 *
 * ## 격자 셈은 한 곳에만 둔다
 *
 * react-grid-layout 에서 h 칸짜리 항목의 실제 높이는
 *
 *     h * ROW + (h - 1) * MARGIN
 *
 * 이다. 이 값이 격자를 그리는 쪽과 맞춤을 계산하는 쪽 **양쪽에** 필요한데, 두
 * 군데 적으면 한쪽만 고치는 날이 온다. 그때 맞춤은 조용히 어긋난 높이를 준다 —
 * 눈에 안 띄게 한 칸씩 모자라는 식으로. 그래서 상수도 셈도 여기 하나만 둔다.
 */

/** 격자 한 칸의 높이(px)와 항목 사이 여백(px). `ResponsiveGridLayout` 과 같은 값. */
export const ROW_HEIGHT = 50
export const GRID_MARGIN = 16

/** 컨테이너가 가질 수 있는 가장 작은 칸 수. 너무 납작하면 제목도 안 보인다. */
export const MIN_ROWS = 2

/** 픽셀 높이 → 격자 칸 수. 모자라느니 한 칸 넘치는 편이 낫다. */
export function rowsFor(pixels) {
  if (!Number.isFinite(pixels) || pixels <= 0) return MIN_ROWS
  const rows = Math.ceil((pixels + GRID_MARGIN) / (ROW_HEIGHT + GRID_MARGIN))
  return Math.max(MIN_ROWS, rows)
}

/** 그 반대 — 칸 수가 실제로 몇 픽셀인가. 시험과 미리보기가 쓴다. */
export function pixelsFor(rows) {
  return rows * ROW_HEIGHT + (rows - 1) * GRID_MARGIN
}

/**
 * 이 상자가 내용을 다 보이려면 몇 픽셀이 필요한가.
 *
 * **`offsetHeight` 만 보면 안 된다.** 스크롤이 생기는 칸은 지금 보이는 높이만
 * 알려 주므로, 넘친 만큼이 계산에서 빠진다 — 맞춤을 눌러도 여전히 잘린 채로
 * 남고, 사람은 기능이 고장 났다고 여긴다. 담긴 높이(`scrollHeight`)와 큰 쪽을
 * 쓴다.
 *
 * @param box  컨테이너 바깥 상자 (padding·border 를 가진 요소)
 */
export function neededHeight(box) {
  if (!box || typeof window === 'undefined') return 0
  const style = window.getComputedStyle(box)
  const num = (v) => (parseFloat(v) || 0)

  let total = num(style.paddingTop) + num(style.paddingBottom)
    + num(style.borderTopWidth) + num(style.borderBottomWidth)

  for (const child of box.children) {
    const cs = window.getComputedStyle(child)
    if (cs.display === 'none' || cs.position === 'absolute') continue
    total += Math.max(child.offsetHeight, child.scrollHeight)
      + num(cs.marginTop) + num(cs.marginBottom)
  }
  return total
}

/**
 * 늘어난 칸에 속지 않고 잰다.
 *
 * 상자 안쪽 칸은 `flex: 1` 이라 **남는 자리를 채우도록 늘어난다.** 그래서 상자가
 * 지금 너무 크면 그 칸도 같이 커져 있고, 그대로 재면 「지금 크기」 가 나온다 —
 * 맞춤을 눌러도 줄어들지 않는다. 늘리는 쪽만 되고 줄이는 쪽은 안 되는데, 그게
 * 왜인지는 화면만 봐서 알 수 없다.
 *
 * 상자 높이를 잠깐 `auto` 로 두면 나눠 줄 남는 자리가 없어져 각 칸이 제 내용
 * 높이를 갖는다. 재고 나서 곧바로 되돌린다 — 그 사이에 화면을 그리지 않으므로
 * 깜빡이지 않는다.
 */
export function measureNatural(box) {
  if (!box) return 0
  const had = box.style ? box.style.height : undefined
  if (box.style) box.style.height = 'auto'
  try {
    return neededHeight(box)
  } finally {
    if (box.style) box.style.height = had
  }
}

/** 상자 하나를 재서 필요한 칸 수로. 못 재면 `null` — 그때는 건드리지 않는다. */
export function fitRows(box) {
  if (!box) return null
  const px = measureNatural(box)
  return px > 0 ? rowsFor(px) : null
}
