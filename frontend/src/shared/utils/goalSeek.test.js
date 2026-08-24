/**
 * 역계산.
 *
 * 여기서 **조용히 틀리는 것**이 둘이다.
 *
 *   단조가 아닌 식   양 끝 부호만 보면 답이 둘인데 하나도 못 찾는다
 *   못 찾았을 때     "없습니다" 만으로는 범위를 넓힐지 포기할지 알 수 없다
 *
 * 설계 계산은 단조가 아닌 경우가 흔하다 — 좌굴·공진·최적점을 낀 식은 가운데가
 * 볼록하다. 그래서 훑고 나서 좁힌다.
 */

import { describe, expect, it } from 'vitest'
import { goalSeek } from './goalSeek'

/** x(=입력)에서 y(=출력)를 내는 카드. 수식은 카드 정의로 준다. */
const card = (formula) => [
  { id: 1, category: 'input', var_type: 'text', symbol: 'x', name: 'x' },
  { id: 2, category: 'output', var_type: 'formula', symbol: 'y', name: 'y', formula },
]

const seek = (formula, opts) =>
  goalSeek(card(formula), { 1: 0 }, { inputId: 1, outputId: 2, ...opts })

describe('단조 함수', () => {
  it('선형 — y = 2x 에서 y=10 이면 x=5', () => {
    const got = seek('2 * x', { target: 10, min: 0, max: 100 })
    expect(got.ok).toBe(true)
    expect(got.solutions).toHaveLength(1)
    expect(got.solutions[0].input).toBeCloseTo(5, 9)
    expect(got.solutions[0].output).toBeCloseTo(10, 9)
  })

  it('나눗셈 — y = 600 / x 에서 y=20 이면 x=30', () => {
    const got = seek('600 / x', { target: 20, min: 1, max: 100 })
    expect(got.solutions[0].input).toBeCloseTo(30, 8)
  })

  it('범위 끝에 정확히 걸린 답도 찾는다', () => {
    const got = seek('2 * x', { target: 0, min: 0, max: 10 })
    expect(got.ok).toBe(true)
    expect(got.solutions[0].input).toBeCloseTo(0, 9)
  })
})

describe('단조가 아닌 함수 — 답이 둘', () => {
  it('포물선에서 두 답을 모두 찾는다', () => {
    // y = x^2 에서 y = 25 → x = ±5. 양 끝(−10, 10)은 부호가 같아서
    // 이분법만으로는 **하나도** 못 찾는다.
    const got = seek('x ^ 2', { target: 25, min: -10, max: 10 })

    expect(got.ok).toBe(true)
    expect(got.solutions).toHaveLength(2)
    const xs = got.solutions.map((s) => s.input).sort((a, b) => a - b)
    expect(xs[0]).toBeCloseTo(-5, 6)
    expect(xs[1]).toBeCloseTo(5, 6)
  })

  it('꼭짓점 위 목표는 못 찾고, 가능한 범위를 알려 준다', () => {
    const got = seek('x ^ 2', { target: 200, min: -10, max: 10 })

    expect(got.ok).toBe(false)
    expect(got.reason).toBe('no-root')
    expect(got.achievable.min).toBeCloseTo(0, 6)
    expect(got.achievable.max).toBeCloseTo(100, 6)
    // 범위를 말해 주지 않으면 넓혀야 하는지 불가능한지 알 수 없다.
    expect(got.message).toContain('100')
  })
})

describe('안 되는 입력', () => {
  it.each([
    [{ target: 10, min: 'abc', max: 10 }, 'range'],
    [{ target: 10, min: 10, max: 0 }, 'range'],
    [{ target: 10, min: 0, max: 0 }, 'range'],
    [{ target: '', min: 0, max: 10 }, 'target'],
  ])('%o → %s', (opts, reason) => {
    const got = seek('2 * x', opts)
    expect(got.ok).toBe(false)
    expect(got.reason).toBe(reason)
  })

  it('계산이 통째로 안 되는 카드는 그렇다고 말한다', () => {
    const got = seek('없는기호 * x', { target: 10, min: 0, max: 10 })
    expect(got.ok).toBe(false)
    expect(got.reason).toBe('error')
  })
})

describe('중간에 계산이 깨지는 구간', () => {
  it('0으로 나누는 점을 건너뛰고 답을 찾는다', () => {
    // x=0 에서 div 가 실패한다. 그 점 때문에 전체가 실패하면 안 된다.
    const got = seek('600 / x', { target: 20, min: -50, max: 50 })
    expect(got.ok).toBe(true)
    expect(got.partial).toBe(true)
    expect(got.solutions.some((s) => Math.abs(s.input - 30) < 1e-6)).toBe(true)
  })
})

describe('다른 입력은 화면 값 그대로 쓴다', () => {
  it('고정 입력이 결과에 반영된다', () => {
    const vars = [
      { id: 1, category: 'input', var_type: 'text', symbol: 'x', name: 'x' },
      { id: 3, category: 'input', var_type: 'text', symbol: 'k', name: 'k' },
      { id: 2, category: 'output', var_type: 'formula', symbol: 'y', name: 'y',
        formula: 'k * x' },
    ]
    // k=4 로 고정했으니 y=20 이면 x=5.
    const got = goalSeek(vars, { 1: 0, 3: 4 },
                         { inputId: 1, outputId: 2, target: 20, min: 0, max: 100 })
    expect(got.solutions[0].input).toBeCloseTo(5, 8)
  })
})
