/**
 * 기록의 입력값을 지금 카드에 맞추는 규칙.
 *
 * 기록은 변수 **id** 로 값을 들고 있는데 카드는 그 뒤로 바뀐다. 변수를 지웠다
 * 다시 만들면 기호는 같고 id 만 달라진다. id 만 보고 맞추면 그런 입력이 **조용히
 * 빠진 채** "불러왔습니다" 가 뜨고, 사람은 빈칸을 못 본 채로 계산한다.
 *
 * 그래서 여기서 지키는 것은 둘이다.
 *
 *   못 맞춘 것을 **말한다**       조용한 실패보다 시끄러운 성공이 낫다
 *   기호로 한 번 더 찾아본다      id 가 바뀌었을 뿐 같은 변수인 경우
 */

import { describe, expect, it } from 'vitest'
import { mapRecordInputs } from '../components/LoadInputsDialog'

const VARS = [
  { id: 10, name: '하중', symbol: 'F' },
  { id: 11, name: '단면적', symbol: 'A' },
]

describe('기록 입력값 맞추기', () => {
  it('id 가 그대로면 그대로 맞춘다', () => {
    const got = mapRecordInputs(
      { inputs: { 10: 600, 11: 30 }, definition_snapshot: [] }, VARS)

    expect(got.values).toEqual({ 10: 600, 11: 30 })
    expect(got.matched).toBe(2)
    expect(got.missing).toEqual([])
  })

  it('id 가 바뀌었어도 기호가 같으면 찾아낸다', () => {
    // 변수를 지웠다 다시 만든 카드. 기호는 F 그대로, id 만 99 → 10.
    const record = {
      inputs: { 99: 600 },
      definition_snapshot: [{ id: 99, name: '하중', symbol: 'F' }],
    }
    const got = mapRecordInputs(record, VARS)

    expect(got.values).toEqual({ 10: 600 })
    expect(got.missing).toEqual([])
  })

  it('기호가 없으면 이름으로 찾는다', () => {
    const record = {
      inputs: { 99: 600 },
      definition_snapshot: [{ id: 99, name: '하중', symbol: '' }],
    }
    expect(mapRecordInputs(record, VARS).values).toEqual({ 10: 600 })
  })

  it('사라진 변수는 이름을 대며 빠뜨렸다고 말한다', () => {
    const record = {
      inputs: { 10: 600, 98: 7 },
      definition_snapshot: [{ id: 98, name: '안전율', symbol: 'n' }],
    }
    const got = mapRecordInputs(record, VARS)

    expect(got.values).toEqual({ 10: 600 })
    expect(got.matched).toBe(1)
    expect(got.missing).toEqual(['안전율'])
  })

  it('스냅샷조차 없으면 변수 번호로라도 말한다', () => {
    const got = mapRecordInputs({ inputs: { 77: 1 }, definition_snapshot: [] }, VARS)
    expect(got.missing).toEqual(['변수 77'])
  })

  it('0 과 빈 문자열도 값이다 — 빠뜨리지 않는다', () => {
    // falsy 라고 건너뛰면 "0 으로 계산한 기록" 이 빈칸으로 돌아온다.
    const got = mapRecordInputs(
      { inputs: { 10: 0, 11: '' }, definition_snapshot: [] }, VARS)

    expect(got.values).toEqual({ 10: 0, 11: '' })
    expect(got.matched).toBe(2)
  })

  it('배열 입력도 그대로 온다', () => {
    const got = mapRecordInputs(
      { inputs: { 10: [1, 2, 3] }, definition_snapshot: [] }, VARS)
    expect(got.values[10]).toEqual([1, 2, 3])
  })

  it('입력이 비어 있으면 아무것도 채우지 않는다', () => {
    const got = mapRecordInputs({ inputs: {}, definition_snapshot: [] }, VARS)
    expect(got.values).toEqual({})
    expect(got.matched).toBe(0)
    expect(got.missing).toEqual([])
  })

  it('겹친 기호는 먼저 만든 쪽을 쓴다', () => {
    const dupes = [
      { id: 10, name: '하중', symbol: 'F' },
      { id: 12, name: '하중2', symbol: 'F' },
    ]
    const record = {
      inputs: { 99: 600 },
      definition_snapshot: [{ id: 99, name: '옛 하중', symbol: 'F' }],
    }
    expect(mapRecordInputs(record, dupes).values).toEqual({ 10: 600 })
  })
})
