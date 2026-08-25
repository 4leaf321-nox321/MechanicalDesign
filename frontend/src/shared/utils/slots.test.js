/**
 * 자리 이름.
 *
 * 여기서 지키는 것 하나: **손잡이를 다는 쪽과 선을 붙이는 쪽이 같은 글자를
 * 쓴다.** 어긋나면 나는 고장이 조용하다 — 선은 노드 한가운데에 붙고, 적어 둔
 * 숫자는 아무 칸에도 안 닿고, 오류는 하나도 안 뜬다. 그래서 왕복을 시험한다.
 */

import { describe, expect, it } from 'vitest'
import { handleAt, nestedIds, parseSlot, slotsOf } from './slots'

const CARDS = {
  100: [
    { id: 1, category: 'input', symbol: 'm', name: '무게', unit: 'kg' },
    { id: 2, category: 'output', symbol: 'F', name: '하중', unit: 'N' },
  ],
  200: [
    { id: 11, category: 'input', symbol: 'Fin', name: '입력하중' },
    { id: 12, category: 'input', symbol: 'A', name: '단면적' },
    { id: 13, category: 'intermediate', symbol: 'half', name: '절반' },
    { id: 14, category: 'output', symbol: 'sig', name: '응력', unit: 'MPa' },
  ],
}

const inner = {
  id: 7,
  nodes: [
    { id: 1, card_id: 100, alias: '하중계산' },
    { id: 2, card_id: 200, alias: '응력검토' },
  ],
  links: [{ id: 1, from_node_id: 1, from_inner_node_id: 1, from_variable_id: 2,
            to_node_id: 2, to_inner_node_id: 2, to_variable_id: 11 }],
}

const cardNode = { id: 90, card_id: 200, alias: '뒷검토' }
const nestNode = { id: 91, sub_workflow: inner, alias: '앞단' }

const workflow = { id: 9, nodes: [cardNode, nestNode], links: [] }

describe('어느 자리가 워크플로인가', () => {
  it('하위 워크플로가 실린 노드만 센다', () => {
    expect(nestedIds(workflow)).toEqual(new Set(['91']))
  })

  it('노드가 없어도 터지지 않는다', () => {
    expect(nestedIds(null)).toEqual(new Set())
  })
})

describe('배선이 닿는 자리 이름', () => {
  const nested = nestedIds(workflow)

  it('카드 자리는 변수 id 하나다', () => {
    const link = { to_node_id: 90, to_inner_node_id: 90, to_variable_id: 12 }
    expect(handleAt(link, 'to', nested)).toBe('12')
  })

  it('워크플로 자리는 안쪽 자리까지 적는다', () => {
    const link = { to_node_id: 91, to_inner_node_id: 2, to_variable_id: 12 }
    expect(handleAt(link, 'to', nested)).toBe('2:12')
  })

  it('보내는 쪽도 같은 규칙이다', () => {
    const link = { from_node_id: 91, from_inner_node_id: 2, from_variable_id: 14 }
    expect(handleAt(link, 'from', nested)).toBe('2:14')
  })

  it('옛 자료라 안쪽 칸이 비어 있으면 노드 자신으로 본다', () => {
    // 마이그레이션 전에 만들어진 연결이 화면을 깨지 않아야 한다.
    const link = { to_node_id: 91, to_variable_id: 12 }
    expect(handleAt(link, 'to', nested)).toBe('91:12')
  })
})

describe('자리 이름을 도로 푼다', () => {
  it('카드 자리는 노드 자신을 안쪽으로 적는다', () => {
    // 비워 두면 「한 입력에 연결 하나」 를 지키는 DB 유일 제약이 조용히
    // 풀린다 — Postgres 에서 NULL 끼리는 부딪히지 않기 때문이다.
    expect(parseSlot('12', 90)).toEqual({ inner: 90, variable: 12 })
  })

  it('워크플로 자리는 둘로 갈린다', () => {
    expect(parseSlot('2:14', 91)).toEqual({ inner: 2, variable: 14 })
  })

  it('손잡이에서 나온 이름은 그대로 되돌아온다', () => {
    const nested = nestedIds(workflow)
    const link = { to_node_id: 91, to_inner_node_id: 2, to_variable_id: 12 }
    const back = parseSlot(handleAt(link, 'to', nested), link.to_node_id)
    expect(back).toEqual({ inner: 2, variable: 12 })
  })
})

describe('노드의 칸 목록', () => {
  it('카드 자리는 그 카드의 입력이다', () => {
    expect(slotsOf(cardNode, CARDS, 'input').map(v => v.key)).toEqual(['11', '12'])
  })

  it('워크플로 자리는 얼굴이다 — 이미 채워지는 칸은 빠진다', () => {
    // 하중계산.F 가 응력검토.Fin 을 채우므로 11 은 얼굴에 없다.
    expect(slotsOf(nestNode, CARDS, 'input').map(v => v.key))
      .toEqual(['1:1', '2:12'])
  })

  it('안쪽 중간값은 내놓지 않는다', () => {
    const keys = slotsOf(nestNode, CARDS, 'output').map(v => v.key)
    expect(keys).toContain('2:14')
    expect(keys).not.toContain('2:13')
  })

  it('안쪽 어느 카드의 칸인지 이름에 적는다', () => {
    // 같은 이름이 안에 셋이면 이것이 유일한 구분이다.
    const [first] = slotsOf(nestNode, CARDS, 'input')
    expect(first.label).toBe('하중계산 · 무게 (m)')
    expect(first.unit).toBe('kg')
  })

  it('자리 이름은 손잡이와 같은 글자다', () => {
    // 표에서 이은 연결과 순서도에서 이은 연결이 서버에 같은 모양으로 닿는다.
    const nested = nestedIds(workflow)
    const [face] = slotsOf(nestNode, CARDS, 'output')
    const { inner: i, variable } = parseSlot(face.key, nestNode.id)
    const link = { from_node_id: 91, from_inner_node_id: i, from_variable_id: variable }
    expect(handleAt(link, 'from', nested)).toBe(face.key)
  })

  it('노드가 없으면 빈 목록이다', () => {
    expect(slotsOf(undefined, CARDS, 'input')).toEqual([])
  })
})
