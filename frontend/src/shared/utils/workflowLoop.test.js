/**
 * 반복 블록을 실행기 전체로 통과시켜 본다.
 *
 * 여기서 지키는 것: **수렴하지 못한 블록은 답을 내놓지 않는다.** 마지막 숫자를
 * 돌려주면 그럴듯한 값이 아무 표시 없이 결과로 흘러가고, 그 순간 이 기능은
 * 조용히 틀린 답을 내는 장치가 된다.
 */

import { describe, expect, it } from 'vitest'
import { STATUS, runWorkflow } from './workflowEngine'

// 축 지름이 자중을 낳고, 자중이 하중을 키워, 다시 축 지름을 바꾼다.
// 수식으로 못 푸는 음함수 — 돌려서 수렴시킨다.
const CARDS = {
  // 카드 A: 하중 → 축 지름
  100: [
    { id: 11, name: '하중', symbol: 'F', category: 'input', var_type: 'text' },
    {
      id: 12, name: '축지름', symbol: 'd', category: 'output',
      var_type: 'formula', formula: 'pow(F, 1/3) * 4',
    },
  ],
  // 카드 B: 축 지름 → 자중을 더한 하중
  200: [
    { id: 21, name: '축지름', symbol: 'd', category: 'input', var_type: 'text' },
    { id: 22, name: '외력', symbol: 'F0', category: 'input', var_type: 'text' },
    {
      id: 23, name: '하중', symbol: 'F', category: 'output',
      var_type: 'formula', formula: 'F0 + 0.02 * d * d',
    },
  ],
}

/**
 * 노드1(지름) ⇄ 노드2(하중) 고리.
 * `seed` 는 되먹임으로 들어오는 입력의 초기 추정값이다.
 */
function loopWorkflow(seed, extra = {}) {
  return {
    nodes: [
      { id: 1, card_id: 100, alias: '축지름', inputs: { 11: seed } },
      { id: 2, card_id: 200, alias: '하중', inputs: { 22: 1000 } },
    ],
    links: [
      { id: 1, from_node_id: 1, from_variable_id: 12, from_label: '축지름 (d)',
        to_node_id: 2, to_variable_id: 21, to_label: '축지름 (d)' },
      { id: 2, from_node_id: 2, from_variable_id: 23, from_label: '하중 (F)',
        to_node_id: 1, to_variable_id: 11, to_label: '하중 (F)' },
    ],
    ...extra,
  }
}

