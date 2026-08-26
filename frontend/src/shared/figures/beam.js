/**
 * 보 — 외팔보와 단순보.
 *
 * 같은 길이, 같은 하중이라도 **어떻게 받쳐져 있느냐**에 따라 굽힘모멘트가 4배
 * 넘게 갈린다. 자유단에 P 를 받는 외팔보는 `PL`, 가운데에 P 를 받는 단순보는
 * `PL/4` 다. 숫자만 보면 어느 쪽 식을 쓴 것인지 알 수 없어서, **지점 기호가
 * 곧 계산식**이다. 그것이 이 도해가 있는 이유다.
 *
 *     외팔보  한쪽이 벽에 물려 있다 (해칭한 벽)
 *     단순보  양끝을 받친다 (삼각형 — 한쪽은 굴림)
 *
 * 두 도해가 한 파일에 있는 것은 **그리는 법이 거의 같기 때문**이다. 다른 것은
 * 지점과 하중이 놓이는 자리뿐이라, 나누면 같은 코드가 두 벌이 된다.
 */

import { ROLE, bounds, dim, flow, line, positive, rect } from './geometry'
import { fixed as fixedEnd, pin, roller } from './supports'

const PARAMS = [
  { key: 'L', label: '보 길이', required: true },
  { key: 'P', label: '집중하중', required: false },
  { key: 'w', label: '등분포하중', required: false },
]

const EXAMPLE = { L: 1000 }

/** 보를 얼마나 두껍게 그릴까. 길이 대비 — 계산에 없는 값이라 치수를 안 붙인다. */
const DEPTH = 0.055
/** 등분포하중을 화살표 몇 개로 나타낼까. */
const SPREAD = 7

function make({ id, name, summary, fixed }) {
  function build(values) {
    const missing = PARAMS.filter(p => p.required && !positive(values[p.key]))
    const example = missing.length > 0
    const L = example ? EXAMPLE.L : positive(values.L)

    const depth = L * DEPTH
    const size = L * 0.05
    const shapes = [rect(0, -depth / 2, L, depth)]

    // 기호는 기둥 도해와 **같은 것을 쓴다** — 방향만 다르다. 따로 그리면 언젠가
    // 한쪽만 손보게 되고, 그때 같은 뜻의 기호가 두 모양이 된다.
    if (fixed) {
      shapes.push(...fixedEnd(0, 0, size, [-1, 0]))
    } else {
      shapes.push(...pin(0, depth / 2, size))
      shapes.push(...roller(L, depth / 2, size))
    }

    const flows = []
    if (!example) {
      const reach = L * 0.16
      const P = positive(values.P)
      const w = positive(values.w)
      if (P) {
        // 외팔보는 자유단, 단순보는 한가운데. **여기가 곧 계산식이다** —
        // 자리를 잘못 그리면 그림이 다른 식을 말하게 된다.
        const at = fixed ? L : L / 2
        flows.push(flow(at, -depth / 2 - reach, at, -depth / 2 - reach * 0.15, 'P'))
      }
      if (w) {
        for (let i = 0; i <= SPREAD; i += 1) {
          const at = (L * i) / SPREAD
          flows.push(flow(at, -depth / 2 - reach * 0.62, at, -depth / 2 - reach * 0.1,
                          i === SPREAD ? 'w' : ''))
        }
        shapes.push(line(0, -depth / 2 - reach * 0.62, L, -depth / 2 - reach * 0.62,
                         ROLE.ghost))
      }
    }

    const pad = L * 0.13
    const dims = [
      dim([0, depth / 2 + size * 2.2], [L, depth / 2 + size * 2.2],
          { offset: pad, label: '{}', symbol: 'L',
            value: example ? null : L, unit: values._units?.L }),
    ]

    const notes = []
    if (!example) {
      notes.push('보의 단면 높이는 이 그림에 쓰인 비율일 뿐입니다 — 단면은 따로 정합니다.')
    }

    return {
      ok: true,
      example,
      missing: missing.map(p => p.key),
      shapes,
      flows,
      dims,
      notes,
      box: bounds([...shapes, ...dims, ...flows]),
    }
  }

  return { id, name, summary, params: PARAMS, build }
}

export const cantilever = make({
  id: 'beam_cantilever',
  name: '외팔보',
  summary: '한쪽이 벽에 물린 보. 자유단 하중이면 최대 모멘트가 P·L 입니다.',
  fixed: true,
})

export const simple = make({
  id: 'beam_simple',
  name: '단순보',
  summary: '양끝을 받친 보. 가운데 하중이면 최대 모멘트가 P·L/4 입니다.',
  fixed: false,
})
