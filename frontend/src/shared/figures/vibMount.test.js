/**
 * 방진 마운트 도해.
 *
 * 이 도해의 이유는 √2 경계다 — f/fn 이 그 아래면 마운트가 진동을 키운다.
 * 경계 양쪽에서 판정이 갈리는지, 공진 부근을 따로 잡는지를 잰다.
 */

import { describe, expect, it } from 'vitest'
import vibMount from './vibMount'

const noteOf = (f, fn) => vibMount.build({ f, fn }).notes.join(' | ')

describe('√2 판정', () => {
  it('경계 양쪽에서 판정이 갈린다', () => {
    // **이 시험이 이 파일의 이유다.** f/fn = 1.35 와 1.5 — 숫자로는 비슷해
    // 보이지만 물리는 반대다.
    expect(noteOf(13.5, 10)).toContain('증폭 영역')
    expect(noteOf(15, 10)).toContain('격리 영역')
  })

  it('공진 부근은 증폭보다 먼저, 더 세게 경고한다', () => {
    expect(noteOf(10.5, 10)).toContain('공진 부근')
    expect(noteOf(24, 8)).not.toContain('공진 부근')
  })

  it('격리 영역에서는 전달률을 구해 준다 — 1/((f/fn)²−1)', () => {
    // f/fn = 3 → 1/8 = 0.13 (반올림)
    expect(noteOf(24, 8)).toContain('0.13')
  })

  it('단단한 마운트의 함정을 늘 말한다', () => {
    for (const [f, fn] of [[24, 8], [10, 10], [12, 10]]) {
      expect(noteOf(f, fn)).toContain('무른 마운트')
    }
  })
})

describe('그림', () => {
  const b = vibMount.build({ f: 24, fn: 8 })

  it('비를 이름표로 적는다', () => {
    expect(b.tags.some(t => t.text === 'f/fn = 3')).toBe(true)
  })

  it('가진원이 도는 화살표다 — 언밸런스', () => {
    expect(b.moments).toHaveLength(1)
    expect(b.moments[0].label).toContain('f = 24')
  })

  it('스프링 둘 위에 기계가 얹혀 있다', () => {
    const springs = b.shapes.filter(s => s.type === 'path' && s.role === 'body')
    expect(springs).toHaveLength(2)
    const mass = b.shapes.find(s => s.type === 'rect' && s.role === 'front')
    expect(mass.y + mass.h).toBeLessThanOrEqual(0)
  })
})

describe('값이 아직 없을 때', () => {
  it('기호만 적고 판정하지 않는다', () => {
    const b = vibMount.build({ f: 24 })
    expect(b.example).toBe(true)
    expect(b.missing).toEqual(['fn'])
    expect(b.tags.some(t => t.text === 'fn')).toBe(true)
    expect(b.notes.some(n => n.includes('영역'))).toBe(false)
  })
})
