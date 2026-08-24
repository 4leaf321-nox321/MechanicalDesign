/**
 * 민감도 — **지금 이 설계에서** 어느 입력이 결과를 가장 크게 흔드는가.
 *
 * "안전율이 왜 이렇게 낮지" 에 답하는 자리다. 입력이 열 개면 어느 것을 손봐야
 * 하는지 알 수 없어, 하나씩 바꿔 보며 감으로 찾게 된다.
 *
 * ## DOE 의 상관관계와 무엇이 다른가
 *
 * DOE 는 **범위 전체**에서 어느 변수가 결과와 함께 움직이는지를 본다. 여기는
 * **지금 화면에 있는 그 설계점** 주변만 본다. 물음이 다르다 —
 *
 *     DOE 상관관계   "이 계산에서 대체로 무엇이 중요한가"
 *     민감도         "지금 이 치수에서 무엇을 건드리면 가장 빨리 움직이는가"
 *
 * 설계는 대개 특정 안을 손보는 일이라 두 번째가 더 자주 필요하다. 그리고 DOE 를
 * 먼저 돌리지 않아도 된다.
 *
 * ## 한 번에 하나씩(OAT) 의 한계
 *
 * 입력을 하나씩만 흔든다. 그래서 **변수끼리 얽힌 효과는 안 보인다** — 두께와
 * 폭을 함께 키웠을 때만 생기는 변화 같은 것이다. 그건 DOE 가 답할 몫이고,
 * 여기서는 그 사실을 화면에 적어 둔다.
 */

import { calculateCard, defaultInputValue } from './calcEngine'

/** 기본 흔들기 폭. 설계 검토에서 "10% 정도 바꿔 보면" 이 가장 흔한 감각이다. */
export const DEFAULT_PERCENT = 10

function numeric(v) {
  if (v === '' || v === null || v === undefined) return NaN
  if (Array.isArray(v) || typeof v === 'boolean') return NaN
  return Number(v)
}

/**
 * 이 입력을 얼마만큼 흔들 것인가.
 *
 * **0 을 퍼센트로 흔들면 움직이지 않는다.** 0 의 10% 는 0 이라, 그 변수는 늘
 * "영향 없음" 으로 나오고 사람은 정말 영향이 없다고 믿는다. 그때는 절대량으로
 * 흔든다 — 슬라이더면 그 범위의 10%, 범위도 없으면 1.
 */
export function stepFor(variable, base, percent) {
  const ratio = Math.abs(percent) / 100
  const byPercent = Math.abs(base) * ratio
  if (byPercent > 0) return byPercent

  const lo = numeric(variable.min_value)
  const hi = numeric(variable.max_value)
  if (Number.isFinite(lo) && Number.isFinite(hi) && hi > lo) {
    return (hi - lo) * ratio
  }
  return ratio * 10 || 1
}

/**
 * @param variables 카드의 변수 전부
 * @param values    지금 화면의 입력값 — 이 점을 기준으로 흔든다
 * @param outputId  무엇이 흔들리는지 볼 결과 변수
 * @param percent   흔들 폭(%)
 */
export function sensitivity(variables, values, outputId, percent = DEFAULT_PERCENT) {
  const list = variables || []
  const pct = Number(percent)
  if (!Number.isFinite(pct) || pct <= 0) {
    return { ok: false, reason: 'percent', message: '흔들 폭을 0보다 큰 수로 입력해 주세요.' }
  }

  const at = (patch) => {
    const { results } = calculateCard(list, { ...values, ...patch })
    const r = results[outputId]
    if (!r || r.error) return NaN
    return numeric(r.value)
  }

  const base = at({})
  if (!Number.isFinite(base)) {
    return {
      ok: false,
      reason: 'base',
      message: '지금 입력값으로는 이 결과가 계산되지 않습니다. 먼저 계산이 되는 값을 넣어 주세요.',
    }
  }

  const rows = []
  const skipped = []

  for (const v of list) {
    if (v.category !== 'input') continue
    // 드롭다운·배열은 **사이값이 없다.** 10% 흔든다는 말 자체가 성립하지 않는다.
    if (v.var_type !== 'slider' && v.var_type !== 'text') {
      skipped.push({ variable: v, why: '숫자 입력이 아닙니다' })
      continue
    }

    const raw = values?.[v.id] ?? defaultInputValue(v)
    const baseValue = numeric(raw)
    if (!Number.isFinite(baseValue)) {
      skipped.push({ variable: v, why: '값이 비어 있습니다' })
      continue
    }

    const step = stepFor(v, baseValue, pct)
    const low = at({ [v.id]: baseValue - step })
    const high = at({ [v.id]: baseValue + step })

    if (!Number.isFinite(low) && !Number.isFinite(high)) {
      skipped.push({ variable: v, why: '흔들면 계산이 되지 않습니다' })
      continue
    }

    // 한쪽만 계산되는 경우가 있다(0 이하로 내려가면 깨지는 식 등). 그쪽은
    // 기준값으로 두어 **없는 변화를 지어내지 않는다.**
    const lowValue = Number.isFinite(low) ? low : base
    const highValue = Number.isFinite(high) ? high : base

    rows.push({
      variable: v,
      baseValue,
      step,
      low: lowValue,
      high: highValue,
      lowDelta: lowValue - base,
      highDelta: highValue - base,
      // 막대 길이. 어느 쪽으로 움직이든 **폭**이 영향력이다.
      span: Math.abs(highValue - lowValue),
      oneSided: Number.isFinite(low) !== Number.isFinite(high),
    })
  }

  // 큰 것부터. 토네이도 그림이 위가 넓고 아래가 좁은 이유가 이것이다.
  rows.sort((a, b) => b.span - a.span)

  const widest = rows.length ? rows[0].span : 0
  for (const r of rows) {
    // 가장 큰 것 대비 몇 %. 절대값만 보면 단위가 다른 결과끼리 비교가 안 된다.
    r.share = widest > 0 ? r.span / widest : 0
  }

  return { ok: true, base, rows, skipped, percent: pct }
}

export default sensitivity
