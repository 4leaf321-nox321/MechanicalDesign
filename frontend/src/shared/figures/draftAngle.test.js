/**
 * 구배각 도해.
 *
 * 이 도해의 이유는 구배가 치수를 먹는다는 것이다 — Δ = H·tanθ 가 수치로
 * 나오고, 벽이 빼기 방향으로 넓어지는 방향까지 맞아야 한다.
 */

import { describe, expect, it } from 'vitest'
import draftAngle from './draftAngle'

const noteOf = (values) => draftAngle.build(values).notes.join(' | ')
const wallOf = (b) => b.shapes.find(s => s.type === 'path' && s.role === 'cut')

describe('먹는 폭', () => {
  it('Δ = H·tanθ 그대로다 — 1° × 깊이 30 = 한쪽 0.52', () => {
    // **이 시험이 이 파일의 이유다.**
    const b = draftAngle.build({ H: 30, theta: 1 })
    expect(b.tags.some(t => t.text.includes('0.52'))).toBe(true)
    expect(noteOf({ H: 30, theta: 1 })).toContain('2Δ = 1.05')
  })

  it('어느 높이에서 잰 치수인지 정하라고 말한다', () => {
    expect(noteOf({ H: 30, theta: 1 })).toContain('어느 높이')
  })

  it('0.5° 아래는 빼기 어렵다고 경고한다', () => {
    expect(noteOf({ H: 30, theta: 0.3 })).toContain('빼기 어렵습니다')
    expect(noteOf({ H: 30, theta: 1 })).not.toContain('빼기 어렵습니다')
  })
})

describe('벽의 방향', () => {
  it('빼기 방향으로 갈수록 넓어진다 — 반대면 금형에서 안 빠진다', () => {
    const wall = wallOf(draftAngle.build({ H: 30, theta: 3, w: 60 }))
    const pts = wall.d.match(/-?[\d.]+/g).map(Number)
    const [x0, y0, x1, , x2, , x3] = pts
    expect(y0).toBe(0)
    expect(x1).toBeLessThan(x0)          // 위(빼기 쪽)가 왼쪽으로 더 나가고
    expect(x2).toBeGreaterThan(x3)       // 오른쪽으로도 더 나간다
  })

  it('구배 없는 벽을 참고선으로 겹친다 — 먹힌 폭이 여기서 보인다', () => {
    const b = draftAngle.build({ H: 30, theta: 1, w: 60 })
    const ghosts = b.shapes.filter(s => s.type === 'line' && s.role === 'ghost'
                                        && s.x1 === s.x2)
    expect(ghosts.length).toBeGreaterThanOrEqual(2)
    expect(ghosts.some(g => Math.abs(g.x1) === 30)).toBe(true)   // w/2 자리
  })

  it('빼기 방향 화살표가 위를 향한다', () => {
    const f = draftAngle.build({ H: 30, theta: 1 }).flows[0]
    expect(f.label).toBe('빼기 방향')
    expect(f.y2).toBeLessThan(f.y1)
  })

  it('작은 각은 부풀려 그리되 그렇다고 적는다', () => {
    const b = draftAngle.build({ H: 30, theta: 1, w: 60 })
    const wall = wallOf(b)
    const pts = wall.d.match(/-?[\d.]+/g).map(Number)
    const spread = Math.abs(pts[2]) - Math.abs(pts[0])
    expect(spread).toBeGreaterThan(30 * Math.tan(Math.PI / 180) * 2)
    expect(b.notes.some(n => n.includes('부풀려'))).toBe(true)
  })

  it('45° 이상은 벽이 아니라고 거절한다', () => {
    expect(draftAngle.build({ H: 30, theta: 50 }).ok).toBe(false)
  })
})

describe('치수', () => {
  it('폭과 깊이가 준 값 그대로다', () => {
    const b = draftAngle.build({ H: 30, theta: 1, w: 60 })
    expect(b.dims.find(d => d.symbol === 'w').value).toBe(60)
    expect(b.dims.find(d => d.symbol === 'H').value).toBe(30)
  })

  it('폭을 안 주면 치수를 안 붙인다', () => {
    const b = draftAngle.build({ H: 30, theta: 1 })
    expect(b.dims.find(d => d.symbol === 'w')).toBeUndefined()
  })
})

describe('값이 아직 없을 때', () => {
  it('기호만 적는다', () => {
    const b = draftAngle.build({ H: 30 })
    expect(b.example).toBe(true)
    expect(b.tags.some(t => t.text === 'Δ = H·tanθ')).toBe(true)
    expect(b.dims.every(d => d.value === null)).toBe(true)
  })
})
