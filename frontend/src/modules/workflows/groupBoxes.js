/**
 * 묶음 상자의 자리와 크기.
 *
 * 상자는 **멤버들이 차지한 자리에서 계산한다.** 상자 좌표를 따로 저장하면 노드를
 * 옮길 때마다 둘이 어긋나고, 어느 쪽이 맞는지 정할 방법이 없다. 저장하는 것은
 * 「누가 이 묶음에 드는가」 하나뿐이다.
 *
 * ## reactflow 의 부모 노드를 쓴다
 *
 * 상자를 그냥 뒤에 깔면 그룹째 끌 수가 없다 — 다섯 개를 하나씩 옮겨야 한다.
 * 부모로 두면 자식이 함께 따라오고 상자 밖으로 나가지도 않는다.
 *
 * 대가가 하나 있다: **자식 좌표가 부모 기준이 된다.** 우리가 저장하는 좌표는
 * 절대값이라, 그릴 때 빼고 저장할 때 더해야 한다. 그 환산을 여기 모아 둔다 —
 * 화면 곳곳에 흩으면 한 곳만 빠뜨리는 날이 오고, 그러면 노드가 저장할 때마다
 * 상자 크기만큼 밀린다.
 */

/** 노드 상자의 대략 크기. 실제 높이는 변수 수에 따라 다르지만 여백이 흡수한다. */
const NODE_W = 262
const NODE_H = 190

/** 상자 안쪽 여백. 위쪽은 이름표가 앉을 자리라 더 둔다. */
const PAD = 26
const PAD_TOP = 46

/**
 * @param groups `[{id, name, color, node_ids}]`
 * @param nodes  `[{id, layout_x, layout_y}]` — 절대 좌표
 * @param at     `{ [nodeId]: {x, y} }` 자동 배치가 준 자리(있으면 그것을 쓴다)
 * @returns `{ boxes, parentOf, originOf }`
 *
 *   `boxes`     `[{id, name, color, x, y, width, height, nodeIds}]`
 *   `parentOf`  `{ [nodeId]: 'group-<id>' }`
 *   `originOf`  `{ [nodeId]: {x, y} }` — 그 노드가 속한 상자의 왼쪽 위
 */
export function groupBoxes(groups, nodes, at = {}) {
  const place = (n) => at[n.id] || { x: n.layout_x || 0, y: n.layout_y || 0 }
  const byId = new Map((nodes || []).map(n => [String(n.id), n]))

  const boxes = []
  const parentOf = {}
  const originOf = {}

  for (const group of groups || []) {
    const members = (group.node_ids || [])
      .map(id => byId.get(String(id)))
      .filter(Boolean)
    // 멤버가 없는 묶음은 그리지 않는다. 빈 상자가 떠 있으면 무엇을 담으려던
    // 것인지 알 수 없고, 지우려 해도 잡을 데가 없다.
    if (members.length === 0) continue

    const spots = members.map(place)
    const left = Math.min(...spots.map(s => s.x)) - PAD
    const top = Math.min(...spots.map(s => s.y)) - PAD_TOP
    const right = Math.max(...spots.map(s => s.x)) + NODE_W + PAD
    const bottom = Math.max(...spots.map(s => s.y)) + NODE_H + PAD

    boxes.push({
      id: group.id,
      name: group.name,
      color: group.color,
      nodeIds: members.map(m => m.id),
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    })

    for (const m of members) {
      parentOf[m.id] = `group-${group.id}`
      originOf[m.id] = { x: left, y: top }
    }
  }

  return { boxes, parentOf, originOf }
}

/** 그릴 자리 — 부모가 있으면 부모 기준으로 옮긴다. */
export function toLocal(absolute, origin) {
  if (!origin) return absolute
  return { x: absolute.x - origin.x, y: absolute.y - origin.y }
}

/** 저장할 자리 — 부모 기준 좌표를 절대값으로 되돌린다. */
export function toAbsolute(local, origin) {
  if (!origin) return local
  return { x: local.x + origin.x, y: local.y + origin.y }
}

export default groupBoxes
