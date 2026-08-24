/**
 * DOE 목표 필터.
 *
 * **조용히 틀리는 것 셋.**
 *
 *   계산 실패한 칸    값이 없는데 '200 이하' 를 만족한 것으로 세면 안 된다
 *   부동소수 `=`      0.1+0.2 는 0.3 이 아니라서, 눈에 같은 값이 하나도 안 걸린다
 *   조건이 다 비었을 때  표가 통째로 사라지면 고장 난 것처럼 보인다
 */

import { describe, expect, it } from 'vitest'
import { applyConditions, constantInputs, isUsable, rangeOf } from './doeFilter'

const rows = [
  { t: 10, w: 50, sig: 240, mass: 4 },
  { t: 12, w: 50, sig: 200, mass: 4.8 },
  { t: 14, w: 50, sig: 171, mass: 5.6 },
  { t: 16, w: 50, sig: 150, mass: 6.4 },
]

describe('부등식', () => {
  it('이하', () => {
    const got = applyConditions(rows, [{ key: 'sig', op: 'lte', value: 200 }])
    expect(got.rows.map(r => r.t)).toEqual([12, 14, 16])
    expect(got.matched).toBe(3)
    expect(got.total).toBe(4)
  })

  it('이상', () => {
    const got = applyConditions(rows, [{ key: 'mass', op: 'gte', value: 5 }])
    expect(got.rows.map(r => r.t)).toEqual([14, 16])
  })

  it('범위 — 순서를 거꾸로 줘도 같다', () => {
    const a = applyConditions(rows, [{ key: 'sig', op: 'between', value: 170, value2: 210 }])
    const b = applyConditions(rows, [{ key: 'sig', op: 'between', value: 210, value2: 170 }])
    expect(a.rows.map(r => r.t)).toEqual([12, 14])
    expect(b.rows.map(r => r.t)).toEqual([12, 14])
  })

  it('조건 두 개는 둘 다 만족해야 한다', () => {
    const got = applyConditions(rows, [
      { key: 'sig', op: 'lte', value: 200 },
      { key: 'mass', op: 'lte', value: 5 },
    ])
    // 응력만 보면 셋인데 무게까지 보면 하나다 — 이것이 필터의 값어치다.
    expect(got.rows.map(r => r.t)).toEqual([12])
  })
})

describe('부동소수 등호', () => {
  it('곱셈으로 만들어진 격자 값도 = 로 걸린다', () => {
    // 0.1 * 3 === 0.30000000000000004. 정확히 같기를 요구하면 안 걸린다.
    const grid = [{ x: 0.1 * 3 }, { x: 0.5 }]
    const got = applyConditions(grid, [{ key: 'x', op: 'eq', value: 0.3 }])
    expect(got.matched).toBe(1)
  })
})

describe('판정할 수 없는 칸', () => {
  const messy = [
    { sig: 100 },
    { sig: null },          // 계산 실패
    { sig: '계산 안 됨' },
    { sig: [1, 2, 3] },     // 배열 결과
    { sig: 300 },
  ]

  it('값이 없는 행은 만족한 것으로 세지 않는다', () => {
    const got = applyConditions(messy, [{ key: 'sig', op: 'lte', value: 200 }])
    expect(got.matched).toBe(1)
    expect(got.rows[0].sig).toBe(100)
  })

  it('몇 개가 판정 불가였는지 따로 알려 준다', () => {
    // 조용히 버리면 "왜 조합이 줄었지" 를 알 수 없다.
    const got = applyConditions(messy, [{ key: 'sig', op: 'lte', value: 200 }])
    expect(got.skipped).toBe(3)
    expect(got.total).toBe(5)
  })
})

describe('빈 조건', () => {
  it.each([
    [[]],
    [[{ key: '', op: 'lte', value: 1 }]],
    [[{ key: 'sig', op: 'lte', value: '' }]],
    [[{ key: 'sig', op: 'between', value: 1, value2: '' }]],
  ])('%o → 표가 그대로 나온다', (conds) => {
    const got = applyConditions(rows, conds)
    expect(got.rows).toHaveLength(4)
    expect(got.matched).toBe(4)
  })

  it('쓸 만한 조건인지 판정', () => {
    expect(isUsable({ key: 'sig', op: 'lte', value: 0 })).toBe(true)
    expect(isUsable({ key: 'sig', op: 'lte', value: 'abc' })).toBe(false)
    expect(isUsable({ key: 'sig', op: 'between', value: 1, value2: 2 })).toBe(true)
    expect(isUsable(null)).toBe(false)
  })
})

describe('가능한 범위', () => {
  it('하나도 안 걸렸을 때 왜 그런지 말할 근거', () => {
    expect(rangeOf(rows, 'sig')).toEqual({ min: 150, max: 240 })
  })

  it('숫자가 하나도 없으면 null', () => {
    expect(rangeOf([{ sig: null }, { sig: 'x' }], 'sig')).toBe(null)
  })
})

describe('고정된 입력 찾기', () => {
  const keys = ['t', 'w', 'F']

  it('한 번도 안 변한 열만 고른다', () => {
    const got = constantInputs([
      { t: 10, w: 50, F: 6000 },
      { t: 12, w: 50, F: 6000 },
      { t: 14, w: 50, F: 6000 },
    ], keys)

    expect(got).toEqual([{ key: 'w', value: 50 }, { key: 'F', value: 6000 }])
  })

  it('전부 변하면 빈 목록', () => {
    const got = constantInputs([{ t: 1, w: 1, F: 1 }, { t: 2, w: 2, F: 2 }], keys)
    expect(got).toEqual([])
  })

  it('한 줄뿐이면 전부 고정으로 본다 — 실제로 변한 적이 없다', () => {
    const got = constantInputs([{ t: 10, w: 50, F: 6000 }], keys)
    expect(got.map(f => f.key)).toEqual(['t', 'w', 'F'])
  })

  it('숫자와 숫자꼴 문자열은 같은 값으로 본다', () => {
    // 고정값은 입력 칸에서 문자열로, 격자 값은 숫자로 들어오는 경로가 있다.
    const got = constantInputs([{ t: 10 }, { t: '10' }], ['t'])
    expect(got).toEqual([{ key: 't', value: 10 }])
  })

  it('배열 입력도 내용이 같으면 고정이다', () => {
    const got = constantInputs([{ L: [1, 2] }, { L: [1, 2] }], ['L'])
    expect(got).toHaveLength(1)
  })

  it('비어 있는 값끼리는 같다고 보지 않는다', () => {
    // null 이 반복되는 열을 '고정 = null' 로 보여 주면 무의미한 칩이 뜬다.
    expect(constantInputs([{ t: null }, { t: null }], ['t'])).toEqual([])
  })

  it('행이 없으면 빈 목록', () => {
    expect(constantInputs([], keys)).toEqual([])
  })
})
