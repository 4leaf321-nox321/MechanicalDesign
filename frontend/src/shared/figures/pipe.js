/**
 * 관로 — 곧은 관 한 구간. 압력손실 검토가 보는 그림이다.
 *
 * 손실은 `f · (L/D) · ρv²/2` 이므로 **L 과 D 의 비**가 이 계산의 전부다. 그래서
 * 세로 단면(옆에서 본 모습)으로 그린다 — 그 둘이 한 그림에 나온다.
 *
 * ## 비율이 감당이 안 되는 자리
 *
 * 묻힘키는 b/d 가 0.3 쯤이라 실제 비율로 그려도 읽힌다. 관은 다르다. L=100 m,
 * D=0.1 m 면 1000:1 이고, 실제 비율로 그리면 **선 한 줄**이 된다. 그렇다고 슬쩍
 * 짧게 그리면 그림이 거짓말을 한다.
 *
 * 실제 도면이 쓰는 방법을 그대로 쓴다 — **파단선.** 길이를 줄여 그리되 줄였다는
 * 사실을 기호로 적고, 치수에는 진짜 값을 쓴다. 「이 방향은 축척이 아니다」 를
 * 그림이 스스로 말하므로 읽는 사람이 속지 않는다.
 *
 * 지름 방향은 **절대 안 줄인다.** 관 굵기는 눈으로 가늠하는 값이라 그것까지
 * 손대면 그림이 아무 말도 못 하게 된다.
 */

import { ROLE, bounds, breakLine, dim, flow, line, positive } from './geometry'

const PARAMS = [
  { key: 'D', label: '관 안지름', required: true },
  { key: 'L', label: '관 길이', required: true },
  { key: 'Q', label: '유량', required: false },
]

/** 값이 없을 때 그릴 비율. 숫자는 하나도 안 적는다. */
const EXAMPLE = { D: 0.1, L: 0.45 }

/**
 * 길이를 지름의 몇 배까지 실제로 그릴까.
 *
 * 이보다 길면 파단해서 줄인다. 6 은 「관처럼 보이는 가장 짧은 비율」 쯤이다 —
 * 더 작으면 토막처럼, 더 크면 벌써 읽기 나빠진다.
 */
const MAX_ASPECT = 6

function build(values) {
  const missing = PARAMS.filter(p => p.required && !positive(values[p.key]))
  const example = missing.length > 0
  const use = example
    ? EXAMPLE
    : { D: positive(values.D), L: positive(values.L), Q: positive(values.Q) }

  const D = use.D
  const R = D / 2
  const notes = []

  // 길이를 그릴 만큼만. 줄였으면 그 사실을 파단선과 알림 둘로 말한다.
  const full = MAX_ASPECT * D
  const cut = use.L > full
  const drawn = cut ? full : use.L
  if (cut && !example) {
    notes.push('길이가 지름에 비해 길어 파단해서 줄여 그렸습니다. 치수는 실제 값입니다.')
  }

  const shapes = []
  const x0 = 0
  const x1 = drawn

  // 관 벽 — 안지름이라 두 줄이다. 두께는 이 계산에 없는 값이라 안 그린다.
  shapes.push(line(x0, -R, x1, -R))
  shapes.push(line(x0, R, x1, R))
  // 양끝은 잘린 자리. 막아 두지 않으면 관이 아니라 띠 두 줄로 보인다.
  shapes.push(line(x0, -R, x0, R))
  shapes.push(line(x1, -R, x1, R))
  shapes.push(line(x0 - D * 0.18, 0, x1 + D * 0.18, 0, ROLE.center))

  if (cut) {
    const gap = D * 0.22
    const mid = drawn / 2
    shapes.push(breakLine(mid - gap / 2, R, D * 0.09))
    shapes.push(breakLine(mid + gap / 2, R, D * 0.09))
  }

  // 흐르는 방향. 관 그림만으로는 정지한 통처럼도 보인다.
  const flows = [flow(drawn * 0.28, 0, drawn * 0.52, 0,
                      positive(values.Q) && !example ? 'Q' : '')]

  const pad = D * 0.75
  const at = (key) => (example ? null : use[key])
  const dims = [
    // 안지름은 왼쪽 바깥에.
    dim([x0, -R], [x0, R],
        { offset: -pad * 0.55, label: 'Ø{}', symbol: 'D',
          value: at('D'), unit: values._units?.D }),
    // 길이는 아래에. 줄여 그렸어도 **진짜 값**을 적는다.
    dim([x0, R], [x1, R],
        { offset: pad, label: '{}', symbol: 'L',
          value: at('L'), unit: values._units?.L }),
  ]

  return {
    ok: true,
    example,
    missing: missing.map(p => p.key),
    shapes,
    flows,
    dims,
    notes,
    box: bounds([...shapes, ...dims]),
  }
}

export default {
  id: 'pipe',
  name: '관로',
  summary: '안지름과 길이. 손실이 L/D 로 정해지므로 그 비가 그림에 나옵니다.',
  params: PARAMS,
  build,
}
