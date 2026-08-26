/**
 * 스프링 도해.
 *
 * 코일 쪽이 보여 주려는 것은 **스프링지수 C = D/d** 다. `D=30, d=4` 라는 두
 * 숫자로는 그 비가 7.5 인지 눈에 안 들어오는데, 소선을 실제 비율로 그리면
 * 굵기와 지름의 비가 그냥 보인다. 그래서 소선을 부풀리면 안 된다 —
 * 부풀리는 순간 이 도해가 하려던 말이 사라진다.
 */

import { describe, expect, it } from 'vitest'
import { coil, leaf } from './spring'

const wires = (b) => b.shapes.filter(s => s.type === 'circle')
const dimFor = (b, symbol) => b.dims.find(d => d.symbol === symbol)
const leaves = (b) => b.shapes.filter(s => s.type === 'path')

describe('코일 — 소선이 실제 비율이다', () => {
  it('소선 반지름이 준 값 그대로다', () => {
    // **이 시험이 이 파일의 이유다.** 보기 좋으라고 부풀리면 C 가 안 보인다.
    const b = coil.build({ D: 30, d: 4, n: 5 })
    for (const w of wires(b)) expect(w.r).toBeCloseTo(2, 9)
  })

  it('좌우 소선 중심 사이가 코일 평균지름이다', () => {
    const b = coil.build({ D: 30, d: 4, n: 5 })
    const xs = [...new Set(wires(b).map(w => w.cx))].sort((a, c) => a - c)
    expect(xs).toHaveLength(2)
    expect(xs[1] - xs[0]).toBeCloseTo(30, 9)
  })

  it('C 가 작으면 소선이 코일에 비해 굵어진다', () => {
    const thin = coil.build({ D: 60, d: 4, n: 4 })     // C = 15
    const fat = coil.build({ D: 24, d: 8, n: 4 })      // C = 3
    const ratio = (b) => dimFor(b, 'D').value / wires(b)[0].r / 2
    expect(ratio(fat)).toBeLessThan(ratio(thin))
  })
})

describe('코일 — 스프링지수를 말한다', () => {
  it('보통 범위면 값만 적는다', () => {
    const b = coil.build({ D: 30, d: 4, n: 5 })
    expect(b.tags[0].text).toBe('C = D/d = 7.5')
    expect(b.notes.some(t => t.includes('보통'))).toBe(true)
  })

  it('4 미만이면 감기 어렵다고 말한다', () => {
    const b = coil.build({ D: 24, d: 8, n: 4 })
    expect(b.notes.some(t => t.includes('감기가 어렵'))).toBe(true)
  })

  it('12 를 넘으면 흔들린다고 말한다', () => {
    const b = coil.build({ D: 64, d: 4, n: 4 })
    expect(b.notes.some(t => t.includes('흔들리기'))).toBe(true)
  })

  it('값이 없으면 C 를 안 적는다 — 지어낸 값이 된다', () => {
    expect(coil.build({}).tags).toHaveLength(0)
  })
})

describe('코일 — 감김과 자유길이', () => {
  it('감김수만큼 그린다', () => {
    // 한 권마다 왼쪽·오른쪽 하나씩, 맨 끝에 왼쪽 하나 더.
    expect(wires(coil.build({ D: 30, d: 4, n: 5 }))).toHaveLength(11)
  })

  it('너무 많으면 줄여 그리고 그렇다고 적는다', () => {
    const b = coil.build({ D: 30, d: 4, n: 20 })
    expect(b.notes.some(t => t.includes('20') && t.includes('9'))).toBe(true)
  })

  it('자유길이를 주면 치수가 붙고, 없으면 안 붙는다', () => {
    expect(dimFor(coil.build({ D: 30, d: 4, n: 5, L: 60 }), 'L').value).toBe(60)
    expect(dimFor(coil.build({ D: 30, d: 4, n: 5 }), 'L')).toBeUndefined()
  })

  it('코일이 닿을 만큼 짧으면 벌려 그리고 그렇다고 적는다', () => {
    // 겹쳐 그리면 몇 권인지도 안 보인다. 벌리되 숨기지 않는다.
    const b = coil.build({ D: 30, d: 4, n: 8, L: 20 })
    expect(b.notes.some(t => t.includes('닿습니다'))).toBe(true)
  })

  it('소선이 코일보다 굵으면 안 그린다', () => {
    const b = coil.build({ D: 10, d: 12 })
    expect(b.ok).toBe(false)
    expect(b.impossible).toContain('소선')
  })
})

describe('판 스프링', () => {
  it('준 장수만큼 그린다', () => {
    expect(leaves(leaf.build({ L: 1000, t: 8, n: 5 }))).toHaveLength(5)
  })

  it('아래로 갈수록 짧아진다 — 모판이 맨 위다', () => {
    const b = leaf.build({ L: 1000, t: 8, n: 4 })
    const width = (p) => Math.abs(Number(p.d.split(' ')[1])) * 2
    const spans = leaves(b).map(width)
    for (let i = 1; i < spans.length; i += 1) {
      expect(spans[i]).toBeLessThan(spans[i - 1])
    }
  })

  it('스팬과 두께 치수는 준 값 그대로다', () => {
    // 그림은 두께를 부풀리지만 **치수는 부풀리지 않는다.**
    const b = leaf.build({ L: 1000, t: 8, n: 5 })
    expect(dimFor(b, 'L').value).toBe(1000)
    expect(dimFor(b, 't').value).toBe(8)
    expect(b.notes.some(t => t.includes('부풀려'))).toBe(true)
  })

  it('장수를 적어 준다', () => {
    expect(leaf.build({ L: 1000, t: 8, n: 6 }).tags[0].text).toBe('판 6장')
  })
})

describe('값이 아직 없을 때', () => {
  it('둘 다 보기 비율로 그리고 숫자를 안 적는다', () => {
    for (const spec of [coil, leaf]) {
      const b = spec.build({})
      expect(b.example, spec.id).toBe(true)
      expect(b.dims.every(d => d.value === null), spec.id).toBe(true)
    }
  })
})
