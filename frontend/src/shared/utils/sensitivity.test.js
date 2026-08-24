/**
 * 민감도.
 *
 * **조용히 틀리는 것 셋.**
 *
 *   기준값이 0 인 변수   0 의 10% 는 0 이라, 늘 "영향 없음" 으로 나온다
 *   한쪽만 계산되는 식   반대쪽 실패를 0 으로 세면 없는 변화를 지어낸다
 *   비어 있는 입력       기본값 0 으로 읽혀 엉뚱한 순위가 나온다
 */

import { describe, expect, it } from 'vitest'
import { sensitivity, stepFor } from './sensitivity'

/** sig = F / A * k — F 가 가장 세게, k 가 그다음, A 는 반대 방향. */
const card = [
  { id: 1, category: 'input', var_type: 'text', symbol: 'F', name: '하중' },
  { id: 2, category: 'input', var_type: 'text', symbol: 'A', name: '단면적' },
  { id: 3, category: 'input', var_type: 'text', symbol: 'k', name: '계수' },
  { id: 4, category: 'output', var_type: 'formula', symbol: 'sig', name: '응력',
    formula: 'F / A * k' },
]

describe('순위', () => {
  it('영향이 큰 것부터 정렬한다', () => {
    const got = sensitivity(card, { 1: 600, 2: 30, 3: 2 }, 4, 10)

    expect(got.ok).toBe(true)
    expect(got.base).toBeCloseTo(40, 9)
    // A 는 분모라 같은 10% 라도 폭이 더 크다.
    expect(got.rows[0].variable.symbol).toBe('A')
    expect(got.rows.map(r => r.variable.symbol).sort()).toEqual(['A', 'F', 'k'])
  })

  it('가장 큰 것 대비 비율을 함께 준다', () => {
    const got = sensitivity(card, { 1: 600, 2: 30, 3: 2 }, 4, 10)
    expect(got.rows[0].share).toBe(1)
    expect(got.rows[1].share).toBeGreaterThan(0)
    expect(got.rows[1].share).toBeLessThanOrEqual(1)
  })

  it('방향을 알 수 있다 — 분모는 키우면 결과가 준다', () => {
    const got = sensitivity(card, { 1: 600, 2: 30, 3: 2 }, 4, 10)
    const a = got.rows.find(r => r.variable.symbol === 'A')
    expect(a.highDelta).toBeLessThan(0)   // A 를 키우면 응력이 내려간다
    expect(a.lowDelta).toBeGreaterThan(0)
    const f = got.rows.find(r => r.variable.symbol === 'F')
    expect(f.highDelta).toBeGreaterThan(0)
  })
})

describe('기준값이 0 인 변수', () => {
  const offset = [
    { id: 1, category: 'input', var_type: 'slider', symbol: 'x', name: 'x',
      min_value: 0, max_value: 100 },
    { id: 2, category: 'output', var_type: 'formula', symbol: 'y', name: 'y',
      formula: 'x * 3' },
  ]

  it('퍼센트로는 안 움직이므로 범위로 흔든다', () => {
    // 0 의 10% 는 0. 그대로 두면 x 가 "영향 없음" 으로 나오는데, 사람은 정말
    // 영향이 없다고 믿는다.
    const got = sensitivity(offset, { 1: 0 }, 2, 10)
    expect(got.rows[0].step).toBeCloseTo(10, 9)   // 범위 100 의 10%
    expect(got.rows[0].span).toBeGreaterThan(0)
  })

  it('범위도 없으면 절대량으로라도 흔든다', () => {
    const noRange = [{ id: 1, category: 'input', var_type: 'text', symbol: 'x', name: 'x' }]
    expect(stepFor(noRange[0], 0, 10)).toBeGreaterThan(0)
  })

  it('값이 있으면 퍼센트를 쓴다', () => {
    expect(stepFor(offset[0], 50, 10)).toBeCloseTo(5, 9)
  })
})

describe('흔들면 깨지는 식', () => {
  const div = [
    { id: 1, category: 'input', var_type: 'text', symbol: 'x', name: 'x' },
    { id: 2, category: 'output', var_type: 'formula', symbol: 'y', name: 'y',
      formula: '100 / x' },
  ]

  it('한쪽만 계산되면 그쪽만 쓰고 표시한다', () => {
    // x=1 에서 ±100% 면 아래쪽이 0 → 0으로 나누기. 그 실패를 0 으로 세면
    // 없는 변화를 지어내게 된다.
    const got = sensitivity(div, { 1: 1 }, 2, 100)
    expect(got.ok).toBe(true)
    expect(got.rows[0].oneSided).toBe(true)
    expect(got.rows[0].lowDelta).toBe(0)
  })

  it('양쪽 다 안 되면 순위에서 빼고 이유를 남긴다', () => {
    const broken = [
      { id: 1, category: 'input', var_type: 'text', symbol: 'x', name: 'x' },
      { id: 2, category: 'input', var_type: 'text', symbol: 'z', name: 'z' },
      { id: 3, category: 'output', var_type: 'formula', symbol: 'y', name: 'y',
        formula: 'x + z' },
    ]
    const got = sensitivity(broken, { 1: 5 }, 3, 10)
    // z 가 비어 있어 계산 자체가 안 된다.
    expect(got.ok).toBe(false)
    expect(got.reason).toBe('base')
  })
})

describe('흔들 수 없는 입력', () => {
  const mixed = [
    { id: 1, category: 'input', var_type: 'text', symbol: 'x', name: 'x' },
    { id: 2, category: 'input', var_type: 'dropdown', symbol: 'm', name: '재질',
      options_data: '["SS400"]' },
    { id: 3, category: 'input', var_type: 'array', symbol: 'L', name: '길이들' },
    { id: 4, category: 'output', var_type: 'formula', symbol: 'y', name: 'y',
      formula: 'x * 2' },
  ]

  it('드롭다운·배열은 사이값이 없어 빠지고, 이유가 남는다', () => {
    const got = sensitivity(mixed, { 1: 5 }, 4, 10)
    expect(got.rows.map(r => r.variable.symbol)).toEqual(['x'])
    expect(got.skipped.map(s => s.variable.symbol).sort()).toEqual(['L', 'm'])
    expect(got.skipped[0].why).toBeTruthy()
  })

  it('비어 있는 숫자 입력은 0 으로 치지 않고 빼 둔다', () => {
    const two = [
      { id: 1, category: 'input', var_type: 'text', symbol: 'x', name: 'x' },
      { id: 2, category: 'input', var_type: 'text', symbol: 'q', name: 'q' },
      { id: 3, category: 'output', var_type: 'formula', symbol: 'y', name: 'y',
        formula: 'x * 2' },
    ]
    const got = sensitivity(two, { 1: 5 }, 3, 10)
    expect(got.rows.map(r => r.variable.symbol)).toEqual(['x'])
    expect(got.skipped.map(s => s.variable.symbol)).toEqual(['q'])
  })
})

describe('안 되는 입력', () => {
  it.each([0, -5, 'abc', ''])('흔들 폭 %s → 거부', (pct) => {
    const got = sensitivity(card, { 1: 600, 2: 30, 3: 2 }, 4, pct)
    expect(got.ok).toBe(false)
    expect(got.reason).toBe('percent')
  })
})
