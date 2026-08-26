/**
 * 각파이프·ㄷ형강 단면.
 *
 * 사각·I형에 없던 것이 둘 있다.
 *
 * 각파이프는 **속이 비어야 한다.** 안쪽 윤곽을 같은 방향으로 돌리면 채울 때
 * 가운데가 안 뚫려 속 찬 사각형이 되는데, 겉모습이 거의 같아서 눈으로는 못 잡는다.
 *
 * ㄷ형강은 **도심이 가운데가 아니다.** 그리고 전단중심이 단면 바깥에 있어,
 * 도심에 하중을 걸어도 비틀린다 — 숫자 어디에도 안 나오는 이야기다.
 */

import { describe, expect, it } from 'vitest'
import box from './sectionBox'
import channel from './sectionChannel'

const shapeOf = (b) => b.shapes.find(s => s.type === 'path')
const dimFor = (b, symbol) => b.dims.find(d => d.symbol === symbol)

/** `M x y L x y ...` 를 점 목록으로. */
const pointsOf = (d) => [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)]
  .map(m => [Number(m[1]), Number(m[2])])

/** 다각형이 도는 방향. 부호가 반대면 반대로 돈다. */
function winding(points) {
  let sum = 0
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % points.length]
    sum += x1 * y2 - x2 * y1
  }
  return Math.sign(sum)
}

describe('각파이프', () => {
  const b = box.build({ b: 100, h: 150, t: 6 })

  it('바깥과 안쪽, 윤곽이 둘이다', () => {
    expect(shapeOf(b).d.split('M').length - 1).toBe(2)
  })

  it('안쪽 윤곽이 **반대 방향**으로 돈다 — 그래야 속이 빈다', () => {
    // **이 시험이 이 파일의 이유다.** 같은 방향이면 속 찬 사각형이 되는데,
    // 겉모습이 거의 같아 그림만 봐서는 못 잡는다.
    const [outer, inner] = shapeOf(b).d.split('M').slice(1).map(pointsOf)
    expect(winding(outer)).not.toBe(winding(inner))
  })

  it('벽 두께만큼 안쪽이 작다', () => {
    const [outer, inner] = shapeOf(b).d.split('M').slice(1).map(pointsOf)
    const width = (pts) => Math.max(...pts.map(p => p[0])) - Math.min(...pts.map(p => p[0]))
    expect(width(outer) - width(inner)).toBeCloseTo(12, 9)
  })

  it('중립축을 긋는다', () => {
    const axis = b.shapes.find(s => s.type === 'line' && s.role === 'center')
    expect(axis.y1).toBe(0)
    expect(axis.y2).toBe(0)
  })

  it('닫힌 단면이라 비틀림에 강하다고 말한다', () => {
    expect(b.notes.some(t => t.includes('비틀림에 강'))).toBe(true)
  })

  it('벽이 두꺼워 속이 안 비면 안 그린다', () => {
    const solid = box.build({ b: 100, h: 150, t: 50 })
    expect(solid.ok).toBe(false)
    expect(solid.impossible).toContain('벽 두께')
  })
})

describe('ㄷ형강', () => {
  const b = channel.build({ b: 75, h: 150, tw: 7, tf: 10 })

  it('도심이 웨브 쪽으로 치우친다 — 폭의 절반이 아니다', () => {
    // A_web = 7·150 = 1050,  플랜지 = (75−7)·10 = 680 씩
    // x̄ = (1050·3.5 + 1360·41) / 2410 = 24.66
    expect(dimFor(b, 'x̄').value).toBeCloseTo(24.66, 1)
    expect(dimFor(b, 'x̄').value).toBeLessThan(75 / 2)
  })

  it('도심 축을 그 자리에 긋는다', () => {
    const vertical = b.shapes.filter(s => s.type === 'line' && s.role === 'center'
                                          && s.x1 === s.x2)
    expect(vertical).toHaveLength(1)
    expect(vertical[0].x1).toBeCloseTo(dimFor(b, 'x̄').value, 1)
  })

  it('전단중심이 웨브 바깥이라고 짚는다', () => {
    // **이 시험이 이 파일의 이유다.** 도심에 걸어도 비틀린다.
    expect(b.tags.some(t => t.text.includes('전단중심'))).toBe(true)
    expect(b.notes.some(t => t.includes('비틀립니다'))).toBe(true)
  })

  it('전단중심 이름표가 재료가 없는 쪽에 있다', () => {
    const mark = b.tags.find(t => t.text.includes('전단중심'))
    expect(mark.x).toBeLessThan(0)
  })

  it('도심은 구한 값이라고 말한다 — 준 값이 아니다', () => {
    expect(b.notes.some(t => t.includes('구한 값'))).toBe(true)
  })

  it('웨브 두께 치수가 도심 치수와 다른 자리에 있다', () => {
    // 같은 자리면 두 숫자가 엉켜 어느 쪽이 어느 값인지 안 읽힌다.
    expect(dimFor(b, 'tw').from[1]).not.toBeCloseTo(dimFor(b, 'x̄').from[1], 3)
  })

  it('판이 너무 두꺼우면 안 그린다', () => {
    const bad = channel.build({ b: 75, h: 150, tw: 7, tf: 90 })
    expect(bad.ok).toBe(false)
  })
})

describe('값이 아직 없을 때', () => {
  it('둘 다 보기 비율로 그리고 숫자를 안 적는다', () => {
    for (const spec of [box, channel]) {
      const built = spec.build({})
      expect(built.example, spec.id).toBe(true)
      expect(built.dims.every(d => d.value === null), spec.id).toBe(true)
    }
  })

  it('값이 없으면 도심도 안 잰다 — 구할 수 없다', () => {
    expect(dimFor(channel.build({}), 'x̄')).toBeUndefined()
  })
})
