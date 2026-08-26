/**
 * 방열 핀 도해.
 *
 * 이 도해의 이유는 간격을 **실제 비율로** 그린다는 것이다. 굴뚝이 살았는지
 * 막혔는지를 눈이 판단하는 그림이라, 간격을 보기 좋게 부풀리는 순간 도해가
 * 있는 이유가 사라진다.
 */

import { describe, expect, it } from 'vitest'
import finArray from './finArray'

const fins = (b) => b.shapes.filter(s => s.type === 'rect').slice(1)
const dimFor = (b, symbol) => b.dims.find(d => d.symbol === symbol)

describe('간격이 실제 비율이다', () => {
  it('이웃 핀 사이가 정확히 s 다 — 부풀리지 않는다', () => {
    // **이 시험이 이 파일의 이유다.**
    for (const s of [3, 8, 14]) {
      const b = finArray.build({ s, t: 1.2, H: 35, n: 5 })
      const xs = fins(b).map(r => r.x).sort((a, c) => a - c)
      for (let i = 1; i < xs.length; i += 1) {
        expect(xs[i] - xs[i - 1]).toBeCloseTo(1.2 + s, 9)
      }
    }
  })

  it('핀 두께와 높이도 준 값 그대로다', () => {
    const b = finArray.build({ s: 8, t: 1.2, H: 35 })
    for (const r of fins(b)) {
      expect(r.w).toBeCloseTo(1.2, 9)
      expect(r.h).toBeCloseTo(35, 9)
    }
  })
})

describe('굴뚝', () => {
  const b = finArray.build({ s: 8, t: 1.2, H: 35, n: 8 })

  it('공기 화살표가 핀 사이에서 위로 떠오른다', () => {
    expect(b.flows.length).toBeGreaterThan(0)
    for (const f of b.flows) {
      expect(f.y2).toBeLessThan(f.y1)                 // SVG 는 위가 음수
      expect(f.x1).toBe(f.x2)
    }
    expect(b.flows.some(f => f.label === '공기')).toBe(true)
  })

  it('화살표가 정말 틈 한가운데에 있다', () => {
    const xs = fins(b).map(r => r.x)
    for (const f of b.flows) {
      const inGap = xs.some(x => Math.abs(f.x1 - (x + 1.2 + 4)) < 1e-6)
      expect(inGap, `x=${f.x1}`).toBe(true)
    }
  })

  it('촘촘함의 함정을 말한다', () => {
    expect(b.notes.some(n => n.includes('오히려 식지 않습니다'))).toBe(true)
  })
})

describe('핀 수', () => {
  it('준 만큼 그린다', () => {
    expect(fins(finArray.build({ s: 8, t: 1.2, H: 35, n: 5 }))).toHaveLength(5)
  })

  it('너무 많으면 줄여 그리고 그렇다고 적는다', () => {
    const b = finArray.build({ s: 8, t: 1.2, H: 35, n: 30 })
    expect(fins(b)).toHaveLength(12)
    expect(b.notes.some(n => n.includes('30') && n.includes('12'))).toBe(true)
  })

  it('안 주면 6장으로 그리고 그렇다고 적는다', () => {
    const b = finArray.build({ s: 8, t: 1.2, H: 35 })
    expect(fins(b)).toHaveLength(6)
    expect(b.notes.some(n => n.includes('6장으로'))).toBe(true)
  })
})

describe('값이 아직 없을 때', () => {
  it('보기 비율로 그리고 숫자를 안 적는다', () => {
    const b = finArray.build({ s: 8 })
    expect(b.example).toBe(true)
    expect(b.dims.every(d => d.value === null)).toBe(true)
  })

  it('치수 셋이 준 값 그대로다', () => {
    const b = finArray.build({ s: 8, t: 1.2, H: 35 })
    expect(dimFor(b, 's').value).toBe(8)
    expect(dimFor(b, 't').value).toBe(1.2)
    expect(dimFor(b, 'H').value).toBe(35)
  })
})
