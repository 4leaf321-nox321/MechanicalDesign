/**
 * 저널(미끄럼) 베어링.
 *
 * 굴림베어링과 **계산이 완전히 다르다.** 굴림은 수명(L10)을 보고, 미끄럼은
 * 면압과 `pv` 값을 본다. 그런데 화면에서는 둘 다 「베어링」 이라 어느 쪽 식을
 * 쓰고 있는지 숫자만 봐서는 알 수 없다.
 *
 * 미끄럼에서 조용히 틀리는 자리는 **면압을 무엇으로 나누느냐**다:
 *
 *     p = W / (d · l)
 *
 * 여기 `d · l` 은 축을 옆에서 본 **네모난 그림자**(투영면적)이지, 축과 닿는
 * 반원통의 겉넓이(π d l / 2)가 아니다. 겉넓이로 나누면 면압이 절반 이하로
 * 나오고, 그러면 안전한 것처럼 보인다. 계산은 통과하고 베어링은 눌러 붙는다.
 *
 * 그림은 그 네모를 실제로 그려 놓는다.
 */

import { ROLE, bounds, circle, crosshair, dim, flow, line, positive, rect, tag }
  from './geometry'

const PARAMS = [
  { key: 'd', label: '저널 지름', required: true },
  { key: 'l', label: '베어링 길이', required: true },
  { key: 'W', label: '하중', required: false },
]

const EXAMPLE = { d: 50, l: 60 }

/** 부시 살두께를 저널 지름의 몇 배로 그릴까. 계산에 없는 값이라 치수를 안 붙인다. */
const SHELL = 0.16

function build(values) {
  const missing = PARAMS.filter(p => p.required && !positive(values[p.key]))
  const example = missing.length > 0
  const d = example ? EXAMPLE.d : positive(values.d)
  const l = example ? EXAMPLE.l : positive(values.l)

  const r = d / 2
  const shell = d * SHELL

  // --- 옆면: 여기가 투영면적이다 -----------------------------------------------
  // 부시를 먼저, 저널을 나중에. 저널은 단면을 안 치는 물건이라 앞을 가린다.
  const shapes = [
    rect(0, -r - shell, l, shell, ROLE.cut),
    rect(0, r, l, shell, ROLE.cut),
    rect(0, -r, l, d, ROLE.front),
    line(-d * 0.1, 0, l + d * 0.1, 0, ROLE.center),
  ]

  // --- 단면: 축이 부시 안에 들어 있다 -------------------------------------------
  const cx = l + d * 0.85
  shapes.push(circle(cx, 0, r + shell, ROLE.cut, r))
  shapes.push(circle(cx, 0, r, ROLE.front))
  shapes.push(...crosshair(cx, 0, r + shell))

  const flows = []
  if (!example && positive(values.W)) {
    const reach = d * 0.5
    flows.push(flow(l / 2, -r - shell - reach, l / 2, -r - shell - reach * 0.2, 'W'))
    flows.push(flow(cx, -r - shell - reach, cx, -r - shell - reach * 0.2, 'W'))
  }

  const pad = d * 0.3
  const shown = (v) => (example ? null : v)
  const dims = [
    dim([0, r + shell], [l, r + shell],
        { offset: pad, label: '{}', symbol: 'l',
          value: shown(l), unit: values._units?.l }),
    dim([0, -r], [0, r],
        { offset: -pad, label: 'Ø{}', symbol: 'd',
          value: shown(d), unit: values._units?.d }),
  ]

  // 투영면적을 눈으로 짚는다. 이 도해가 있는 이유가 이 한 줄이다.
  const tags = [tag(l / 2, r * 0.16, 'd · l', 'middle')]

  const notes = [
    '면압은 이 네모(d · l)로 나눕니다 — 축과 닿는 반원통 겉넓이가 아닙니다.',
    '부시 살두께는 보기 좋은 비율일 뿐, 이 계산에 쓰이지 않습니다.',
  ]
  if (!example) {
    const ratio = Math.round((l / d) * 100) / 100
    notes.push(`l/d = ${ratio} 입니다 (보통 0.5~2 를 씁니다).`)
  }

  return {
    ok: true,
    example,
    missing: missing.map(p => p.key),
    shapes,
    flows,
    dims,
    tags,
    notes,
    box: bounds([...shapes, ...dims, ...flows, ...tags]),
  }
}

export default {
  id: 'journal_bearing',
  name: '저널 베어링',
  summary: '면압을 나누는 투영면적 d·l 을 그림에 그려 놓습니다.',
  params: PARAMS,
  build,
}
