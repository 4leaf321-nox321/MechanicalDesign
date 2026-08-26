/**
 * 낙하 충격 도해.
 *
 * 이 도해의 이유는 G = H/s — 설계가 만질 수 있는 것이 s 하나뿐이라는 것이다.
 * s 가 줄면 G 가 치솟는 방향까지 노트가 실제 수치로 말해야 한다.
 */

import { describe, expect, it } from 'vitest'
import drop from './drop'

const dimFor = (b, symbol) => b.dims.find(d => d.symbol === symbol)
const gOf = (b) => Number(b.notes.find(n => n.includes('G = H/s'))
  .match(/≈ (\d+) g/)[1])

describe('G = H/s', () => {
  it('비 그대로 나온다', () => {
    expect(gOf(drop.build({ H: 1000, s: 1.5 }))).toBe(667)
  })

  it('s 가 줄면 G 가 치솟는다 — 단단할수록 나빠지는 방향', () => {
    // **이 시험이 이 파일의 이유다.**
    const soft = drop.build({ H: 1000, s: 3 })
    const stiff = drop.build({ H: 1000, s: 1 })
    expect(gOf(stiff)).toBeGreaterThan(gOf(soft) * 2.5)
    expect(stiff.notes.some(n => n.includes('길게 멈추기'))).toBe(true)
  })

  it('s 가 H 이상이면 충격이 없다고 말한다', () => {
    const b = drop.build({ H: 100, s: 150 })
    expect(b.notes.some(n => n.includes('충격이랄 것이 없습니다'))).toBe(true)
    expect(b.notes.some(n => n.includes('G = H/s ≈'))).toBe(false)
  })

  it('s 가 없으면 G 를 말하지 않고, 없다고 말한다', () => {
    const b = drop.build({ H: 1000 })
    expect(b.notes.some(n => n.includes('배선되지'))).toBe(true)
    expect(b.notes.some(n => n.includes('≈'))).toBe(false)
  })
})

describe('그림', () => {
  it('기기 바닥이 정확히 H 높이에 떠 있다', () => {
    const b = drop.build({ H: 1000, s: 1.5 })
    const device = b.shapes.find(s => s.type === 'rect' && s.role === 'front')
    expect(device.y + device.h).toBeCloseTo(-1000, 6)
  })

  it('멈추는 거리는 부풀려 그리되 치수는 준 값 그대로다', () => {
    const b = drop.build({ H: 1000, s: 1.5 })
    expect(dimFor(b, 's').value).toBe(1.5)
    const span = Math.abs(dimFor(b, 's').from[1] - dimFor(b, 's').to[1])
    expect(span).toBeGreaterThan(1.5)                  // 그려진 크기는 더 크다
    expect(b.notes.some(n => n.includes('부풀려'))).toBe(true)
  })

  it('낙하 화살표가 아래를 향한다', () => {
    const b = drop.build({ H: 1000 })
    expect(b.flows[0].y2).toBeGreaterThan(b.flows[0].y1)
  })
})

describe('값이 아직 없을 때', () => {
  it('보기 비율로 그리고 숫자를 안 적는다', () => {
    const b = drop.build({})
    expect(b.example).toBe(true)
    expect(b.missing).toEqual(['H'])
    expect(b.dims.every(d => d.value === null)).toBe(true)
  })
})
