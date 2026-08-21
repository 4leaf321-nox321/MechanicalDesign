/**
 * 엑셀 클립보드 파싱.
 *
 * **틀려도 오류가 안 나고 값만 어긋나는** 종류다. 셀 안에 줄바꿈이 있는 표를
 * 붙여넣었을 때 한 셀이 둘로 쪼개지고 따옴표가 값에 남았는데, 그 상태로 저장돼
 * 한참 뒤 계산에서야 이상한 값으로 드러났다.
 */

import { describe, expect, it } from 'vitest'

import { flattenClipboardCells, parseClipboardMatrix } from './clipboard'

describe('보통의 엑셀 복사', () => {
  it.each([
    ['세로 3칸', 'SS400\nSM45C\nSCM440\n', ['SS400', 'SM45C', 'SCM440']],
    ['가로 3칸', 'SS400\tSM45C\tSCM440', ['SS400', 'SM45C', 'SCM440']],
    ['2행 2열', 'A\tB\nC\tD\n', ['A', 'B', 'C', 'D']],
    ['CRLF (윈도우)', 'A\r\nB\r\nC\r\n', ['A', 'B', 'C']],
    ['빈 셀은 버린다', 'A\n\nB\n', ['A', 'B']],
    ['앞뒤 공백 정리', '  A  \n B \n', ['A', 'B']],
    ['숫자 천단위', '1,000\n2,000\n', ['1,000', '2,000']],
  ])('%s', (_label, text, want) => {
    expect(flattenClipboardCells(text)).toEqual(want)
  })

  it('한 칸만 복사하면 가로채지 않는다 — 브라우저 기본 붙여넣기가 맞다', () => {
    expect(flattenClipboardCells('SS400')).toBeNull()
    expect(parseClipboardMatrix('SS400')).toBeNull()
  })

  it('빈 클립보드', () => {
    expect(flattenClipboardCells('')).toBeNull()
  })
})

describe('따옴표로 감싼 셀 — 엑셀이 이렇게 내보낸다', () => {
  it('셀 안의 줄바꿈은 한 셀로 유지된다', () => {
    expect(parseClipboardMatrix('"첫줄\n둘째줄"\tX\n')).toEqual([['첫줄\n둘째줄', 'X']])
  })

  it('셀 안의 탭도 한 셀', () => {
    expect(parseClipboardMatrix('"a\tb"\tX\n')).toEqual([['a\tb', 'X']])
  })

  it('"" 는 따옴표 한 글자', () => {
    expect(parseClipboardMatrix('"그는 ""A"" 라 함"\tX\n')).toEqual([['그는 "A" 라 함', 'X']])
  })

  it('셀 중간의 따옴표는 글자다 — 인치 표기가 살아야 한다', () => {
    expect(flattenClipboardCells('3" 배관\n4" 배관\n')).toEqual(['3" 배관', '4" 배관'])
  })
})

describe('표 붙여넣기', () => {
  it('행렬 모양을 그대로 돌려준다', () => {
    expect(parseClipboardMatrix('재료\t10\t20\nSS400\t245\t240\n')).toEqual([
      ['재료', '10', '20'],
      ['SS400', '245', '240'],
    ])
  })
})
