/**
 * 볼트 이음 도해.
 *
 * 볼트 검토는 **어느 단면이 견디는가**로 갈린다. 그림이 그 자리를 가리켜야 하고,
 * 전단면은 볼트가 아니라 **판이 맞닿은 자리**에 있다.
 */

import { describe, expect, it } from 'vitest'
import bolt from './bolt'

const plates = (b) => b.shapes.filter(s => s.type === 'rect' && s.role === 'cut')
const parts = (b) => b.shapes.filter(s => s.type === 'rect' && s.role === 'front')
const dimFor = (b, symbol) => b.dims.find(d => d.symbol === symbol)

describe('형상', () => {
  const b = bolt.build({ d: 12 })

  it('판 둘 — 그 경계가 전단면이다', () => {
    expect(plates(b)).toHaveLength(2)
    const [a, c] = plates(b)
    expect(a.y + a.h).toBeCloseTo(c.y, 10)
  })

  it('볼트는 몸통·머리·너트 셋이고 단면을 안 친다', () => {
    // 체결물은 단면을 치지 않는 것이 도면 관례다. 해칭 유무로 판과 갈린다.
    expect(parts(b)).toHaveLength(3)
    expect(parts(b).every(p => p.role === 'front')).toBe(true)
  })

  it('볼트가 판보다 **나중에** 그려진다 — 아니면 판이 볼트를 덮는다', () => {
    const order = b.shapes.filter(s => s.type === 'rect').map(s => s.role)
    expect(order.lastIndexOf('cut')).toBeLessThan(order.indexOf('front'))
  })

  it('몸통이 준 지름 그대로다', () => {
    expect(parts(b)[0].w).toBe(12)
  })
})

describe('하중', () => {
  it('안 묶으면 화살표가 없다', () => {
    expect(bolt.build({ d: 12 }).flows).toEqual([])
  })

  it('묶으면 **바깥쪽**으로 잡아당긴다 — 안쪽이면 누르는 그림이 된다', () => {
    const b = bolt.build({ d: 12, F: 8000 })
    expect(b.flows).toHaveLength(2)
    const [up, down] = b.flows
    expect(up.y2).toBeLessThan(up.y1)      // 위 화살표는 더 위로
    expect(down.y2).toBeGreaterThan(down.y1)  // 아래 화살표는 더 아래로
  })
})

describe('치수', () => {
  it('지름은 하중 화살표보다 아래에 둔다 — 겹치면 글자가 엉킨다', () => {
    const b = bolt.build({ d: 12, F: 8000 })
    const far = Math.max(...b.flows.map(f => Math.max(f.y1, f.y2)))
    const d = dimFor(b, 'd')
    expect(d.from[1] + d.offset).toBeGreaterThan(far)
  })

  it('길이는 준 값이 있을 때만 잰다', () => {
    expect(dimFor(bolt.build({ d: 12 }), 'L')).toBeUndefined()
    expect(dimFor(bolt.build({ d: 12, L: 40 }), 'L').value).toBe(40)
  })
})

describe('값이 아직 없을 때', () => {
  it('보기 비율로 그리고 숫자도 화살표도 없다', () => {
    const b = bolt.build({ F: 8000 })
    expect(b.example).toBe(true)
    expect(b.flows).toEqual([])
    expect(b.dims.every(x => x.value === null)).toBe(true)
  })
})
