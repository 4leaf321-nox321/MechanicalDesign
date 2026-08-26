/**
 * 스냅핏 — 외팔보 훅.
 *
 * 수지물 하우징 체결의 기본이다. 조립할 때 훅이 걸림량 `y` 만큼 휘어야 하고,
 * 그 순간 뿌리에 걸리는 변형률이 이 설계의 전부다:
 *
 *     ε = 1.5 · t · y / L²
 *
 * 이 식이 하는 말이 직관과 반대다. **훅이 부러지면 두껍게 하고 싶어지는데,
 * 같은 y 를 위해 t 를 키우면 변형률이 커진다.** 맞는 손은 길이 L 을 늘리는
 * 쪽이다 — 제곱으로 듣는다. 숫자 세 개(t·L·y)만 봐서는 이 방향이 안 보인다.
 *
 * 그림은 세 값이 어디인지 짚고, 변형이 몰리는 뿌리를 가리키고, 조립 순간의
 * 휜 모양을 참고선으로 겹쳐 보인다.
 */

import { ROLE, bounds, dim, line, path, positive, rect, tag } from './geometry'
import { fixed as fixedEnd } from './supports'

const PARAMS = [
  { key: 't', label: '훅 두께', required: true },
  { key: 'L', label: '팔 길이', required: true },
  { key: 'y', label: '걸림량', required: true },
  { key: 'alpha', label: '삽입각 (°)', required: false },
]

const EXAMPLE = { t: 2, L: 18, y: 2.5 }

/** 삽입각을 안 주면 이 각도로 그린다. 흔히 쓰는 값이다. */
const DEFAULT_ALPHA = 30
/** 그릴 수 있는 삽입각 범위. 벗어나면 여기로 눌러 그리고 그렇다고 적는다. */
const ALPHA_MIN = 15
const ALPHA_MAX = 60

function build(values) {
  const missing = PARAMS.filter(p => p.required && !positive(values[p.key]))
  const example = missing.length > 0
  const t = example ? EXAMPLE.t : positive(values.t)
  const L = example ? EXAMPLE.L : positive(values.L)
  const y = example ? EXAMPLE.y : positive(values.y)

  if (!example && t >= L) {
    return {
      ok: false,
      impossible: `팔 길이(${L})가 두께(${t})보다 길어야 외팔보가 됩니다.`,
    }
  }

  const notes = []
  const givenAlpha = example ? null : positive(values.alpha)
  let alpha = givenAlpha || DEFAULT_ALPHA
  if (givenAlpha && (givenAlpha < ALPHA_MIN || givenAlpha > ALPHA_MAX)) {
    alpha = Math.min(Math.max(givenAlpha, ALPHA_MIN), ALPHA_MAX)
    notes.push(`삽입각 ${givenAlpha}° 는 그리기 어려워 ${alpha}° 로 눌러 그렸습니다.`)
  } else if (!givenAlpha && !example) {
    notes.push(`삽입각이 배선되지 않아 ${DEFAULT_ALPHA}° 로 그렸습니다.`)
  }

  // 물림면(수직)에서 삽입 경사가 시작되는 자리. 경사가 팔을 다 먹으면 훅이 아니다.
  const lead = y / Math.tan((alpha * Math.PI) / 180)
  if (!example && lead >= L * 0.8) {
    return {
      ok: false,
      impossible: `걸림량(${y})이 팔 길이(${L})에 비해 커서 이 삽입각으로는 훅 모양이 안 됩니다.`,
    }
  }
  const xr = L - lead

  const size = Math.max(t, y) * 1.05
  const shapes = [
    rect(0, 0, L, t),                                   // 팔 — 위가 y = 0
    ...fixedEnd(0, t / 2, size, [-1, 0]),               // 뿌리 벽
    // 훅: 물림면은 수직, 삽입면은 경사. 물림면이 기울면 빠짐턱이 아니다.
    path(`M ${xr} 0 L ${xr} ${-y} L ${L} 0 Z`),
  ]

  // 조립 순간의 휜 모양. 실제 처짐 곡선의 흉내일 뿐이라 참고선으로 그린다 —
  // 이 선이 있어야 「y 는 치수가 아니라 움직임」 이라는 것이 읽힌다.
  shapes.push(path(`M 0 0 Q ${L * 0.55} ${y * 0.08} ${L} ${y}`, ROLE.ghost))

  // 변형이 몰리는 자리. 식의 ε 가 바로 여기 값이다.
  const lift = Math.max(y, t) * 1.4
  shapes.push(line(L * 0.05, 0, L * 0.14, -lift, ROLE.ghost))
  const tags = [tag(L * 0.16, -lift - t * 0.2, '최대 변형률은 뿌리에', 'start')]
  if (givenAlpha || example) {
    if (example || alpha === givenAlpha) {
      tags.push(tag(xr + lead * 0.62, -y * 0.72,
                    example ? 'α' : `α = ${alpha}°`, 'start'))
    }
  }

  const pad = L * 0.14
  const shown = (v) => (example ? null : v)
  const dims = [
    dim([L, 0], [L, t],
        { offset: pad * 0.55, label: '{}', symbol: 't',
          value: shown(t), unit: values._units?.t }),
    dim([0, t], [L, t],
        { offset: pad, label: '{}', symbol: 'L',
          value: shown(L), unit: values._units?.L }),
    dim([xr, -y], [xr, 0],
        { offset: lead + pad * 1.6, label: '{}', symbol: 'y',
          value: shown(y), unit: values._units?.y }),
  ]

  if (!example) {
    const strain = (1.5 * t * y) / (L * L)
    const percent = Math.round(strain * 10000) / 100
    notes.push(`조립 순간 뿌리 변형률 ε = 1.5·t·y/L² ≈ ${percent} % 입니다 (구한 값)`
      + ' — 수지 허용 변형률(대개 2~8 %, 재료마다 다름)과 비교해야 합니다.')
    notes.push('훅이 부러지면 두껍게 하고 싶어지지만, 같은 y 에서 t 를 키우면'
      + ' 변형률이 커집니다 — 길이 L 을 늘리는 쪽이 맞습니다.')
  }
  notes.push('벽과 훅의 비율은 보기 좋게 그린 것일 뿐, 계산에는 t·L·y 만 쓰입니다.')

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
  id: 'snap_fit',
  name: '스냅핏',
  summary: '외팔보 훅. 뿌리 변형률 ε = 1.5ty/L² 이 어디서 오는지 짚습니다.',
  params: PARAMS,
  build,
}
