/**
 * 사각 단면 도해.
 *
 * `Z = bh²/6` 이라 **어느 쪽이 세로인가**가 이 계산의 전부다. 60×20 을 눕히면
 * 세워 놓았을 때의 1/9 이 되는데, `b`·`h` 라는 글자만으로는 어느 쪽이 굽힘축인지
 * 알 수 없다. 그래서 중립축을 긋는다 — 그 한 줄이 b 와 h 를 바꿔 넣은 실수를
 * 그림에서 잡아 준다.
 */

import { describe, expect, it } from 'vitest'
import sectionRect from './sectionRect'

const box = (b) => b.shapes.find(s => s.type === 'rect')
const axis = (b) => b.shapes.find(s => s.type === 'line' && s.role === 'center')
const dimFor = (b, symbol) => b.dims.find(d => d.symbol === symbol)

describe('형상', () => {
  const b = sectionRect.build({ b: 30, h: 50 })

  it('준 값 그대로 그린다', () => {
    expect(box(b).w).toBe(30)
    expect(box(b).h).toBe(50)
  })

  it('잘린 면이라 해칭한다', () => {
    expect(box(b).role).toBe('cut')
  })

  it('중립축을 긋는다 — 굽힘 방향을 말하는 유일한 표시다', () => {
    expect(axis(b)).toBeDefined()
    expect(axis(b).y1).toBe(0)
    expect(axis(b).y2).toBe(0)
  })

  it('눕히면 그림도 눕는다', () => {
    // 같은 두 값을 바꿔 넣으면 그림이 달라져야 실수를 알아챌 수 있다.
    const lying = sectionRect.build({ b: 50, h: 30 })
    expect(box(lying).w).toBe(50)
    expect(box(lying).h).toBe(30)
  })
})

describe('치수', () => {
  it('둘 다 붙는다', () => {
    const b = sectionRect.build({ b: 30, h: 50 })
    expect(dimFor(b, 'b').value).toBe(30)
    expect(dimFor(b, 'h').value).toBe(50)
  })
})

describe('값이 아직 없을 때', () => {
  it('보기 비율로 그리고 숫자를 안 적는다', () => {
    const b = sectionRect.build({ b: 30 })
    expect(b.ok).toBe(true)
    expect(b.example).toBe(true)
    expect(b.missing).toEqual(['h'])
    expect(b.dims.every(d => d.value === null)).toBe(true)
  })
})
