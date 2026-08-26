/**
 * 압입 도해.
 *
 * 이 도해의 이유는 간섭량이 실척으로는 안 보인다는 것이다 — 부풀려 그리되
 * 부풀렸다고 적고, 치수는 준 값 그대로여야 한다.
 */

import { describe, expect, it } from 'vitest'
import pressFit from './pressFit'

const dimFor = (b, symbol) => b.dims.find(d => d.symbol === symbol)
const hub = (b) => b.shapes.filter(s => s.type === 'rect' && s.role === 'cut')

describe('간섭의 과장과 정직', () => {
  const b = pressFit.build({ d: 20, delta: 0.03 })

  it('그림의 턱은 부풀고, 치수는 준 값 그대로다', () => {
    // **이 시험이 이 파일의 이유다.** Ø20 축과 Ø19.97 구멍은 실척으로 같은
    // 그림이다 — 과장 없이는 이 도해가 아무 말도 못 한다.
    const [top, bottom] = hub(b)
    const holeDrawn = bottom.y - (top.y + top.h)
    expect(holeDrawn).toBeLessThan(20 - 0.03)          // 구멍이 눈에 띄게 좁고
    expect(dimFor(b, 'd').value).toBe(20)              // 치수는 진짜 값
    expect(dimFor(b, 'dh').value).toBe(19.97)
    expect(b.notes.some(n => n.includes('부풀려'))).toBe(true)
  })

  it('구멍 지름이 구한 값이라고 말한다', () => {
    expect(b.notes.some(n => n.includes('d − δ') && n.includes('19.97'))).toBe(true)
  })

  it('δ 를 지시선으로 짚는다', () => {
    expect(b.tags.some(t => t.text.includes('0.03'))).toBe(true)
  })
})

describe('간섭비 판정', () => {
  it('흔한 범위면 값만 적는다', () => {
    const b = pressFit.build({ d: 20, delta: 0.03 })     // 0.15 %
    expect(b.notes.some(n => n.includes('0.15 %') && n.includes('0.05~0.25'))).toBe(true)
  })

  it('너무 크면 터진다고, 너무 작으면 미끄러진다고 말한다', () => {
    const tight = pressFit.build({ d: 20, delta: 0.09 }) // 0.45 %
    expect(tight.notes.some(n => n.includes('터지거나'))).toBe(true)
    const loose = pressFit.build({ d: 20, delta: 0.004 }) // 0.02 %
    expect(loose.notes.some(n => n.includes('미끄러질'))).toBe(true)
  })

  it('허브 살이 얇으면 δ 만으로 안 정해진다고 말한다', () => {
    const thin = pressFit.build({ d: 20, delta: 0.03, D: 26 })
    expect(thin.notes.some(n => n.includes('δ 만으로'))).toBe(true)
    const thick = pressFit.build({ d: 20, delta: 0.03, D: 40 })
    expect(thick.notes.some(n => n.includes('δ 만으로'))).toBe(false)
  })
})

describe('형상', () => {
  it('허브 살두께와 길이가 준 값 그대로다', () => {
    const b = pressFit.build({ d: 20, delta: 0.03, D: 40, L: 25 })
    for (const wall of hub(b)) expect(wall.h).toBeCloseTo(10, 9)
    expect(hub(b)[0].w).toBeCloseTo(25, 9)
    expect(dimFor(b, 'D').value).toBe(40)
    expect(dimFor(b, 'L').value).toBe(25)
  })

  it('축 끝에 모따기가 있다 — 압입 안내', () => {
    const shaft = pressFit.build({ d: 20, delta: 0.03 })
      .shapes.find(s => s.type === 'path' && s.role === 'front')
    expect(shaft.d.match(/L/g).length).toBeGreaterThanOrEqual(5)
  })

  it('간섭이 지름에 비해 터무니없으면 안 그린다', () => {
    const bad = pressFit.build({ d: 20, delta: 5 })
    expect(bad.ok).toBe(false)
    expect(bad.impossible).toContain('간섭량')
  })

  it('허브가 축보다 가늘면 안 그린다', () => {
    expect(pressFit.build({ d: 20, delta: 0.03, D: 18 }).ok).toBe(false)
  })
})

describe('값이 아직 없을 때', () => {
  it('보기 비율로 그리고 숫자를 안 적는다', () => {
    const b = pressFit.build({ d: 20 })
    expect(b.example).toBe(true)
    expect(b.missing).toEqual(['delta'])
    expect(b.dims.every(d => d.value === null)).toBe(true)
    expect(b.tags.some(t => t.text.includes('δ (지름 기준)'))).toBe(true)
  })
})
