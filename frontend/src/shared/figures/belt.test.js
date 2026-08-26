/**
 * 벨트 전동 도해.
 *
 * 이 도해가 보여 주려는 것은 **접촉각**이다 — 작은 풀리에 벨트가 얼마나 감기는가.
 * `D1`·`D2`·`C` 숫자 셋으로는 감이 안 오는데, 전달할 수 있는 힘이 거기 달려 있다.
 *
 * 그래서 벨트를 **진짜 공통접선으로** 풀어야 한다. 두 중심을 잇는 선과 나란히
 * 대충 그으면 지름이 다를 때 벨트가 풀리를 뚫고 지나가고, 그 그림에서는 접촉각을
 * 읽을 수 없다.
 */

import { describe, expect, it } from 'vitest'
import belt from './belt'

const pulleys = (b) => b.shapes.filter(s => s.type === 'circle')
const belts = (b) => b.shapes.filter(s => s.type === 'line' && s.role === 'body')
const dimFor = (b, symbol) => b.dims.find(d => d.symbol === symbol)

/** 벨트 한 가닥이 그 원에 정말 닿는가 — 중심에서 선까지의 거리 = 반지름. */
function distance(line, cx, cy) {
  const dx = line.x2 - line.x1
  const dy = line.y2 - line.y1
  const len = Math.hypot(dx, dy)
  return Math.abs(dy * cx - dx * cy + line.x2 * line.y1 - line.y2 * line.x1) / len
}

describe('벨트가 풀리에 닿는다', () => {
  const b = belt.build({ D1: 100, D2: 250, C: 400 })

  it('두 가닥이다', () => {
    expect(belts(b)).toHaveLength(2)
  })

  it('양쪽 풀리에 정확히 접한다 — 뚫지도, 뜨지도 않는다', () => {
    // **이 시험이 이 파일의 이유다.** 접선을 대충 그으면 여기서 걸린다.
    for (const strand of belts(b)) {
      expect(distance(strand, 0, 0)).toBeCloseTo(50, 6)
      expect(distance(strand, 400, 0)).toBeCloseTo(125, 6)
    }
  })

  it('축간거리가 짧아지면 접선이 더 기운다 — 접촉각이 줄어든다', () => {
    const near = belt.build({ D1: 100, D2: 250, C: 220 })
    const slope = (s) => Math.abs((s.y2 - s.y1) / (s.x2 - s.x1))
    expect(slope(belts(near)[0])).toBeGreaterThan(slope(belts(b)[0]))
  })
})

describe('큰 쪽·작은 쪽', () => {
  it('값이 뒤집혀 와도 큰 쪽을 오른쪽에 둔다', () => {
    const swapped = belt.build({ D1: 250, D2: 100, C: 400 })
    const [left, right] = pulleys(swapped).filter(c => c.role === 'body')
    expect(left.r).toBeLessThan(right.r)
  })
})

describe('치수', () => {
  it('지름 치수가 풀리 밖으로 나간다', () => {
    // 안이면 치수선이 형상 위에 얹힌다.
    const b = belt.build({ D1: 100, D2: 250, C: 400 })
    expect(Math.abs(dimFor(b, 'D2').offset)).toBeGreaterThan(125)
  })

  it('셋 다 붙는다', () => {
    const b = belt.build({ D1: 100, D2: 250, C: 400 })
    expect(b.dims.map(d => d.symbol).sort()).toEqual(['C', 'D1', 'D2'])
  })
})

describe('그릴 수 없을 때', () => {
  it('축간거리가 두 반지름의 합보다 작으면 안 그린다', () => {
    // 풀리 둘이 겹친다. 억지로 그리면 벨트가 어떻게 감기는지 뜻을 잃는다.
    const b = belt.build({ D1: 100, D2: 250, C: 150 })
    expect(b.ok).toBe(false)
    expect(b.impossible).toContain('축간거리')
  })
})

describe('값이 아직 없을 때', () => {
  it('보기 비율로 그리고 숫자를 안 적는다', () => {
    const b = belt.build({ D1: 100, D2: 250 })
    expect(b.example).toBe(true)
    expect(b.missing).toEqual(['C'])
    expect(b.dims.every(d => d.value === null)).toBe(true)
  })
})
