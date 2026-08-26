/**
 * 필릿 용접 도해.
 *
 * 이 도해는 **목두께가 다리길이가 아니라는 것**을 말하려고 있다. 둘을 섞어 쓰면
 * 응력이 √2 배 — 40% — 어긋나는데 아무 오류도 안 난다. 용접 검토에서 가장 흔한
 * 실수다.
 *
 * 그래서 여기서 지키는 것은 하나다: **그림과 숫자가 어긋나면 말한다.**
 */

import { describe, expect, it } from 'vitest'
import filletWeld from './filletWeld'

const ROOT2 = Math.SQRT2
const weld = (b) => b.shapes.find(s => s.type === 'path')
const legs = (b) => b.dims.filter(d => d.symbol === 'z')

describe('형상', () => {
  const b = filletWeld.build({ z: 6 })

  it('용접 살은 삼각형이고 잘린 면이다', () => {
    expect(weld(b)).toBeDefined()
    expect(weld(b).role).toBe('cut')
  })

  it('다리길이를 양쪽에 잰다 — 둘이 같다는 것도 그림이 말한다', () => {
    expect(legs(b)).toHaveLength(2)
    expect(legs(b).every(d => d.value === 6)).toBe(true)
  })

  it('목두께는 치수선 대신 자리를 짚는다', () => {
    // 비스듬해서 치수선으로 그리면 화살표와 보조선이 그림을 덮는다.
    expect(b.tags).toHaveLength(1)
    expect(b.tags[0].text).toContain('a =')
  })
})

describe('목두께를 안 줬을 때', () => {
  const b = filletWeld.build({ z: 6 })

  it('다리길이에서 구하고 그렇게 구했다고 적는다', () => {
    expect(b.tags[0].text).toContain(String(Math.round(6 / ROOT2 * 100) / 100))
    expect(b.notes.join()).toContain('z / √2')
  })
})

describe('그림과 숫자가 어긋날 때', () => {
  it('준 목두께가 그림과 다르면 말한다', () => {
    // **이 시험이 이 파일의 이유다.** 그림에는 4.24 가 그려져 있는데 이름표만
    // 5 라고 적히면, 이 도해가 막으려던 바로 그 혼동을 도해가 저지르는 셈이다.
    const b = filletWeld.build({ z: 6, a: 5 })
    expect(b.notes.join()).toContain('4.24')
    expect(b.notes.join()).toContain('다릅니다')
  })

  it('목두께와 다리길이를 같게 적었으면 그것을 짚는다', () => {
    // 가장 흔한 실수다. 그대로 두면 응력이 √2 배 어긋난다.
    const b = filletWeld.build({ z: 6, a: 6 })
    expect(b.notes.join()).toContain('섞어')
  })

  it('평평한 필릿의 값이면 아무 말도 안 한다', () => {
    const b = filletWeld.build({ z: 6, a: 6 / ROOT2 })
    expect(b.notes).toEqual([])
  })
})

describe('값이 아직 없을 때', () => {
  it('보기 비율로 그리고 기호만 남긴다', () => {
    const b = filletWeld.build({})
    expect(b.example).toBe(true)
    expect(b.dims.every(d => d.value === null)).toBe(true)
    expect(b.tags[0].text).toBe('a')
  })
})
