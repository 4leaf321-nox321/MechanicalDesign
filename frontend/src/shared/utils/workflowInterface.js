/**
 * 워크플로의 **바깥에서 보이는 얼굴** — 무엇을 받고 무엇을 내놓는가.
 *
 * 워크플로를 다른 워크플로 안에 노드로 넣으려면, 그것이 카드처럼 「입력 몇 개,
 * 결과 몇 개」로 보여야 한다. 그 목록을 **따로 설정하지 않고 유도한다.**
 *
 *     입력  = 배선이 안 붙은 입력      (아무도 안 채워 주니 밖에서 받아야 한다)
 *     출력  = 아무 데도 안 보내는 노드의 결과  (안에서 더 쓸 데가 없으니 밖으로 간다)
 *
 * ## 왜 설정하지 않고 유도하는가
 *
 * 「이것이 이 워크플로의 입력이다」 를 사람이 골라 두면, 안쪽 배선을 고치는
 * 순간 그 목록이 낡는다. 연결 하나를 이었을 뿐인데 바깥에서는 여전히 그 칸을
 * 채우라고 하고, 채운 값은 앞 노드에 덮여 무시된다 — 고칠 수 있는데 무시되는,
 * 이 시스템에서 가장 나쁜 실패다.
 *
 * 유도하면 그런 일이 없다. 배선을 바꾸면 얼굴이 **곧바로** 따라 바뀐다. 대신
 * 바깥 배선이 끊길 수 있는데, 그건 검증이 「끊긴 연결」로 잡아 준다 — 조용히
 * 틀리는 것보다 시끄럽게 끊기는 편이 낫다.
 *
 * ## 자리를 가리키는 법
 *
 * 안쪽 자유 입력은 `(노드, 변수)` 한 쌍이다. 변수 id 만으로는 모자란다 — 같은
 * 카드가 두 자리에 놓이면 변수 id 가 똑같기 때문이다. 그래서 밖에서 이 얼굴에
 * 배선할 때는 **두 값을 함께** 적어 둔다.
 */

/** 이 노드가 하위 워크플로인가. */
export function isNested(node) {
  return !!(node && node.sub_workflow)
}

/** 카드 변수를 얼굴에 실을 모양으로. */
function face(node, variable, path) {
  return {
    // 밖에서 이 자리를 가리킬 두 값.
    nodeId: node.id,
    variableId: variable.id,
    // 사람이 읽을 이름. 여러 층을 지나왔으면 어디를 거쳤는지 함께 적는다 —
    // 「하중 (F)」만 있으면 같은 이름이 셋일 때 어느 것인지 알 수 없다.
    label: variable.symbol
      ? `${variable.name} (${variable.symbol})`
      : variable.name,
    path: [...path, node.alias],
    unit: variable.unit || '',
    unit_info: variable.unit_info,
    category: variable.category,
  }
}

/**
 * 한 워크플로의 얼굴.
 *
 * @param workflow      `{ nodes, links }` — 노드에 `sub_workflow` 가 실려 있으면 파고든다
 * @param cardVariables `{ [cardId]: [variable, ...] }`
 * @param path          여기까지 지나온 노드 이름들 (안쪽에서 재귀할 때 쓴다)
 * @returns `{ inputs, outputs }`
 */
export function workflowInterface(workflow, cardVariables, path = []) {
  const nodes = workflow?.nodes || []
  const links = workflow?.links || []

  // 이미 채워지는 입력. 하위 워크플로로 들어가는 배선은 그 **안쪽 자리**를
  // 채우므로 노드가 아니라 (안쪽 노드, 변수) 로 적어 둔다.
  const fed = new Set()
  for (const link of links) {
    const inner = link.to_inner_node_id ?? link.to_node_id
    fed.add(`${link.to_node_id}:${inner}:${link.to_variable_id}`)
  }

  // 값을 어디로든 보내는 노드는 결론이 아니다.
  const sends = new Set(links.map(l => String(l.from_node_id)))

  const inputs = []
  const outputs = []

  for (const node of nodes) {
    if (isNested(node)) {
      // 안쪽 얼굴이 곧 이 노드의 얼굴이다. 한 층 더 감싼다.
      const inner = workflowInterface(node.sub_workflow, cardVariables,
                                      [...path, node.alias])
      for (const slot of inner.inputs) {
        if (fed.has(`${node.id}:${slot.nodeId}:${slot.variableId}`)) continue
        inputs.push({ ...slot, outerNodeId: node.id })
      }
      if (!sends.has(String(node.id))) {
        for (const slot of inner.outputs) {
          outputs.push({ ...slot, outerNodeId: node.id })
        }
      }
      continue
    }

    const variables = cardVariables?.[node.card_id] || []
    for (const v of variables) {
      if (v.category === 'input') {
        if (fed.has(`${node.id}:${node.id}:${v.id}`)) continue
        inputs.push({ ...face(node, v, path), outerNodeId: node.id })
      } else if (v.category === 'output' && !sends.has(String(node.id))) {
        // **중간값은 내보내지 않는다.** 카드 안에서 쓰라고 둔 값이라, 밖으로
        // 내면 그 카드의 속을 다른 워크플로가 들여다보게 된다.
        outputs.push({ ...face(node, v, path), outerNodeId: node.id })
      }
    }
  }

  return { inputs, outputs }
}

/**
 * 이 워크플로 안에 그 워크플로가 (몇 겹이든) 들어 있는가.
 *
 * 층을 넘는 순환을 막는 데 쓴다. A 가 B 를 품고 B 가 A 를 품으면 펼치는 것부터
 * 끝나지 않는다 — 반복 블록과 달리 **수렴이라는 개념 자체가 없다.** 같은 층의
 * 순환은 돌려서 풀 수 있지만 이건 정의가 자기를 부르는 것이라 막아야 한다.
 */
export function contains(workflow, targetId, seen = new Set()) {
  for (const node of workflow?.nodes || []) {
    const sub = node.sub_workflow
    if (!sub) continue
    if (String(sub.id) === String(targetId)) return true
    // 자료가 이미 망가져 있어도 여기서 영영 돌지 않는다.
    if (seen.has(String(sub.id))) continue
    seen.add(String(sub.id))
    if (contains(sub, targetId, seen)) return true
  }
  return false
}

/** 이 워크플로가 쓰는 카드 id 전부 — 몇 층이든 파고들어 모은다. */
export function cardIdsWithin(workflow, seen = new Set()) {
  const ids = new Set()
  for (const node of workflow?.nodes || []) {
    if (node.sub_workflow) {
      const key = String(node.sub_workflow.id)
      if (seen.has(key)) continue
      seen.add(key)
      for (const id of cardIdsWithin(node.sub_workflow, seen)) ids.add(id)
    } else if (node.card_id) {
      ids.add(node.card_id)
    }
  }
  return ids
}

export default workflowInterface
