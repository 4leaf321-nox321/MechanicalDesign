/**
 * 도해와 카드를 잇는 층.
 *
 * 여기가 틀리면 **형상은 맞고 숫자만 틀린다.** 축 그림은 축 그림대로 나오는데
 * `d` 자리에 키 폭이 들어가 있는 식이라, 그림이 그럴듯해서 아무도 안 본다.
 * 도해 하나하나의 시험이 못 잡는 자리라 따로 막는다.
 */

import { describe, expect, it } from 'vitest'
import { FIGURES, autoWire, byKind, figureOf, unwired, valuesFor } from './index'
import { SAMPLE } from './samples'

/** 변수 목록을 `{id, symbol}` 로 짧게 적기. */
const vars = (...pairs) => pairs.map(([id, symbol]) => ({ id, symbol }))


/** 값이 없을 때와 있을 때, 두 벌 다. */
const bothWays = (f) => [f.build({}), f.build(SAMPLE[f.id] || {})]

const wordsOf = (built) => [
  ...(built.notes || []),
  ...(built.tags || []).map(t => t.text),
]

describe('도해 목록', () => {
  it('id 가 겹치지 않는다', () => {
    // 겹치면 뒤엣것이 앞엣것을 덮어, 저장된 카드가 다른 그림을 그리게 된다.
    const ids = FIGURES.map(f => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('모두 이름·설명·칸 목록·그리는 법을 갖췄다', () => {
    for (const f of FIGURES) {
      expect(f.name, f.id).toBeTruthy()
      expect(f.summary, f.id).toBeTruthy()
      expect(f.params.length, f.id).toBeGreaterThan(0)
      expect(typeof f.build, f.id).toBe('function')
    }
  })

  it('칸 이름이 한 도해 안에서 겹치지 않는다', () => {
    for (const f of FIGURES) {
      const keys = f.params.map(p => p.key)
      expect(new Set(keys).size, f.id).toBe(keys.length)
    }
  })

  it('아무 값 없이도 그려진다 — 갓 만든 도해가 빈 화면이면 안 된다', () => {
    for (const f of FIGURES) {
      const built = f.build({})
      expect(built.ok, f.id).toBe(true)
      expect(built.example, f.id).toBe(true)
      // 값이 없는데 숫자가 적히면 그림이 없는 값을 지어낸 것이다.
      expect(built.dims.every(d => d.value === null), f.id).toBe(true)
    }
  })

  it('모든 도해에 실제 값 보기가 있다', () => {
    // 없으면 아래 시험들이 값 없는 쪽만 보고 조용히 통과한다.
    for (const f of FIGURES) expect(SAMPLE[f.id], f.id).toBeDefined()
  })

  it('실제 값으로도 그려진다', () => {
    for (const f of FIGURES) {
      const built = f.build(SAMPLE[f.id])
      expect(built.ok, `${f.id}: ${built.impossible || ''}`).toBe(true)
      expect(built.example, f.id).toBe(false)
    }
  })

  it('말글에 마크다운이 새어 나오지 않는다', () => {
    // 노트와 이름표는 마크다운을 렌더하지 않는다. 별표를 쓰면 그대로 글자로
    // 나와서, 강조하려던 곳이 오히려 지저분해진다.
    //
    // **값이 있을 때도 본다.** 그런 말글은 대개 값이 있어야 나오므로, 빈 값만
    // 보는 시험은 아무것도 안 잡는다.
    for (const f of FIGURES) {
      for (const built of bothWays(f)) {
        for (const text of wordsOf(built)) {
          expect(String(text), `${f.id}: ${text}`).not.toMatch(/\*\*|__|`/)
        }
      }
    }
  })

  it('모르는 종류는 없다고 답한다', () => {
    expect(figureOf('그런거없음')).toBeNull()
    expect(byKind.shaft).toBe(FIGURES.find(f => f.id === 'shaft'))
  })
})

describe('카드에서 값 모으기', () => {
  const figure = { kind: 'shaft', mapping: { d: 7, L: 8 } }

  it('값과 단위를 칸 이름으로 옮긴다', () => {
    const got = valuesFor(figure, (id) => (
      id === 7 ? { value: 40, unit: 'mm' } : { value: 120, unit: 'mm' }
    ))
    expect(got.d).toBe(40)
    expect(got.L).toBe(120)
    expect(got._units).toEqual({ d: 'mm', L: 'mm' })
  })

  it('빈 값은 **아예 빼고** 넘긴다 — 0 으로 채우지 않는다', () => {
    // 0 으로 채우면 도해가 「그릴 수 있다」 고 판단해 납작한 형상을 그리고,
    // 사람은 그것을 계산 결과로 읽는다.
    for (const empty of [null, undefined, '']) {
      const got = valuesFor(figure, (id) => (
        id === 7 ? { value: 40, unit: 'mm' } : { value: empty }
      ))
      expect('L' in got).toBe(false)
      expect(got.d).toBe(40)
    }
  })

  it('변수 자체가 사라졌어도 넘어간다', () => {
    const got = valuesFor(figure, () => null)
    expect(got).toEqual({ _units: {} })
  })

  it('단위가 없으면 단위 칸도 안 만든다', () => {
    const got = valuesFor({ kind: 'gear', mapping: { z: 3 } },
                          () => ({ value: 24 }))
    expect(got.z).toBe(24)
    expect(got._units).toEqual({})
  })

  it('배선이 아예 없으면 빈 채로 준다', () => {
    expect(valuesFor(null, () => ({ value: 1 }))).toEqual({ _units: {} })
  })
})

describe('아직 안 묶인 칸', () => {
  it('**꼭 필요한** 칸만 센다', () => {
    // 있으면 좋은 칸까지 세면 「덜 됐습니다」 가 늘 떠 있어 아무도 안 읽는다.
    const spec = figureOf('sunk_key')
    const required = spec.params.filter(p => p.required).map(p => p.key)
    expect(unwired({ kind: 'sunk_key', mapping: {} })).toEqual(required)
    expect(required).not.toContain('h')
  })

  it('다 묶이면 빈 목록이다', () => {
    expect(unwired({ kind: 'sunk_key', mapping: { d: 1, b: 2, L: 3 } }))
      .toEqual([])
  })

  it('모르는 종류면 빈 목록이다', () => {
    expect(unwired({ kind: '그런거없음', mapping: {} })).toEqual([])
  })
})

describe('기호가 같은 변수를 저절로 물리기', () => {
  it('교과서 기호가 그대로 맞는다', () => {
    const wired = autoWire('sunk_key', vars([1, 'd'], [2, 'b'], [3, 'L'], [4, 'h']))
    expect(wired).toEqual({ d: 1, b: 2, L: 3, h: 4 })
  })

  it('도해가 안 쓰는 변수는 안 물린다', () => {
    // 카드에는 변수가 스물이어도 도해가 읽는 칸은 넷이다.
    const wired = autoWire('sunk_key',
                           vars([1, 'd'], [2, 'b'], [3, 'L'], [9, 'tau'], [10, 'T']))
    expect(Object.keys(wired).sort()).toEqual(['L', 'b', 'd'])
  })

  it('맞는 기호가 없으면 그 칸을 비워 둔다 — 아무거나 넣지 않는다', () => {
    expect(autoWire('sunk_key', vars([1, 'x'], [2, 'y']))).toEqual({})
  })

  it('기호가 겹치면 **먼저 나온 것**을 남긴다', () => {
    // 카드가 이미 이상한 것이다. 조용히 뒤엣것으로 바꾸면 어느 것이 잡혔는지
    // 알 수 없어, 숫자가 틀린 이유를 못 찾는다.
    expect(autoWire('sunk_key', vars([1, 'd'], [5, 'd'])).d).toBe(1)
  })

  it('기호에 붙은 공백은 무시하고, 빈 기호는 안 센다', () => {
    const wired = autoWire('sunk_key', [
      { id: 1, symbol: ' d ' }, { id: 2, symbol: '' }, { id: 3, symbol: null },
    ])
    expect(wired).toEqual({ d: 1 })
  })

  it('대소문자는 구별한다 — D 와 d 는 다른 값이다', () => {
    // 베어링에서 D 는 바깥지름, d 는 안지름이다. 뭉뚱그리면 안팎이 뒤집힌다.
    const wired = autoWire('bearing', vars([1, 'D'], [2, 'd'], [3, 'B']))
    expect(wired).toEqual({ D: 1, d: 2, B: 3 })
  })

  it('모르는 종류면 아무것도 안 물린다', () => {
    expect(autoWire('그런거없음', vars([1, 'd']))).toEqual({})
  })

  it('변수 목록이 없어도 넘어간다', () => {
    expect(autoWire('shaft', null)).toEqual({})
  })
})
