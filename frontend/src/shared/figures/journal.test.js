/**
 * 저널 베어링 도해.
 *
 * 이 계산에서 조용히 틀리는 자리는 **면압을 무엇으로 나누느냐**다. `d·l` 은
 * 축을 옆에서 본 네모난 그림자(투영면적)이지 축과 닿는 반원통 겉넓이가 아니다.
 * 겉넓이로 나누면 면압이 절반 이하로 나오고, 계산은 통과하고 베어링은 눌러 붙는다.
 *
 * 그림이 할 일은 그 네모를 실제로 그려 놓는 것이다.
 */

import { describe, expect, it } from 'vitest'
import journal from './journal'

const shell = (b) => b.shapes.filter(s => s.type === 'rect' && s.role === 'cut')
const face = (b) => b.shapes.find(s => s.type === 'rect' && s.role === 'front')
const dimFor = (b, symbol) => b.dims.find(d => d.symbol === symbol)

describe('투영면적', () => {
  const b = journal.build({ d: 50, l: 60, W: 12000 })

  it('옆면 네모가 정확히 d × l 이다', () => {
    // **이 시험이 이 파일의 이유다.** 이 네모가 곧 면압을 나누는 넓이다.
    expect(face(b).h).toBeCloseTo(50, 9)
    expect(face(b).w).toBeCloseTo(60, 9)
  })

  it('그 자리를 이름표로 짚는다', () => {
    expect(b.tags.some(t => t.text === 'd · l')).toBe(true)
  })

  it('겉넓이가 아니라고 말한다', () => {
    expect(b.notes.some(t => t.includes('겉넓이가 아닙니다'))).toBe(true)
  })
})

describe('형상', () => {
  const b = journal.build({ d: 50, l: 60 })

  it('부시가 저널 위아래를 감싼다', () => {
    const [top, bottom] = shell(b)
    expect(top.h).toBeCloseTo(bottom.h, 9)
    expect(bottom.y - (top.y + top.h)).toBeCloseTo(50, 9)
  })

  it('저널은 단면을 안 친다 — 앞에 놓여 부시를 가린다', () => {
    expect(face(b).role).toBe('front')
  })

  it('단면도에 부시가 도넛으로 나온다 — 안쪽 원이 저널이다', () => {
    const ring = b.shapes.find(s => s.type === 'circle' && s.role === 'cut')
    expect(ring.inner).toBeCloseTo(25, 9)
    expect(ring.r).toBeGreaterThan(ring.inner)
  })

  it('지름과 길이를 잰다', () => {
    expect(dimFor(b, 'd').value).toBe(50)
    expect(dimFor(b, 'l').value).toBe(60)
  })
})

describe('말해 주는 것', () => {
  it('l/d 비를 알려 준다', () => {
    expect(journal.build({ d: 50, l: 60 }).notes.some(t => t.includes('l/d = 1.2')))
      .toBe(true)
  })

  it('하중이 없으면 화살표를 안 그린다', () => {
    expect(journal.build({ d: 50, l: 60 }).flows).toHaveLength(0)
    expect(journal.build({ d: 50, l: 60, W: 9000 }).flows).toHaveLength(2)
  })

  it('부시 살두께는 계산에 안 쓰인다고 말한다', () => {
    expect(journal.build({ d: 50, l: 60 }).notes.some(t => t.includes('살두께')))
      .toBe(true)
  })
})

describe('값이 아직 없을 때', () => {
  it('보기 비율로 그리고 숫자를 안 적는다', () => {
    const b = journal.build({ d: 50 })
    expect(b.example).toBe(true)
    expect(b.missing).toEqual(['l'])
    expect(b.dims.every(d => d.value === null)).toBe(true)
  })
})
