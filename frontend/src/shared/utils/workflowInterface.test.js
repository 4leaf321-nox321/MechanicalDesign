import { describe, expect, it } from 'vitest'
import {
  cardIdsWithin, contains, workflowInterface,
} from './workflowInterface'

const CARDS = {
  100: [
    { id: 1, category: 'input', symbol: 'm', name: '무게' },
    { id: 2, category: 'output', symbol: 'F', name: '하중' },
  ],
  200: [
    { id: 11, category: 'input', symbol: 'Fin', name: '입력하중' },
    { id: 12, category: 'input', symbol: 'A', name: '단면적' },
    { id: 13, category: 'intermediate', symbol: 'mid', name: '중간값' },
    { id: 14, category: 'output', symbol: 'sig', name: '응력' },
  ],
}

/** 하중 → 응력 이 이어진 워크플로. */
const chain = () => ({
  id: 1,
  nodes: [
    { id: 1, card_id: 100, alias: '하중계산' },
    { id: 2, card_id: 200, alias: '응력검토' },
  ],
  links: [{ id: 1, from_node_id: 1, from_variable_id: 2,
            to_node_id: 2, to_variable_id: 11 }],
})

describe('workflowInterface', () => {
  it('배선이 안 붙은 입력만 밖으로 드러난다', () => {
    // Fin 은 앞 노드가 채우므로 밖에서 받을 필요가 없다.
    const { inputs } = workflowInterface(chain(), CARDS)
    expect(inputs.map(i => i.label)).toEqual(['무게 (m)', '단면적 (A)'])
  })

  it('아무 데도 안 보내는 노드의 결과가 출력이다', () => {
    const { outputs } = workflowInterface(chain(), CARDS)
    expect(outputs.map(o => o.label)).toEqual(['응력 (sig)'])
  })

  it('중간값은 내보내지 않는다', () => {
    // 카드 안에서 쓰라고 둔 값이라, 밖으로 내면 그 카드의 속을 다른 워크플로가
    // 들여다보게 된다.
    const { outputs } = workflowInterface(chain(), CARDS)
    expect(outputs.map(o => o.label)).not.toContain('중간값 (mid)')
  })

  it('자리를 노드와 변수 두 값으로 가리킨다', () => {
    // 같은 카드가 두 자리에 놓이면 변수 id 가 똑같다. 변수 id 만으로는 못 짚는다.
    const wf = {
      id: 1,
      nodes: [
        { id: 1, card_id: 200, alias: '상부' },
        { id: 2, card_id: 200, alias: '하부' },
      ],
      links: [],
    }
    const { inputs } = workflowInterface(wf, CARDS)
    const area = inputs.filter(i => i.variableId === 12)
    expect(area).toHaveLength(2)
    expect(area.map(a => a.nodeId)).toEqual([1, 2])
    expect(area.map(a => a.path.at(-1))).toEqual(['상부', '하부'])
  })

  it('배선을 바꾸면 얼굴이 곧바로 따라 바뀐다', () => {
    // 사람이 골라 둔 목록이면 여기서 낡는다 — 연결 하나를 이었을 뿐인데
    // 바깥은 여전히 그 칸을 채우라고 하고, 채운 값은 무시된다.
    const wf = chain()
    expect(workflowInterface(wf, CARDS).inputs).toHaveLength(2)

    wf.nodes.push({ id: 3, card_id: 100, alias: '면적계산' })
    wf.links.push({ id: 2, from_node_id: 3, from_variable_id: 2,
                    to_node_id: 2, to_variable_id: 12 })
    const after = workflowInterface(wf, CARDS)
    expect(after.inputs.map(i => i.label)).toEqual(['무게 (m)', '무게 (m)'])
  })
})

describe('중첩된 워크플로의 얼굴', () => {
  const nested = () => ({
    id: 9,
    nodes: [
      { id: 10, sub_workflow: chain(), alias: '앞단' },
      { id: 11, card_id: 200, alias: '뒷검토' },
    ],
    links: [],
  })

  it('안쪽 얼굴이 그대로 밖으로 올라온다', () => {
    const { inputs } = workflowInterface(nested(), CARDS)
    expect(inputs.filter(i => i.outerNodeId === 10).map(i => i.label))
      .toEqual(['무게 (m)', '단면적 (A)'])
  })

  it('어느 층을 거쳐 왔는지 이름에 남는다', () => {
    // 「하중 (F)」 만 있으면 같은 이름이 셋일 때 어느 것인지 알 수 없다.
    const { inputs } = workflowInterface(nested(), CARDS)
    const deep = inputs.find(i => i.outerNodeId === 10)
    expect(deep.path).toEqual(['앞단', '하중계산'])
  })

  it('안쪽 자리로 배선하면 그 자리는 얼굴에서 빠진다', () => {
    const wf = nested()
    // 뒷검토의 결과를 앞단 **안의** 하중계산.무게 로 보낸다.
    wf.links.push({
      id: 5, from_node_id: 11, from_variable_id: 14,
      to_node_id: 10, to_inner_node_id: 1, to_variable_id: 1,
    })
    const { inputs } = workflowInterface(wf, CARDS)
    expect(inputs.filter(i => i.outerNodeId === 10).map(i => i.label))
      .toEqual(['단면적 (A)'])
  })

  it('값을 내보내는 중첩 노드는 결론이 아니다', () => {
    const wf = nested()
    wf.links.push({ id: 6, from_node_id: 10, from_variable_id: 14,
                    from_inner_node_id: 2, to_node_id: 11, to_variable_id: 11 })
    const { outputs } = workflowInterface(wf, CARDS)
    expect(outputs.every(o => o.outerNodeId === 11)).toBe(true)
  })
})

describe('층을 넘는 순환', () => {
  it('품고 있으면 알아본다', () => {
    const inner = { id: 2, nodes: [], links: [] }
    const outer = { id: 1, nodes: [{ id: 1, sub_workflow: inner }], links: [] }
    expect(contains(outer, 2)).toBe(true)
    expect(contains(outer, 3)).toBe(false)
  })

  it('몇 겹이든 파고든다', () => {
    const deep = { id: 3, nodes: [], links: [] }
    const mid = { id: 2, nodes: [{ id: 1, sub_workflow: deep }], links: [] }
    const outer = { id: 1, nodes: [{ id: 1, sub_workflow: mid }], links: [] }
    expect(contains(outer, 3)).toBe(true)
  })

  it('자료가 이미 망가져 있어도 멈춘다', () => {
    // 막아 두지만, DB 를 손으로 고친 경우에도 영영 돌면 안 된다.
    const a = { id: 1, nodes: [], links: [] }
    const b = { id: 2, nodes: [{ id: 1, sub_workflow: a }], links: [] }
    a.nodes.push({ id: 2, sub_workflow: b })
    expect(contains(a, 99)).toBe(false)
  })
})

describe('cardIdsWithin', () => {
  it('몇 층이든 카드를 다 모은다', () => {
    const wf = {
      id: 9,
      nodes: [
        { id: 10, sub_workflow: chain(), alias: '앞단' },
        { id: 11, card_id: 300, alias: '뒷검토' },
      ],
      links: [],
    }
    expect([...cardIdsWithin(wf)].sort()).toEqual([100, 200, 300])
  })
})
