/**
 * 스냅핏 도해.
 *
 * 이 도해의 이유는 ε = 1.5ty/L² 이 직관과 반대로 간다는 것이다 — 두껍게
 * 하면 변형률이 커진다. 그 말이 노트에서 실제 수치로 확인돼야 한다.
 */

import { describe, expect, it } from 'vitest'
import snapFit from './snapFit'

const dimFor = (b, symbol) => b.dims.find(d => d.symbol === symbol)
const strainOf = (b) => Number(
  b.notes.find(t => t.includes('변형률 ε')).match(/≈ ([\d.]+) %/)[1],
)

describe('변형률', () => {
  it('식대로 나온다 — 1.5·t·y/L²', () => {
    const b = snapFit.build({ t: 2, L: 18, y: 2.5 })
    expect(strainOf(b)).toBeCloseTo((1.5 * 2 * 2.5) / 324 * 100, 1)
  })

  it('t 를 키우면 변형률이 커진다 — 부러질 때 두껍게 하면 악화된다', () => {
    // **이 시험이 이 파일의 이유다.**
    const thin = snapFit.build({ t: 2, L: 18, y: 2.5 })
    const thick = snapFit.build({ t: 3, L: 18, y: 2.5 })
    expect(strainOf(thick)).toBeGreaterThan(strainOf(thin))
    expect(thick.notes.some(n => n.includes('길이 L 을 늘리는'))).toBe(true)
  })

  it('L 을 늘리면 제곱으로 떨어진다', () => {
    const short = snapFit.build({ t: 2, L: 12, y: 2.5 })
    const long = snapFit.build({ t: 2, L: 24, y: 2.5 })
    expect(strainOf(short) / strainOf(long)).toBeCloseTo(4, 1)
  })
})

describe('형상', () => {
  const b = snapFit.build({ t: 2, L: 18, y: 2.5, alpha: 30 })

  it('물림면이 수직이다 — 기울면 빠짐턱이 아니다', () => {
    const hook = b.shapes.find(s => s.type === 'path' && s.role === 'body')
    const [x1, , x2, y2] = hook.d.match(/-?[\d.]+/g).map(Number)
    expect(x1).toBe(x2)
    expect(y2).toBeCloseTo(-2.5, 6)
  })

  it('삽입 경사가 걸림량과 각도에서 나온다', () => {
    const hook = b.shapes.find(s => s.type === 'path' && s.role === 'body')
    const nums = hook.d.match(/-?[\d.]+/g).map(Number)
    const lead = nums[4] - nums[0]                  // 끝 x − 물림면 x
    expect(lead).toBeCloseTo(2.5 / Math.tan(Math.PI / 6), 3)
  })

  it('조립 순간의 휜 모양을 참고선으로 겹친다', () => {
    const bent = b.shapes.find(s => s.type === 'path' && s.role === 'ghost'
                                     && s.d.includes('Q'))
    expect(bent).toBeDefined()
  })

  it('뿌리를 손가락으로 짚는다', () => {
    expect(b.tags.some(t => t.text.includes('뿌리'))).toBe(true)
  })

  it('치수 셋이 준 값 그대로다', () => {
    expect(dimFor(b, 't').value).toBe(2)
    expect(dimFor(b, 'L').value).toBe(18)
    expect(dimFor(b, 'y').value).toBe(2.5)
  })
})

describe('그릴 수 없을 때', () => {
  it('팔이 두께보다 짧으면 안 그린다', () => {
    const b = snapFit.build({ t: 20, L: 15, y: 2 })
    expect(b.ok).toBe(false)
  })

  it('걸림량이 팔에 비해 너무 크면 안 그린다', () => {
    const b = snapFit.build({ t: 2, L: 10, y: 8 })
    expect(b.ok).toBe(false)
    expect(b.impossible).toContain('걸림량')
  })
})

describe('값이 아직 없을 때', () => {
  it('보기 비율로 그리고 숫자를 안 적는다', () => {
    const b = snapFit.build({ t: 2 })
    expect(b.example).toBe(true)
    expect(b.missing.sort()).toEqual(['L', 'y'])
    expect(b.dims.every(d => d.value === null)).toBe(true)
    expect(b.notes.some(n => n.includes('변형률 ε'))).toBe(false)
  })
})
