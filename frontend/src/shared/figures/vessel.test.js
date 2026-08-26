/**
 * 원통 압력용기 도해.
 *
 * 두 가지를 그림이 말해야 한다. **어느 응력이 어느 방향인가** — 후프는 세로로
 * 벌리고 축은 가로로 벌린다. 그리고 **얇은 벽 식이 지금 맞는가** — 벽이 두꺼워
 * 지면 안팎 응력이 달라져 하나의 값으로 말할 수 없는데, 숫자는 그 경계를
 * 안 알려 준다.
 */

import { describe, expect, it } from 'vitest'
import vessel from './vessel'

const walls = (b) => b.shapes.filter(s => s.type === 'rect' && s.role === 'cut')
const named = (b, label) => b.flows.filter(f => f.label === label)
const dimFor = (b, symbol) => b.dims.find(d => d.symbol === symbol)
const vertical = (f) => Math.abs(f.y2 - f.y1) > Math.abs(f.x2 - f.x1)

describe('두 응력의 방향', () => {
  const b = vessel.build({ D: 500, t: 8, p: 1.2 })

  it('후프는 **세로로** 벌린다 — 길이 방향으로 갈라지려는 힘이다', () => {
    const hoop = named(b, 'σθ')
    expect(hoop).toHaveLength(2)
    for (const f of hoop) expect(vertical(f)).toBe(true)
  })

  it('축응력은 **가로로** 벌린다', () => {
    const axial = named(b, 'σz')
    expect(axial).toHaveLength(2)
    for (const f of axial) expect(vertical(f)).toBe(false)
  })

  it('둘 다 바깥을 향한다 — 안쪽이면 누르는 그림이 된다', () => {
    for (const f of named(b, 'σθ')) {
      expect(Math.abs(f.y2)).toBeGreaterThan(Math.abs(f.y1))
    }
    const [left, right] = [...named(b, 'σz')].sort((a, c) => a.x2 - c.x2)
    expect(left.x2).toBeLessThan(left.x1)
    expect(right.x2).toBeGreaterThan(right.x1)
  })

  it('2배라고 적어 둔다', () => {
    expect(b.tags.some(t => t.text.includes('2'))).toBe(true)
    expect(b.notes.some(t => t.includes('세로로 갈라'))).toBe(true)
  })
})

describe('얇은 벽 조건', () => {
  it('D/t 가 크면 얇은 벽으로 본다고 말한다', () => {
    const b = vessel.build({ D: 500, t: 8 })
    expect(b.notes.some(t => t.includes('얇은 벽으로 봅니다'))).toBe(true)
  })

  it('벽이 두꺼우면 식이 안 맞을 수 있다고 말한다', () => {
    // **이 시험이 이 파일의 이유다.** 숫자는 이 경계를 안 알려 준다.
    const b = vessel.build({ D: 120, t: 14 })
    expect(b.notes.some(t => t.includes('두껍습니다'))).toBe(true)
  })

  it('경계를 넘나들면 말이 바뀐다', () => {
    const thin = vessel.build({ D: 210, t: 10 })   // D/t = 21
    const thick = vessel.build({ D: 190, t: 10 })  // D/t = 19
    expect(thin.notes.some(t => t.includes('두껍습니다'))).toBe(false)
    expect(thick.notes.some(t => t.includes('두껍습니다'))).toBe(true)
  })
})

describe('형상과 치수', () => {
  const b = vessel.build({ D: 500, t: 8 })

  it('벽이 둘이고 안지름만큼 떨어져 있다', () => {
    const [top, bottom] = walls(b)
    expect(bottom.y - (top.y + top.h)).toBeCloseTo(500, 9)
    expect(top.h).toBeCloseTo(8, 9)
  })

  it('양끝을 끊어 그린다 — 여기서 끝나는 게 아니다', () => {
    expect(b.shapes.filter(s => s.type === 'path' && s.role === 'ghost'))
      .toHaveLength(2)
    expect(b.notes.some(t => t.includes('그려 보인 길이'))).toBe(true)
  })

  it('안지름과 두께를 잰다 — 길이는 안 잰다', () => {
    expect(b.dims.map(d => d.symbol).sort()).toEqual(['D', 't'])
    expect(dimFor(b, 'D').value).toBe(500)
  })
})

describe('값이 아직 없을 때', () => {
  it('보기 비율로 그리고 숫자를 안 적는다', () => {
    const b = vessel.build({ D: 500 })
    expect(b.example).toBe(true)
    expect(b.missing).toEqual(['t'])
    expect(b.dims.every(d => d.value === null)).toBe(true)
    // 벽 두께를 모르면 D/t 도 모른다. 얇은지 두꺼운지 말하지 않는다.
    expect(b.notes.some(t => t.includes('D/t'))).toBe(false)
  })
})
