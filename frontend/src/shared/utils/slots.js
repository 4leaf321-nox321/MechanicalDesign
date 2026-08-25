/**
 * 자리 이름 — 한 노드의 어느 칸을 가리키는 짧은 문자열.
 *
 * 카드 자리는 `변수id`. 워크플로 자리는 `안쪽노드:변수id`.
 *
 * ## 왜 한 곳에 모으는가
 *
 * 이 이름은 세 군데서 만들어진다: 손잡이를 다는 곳, 선을 그 손잡이에 붙이는 곳,
 * 저장된 입력값을 꺼내는 곳. 세 곳이 따로 계산하면 어긋나는 날이 오는데, 그때
 * 나는 고장이 **조용하다** — 선은 노드 한가운데에 가서 붙고, 적어 둔 숫자는
 * 아무 칸에도 닿지 않고, 오류는 하나도 안 뜬다.
 *
 * 그래서 규칙을 여기 하나만 둔다.
 */

import { slot } from './workflowEngine'
import { workflowInterface } from './workflowInterface'

/** 하위 워크플로가 놓인 자리들의 id (문자열). */
export function nestedIds(workflow) {
  return new Set((workflow?.nodes || [])
    .filter(n => n.sub_workflow).map(n => String(n.id)))
}

/**
 * 그 배선이 닿는 칸의 자리 이름.
 *
 * @param side `'from'` 또는 `'to'`
 * @param nested `nestedIds()` 가 준 집합
 */
export function handleAt(link, side, nested) {
  const nodeId = String(link[`${side}_node_id`])
  const variableId = link[`${side}_variable_id`]
  return nested.has(nodeId)
    ? slot(link[`${side}_inner_node_id`] ?? nodeId, variableId)
    : String(variableId)
}

/**
 * 자리 이름을 도로 풀어 서버가 쓰는 두 값으로.
 *
 * 카드 자리에는 안쪽이라는 것이 없으므로 자기 자신을 적는다. 비워 두지 않는
 * 것이 중요하다 — 그 칸이 비면 「한 입력에는 연결 하나」 를 지키는 DB 의 유일
 * 제약이 조용히 풀린다. Postgres 에서 NULL 은 서로 부딪히지 않기 때문이다.
 */
export function parseSlot(key, nodeId) {
  const [a, b] = String(key).split(':')
  return b === undefined
    ? { inner: Number(nodeId), variable: Number(a) }
    : { inner: Number(a), variable: Number(b) }
}

/**
 * 한 노드의 칸 목록 — 카드든 워크플로든 **같은 모양**으로.
 *
 * 표 보기와 순서도가 노드 종류마다 다른 길을 타면, 한쪽에만 중첩을 붙였을 때
 * 다른 쪽은 그 노드를 빈 칸으로 그린다. 넣었는데 아무것도 안 보이는 것이
 * 「못 넣습니다」 보다 나쁘다.
 *
 * @returns `[{ key, label, unit, category }]`
 */
export function slotsOf(node, cardVariables, kind) {
  if (node?.sub_workflow) {
    const face = workflowInterface(node.sub_workflow, cardVariables)
    const rows = kind === 'input' ? face.inputs : face.outputs
    return rows.map(v => ({
      key: slot(v.nodeId, v.variableId),
      // 안쪽 어느 카드의 칸인지까지 적는다. 「하중 (F)」 만으로는 안에 같은
      // 이름이 셋일 때 어느 것인지 알 수 없다.
      label: `${v.path[v.path.length - 1]} · ${v.label}`,
      unit: v.unit || '',
      // 단위 검사가 이것을 본다. 중첩 자리에서 빠뜨리면 배율 어긋남 —
      // 값만 1000배 틀리고 계산은 멀쩡히 도는 고장 — 을 못 잡는다.
      unit_info: v.unit_info,
      category: v.category,
    }))
  }

  const variables = cardVariables?.[node?.card_id] || []
  return variables
    .filter(v => (kind === 'input' ? v.category === 'input' : v.category !== 'input'))
    .map(v => ({
      key: String(v.id),
      label: v.symbol ? `${v.name} (${v.symbol})` : v.name,
      unit: v.unit || '',
      unit_info: v.unit_info,
      category: v.category,
    }))
}

/**
 * 이 노드에서 **이을 수 있는** 칸 전부, 자리 이름으로 찾을 수 있게.
 *
 * 중첩 자리에서는 얼굴에 없는 칸이 아예 안 들어온다. 그것이 맞다 — 얼굴 밖을
 * 가리키는 배선은 실제로 끊긴 배선이고, 검증이 그렇게 말해 주어야 한다.
 */
export function slotMap(node, cardVariables) {
  const map = new Map()
  for (const kind of ['input', 'output']) {
    for (const v of slotsOf(node, cardVariables, kind)) map.set(v.key, v)
  }
  return map
}

export default slotsOf
