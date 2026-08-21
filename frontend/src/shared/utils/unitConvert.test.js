/**
 * 입력 단위 환산.
 *
 * **여기서 틀리면 1000배 틀린 값이 조용히 저장된다.** 화면에는 "1.5 kN" 이라고
 * 보이는데 계산에는 1.5 N 이 들어가는 식이다. 오류가 나지 않으므로 아무도
 * 알아채지 못하고, 그 값이 그대로 설계에 들어간다.
 *
 * 그래서 되돌아오는지(round trip)까지 확인한다.
 */

import { describe, expect, it } from 'vitest'

import { formatNumber, fromDeclared, hasChoices, toDeclared } from './unitConvert'

/** 서버가 변수와 함께 내려보내는 모양. */
const NEWTON = {
  unit: 'N',
  factor: 1,
  alternatives: [
    { unit: 'N', factor: 1 },
    { unit: 'kgf', factor: 9.80665 },
    { unit: 'kN', factor: 1000 },
  ],
}

const MM = {
  unit: 'mm',
  factor: 0.001,
  alternatives: [
    { unit: 'mm', factor: 0.001 },
    { unit: 'cm', factor: 0.01 },
    { unit: 'm', factor: 1 },
  ],
}

describe('넣은 값 → 선언 단위', () => {
  it('같은 단위면 그대로', () => {
    expect(toDeclared('1500', NEWTON, 'N')).toBe(1500)
  })

  it('kN 으로 넣으면 N 으로 바뀐다 — 이 한 줄이 이 기능의 전부다', () => {
    expect(toDeclared('1.5', NEWTON, 'kN')).toBe(1500)
  })

  it('선언 단위가 SI 가 아니어도 맞는다', () => {
    // mm 로 선언된 변수에 m 로 넣으면 1 m = 1000 mm.
    expect(toDeclared('1', MM, 'm')).toBe(1000)
    expect(toDeclared('2.5', MM, 'cm')).toBe(25)
  })

  it('kgf 처럼 딱 떨어지지 않는 배율도', () => {
    expect(toDeclared('1', NEWTON, 'kgf')).toBeCloseTo(9.80665, 9)
  })
})

describe('선언 단위 → 보일 글자', () => {
  it('N 값을 kN 으로 보인다', () => {
    expect(fromDeclared(1500, NEWTON, 'kN')).toBe('1.5')
  })

  it('**부동소수점 찌꺼기가 칸에 뜨면 안 된다**', () => {
    // 다듬지 않으면 '1.4999999999999998' 이 나오고, 사용자는 자기가 잘못
    // 넣은 줄 안다.
    expect(fromDeclared(1500, NEWTON, 'kN')).not.toContain('4999')
  })

  it('되돌아온다', () => {
    for (const [value, unit] of [[1500, 'kN'], [37, 'kgf'], [0.25, 'kN']]) {
      const shown = fromDeclared(value, NEWTON, unit)
      expect(toDeclared(shown, NEWTON, unit)).toBeCloseTo(value, 9)
    }
  })
})

describe('아직 다 안 친 값', () => {
  it.each(['', '-', 'abc', '1e'])('숫자가 아닌 %o 는 건드리지 않는다', (text) => {
    // 타이핑 도중에 값이 멋대로 변하면 글자를 지울 수도 없게 된다.
    expect(toDeclared(text, NEWTON, 'kN')).toBe(text)
  })

  it("'1.' 처럼 치다 만 숫자는 숫자로 본다", () => {
    // 자바스크립트가 1 로 읽는 값이고, 실제로 1 kN 을 친 것이 맞다.
    // 화면에 보이는 글자는 사용자가 친 그대로 남으므로 이어서 칠 수 있다.
    expect(toDeclared('1.', NEWTON, 'kN')).toBe(1000)
  })

  it('빈 값은 빈 값으로', () => {
    expect(fromDeclared('', NEWTON, 'kN')).toBe('')
    expect(fromDeclared(null, NEWTON, 'kN')).toBe('')
  })
})

describe('단위 정보가 없을 때', () => {
  it('환산하지 않고 그대로 둔다', () => {
    // 단위를 안 적었거나 서버가 못 읽은 변수. 짐작해서 곱하면 그게 사고다.
    expect(toDeclared('1.5', null, 'kN')).toBe('1.5')
    expect(fromDeclared(1500, null, 'kN')).toBe('1500')
  })

  it('모르는 단위를 고르면 그대로 둔다', () => {
    expect(toDeclared('1.5', NEWTON, 'MN')).toBe('1.5')
  })
})

describe('고를 것이 있는가', () => {
  it.each([
    [NEWTON, true],
    [{ unit: '%', factor: 0.01, alternatives: [{ unit: '%', factor: 0.01 }] }, false],
    [null, false],
    [undefined, false],
  ])('hasChoices %#', (info, want) => {
    expect(hasChoices(info)).toBe(want)
  })
})

describe('숫자 다듬기', () => {
  it.each([
    [1.4999999999999998, '1.5'],
    [0.30000000000000004, '0.3'],
    [1500, '1500'],
    [0, '0'],
    [1e-7, '1e-7'],
  ])('formatNumber(%o) → %o', (value, want) => {
    expect(formatNumber(value)).toBe(want)
  })

  it('유효숫자를 함부로 버리지 않는다', () => {
    // 12자리까지는 살린다. 실제 계산 정밀도를 깎으면 안 된다.
    expect(formatNumber(1.23456789012)).toBe('1.23456789012')
  })
})
