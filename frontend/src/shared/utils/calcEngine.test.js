/**
 * 카드 계산 절차.
 *
 * 이 절차는 세 곳이 함께 쓴다 — 카드 화면의 계산 버튼, DOE 러너, 서버 검증.
 * 예전에는 앞의 둘이 각자 복사본을 갖고 있었고, 그런 상태에서는 한쪽만 고쳐
 * **"화면에서는 되는데 DOE 에서는 다른 값"** 이 나와도 알아채기 어렵다.
 */

import { describe, expect, it } from 'vitest'

import { calculateCard, defaultInputValue, hasDefinition } from './calcEngine'

const input = (id, symbol, extra = {}) =>
  ({ id, symbol, name: symbol, category: 'input', var_type: 'text', ...extra })
const formula = (id, symbol, expr, category = 'output') =>
  ({ id, symbol, name: symbol, category, var_type: 'formula', formula: expr })

describe('계산 순서', () => {
  it('입력 → 중간값 → 결과값', () => {
    const vars = [
      input(1, 'A'),
      formula(2, 'M', 'A * 2', 'intermediate'),
      formula(3, 'R', 'M + 1'),
    ]
    const { results } = calculateCard(vars, { 1: 5 })
    expect(results[2].value).toBe(10)
    expect(results[3].value).toBe(11)
  })

  it('중간값이 서로를 참조해도 순서를 스스로 찾는다', () => {
    // 정의 순서가 계산 순서와 반대다. 한 번만 훑으면 M2 를 못 푼다.
    const vars = [
      input(1, 'A'),
      formula(2, 'M2', 'M1 + 1', 'intermediate'),
      formula(3, 'M1', 'A * 2', 'intermediate'),
      formula(4, 'R', 'M2 * 10'),
    ]
    const { results } = calculateCard(vars, { 1: 5 })
    expect(results[3].value).toBe(10)
    expect(results[2].value).toBe(11)
    expect(results[4].value).toBe(110)
  })

  it('순환 참조는 멈추고 오류를 남긴다 — 무한 반복하지 않는다', () => {
    const vars = [
      formula(1, 'X', 'Y + 1', 'intermediate'),
      formula(2, 'Y', 'X + 1', 'intermediate'),
    ]
    const { results } = calculateCard(vars, {})
    expect(results[1].value).toBeNull()
    expect(results[2].value).toBeNull()
  })

  it('정의가 없으면 사유를 남기고 넘어간다', () => {
    const vars = [
      input(1, 'A'),
      { id: 2, symbol: 'T', name: 'T', category: 'output', var_type: 'table', table_data: '' },
      formula(3, 'R', 'A + 1'),
    ]
    const { results } = calculateCard(vars, { 1: 5 })
    expect(results[2].error).toBe('테이블 정의 없음')
    // 하나가 실패해도 나머지는 계산된다.
    expect(results[3].value).toBe(6)
  })
})

describe('입력값', () => {
  it('값을 안 주면 기본값을 쓴다', () => {
    const vars = [
      input(1, 'A', { var_type: 'slider', min_value: 3, max_value: 10 }),
      formula(2, 'R', 'A * 2'),
    ]
    expect(calculateCard(vars, {}).results[2].value).toBe(6)
  })

  it('배열 입력이 그대로 전달된다', () => {
    const vars = [
      input(1, 'L', { var_type: 'array' }),
      formula(2, 'S', 'sum(L)'),
      formula(3, 'E', 'mul(L, 2)'),
    ]
    const { results } = calculateCard(vars, { 1: [1, 2, 3] })
    expect(results[2].value).toBe(6)
    expect(results[3].value).toEqual([2, 4, 6])
  })

  it('기호가 없는 입력은 수식에서 못 쓴다', () => {
    const vars = [
      { id: 1, symbol: '', name: '이름만', category: 'input', var_type: 'text' },
      formula(2, 'R', 'A + 1'),
    ]
    expect(calculateCard(vars, { 1: 5 }).results[2].error).toBe('알 수 없는 이름: A')
  })
})

describe('보조 함수', () => {
  it.each([
    [{ var_type: 'formula', formula: 'A' }, true],
    [{ var_type: 'formula', formula: '' }, false],
    [{ var_type: 'table', table_data: '{}' }, true],
    [{ var_type: 'table', table_data: '' }, false],
    [{ var_type: 'conditional', conditional_data: '{}' }, true],
    [{ var_type: 'interp_table', interp_data: '{}' }, true],
  ])('hasDefinition %o → %s', (v, want) => {
    expect(hasDefinition(v)).toBe(want)
  })

  it('기본값', () => {
    expect(defaultInputValue({ var_type: 'array' })).toEqual([])
    expect(defaultInputValue({ var_type: 'slider', min_value: 7 })).toBe(7)
    expect(defaultInputValue({ var_type: 'dropdown', options_data: '["a","b"]' })).toBe('a')
    expect(defaultInputValue({ var_type: 'text' })).toBe('')
  })
})
