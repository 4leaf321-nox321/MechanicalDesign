/**
 * 열을 지웠을 때 열 번호를 어디로 옮길지.
 *
 * 테이블 변수의 조회 키·결과 열과 보간 테이블의 x·y 열이 모두 열 번호를 들고
 * 있다. 규칙이 틀리면 **열 하나를 지운 뒤부터 조용히 다른 열을 읽는다** —
 * 오류가 나지 않아 눈으로 잡을 수 없다.
 */

import { describe, expect, it } from 'vitest'

import { shiftColumnIndex } from './TableGrid'

describe('shiftColumnIndex', () => {
  it.each([
    ['지운 것보다 뒤 → 한 칸 당겨진다', 2, 0, 1],
    ['지운 것보다 앞 → 그대로', 0, 2, 0],
    ['바로 뒤', 3, 1, 2],
    ['자기 자신이 지워짐 → 0번으로', 1, 1, 0],
    ['0번을 지우고 0번을 가리키던 경우', 0, 0, 0],
  ])('%s', (_label, index, removed, want) => {
    expect(shiftColumnIndex(index, removed)).toBe(want)
  })

  it('실제 상황 — 재료명을 지워도 항복강도를 계속 가리킨다', () => {
    const columns = ['재료명', '항복강도', '인장강도']
    const removed = 0
    const after = columns.filter((_, i) => i !== removed)
    // 항복강도(1) 를 가리키고 있었다.
    expect(after[shiftColumnIndex(1, removed)]).toBe('항복강도')
  })
})
