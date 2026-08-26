/**
 * 묻힘키 도해.
 *
 * 그림 기능이라 눈으로만 보면 안 된다 — **값이 어긋나도 그럴듯해 보인다.** Ø40 이
 * 실제로 반지름 20 자리에 그려졌는지는 숫자로만 확인할 수 있다.
 *
 * 여기서 지키는 것 중 제일 중요한 하나:
 *
 *     **비율을 속이지 않는다.**
 *
 * 값이 극단이면 그림이 읽기 어려워지고, 그때 「보기 좋게」 부풀리고 싶어진다.
 * 그런데 묻힘키 검토에서 사람이 확인하려는 것이 정확히 그 비율이라, 부풀린 그림은
 * 검토를 무력하게 만든다. 크게 그려 놓고 「키가 축에 비해 충분하다」 고 읽으면
 * 그건 계산이 아니라 착시다.
 */

import { describe, expect, it } from 'vitest'
import sunkKey from './sunkKey'

const OK = { d: 40, b: 12, L: 50, h: 8 }

/** 그려진 것 중 원 하나 — 축 단면이다. */
const shaft = (built) => built.shapes.find(s => s.type === 'circle')
/** 잘린 면으로 그려진 사각형들 — 키다(단면·옆면 둘). */
const keys = (built) => built.shapes.filter(s => s.type === 'rect' && s.role === 'cut')
const dimFor = (built, value) => built.dims.find(d => d.value === value)

describe('형상', () => {
  it('축은 지름 그대로 그려진다', () => {
    const b = sunkKey.build(OK)
    expect(b.ok).toBe(true)
    expect(shaft(b).r).toBe(20)
  })

  it('키는 축 위에 절반만 나온다 — 얹혀 있으면 묻힘키가 아니다', () => {
    const b = sunkKey.build(OK)
    const [section] = keys(b)
    const top = -20                       // 축 맨 위 (중심이 0, 반지름 20)
    expect(section.y).toBe(top - OK.h / 2)        // 위 절반은 보스 쪽
    expect(section.y + section.h).toBe(top + OK.h / 2)   // 아래 절반은 키홈 안
  })

  it('키 폭과 길이가 실제 값 그대로다', () => {
    const b = sunkKey.build(OK)
    const [section, side] = keys(b)
    expect(section.w).toBe(OK.b)
    expect(side.w).toBe(OK.L)
  })

  it('비율을 부풀리지 않는다 — 가는 키는 가늘게 그려진다', () => {
    // 이 시험이 이 파일의 이유다. d200 에 b10 이면 키는 축의 1/20 이어야 한다.
    const b = sunkKey.build({ d: 200, b: 10, L: 60, h: 8 })
    const [section] = keys(b)
    expect(section.w / (shaft(b).r * 2)).toBeCloseTo(10 / 200, 10)
  })
})

describe('치수', () => {
  it('네 값이 다 붙는다', () => {
    const b = sunkKey.build(OK)
    expect(b.dims.map(d => d.value).sort((x, y) => x - y)).toEqual([8, 12, 40, 50])
  })

  it('지름에는 Ø 가 붙는다', () => {
    expect(dimFor(sunkKey.build(OK), 40).label).toBe('Ø{}')
  })

  it('단위를 함께 실어 준다', () => {
    const b = sunkKey.build({ ...OK, _units: { d: 'mm', b: 'mm', L: 'mm', h: 'mm' } })
    expect(dimFor(b, 40).unit).toBe('mm')
  })

  it('키 높이 치수는 축 밖으로 나간다', () => {
    // 키 바로 옆에 두면 글자가 축 외곽선 위에 엉켜, 치수인지 형상인지 구분이 안 된다.
    const b = sunkKey.build(OK)
    const [, side] = keys(b)
    const h = dimFor(b, 8)
    expect(h.from[0] + h.offset).toBeGreaterThan(side.x + side.w)
  })
})

