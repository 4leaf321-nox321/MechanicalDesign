/**
 * 모어원.
 *
 * 이 도해가 조용히 틀리는 자리는 **τ 의 부호**다. SVG 는 y 가 아래로 가므로
 * 「τ 를 위로 양수로 잡는다」 고 적어 놓고 값을 그대로 쓰면, 원이 위아래로
 * 뒤집힌 채 그려진다. 주응력도 최대전단도 **크기는 다 맞고** 회전 방향만
 * 반대가 되므로, 그림만 봐서는 아무도 못 잡는다.
 *
 * 그래서 여기서는 그림의 좌표를 직접 잰다.
 */

import { describe, expect, it } from 'vitest'
import mohr from './mohr'

const circleOf = (b) => b.shapes.find(s => s.type === 'circle')
const tagText = (b, head) => b.tags.find(t => t.text.startsWith(head))
/** X·Y 를 잇는 지름선. 표시(×)가 아니라 두 점을 잇는 긴 선이다. */
const chord = (b) => {
  const lines = b.shapes.filter(s => s.type === 'line' && s.role === 'ghost')
  return lines.reduce((a, s) => (
    Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > Math.hypot(a.x2 - a.x1, a.y2 - a.y1) ? s : a
  ))
}

describe('원이 값과 맞는다', () => {
  // σx=80, σy=-20, τxy=30 → 중심 30, 반지름 √(50²+30²) = 58.3095
  const b = mohr.build({ sx: 80, sy: -20, txy: 30 })

  it('중심은 두 수직응력의 한가운데다', () => {
    expect(circleOf(b).cx).toBeCloseTo(30, 9)
    expect(circleOf(b).cy).toBe(0)
  })

  it('반지름이 최대전단응력이다', () => {
    expect(circleOf(b).r).toBeCloseTo(Math.hypot(50, 30), 9)
    expect(tagText(b, 'τmax').text).toContain('58.31')
  })

  it('주응력은 원이 가로축을 자르는 자리다', () => {
    expect(tagText(b, 'σ1').text).toContain('88.31')
    expect(tagText(b, 'σ2').text).toContain('-28.31')
  })
})

describe('τ 의 부호', () => {
  it('τxy 가 양수면 X 가 가로축 **위**에 온다', () => {
    // **이 시험이 이 파일의 이유다.** SVG 는 y 가 아래로 가므로 위쪽이 음수다.
    // 부호를 안 뒤집으면 여기서 걸린다 — 그림만 봐서는 안 걸린다.
    const b = mohr.build({ sx: 80, sy: -20, txy: 30 })
    const line = chord(b)
    const X = line.x1 === 80 ? [line.x1, line.y1] : [line.x2, line.y2]
    expect(X[0]).toBe(80)
    expect(X[1]).toBeLessThan(0)
  })

  it('X 와 Y 는 중심을 사이에 두고 마주 본다', () => {
    const b = mohr.build({ sx: 80, sy: -20, txy: 30 })
    const line = chord(b)
    expect((line.x1 + line.x2) / 2).toBeCloseTo(30, 9)
    expect((line.y1 + line.y2) / 2).toBeCloseTo(0, 9)
  })

  it('τ 를 뒤집으면 원이 아니라 두 점만 뒤집힌다 — 크기는 그대로다', () => {
    // 부호를 틀려도 σ1·σ2·τmax 가 다 맞는다는 것을 시험으로 남겨 둔다.
    // 「값이 맞으니 그림도 맞다」 는 판단이 왜 안 통하는지가 여기 있다.
    const up = mohr.build({ sx: 80, sy: -20, txy: 30 })
    const down = mohr.build({ sx: 80, sy: -20, txy: -30 })
    expect(circleOf(down).r).toBeCloseTo(circleOf(up).r, 9)
    expect(tagText(down, 'σ1').text).toBe(tagText(up, 'σ1').text)
    expect(chord(down).y1).toBeCloseTo(-chord(up).y1, 9)
  })

  it('최대전단 표시선이 원 꼭대기로 간다', () => {
    const b = mohr.build({ sx: 80, sy: -20, txy: 30 })
    const radius = b.shapes.find(s => s.type === 'line' && s.role === 'ghost'
                                      && s.x1 === s.x2 && s.y1 === 0)
    expect(radius).toBeDefined()
    expect(radius.y2).toBeCloseTo(-circleOf(b).r, 9)
  })
})

describe('부호가 뜻을 갖는다', () => {
  it('압축(음수)을 값 없음으로 보지 않는다', () => {
    // 다른 도해처럼 양수만 받으면 압축응력이 조용히 사라져, 인장만 걸린
    // 그림이 된다. 여기서는 음수도 0 도 정상이다.
    const b = mohr.build({ sx: -60, sy: -100, txy: 15 })
    expect(b.example).toBe(false)
    expect(circleOf(b).cx).toBeCloseTo(-80, 9)
  })

  it('0 도 값이다 — 순수전단이 그려진다', () => {
    const b = mohr.build({ sx: 0, sy: 0, txy: 40 })
    expect(b.example).toBe(false)
    expect(circleOf(b).cx).toBe(0)
    expect(circleOf(b).r).toBeCloseTo(40, 9)
    expect(tagText(b, 'σ1').text).toContain('40')
    expect(tagText(b, 'σ2').text).toContain('-40')
  })

  it('셋 다 0 이면 그릴 원이 없다', () => {
    const b = mohr.build({ sx: 0, sy: 0, txy: 0 })
    expect(b.ok).toBe(false)
    expect(b.impossible).toContain('0')
  })
})

describe('말해 주는 것', () => {
  it('부호 규약을 **늘** 밝힌다', () => {
    // 안 밝히면 각도를 반대로 돌려 읽는다.
    for (const v of [{}, { sx: 80, sy: -20, txy: 30 }, { sx: 0, sy: 0, txy: 40 }]) {
      expect(mohr.build(v).notes.some(t => t.includes('규약'))).toBe(true)
    }
  })

  it('전단이 0 이면 준 축이 이미 주축이라고 말한다', () => {
    const b = mohr.build({ sx: 90, sy: 30, txy: 0 })
    expect(b.notes.some(t => t.includes('주축'))).toBe(true)
    // 겹쳐 놓지 않는다 — X·Y 가 주응력 자리와 같은 점이다.
    expect(b.tags.some(t => t.text.startsWith('X'))).toBe(false)
  })

  it('주응력 부호가 갈리면 짚어 준다', () => {
    const both = mohr.build({ sx: 80, sy: -20, txy: 30 })
    expect(both.notes.some(t => t.includes('당기고'))).toBe(true)
    const oneWay = mohr.build({ sx: 120, sy: 60, txy: 10 })
    expect(oneWay.notes.some(t => t.includes('당기고'))).toBe(false)
  })
})

describe('값이 아직 없을 때', () => {
  it('보기 값으로 그리고 숫자를 안 적는다', () => {
    const b = mohr.build({ sx: 80 })
    expect(b.example).toBe(true)
    expect(b.missing.sort()).toEqual(['sy', 'txy'])
    expect(tagText(b, 'σ1').text).toBe('σ1')
    expect(tagText(b, 'τmax').text).toBe('τmax')
  })
})
