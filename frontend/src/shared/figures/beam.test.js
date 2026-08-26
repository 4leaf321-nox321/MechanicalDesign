/**
 * 보 도해 — 외팔보와 단순보.
 *
 * 같은 길이·같은 하중이라도 **어떻게 받쳐져 있느냐**로 굽힘모멘트가 4배 넘게
 * 갈린다(P·L 대 P·L/4). 숫자만으로는 어느 식을 쓴 것인지 알 수 없어서 **지점
 * 기호가 곧 계산식**이다. 그래서 지점과 하중 자리가 이 도해의 전부다.
 */

import { describe, expect, it } from 'vitest'
import { cantilever, simple } from './beam'

const beamOf = (b) => b.shapes.find(s => s.type === 'rect' && s.role === 'body')
const wall = (b) => b.shapes.find(s => s.type === 'rect' && s.role === 'cut')
const triangles = (b) => b.shapes.filter(s => s.type === 'path')

describe('외팔보', () => {
  const b = cantilever.build({ L: 1200, P: 5000 })

  it('한쪽이 벽에 물린다 — 삼각 지점이 아니다', () => {
    expect(wall(b)).toBeDefined()
    expect(triangles(b)).toHaveLength(0)
  })

  it('하중은 **자유단**에 걸린다', () => {
    // 여기가 곧 계산식이다. 자리를 잘못 그리면 그림이 다른 식을 말한다.
    expect(b.flows).toHaveLength(1)
    expect(b.flows[0].x1).toBe(1200)
  })

  it('길이가 준 값 그대로다', () => {
    expect(beamOf(b).w).toBe(1200)
  })
})

describe('단순보', () => {
  const b = simple.build({ L: 1200, P: 5000 })

  it('양끝을 받친다 — 벽이 아니다', () => {
    expect(wall(b)).toBeUndefined()
    expect(triangles(b)).toHaveLength(2)
  })

  it('하중은 **한가운데**에 걸린다', () => {
    expect(b.flows[0].x1).toBe(600)
  })

  it('한쪽은 굴림이다 — 늘어날 수 있다는 표시가 한 줄 더 있다', () => {
    const floors = b.shapes.filter(s => s.type === 'line' && s.role === 'body')
    expect(floors.length).toBeGreaterThan(2)
  })
})

describe('등분포하중', () => {
  const b = simple.build({ L: 1200, w: 12 })

  it('화살표를 여러 개 늘어놓는다 — 하나면 집중하중으로 읽힌다', () => {
    expect(b.flows.length).toBeGreaterThan(3)
  })

  it('이름표는 하나만 붙인다', () => {
    expect(b.flows.filter(f => f.label).length).toBe(1)
  })
})

describe('둘이 같은 규칙을 지킨다', () => {
  it('하중을 안 묶으면 화살표가 없다', () => {
    expect(cantilever.build({ L: 1200 }).flows).toEqual([])
    expect(simple.build({ L: 1200 }).flows).toEqual([])
  })

  it('보 높이는 그림용이라 치수를 안 붙인다', () => {
    const b = simple.build({ L: 1200 })
    expect(b.dims.map(d => d.symbol)).toEqual(['L'])
    expect(b.notes.join()).toContain('단면은 따로')
  })

  it('값이 없으면 보기 비율로 그리고 화살표도 없다', () => {
    const b = cantilever.build({ P: 5000 })
    expect(b.example).toBe(true)
    expect(b.flows).toEqual([])
    expect(b.dims.every(d => d.value === null)).toBe(true)
  })
})
