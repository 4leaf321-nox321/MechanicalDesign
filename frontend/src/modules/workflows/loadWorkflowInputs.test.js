import { describe, expect, it } from 'vitest'
import { describeLoad, mapWorkflowInputs } from './loadWorkflowInputs'

const CARDS = {
  100: [
    { id: 1, category: 'input', symbol: 'm', name: '무게' },
    { id: 2, category: 'output', symbol: 'F', name: '하중' },
  ],
  200: [
    { id: 11, category: 'input', symbol: 'Fin', name: '입력하중' },
    { id: 12, category: 'input', symbol: 'A', name: '단면적' },
    { id: 13, category: 'output', symbol: 'sig', name: '응력' },
  ],
}

const workflow = () => ({
  nodes: [
    { id: 1, card_id: 100, alias: '하중계산', inputs: {} },
    { id: 2, card_id: 200, alias: '응력검토', inputs: {} },
  ],
  links: [{ id: 1, from_node_id: 1, from_variable_id: 2,
            to_node_id: 2, to_variable_id: 11 }],
})

const record = (inputs, nodes) => ({
  inputs,
  definition_snapshot: {
    nodes: nodes || [
      { id: 1, card_id: 100, alias: '하중계산' },
      { id: 2, card_id: 200, alias: '응력검토' },
    ],
    links: [],
    cards: { 100: CARDS[100], 200: CARDS[200] },
  },
})

describe('mapWorkflowInputs', () => {
  it('노드마다 값을 제자리에 넣는다', () => {
    const got = mapWorkflowInputs(
      record({ 1: { 1: 50 }, 2: { 12: 25 } }), workflow(), CARDS, new Set())
    expect(got.byNode).toEqual({ 1: { 1: 50 }, 2: { 12: 25 } })
    expect(got.matched).toBe(2)
    expect(got.missing).toEqual([])
  })

  it('연결로 채워지는 입력은 불러오지 않는다', () => {
    // 채워 넣으면 화면에는 숫자가 보이는데 계산에는 안 쓰인다 — 고쳐도 아무
    // 일이 안 일어나는 칸이 되는 것이 이 화면 최악의 실패다.
    const got = mapWorkflowInputs(
      record({ 2: { 11: 999, 12: 25 } }), workflow(), CARDS, new Set())
    expect(got.byNode).toEqual({ 2: { 12: 25 } })
    expect(got.skipped).toEqual(["'응력검토' 의 입력하중"])
  })

  it('되먹임 입력은 불러온다 — 그건 사람이 주는 초기 추정값이다', () => {
    const wf = workflow()
    wf.links.push({ id: 2, from_node_id: 2, from_variable_id: 13,
                    to_node_id: 1, to_variable_id: 1 })
    const got = mapWorkflowInputs(
      record({ 1: { 1: 50 } }), wf, CARDS, new Set(['2']))
    expect(got.byNode).toEqual({ 1: { 1: 50 } })
    expect(got.skipped).toEqual([])
  })

  it('노드를 뺐다 다시 넣어 id 가 달라져도 별칭으로 찾는다', () => {
    const wf = workflow()
    wf.nodes[1] = { id: 77, card_id: 200, alias: '응력검토', inputs: {} }
    wf.links = []
    const got = mapWorkflowInputs(record({ 2: { 12: 25 } }), wf, CARDS, new Set())
    expect(got.byNode).toEqual({ 77: { 12: 25 } })
  })

  it('변수 id 가 달라져도 그때의 기호로 찾는다', () => {
    // 변수를 지웠다 다시 만들면 기호는 같고 id 만 달라진다.
    const cards = { ...CARDS, 200: [{ id: 99, category: 'input', symbol: 'A', name: '단면적' },
                                    { id: 13, category: 'output', symbol: 'sig', name: '응력' }] }
    const wf = workflow()
    wf.links = []
    const got = mapWorkflowInputs(record({ 2: { 12: 25 } }), wf, cards, new Set())
    expect(got.byNode).toEqual({ 2: { 99: 25 } })
  })

  it('없어진 노드는 이름을 대며 말한다', () => {
    const wf = workflow()
    wf.nodes = [wf.nodes[0]]
    wf.links = []
    const got = mapWorkflowInputs(record({ 2: { 12: 25 } }), wf, CARDS, new Set())
    expect(got.matched).toBe(0)
    expect(got.missing).toEqual(["'응력검토' 노드"])
  })

  it('없어진 변수는 어느 노드의 것인지까지 말한다', () => {
    // 워크플로에는 같은 카드가 두 번 놓이기도 한다. 노드 이름이 없으면 못 짚는다.
    const cards = { ...CARDS, 200: [{ id: 13, category: 'output', symbol: 'sig', name: '응력' }] }
    const wf = workflow()
    wf.links = []
    const got = mapWorkflowInputs(record({ 2: { 12: 25 } }), wf, cards, new Set())
    expect(got.missing).toEqual(["'응력검토' 의 단면적"])
  })

  it('계산되는 칸은 기록에 섞여 있어도 넣지 않는다', () => {
    const wf = workflow()
    wf.links = []
    const got = mapWorkflowInputs(record({ 1: { 2: 500 } }), wf, CARDS, new Set())
    expect(got.byNode).toEqual({})
    expect(got.matched).toBe(0)
  })

  it('0 도 값이다', () => {
    const wf = workflow()
    wf.links = []
    const got = mapWorkflowInputs(record({ 1: { 1: 0 } }), wf, CARDS, new Set())
    expect(got.byNode).toEqual({ 1: { 1: 0 } })
  })
})

describe('describeLoad', () => {
  it('채운 것과 못 찾은 것을 함께 말한다', () => {
    // 조용한 실패보다 시끄러운 성공이 낫다 — 여덟 칸만 채워졌는데 아무 말이
    // 없으면, 나머지 둘이 옛 값인지 빈 값인지 모른 채 계산한다.
    const got = describeLoad({ matched: 8, missing: ["'A' 의 x"], skipped: [] })
    expect(got.warn).toBe(true)
    expect(got.text).toContain('8개')
    expect(got.text).toContain('못 찾은 1개')
  })

  it('건너뛴 것도 밝힌다', () => {
    const got = describeLoad({ matched: 3, missing: [], skipped: ['a', 'b'] })
    expect(got.warn).toBe(false)
    expect(got.text).toContain('건너뛰었습니다')
  })

  it('가져올 것이 없으면 그렇다고 한다', () => {
    expect(describeLoad({ matched: 0, missing: [], skipped: [] }).warn).toBe(true)
  })
})
