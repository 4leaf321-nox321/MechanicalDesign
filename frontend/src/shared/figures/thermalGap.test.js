/**
 * 열팽창 틈 도해.
 *
 * 이 도해의 이유는 이 움직임이 상온 도면 어디에도 없다는 것이다 — 이종 재질의
 * 미는 양이 수치로 나오고, 한쪽만 고정하라는 처방이 그림에 있어야 한다.
 */

import { describe, expect, it } from 'vitest'
import thermalGap from './thermalGap'

const noteOf = (values) => thermalGap.build(values).notes.join(' | ')

describe('미는 양', () => {
  it('이종 재질이면 α 차이로 구한다 — (70−23)·1m·30°C = 1.41', () => {
    // **이 시험이 이 파일의 이유다.** TV 데코가 여름·겨울에 미는 그 값이다.
    const b = thermalGap.build({ L: 1000, dT: 30, a1: 70, a2: 23 })
    expect(b.tags.some(t => t.text.includes('1.41'))).toBe(true)
    expect(noteOf({ L: 1000, dT: 30, a1: 70, a2: 23 })).toContain('47')
  })

  it('각 부재의 늘어남도 따로 말한다', () => {
    const text = noteOf({ L: 1000, dT: 30, a1: 70, a2: 23 })
    expect(text).toContain('2.1')          // 70e-6 · 1000 · 30
    expect(text).toContain('0.69')         // 23e-6 · 1000 · 30
  })

  it('상대 부재가 없으면 한 부재의 늘어남만 말한다', () => {
    const text = noteOf({ L: 1000, dT: 30, a1: 70 })
    expect(text).toContain('ΔL = α·L·ΔT = 2.1')
    expect(text).toContain('ppm')
  })

  it('상대가 더 많이 늘어나는 조합이면 방향이 반대라고 말한다', () => {
    expect(noteOf({ L: 1000, dT: 30, a1: 23, a2: 70 })).toContain('미는 방향이 반대')
    expect(noteOf({ L: 1000, dT: 30, a1: 70, a2: 23 })).not.toContain('미는 방향이 반대')
  })
})

describe('처방', () => {
  const b = thermalGap.build({ L: 1000, dT: 30, a1: 70, a2: 23 })

  it('고정점이 한 곳뿐이고, 그렇다고 적혀 있다', () => {
    expect(b.shapes.filter(s => s.type === 'circle')).toHaveLength(1)
    expect(b.tags.some(t => t.text === '여기만 고정')).toBe(true)
    expect(b.notes.some(n => n.includes('양끝을 다 조이면'))).toBe(true)
  })

  it('상온 도면에 없는 값이라고 말한다', () => {
    expect(b.notes.some(n => n.includes('상온 도면 어디에도'))).toBe(true)
  })

  it('두 부재의 해칭 방향이 다르다', () => {
    const rects = b.shapes.filter(s => s.type === 'rect' && s.role === 'cut')
    expect(rects.map(r => !!r.flip).sort()).toEqual([false, true])
  })

  it('늘어난 끝을 참고선으로 겹치고, 부풀렸다고 적는다', () => {
    const ghost = b.shapes.find(s => s.type === 'path' && s.role === 'ghost')
    expect(ghost).toBeDefined()
    expect(b.notes.some(n => n.includes('부풀려'))).toBe(true)
  })
})

describe('값이 아직 없을 때', () => {
  it('기호만 적고 계산하지 않는다', () => {
    const b = thermalGap.build({ L: 1000 })
    expect(b.example).toBe(true)
    expect(b.missing.sort()).toEqual(['a1', 'dT'])
    expect(b.tags.some(t => t.text === 'ΔL')).toBe(true)
    expect(b.notes.some(n => n.includes('구한 값'))).toBe(false)
  })
})
