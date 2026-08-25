/**
 * 실행 블록 나누기 — 순환을 **거절하지 않고 묶는다.**
 *
 * 지금까지는 순환이 있으면 순서를 못 정해 실행 자체를 포기했다. 그런데 기계
 * 설계에는 서로 물고 있는 모델이 실제로 있다 — 축 지름이 자중을 낳고 자중이
 * 하중을 키워 다시 축 지름을 바꾼다. 수식으로 못 푸는 음함수라 돌려서 수렴시킨다.
 *
 * ## 순서 개념을 버리지 않는다
 *
 * 서로 물고 있는 노드들을 하나의 **강결합요소(SCC)** 로 묶으면, 묶음끼리는
 * 여전히 순환이 없다. 그래서 위상정렬이 그대로 산다 — 묶음을 순서대로 돌되,
 * 묶음 하나가 여럿이면 그 안에서만 반복한다.
 *
 * ## 블록 안의 순서와 되먹임
 *
 * 묶음 안에는 정해진 순서가 없지만, 하나를 골라 두면 **되돌아가는 선만**
 * 초기 추정값이 필요해진다. 앞으로 가는 선은 그 순회 안에서 이미 계산된 값을
 * 쓰면 된다(Gauss–Seidel). 순회를 안 정하고 모든 내부 선에 초기값을 요구하면,
 * 사람이 채워야 할 칸이 쓸데없이 늘어난다.
 *
 * 순회의 시작점은 **바깥에서 값이 들어오는 노드**로 잡는다. 고리에 값이 처음
 * 흘러드는 자리라, 거기서 시작해야 첫 순회부터 쓸모 있는 숫자가 나온다.
 */

const key = (id) => String(id)

/**
 * Tarjan 강결합요소.
 *
 * @param nodeIds 노드 id 목록
 * @param links   `[{from_node_id, to_node_id}]`
 * @returns 요소들의 배열. **위상 순서** — 앞의 것이 뒤의 것에 값을 보낸다.
 */
export function stronglyConnected(nodeIds, links) {
  const adj = new Map(nodeIds.map(id => [key(id), []]))
  for (const link of links || []) {
    const from = key(link.from_node_id)
    const to = key(link.to_node_id)
    // 없는 노드를 가리키는 선은 없는 셈 친다. 검증이 따로 말해 준다.
    if (adj.has(from) && adj.has(to)) adj.get(from).push(to)
  }

  let counter = 0
  const index = new Map()
  const low = new Map()
  const onStack = new Set()
  const stack = []
  const found = []

  const visit = (v) => {
    index.set(v, counter)
    low.set(v, counter)
    counter += 1
    stack.push(v)
    onStack.add(v)

    for (const w of adj.get(v)) {
      if (!index.has(w)) {
        visit(w)
        low.set(v, Math.min(low.get(v), low.get(w)))
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v), index.get(w)))
      }
    }

    if (low.get(v) === index.get(v)) {
      const component = []
      let w
      do {
        w = stack.pop()
        onStack.delete(w)
        component.push(w)
      } while (w !== v)
      found.push(component)
    }
  }

  for (const id of nodeIds) {
    if (!index.has(key(id))) visit(key(id))
  }

  // Tarjan 은 위상 **역순**으로 내놓는다. 뒤집어야 값이 흐르는 순서가 된다.
  return found.reverse()
}

/**
 * 블록 안에서 돌 순서를 정한다.
 *
 * **시작점이 곧 초기 추정값을 넣을 자리를 정한다** — 시작 노드로 되돌아오는 선이
 * 되먹임 선이 되기 때문이다. 그래서 아무렇게나 고르면 안 된다. Tarjan 이 내놓는
 * 묶음의 원소 순서는 내부 스택 사정이라, 배선을 넣은 순서만 달라져도 초기값을
 * 넣어야 할 칸이 옮겨 다닌다.
 *
 *   1. 바깥에서 값이 들어오는 노드 — 고리에 값이 처음 흘러드는 자리
 *   2. 없으면 id 가 가장 작은 노드 — 먼저 넣은 카드. 늘 같은 답이 나온다
 */
function orderWithin(member, internalAdj, entries) {
  const inside = new Set(member)
  const smallest = (ids) => [...ids].sort(
    (a, b) => (Number(a) - Number(b)) || String(a).localeCompare(String(b)))[0]

  const doors = member.filter(id => entries.has(id))
  const start = doors.length ? smallest(doors) : smallest(member)

  const order = []
  const seen = new Set()
  const walk = (v) => {
    if (seen.has(v)) return
    seen.add(v)
    order.push(v)
    for (const w of internalAdj.get(v) || []) {
      if (inside.has(w)) walk(w)
    }
  }
  walk(start)
  // 시작점에서 못 닿는 노드가 남을 수 있다(고리가 여럿 얽힌 경우). 뒤에 붙인다.
  for (const id of member) walk(id)
  return order
}

/**
 * 실행 블록으로 나눈다.
 *
 * @returns `[{ ids, loop, order, feedback, entryLinks }]` — 실행 순서대로
 *
 *   `ids`       이 블록의 노드 id (원래 형태 그대로)
 *   `loop`      반복이 필요한 블록인가 (둘 이상이거나 자기 자신을 물었는가)
 *   `feedback`  되돌아가는 선. **여기에만 초기 추정값이 필요하다.**
 *   `entryLinks` 바깥에서 이 블록으로 들어오는 선
 */
export function executionBlocks(nodes, links) {
  const list = nodes || []
  const all = links || []
  const ids = list.map(n => n.id)
  const original = new Map(ids.map(id => [key(id), id]))

  const components = stronglyConnected(ids, all)

  const adj = new Map(ids.map(id => [key(id), []]))
  for (const link of all) {
    const from = key(link.from_node_id)
    const to = key(link.to_node_id)
    if (adj.has(from) && adj.has(to)) adj.get(from).push(to)
  }

  return components.map(member => {
    const inside = new Set(member)
    const internal = all.filter(l => inside.has(key(l.from_node_id))
                                  && inside.has(key(l.to_node_id)))
    const entryLinks = all.filter(l => !inside.has(key(l.from_node_id))
                                    && inside.has(key(l.to_node_id)))

    const entries = new Set(entryLinks.map(l => key(l.to_node_id)))
    const order = orderWithin(member, adj, entries)
    const rank = new Map(order.map((id, i) => [id, i]))

    // 되돌아가는 선 — 순회에서 자기 자리보다 앞(또는 자기)으로 가는 선.
    // 자기 자신을 무는 선도 여기 들어온다.
    const feedback = internal.filter(
      l => rank.get(key(l.to_node_id)) <= rank.get(key(l.from_node_id)))

    return {
      ids: order.map(k => original.get(k)),
      loop: member.length > 1 || feedback.length > 0,
      feedback,
      entryLinks,
      internal,
    }
  })
}

export default executionBlocks
