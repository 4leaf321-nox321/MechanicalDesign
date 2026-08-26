/**
 * 방진 마운트 — 가진 주파수와 고유진동수의 비.
 *
 * 세탁기 탈수, 냉장고 컴프레서, 스피커 진동. 방진고무를 끼우면 나아질 것
 * 같지만, 실제로는 **비 하나가 전부를 정한다:**
 *
 *     f / fn < √2   증폭 — 마운트가 진동을 오히려 키운다
 *     f / fn > √2   격리 — 여기서부터만 마운트가 일을 한다
 *
 * 함정이 직관 안에 있다. 단단한 마운트가 튼튼해 보이지만, 단단할수록 fn 이
 * 올라와 가진 주파수에 가까워지고, 공진(f ≈ fn)을 지나며 진동을 몇 배로
 * 키운다. 격리는 **무른 마운트**가 한다 — fn 을 가진의 1/3 쯤으로 내려야
 * 전달률이 1/8 로 떨어진다.
 *
 * f 와 fn 두 숫자가 나란히 적혀 있어도 √2 경계는 눈에 안 보인다. 그림이
 * 그 판정을 대신 말한다.
 */

import { ROLE, bounds, line, moment, path, positive, rect, tag } from './geometry'

const PARAMS = [
  { key: 'f', label: '가진 주파수', required: true },
  { key: 'fn', label: '고유진동수', required: true },
]

const EXAMPLE = { f: 24, fn: 8 }

/** 그림 전체의 기준 크기. 길이 값이 없는 도해라 비율만 있다. */
const U = 100

/** 스프링 하나 — 지그재그. */
function spring(x, yTop, yBottom) {
  const zig = U * 0.11
  const n = 5
  const step = (yBottom - yTop) / (n + 1)
  let d = `M ${x} ${yTop} L ${x} ${yTop + step * 0.5}`
  for (let k = 0; k < n; k += 1) {
    const side = k % 2 === 0 ? 1 : -1
    d += ` L ${x + side * zig} ${yTop + step * (k + 1)}`
  }
  d += ` L ${x} ${yBottom - step * 0.5} L ${x} ${yBottom}`
  return path(d)
}

function build(values) {
  const missing = PARAMS.filter(p => p.required && !positive(values[p.key]))
  const example = missing.length > 0
  const f = example ? EXAMPLE.f : positive(values.f)
  const fn = example ? EXAMPLE.fn : positive(values.fn)

  const massW = U * 1.2
  const massH = U * 0.6
  const springH = U * 0.5
  const groundT = U * 0.14

  const shapes = [
    rect(-massW * 0.8, 0, massW * 1.6, groundT, ROLE.cut),   // 바닥
    spring(-massW * 0.32, -springH, 0),
    spring(massW * 0.32, -springH, 0),
    rect(-massW / 2, -springH - massH, massW, massH, ROLE.front),
  ]

  // 가진원 — 도는 언밸런스. 세탁기 드럼이 정확히 이것이다.
  const moments = [moment(0, -springH - massH / 2, massH * 0.3,
                          example ? 'f' : `f = ${f}${values._units?.f ? ' ' + values._units.f : ''}`)]

  const tags = [
    tag(-massW * 0.55, -springH * 0.45,
        example ? 'fn' : `fn = ${fn}${values._units?.fn ? ' ' + values._units.fn : ''}`, 'end'),
  ]
  shapes.push(line(-massW * 0.43, -springH * 0.5, -massW * 0.52, -springH * 0.47, ROLE.ghost))

  const notes = []
  if (!example) {
    const r = f / fn
    const ratio = Math.round(r * 100) / 100
    tags.push(tag(0, -springH - massH - U * 0.22, `f/fn = ${ratio}`))
    if (Math.abs(r - 1) < 0.25) {
      notes.push(`f/fn = ${ratio} — 공진 부근입니다. 마운트가 진동을 크게 증폭합니다.`
        + ' fn 을 가진에서 멀리 떼어 놓아야 합니다.')
    } else if (r < Math.SQRT2) {
      notes.push(`f/fn = ${ratio} — √2(≈1.41) 아래라 증폭 영역입니다. 마운트를 더`
        + ' 무르게(fn 을 낮게) 해야 격리가 시작됩니다.')
    } else {
      const trans = Math.round((1 / (r * r - 1)) * 100) / 100
      notes.push(`f/fn = ${ratio} — √2 를 넘어 격리 영역입니다. 전달률`
        + ` ≈ 1/((f/fn)²−1) = ${trans} 입니다 (감쇠 없음 기준, 구한 값).`)
    }
  }
  notes.push('단단한 마운트가 튼튼해 보이지만, fn 이 올라와 f 에 가까워지면 오히려'
    + ' 진동을 키웁니다 — 격리는 무른 마운트가 합니다.')
  notes.push('기계·스프링·바닥의 크기는 보기 좋은 비율일 뿐, 계산에는 f 와 fn 만 쓰입니다.')

  return {
    ok: true,
    example,
    missing: missing.map(p => p.key),
    shapes,
    moments,
    dims: [],
    tags,
    notes,
    box: bounds([...shapes, ...moments, ...tags]),
  }
}

export default {
  id: 'vib_mount',
  name: '방진 마운트',
  summary: 'f/fn 이 √2 를 넘는지 — 마운트가 격리하는지 증폭하는지 판정합니다.',
  params: PARAMS,
  build,
}
