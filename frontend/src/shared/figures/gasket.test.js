/**
 * 개스킷 압축 도해.
 *
 * 이 도해의 이유는 압축률에 창이 있다는 것이다 — 덜 눌러도 새고 너무 눌러도
 * 샌다. 창의 양쪽에서 판정이 갈리는지, 눌리지 않은 경우 틈을 짚는지를 잰다.
 */

import { describe, expect, it } from 'vitest'
import gasket from './gasket'

const noteOf = (values) => gasket.build(values).notes.join(' | ')
const dimFor = (b, symbol) => b.dims.find(d => d.symbol === symbol)

describe('압축률 창', () => {
  it('창 안이면 값과 창을 말한다', () => {
    expect(noteOf({ h0: 12, h: 9 })).toContain('C = 25 %')
    expect(noteOf({ h0: 12, h: 9 })).toContain('10~35')
  })

  it('덜 누르면 새고, 너무 눌러도 샌다 — 양쪽이 다 판정된다', () => {
    // **이 시험이 이 파일의 이유다.** 더 세게 누른다고 좋은 게 아니다.
    expect(noteOf({ h0: 12, h: 11.2 })).toContain('틈이 다 안 닫혀')
    expect(noteOf({ h0: 12, h: 6 })).toContain('압축줄음')
    expect(noteOf({ h0: 12, h: 6 })).toContain('양쪽 다 샙니다')
  })

  it('아예 안 눌리면 눌리지 않았다고 말하고 틈을 짚는다', () => {
    const b = gasket.build({ h0: 12, h: 14 })
    expect(b.notes.some(n => n.includes('눌리지'))).toBe(true)
    expect(b.tags.some(t => t.text === '틈')).toBe(true)
  })

  it('반발력이 문 닫힘힘이 된다고 말한다', () => {
    expect(noteOf({ h0: 12, h: 9 })).toContain('닫는 힘')
  })
})

describe('그림', () => {
  const b = gasket.build({ h0: 12, h: 9, w: 10 })

  it('자유·조립 두 상태가 나란히 있다', () => {
    expect(b.tags.some(t => t.text === '자유')).toBe(true)
    expect(b.tags.some(t => t.text === '조립')).toBe(true)
  })

  it('눌린 쪽은 옆으로 배가 나온다 — 부피는 거의 안 준다', () => {
    const squeezed = b.shapes.find(s => s.type === 'path' && s.role === 'cut')
    expect(squeezed.d).toContain('Q')
    const xs = squeezed.d.match(/-?[\d.]+/g).map(Number).filter((_, i) => i % 2 === 0)
    const free = b.shapes.filter(s => s.type === 'rect' && s.role === 'cut' && !s.flip)[0]
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(free.w)
  })

  it('플랜지는 반대 방향 해칭이다 — 다른 부재', () => {
    const flanges = b.shapes.filter(s => s.type === 'rect' && s.flip)
    expect(flanges).toHaveLength(2)
  })

  it('h 는 플랜지 사이 틈에서 잰다 — 조립이 정하는 값', () => {
    const d = dimFor(b, 'h')
    expect(d.value).toBe(9)
    expect(Math.abs(d.from[1] - d.to[1])).toBeCloseTo(9, 9)
  })

  it('치수가 준 값 그대로다', () => {
    expect(dimFor(b, 'h0').value).toBe(12)
    expect(dimFor(b, 'w').value).toBe(10)
  })

  it('폭을 안 주면 치수를 안 붙인다', () => {
    expect(dimFor(gasket.build({ h0: 12, h: 9 }), 'w')).toBeUndefined()
  })
})

describe('값이 아직 없을 때', () => {
  it('보기 비율로 그리고 숫자를 안 적는다', () => {
    const b = gasket.build({ h0: 12 })
    expect(b.example).toBe(true)
    expect(b.missing).toEqual(['h'])
    expect(b.dims.every(d => d.value === null)).toBe(true)
    expect(b.notes.some(n => n.includes('C ='))).toBe(false)
  })
})
