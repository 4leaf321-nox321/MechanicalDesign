/**
 * 표 조회 — 행 · 열 · 행열(교차).
 *
 * **가장 중요한 검사는 축 매칭이 조용히 어긋나지 않는가** 다. 사이값을 어느
 * 쪽으로 붙이는지, 범위 머리글을 어떻게 읽는지는 결과가 그럴듯하게 나오기
 * 때문에 틀려도 눈치채기 어렵다.
 */

import { describe, expect, it } from 'vitest'

import { evaluateTable } from './evaluators'
import { describeRange, parseRangeHeader, transposeTable } from './tableLookup'

const run = (table, symbols) => {
  const r = evaluateTable(table, symbols)
  return r.error ? `ERR(${r.error})` : r.value
}

//        │ 10 │ 20 │ 30      ← 열 머리글(두께)
//  SS400 │245 │240 │235
//  SM45C │343 │338 │330
const MATRIX = {
  lookup_mode: 'cell',
  columns: ['재료', '10', '20', '30'],
  rows: [
    ['SS400', '245', '240', '235'],
    ['SM45C', '343', '338', '330'],
  ],
  row_header_index: 0,
  row_lookup: { expression: 'mat', match_mode: 'exact' },
  column_lookup: { expression: 't', match_mode: 'exact' },
}
const cell = (extra, symbols) => run({ ...MATRIX, ...extra }, symbols)

describe('행열(교차) 조회 — 펼치지 않은 행렬표', () => {
  it('두 축이 만나는 칸을 꺼낸다', () => {
    expect(cell({}, { mat: 'SS400', t: 20 })).toBe(240)
    expect(cell({}, { mat: 'SM45C', t: 30 })).toBe(330)
  })

  it('찾지 못하면 어느 축인지 말해 준다', () => {
    expect(cell({}, { mat: 'XXX', t: 10 })).toBe('ERR(행 조회: 일치하는 머리글 없음: XXX)')
    expect(cell({}, { mat: 'SS400', t: 15 })).toBe('ERR(열 조회: 일치하는 머리글 없음: 15)')
  })
})

describe('축 매칭 — 사이값 15mm 를 어떻게 다루나', () => {
  const at15 = (mode) => cell(
    { column_lookup: { expression: 't', match_mode: mode } },
    { mat: 'SS400', t: 15 },
  )

  it.each([
    ['nearest', 245],      // 10 쪽이 더 가깝다(동률이면 앞)
    ['floor', 245],        // 10mm 구간
    ['ceiling', 240],      // 20mm 구간
    ['interpolate', 242.5],
  ])('%s → %s', (mode, want) => {
    expect(at15(mode)).toBe(want)
  })
})

describe('양 축 보간 — 쌍선형', () => {
  const BILINEAR = {
    lookup_mode: 'cell',
    columns: ['등급', '10', '20'],
    rows: [['100', '0', '10'], ['200', '20', '30']],
    row_header_index: 0,
    row_lookup: { expression: 'g', match_mode: 'interpolate' },
    column_lookup: { expression: 't', match_mode: 'interpolate' },
  }

  it.each([
    [{ g: 150, t: 15 }, 15],   // 네 모서리 정중앙
    [{ g: 150, t: 10 }, 10],   // 행만 중간
    [{ g: 100, t: 15 }, 5],    // 열만 중간
    [{ g: 100, t: 10 }, 0],    // 모서리
  ])('%o → %s', (symbols, want) => {
    expect(run(BILINEAR, symbols)).toBe(want)
  })
})

describe('범위 머리글', () => {
  const RANGED = {
    lookup_mode: 'cell',
    columns: ['재료', '10~20', '20 초과 40 이하', '40 초과'],
    rows: [['SS400', 'A', 'B', 'C']],
    row_header_index: 0,
    row_lookup: { expression: 'mat', match_mode: 'exact' },
    column_lookup: { expression: 't', match_mode: 'range' },
  }

  it.each([
    [15, 'A'],
    [20, 'A'],    // 구간이 붙어 있으면 앞선 것이 이긴다
    [21, 'B'],
    [100, 'C'],
  ])('%s → %s', (t, want) => {
    expect(run(RANGED, { mat: 'SS400', t })).toBe(want)
  })

  it('어느 구간에도 안 들면 멈춘다 — 가까운 구간에 붙이면 조용히 틀린다', () => {
    expect(run(RANGED, { mat: 'SS400', t: 5 }))
      .toBe('ERR(열 조회: 어느 구간에도 들지 않음: 5)')
  })
})

