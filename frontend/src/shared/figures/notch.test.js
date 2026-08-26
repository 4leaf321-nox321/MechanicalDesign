/**
 * 응력집중 도해.
 *
 * 계산은 쉽다 — 표에서 Kt 를 읽어 곱하면 끝이다. 틀리는 자리는 **어느 치수를
 * 넣느냐**이고, 둘 다 조용히 틀린다:
 *
 *     필렛   r 을 큰 쪽 지름으로 나눠 버린다
 *     구멍   공칭응력을 어느 단면으로 잡았는지 모르고 곱한다
 *
 * 그림은 그 자리를 짚고, 말글은 갈리는 지점을 밝힌다.
 */

import { describe, expect, it } from 'vitest'
import { fillet, hole } from './notch'

const dimFor = (b, symbol) => b.dims.find(d => d.symbol === symbol)
const outline = (b) => b.shapes.filter(s => s.type === 'path')

describe('필렛', () => {
  const b = fillet.build({ D: 60, d: 40, r: 4 })

  it('위아래 대칭으로 그린다', () => {
    expect(outline(b)).toHaveLength(2)
  })

  it('필렛이 어깨면과 작은 쪽 겉면에 모두 접한다', () => {
    // 접선이 아니면 그림이 다른 형상을 말한다. 호가 **어깨면(x=0)에서 시작해
    // 작은 쪽 겉면(|y|=d/2)에서 끝나야** 한다. 글자로 맞춰 보면 부호나 자릿수가
    // 바뀔 때마다 깨지므로 좌표를 뽑아 잰다.
    for (const p of outline(b)) {
      const arc = /L (-?[\d.]+) (-?[\d.]+) A ([\d.]+) ([\d.]+) 0 0 [01] (-?[\d.]+) (-?[\d.]+)/
        .exec(p.d)
      expect(arc, p.d).not.toBeNull()
      const [x0, y0, rx, ry, x1, y1] = arc.slice(1).map(Number)
      expect(rx).toBeCloseTo(4, 9)
      expect(ry).toBeCloseTo(4, 9)
      expect(x0).toBeCloseTo(0, 9)               // 어깨면에 접한다
      expect(Math.abs(y0)).toBeCloseTo(24, 9)    // d/2 + r
      expect(x1).toBeCloseTo(4, 9)               // 중심에서 r 만큼 옆
      expect(Math.abs(y1)).toBeCloseTo(20, 9)    // 작은 쪽 겉면에 접한다
      expect(Math.sign(y0)).toBe(Math.sign(y1))  // 같은 쪽 반쪽이다
    }
  })

  it('반지름을 필렛 자리에서 끌어낸다', () => {
    // 표 옆에 숫자만 적으면 어느 모서리 이야기인지 알 수 없다.
    expect(b.tags[0].text).toBe('R4')
    expect(b.shapes.filter(s => s.type === 'line' && s.role === 'ghost').length)
      .toBeGreaterThanOrEqual(2)
  })

  it('r 을 나누는 것이 작은 쪽이라고 말한다', () => {
    // **이 시험이 이 파일의 이유다.**
    expect(b.notes.some(t => t.includes('r/d = 0.1'))).toBe(true)
    expect(b.notes.some(t => t.includes('작은 쪽'))).toBe(true)
  })

  it('단이 안 지면 안 그린다', () => {
    const flat = fillet.build({ D: 40, d: 40, r: 4 })
    expect(flat.ok).toBe(false)
    expect(flat.impossible).toContain('작은 쪽')
  })

  it('필렛이 단 높이보다 크면 안 그린다', () => {
    // 들어가지 않는 형상이다. 억지로 그리면 없는 물건이 된다.
    const big = fillet.build({ D: 60, d: 40, r: 12 })
    expect(big.ok).toBe(false)
    expect(big.impossible).toContain('필렛')
  })

  it('단 높이와 꼭 같은 반지름은 들어간다', () => {
    expect(fillet.build({ D: 60, d: 40, r: 10 }).ok).toBe(true)
  })
})

describe('구멍', () => {
  const b = hole.build({ w: 80, d: 20 })

  it('잡아당긴다 — 바깥을 향한다', () => {
    expect(b.flows).toHaveLength(2)
    const [left, right] = [...b.flows].sort((a, c) => a.x1 - c.x1)
    expect(left.x2).toBeLessThan(left.x1)
    expect(right.x2).toBeGreaterThan(right.x1)
  })

  it('구멍이 판 한가운데다', () => {
    const round = b.shapes.find(s => s.type === 'circle')
    expect(round.cx).toBe(0)
    expect(round.cy).toBe(0)
    expect(round.r).toBe(10)
  })

  it('남은 살을 눈으로 짚는다', () => {
    expect(b.tags.some(t => t.text.includes('남은 살'))).toBe(true)
  })

  it('어느 단면으로 잡느냐가 갈린다고 말한다', () => {
    // **이 시험이 이 파일의 이유다.** 표마다 다른데 숫자는 아무 말도 안 한다.
    expect(b.notes.some(t => t.includes('총단면') && t.includes('순단면')))
      .toBe(true)
  })

  it('구멍이 판보다 크면 안 그린다', () => {
    const big = hole.build({ w: 40, d: 60 })
    expect(big.ok).toBe(false)
    expect(big.impossible).toContain('구멍')
  })

  it('폭과 지름을 잰다', () => {
    expect(dimFor(b, 'w').value).toBe(80)
    expect(dimFor(b, 'd').value).toBe(20)
  })
})

describe('값이 아직 없을 때', () => {
  it('둘 다 보기 비율로 그리고 숫자를 안 적는다', () => {
    for (const spec of [fillet, hole]) {
      const b = spec.build({})
      expect(b.example, spec.id).toBe(true)
      expect(b.dims.every(d => d.value === null), spec.id).toBe(true)
    }
  })

  it('필렛은 값이 없으면 R 도 기호로 적는다', () => {
    expect(fillet.build({}).tags[0].text).toBe('R r')
  })
})
