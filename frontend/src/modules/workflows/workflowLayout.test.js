/**
 * 자동 배치가 지켜야 하는 것: **화살표가 한 방향으로만 흐른다.**
 *
 * 열 번호가 틀리면 그림은 그려지되 화살표가 좌우로 엇갈려, 순서도를 그린
 * 이유가 사라진다. 눈으로는 "좀 지저분하네" 로만 보이고 오류는 안 난다 —
 * 그래서 테스트로 잡는다.
 */

import { describe, expect, it } from 'vitest'
import { autoLayout, needsLayout } from './workflowLayout'

const nodes = (...ids) => ids.map(id => ({ id }))
const link = (from, to) => ({ from_node_id: from, to_node_id: to })

describe('autoLayout', () => {
  it('빈 워크플로는 빈 좌표', () => {
    expect(autoLayout([], [])).toEqual({})
  })

  it('연결이 없으면 모두 같은 열에, 서로 겹치지 않게 놓는다', () => {
    const at = autoLayout(nodes(1, 2, 3), [])
    expect(at[1].x).toBe(at[2].x)
    expect(at[2].x).toBe(at[3].x)
    expect(new Set([at[1].y, at[2].y, at[3].y]).size).toBe(3)
  })

  it('받는 쪽이 보내는 쪽보다 오른쪽에 온다', () => {
    const at = autoLayout(nodes(1, 2, 3), [link(1, 2), link(2, 3)])
    expect(at[1].x).toBeLessThan(at[2].x)
    expect(at[2].x).toBeLessThan(at[3].x)
  })

  it('지름길이 있어도 가장 긴 경로로 열을 정한다', () => {
    // 1→2→3 과 1→3 이 함께 있을 때, 3 을 2 와 같은 열에 두면 화살표가 열을
    // 건너뛰며 노드 위를 지난다.
    const at = autoLayout(nodes(1, 2, 3), [link(1, 2), link(2, 3), link(1, 3)])
    expect(at[3].x).toBeGreaterThan(at[2].x)
  })

  it('한 값이 두 곳으로 갈라져도 두 곳이 같은 열에 선다', () => {
    const at = autoLayout(nodes(1, 2, 3), [link(1, 2), link(1, 3)])
    expect(at[2].x).toBe(at[3].x)
    expect(at[2].y).not.toBe(at[3].y)
  })

  it('열마다 세로 가운데를 맞춘다', () => {
    const at = autoLayout(nodes(1, 2, 3), [link(1, 2), link(1, 3)])
    expect(at[1].y).toBe(0)                       // 혼자인 열은 가운데
    expect(at[2].y + at[3].y).toBe(0)             // 둘인 열은 위아래 대칭
  })

  it('순환이 들어와도 멈춘다', () => {
    // 저장할 때 막지만, 옛 자료나 손상된 응답으로 들어올 수 있다. 여기서
    // 무한히 돌면 화면이 통째로 멈춘다.
    const at = autoLayout(nodes(1, 2), [link(1, 2), link(2, 1)])
    expect(Object.keys(at)).toHaveLength(2)
  })

  it('없는 노드를 가리키는 연결은 무시한다', () => {
    const at = autoLayout(nodes(1, 2), [link(1, 2), link(9, 2)])
    expect(at[1].x).toBeLessThan(at[2].x)
  })
})

describe('needsLayout', () => {
  it('좌표가 하나도 없으면 배치가 필요하다', () => {
    expect(needsLayout([{ layout_x: 0, layout_y: 0 }])).toBe(true)
  })

  it('하나라도 자리를 잡았으면 손대지 않는다', () => {
    // 사람이 옮겨 둔 자리를 다시 계산해 덮으면, 옮긴 일이 사라진 것처럼 보인다.
    expect(needsLayout([
      { layout_x: 0, layout_y: 0 },
      { layout_x: 320, layout_y: -150 },
    ])).toBe(false)
  })
})

describe('반복 블록', () => {
  it('서로 물린 노드는 같은 열에 세로로 선다', () => {
    // 노드 하나하나로 열을 매기면 고리 안에서 서로가 서로의 앞이 되어 열이
    // 끝없이 밀린다. 블록으로 묶어야 한 줄에 선다.
    const at = autoLayout(nodes(1, 2), [link(1, 2), link(2, 1)])
    expect(at[1].x).toBe(at[2].x)
    expect(at[1].y).not.toBe(at[2].y)
  })

  it('고리 앞뒤는 여전히 좌우로 흐른다', () => {
    const at = autoLayout(nodes(1, 2, 3, 4),
      [link(1, 2), link(2, 3), link(3, 2), link(3, 4)])
    expect(at[1].x).toBeLessThan(at[2].x)   // 고리 앞
    expect(at[2].x).toBe(at[3].x)           // 고리 안 — 같은 열
    expect(at[3].x).toBeLessThan(at[4].x)   // 고리 뒤
  })

  it('자기 자신을 무는 노드도 자리를 잡는다', () => {
    const at = autoLayout(nodes(1), [link(1, 1)])
    expect(at[1]).toEqual({ x: 0, y: 0 })
  })
})
