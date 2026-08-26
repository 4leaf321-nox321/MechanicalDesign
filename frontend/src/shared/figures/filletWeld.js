/**
 * 필릿 용접 — 직각으로 만난 두 판을 삼각형 살로 이은 이음.
 *
 * 이 도해는 **목두께가 다리길이가 아니라는 것**을 말하려고 있다.
 *
 *     z  다리길이 — 판을 따라 잰다. 도면에 적히는 값
 *     a  목두께   — 삼각형의 **가장 얇은 곳**. 실제로 버티는 두께
 *     a = z / √2 ≒ 0.707 z
 *
 * 이 둘을 섞어 쓰는 것이 용접 검토에서 가장 흔한 실수고, 섞으면 응력이 √2 배
 * 어긋난다. 40% 틀린 값이 아무 오류 없이 나온다. 그림에 둘을 **함께** 그려
 * 다른 값이라는 것을 눈으로 보게 한다.
 *
 * 목두께를 안 주면 다리길이에서 구해 그리되 **그렇게 구했다고 적는다** — 조용히
 * 넣으면 사람이 그것을 자기가 정한 값으로 읽는다.
 */

import { ROLE, bounds, dim, line, path, positive, rect, tag } from './geometry'

const PARAMS = [
  { key: 'z', label: '다리길이', required: true },
  { key: 'a', label: '목두께', required: false },
  { key: 'l', label: '용접길이', required: false },
]

const EXAMPLE = { z: 6 }

const ROOT2 = Math.SQRT2

function build(values) {
  const missing = PARAMS.filter(p => p.required && !positive(values[p.key]))
  const example = missing.length > 0
  const z = example ? EXAMPLE.z : positive(values.z)

  const notes = []
  const flat = z / ROOT2                // 평평한 등각 필릿의 목두께
  let a = example ? flat : positive(values.a)
  if (!example && !a) {
    a = flat
    notes.push('목두께(a)를 안 주어 다리길이에서 구했습니다 (a = z / √2 ≒ 0.707 z).')
  } else if (!example && Math.abs(a - flat) / flat > 0.02) {
    // **그림은 평평한 등각 필릿을 그린다.** 그 목두께는 z/√2 로 정해져 있어서,
    // 준 값이 다르면 그림과 숫자가 어긋난다 — 그림에는 4.24 가 그려져 있는데
    // 이름표만 5 라고 적히는 식이다. 이 도해가 막으려는 바로 그 혼동이다.
    //
    // 특히 a 와 z 를 같게 적은 경우가 흔하다. 그러면 응력이 √2 배 어긋난다.
    const same = Math.abs(a - z) / z <= 0.02
    notes.push(same
      ? `목두께(${a})가 다리길이(${z})와 같습니다 — 둘을 섞어 적으신 것 아닌가요?`
        + ' 평평한 필릿이면 a = z / √2 입니다.'
      : `준 목두께(${a})가 이 그림의 목두께(${Math.round(flat * 100) / 100})와`
        + ' 다릅니다. 그림은 평평한 등각 필릿입니다.')
  }

  const t = z * 0.55            // 판 두께 — 계산에 없는 값이라 치수를 안 붙인다
  const reach = z * 2.6         // 판을 얼마나 길게 그릴까

  const shapes = []
  // 세로 판 (왼쪽에 세운다)
  shapes.push(rect(-t, -reach, t, reach + t, ROLE.cut))
  // 가로 판 (아래에 눕힌다)
  shapes.push(rect(-t, 0, reach + t, t, ROLE.cut))

  // 용접 살 — 두 판이 만난 안쪽 구석에 붙는 삼각형.
  shapes.push(path(`M 0 ${-z} L 0 0 L ${z} 0 Z`, ROLE.cut))

  // 목두께는 빗변에서 구석까지의 **수직 거리**다. 그 자리를 선으로 짚는다.
  const half = z / 2
  shapes.push(line(0, 0, half, -half, ROLE.ghost))

  const pad = z * 0.75
  const at = (key) => (example ? null : positive(values[key]))
  const dims = [
    // 다리길이 둘 — 세로 한 번, 가로 한 번. 둘이 같다는 것도 그림이 말한다.
    //
    // 치수선을 **판 두께 너머로** 뺀다. 구석에서 조금만 띄우면 치수선이 판의
    // 해칭 위에 얹혀, 숫자가 형상에 묻힌다 — 판이 t 만큼 차지하고 있다.
    dim([0, -z], [0, 0],
        { offset: -(t + pad * 0.7), label: '{}', symbol: 'z',
          value: at('z'), unit: values._units?.z }),
    dim([0, 0], [z, 0],
        { offset: t + pad * 0.7, label: '{}', symbol: 'z',
          value: at('z'), unit: values._units?.z }),
  ]

  // 목두께는 비스듬해서 치수선으로 그리면 화살표와 보조선이 그림을 덮는다.
  // 자리만 짚는 것으로 충분하다 — 요점은 「다리길이와 다른 값」 이다.
  const shown = example
    ? 'a'
    : `a = ${Math.round(a * 100) / 100}${values._units?.a || values._units?.z
      ? ` ${values._units?.a || values._units?.z}` : ''}`
  const tags = [tag(half * 0.62, -half * 0.62 - z * 0.12, shown, 'start')]

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
  id: 'fillet_weld',
  name: '필릿 용접',
  summary: '다리길이와 목두께를 함께 그립니다 — 둘을 섞으면 응력이 √2 배 어긋납니다.',
  params: PARAMS,
  build,
}
