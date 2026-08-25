import { describe, expect, it } from 'vitest'
import { executionBlocks, stronglyConnected } from './scc'

const nodes = (...ids) => ids.map(id => ({ id }))
let seq = 0
const link = (from, to) => ({ id: ++seq, from_node_id: from, to_node_id: to })

describe('stronglyConnected', () => {
  it('순환이 없으면 하나씩 나뉘고, 값이 흐르는 순서로 나온다', () => {
    const got = stronglyConnected([1, 2, 3], [link(1, 2), link(2, 3)])
    expect(got).toEqual([['1'], ['2'], ['3']])
  })

  it('서로 물고 있으면 한 묶음이다', () => {
    const got = stronglyConnected([1, 2, 3], [link(1, 2), link(2, 3), link(3, 2)])
    expect(got[0]).toEqual(['1'])
    expect(new Set(got[1])).toEqual(new Set(['2', '3']))
  })

  it('묶음끼리는 여전히 순서가 있다', () => {
    // 고리(2,3)가 4 로 값을 보낸다. 고리가 먼저 와야 한다.
    const got = stronglyConnected([1, 2, 3, 4],
      [link(1, 2), link(2, 3), link(3, 2), link(3, 4)])
    expect(got[0]).toEqual(['1'])
    expect(got[got.length - 1]).toEqual(['4'])
  })

  it('없는 노드를 가리키는 선은 무시한다', () => {
    const got = stronglyConnected([1, 2], [link(1, 2), link(9, 2), link(2, 9)])
    expect(got).toEqual([['1'], ['2']])
  })
})

describe('executionBlocks', () => {
  it('평범한 사슬은 반복 블록이 아니다', () => {
    const got = executionBlocks(nodes(1, 2), [link(1, 2)])
    expect(got.map(b => b.loop)).toEqual([false, false])
    expect(got.flatMap(b => b.ids)).toEqual([1, 2])
  })

  it('자기 자신을 물면 혼자여도 반복 블록이다', () => {
    const got = executionBlocks(nodes(1), [link(1, 1)])
    expect(got).toHaveLength(1)
    expect(got[0].loop).toBe(true)
    expect(got[0].feedback).toHaveLength(1)
  })

  it('되돌아가는 선만 초기 추정값이 필요하다', () => {
    // 1 → 2 → 3 → 2 에서 초기값이 필요한 곳은 3 → 2 하나뿐이다. 2 → 3 은
    // 같은 순회 안에서 방금 나온 값을 쓴다.
    const back = link(3, 2)
    const got = executionBlocks(nodes(1, 2, 3), [link(1, 2), link(2, 3), back])
    const loop = got.find(b => b.loop)
    expect(loop.ids).toEqual([2, 3])
    expect(loop.feedback.map(l => l.id)).toEqual([back.id])
  })

  it('바깥에서 값이 들어오는 노드부터 돈다', () => {
    // 고리 (2,3) 에 값은 1 → 3 으로 들어온다. 3 부터 돌아야 첫 바퀴부터
    // 쓸모 있는 숫자가 나온다.
    const got = executionBlocks(nodes(1, 2, 3), [link(1, 3), link(3, 2), link(2, 3)])
    const loop = got.find(b => b.loop)
    expect(loop.ids[0]).toBe(3)
  })

  it('블록 바깥에서 들어오는 선을 따로 모은다', () => {
    const inbound = link(1, 2)
    const got = executionBlocks(nodes(1, 2, 3), [inbound, link(2, 3), link(3, 2)])
    const loop = got.find(b => b.loop)
    expect(loop.entryLinks.map(l => l.id)).toEqual([inbound.id])
  })

  it('배선을 넣은 순서가 달라도 같은 곳에 초기값을 요구한다', () => {
    // **시작점이 초기 추정값을 넣을 칸을 정한다.** 그게 배선 순서에 따라
    // 옮겨 다니면, 어제 채워 둔 값이 오늘 엉뚱한 칸을 비워 놓는다.
    const a = executionBlocks(nodes(1, 2), [link(1, 2), link(2, 1)])
    const b = executionBlocks(nodes(1, 2), [link(2, 1), link(1, 2)])
    const target = (blocks) => blocks[0].feedback.map(l => l.to_node_id)
    expect(target(a)).toEqual(target(b))
    expect(a[0].ids).toEqual(b[0].ids)
    expect(a[0].ids[0]).toBe(1)      // 바깥 입구가 없으면 id 가 작은 쪽부터
  })

  it('고리가 둘이면 각각 따로 묶인다', () => {
    const got = executionBlocks(nodes(1, 2, 3, 4),
      [link(1, 2), link(2, 1), link(2, 3), link(3, 4), link(4, 3)])
    const loops = got.filter(b => b.loop)
    expect(loops).toHaveLength(2)
    expect(new Set(loops[0].ids)).toEqual(new Set([1, 2]))
    expect(new Set(loops[1].ids)).toEqual(new Set([3, 4]))
  })
})
