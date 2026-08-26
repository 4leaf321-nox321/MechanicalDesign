/**
 * 평기어 — 모듈 `m` 과 잇수 `z` 로 정해지는 그 그림.
 *
 * 기어의 크기는 모듈과 잇수가 **함께** 정한다: `d = m·z`. 그래서 모듈만 보거나
 * 잇수만 봐서는 크기를 알 수 없고, 그림이 그 곱을 눈으로 보여 준다.
 *
 * 세 원을 그린다. 관례이면서 뜻이 있다:
 *
 *     이끝원 (실선)   d + 2m   — 바깥 지름
 *     피치원 (중심선) d        — **맞물림이 일어나는 원.** 계산의 기준
 *     이뿌리원 (숨은선) d − 2.5m
 *
 * 피치원을 중심선으로 그리는 것이 중요하다. 실선으로 그리면 재료의 경계처럼
 * 보이는데, 피치원은 물체의 모서리가 아니라 **약속된 기준**이다.
 */

import { ROLE, bounds, circle, crosshair, dim, path, positive } from './geometry'

const PARAMS = [
  { key: 'm', label: '모듈', required: true },
  { key: 'z', label: '잇수', required: true },
  { key: 'd', label: '피치원 지름', required: false },
]

const EXAMPLE = { m: 3, z: 20 }

/** 이를 다 그리면 오히려 안 읽히는 잇수. 넘으면 원만 그리고 그 사실을 적는다. */
const MAX_TEETH = 60

/** 이 하나가 피치 각을 얼마나 차지하나. 이끝과 이뿌리의 폭 비율. */
const TIP_SPAN = 0.32
const ROOT_SPAN = 0.5

function build(values) {
  const missing = PARAMS.filter(p => p.required && !positive(values[p.key]))
  const example = missing.length > 0
  const m = example ? EXAMPLE.m : positive(values.m)
  const z = Math.round(example ? EXAMPLE.z : positive(values.z))

  if (!example && z < 6) {
    return { ok: false, impossible: `잇수(${z})가 너무 적어 기어 모양이 안 됩니다.` }
  }

  // 피치원을 따로 준 카드도 있다. 있으면 그것을 믿고, 없으면 m·z 로 구한다 —
  // 둘이 다르면 카드가 이미 어긋난 것이라 여기서 판단할 일이 아니다.
  // 피치원을 따로 준 카드도 있다. 있으면 그것을 믿고 그리되, m·z 와 어긋나면
  // **어긋났다고 말한다** — 이 도해의 일이 어긋남을 보이는 것이라, 조용히
  // 한쪽을 고르면 제 일과 반대로 간다. 필릿 용접이 a ≠ z/√2 를 말하는 것과
  // 같은 이유다.
  const given = example ? null : positive(values.d)
  const d = given || m * z
  const rPitch = d / 2
  const rTip = rPitch + m
  const rRoot = rPitch - m * 1.25

  const notes = []
  if (given && Math.abs(given - m * z) / (m * z) > 0.02) {
    notes.push(`준 피치원 지름(${given})이 m·z = ${m * z} 와 다릅니다 — 그림은`
      + ' 준 값을 따랐지만, 셋 중 하나는 어긋나 있습니다.')
  }
  const drawTeeth = z <= MAX_TEETH
  if (!drawTeeth) {
    notes.push(`잇수가 ${z}개라 이를 하나씩 그리면 오히려 안 읽혀, 원만 그렸습니다.`)
  }

  const shapes = []
  if (drawTeeth) {
    // 이 하나를 이뿌리 → 이끝 → 이끝 → 이뿌리로 훑어 한 붓에 돈다.
    const step = (Math.PI * 2) / z
    const at = (r, a) => [r * Math.cos(a), r * Math.sin(a)]
    const points = []
    for (let i = 0; i < z; i += 1) {
      const a = i * step
      points.push(at(rRoot, a - step * ROOT_SPAN / 2))
      points.push(at(rTip, a - step * TIP_SPAN / 2))
      points.push(at(rTip, a + step * TIP_SPAN / 2))
      points.push(at(rRoot, a + step * ROOT_SPAN / 2))
    }
    shapes.push(path(
      `M ${points.map(p => `${p[0].toFixed(3)} ${p[1].toFixed(3)}`).join(' L ')} Z`,
      ROLE.cut,
    ))
  } else {
    shapes.push(circle(0, 0, rTip))
    shapes.push(circle(0, 0, rRoot, ROLE.hidden))
  }

  // 피치원은 **기준**이지 재료의 경계가 아니다. 중심선으로 그린다.
  shapes.push(circle(0, 0, rPitch, ROLE.center))
  shapes.push(...crosshair(0, 0, rTip, 1.08))

  const pad = rTip * 0.34
  const value = (key) => (example ? null : positive(values[key]))
  // 치수선을 **기어 밖으로** 뺀다. 중심선 기준으로 띄우면 선이 이 사이를 지나가
  // 형상 위에 얹힌 그림이 된다. 둘은 서로도 겹치지 않게 층을 나눈다.
  const dims = [
    dim([-rPitch, 0], [rPitch, 0],
        { offset: rTip + pad * 0.6, label: 'Ø{}', symbol: 'd',
          value: example ? null : d, unit: values._units?.d }),
    dim([-rTip, 0], [rTip, 0],
        { offset: rTip + pad * 1.9, label: 'Ø{}', symbol: 'da',
          value: example ? null : Math.round((rTip * 2) * 1000) / 1000,
          unit: values._units?.d }),
    // da 는 카드의 값이 아니라 d + 2m 로 **구한** 값이다. 아래 노트가 그 사실을
    // 말한다 — 구한 값을 준 값처럼 적으면 ㄷ형강 도심에서 지킨 규칙이 여기서만
    // 빠진다.
  ]

  const tags = []
  if (!example) {
    tags.push({ type: 'tag', x: 0, y: -rTip - pad * 0.5,
                text: `m = ${value('m')}, z = ${z}`, anchor: 'middle' })
    notes.push('이끝원 지름(da)은 d + 2m 로 구한 값입니다 — 카드가 준 값이 아닙니다.')
  }

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
  id: 'gear',
  name: '평기어',
  summary: '모듈과 잇수. 피치원·이끝원·이뿌리원을 관례대로 구분해 그립니다.',
  params: PARAMS,
  build,
}
