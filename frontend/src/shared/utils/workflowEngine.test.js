/**
 * 워크플로 실행.
 *
 * **가장 중요한 규칙 하나**: 앞 노드가 실패하면 뒤 노드를 계산하지 않는다.
 *
 * 그냥 돌리면 빠진 입력이 기본값(대개 0)으로 채워져 계산이 멀쩡히 돌고 숫자도
 * 그럴듯하게 나온다. 그 카드를 연 사람은 그것이 진짜 결과인 줄 안다 — 이 도구
 * 에서 나올 수 있는 가장 나쁜 실패다.
 */

import { describe, expect, it } from 'vitest'
import { STATUS, runWorkflow, terminalNodes } from './workflowEngine'

// 하중계산(무게 m → 하중 F) → 응력검토(입력하중 Fin, 단면적 A → 응력 sig)
const LOAD_VARS = [
  { id: 1, category: 'input', var_type: 'text', symbol: 'm', name: '무게' },
  { id: 2, category: 'output', var_type: 'formula', symbol: 'F', name: '하중',
    formula: 'm * 10' },
]
const STRESS_VARS = [
  { id: 11, category: 'input', var_type: 'text', symbol: 'Fin', name: '입력하중' },
  { id: 12, category: 'input', var_type: 'text', symbol: 'A', name: '단면적' },
  { id: 13, category: 'output', var_type: 'formula', symbol: 'sig', name: '응력',
    formula: 'Fin / A' },
]
const CARDS = { 100: LOAD_VARS, 200: STRESS_VARS }

const chain = (loadInputs, stressInputs) => ({
  nodes: [
    { id: 1, card_id: 100, alias: '하중계산', inputs: loadInputs },
    { id: 2, card_id: 200, alias: '응력검토', inputs: stressInputs },
  ],
  links: [{ id: 1, from_node_id: 1, from_variable_id: 2, from_label: '하중 (F)',
            to_node_id: 2, to_variable_id: 11, to_label: '입력하중 (Fin)' }],
  order: [1, 2],
})

describe('값이 흐른다', () => {
  it('앞 카드의 결과가 뒤 카드의 입력이 된다', () => {
    const got = runWorkflow(chain({ 1: 50 }, { 12: 25 }), CARDS)

    expect(got.ok).toBe(true)
    expect(got.nodes[1].results[2].value).toBe(500)      // 50 * 10
    // 손으로 적지 않았는데 500 이 들어와 있어야 한다.
    expect(got.nodes[2].values[11]).toBe(500)
    expect(got.nodes[2].results[13].value).toBe(20)      // 500 / 25
  })

  it('연결이 저장된 값을 이긴다', () => {
    // 앞 노드가 방금 계산한 값이 손으로 적어 둔 값보다 최신이다. 그렇지 않으면
    // 배선이 있으나 마나 해진다.
    const got = runWorkflow(chain({ 1: 50 }, { 11: 999, 12: 25 }), CARDS)
    expect(got.nodes[2].values[11]).toBe(500)
    expect(got.nodes[2].results[13].value).toBe(20)
  })

  it('화면에서 바꾼 값은 저장값을 이기고 연결에는 진다', () => {
    const wf = chain({ 1: 50 }, { 12: 25 })
    const got = runWorkflow(wf, CARDS, { 1: { 1: 80 }, 2: { 11: 7, 12: 40 } })

    expect(got.nodes[1].results[2].value).toBe(800)   // 덮은 무게 80
    expect(got.nodes[2].values[12]).toBe(40)          // 덮은 단면적
    expect(got.nodes[2].values[11]).toBe(800)         // 연결이 7 을 이긴다
  })
})

