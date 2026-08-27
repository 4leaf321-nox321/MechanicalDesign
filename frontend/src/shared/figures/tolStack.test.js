/**
 * 공차 누적 도해.
 *
 * 이 도해의 이유는 최악 합과 통계 합이 다르다는 것이다 — n 이 클수록 벌어지고,
 * 그 차이가 곧 부품 공차를 얼마나 조일지의 갈림길이다.
 */

import { describe, expect, it } from 'vitest'
import tolStack from './tolStack'

const noteOf = (values) => tolStack.build(values).notes.join(' | ')
const blocks = (b) => b.shapes.filter(s => s.type === 'rect').slice(3)

describe('최악 합과 통계 합', () => {
  it('둘 다 수치로 말한다 — n·t 와 √n·t', () => {
    // **이 시험이 이 파일의 이유다.** 5개 ±0.1 → 최악 ±0.5, 통계 ±0.22.
    const text = noteOf({ n: 5, t: 0.1 })
    expect(text).toContain('±0.5')
    expect(text).toContain('±0.22')
  })

  it('그려지는 개수를 줄여도 계산은 준 개수로 한다', () => {
    const b = tolStack.build({ n: 20, t: 0.05 })
    expect(blocks(b)).toHaveLength(8)
    expect(b.notes.join(' ')).toContain('±1')       // 20 × 0.05
    expect(b.notes.join(' ')).toContain('±0.22')    // √20 × 0.05
  })

  it('공차가 다르면 제곱합이라고 밝힌다', () => {
    expect(noteOf({ n: 5, t: 0.1 })).toContain('같은 공차')
  })
})

describe('설계 틈 판정', () => {
  it('최악 합까지 덮으면 그렇게 말한다', () => {
    expect(noteOf({ n: 5, t: 0.1, g: 0.6 })).toContain('어떤 조합에서도')
  })

  it('사이면 위험을 알고 고르는 것이라고 말한다', () => {
    const text = noteOf({ n: 5, t: 0.1, g: 0.35 })
    expect(text).toContain('최악 조합 로트가 나오면 간섭')
  })

  it('통계 합보다 작으면 정상 산포에서도 잦다고 말한다', () => {
    expect(noteOf({ n: 5, t: 0.1, g: 0.15 })).toContain('정상 산포에서도')
  })

  it('틈을 안 주면 판정하지 않는다', () => {
    expect(noteOf({ n: 5, t: 0.1 })).not.toContain('설계 틈')
  })
})

describe('그림', () => {
  const b = tolStack.build({ n: 5, t: 0.1, g: 0.35 })

  it('부품 수만큼 붙여 그린다', () => {
    const xs = blocks(b).map(r => r.x).sort((a, c) => a - c)
    expect(xs).toHaveLength(5)
    for (let i = 1; i < xs.length; i += 1) {
      expect(xs[i] - xs[i - 1]).toBeCloseTo(30, 9)
    }
  })

  it('부품끼리 해칭이 교대로 다르다 — 경계가 읽혀야 누적이 보인다', () => {
    const flips = blocks(b).map(r => !!r.flip)
    for (let i = 1; i < flips.length; i += 1) {
      expect(flips[i]).not.toBe(flips[i - 1])
    }
  })

  it('공차는 ± 로, 틈은 그대로 적는다', () => {
    expect(b.dims.find(d => d.symbol === 't').label).toBe('±{}')
    expect(b.dims.find(d => d.symbol === 'g').value).toBe(0.35)
  })

  it('부품이 하나면 안 그린다', () => {
    expect(tolStack.build({ n: 1, t: 0.1 }).ok).toBe(false)
  })
})

describe('값이 아직 없을 때', () => {
  it('보기 비율로 그리고 숫자를 안 적는다', () => {
    const b = tolStack.build({ n: 5 })
    expect(b.example).toBe(true)
    expect(b.dims.every(d => d.value === null)).toBe(true)
    expect(b.tags[0].text).toBe('부품 n개')
  })
})
