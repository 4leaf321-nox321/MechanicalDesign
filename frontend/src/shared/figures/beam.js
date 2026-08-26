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

/** 내민보만 쓰는 칸. 나머지 보에는 붙이지 않는다 — 안 쓰는 칸을 보이면 헷갈린다. */
const OVER_PARAMS = [...PARAMS, { key: 'a', label: '내민 길이', required: false }]

const EXAMPLE = { L: 1000 }

/** 보를 얼마나 두껍게 그릴까. 길이 대비 — 계산에 없는 값이라 치수를 안 붙인다. */
const DEPTH = 0.055
/** 등분포하중을 화살표 몇 개로 나타낼까. */
const SPREAD = 7

/**
 * 받침이 어디에 어떻게 붙고 하중이 어디에 걸리나. **여기가 곧 계산식이다** —
 * 자리를 잘못 그리면 그림이 다른 식을 말하게 된다.
 *
 * 기호는 기둥 도해와 **같은 것을 쓴다** — 방향만 다르다. 따로 그리면 언젠가
 * 한쪽만 손보게 되고, 그때 같은 뜻의 기호가 두 모양이 된다.
 */
const KINDS = {
  cantilever: {
    ends: (L, size) => fixedEnd(0, 0, size, [-1, 0]),
    // 자유단에 건다.
    load: (L) => L,
  },
  simple: {
    ends: (L, size, depth) => [...pin(0, depth / 2, size),
                               ...roller(L, depth / 2, size)],
    load: (L) => L / 2,
  },
  fixedBoth: {
    ends: (L, size) => [...fixedEnd(0, 0, size, [-1, 0]),
                        ...fixedEnd(L, 0, size, [1, 0])],
    // 세 번째 인자(depth)는 삼각 받침만 쓴다. 벽은 보 한가운데에 붙으므로
    // 필요 없고, 자리를 맞추느라 안 쓰는 인자를 적어 두지 않는다.
    load: (L) => L / 2,
  },
  overhang: {
    ends: (L, size, depth) => [...pin(0, depth / 2, size),
                               ...roller(L, depth / 2, size)],
    // 내민 끝에 건다 — 그래야 받침 너머로 넘기는 모멘트가 보인다.
    load: (L, over) => L + over,
    over: true,
  },
}

function make({ id, name, summary, kind }) {
  const spec = KINDS[kind]
  const params = spec.over ? OVER_PARAMS : PARAMS

  function build(values) {
    const missing = params.filter(p => p.required && !positive(values[p.key]))
    const example = missing.length > 0
    const L = example ? EXAMPLE.L : positive(values.L)

    const notes = []
    // 내민 길이를 안 주면 보기 비율로 그리고 **그 치수를 안 붙인다** —
    // 붙이면 없는 값을 지어낸 것이 된다.
    const givenOver = spec.over && !example ? positive(values.a) : null
    const over = spec.over ? (givenOver || L * 0.35) : 0
    if (spec.over && !givenOver && !example) {
      notes.push('내민 길이가 배선되지 않아 보기 비율로 그렸습니다 — 그 치수를 안 붙인 것은 그래서입니다.')
    }

    const total = L + over
    const depth = L * DEPTH
    const size = L * 0.05
    const shapes = [rect(0, -depth / 2, total, depth)]
    shapes.push(...spec.ends(L, size, depth))

    const flows = []
    if (!example) {
      const reach = L * 0.16
      const P = positive(values.P)
      const w = positive(values.w)
      if (P) {
        const at = spec.load(L, over)
        flows.push(flow(at, -depth / 2 - reach, at, -depth / 2 - reach * 0.15, 'P'))
      }
      if (w) {
        for (let i = 0; i <= SPREAD; i += 1) {
          const at = (total * i) / SPREAD
          flows.push(flow(at, -depth / 2 - reach * 0.62, at, -depth / 2 - reach * 0.1,
                          i === SPREAD ? 'w' : ''))
        }
        shapes.push(line(0, -depth / 2 - reach * 0.62, total,
                         -depth / 2 - reach * 0.62, ROLE.ghost))
      }
    }

    const pad = L * 0.13
    const base = depth / 2 + size * 2.2
    const dims = [
      dim([0, base], [L, base],
          { offset: pad, label: '{}', symbol: 'L',
            value: example ? null : L, unit: values._units?.L }),
    ]
    if (givenOver) {
      dims.push(dim([L, base], [total, base],
                    { offset: pad, label: '{}', symbol: 'a',
                      value: givenOver, unit: values._units?.a }))
    }

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

  return { id, name, summary, params, build }
}

export const cantilever = make({
  id: 'beam_cantilever',
  name: '외팔보',
  summary: '한쪽이 벽에 물린 보. 자유단 하중이면 최대 모멘트가 P·L 입니다.',
  kind: 'cantilever',
})

export const simple = make({
  id: 'beam_simple',
  name: '단순보',
  summary: '양끝을 받친 보. 가운데 하중이면 최대 모멘트가 P·L/4 입니다.',
  kind: 'simple',
})

export const fixedBoth = make({
  id: 'beam_fixed',
  name: '양단고정보',
  summary: '양끝이 벽에 물린 보. 가운데 하중이면 최대 모멘트가 P·L/8 입니다.',
  kind: 'fixedBoth',
})

export const overhang = make({
  id: 'beam_overhang',
  name: '내민보',
  summary: '받침 너머로 내민 보. 내민 끝 하중이 받침 위에 P·a 를 만듭니다.',
  kind: 'overhang',
})