describe('앞이 실패하면 뒤를 계산하지 않는다', () => {
  it('막힌 노드는 blocked 이고 결과가 없다', () => {
    // 무게를 안 채웠다 → F 를 못 구한다 → 응력 노드는 돌리면 안 된다.
    const got = runWorkflow(chain({}, { 12: 25 }), CARDS)

    expect(got.ok).toBe(false)
    expect(got.nodes[2].status).toBe(STATUS.blocked)
    expect(got.nodes[2].results).toEqual({})
  })

  it('무엇 때문에 막혔는지 앞 노드 이름을 댄다', () => {
    // 이유를 안 남기면 사람은 이 노드의 입력을 채우려 들고, 고쳐야 할 곳은 앞이다.
    const got = runWorkflow(chain({}, { 12: 25 }), CARDS)

    expect(got.nodes[2].blockedBy.join()).toContain('하중계산')
    expect(got.nodes[2].message).toContain('앞 노드')
  })

  it('막힘은 사슬을 따라 번진다', () => {
    const wf = chain({}, { 12: 25 })
    wf.nodes.push({ id: 3, card_id: 200, alias: '2차검토', inputs: { 12: 5 } })
    wf.links.push({ id: 2, from_node_id: 2, from_variable_id: 13,
                    from_label: '응력 (sig)', to_node_id: 3, to_variable_id: 11 })
    wf.order = [1, 2, 3]

    const got = runWorkflow(wf, CARDS)
    expect(got.nodes[2].status).toBe(STATUS.blocked)
    expect(got.nodes[3].status).toBe(STATUS.blocked)
    expect(got.nodes[3].blockedBy.join()).toContain('응력검토')
  })

  it('**빠진 입력을 0 으로 채워 계산해 버리지 않는다**', () => {
    // 이 검사가 이 파일의 존재 이유다. 그냥 돌리면 Fin 이 빈 값이 되어
    // 계산이 실패하거나 0 으로 도는데, 어느 쪽이든 사람은 그것을 결과로 읽는다.
    const got = runWorkflow(chain({}, { 12: 25 }), CARDS)
    expect(got.nodes[2].results[13]).toBeUndefined()
  })
})

describe('노드 안에서 실패한 경우', () => {
  it('failed 로 표시하되 나온 값은 남긴다', () => {
    // 단면적이 0 이라 응력이 안 나온다. 그래도 이 노드의 다른 값은 살아 있다.
    const wf = chain({ 1: 50 }, { 12: 0 })
    const got = runWorkflow(wf, CARDS)

    expect(got.nodes[1].status).toBe(STATUS.ok)
    expect(got.nodes[2].status).toBe(STATUS.failed)
    expect(got.nodes[2].values[11]).toBe(500)
    expect(got.ok).toBe(false)
  })

  it('실패한 값을 받는 뒤 노드는 막힌다', () => {
    const wf = chain({ 1: 50 }, { 12: 0 })
    wf.nodes.push({ id: 3, card_id: 200, alias: '2차검토', inputs: { 12: 5 } })
    wf.links.push({ id: 2, from_node_id: 2, from_variable_id: 13,
                    from_label: '응력 (sig)', to_node_id: 3, to_variable_id: 11 })
    wf.order = [1, 2, 3]

    const got = runWorkflow(wf, CARDS)
    expect(got.nodes[3].status).toBe(STATUS.blocked)
  })
})

describe('돌릴 수 없는 워크플로', () => {
  it('순서가 없으면(순환) 아무것도 계산하지 않는다', () => {
    const wf = chain({ 1: 50 }, { 12: 25 })
    wf.order = null

    const got = runWorkflow(wf, CARDS)
    expect(got.ok).toBe(false)
    expect(got.reason).toBe('cycle')
    expect(got.nodes).toEqual({})
  })

  it('카드가 휴지통에 있으면 그 노드는 막힌다', () => {
    const wf = chain({ 1: 50 }, { 12: 25 })
    wf.nodes[0].card_deleted = true

    const got = runWorkflow(wf, CARDS)
    expect(got.nodes[1].status).toBe(STATUS.blocked)
    expect(got.nodes[2].status).toBe(STATUS.blocked)
  })

  it('노드가 없으면 성공이라고 하지 않는다', () => {
    // 빈 것을 '전부 성공' 으로 세면 화면이 초록불을 켠다.
    expect(runWorkflow({ nodes: [], links: [], order: [] }, CARDS).ok).toBe(false)
  })
})

describe('결론 노드', () => {
  it('아무 데로도 값을 보내지 않는 노드가 결론이다', () => {
    const wf = chain({ 1: 50 }, { 12: 25 })
    expect(terminalNodes(wf).map(n => n.alias)).toEqual(['응력검토'])
  })

  it('연결이 없으면 전부 결론이다', () => {
    const wf = chain({ 1: 50 }, { 12: 25 })
    wf.links = []
    expect(terminalNodes(wf)).toHaveLength(2)
  })
})
