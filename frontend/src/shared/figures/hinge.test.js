/**
 * 힌지 토크 도해.
 *
 * 이 도해의 이유는 최악각이 직관과 반대라는 것이다 — 활짝 연 각이 아니라
 * 막 열리기 시작하는 낮은 각. 그리고 90° 에서 방향이 뒤집힌다는 것.
 */

import { describe, expect, it } from 'vitest'
import hinge from './hinge'

const noteOf = (values) => hinge.build(values).notes.join(' | ')
const dimFor = (b, symbol) => b.dims.find(d => d.symbol === symbol)

describe('토크와 각도', () => {
  it('필요 토크가 W·Lg·cosθ 그대로다', () => {
    // 15 × 120 × cos105° = 465.8
    expect(noteOf({ W: 15, Lg: 120, theta: 105 })).toContain('465.8')
  })

  it('최악각은 낮은 각이라고, 그 값(W·Lg)까지 말한다', () => {
    // **이 시험이 이 파일의 이유다.**
    const text = noteOf({ W: 15, Lg: 120, theta: 105 })
    expect(text).toContain('막 열리기 시작하는 낮은 각')
    expect(text).toContain('1800')
  })

  it('90° 를 넘으면 방향이 뒤집힌다고 말한다', () => {
    expect(noteOf({ W: 15, Lg: 120, theta: 105 })).toContain('뒤로')
    expect(noteOf({ W: 15, Lg: 120, theta: 60 })).not.toContain('뒤로')
  })

  it('축 바로 위(θ ≈ 90°)에서는 0 을 지난다고 말하고 팔 치수를 접는다', () => {
    const b = hinge.build({ W: 15, Lg: 120, theta: 91 })
    expect(b.notes.some(n => n.includes('0 을 지나며'))).toBe(true)
    expect(dimFor(b, 'a')).toBeUndefined()
  })
})

describe('힌지 토크 판정', () => {
  it('최악각 이상이면 어느 각도에서도 버틴다', () => {
    expect(noteOf({ W: 15, Lg: 120, theta: 105, Tf: 2000 }))
      .toContain('어느 각도에서도 버팁니다')
  })

  it('이 각도는 버텨도 최악각에 못 미치면 그 사실을 말한다', () => {
    expect(noteOf({ W: 15, Lg: 120, theta: 105, Tf: 1000 }))
      .toContain('스르르 닫힙니다')
  })

  it('이 각도조차 못 버티면 미끄러진다고 말한다', () => {
    expect(noteOf({ W: 15, Lg: 120, theta: 105, Tf: 300 }))
      .toContain('이미 미끄러집니다')
  })

  it('한 손 개폐의 상한을 늘 말한다', () => {
    expect(noteOf({ W: 15, Lg: 120 })).toContain('한 손 개폐')
  })
})

describe('그림', () => {
  const b = hinge.build({ W: 15, Lg: 120, theta: 105, Tf: 2000 })

  it('수평 팔 치수가 |Lg·cosθ| 다 — 구한 값', () => {
    expect(dimFor(b, 'a').value).toBeCloseTo(120 * Math.abs(Math.cos(Math.PI * 105 / 180)), 1)
  })

  it('무게 화살표가 무게중심에서 아래로 내린다', () => {
    const f = b.flows[0]
    expect(f.label).toBe('W')
    expect(f.x1).toBe(f.x2)
    expect(f.y2).toBeGreaterThan(f.y1)
    expect(f.x1).toBeCloseTo(120 * Math.cos(Math.PI * 105 / 180), 3)
  })

  it('Tf 를 주면 축에 회전 화살표가 붙는다', () => {
    expect(b.moments).toHaveLength(1)
    expect(b.moments[0].label).toContain('2000')
    expect(hinge.build({ W: 15, Lg: 120 }).moments).toHaveLength(0)
  })

  it('열림각을 벗어나면 눌러 그리고 그렇다고 적는다', () => {
    const b2 = hinge.build({ W: 15, Lg: 120, theta: 200 })
    expect(b2.ok).toBe(true)
    expect(b2.notes.some(n => n.includes('170'))).toBe(true)
  })
})

describe('값이 아직 없을 때', () => {
  it('기호만 적고 판정하지 않는다', () => {
    const b = hinge.build({ W: 15 })
    expect(b.example).toBe(true)
    expect(b.missing).toEqual(['Lg'])
    expect(b.tags.some(t => t.text === 'Lg')).toBe(true)
    expect(b.notes.some(n => n.includes('≈'))).toBe(false)
  })
})
