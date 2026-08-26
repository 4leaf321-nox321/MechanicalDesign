/**
 * 리벳 이음 도해.
 *
 * 이 그림이 걸러 줘야 하는 것은 **하중 방향**이다. 리벳은 두 판이 서로 반대로
 * 당겨질 때 맞닿은 면에서 잘린다. 화살표를 안쪽으로 그리면 누르는 그림이 되어
 * 계산이 전단을 보고 있다는 사실과 정반대의 말을 한다 — 볼트 도해에서 실제로
 * 저지른 잘못이라 여기서는 시험으로 못을 박는다.
 *
 * 그리고 **없는 숫자를 안 짓는다.** 피치가 배선 안 됐으면 형상은 관례 값으로
 * 그리되 그 치수는 안 붙인다.
 */

import { describe, expect, it } from 'vitest'
import rivet from './rivet'

const plates = (b) => b.shapes.filter(s => s.type === 'rect' && s.role === 'cut')
const shanks = (b) => b.shapes.filter(s => s.type === 'rect' && s.role === 'front')
const heads = (b) => b.shapes.filter(s => s.type === 'path')
const dimFor = (b, symbol) => b.dims.find(d => d.symbol === symbol)

describe('하중은 이음을 잡아당긴다', () => {
  const b = rivet.build({ d: 16, t: 10, p: 48, n: 3 })

  it('화살표가 둘이고 서로 반대쪽을 가리킨다', () => {
    expect(b.flows).toHaveLength(2)
    const dirs = b.flows.map(f => Math.sign(f.x2 - f.x1))
    expect(dirs.sort()).toEqual([-1, 1])
  })

  it('바깥을 향한다 — 안쪽이면 누르는 그림이 된다', () => {
    // **이 시험이 이 파일의 이유다.**
    const [left, right] = [...b.flows].sort((a, c) => a.x1 - c.x1)
    expect(left.x2).toBeLessThan(left.x1)
    expect(right.x2).toBeGreaterThan(right.x1)
  })

  it('위 판은 한쪽으로, 아래 판은 반대쪽으로 당겨진다', () => {
    const [up, down] = [...b.flows].sort((a, c) => a.y1 - c.y1)
    expect(up.y1).toBeLessThan(0)      // 위 판
    expect(down.y1).toBeGreaterThan(0) // 아래 판
    expect(Math.sign(up.x2 - up.x1)).not.toBe(Math.sign(down.x2 - down.x1))
  })
})

describe('겹치기 이음의 짜임', () => {
  const b = rivet.build({ d: 16, t: 10, p: 48, n: 3 })

  it('판이 둘이고 서로 겹친다', () => {
    const [a, c] = plates(b)
    expect(a.y + a.h).toBeCloseTo(c.y, 6)          // 맞닿는다
    expect(a.x + a.w).toBeGreaterThan(c.x)         // 겹친다
  })

  it('리벳이 두 판을 **함께** 뚫는다', () => {
    // 한 판만 지나면 전단면이 없는 그림이 된다.
    const [a, c] = plates(b)
    for (const shank of shanks(b)) {
      expect(shank.y).toBeLessThanOrEqual(a.y)
      expect(shank.y + shank.h).toBeGreaterThanOrEqual(c.y + c.h)
    }
  })

  it('리벳이 모두 겹친 자리 안에 있다', () => {
    const [a, c] = plates(b)
    for (const shank of shanks(b)) {
      expect(shank.x).toBeGreaterThan(c.x)
      expect(shank.x + shank.w).toBeLessThan(a.x + a.w)
    }
  })

  it('전단면을 지시선으로 짚는다 — 발끝이 두 판이 맞닿은 자리다', () => {
    // 선을 그으면 판 경계에 묻혀 안 보인다. 지시선이 y=0 에서 시작해야 한다.
    const leader = b.shapes.find(s => s.type === 'line' && s.role === 'ghost'
                                      && s.y1 === 0)
    expect(leader).toBeDefined()
    expect(b.tags.some(t => t.text === '전단면')).toBe(true)
  })

  it('지시선 발끝이 겹친 자리 안이면서 리벳을 안 건드린다', () => {
    const [a, c] = plates(b)
    const leader = b.shapes.find(s => s.type === 'line' && s.role === 'ghost'
                                      && s.y1 === 0)
    expect(leader.x1).toBeGreaterThan(c.x)
    expect(leader.x1).toBeLessThan(a.x + a.w)
    for (const shank of shanks(b)) {
      expect(leader.x1 < shank.x || leader.x1 > shank.x + shank.w).toBe(true)
    }
  })

  it('두 판의 해칭 방향이 서로 반대다 — 한 장짜리로 안 읽히게', () => {
    const [a, c] = plates(b)
    expect(a.flip).toBe(false)
    expect(c.flip).toBe(true)
  })

  it('리벳은 단면을 안 친다 — 체결물은 잘라 그리지 않는다', () => {
    expect(shanks(b)).toHaveLength(3)
    expect(heads(b).every(h => h.role === 'front')).toBe(true)
    expect(heads(b)).toHaveLength(6)     // 위아래 머리
  })
})

describe('리벳 수', () => {
  it('준 만큼 그린다', () => {
    expect(shanks(rivet.build({ d: 16, t: 10, p: 48, n: 4 }))).toHaveLength(4)
  })

  it('너무 많으면 줄여 그리고 그렇다고 적는다', () => {
    const b = rivet.build({ d: 16, t: 10, p: 48, n: 12 })
    expect(shanks(b)).toHaveLength(6)
    expect(b.notes.some(t => t.includes('12') && t.includes('6'))).toBe(true)
  })

  it('간격이 넓어지면 판도 함께 길어진다', () => {
    const near = rivet.build({ d: 16, t: 10, p: 40, n: 3 })
    const far = rivet.build({ d: 16, t: 10, p: 90, n: 3 })
    expect(plates(far)[0].w).toBeGreaterThan(plates(near)[0].w)
  })
})

describe('치수', () => {
  it('지름·두께·피치가 붙는다', () => {
    const b = rivet.build({ d: 16, t: 10, p: 48, n: 3 })
    expect(b.dims.map(x => x.symbol).sort()).toEqual(['d', 'p', 't'])
    expect(dimFor(b, 'd').value).toBe(16)
    expect(dimFor(b, 'p').value).toBe(48)
  })

  it('피치를 안 주면 형상은 그리되 **그 치수는 안 붙인다**', () => {
    // 관례 값으로 그린 것이지 카드의 값이 아니다. 붙이면 숫자를 지어낸 것이 된다.
    const b = rivet.build({ d: 16, t: 10, n: 3 })
    expect(b.example).toBe(false)
    expect(dimFor(b, 'p')).toBeUndefined()
    expect(b.notes.some(t => t.includes('3d'))).toBe(true)
  })

  it('지름 치수가 리벳 머리 아래로 빠진다', () => {
    // 몸통 위에 두면 글자와 형상이 엉킨다.
    const b = rivet.build({ d: 16, t: 10, p: 48, n: 3 })
    expect(dimFor(b, 'd').from[1]).toBeGreaterThan(10)
  })
})

describe('값이 아직 없을 때', () => {
  it('보기 비율로 그리고 숫자를 안 적는다', () => {
    const b = rivet.build({ d: 16 })
    expect(b.example).toBe(true)
    expect(b.missing).toEqual(['t'])
    expect(b.dims.every(x => x.value === null)).toBe(true)
  })
})