describe('범위 표기 읽기', () => {
  // 표기가 제각각이라 **잘못 읽고도 값을 내놓는 것**이 가장 나쁘다.
  // 화면에서는 describeRange 로 되비춰 사람이 확인한다.
  it.each([
    ['10~20', '10 이상 ~ 20 이하'],
    ['10-20', '10 이상 ~ 20 이하'],
    ['10 이상 20 미만', '10 이상 ~ 20 미만'],
    ['10 초과 20 이하', '10 초과 ~ 20 이하'],
    ['10 이상', '10 이상'],
    ['20 미만', '20 미만'],
    ['>=10', '10 이상'],
    ['≤20', '20 이하'],
    ['<20', '20 미만'],
    ['15', '15 만'],
  ])('"%s" → %s', (text, want) => {
    expect(describeRange(parseRangeHeader(text))).toBe(want)
  })

  it('못 읽는 표기는 null — 조용히 추측하지 않는다', () => {
    expect(parseRangeHeader('보통')).toBeNull()
    expect(parseRangeHeader('')).toBeNull()
  })
})

describe('열 조회 — 누운 표', () => {
  const LYING = {
    lookup_mode: 'column',
    columns: ['항목', '값1', '값2', '값3'],
    rows: [
      ['재료', 'SS400', 'SM45C', 'SCM440'],
      ['항복강도', '245', '343', '785'],
    ],
    label_column_index: 0,
    result_row_label: '항복강도',
    keys: [{ row_label: '재료', expression: 'mat', match_mode: 'exact' }],
  }

  it('조회 행으로 열을 고르고 결과 행의 값을 꺼낸다', () => {
    expect(run(LYING, { mat: 'SM45C' })).toBe(343)
    expect(run(LYING, { mat: 'SCM440' })).toBe(785)
  })

  it('없는 값이면 오류', () => {
    expect(run(LYING, { mat: 'XX' })).toBe('ERR(조회 키 1 매칭되는 행 없음)')
  })

  it('전치하면 항목 이름이 열 머리글이 된다', () => {
    const t = transposeTable(LYING, 0)
    expect(t.columns).toEqual(['재료', '항복강도'])
    expect(t.rows[0]).toEqual(['SS400', '245'])
  })
})

describe('기존 행 조회 (회귀)', () => {
  const LEGACY = {
    columns: ['재료', '두께', '항복강도'],
    rows: [['SS400', '10', '245'], ['SS400', '20', '240'], ['SM45C', '10', '343']],
    result_column_index: 2,
    keys: [
      { column_index: 0, expression: 'mat', match_mode: 'exact' },
      { column_index: 1, expression: 't', match_mode: 'nearest' },
    ],
  }

  it('lookup_mode 가 없으면 행 조회다', () => {
    expect(run(LEGACY, { mat: 'SS400', t: 18 })).toBe(240)
    expect(run(LEGACY, { mat: 'SM45C', t: 99 })).toBe(343)
  })

  it('옛 단일 키 모양도 계속 읽는다', () => {
    expect(run({
      columns: ['재료', '값'],
      rows: [['SS400', '245']],
      result_column_index: 1,
      key_column_index: 0, key_expression: 'mat', match_mode: 'exact',
    }, { mat: 'SS400' })).toBe(245)
  })

  it('참조 원본의 오류를 그대로 전달한다', () => {
    expect(run({ source_error: '참조하는 표를 찾을 수 없습니다.' }, {}))
      .toBe('ERR(참조하는 표를 찾을 수 없습니다.)')
  })
})
