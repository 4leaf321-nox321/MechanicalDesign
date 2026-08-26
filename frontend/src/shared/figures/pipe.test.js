/**
 * 관로 도해.
 *
 * 이 도해의 어려운 자리는 **비율이 감당이 안 된다**는 것이다. L=100 m, D=0.1 m
 * 는 1000:1 이라 실제로 그리면 선 한 줄이 된다. 그렇다고 슬쩍 짧게 그리면 그림이
 * 거짓말을 하는데, 그건 묻힘키에서 끝까지 막은 바로 그 실패다.
 *
 * 그래서 실제 도면이 쓰는 방법을 쓴다 — 파단선. 여기서 지키는 것:
 *
 *     줄여 그렸으면 **줄였다고 그림에 적는다** (파단선 + 알림)
 *     치수에는 **언제나 진짜 값**을 적는다
 *     지름 방향은 **절대 안 줄인다**
 */

import { describe, expect, it } from 'vitest'
import pipe from './pipe'

const walls = (b) => b.shapes.filter(s => s.type === 'line' && s.role === 'body')
const breaks = (b) => b.shapes.filter(s => s.type === 'path')
const dimFor = (b, symbol) => b.dims.find(d => d.symbol === symbol)
/** 관 벽 사이 거리 = 그려진 안지름. */
const drawnD = (b) => {
  const horizontal = walls(b).filter(s => s.y1 === s.y2)
  return Math.max(...horizontal.map(s => s.y1)) - Math.min(...horizontal.map(s => s.y1))
}
const drawnL = (b) => {
  const xs = walls(b).flatMap(s => [s.x1, s.x2])
  return Math.max(...xs) - Math.min(...xs)
}

describe('짧은 관 — 그대로 그린다', () => {
  const b = pipe.build({ D: 0.1, L: 0.4 })

  it('파단하지 않는다', () => {
    expect(breaks(b)).toHaveLength(0)
    expect(b.notes).toEqual([])
  })

  it('길이도 지름도 실제 비율이다', () => {
    expect(drawnD(b)).toBeCloseTo(0.1, 10)
    expect(drawnL(b)).toBeCloseTo(0.4, 10)
  })
})

describe('긴 관 — 파단해서 줄인다', () => {
  const b = pipe.build({ D: 0.1, L: 100 })

  it('파단선을 긋고 줄였다고 적는다', () => {
    // **줄인 사실을 그림이 스스로 말해야 한다.** 조용히 짧게 그리면 그림이
    // 거짓말을 하고, 읽는 사람은 L/D 를 눈으로 잘못 가늠한다.
    expect(breaks(b).length).toBe(2)
    expect(b.notes.join()).toContain('파단')
  })

  it('치수는 줄이기 전 **진짜 값**이다', () => {
    expect(dimFor(b, 'L').value).toBe(100)
  })

  it('지름은 안 줄인다', () => {
    // 관 굵기는 눈으로 가늠하는 값이라 여기까지 손대면 그림이 아무 말도 못 한다.
    expect(drawnD(b)).toBeCloseTo(0.1, 10)
  })

  it('그린 길이는 읽을 만한 비율로 묶인다', () => {
    const aspect = drawnL(b) / drawnD(b)
    expect(aspect).toBeCloseTo(6, 6)          // 부동소수 찌꺼기까지 따질 자리는 아니다
    expect(aspect).toBeGreaterThan(1)
  })
})

describe('경계', () => {
  it('딱 6배까지는 안 자른다', () => {
    expect(breaks(pipe.build({ D: 0.1, L: 0.6 }))).toHaveLength(0)
  })

  it('6배를 넘으면 자른다', () => {
    expect(breaks(pipe.build({ D: 0.1, L: 0.61 })).length).toBe(2)
  })
})

describe('흐름', () => {
  it('화살표가 있다 — 없으면 정지한 통으로 보인다', () => {
    const b = pipe.build({ D: 0.1, L: 0.4 })
    expect(b.flows).toHaveLength(1)
    expect(b.flows[0].x2).toBeGreaterThan(b.flows[0].x1)
  })

  it('유량을 묶었을 때만 이름표가 붙는다', () => {
    expect(pipe.build({ D: 0.1, L: 0.4 }).flows[0].label).toBe('')
    expect(pipe.build({ D: 0.1, L: 0.4, Q: 0.05 }).flows[0].label).toBe('Q')
  })
})

describe('값이 아직 없을 때', () => {
  it('보기 비율로 그리고 숫자를 하나도 안 적는다', () => {
    const b = pipe.build({})
    expect(b.ok).toBe(true)
    expect(b.example).toBe(true)
    expect(b.dims.every(d => d.value === null)).toBe(true)
    expect(b.dims.map(d => d.symbol).sort()).toEqual(['D', 'L'])
  })

  it('보기 비율일 때는 파단 알림을 안 띄운다', () => {
    // 예시 형상은 애초에 실제 값이 아니라, 「줄여 그렸다」 가 뜻이 없다.
    expect(pipe.build({}).notes).toEqual([])
  })

  it('무엇이 있어야 진짜가 되는지 말한다', () => {
    expect(pipe.build({ D: 0.1 }).missing).toEqual(['L'])
  })
})
