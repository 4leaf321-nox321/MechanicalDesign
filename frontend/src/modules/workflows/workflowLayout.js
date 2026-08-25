/**
 * 노드를 순서도처럼 자동 배치한다.
 *
 * **값이 흐르는 방향이 곧 가로 방향**이다. 앞 계산이 왼쪽, 뒤 계산이 오른쪽에
 * 놓이면 화살표가 한 방향으로만 흘러 그림이 저절로 읽힌다. 배선을 무시하고
 * 격자에 늘어놓으면 화살표가 좌우로 엇갈려, 순서도를 그린 의미가 없어진다.
 *
 * ## 고리는 한 덩어리로 본다
 *
 * 서로 물고 있는 노드들 사이에는 앞뒤가 없다. 노드 하나하나로 열을 매기면 고리
 * 안에서 서로가 서로의 앞이 되어 열이 끝없이 밀린다. 그래서 **블록**(`scc.js`)
 * 단위로 열을 매기고, 한 고리의 노드들은 같은 열에 세로로 세운다. 되먹임 선만
 * 뒤로 돌아가고 나머지는 전부 오른쪽으로 흐른다.
 */

import { executionBlocks } from '../../shared/utils/scc'

const COLUMN = 340
const ROW = 165

/**
 * @param nodes `[{id, layout_x, layout_y}]`
 * @param links `[{from_node_id, to_node_id}]`
 * @returns `{ [nodeId]: {x, y} }`
 */
export function autoLayout(nodes, links) {
  const list = nodes || []
  if (list.length === 0) return {}

  const blocks = executionBlocks(list, links)
  const blockOf = new Map()
  blocks.forEach((block, i) => {
    for (const id of block.ids) blockOf.set(String(id), i)
  })

  // 블록끼리는 순환이 없다. 그래서 가장 긴 경로로 열을 매길 수 있다 — 짧은
  // 경로로 정하면 A→B→C 와 A→C 가 함께 있을 때 C 가 B 와 같은 열에 놓여
  // 화살표가 열을 건너뛰며 겹친다.
  const parents = blocks.map(() => new Set())
  for (const link of links || []) {
    const from = blockOf.get(String(link.from_node_id))
    const to = blockOf.get(String(link.to_node_id))
    if (from === undefined || to === undefined || from === to) continue
    parents[to].add(from)
  }

  const rank = []
  blocks.forEach((_, i) => {
    // `executionBlocks` 가 이미 위상 순서로 준다. 앞의 것은 이미 정해져 있다.
    const ups = [...parents[i]].map(p => rank[p] + 1)
    rank[i] = ups.length ? Math.max(...ups) : 0
  })

  const byColumn = new Map()
  blocks.forEach((block, i) => {
    const col = rank[i]
    if (!byColumn.has(col)) byColumn.set(col, [])
    // 고리 안의 노드는 같은 열에 세로로 이어 세운다.
    byColumn.get(col).push(...block.ids)
  })

  const positions = {}
  for (const [col, members] of byColumn) {
    // 열마다 세로 가운데를 맞춘다. 위로 붙여 놓으면 한 열만 긴 그림에서
    // 화살표가 심하게 기울어 읽기 어렵다.
    const offset = -((members.length - 1) * ROW) / 2
    members.forEach((id, i) => {
      positions[id] = { x: col * COLUMN, y: offset + i * ROW }
    })
  }
  return positions
}

/** 좌표가 하나도 없으면(전부 0) 아직 배치된 적이 없는 워크플로다. */
export function needsLayout(nodes) {
  return (nodes || []).every(n => !n.layout_x && !n.layout_y)
}

export default autoLayout
