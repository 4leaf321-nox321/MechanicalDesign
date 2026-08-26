/**
 * 평기어 도해.
 *
 * 기어 그림에서 **선의 종류가 곧 뜻**이다. 피치원을 실선으로 그리면 재료의
 * 경계처럼 보이는데, 피치원은 물체의 모서리가 아니라 약속된 기준이다. 그 구분이
 * 무너지면 그림이 「여기까지가 쇠다」 라고 거짓말을 한다.
 */

import { describe, expect, it } from 'vitest'
import gear from './gear'

const circles = (b) => b.shapes.filter(s => s.type === 'circle')
const teeth = (b) => b.shapes.find(s => s.type === 'path')
const pitchCircle = (b) => circles(b).find(s => s.role === 'center')
const dimFor = (b, symbol) => b.dims.find(d => d.symbol === symbol)

describe('크기', () => {
  const b = gear.build({ m: 3, z: 20 })

  it('피치원은 m × z 다', () => {
    expect(pitchCircle(b).r).toBe(30)
    expect(dimFor(b, 'd').value).toBe(60)
  })

  it('이끝원은 피치원 + 2m', () => {
    expect(dimFor(b, 'da').value).toBe(66)
  })

  it('피치원을 따로 주면 그것을 믿는다', () => {
    // 카드가 이미 구해 둔 값이 있으면 다시 구하지 않는다.
    const given = gear.build({ m: 3, z: 20, d: 61 })
    expect(pitchCircle(given).r).toBe(30.5)
  })
})

describe('선의 뜻', () => {
  const b = gear.build({ m: 3, z: 20 })

  it('피치원은 중심선이다 — 재료의 경계가 아니다', () => {
    expect(pitchCircle(b)).toBeDefined()
    expect(pitchCircle(b).role).toBe('center')
  })

  it('이는 잘린 면으로 그린다', () => {
    expect(teeth(b)).toBeDefined()
    expect(teeth(b).role).toBe('cut')
  })
})

describe('이를 그리는 한도', () => {
  it('잇수만큼 이를 그린다', () => {
    // 20개면 꼭짓점이 이 하나당 넷.
    const b = gear.build({ m: 3, z: 20 })
    expect((teeth(b).d.match(/L/g) || []).length).toBe(20 * 4 - 1)
  })

  it('너무 많으면 원만 그리고 그 사실을 적는다', () => {
    // 이를 다 그리면 오히려 안 읽힌다. 조용히 생략하면 「이가 없는 기어」 가 된다.
    const b = gear.build({ m: 3, z: 72 })
    expect(teeth(b)).toBeUndefined()
    expect(b.notes.join()).toContain('72')
  })
})

describe('치수 자리', () => {
  it('기어 밖으로 나간다 — 안이면 이 사이를 지나간다', () => {
    const b = gear.build({ m: 3, z: 20 })
    const rTip = dimFor(b, 'da').value / 2
    expect(dimFor(b, 'd').offset).toBeGreaterThan(rTip)
    expect(dimFor(b, 'da').offset).toBeGreaterThan(dimFor(b, 'd').offset)
  })
})

describe('그릴 수 없을 때', () => {
  it('잇수가 너무 적으면 억지로 안 그린다', () => {
    const b = gear.build({ m: 3, z: 3 })
    expect(b.ok).toBe(false)
    expect(b.impossible).toContain('잇수')
  })
})

describe('값이 아직 없을 때', () => {
  it('보기 비율로 그리고 숫자도 이름표도 안 적는다', () => {
    const b = gear.build({ m: 3 })
    expect(b.example).toBe(true)
    expect(b.missing).toEqual(['z'])
    expect(b.dims.every(d => d.value === null)).toBe(true)
    expect(b.tags).toEqual([])
  })
})