describe('반복 블록', () => {
  it('서로 물고 있어도 돌아서 수렴한다', () => {
    const got = runWorkflow(loopWorkflow(1000), CARDS)

    expect(got.ok).toBe(true)
    expect(got.nodes[1].status).toBe(STATUS.ok)
    expect(got.nodes[2].status).toBe(STATUS.ok)

    // 답이 실제로 고정점인가 — F = F0 + 0.02·d², d = 4·F^(1/3)
    const d = got.nodes[1].results[12].value
    const F = got.nodes[2].results[23].value
    expect(F).toBeCloseTo(1000 + 0.02 * d * d, 4)
    expect(d).toBeCloseTo(4 * Math.cbrt(F), 4)
  })

  it('반복 횟수와 잔차를 함께 남긴다', () => {
    // 남기지 않으면 나중에 그 결과가 수렴한 것이었는지 알 방법이 없다.
    const got = runWorkflow(loopWorkflow(1000), CARDS)
    expect(got.nodes[1].loop.converged).toBe(true)
    expect(got.nodes[1].loop.iterations).toBeGreaterThan(1)
    expect(got.nodes[1].loop.residual).toBeLessThan(1e-5)
    // 블록 안 두 노드가 같은 반복 정보를 갖는다 — 하나의 고리이므로.
    expect(got.nodes[2].loop).toEqual(got.nodes[1].loop)
  })

  it('초기 추정값이 없으면 돌지 않는다', () => {
    const wf = loopWorkflow(1000)
    wf.nodes[0].inputs = {}          // 되먹임으로 들어오는 F 의 시작값이 없다

    const got = runWorkflow(wf, CARDS)
    expect(got.nodes[1].status).toBe(STATUS.failed)
    expect(got.nodes[1].message).toContain('초기 추정값')
  })

  it('수렴하지 못하면 블록 전체가 실패하고 값을 남기지 않는다', () => {
    const got = runWorkflow(loopWorkflow(1000, { iter_max: 2 }), CARDS)

    expect(got.ok).toBe(false)
    expect(got.nodes[1].status).toBe(STATUS.failed)
    expect(got.nodes[2].status).toBe(STATUS.failed)
    // **여기가 핵심** — 안 잡힌 숫자가 결과로 새어 나가면 안 된다.
    expect(got.nodes[1].results).toEqual({})
    expect(got.nodes[2].results).toEqual({})
    expect(got.nodes[1].loop.converged).toBe(false)
  })

  it('수렴 못 한 고리 뒤의 노드는 저절로 막힌다', () => {
    // 반복을 위해 새 규칙을 만들지 않았다는 확인이다. 「앞이 실패하면 뒤는
    // 계산하지 않는다」 는 기존 규칙이 그대로 일을 한다.
    const wf = loopWorkflow(1000, { iter_max: 2 })
    wf.nodes.push({ id: 3, card_id: 200, alias: '뒷검토', inputs: { 22: 0 } })
    wf.links.push({ id: 3, from_node_id: 1, from_variable_id: 12,
                    from_label: '축지름 (d)',
                    to_node_id: 3, to_variable_id: 21, to_label: '축지름 (d)' })

    const got = runWorkflow(wf, CARDS)
    expect(got.nodes[3].status).toBe(STATUS.blocked)
  })

  it('고리 앞이 막히면 고리는 돌지도 않는다', () => {
    const wf = loopWorkflow(1000)
    wf.nodes.push({ id: 0, card_id: 100, alias: '앞', card_deleted: true, inputs: {} })
    wf.links.push({ id: 3, from_node_id: 0, from_variable_id: 12,
                    from_label: '축지름 (d)',
                    to_node_id: 2, to_variable_id: 22, to_label: '외력' })

    const got = runWorkflow(wf, CARDS)
    expect(got.nodes[1].status).toBe(STATUS.blocked)
    expect(got.nodes[2].status).toBe(STATUS.blocked)
  })

  it('완화계수를 낮추면 잡히는 고리가 있다', () => {
    // d = 4F^⅓ 대신 되먹임이 세게 튀도록 만든 고리.
    const cards = {
      ...CARDS,
      300: [
        { id: 31, name: 'x', symbol: 'x', category: 'input', var_type: 'text' },
        { id: 32, name: 'y', symbol: 'y', category: 'output',
          var_type: 'formula', formula: '1 - 2 * x' },
      ],
    }
    const wf = {
      nodes: [{ id: 1, card_id: 300, alias: '진동', inputs: { 31: 0 } }],
      links: [{ id: 1, from_node_id: 1, from_variable_id: 32, from_label: 'y',
                to_node_id: 1, to_variable_id: 31, to_label: 'x' }],
    }

    expect(runWorkflow({ ...wf, iter_max: 60 }, cards).ok).toBe(false)

    const relaxed = runWorkflow(
      { ...wf, iter_max: 300, iter_relaxation: 0.3 }, cards)
    expect(relaxed.ok).toBe(true)
    expect(relaxed.nodes[1].results[32].value).toBeCloseTo(1 / 3, 5)
  })

  it('순환이 없는 워크플로는 하나도 안 바뀐다', () => {
    // 반복을 넣으면서 평범한 워크플로가 달라지면 안 된다.
    const wf = {
      nodes: [
        { id: 1, card_id: 200, alias: '하중', inputs: { 21: 30, 22: 1000 } },
        { id: 2, card_id: 100, alias: '축지름', inputs: {} },
      ],
      links: [{ id: 1, from_node_id: 1, from_variable_id: 23, from_label: '하중 (F)',
                to_node_id: 2, to_variable_id: 11, to_label: '하중 (F)' }],
    }
    const got = runWorkflow(wf, CARDS)
    expect(got.ok).toBe(true)
    expect(got.nodes[1].results[23].value).toBe(1018)
    expect(got.nodes[2].results[12].value).toBeCloseTo(4 * Math.cbrt(1018), 6)
    expect(got.nodes[1].loop).toBeUndefined()
  })
})
