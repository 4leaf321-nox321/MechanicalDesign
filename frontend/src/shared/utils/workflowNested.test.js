/**
 * 자리에 워크플로가 놓였을 때.
 *
 * 여기서 지키는 것 둘:
 *
 *   **얼굴만 내놓는다.** 안쪽 중간값까지 내보내면 다른 워크플로가 그 속을
 *   들여다보게 되고, 안을 고칠 때마다 바깥이 깨진다.
 *
 *   **안이 안 풀리면 이 자리는 실패다.** 그러면 「앞이 실패하면 뒤는 계산하지
 *   않는다」 는 규칙이 바깥에서 저절로 이어진다.
 */

import { describe, expect, it } from 'vitest'
import { STATUS, runWorkflow, slot } from './workflowEngine'

const CARDS = {
  100: [
    { id: 1, category: 'input', symbol: 'm', name: '무게', var_type: 'text' },
    { id: 2, category: 'output', symbol: 'F', name: '하중',
      var_type: 'formula', formula: 'm * 10' },
  ],
  200: [
    { id: 11, category: 'input', symbol: 'Fin', name: '입력하중', var_type: 'text' },
    { id: 12, category: 'input', symbol: 'A', name: '단면적', var_type: 'text' },
    { id: 13, category: 'intermediate', symbol: 'half', name: '절반',
      var_type: 'formula', formula: 'Fin / 2' },
    { id: 14, category: 'output', symbol: 'sig', name: '응력',
      var_type: 'formula', formula: 'Fin / A' },
  ],
}

/** 하중 → 응력. 자유 입력은 무게(m)와 단면적(A). */
const inner = (weight = 50, area = 25) => ({
  id: 7,
  nodes: [
    { id: 1, card_id: 100, alias: '하중계산', inputs: { 1: weight } },
    { id: 2, card_id: 200, alias: '응력검토', inputs: { 12: area } },
  ],
  links: [{ id: 1, from_node_id: 1, from_inner_node_id: 1, from_variable_id: 2,
            to_node_id: 2, to_inner_node_id: 2, to_variable_id: 11 }],
})

/** 그 워크플로를 한 자리에 넣은 바깥. */
const outer = (extra = {}) => ({
  id: 9,
  nodes: [{ id: 90, sub_workflow: inner(), alias: '앞단', inputs: {} }],
  links: [],
  ...extra,
})

describe('중첩 실행', () => {
  it('안쪽을 돌려 얼굴을 내놓는다', () => {
    const run = runWorkflow(outer(), CARDS)
    expect(run.ok).toBe(true)
    // 50 × 10 = 500, 500 / 25 = 20
    expect(run.nodes[90].results[slot(2, 14)].value).toBe(20)
  })

  it('중간값은 내놓지 않는다', () => {
    const run = runWorkflow(outer(), CARDS)
    expect(run.nodes[90].results[slot(2, 13)]).toBeUndefined()
  })

  it('밖에서 안쪽 자리로 값을 넣을 수 있다', () => {
    const wf = outer()
    const feeder = { id: 91, card_id: 100, alias: '다른 하중', inputs: { 1: 3 } }
    wf.nodes.push(feeder)
    // 다른 하중.F(=30) 를 앞단 **안의** 응력검토.A 로 보낸다.
    wf.links.push({
      id: 5,
      from_node_id: 91, from_inner_node_id: 91, from_variable_id: 2,
      to_node_id: 90, to_inner_node_id: 2, to_variable_id: 12,
    })

    const run = runWorkflow(wf, CARDS)
    expect(run.ok).toBe(true)
    // A 가 25 대신 30 이 된다 → 500 / 30
    expect(run.nodes[90].results[slot(2, 14)].value).toBeCloseTo(500 / 30, 9)
  })

  it('중첩의 결과를 밖의 카드가 받는다', () => {
    const wf = outer()
    wf.nodes.push({ id: 92, card_id: 200, alias: '뒷검토', inputs: { 12: 4 } })
    wf.links.push({
      id: 6,
      from_node_id: 90, from_inner_node_id: 2, from_variable_id: 14,
      to_node_id: 92, to_inner_node_id: 92, to_variable_id: 11,
    })

    const run = runWorkflow(wf, CARDS)
    expect(run.ok).toBe(true)
    expect(run.nodes[92].results[14].value).toBe(20 / 4)
  })

  it('안이 안 풀리면 이 자리가 실패하고, 무엇이 막혔는지 올린다', () => {
    // 단면적을 비우면 안쪽 응력검토가 0 으로 나눈다.
    const wf = outer()
    wf.nodes[0].sub_workflow = inner(50, 0)

    const run = runWorkflow(wf, CARDS)
    expect(run.ok).toBe(false)
    expect(run.nodes[90].status).toBe(STATUS.failed)
    // 「하위 워크플로 실패」 만으로는 어느 카드를 열어야 하는지 알 수 없다.
    expect(run.nodes[90].message).toContain('앞단')
    expect(run.nodes[90].message).toContain('계산되지')
  })

  it('실패한 중첩 뒤의 노드는 저절로 막힌다', () => {
    // 중첩을 위해 새 규칙을 만들지 않았다는 확인이다.
    const wf = outer()
    wf.nodes[0].sub_workflow = inner(50, 0)
    wf.nodes.push({ id: 92, card_id: 200, alias: '뒷검토', inputs: { 12: 4 } })
    wf.links.push({
      id: 6,
      from_node_id: 90, from_inner_node_id: 2, from_variable_id: 14,
      to_node_id: 92, to_inner_node_id: 92, to_variable_id: 11,
    })

    const run = runWorkflow(wf, CARDS)
    expect(run.nodes[92].status).toBe(STATUS.blocked)
  })

  it('휴지통에 든 워크플로 자리는 막힌다', () => {
    const wf = outer()
    wf.nodes[0].sub_workflow_deleted = true
    const run = runWorkflow(wf, CARDS)
    expect(run.nodes[90].status).toBe(STATUS.blocked)
    expect(run.nodes[90].message).toContain('워크플로가 휴지통')
  })

  it('너무 깊으면 멈춘다', () => {
    // 순환은 막지만 깊이 자체가 실수일 수 있다.
    let deep = { id: 1, nodes: [], links: [] }
    for (let i = 0; i < 15; i++) {
      deep = {
        id: i + 2,
        nodes: [{ id: 1000 + i, sub_workflow: deep, alias: `층${i}`, inputs: {} }],
        links: [],
      }
    }
    const run = runWorkflow(deep, CARDS)
    const messages = Object.values(run.nodes).map(n => n.message).join(' ')
    expect(messages).toContain('겹보다 깊습니다')
  })
})

