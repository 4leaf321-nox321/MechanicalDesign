/**
 * 워크플로 실행 — 순서대로 카드를 돌리고 값을 다음 카드로 옮긴다.
 *
 * 계산 절차는 `calcEngine` 하나가 안다. 여기가 하는 일은 **순서와 배선**뿐이다 —
 * 계산을 여기서 다시 구현하면 카드 화면과 워크플로가 다른 답을 내는 날이 오고,
 * 그 어긋남은 원인을 찾기가 아주 어렵다.
 *
 * ## 앞이 실패하면 뒤를 계산하지 않는다
 *
 * 이것이 이 파일에서 가장 중요한 규칙이다. 앞 노드가 실패했는데 뒤 노드를 그냥
 * 돌리면, 빠진 입력이 **기본값(대개 0)** 으로 채워져 계산이 멀쩡히 돈다. 숫자도
 * 그럴듯하게 나온다. 그 카드를 연 사람은 그것이 진짜 결과인 줄 안다.
 *
 * 그래서 막힌 노드는 계산하지 않고 `blocked` 로 두고, **무엇 때문에 막혔는지**
 * 를 함께 남긴다. 이유를 안 남기면 사람은 그 노드를 열어 입력을 채우려 들고,
 * 정작 고쳐야 할 곳은 앞 노드다.
 */

import { calculateCard } from './calcEngine'

export const STATUS = {
  ok: 'ok',
  blocked: 'blocked',   // 앞 노드가 값을 못 줘서 돌리지 않았다
  failed: 'failed',     // 돌렸는데 이 노드 안에서 계산이 실패했다
}

/**
 * @param workflow      `{ nodes, links, order }` — 서버가 준 그대로
 * @param cardVariables `{ [cardId]: [variable, ...] }`
 * @param overrides     `{ [nodeId]: { [variableId]: 값 } }` — 화면에서 임시로 바꾼 값.
 *                      저장된 입력보다 우선하고, **연결보다는 뒤진다.**
 */
export function runWorkflow(workflow, cardVariables, overrides = {}) {
  const nodes = workflow?.nodes || []
  const links = workflow?.links || []
  const order = workflow?.order

  if (!Array.isArray(order)) {
    return {
      ok: false,
      reason: 'cycle',
      message: '순환 연결이 있어 실행 순서를 정할 수 없습니다.',
      nodes: {},
    }
  }

  const nodeById = new Map(nodes.map(n => [String(n.id), n]))
  // 들어오는 배선을 목적지 기준으로 모은다. 노드마다 전체 목록을 훑으면
  // 노드 수 × 연결 수가 되고, 배선이 많은 워크플로에서 눈에 띄게 느려진다.
  const incoming = new Map()
  for (const link of links) {
    const key = String(link.to_node_id)
    if (!incoming.has(key)) incoming.set(key, [])
    incoming.get(key).push(link)
  }

  const out = {}

  for (const nodeId of order) {
    const node = nodeById.get(String(nodeId))
    if (!node) continue

    const variables = cardVariables?.[node.card_id] || []

    if (node.card_deleted) {
      out[node.id] = {
        status: STATUS.blocked,
        message: '이 노드의 카드가 휴지통에 있습니다.',
        values: {}, results: {},
      }
      continue
    }

    // 저장된 값 → 화면에서 바꾼 값 → 연결로 들어온 값 순으로 덮는다.
    // **연결이 마지막인 것이 중요하다.** 앞 노드가 방금 계산한 값이 손으로 적어
    // 둔 값보다 최신이고, 그렇지 않으면 배선이 있으나 마나 해진다.
    const values = { ...(node.inputs || {}), ...(overrides[node.id] || {}) }

    const blockedBy = []
    for (const link of incoming.get(String(node.id)) || []) {
      const from = out[link.from_node_id]
      const source = nodeById.get(String(link.from_node_id))
      const sourceName = source ? source.alias : `노드 ${link.from_node_id}`

      if (!from || from.status !== STATUS.ok) {
        blockedBy.push(`'${sourceName}' 이(가) 계산되지 않았습니다`)
        continue
      }
      const result = from.results[link.from_variable_id]
      if (!result || result.error) {
        blockedBy.push(
          `'${sourceName}' 의 ${link.from_label || '값'} 을(를) 구하지 못했습니다`
          + (result?.error ? ` (${result.error})` : ''))
        continue
      }
      values[link.to_variable_id] = result.value
    }

    if (blockedBy.length > 0) {
      out[node.id] = {
        status: STATUS.blocked,
        blockedBy,
        // 앞에서 막힌 것이지 이 노드가 잘못된 것이 아니다. 그 구분을 안 하면
        // 사람은 이 노드의 입력을 채우려 들고, 고쳐야 할 곳은 앞이다.
        message: `앞 노드 때문에 계산하지 않았습니다 — ${blockedBy.join(', ')}`,
        values, results: {},
      }
      continue
    }

    const { results } = calculateCard(variables, values)
    const failed = Object.entries(results).filter(([, r]) => r && r.error)

    out[node.id] = {
      status: failed.length ? STATUS.failed : STATUS.ok,
      values,
      results,
      // 실패한 칸이 있어도 **나머지 결과는 남긴다.** 한 칸이 안 나왔다고 그
      // 노드에서 나온 다른 값까지 감추면, 뒤 노드가 왜 막혔는지 읽을 수 없다.
      message: failed.length
        ? `계산되지 않은 값이 ${failed.length}개 있습니다.`
        : '',
    }
  }

  const statuses = Object.values(out).map(r => r.status)
  return {
    ok: statuses.length > 0 && statuses.every(s => s === STATUS.ok),
    nodes: out,
    order,
  }
}

/**
 * 마지막 노드들 — 아무 데로도 값을 보내지 않는 노드.
 *
 * 화면이 "이 워크플로의 결론" 으로 크게 보여 줄 것들이다. 중간 노드까지 같은
 * 크기로 늘어놓으면 무엇이 답인지 알 수 없다.
 */
export function terminalNodes(workflow) {
  const nodes = workflow?.nodes || []
  const sources = new Set((workflow?.links || []).map(l => String(l.from_node_id)))
  return nodes.filter(n => !sources.has(String(n.id)))
}

export default runWorkflow
