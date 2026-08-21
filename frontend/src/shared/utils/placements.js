/**
 * 위젯 배치 조회 — `placements` 를 읽는 곳이 한 군데로 모이게 한다.
 *
 * 한 위젯(변수·이미지)은 여러 컨테이너에 놓일 수 있다. 값은 하나뿐이고 보이는
 * 자리만 여럿이다 — 컨테이너는 화면 묶음일 뿐 계산에 관여하지 않으므로, 같은
 * 변수를 두 곳에 두면 같은 값이 두 군데 보이고 한쪽을 고치면 다른 쪽도 바뀐다.
 *
 * 서버가 주는 모양: `widget.placements = [{ container_id, sort_order }, ...]`
 * 배열이 비어 있으면 미배치다.
 */

/** 이 위젯이 놓인 컨테이너 수. 팔레트의 사용 횟수 배지가 이 값을 쓴다. */
export function placementCount(widget) {
  return (widget && widget.placements ? widget.placements.length : 0)
}

export function isPlaced(widget) {
  return placementCount(widget) > 0
}

export function placedContainerIds(widget) {
  if (!widget || !widget.placements) return []
  return widget.placements.map(p => p.container_id)
}

/**
 * 컨테이너 id → 그 안의 위젯 목록(배치 순서대로).
 *
 * **같은 위젯이 여러 컨테이너에 들어갈 수 있으므로 push 하고 끝이 아니다.**
 * 배치마다 한 번씩 들어가고, 정렬 기준은 위젯의 `sort_order` 가 아니라 **그
 * 배치의** `sort_order` 다. 컨테이너마다 순서를 따로 정할 수 있어야 하기 때문이다.
 */
export function groupByContainer(widgets) {
  const map = {}
  ;(widgets || []).forEach(widget => {
    ;(widget.placements || []).forEach(p => {
      if (!map[p.container_id]) map[p.container_id] = []
      map[p.container_id].push({ widget, sort_order: p.sort_order ?? 0 })
    })
  })
  Object.keys(map).forEach(key => {
    map[key].sort((a, b) => a.sort_order - b.sort_order)
    map[key] = map[key].map(entry => entry.widget)
  })
  return map
}

/** 어느 컨테이너에도 놓이지 않은 것들. 카드 화면에서 "미배치" 영역에 나온다. */
export function unplaced(widgets) {
  return (widgets || []).filter(w => !isPlaced(w))
}
