/**
 * 리브 도해.
 *
 * 이 도해의 이유는 싱크마크가 리브 쪽이 아니라 **반대쪽 면**에 난다는 것이다.
 * 결함 위치가 그림에서 리브의 반대편에 있는지를 좌표로 잰다.
 */

import { describe, expect, it } from 'vitest'
import rib from './rib'

const dimFor = (b, symbol) => b.dims.find(d => d.symbol === symbol)

describe('싱크마크의 자리', () => {
  const b = rib.build({ t: 2.5, tr: 1.25, H: 6 })

  it('리브는 아래(y > t), 싱크마크 표시는 위 면(y ≈ 0)에 있다', () => {
    // **이 시험이 이 파일의 이유다.** 같은 쪽에 그리면 도해가 거짓말을 한다.
    const ribRect = b.shapes.filter(s => s.type === 'rect')[1]
    expect(ribRect.y).toBeCloseTo(2.5, 6)
    const dip = b.shapes.find(s => s.type === 'path' && s.d.includes('Q'))
    const ys = dip.d.match(/-?[\d.]+/g).map(Number)
    expect(ys[1]).toBeCloseTo(0, 6)                   // 위 면에서 시작해
    expect(ys[3]).toBeGreaterThan(0)                  // 살 안쪽으로 꺼진다
  })

  it('외관면이라는 말이 붙는다', () => {
    expect(b.tags.some(t => t.text.includes('외관면'))).toBe(true)
    expect(b.notes.some(n => n.includes('반대쪽'))).toBe(true)
  })
})

describe('비율 판정', () => {
  it('0.6 배 이하면 범위 안이라고 말한다', () => {
    const b = rib.build({ t: 2.5, tr: 1.25 })
    expect(b.notes.some(n => n.includes('tr/t = 0.5'))).toBe(true)
  })

  it('0.6 배를 넘으면 싱크마크 경고가 나온다', () => {
    const b = rib.build({ t: 2.5, tr: 2 })
    expect(b.notes.some(n => n.includes('0.8 배') && n.includes('싱크마크')))
      .toBe(true)
  })

  it('리브가 몸살의 3 배보다 높으면 나눠 세우라고 말한다', () => {
    const tall = rib.build({ t: 2, tr: 1, H: 9 })
    expect(tall.notes.some(n => n.includes('나눠'))).toBe(true)
    const okay = rib.build({ t: 2, tr: 1, H: 5 })
    expect(okay.notes.some(n => n.includes('나눠'))).toBe(false)
  })
})

describe('치수', () => {
  it('셋 다 준 값 그대로다', () => {
    const b = rib.build({ t: 2.5, tr: 1.25, H: 6 })
    expect(dimFor(b, 't').value).toBe(2.5)
    expect(dimFor(b, 'tr').value).toBe(1.25)
    expect(dimFor(b, 'H').value).toBe(6)
  })

  it('높이를 안 주면 그리되 치수를 안 붙인다', () => {
    const b = rib.build({ t: 2.5, tr: 1.25 })
    expect(dimFor(b, 'H')).toBeUndefined()
    expect(b.notes.some(n => n.includes('2.5 배로 그렸습니다'))).toBe(true)
  })
})

describe('값이 아직 없을 때', () => {
  it('보기 비율로 그리고 숫자를 안 적는다', () => {
    const b = rib.build({ t: 2.5 })
    expect(b.example).toBe(true)
    expect(b.dims.every(d => d.value === null)).toBe(true)
  })
})
