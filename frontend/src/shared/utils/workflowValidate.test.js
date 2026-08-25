/**
 * 워크플로 검증.
 *
 * 카드가 **살아 있는 참조**라서 필요한 기능이다. 카드를 고치면 워크플로에 그대로
 * 반영되는 대신, 변수를 지우면 배선이 끊긴다. 끊긴 채로 조용히 도는 것이 이
 * 구조에서 가장 나쁜 실패다.
 *
 * **단위 검사가 여기서 제일 값어치가 크다.** 카드 안에서는 이미 잡고 있는데
 * 카드 사이는 아무도 안 보고 있었다. 배율 어긋남(N 자리에 kN)은 값이 1000배
 * 틀리는데 계산은 멀쩡히 돌고 숫자도 그럴듯해서, 사람도 잘 못 잡는다.
 */

import { describe, expect, it } from 'vitest'
import { validateWorkflow } from './workflowValidate'

/** 서버가 실어 보내는 unit_info 모양. 같은 차원은 대안 목록이 같다. */
const FORCE_N = { unit: 'N', factor: 1, alternatives: [{ unit: 'N' }, { unit: 'kN' }] }
const FORCE_KN = { unit: 'kN', factor: 1000, alternatives: [{ unit: 'N' }, { unit: 'kN' }] }
const TORQUE = { unit: 'N*m', factor: 1, alternatives: [{ unit: 'N*m' }, { unit: 'kN*m' }] }

const load = (unitInfo = FORCE_N) => ([
  { id: 1, category: 'input', var_type: 'text', symbol: 'm', name: '무게' },
  { id: 2, category: 'output', var_type: 'formula', symbol: 'F', name: '하중',
    formula: 'm * 10', unit: unitInfo?.unit || '', unit_info: unitInfo },
])
const stress = (unitInfo = FORCE_N) => ([
  { id: 11, category: 'input', var_type: 'text', symbol: 'Fin', name: '입력하중',
    unit: unitInfo?.unit || '', unit_info: unitInfo },
  { id: 12, category: 'input', var_type: 'text', symbol: 'A', name: '단면적' },
  { id: 13, category: 'output', var_type: 'formula', symbol: 'sig', name: '응력',
    formula: 'Fin / A' },
])

const wiring = (loadInputs = { 1: 50 }, stressInputs = { 12: 25 }) => ({
  nodes: [
    { id: 1, card_id: 100, alias: '하중계산', inputs: loadInputs },
    { id: 2, card_id: 200, alias: '응력검토', inputs: stressInputs },
  ],
  links: [{ id: 1, from_node_id: 1, from_variable_id: 2, from_label: '하중 (F)',
            to_node_id: 2, to_variable_id: 11, to_label: '입력하중 (Fin)' }],
  order: [1, 2],
})

const cards = (fromUnit, toUnit) => ({ 100: load(fromUnit), 200: stress(toUnit) })

const codes = (issues) => issues.map(i => i.code)

describe('문제가 없으면', () => {
  it('빈 목록', () => {
    expect(validateWorkflow(wiring(), cards())).toEqual([])
  })
})

describe('단위', () => {
  it('배율이 어긋나면 몇 배인지 말한다', () => {
    // kN 을 N 칸에 보낸다. 값이 1000배 틀리는데 계산은 멀쩡히 돈다.
    const issues = validateWorkflow(wiring(), cards(FORCE_KN, FORCE_N))
    expect(codes(issues)).toEqual(['unit-scale'])
    expect(issues[0].level).toBe('warning')
    expect(issues[0].message).toContain('1000')
  })

  it('차원이 다르면 오류다', () => {
    // 토크를 힘에 꽂는 실수. 배율이 아니라 아예 다른 물리량이다.
    const issues = validateWorkflow(wiring(), cards(TORQUE, FORCE_N))
    expect(codes(issues)).toEqual(['unit-dimension'])
    expect(issues[0].level).toBe('error')
  })

  it('단위가 같으면 아무 말도 안 한다', () => {
    expect(validateWorkflow(wiring(), cards(FORCE_N, FORCE_N))).toEqual([])
  })

  it('단위를 안 적었으면 맞다고 단정하지 않고 건너뛴다고 알린다', () => {
    // 빈 칸은 '무차원' 이 아니라 '안 적었다' 이다.
    const issues = validateWorkflow(wiring(), cards(null, FORCE_N))
    expect(codes(issues)).toEqual(['unit-unknown'])
    expect(issues[0].level).toBe('warning')
  })

  it('양쪽 다 안 적었으면 조용하다', () => {
    expect(validateWorkflow(wiring(), cards(null, null))).toEqual([])
  })
})

