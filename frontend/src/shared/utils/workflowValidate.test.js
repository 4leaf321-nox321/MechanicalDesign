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
  it('순환이면 거기서 멈추고 다른 검사는 하지 않는다', () => {
    // 순서가 없으면 나머지 검사는 순서가 있다고 보고 도는 것이라 뜻이 없다.
    const wf = wiring({}, {})
    wf.order = null
    const issues = validateWorkflow(wf, cards())

    expect(codes(issues)).toEqual(['cycle'])
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
