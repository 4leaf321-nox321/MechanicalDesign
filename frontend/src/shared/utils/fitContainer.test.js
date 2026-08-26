/**
 * 컨테이너 맞춤.
 *
 * 여기서 지키는 것 둘:
 *
 *   **격자 셈이 격자와 같다.** 칸 수를 픽셀로, 픽셀을 칸 수로 바꾸는 식이
 *   react-grid-layout 이 실제로 쓰는 것과 어긋나면, 맞춤은 한 칸씩 모자라는
 *   높이를 조용히 준다.
 *
 *   **스크롤로 숨은 높이까지 센다.** 보이는 높이만 재면 맞춤을 눌러도 여전히
 *   잘린 채로 남고, 사람은 기능이 고장 났다고 여긴다.
 */

import { describe, expect, it } from 'vitest'
import {
  GRID_MARGIN, MIN_ROWS, ROW_HEIGHT, fitRows, measureNatural, neededHeight,
  pixelsFor, rowsFor,
} from './fitContainer'

describe('격자 셈', () => {
  it('칸 수와 픽셀이 서로를 되돌린다', () => {
    // 이 둘이 어긋나면 맞춤이 매번 조금씩 틀린다.
    for (const rows of [2, 3, 5, 9, 20]) {
      expect(rowsFor(pixelsFor(rows))).toBe(rows)
    }
  })

  it('한 칸의 실제 높이가 격자와 같다', () => {
    expect(pixelsFor(1)).toBe(ROW_HEIGHT)
    expect(pixelsFor(2)).toBe(ROW_HEIGHT * 2 + GRID_MARGIN)
  })

  it('모자라느니 넘친다 — 1px 만 넘어도 한 칸 더', () => {
    // 모자라면 내용이 잘리고, 잘린 것은 스크롤 안에 숨어 안 보인다.
    expect(rowsFor(pixelsFor(3) + 1)).toBe(4)
  })

  it('아무리 작아도 최소 칸은 지킨다', () => {
    expect(rowsFor(1)).toBe(MIN_ROWS)
    expect(rowsFor(0)).toBe(MIN_ROWS)
    expect(rowsFor(-100)).toBe(MIN_ROWS)
  })

  it('못 잰 값에는 안 터진다', () => {
    expect(rowsFor(NaN)).toBe(MIN_ROWS)
    expect(rowsFor(undefined)).toBe(MIN_ROWS)
  })
})

/** 브라우저 요소 흉내. `getComputedStyle` 이 보는 것만 채운다. */
function fakeBox(children, pad = 20, border = 2) {
  const box = {
    style: { height: '' },
    children,
    __style: {
      paddingTop: `${pad}px`, paddingBottom: `${pad}px`,
      borderTopWidth: `${border}px`, borderBottomWidth: `${border}px`,
    },
  }
  return box
}
const fakeChild = (offset, scroll = offset, margin = 0, extra = {}) => ({
  offsetHeight: offset,
  scrollHeight: scroll,
  __style: { marginTop: `${margin}px`, marginBottom: '0px', display: 'block', ...extra },
})

function withFakeWindow(run) {
  const had = global.window
  global.window = { getComputedStyle: (el) => el.__style }
  try {
    return run()
  } finally {
    if (had === undefined) delete global.window
    else global.window = had
  }
}

describe('필요한 높이 재기', () => {
  it('여백·테두리·자식을 다 더한다', () => {
    const box = fakeBox([fakeChild(100), fakeChild(60, 60, 16)])
    expect(withFakeWindow(() => neededHeight(box)))
      .toBe(20 + 20 + 2 + 2 + 100 + 60 + 16)
  })

  it('스크롤로 숨은 높이를 센다 — 이게 이 함수의 이유다', () => {
    // 보이는 높이는 80 인데 담긴 것은 300. 80 으로 맞추면 여전히 잘린다.
    const box = fakeBox([fakeChild(80, 300)])
    expect(withFakeWindow(() => neededHeight(box))).toBe(44 + 300)
  })

  it('안 보이는 자식은 안 센다', () => {
    const box = fakeBox([fakeChild(100), fakeChild(999, 999, 0, { display: 'none' })])
    expect(withFakeWindow(() => neededHeight(box))).toBe(44 + 100)
  })

  it('띄워 놓은 자식은 자리를 안 차지한다', () => {
    const box = fakeBox([fakeChild(100), fakeChild(999, 999, 0, { position: 'absolute' })])
    expect(withFakeWindow(() => neededHeight(box))).toBe(44 + 100)
  })

  it('상자가 없으면 0 — 못 재면 안 건드린다', () => {
    expect(neededHeight(null)).toBe(0)
    expect(fitRows(null)).toBe(null)
  })
})

describe('늘어난 칸에 안 속는다', () => {
  it('재는 동안만 높이를 풀고 곧바로 되돌린다', () => {
    // **줄이는 쪽이 되려면 이게 있어야 한다.** 안쪽 칸이 `flex: 1` 이라 상자가
    // 크면 같이 커져 있고, 그대로 재면 「지금 크기」 가 나와 영영 안 줄어든다.
    const seen = []
    const box = fakeBox([{
      get offsetHeight() { seen.push(box.style.height); return 100 },
      scrollHeight: 100,
      __style: { marginTop: '0px', marginBottom: '0px', display: 'block' },
    }])
    box.style.height = '400px'

    withFakeWindow(() => measureNatural(box))

    expect(seen).toEqual(['auto'])      // 잴 때는 풀려 있었고
    expect(box.style.height).toBe('400px')   // 잰 뒤에는 그대로 돌아왔다
  })

  it('재다가 터져도 높이를 되돌린다', () => {
    const box = fakeBox([])
    box.style.height = '300px'
    box.children = { [Symbol.iterator]() { throw new Error('망가진 자식') } }
    expect(() => withFakeWindow(() => measureNatural(box))).toThrow()
    expect(box.style.height).toBe('300px')
  })
})

describe('맞춤 칸 수', () => {
  it('잰 높이를 칸 수로 바꾼다', () => {
    const box = fakeBox([fakeChild(pixelsFor(4) - 44)])
    expect(withFakeWindow(() => fitRows(box))).toBe(4)
  })
})
