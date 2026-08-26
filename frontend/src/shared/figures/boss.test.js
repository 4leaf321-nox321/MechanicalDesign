/**
 * 나사 보스 도해.
 *
 * 이 도해의 이유는 힘을 받는 자리가 살두께 (D − d1)/2 라는 것이다 —
 * 그 살이 그림에 실제 그 두께로 있고, 나사산이 구멍 벽을 무는 것이 보여야 한다.
 */

import { describe, expect, it } from 'vitest'
import boss from './boss'

const walls = (b) => b.shapes.filter(s => s.type === 'rect' && s.role === 'cut')
  .slice(1)                                         // 첫 rect 는 바닥
const teeth = (b) => b.shapes.filter(s => s.type === 'path' && s.role === 'front')
const dimFor = (b, symbol) => b.dims.find(d => d.symbol === symbol)

describe('살두께', () => {
  const b = boss.build({ d: 3, D: 6, d1: 2.4, h: 6 })

  it('보스 살이 정확히 (D − d1)/2 두께다', () => {
    // **이 시험이 이 파일의 이유다.** 후프힘을 받는 살이 바로 이 두께다.
    for (const w of walls(b)) expect(w.w).toBeCloseTo((6 - 2.4) / 2, 9)
  })

  it('두 살 사이가 구멍 지름이다', () => {
    const [left, right] = walls(b)
    expect(right.x - (left.x + left.w)).toBeCloseTo(2.4, 9)
  })

  it('살두께를 숫자로 말해 준다', () => {
    expect(b.notes.some(n => n.includes('살두께') && n.includes('1.8'))).toBe(true)
  })
})

describe('나사산과 스크류', () => {
  it('나사산이 구멍보다 넓게 나온다 — 그만큼이 무는 살이다', () => {
    const b = boss.build({ d: 3, D: 6, d1: 2.4 })
    const xs = teeth(b).flatMap(p => p.d.match(/-?[\d.]+/g)
      .filter((_, i) => i % 2 === 0).map(Number))
    expect(Math.max(...xs.map(Math.abs))).toBeCloseTo(1.5, 6)   // d/2 > d1/2
  })

  it('스크류 외경이 구멍보다 작으면 안 물린다고 말한다', () => {
    const loose = boss.build({ d: 3, D: 8, d1: 3.5 })
    expect(loose.notes.some(n => n.includes('물릴 살이 없습니다'))).toBe(true)
  })

  it('지름은 지시선으로 적는다', () => {
    const b = boss.build({ d: 3, D: 6 })
    expect(b.tags.some(t => t.text === '스크류 Ø3')).toBe(true)
  })
})

describe('권고 비율', () => {
  it('보스가 스크류의 2 배 아래로 얇으면 경고한다', () => {
    const thin = boss.build({ d: 4, D: 6.5 })
    expect(thin.notes.some(n => n.includes('갈라집니다'))).toBe(true)
    const okay = boss.build({ d: 3, D: 6 })
    expect(okay.notes.some(n => n.includes('갈라집니다'))).toBe(false)
  })

  it('물림이 2d 보다 짧으면 뽑힌다고 말한다', () => {
    const short = boss.build({ d: 3, D: 6, h: 4 })
    expect(short.notes.some(n => n.includes('뽑힙니다'))).toBe(true)
  })
})

describe('기본값과 치수', () => {
  it('구멍을 안 주면 0.8d 로 그리되 치수를 안 붙인다', () => {
    const b = boss.build({ d: 3, D: 6 })
    expect(dimFor(b, 'd1')).toBeUndefined()
    expect(b.notes.some(n => n.includes('0.8d'))).toBe(true)
  })

  it('주면 치수가 붙는다', () => {
    const b = boss.build({ d: 3, D: 6, d1: 2.4, h: 6 })
    expect(dimFor(b, 'd1').value).toBe(2.4)
    expect(dimFor(b, 'h').value).toBe(6)
    expect(dimFor(b, 'D').value).toBe(6)
  })

  it('구멍이 보스보다 크면 안 그린다', () => {
    const bad = boss.build({ d: 6, D: 5, d1: 5.5 })
    expect(bad.ok).toBe(false)
    expect(bad.impossible).toContain('살이 남습니다')
  })
})

describe('값이 아직 없을 때', () => {
  it('보기 비율로 그리고 숫자를 안 적는다', () => {
    const b = boss.build({ d: 3 })
    expect(b.example).toBe(true)
    expect(b.dims.every(d => d.value === null)).toBe(true)
    expect(b.tags.some(t => t.text === '스크류 Ød')).toBe(true)
  })
})
