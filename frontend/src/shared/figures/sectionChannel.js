/**
 * ㄷ형강 단면.
 *
 * 좌우가 대칭이 아니라서 **도심이 가운데에 없다.** 웨브 쪽으로 치우쳐 있고,
 * 그 자리를 손으로 구해야 단면계수가 나온다. 여기까지는 계산이 말해 준다.
 *
 * 계산이 말 안 해 주는 것이 하나 더 있다. **전단중심이 단면 바깥에 있다** —
 * 웨브의 반대편, 그러니까 재료가 아예 없는 허공이다. 하중을 도심에 얌전히
 * 걸어도 그 점이 전단중심이 아니므로 보가 **비틀린다.**
 *
 * 굽힘응력만 계산하고 「도심에 걸었으니 괜찮다」 고 넘어가면 실제로는 비틀림이
 * 함께 걸린다. 숫자 어디에도 안 나오는 이야기라 그림이 말해야 한다.
 */

import { ROLE, bounds, dim, line, path, positive, tag } from './geometry'

const PARAMS = [
  { key: 'b', label: '플랜지 폭', required: true },
  { key: 'h', label: '전체 높이', required: true },
  { key: 'tw', label: '웨브 두께', required: true },
  { key: 'tf', label: '플랜지 두께', required: true },
]

const EXAMPLE = { b: 75, h: 150, tw: 7, tf: 10 }

function build(values) {
  const missing = PARAMS.filter(p => p.required && !positive(values[p.key]))
  const example = missing.length > 0
  const b = example ? EXAMPLE.b : positive(values.b)
  const h = example ? EXAMPLE.h : positive(values.h)
  const tw = example ? EXAMPLE.tw : positive(values.tw)
  const tf = example ? EXAMPLE.tf : positive(values.tf)

  if (!example && (tf * 2 >= h || tw >= b)) {
    return {
      ok: false,
      impossible: `플랜지 두께 둘(${tf * 2})은 높이(${h})보다, 웨브(${tw})는 폭(${b})보다 작아야 합니다.`,
    }
  }

  const y = h / 2
  // 웨브 바깥면을 x = 0 에 두고 플랜지가 오른쪽으로 뻗는다.
  const shapes = [path(
    `M 0 ${-y} L ${b} ${-y} L ${b} ${-y + tf} L ${tw} ${-y + tf}`
    + ` L ${tw} ${y - tf} L ${b} ${y - tf} L ${b} ${y} L 0 ${y} Z`,
    ROLE.cut,
  )]

  // 도심 — 웨브 바깥면에서 얼마나 떨어져 있나.
  const aWeb = tw * h
  const aFlange = (b - tw) * tf
  const area = aWeb + aFlange * 2
  const cx = (aWeb * (tw / 2) + aFlange * 2 * (tw + (b - tw) / 2)) / area

  shapes.push(line(-b * 0.24, 0, b * 1.24, 0, ROLE.center))
  shapes.push(line(cx, -y * 1.22, cx, y * 1.22, ROLE.center))

  const pad = Math.max(b, h) * 0.2
  const shown = (v) => (example ? null : v)
  const dims = [
    dim([0, y], [b, y],
        { offset: pad, label: '{}', symbol: 'b',
          value: shown(b), unit: values._units?.b }),
    dim([b, -y], [b, y],
        { offset: pad, label: '{}', symbol: 'h',
          value: shown(h), unit: values._units?.h }),
    // 웨브 두께는 **위쪽 바깥**에서 잰다. 단면 한가운데에 두면 도심 치수와
    // 같은 자리에 겹쳐, 두 숫자가 엉켜 어느 쪽이 어느 값인지 안 읽힌다.
    dim([0, -y], [tw, -y],
        { offset: -pad * 0.5, label: '{}', symbol: 'tw',
          value: shown(tw), unit: values._units?.tw }),
    dim([b, -y], [b, -y + tf],
        { offset: pad * 2.1, label: '{}', symbol: 'tf',
          value: shown(tf), unit: values._units?.tf }),
  ]
  if (!example) {
    // 도심 자리는 **구한 값**이지 준 값이 아니다. 치수로 적되 그렇다고 적는다.
    dims.push(dim([0, y], [cx, y],
                  { offset: pad * 2.2, label: '{}', symbol: 'x̄',
                    value: Math.round(cx * 100) / 100, unit: values._units?.b }))
  }

  // 전단중심은 웨브 **바깥**, 재료가 없는 쪽이다. 자리를 정확히 구하려면
  // 플랜지 형상까지 들어가야 해서, 여기서는 「바깥에 있다」 만 말한다.
  const tags = [tag(-b * 0.3, -y * 0.12, '전단중심은 이쪽 바깥', 'end')]
  shapes.push(line(-b * 0.05, 0, -b * 0.28, 0, ROLE.ghost))

  const notes = [
    '도심(x̄)은 구한 값입니다 — 좌우가 대칭이 아니라 가운데가 아닙니다.',
    '전단중심이 웨브 바깥(재료가 없는 쪽)에 있어, 도심에 하중을 걸어도 비틀립니다.',
  ]

  return {
    ok: true,
    example,
    missing: missing.map(p => p.key),
    shapes,
    dims,
    tags,
    notes,
    box: bounds([...shapes, ...dims, ...tags]),
  }
}

export default {
  id: 'section_channel',
  name: 'ㄷ형강 단면',
  summary: '치우친 도심과, 단면 밖에 있는 전단중심을 함께 보입니다.',
  params: PARAMS,
  build,
}