describe('끊긴 연결', () => {
  it('보내는 변수가 사라지면 이름을 대며 말한다', () => {
    // 연결 행은 남아 있다(외래키를 안 걸었다). 그래서 무엇을 가리키던 것인지
    // 이름 사본으로 말할 수 있다.
    const broken = { 100: load().filter(v => v.id !== 2), 200: stress() }
    const issues = validateWorkflow(wiring(), broken)

    expect(issues.some(i => i.code === 'broken-link')).toBe(true)
    expect(issues.find(i => i.code === 'broken-link').message).toContain('하중 (F)')
  })

  it('받는 변수가 사라져도 말한다', () => {
    const broken = { 100: load(), 200: stress().filter(v => v.id !== 11) }
    const issues = validateWorkflow(wiring(), broken)
    expect(issues.find(i => i.code === 'broken-link').message).toContain('입력하중 (Fin)')
  })
})

describe('안 채워진 입력', () => {
  it('연결도 없고 값도 없으면 알린다', () => {
    const issues = validateWorkflow(wiring({}, { 12: 25 }), cards())
    expect(codes(issues)).toEqual(['empty-input'])
    expect(issues[0].message).toContain('무게')
  })

  it('연결이 있는 입력은 비어 있어도 괜찮다', () => {
    // Fin 은 저장값이 없지만 앞 노드가 채운다.
    const issues = validateWorkflow(wiring({ 1: 50 }, { 12: 25 }), cards())
    expect(issues).toEqual([])
  })

  it('0 은 값이다 — 비었다고 하지 않는다', () => {
    const issues = validateWorkflow(wiring({ 1: 0 }, { 12: 0 }), cards())
    expect(issues).toEqual([])
  })

  it('빈 배열은 비어 있는 것으로 본다', () => {
    const issues = validateWorkflow(wiring({ 1: [] }, { 12: 25 }), cards())
    expect(codes(issues)).toEqual(['empty-input'])
  })
})

describe('돌릴 수 없는 상태', () => {
  it('순환은 오류가 아니라 반복 블록이다', () => {
    // 서로 물고 있는 모델은 기계 설계에 실제로 있다. 막는 대신 돌려서 수렴시킨다.
    const wf = wiring({ 1: 50 }, { 12: 25 })
    wf.links.push({ id: 2, from_node_id: 2, from_variable_id: 13,
                    from_label: '응력 (sig)',
                    to_node_id: 1, to_variable_id: 1, to_label: '무게 (m)' })

    const issues = validateWorkflow(wf, cards())
    expect(issues.filter(i => i.level === 'error')).toEqual([])
    expect(codes(issues)).toContain('loop')
  })

  it('되먹임 입력에 초기 추정값이 없으면 오류다', () => {
    // 고리는 어딘가에서 시작해야 한다. 시작할 숫자가 없으면 아무 데서도
    // 출발하지 못하고, 그것을 말해 주지 않으면 사람은 왜 안 도는지 모른다.
    const wf = wiring({}, { 12: 25 })
    wf.links.push({ id: 2, from_node_id: 2, from_variable_id: 13,
                    from_label: '응력 (sig)',
                    to_node_id: 1, to_variable_id: 1, to_label: '무게 (m)' })

    const issues = validateWorkflow(wf, cards())
    const seed = issues.find(i => i.code === 'no-seed')
    expect(seed.level).toBe('error')
    expect(seed.node_id).toBe(1)
    expect(seed.variable_id).toBe(1)
    expect(seed.message).toContain('초기 추정값')
  })

  it('노드가 없으면 그것부터 말한다', () => {
    const issues = validateWorkflow({ nodes: [], links: [], order: [] }, cards())
    expect(codes(issues)).toEqual(['empty'])
  })

  it('카드가 휴지통에 있으면 오류다', () => {
    const wf = wiring()
    wf.nodes[0].card_deleted = true
    const issues = validateWorkflow(wf, cards())

    expect(issues.some(i => i.code === 'card-trashed')).toBe(true)
    expect(issues.find(i => i.code === 'card-trashed').level).toBe('error')
  })
})

/**
 * 자리에 워크플로가 놓였을 때.
 *
 * 검증이 중첩을 모르면 **정상인 것을 오류라고 말한다** — 배선이 가리키는 칸을
 * 못 찾아 전부 「끊긴 연결」이 되고, 오류가 있으면 계산을 안 하므로 워크플로가
 * 통째로 멎는다. 잘못된 오류가 오류를 안 내는 것보다 나은 것도 아니다.
 */
