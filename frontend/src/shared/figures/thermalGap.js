/**
 * 열팽창 틈 — 이종 재질을 같이 물릴 때 생기는 움직임.
 *
 *     ΔL = α · L · ΔT     (α 는 ppm/°C 로 읽는다)
 *
 * 이 값의 무서움은 **상온 도면 어디에도 없다**는 것이다. 플라스틱(α ≈ 70)을
 * 알루미늄 프레임(α ≈ 23)에 물리면 α 차이 47 ppm — 길이 1 m, 온도차 30 °C 면
 * 1.4 mm 가 서로 민다. 조립 공차 전부를 합친 것보다 큰 움직임이 여름과 겨울
 * 사이에 조용히 오간다. TV 가 커질수록, 데코가 길수록 그대로 커진다.
 *
 * 처방도 그림이 말한다: **한쪽 끝만 고정하고 반대쪽은 미끄러질 틈을 준다.**
 * 양끝을 다 조이면 밀린 만큼 휘거나(들뜸) 구멍을 찢는다.
 */

import { ROLE, bounds, circle, dim, line, path, positive, rect, tag } from './geometry'

const PARAMS = [
  { key: 'L', label: '길이', required: true },
  { key: 'dT', label: '온도차 (°C)', required: true },
  { key: 'a1', label: 'α1 (ppm/°C)', required: true },
  { key: 'a2', label: 'α2 — 상대 부재 (ppm/°C)', required: false },
]

const EXAMPLE = { L: 1000, dT: 30, a1: 70 }

const round2 = (v) => Math.round(v * 100) / 100

function build(values) {
  const missing = PARAMS.filter(p => p.required && !positive(values[p.key]))
  const example = missing.length > 0
  const L = example ? EXAMPLE.L : positive(values.L)
  const dT = example ? EXAMPLE.dT : positive(values.dT)
  const a1 = example ? EXAMPLE.a1 : positive(values.a1)
  const a2 = example ? null : positive(values.a2)

  const notes = []
  const grow1 = a1 * 1e-6 * L * dT
  const grow2 = a2 ? a2 * 1e-6 * L * dT : 0
  const relative = a2 ? grow1 - grow2 : grow1

  // 실제 ΔL 은 길이의 천분율이라 실척으로는 안 보인다. 부풀려 그리고 적는다.
  const growVis = Math.max(Math.abs(relative), L * 0.045)
  if (!example) {
    notes.push('늘어난 길이는 실척으로 안 보여 부풀려 그렸습니다 — 수치는'
      + ' 준 값 그대로입니다.')
  }

  const t1 = L * 0.045
  const t2 = L * 0.055
  const shapes = [
    // 위: 부재 1 (많이 늘어나는 쪽). 아래: 상대 부재 — 다른 부재라 해칭 반대.
    rect(0, -t1, L, t1, ROLE.cut),
    rect(-L * 0.04, 0, L * 1.16, t2, ROLE.cut, true),
    // 왼끝은 함께 물린 자리 — 나사 하나.
    circle(L * 0.045, -t1 / 2, t1 * 0.32),
    line(L * 0.045, -t1 * 1.35, L * 0.045, t2 * 0.6, ROLE.center),
  ]

  // 더워진 뒤의 오른끝 — 참고선. 원래 끝과의 차이가 서로 미는 그 움직임이다.
  shapes.push(path(
    `M ${L + growVis} ${-t1} L ${L + growVis} 0`, ROLE.ghost,
  ))
  shapes.push(line(L, -t1 * 0.5, L + growVis, -t1 * 0.5, ROLE.ghost))

  const pad = L * 0.1
  const dims = [
    dim([0, t2], [L, t2],
        { offset: pad * 0.8, label: '{}', symbol: 'L',
          value: example ? null : L, unit: values._units?.L }),
  ]

  const tags = [
    tag(L * 0.045, -t1 * 1.5 - pad * 0.25, '여기만 고정', 'middle'),
    tag(L + growVis + pad * 0.2, -t1 * 1.35,
        example ? 'ΔL' : `ΔL 차 = ${round2(relative)} (구한 값)`, 'start'),
  ]

  if (!example) {
    if (a2) {
      notes.push(`α 차이 ${round2(a1 - a2)} ppm/°C × ${L} × ${dT} °C —`
        + ` 두 부재가 ${round2(relative)} 만큼 서로 밉니다 (구한 값).`
        + ` 각각은 ${round2(grow1)} 과 ${round2(grow2)} 늘어납니다.`)
      if (a1 - a2 < 0) {
        notes.push('상대 부재가 더 많이 늘어나는 조합입니다 — 미는 방향이 반대일'
          + ' 뿐, 틈이 필요한 것은 같습니다.')
      }
    } else {
      notes.push(`ΔL = α·L·ΔT = ${round2(grow1)} 입니다 (구한 값, α 는 ppm/°C 로`
        + ' 읽습니다). 상대 부재의 α 를 물리면 서로 미는 양으로 바뀝니다.')
    }
    notes.push('이 움직임은 상온 도면 어디에도 없습니다 — 조립 공차와 별도로,'
      + ' 여름과 겨울 사이를 오갑니다.')
  }
  notes.push('한쪽 끝만 고정하고 반대쪽은 미끄러질 틈을 줍니다 — 양끝을 다 조이면'
    + ' 밀린 만큼 휘거나 구멍을 찢습니다.')
  notes.push('부재 두께는 보기 좋은 비율일 뿐, 계산에는 L·ΔT·α 만 쓰입니다.')

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
  id: 'thermal_gap',
  name: '열팽창 틈',
  summary: 'ΔL = α·L·ΔT — 이종 재질이 서로 미는 양과, 한쪽만 고정하라는 처방.',
  params: PARAMS,
  build,
}
