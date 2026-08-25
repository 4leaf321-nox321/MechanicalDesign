import { describe, expect, it } from 'vitest'
import { groupBoxes, toAbsolute, toLocal } from './groupBoxes'

const node = (id, x, y) => ({ id, layout_x: x, layout_y: y })

describe('groupBoxes', () => {
  it('멤버를 다 담을 만큼 상자를 키운다', () => {
    const { boxes } = groupBoxes(
      [{ id: 1, name: '앞단', color: '#000', node_ids: [10, 11] }],
      [node(10, 0, 0), node(11, 400, 200)])

    const box = boxes[0]
    expect(box.x).toBeLessThan(0)          // 여백만큼 왼쪽으로
    expect(box.y).toBeLessThan(0)
    expect(box.x + box.width).toBeGreaterThan(400 + 262)
    expect(box.y + box.height).toBeGreaterThan(200 + 190)
  })

  it('멤버가 없는 묶음은 그리지 않는다', () => {
    // 빈 상자가 떠 있으면 무엇을 담으려던 것인지 알 수 없고 잡을 데도 없다.
    const { boxes } = groupBoxes(
      [{ id: 1, name: '빈 것', node_ids: [] }], [node(10, 0, 0)])
    expect(boxes).toEqual([])
  })

  it('사라진 노드를 가리키는 묶음도 나머지로 그린다', () => {
    const { boxes } = groupBoxes(
      [{ id: 1, name: '앞단', node_ids: [10, 99] }], [node(10, 0, 0)])
    expect(boxes[0].nodeIds).toEqual([10])
  })

  it('멤버마다 부모와 원점을 알려 준다', () => {
    const { parentOf, originOf, boxes } = groupBoxes(
      [{ id: 7, name: 'A', node_ids: [10] }], [node(10, 100, 50)])
    expect(parentOf[10]).toBe('group-7')
    expect(originOf[10]).toEqual({ x: boxes[0].x, y: boxes[0].y })
  })

  it('묶이지 않은 노드는 부모가 없다', () => {
    const { parentOf } = groupBoxes([], [node(10, 0, 0)])
    expect(parentOf[10]).toBeUndefined()
  })

  it('자동 배치가 준 자리를 저장된 좌표보다 먼저 본다', () => {
    // 아직 한 번도 배치된 적 없는 워크플로는 저장된 좌표가 전부 0 이다.
    // 그것으로 상자를 그리면 모두 한 점에 겹친다.
    const { boxes } = groupBoxes(
      [{ id: 1, node_ids: [10, 11] }],
      [node(10, 0, 0), node(11, 0, 0)],
      { 10: { x: 0, y: 0 }, 11: { x: 340, y: 0 } })
    expect(boxes[0].width).toBeGreaterThan(340)
  })
})

describe('좌표 환산', () => {
  it('그릴 때는 부모 기준으로, 저장할 때는 절대값으로', () => {
    // 한쪽만 하면 저장할 때마다 노드가 상자 크기만큼 밀린다.
    const origin = { x: -26, y: -46 }
    const local = toLocal({ x: 100, y: 50 }, origin)
    expect(local).toEqual({ x: 126, y: 96 })
    expect(toAbsolute(local, origin)).toEqual({ x: 100, y: 50 })
  })

  it('부모가 없으면 그대로 둔다', () => {
    expect(toLocal({ x: 5, y: 5 }, undefined)).toEqual({ x: 5, y: 5 })
    expect(toAbsolute({ x: 5, y: 5 }, undefined)).toEqual({ x: 5, y: 5 })
  })
})