describe('값이 아직 없을 때', () => {
  it('그래도 그린다 — 도해의 첫 일은 형상을 보여 주는 것이다', () => {
    // 카드를 열자마자 「아직 그릴 수 없습니다」 만 보이면 도해를 붙인 뜻이
    // 절반 사라진다. 값이 없어도 「이게 묻힘키다」 는 말할 수 있어야 한다.
    const b = sunkKey.build({})
    expect(b.ok).toBe(true)
    expect(b.example).toBe(true)
    expect(b.shapes.length).toBeGreaterThan(0)
  })

  it('숫자를 하나도 안 적는다 — 기호만 남긴다', () => {
    // **이 시험이 핵심이다.** 보기 비율에 숫자를 붙이면 그림이 지어낸 값을
    // 사실처럼 말하게 된다. 기호(Ød·b·L)만 남기면 「어디가 무엇인지」 는
    // 말하면서 거짓말은 안 한다 — 교과서 그림이 하는 방식이다.
    const b = sunkKey.build({})
    expect(b.dims.every(d => d.value === null)).toBe(true)
    expect(b.dims.map(d => d.symbol).sort()).toEqual(['L', 'b', 'd', 'h'])
  })

  it('무엇이 있어야 진짜가 되는지 말한다', () => {
    expect(sunkKey.build({ d: 40, b: 12 }).missing).toEqual(['L'])
  })

  it('하나라도 빠지면 전부 보기 비율로 간다', () => {
    // 진짜 값과 보기 값을 섞어 그리면 어느 치수가 진짜인지 알 수 없다.
    const b = sunkKey.build({ d: 500, b: 12 })
    expect(b.example).toBe(true)
    expect(shaft(b).r).not.toBe(250)      // 준 d 를 안 쓴다
    expect(b.dims.every(d => d.value === null)).toBe(true)
  })

  it('0 과 음수는 값이 아니다', () => {
    expect(sunkKey.build({ ...OK, d: 0 }).example).toBe(true)
    expect(sunkKey.build({ ...OK, b: -5 }).example).toBe(true)
  })

  it('값이 다 차면 보기 비율을 벗는다', () => {
    const b = sunkKey.build(OK)
    expect(b.example).toBe(false)
    expect(b.dims.every(d => d.value !== null)).toBe(true)
  })
})

describe('그릴 수 없을 때', () => {

  it('키가 축보다 넓으면 억지로 그리지 않는다', () => {
    // 그리면 키가 축을 뚫고 나간 그림이 되고, 그게 우리 버그인지 값이 이상한
    // 건지 사람이 알 수 없다.
    const b = sunkKey.build({ d: 10, b: 12, L: 50 })
    expect(b.ok).toBe(false)
    expect(b.impossible).toContain('축 지름')
  })
})

describe('키 높이를 안 줬을 때', () => {
  it('정사각으로 그리고 그렇게 그렸다고 적는다', () => {
    // 조용히 아무 값이나 넣으면 그림이 실제와 다른데 아무도 모른다.
    const b = sunkKey.build({ d: 40, b: 12, L: 50 })
    expect(b.ok).toBe(true)
    expect(keys(b)[0].h).toBe(12)
    expect(b.notes.join()).toContain('h = b')
  })

  it('없는 값에는 치수를 안 붙인다', () => {
    // 안 준 값에 치수가 붙으면 사람은 그것을 자기가 정한 값으로 읽는다.
    const b = sunkKey.build({ d: 40, b: 12, L: 50 })
    expect(b.dims.map(d => d.value).sort((x, y) => x - y)).toEqual([12, 40, 50])
  })
})

describe('담는 상자', () => {
  it('치수까지 다 들어간다 — 안 그러면 글자가 잘린다', () => {
    const b = sunkKey.build(OK)
    const below = Math.max(...b.dims.map(d => (
      Math.abs(d.to[1] - d.from[1]) < Math.abs(d.to[0] - d.from[0])
        ? d.from[1] + d.offset : d.from[1])))
    expect(b.box.y + b.box.h).toBeGreaterThanOrEqual(below)
  })
})
