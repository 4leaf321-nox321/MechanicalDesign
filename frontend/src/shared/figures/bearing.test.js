/**
 * 구름베어링 도해.
 *
 * 베어링은 치수 세 개로 불린다 — 안지름 `d`, 바깥지름 `D`, 폭 `B`. 카탈로그도
 * 도면도 같은 글자를 쓰므로, 카드가 그 기호를 쓰면 아무것도 안 골라도 물린다.
 *
 * 여기서 지키는 것:
 *
 *   **링 두께와 볼 크기에는 치수를 안 붙인다.** 계산에 안 쓰이고 카탈로그마다
 *   다른 값이라, 우리가 정한 비율로 그린다. 그린 것에 치수를 달면 지어낸 값이
 *   사실처럼 읽힌다.
 *
 *   **바깥지름이 안지름보다 작으면 안 그린다.** 억지로 그리면 링이 서로를 뚫고
 *   나간 그림이 되어, 우리 버그인지 값이 이상한 건지 알 수 없다.
 */

import { describe, expect, it } from 'vitest'
import bearing from './bearing'

const OK = { d: 25, D: 52, B: 15 }
const rings = (b) => b.shapes.filter(s => s.type === 'rect')
const balls = (b) => b.shapes.filter(s => s.type === 'circle')
const dimFor = (b, symbol) => b.dims.find(d => d.symbol === symbol)

describe('형상', () => {
  const b = bearing.build(OK)

  it('위아래 대칭이다 — 링 넷, 볼 둘', () => {
    // 반쪽만 그리면 안지름과 바깥지름이 무엇을 재는 값인지 한눈에 안 읽힌다.
    expect(rings(b)).toHaveLength(4)
    expect(balls(b)).toHaveLength(2)
  })

  it('링과 볼이 안지름과 바깥지름 사이를 채운다', () => {
    const ri = OK.d / 2
    const ro = OK.D / 2
    const top = rings(b).filter(r => r.y < 0)
    const spanned = Math.max(...top.map(r => Math.abs(r.y)))
    expect(spanned).toBeCloseTo(ro, 10)
    // 안쪽 링은 안지름에서 시작한다.
    expect(Math.min(...top.map(r => Math.abs(r.y + r.h)))).toBeCloseTo(ri, 10)
  })

  it('볼이 두 링 사이에 있다', () => {
    const ball = balls(b).find(c => c.cy < 0)
    expect(Math.abs(ball.cy)).toBeGreaterThan(OK.d / 2)
    expect(Math.abs(ball.cy)).toBeLessThan(OK.D / 2)
  })

  it('폭을 준 대로 그린다', () => {
    expect(rings(b)[0].w).toBe(OK.B)
  })
})

describe('치수', () => {
  const b = bearing.build(OK)

  it('세 값에 붙는다', () => {
    expect(b.dims.map(d => d.symbol).sort()).toEqual(['B', 'D', 'd'])
  })

  it('지름 둘에는 Ø 가 붙는다', () => {
    expect(dimFor(b, 'd').label).toBe('Ø{}')
    expect(dimFor(b, 'D').label).toBe('Ø{}')
  })

  it('쌓인 지름 치수는 이름표 높이를 어긋나게 둔다', () => {
    // 나란히 두면 「Ø52 mØ25 mm」 처럼 글자가 겹쳐 둘 다 못 읽는다.
    expect(dimFor(b, 'd').along).not.toBe(dimFor(b, 'D').along)
  })

  it('링 두께와 볼 크기에는 안 붙는다', () => {
    // 우리가 정한 비율이라, 치수를 달면 지어낸 값이 사실처럼 읽힌다.
    expect(b.dims).toHaveLength(3)
  })
})

describe('폭을 안 줬을 때', () => {
  const b = bearing.build({ d: 25, D: 52 })

  it('그리기는 하되 재지 않고, 그렇게 그렸다고 적는다', () => {
    expect(b.ok).toBe(true)
    expect(rings(b)[0].w).toBeGreaterThan(0)
    expect(dimFor(b, 'B')).toBeUndefined()
    expect(b.notes.join()).toContain('폭(B)')
  })
})

describe('그릴 수 없을 때', () => {
  it('바깥지름이 안지름보다 작으면 억지로 안 그린다', () => {
    const b = bearing.build({ d: 52, D: 25 })
    expect(b.ok).toBe(false)
    expect(b.impossible).toContain('안지름')
  })

  it('둘이 같아도 안 그린다 — 링이 들어갈 자리가 없다', () => {
    expect(bearing.build({ d: 30, D: 30 }).ok).toBe(false)
  })
})

describe('값이 아직 없을 때', () => {
  const b = bearing.build({})

  it('보기 비율로 그리고 숫자를 안 적는다', () => {
    expect(b.ok).toBe(true)
    expect(b.example).toBe(true)
    expect(b.dims.every(d => d.value === null)).toBe(true)
    expect(b.dims.map(d => d.symbol).sort()).toEqual(['B', 'D', 'd'])
  })

  it('하나만 있어도 전부 보기 비율로 간다', () => {
    // 진짜 값과 보기 값을 섞으면 어느 치수가 진짜인지 알 수 없다.
    const half = bearing.build({ d: 25 })
    expect(half.example).toBe(true)
    expect(half.missing).toEqual(['D'])
  })
})
