/**
 * 사각 단면 — 폭 `b`, 높이 `h`.
 *
 * 단면계수·관성모멘트 계산의 입구다. `Z = bh²/6` 이 왜 높이에 제곱으로 걸리는지는
 * 그림을 보면 바로 읽힌다 — **어느 쪽이 세로인가**가 이 계산의 전부다.
 *
 * ## 굽힘 방향을 함께 그린다
 *
 * 같은 단면이라도 어느 축으로 굽히느냐에 따라 단면계수가 딴판이 된다. 60×20 을
 * 눕히면 세워 놓았을 때의 1/9 이다. 그런데 `b` 와 `h` 라는 글자만 봐서는 어느
 * 쪽이 굽힘축인지 알 수 없어서, **중립축을 그림에 긋는다.** 이 한 줄이 없으면
 * b 와 h 를 바꿔 넣은 실수를 그림이 못 잡아 준다.
 */

import { ROLE, bounds, dim, line, positive, rect } from './geometry'

const PARAMS = [
  { key: 'b', label: '폭', required: true },
  { key: 'h', label: '높이', required: true },
]

/** 값이 없을 때 그릴 비율. 숫자는 하나도 안 적는다. */
const EXAMPLE = { b: 30, h: 50 }

function build(values) {
  const missing = PARAMS.filter(p => p.required && !positive(values[p.key]))
  const example = missing.length > 0
  const b = example ? EXAMPLE.b : positive(values.b)
  const h = example ? EXAMPLE.h : positive(values.h)

  const shapes = [
    rect(-b / 2, -h / 2, b, h, ROLE.cut),
    // 중립축. 굽힘이 어느 축으로 걸리는지를 말하는 유일한 표시다.
    line(-b * 0.72, 0, b * 0.72, 0, ROLE.center),
  ]

  const pad = Math.max(b, h) * 0.26
  const at = (key) => (example ? null : positive(values[key]))
  const dims = [
    dim([-b / 2, h / 2], [b / 2, h / 2],
        { offset: pad, label: '{}', symbol: 'b',
          value: at('b'), unit: values._units?.b }),
    dim([b / 2, -h / 2], [b / 2, h / 2],
        { offset: pad, label: '{}', symbol: 'h',
          value: at('h'), unit: values._units?.h }),
  ]

  return {
    ok: true,
    example,
    missing: missing.map(p => p.key),
    shapes,
    dims,
    notes: [],
    box: bounds([...shapes, ...dims]),
  }
}

export default {
  id: 'section_rect',
  name: '사각 단면',
  summary: '폭과 높이. 중립축을 함께 그려 어느 쪽으로 굽는지 보입니다.',
  params: PARAMS,
  build,
}
