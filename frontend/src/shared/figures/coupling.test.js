/**
 * 플랜지 커플링 도해.
 *
 * 토크를 볼트가 나르는데 볼트가 힘을 받는 자리는 축 중심이 아니라 **볼트원
 * 반지름**이다 (`T = n·F·D/2`). 볼트를 벌릴수록 하나가 받는 힘이 준다 —
 * 숫자만 보면 `D` 가 바깥지름인지 볼트원인지도 안 보인다.
 */

import { describe, expect, it } from 'vitest'
import coupling from './coupling'

const circles = (b) => b.shapes.filter(s => s.type === 'circle')
const bolts = (b, r) => circles(b).filter(c => Math.abs(c.r - r) < 1e-9
                                               && (c.cx !== 0 || c.cy !== 0))
const dimFor = (b, symbol) => b.dims.find(d => d.symbol === symbol)

describe('볼트 배치', () => {
  const b = coupling.build({ D: 160, db: 16, n: 6, d: 60 })

  it('준 개수만큼, 볼트원 위에 고르게 놓인다', () => {
    const found = bolts(b, 8)
    expect(found).toHaveLength(6)
    for (const c of found) {
      expect(Math.hypot(c.cx, c.cy)).toBeCloseTo(80, 9)
    }
  })

  it('고르게 벌어져 있다', () => {
    const angles = bolts(b, 8)
      .map(c => Math.atan2(c.cy, c.cx))
      .map(a => (a + Math.PI * 2) % (Math.PI * 2))
      .sort((x, y) => x - y)
    for (let i = 1; i < angles.length; i += 1) {
      expect(angles[i] - angles[i - 1]).toBeCloseTo(Math.PI / 3, 6)
    }
  })

  it('볼트원은 **중심선**이다 — 재료의 경계가 아니다', () => {
    // 실선으로 그리면 살의 모서리처럼 보인다. 기어 피치원과 같은 이유다.
    const pitch = circles(b).find(c => c.role === 'center')
    expect(pitch).toBeDefined()
    expect(pitch.r).toBeCloseTo(80, 9)
  })

  it('개수를 볼트 치수에 붙인다 — 가운데에 이름표를 놓지 않는다', () => {
    // 가운데는 축 구멍 자리라 글자를 두면 얹힌다.
    expect(dimFor(b, 'db').label).toBe('6× Ø{}')
    expect(b.tags).toHaveLength(0)
  })

  it('너무 많으면 줄여 그리고 그렇다고 적는다', () => {
    const many = coupling.build({ D: 160, db: 10, n: 20 })
    expect(bolts(many, 5)).toHaveLength(12)
    expect(many.notes.some(t => t.includes('20') && t.includes('12'))).toBe(true)
  })
})

describe('치수와 말글', () => {
  const b = coupling.build({ D: 160, db: 16, n: 6, d: 60 })

  it('볼트원·볼트·축을 잰다', () => {
    expect(dimFor(b, 'D').value).toBe(160)
    expect(dimFor(b, 'db').value).toBe(16)
    expect(dimFor(b, 'd').value).toBe(60)
  })

  it('축 지름이 없으면 그 치수를 안 붙인다', () => {
    expect(dimFor(coupling.build({ D: 160, db: 16, n: 6 }), 'd')).toBeUndefined()
  })

  it('토크를 받는 반지름이 어디인지 말한다', () => {
    expect(b.notes.some(t => t.includes('볼트원 반지름'))).toBe(true)
  })

  it('토크가 있으면 회전 화살표를 그린다', () => {
    expect(b.moments).toHaveLength(0)
    expect(coupling.build({ D: 160, db: 16, n: 6, T: 9e5 }).moments).toHaveLength(1)
  })

  it('축이 커서 볼트가 안 들어가면 안 그린다', () => {
    const bad = coupling.build({ D: 100, db: 16, n: 6, d: 90 })
    expect(bad.ok).toBe(false)
    expect(bad.impossible).toContain('볼트')
  })
})

describe('값이 아직 없을 때', () => {
  it('보기 비율로 그리고 숫자를 안 적는다', () => {
    const b = coupling.build({ D: 160 })
    expect(b.example).toBe(true)
    expect(b.missing.sort()).toEqual(['db', 'n'])
    expect(b.dims.every(d => d.value === null)).toBe(true)
    // 개수도 지어내지 않는다.
    expect(dimFor(b, 'db').label).toBe('Ø{}')
  })
})