describe('중첩 자리', () => {
  const inner = () => ({
    id: 7,
    nodes: [
      { id: 1, card_id: 100, alias: '하중계산', inputs: { 1: 50 } },
      { id: 2, card_id: 200, alias: '응력검토', inputs: { 12: 25 } },
    ],
    links: [{ id: 1, from_node_id: 1, from_inner_node_id: 1, from_variable_id: 2,
              from_label: '하중 (F)',
              to_node_id: 2, to_inner_node_id: 2, to_variable_id: 11,
              to_label: '입력하중 (Fin)' }],
  })

  /** 중첩 자리 하나 + 그 안쪽 칸으로 값을 보내는 카드 하나. */
  const outer = () => ({
    nodes: [
      { id: 90, sub_workflow: inner(), alias: '앞단',
        inputs: { '1:1': 50, '2:12': 25 } },
      { id: 91, card_id: 100, alias: '다른 하중', inputs: { 1: 3 } },
    ],
    links: [{ id: 5, from_node_id: 91, from_inner_node_id: 91, from_variable_id: 2,
              from_label: '하중 (F)',
              to_node_id: 90, to_inner_node_id: 2, to_variable_id: 12,
              to_label: '단면적 (A)' }],
    order: [91, 90],
  })

  it('안쪽 자리로 들어가는 배선을 끊겼다고 하지 않는다', () => {
    const issues = validateWorkflow(outer(), cards())
    expect(issues.filter(i => i.code === 'broken-link')).toEqual([])
    expect(issues.some(i => i.level === 'error')).toBe(false)
  })

  it('배선이 채우는 안쪽 칸은 비었다고 하지 않는다', () => {
    // 이 경고가 뜨면, 채울 수 없는 칸을 채우라는 말이 되어 사람이 헤맨다.
    const issues = validateWorkflow(outer(), cards())
    const empty = issues.filter(i => i.code === 'empty-input')
    expect(empty.map(i => i.variable_id)).not.toContain('2:12')
  })

  it('안쪽 빈 칸은 자리 이름으로 짚어 준다', () => {
    const wf = outer()
    delete wf.nodes[0].inputs['1:1']
    const issues = validateWorkflow(wf, cards())
    const empty = issues.find(i => i.code === 'empty-input' && i.node_id === 90)
    expect(empty.variable_id).toBe('1:1')
    // 안에 같은 이름이 여럿일 수 있어, 어느 카드의 칸인지까지 적어야 한다.
    expect(empty.message).toContain('하중계산')
  })

  it('안쪽 칸에도 단위 검사가 그대로 걸린다', () => {
    // 중첩 뒤로 숨는 순간 이 검사가 빠지면, 값만 1000배 틀리고 계산은 멀쩡히
    // 도는 고장이 자리 안에서 조용히 일어난다.
    const wf = outer()
    // 안쪽 배선을 걷어 '응력검토.입력하중' 을 얼굴로 끌어낸 뒤, 밖에서 kN 을
    // N 자리에 꽂는다.
    wf.nodes[0].sub_workflow.links = []
    wf.links[0].to_inner_node_id = 2
    wf.links[0].to_variable_id = 11
    wf.links[0].to_label = '입력하중 (Fin)'
    const issues = validateWorkflow(wf, { 100: load(FORCE_KN), 200: stress(FORCE_N) })
    expect(issues.some(i => i.code === 'unit-scale')).toBe(true)
  })

  it('얼굴 밖을 가리키는 배선은 끊긴 배선이다', () => {
    // 안쪽 중간값은 손잡이가 없다. 거기로 간 선은 실제로 갈 곳이 없다.
    const wf = outer()
    wf.links[0].to_inner_node_id = 2
    wf.links[0].to_variable_id = 11        // 이미 안에서 채워지는 칸
    const issues = validateWorkflow(wf, cards())
    expect(issues.some(i => i.code === 'broken-link')).toBe(true)
  })

  it('워크플로가 휴지통에 있으면 오류다', () => {
    const wf = outer()
    wf.nodes[0].sub_workflow_deleted = true
    const issues = validateWorkflow(wf, cards())
    const found = issues.find(i => i.code === 'workflow-trashed')
    expect(found.level).toBe('error')
    expect(found.node_id).toBe(90)
  })
})
