/**
 * 각파이프 — 속 빈 사각 단면.
 *
 * 사각 단면에서 안쪽을 빼면 무게는 많이 주는데 굽힘 강성은 조금밖에 안 준다.
 * 재료가 중립축에서 먼 곳에 남기 때문이다 — I형강과 같은 이치다.
 *
 * I형강과 다른 점은 **닫혀 있다**는 것이고, 그 차이가 비틀림에서 크게 벌어진다.
 * 열린 단면(I형·ㄷ형)은 비틀면 각 판이 따로 휘어 버티는 힘이 얼마 안 되는데,
 * 닫힌 단면은 둘레를 따라 전단흐름이 한 바퀴 돌아 훨씬 강하다. 같은 무게로
 * 몇 십 배가 갈리는 자리라, 비틀림이 걸리는 자리에서는 이 구분이 곧 설계다.
 *
 * 그림이 말할 수 있는 것은 「닫혀 있다」 는 사실이다. 숫자에는 안 나온다.
 */

import { ROLE, bounds, dim, line, path, positive } from './geometry'

const PARAMS = [
  { key: 'b', label: '바깥 폭', required: true },
  { key: 'h', label: '바깥 높이', required: true },
  { key: 't', label: '벽 두께', required: true },
]

const EXAMPLE = { b: 100, h: 150, t: 6 }

function build(values) {
  const missing = PARAMS.filter(p => p.required && !positive(values[p.key]))
  const example = missing.length > 0
  const b = example ? EXAMPLE.b : positive(values.b)
  const h = example ? EXAMPLE.h : positive(values.h)
  const t = example ? EXAMPLE.t : positive(values.t)

  if (!example && t * 2 >= Math.min(b, h)) {
    return {
      ok: false,
      impossible: `벽 두께(${t}) 둘이 바깥 치수(${Math.min(b, h)})보다 작아야 속이 빕니다.`,
    }
  }

  const x = b / 2
  const y = h / 2
  const ix = x - t
  const iy = y - t

  // 바깥은 시계 방향, 안쪽은 **반대 방향**으로 돈다. 그래야 채울 때 가운데가
  // 뚫린다 — 같은 방향으로 돌면 속이 꽉 찬 사각형이 된다.
  const shapes = [path(
    `M ${-x} ${-y} L ${x} ${-y} L ${x} ${y} L ${-x} ${y} Z`
    + ` M ${-ix} ${-iy} L ${-ix} ${iy} L ${ix} ${iy} L ${ix} ${-iy} Z`,
    ROLE.cut,
  )]
  // 중립축 — 굽힘응력이 0인 자리이자 단면계수를 재는 기준이다.
  shapes.push(line(-x * 1.28, 0, x * 1.28, 0, ROLE.center))

  const pad = Math.max(b, h) * 0.22
  const shown = (v) => (example ? null : v)
  const dims = [
    dim([-x, y], [x, y],
        { offset: pad, label: '{}', symbol: 'b',
          value: shown(b), unit: values._units?.b }),
    dim([x, -y], [x, y],
        { offset: pad, label: '{}', symbol: 'h',
          value: shown(h), unit: values._units?.h }),
    dim([-x, -y], [-x, -y + t],
        { offset: -pad * 0.5, label: '{}', symbol: 't',
          value: shown(t), unit: values._units?.t }),
  ]

  const notes = ['닫힌 단면이라 비틀림에 강합니다 — 같은 무게의 I형·ㄷ형과 크게 갈립니다.']

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
  id: 'section_box',
  name: '각파이프 단면',
  summary: '속 빈 사각 단면. 닫혀 있다는 것이 비틀림에서 크게 갈립니다.',
  params: PARAMS,
  build,
}
