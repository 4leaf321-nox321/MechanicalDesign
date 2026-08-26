/**
 * I형 단면 — 플랜지 둘과 웨브 하나.
 *
 * 사각 단면과 같은 재료로 훨씬 큰 단면계수를 내는 이유가 그림에 있다: **재료를
 * 중립축에서 멀리 보낸다.** 굽힘에서 버티는 것은 중립축에서 먼 살이고, 가운데
 * 살은 거의 놀고 있다. 그 사실이 그림에서 읽혀야 이 단면을 왜 쓰는지 안다.
 *
 * ## 웨브와 플랜지를 안 주면
 *
 * 둘은 계산에 꼭 필요한 값이지만(단면계수가 이 넷으로 정해진다) 안 주는 카드도
 * 있다 — 규격 형강을 이름으로 고르고 단면계수만 표에서 읽는 경우다. 그때는
 * 보기 좋은 비율로 그리고 **그렇게 그렸다고 적는다.**
 */

import { ROLE, bounds, dim, line, path, positive } from './geometry'

const PARAMS = [
  { key: 'b', label: '플랜지 폭', required: true },
  { key: 'h', label: '전체 높이', required: true },
  { key: 'tw', label: '웨브 두께', required: false },
  { key: 'tf', label: '플랜지 두께', required: false },
]

const EXAMPLE = { b: 100, h: 200 }

/** 두께를 안 줬을 때 쓸 비율. 규격 형강의 대략적인 모양이다. */
const WEB_RATIO = 0.06
const FLANGE_RATIO = 0.1

function build(values) {
  const missing = PARAMS.filter(p => p.required && !positive(values[p.key]))
  const example = missing.length > 0
  const b = example ? EXAMPLE.b : positive(values.b)
  const h = example ? EXAMPLE.h : positive(values.h)

  const notes = []
  const givenTw = example ? null : positive(values.tw)
  const givenTf = example ? null : positive(values.tf)
  const tw = givenTw || h * WEB_RATIO
  const tf = givenTf || h * FLANGE_RATIO

  if (!example && (!givenTw || !givenTf)) {
    notes.push('웨브·플랜지 두께를 안 주어 보기 좋은 비율로만 그렸습니다.')
  }
  if (!example && (tw >= b || tf * 2 >= h)) {
    return {
      ok: false,
      impossible: '웨브가 플랜지보다 좁고, 플랜지 둘이 전체 높이 안에 들어가야 합니다.',
    }
  }

  const x = b / 2
  const y = h / 2
  const w = tw / 2
  // I 모양 한 붓에. 왼쪽 위에서 시계방향으로 돈다.
  const outline = [
    [-x, -y], [x, -y], [x, -y + tf], [w, -y + tf],
    [w, y - tf], [x, y - tf], [x, y], [-x, y],
    [-x, y - tf], [-w, y - tf], [-w, -y + tf], [-x, -y + tf],
  ]
  const shapes = [
    path(`M ${outline.map(p => p.join(' ')).join(' L ')} Z`, ROLE.cut),
    // 중립축. 이 단면을 쓰는 이유가 「살이 여기서 멀다」 는 것이라, 기준선이
    // 없으면 그 말이 그림에서 사라진다.
    line(-b * 0.72, 0, b * 0.72, 0, ROLE.center),
  ]

  const pad = Math.max(b, h) * 0.2
  const at = (key) => (example ? null : positive(values[key]))
  const dims = [
    dim([-x, y], [x, y],
        { offset: pad, label: '{}', symbol: 'b',
          value: at('b'), unit: values._units?.b }),
    dim([x, -y], [x, y],
        { offset: pad, label: '{}', symbol: 'h',
          value: at('h'), unit: values._units?.h }),
  ]
  // 두께는 **준 값이 있을 때만** 잰다. 지어낸 비율에 치수를 붙이면 사실로 읽힌다.
  if (givenTf) {
    dims.push(dim([-x, -y], [-x, -y + tf],
                  { offset: -pad * 0.55, label: '{}', symbol: 'tf', along: 0.5,
                    value: givenTf, unit: values._units?.tf }))
  }
  if (givenTw) {
    dims.push(dim([-w, 0], [w, 0],
                  { offset: -pad * 0.5, label: '{}', symbol: 'tw',
                    value: givenTw, unit: values._units?.tw }))
  }

  return {
    ok: true,
    example,
    missing: missing.map(p => p.key),
    shapes,
    dims,
    notes,
    box: bounds([...shapes, ...dims]),
  }
}

export default {
  id: 'section_i',
  name: 'I형 단면',
  summary: '플랜지 폭과 전체 높이. 살이 중립축에서 멀다는 것이 그림에 보입니다.',
  params: PARAMS,
  build,
}
