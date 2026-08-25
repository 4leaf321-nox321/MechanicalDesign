/**
 * 기록의 입력값을 지금 워크플로에 맞춘다.
 *
 * 카드 한 장과 다른 점은 **맞출 것이 두 겹**이라는 것이다 — 어느 노드였는지,
 * 그 안의 어느 변수였는지. 노드를 뺐다 다시 넣으면 id 가 바뀌므로 별칭으로
 * 되찾고, 변수는 카드가 바뀌었을 수 있으므로 기호로 되찾는다.
 *
 * ## 연결된 입력은 불러오지 않는다
 *
 * 어차피 앞 노드 값에 덮인다. 채워 넣으면 화면에 숫자가 보이는데 계산에는 안
 * 쓰이고, 그러면 그 칸을 고쳐도 아무 일이 일어나지 않는 그 실패가 된다.
 *
 * **되먹임은 예외다.** 고리를 닫는 선이 들어오는 칸에 적힌 숫자는 앞 노드가
 * 덮는 값이 아니라 고리가 **출발하는** 값이다. 사람이 정하는 값이라, 지난번에
 * 잘 잡혔던 추정값이야말로 다시 쓰고 싶은 것이다.
 *
 * ## 못 맞춘 것은 노드 이름과 함께 말한다
 *
 * 「하중 (F) 를 못 찾음」 만으로는 어느 카드인지 모른다. 워크플로에는 같은 카드가
 * 두 번 놓이기도 해서, 노드 이름이 없으면 짚을 수가 없다.
 */

/** 기호 → 변수. 겹치면 먼저 만든 쪽. */
function bySymbol(variables) {
  const map = new Map()
  for (const v of variables || []) {
    if (v.symbol && !map.has(v.symbol)) map.set(v.symbol, v)
  }
  return map
}

/**
 * @param record        기록 상세 (`inputs`, `definition_snapshot`)
 * @param workflow      지금 워크플로 (`nodes`, `links`)
 * @param cardVariables `{ [cardId]: [variable, ...] }` — 지금 정의
 * @param feedbackIds   되먹임 선의 id 집합(문자열). `executionBlocks` 가 준다
 * @returns `{ byNode, matched, missing, skipped }`
 *
 *   `byNode`   `{ [nodeId]: { [variableId]: 값 } }` — 그대로 저장하면 된다
 *   `missing`  기록에는 있었지만 지금 자리를 못 찾은 것들의 이름
 *   `skipped`  연결로 채워지므로 일부러 안 넣은 것들의 이름
 */
export function mapWorkflowInputs(record, workflow, cardVariables, feedbackIds) {
  const snapshot = record?.definition_snapshot || {}
  const snapNodes = snapshot.nodes || []
  const snapCards = snapshot.cards || {}
  const stored = record?.inputs || {}

  const nodes = workflow?.nodes || []
  const nodeById = new Map(nodes.map(n => [String(n.id), n]))
  const nodeByAlias = new Map()
  for (const n of nodes) {
    if (!nodeByAlias.has(n.alias)) nodeByAlias.set(n.alias, n)
  }

  // 연결로 채워지는 입력. 되먹임은 빼 둔다 — 그건 사람이 주는 초기 추정값이다.
  const covered = new Set()
  for (const link of workflow?.links || []) {
    if (feedbackIds?.has(String(link.id))) continue
    covered.add(`${link.to_node_id}:${link.to_variable_id}`)
  }

  const byNode = {}
  const missing = []
  const skipped = []
  let matched = 0

  for (const [recNodeId, values] of Object.entries(stored)) {
    const snapNode = snapNodes.find(n => String(n.id) === String(recNodeId))
    const label = snapNode?.alias || snapNode?.card_name || `노드 ${recNodeId}`

    // id 로, 없으면 별칭으로. 노드를 뺐다 다시 넣으면 id 만 달라진다.
    const target = nodeById.get(String(recNodeId)) || nodeByAlias.get(label)
    if (!target) {
      missing.push(`'${label}' 노드`)
      continue
    }

    const now = cardVariables?.[target.card_id] || []
    const nowById = new Map(now.map(v => [String(v.id), v]))
    const nowBySymbol = bySymbol(now)
    const then = snapCards[String(snapNode?.card_id)] || []
    const thenById = new Map(then.map(v => [String(v.id), v]))

    for (const [recVarId, value] of Object.entries(values || {})) {
      const snapVar = thenById.get(String(recVarId))
      let variable = nowById.get(String(recVarId))
      if (!variable && snapVar?.symbol) variable = nowBySymbol.get(snapVar.symbol)
      if (!variable && snapVar?.name) {
        variable = now.find(v => v.name === snapVar.name)
      }
      if (!variable) {
        missing.push(`'${target.alias}' 의 `
          + (snapVar?.name || snapVar?.symbol || `변수 ${recVarId}`))
        continue
      }
      // 계산되는 칸은 애초에 입력이 아니다. 기록에 섞여 있어도 넣지 않는다.
      if (variable.category !== 'input') continue

      if (covered.has(`${target.id}:${variable.id}`)) {
        skipped.push(`'${target.alias}' 의 ${variable.name}`)
        continue
      }

      if (!byNode[target.id]) byNode[target.id] = {}
      byNode[target.id][variable.id] = value
      matched += 1
    }
  }

  return { byNode, matched, missing, skipped }
}

/** 불러온 결과를 사람이 읽을 한 줄로. 조용한 성공보다 시끄러운 성공이 낫다. */
export function describeLoad({ matched, missing, skipped }) {
  if (matched === 0 && missing.length === 0) {
    return { warn: true, text: '가져올 입력값이 없습니다.' }
  }
  const parts = [`입력 ${matched}개를 채웠습니다.`]
  if (skipped.length) {
    parts.push(`연결로 채워지는 ${skipped.length}개는 건너뛰었습니다.`)
  }
  if (missing.length) {
    parts.push(`자리를 못 찾은 ${missing.length}개: ${missing.slice(0, 3).join(', ')}`
      + (missing.length > 3 ? ' 외' : ''))
  }
  return { warn: missing.length > 0, text: parts.join(' ') }
}

export default mapWorkflowInputs