describe('두 겹보다 깊을 때', () => {
  /** 안쪽 워크플로를 다시 한 겹 감싼 것. */
  const wrapped = () => ({
    id: 8,
    nodes: [{ id: 80, sub_workflow: inner(), alias: '가운데', inputs: {} }],
    links: [],
  })

  const twice = () => ({
    id: 9,
    nodes: [{ id: 90, sub_workflow: wrapped(), alias: '바깥', inputs: {} }],
    links: [],
  })

  it('맨 안쪽 결과가 두 겹을 뚫고 올라온다', () => {
    const run = runWorkflow(twice(), CARDS)
    expect(run.ok).toBe(true)
    // 자리 이름은 몇 겹이든 **맨 안쪽** 노드를 가리킨다.
    expect(run.nodes[90].results[slot(2, 14)].value).toBe(20)
  })

  it('맨 안쪽 자리에 밖에서 값을 넣을 수 있다', () => {
    // 층마다 한 칸씩 짚어 내려가지 않으면, 넣은 값이 아무 데도 안 닿고
    // **오류도 안 난다** — 조용히 옛 값으로 계산된 숫자가 나온다.
    const wf = twice()
    wf.nodes.push({ id: 91, card_id: 100, alias: '다른 하중', inputs: { 1: 3 } })
    wf.links.push({
      id: 5,
      from_node_id: 91, from_inner_node_id: 91, from_variable_id: 2,
      to_node_id: 90, to_inner_node_id: 2, to_variable_id: 12,
    })

    const run = runWorkflow(wf, CARDS)
    expect(run.ok).toBe(true)
    expect(run.nodes[90].results[slot(2, 14)].value).toBeCloseTo(500 / 30, 9)
  })
})

describe('중첩과 반복이 만날 때', () => {
  it('중첩 노드가 고리 안에 들어도 돈다', () => {
    // 앞단(중첩) 의 응력이 뒷검토로 가고, 뒷검토의 응력이 앞단 안의 단면적으로
    // 되돌아온다. 안쪽을 매 바퀴 다시 돌린다.
    const wf = {
      id: 9,
      nodes: [
        { id: 90, sub_workflow: inner(50, 25), alias: '앞단', inputs: {} },
        { id: 92, card_id: 200, alias: '뒷검토', inputs: { 12: 10 } },
      ],
      links: [
        { id: 1, from_node_id: 90, from_inner_node_id: 2, from_variable_id: 14,
          to_node_id: 92, to_inner_node_id: 92, to_variable_id: 11 },
        // 되돌아오는 선 — 앞단 안의 A 로.
        { id: 2, from_node_id: 92, from_inner_node_id: 92, from_variable_id: 14,
          to_node_id: 90, to_inner_node_id: 2, to_variable_id: 12 },
      ],
      iter_max: 200,
    }
    // 되먹임으로 들어오는 칸의 초기 추정값은 **바깥 노드**에 적는다.
    wf.nodes[0].inputs = { [slot(2, 12)]: 25 }

    const run = runWorkflow(wf, CARDS)
    expect(run.nodes[90].loop).toBeTruthy()
    // 잡히든 안 잡히든 **답이 아니면 값을 안 내놓는다** 는 규칙은 그대로다.
    if (!run.nodes[90].loop.converged) {
      expect(run.nodes[90].results).toEqual({})
    }
  })
})
