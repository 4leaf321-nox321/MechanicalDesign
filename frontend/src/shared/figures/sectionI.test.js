/**
 * I형 단면 도해.
 *
 * 이 단면을 쓰는 이유는 **재료를 중립축에서 멀리 보내는 것**이다. 그 사실이
 * 그림에서 읽히려면 중립축이 그어져 있어야 한다.
 */

import { describe, expect, it } from 'vitest'
import sectionI from './sectionI'

const outline = (b) => b.shapes.find(s => s.type === 'path')
const axis = (b) => b.shapes.find(s => s.type === 'line' && s.role === 'center')
const dimFor = (b, symbol) => b.dims.find(d => d.symbol === symbol)
const xs = (b) => (outline(b).d.match(/-?[\d.]+/g) || [])
  .filter((_, i) => i % 2 === 0).map(Number)

describe('형상', () => {
  const b = sectionI.build({ b: 100, h: 200, tw: 8, tf: 12 })

  it('플랜지 폭이 준 값 그대로다', () => {
    expect(Math.max(...xs(b)) - Math.min(...xs(b))).toBe(100)
  })

  it('웨브가 플랜지보다 좁다', () => {
    const inner = xs(b).filter(x => Math.abs(x) < 50)
    expect(Math.max(...inner) * 2).toBe(8)
  })

  it('중립축을 긋는다 — 이 단면을 쓰는 이유를 말하는 선이다', () => {
    expect(axis(b)).toBeDefined()
    expect(axis(b).y1).toBe(0)
  })
})

describe('두께를 안 줬을 때', () => {
  const b = sectionI.build({ b: 100, h: 200 })

  it('보기 비율로 그리고 그렇게 그렸다고 적는다', () => {
    expect(b.ok).toBe(true)
    expect(b.notes.join()).toContain('보기 좋은 비율')
  })

  it('지어낸 두께에는 치수를 안 붙인다', () => {
    // 붙이면 사람이 그것을 자기가 정한 값으로 읽는다.
    expect(dimFor(b, 'tw')).toBeUndefined()
    expect(dimFor(b, 'tf')).toBeUndefined()
  })
})

describe('그릴 수 없을 때', () => {
  it('웨브가 플랜지보다 넓으면 안 그린다', () => {
    const b = sectionI.build({ b: 50, h: 200, tw: 60, tf: 12 })
    expect(b.ok).toBe(false)
  })

  it('플랜지 둘이 높이를 넘으면 안 그린다', () => {
    const b = sectionI.build({ b: 100, h: 20, tw: 8, tf: 15 })
    expect(b.ok).toBe(false)
  })
})

describe('값이 아직 없을 때', () => {
  it('보기 비율로 그리고 숫자를 안 적는다', () => {
    const b = sectionI.build({ b: 100 })
    expect(b.example).toBe(true)
    expect(b.missing).toEqual(['h'])
    expect(b.dims.every(d => d.value === null)).toBe(true)
  })
})
