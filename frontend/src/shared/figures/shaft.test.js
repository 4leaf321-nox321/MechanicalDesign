/**
 * 중실축 도해.
 *
 * 축 계산은 대개 **지름 하나로 끝난다.** 그래서 이 도해가 반드시 말해야 하는
 * 것도 지름 하나고, 나머지는 있으면 더 보여 주는 것이다.
 *
 * 여기서 지키는 것:
 *
 *     그림에 있다고 다 치수는 아니다 — 축 길이는 계산에 없는 값이라 그리기만
 *     하고 재지 않는다. 치수가 붙는 순간 사람은 그것을 자기가 정한 값으로 읽는다.
 */

import { describe, expect, it } from 'vitest'
import shaft from './shaft'

const section = (b) => b.shapes.find(s => s.type === 'circle')
const side = (b) => b.shapes.find(s => s.type === 'rect')
const dimFor = (b, symbol) => b.dims.find(d => d.symbol === symbol)

describe('지름만 있어도 그린다', () => {
  const b = shaft.build({ d: 40 })

  it('축 계산 대부분이 지름 하나뿐이다', () => {
    expect(b.ok).toBe(true)
    expect(b.example).toBe(false)
    expect(section(b).r).toBe(20)
  })

  it('단면은 속이 찬 것으로 그린다', () => {
    // 속 빈 축이면 계산식이 아예 다르다. 이 구분이 그림에서 보여야 한다.
    expect(section(b).role).toBe('cut')
  })

  it('지름에 치수가 붙는다', () => {
    expect(dimFor(b, 'd').value).toBe(40)
    expect(dimFor(b, 'd').label).toBe('Ø{}')
  })
})

describe('축 길이', () => {
  it('안 주면 그리기만 하고 재지 않는다', () => {
    // **이 시험이 이 파일의 요점이다.** 안 준 값에 치수가 붙으면 사람은 그것을
    // 자기가 정한 값으로 읽는다.
    const b = shaft.build({ d: 40 })
    expect(side(b).w).toBeGreaterThan(0)
    expect(dimFor(b, 'L')).toBeUndefined()
    expect(b.notes.join()).toContain('쓰이지 않아')
  })

  it('주면 그 값 그대로 그리고 잰다', () => {
    const b = shaft.build({ d: 40, L: 120 })
    expect(side(b).w).toBe(120)
    expect(dimFor(b, 'L').value).toBe(120)
    expect(b.notes).toEqual([])
  })
})

describe('축에 걸리는 것', () => {
  it('아무것도 안 묶으면 화살표가 없다', () => {
    const b = shaft.build({ d: 40 })
    expect(b.moments).toEqual([])
    expect(b.flows).toEqual([])
  })

  it('토크를 묶으면 비트는 화살표가 단면에 걸린다', () => {
    // 옆면에 걸면 축을 감은 띠처럼 보인다.
    const b = shaft.build({ d: 40, T: 500000 })
    expect(b.moments).toHaveLength(1)
    expect(b.moments[0].cx).toBe(section(b).cx)
    expect(b.moments[0].r).toBeGreaterThan(section(b).r)
  })

  it('하중을 묶으면 내리꽂는 화살표가 옆면에 걸린다', () => {
    const b = shaft.build({ d: 40, F: 2500 })
    expect(b.flows).toHaveLength(1)
    // 아래로 향한다 (SVG 는 y 가 아래로).
    expect(b.flows[0].y2).toBeGreaterThan(b.flows[0].y1)
  })
})

describe('값이 아직 없을 때', () => {
  const b = shaft.build({})

  it('보기 비율로 그리고 숫자를 안 적는다', () => {
    expect(b.ok).toBe(true)
    expect(b.example).toBe(true)
    expect(b.dims.every(d => d.value === null)).toBe(true)
  })

  it('보기 비율에는 화살표를 안 건다', () => {
    // 지어낸 형상에 「토크가 걸린다」 고 적으면 그림이 거짓말을 한다.
    const withLoads = shaft.build({ T: 500000, F: 2500 })
    expect(withLoads.example).toBe(true)
    expect(withLoads.moments).toEqual([])
    expect(withLoads.flows).toEqual([])
  })

  it('0 과 음수는 값이 아니다', () => {
    expect(shaft.build({ d: 0 }).example).toBe(true)
    expect(shaft.build({ d: -10 }).example).toBe(true)
  })
})

describe('속 빈 축', () => {
  const b = shaft.build({ d: 60, di: 30 })
  const face = b.shapes.find(s => s.type === 'circle' && s.role === 'cut')

  it('정면도 안쪽 원이 **반지름**으로 들어간다', () => {
    // 지름을 그대로 넘기면 안팎이 겹쳐 도넛이 사라진다. 그러면 그림이 속 빈
    // 축을 속 찬 축으로 그리는데, 오류가 안 나서 아무도 모른다.
    expect(face.r).toBe(30)
    expect(face.inner).toBe(15)
    expect(face.inner).toBeLessThan(face.r)
  })

  it('옆면에도 숨은선으로 구멍이 보인다', () => {
    const hidden = b.shapes.filter(s => s.type === 'line' && s.role === 'hidden')
    expect(hidden).toHaveLength(2)
  })

  it('속 찬 축은 안쪽 원이 없다', () => {
    const solid = shaft.build({ d: 60 })
    expect(solid.shapes.find(s => s.type === 'circle' && s.role === 'cut').inner)
      .toBe(0)
  })

  it('안지름이 바깥지름보다 크면 안 그린다', () => {
    const bad = shaft.build({ d: 40, di: 50 })
    expect(bad.ok).toBe(false)
    expect(bad.impossible).toContain('안지름')
  })
})
