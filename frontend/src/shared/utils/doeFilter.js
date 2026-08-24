/**
 * DOE 결과에서 **설계 조건을 만족하는 조합만** 거른다.
 *
 * DOE 는 조합을 전부 계산해 표로 준다. 그런데 실제로 알고 싶은 것은 표 전체가
 * 아니라 *"허용응력 200 이하이면서 무게 5kg 이하인 조합"* 이다. 지금까지는 그것을
 * 표에서 눈으로 골라야 했고, 조합이 몇백 개면 사실상 못 한다.
 *
 * **설계 조건은 대개 부등식이다.** 허용응력 '이하', 안전율 '이상' 이지 '정확히'
 * 가 아니다. 그래서 역계산(등식)과 이 필터(부등식)는 서로 다른 질문에 답한다 —
 * 필터는 쓸 수 있는 **영역**을, 역계산은 그 영역의 **가장자리**를 준다.
 *
 * ## 숫자가 아닌 칸을 어떻게 볼 것인가
 *
 * DOE 표에는 계산이 실패한 칸이 섞인다(0으로 나누기, 표 조회 실패 등). 그런 행을
 * **조건을 만족하는 것으로 셀 수는 없다** — 값이 없는데 200 이하일 리 없다.
 * 그렇다고 조용히 버리면 "왜 조합이 줄었지" 를 알 수 없으므로, 몇 개가 그렇게
 * 빠졌는지 따로 세어 돌려준다.
 */

export const OPERATORS = [
  { op: 'lte', label: '이하 (≤)' },
  { op: 'gte', label: '이상 (≥)' },
  { op: 'between', label: '범위 안' },
  { op: 'eq', label: '같음 (=)' },
]

/** 조건 한 줄이 쓸 만한가. 비어 있는 줄은 무시하지 거부하지 않는다. */
export function isUsable(cond) {
  if (!cond || !cond.key) return false
  if (cond.op === 'between') {
    return isNum(cond.value) && isNum(cond.value2)
  }
  return isNum(cond.value)
}

function isNum(v) {
  return Number.isFinite(toNumber(v))
}

/**
 * 셀 값을 숫자로. 숫자가 아니면 NaN.
 *
 * **`Number()` 를 그냥 쓰면 안 된다.** `Number(null)` 과 `Number('')` 은 둘 다
 * **0** 이다. 계산이 실패해 비어 있는 칸이 0 으로 읽히면 '200 이하' 를 만족한
 * 것으로 세어지고, 그 조합은 표에 정상처럼 남는다 — 값이 없는데 조건을 만족할
 * 리가 없다.
 */
function toNumber(v) {
  if (v === '' || v === null || v === undefined) return NaN
  if (Array.isArray(v)) return NaN
  if (typeof v === 'boolean') return NaN
  return Number(v)
}

/**
 * `=` 로 실수를 비교할 때 쓰는 허용 오차.
 *
 * 부동소수는 `0.1 + 0.2 !== 0.3` 이다. DOE 격자 값도 곱셈으로 만들어져 끝자리가
 * 흔들리므로, 정확히 같기를 요구하면 **눈에는 같은 값인데 하나도 안 걸린다.**
 * 크기에 비례해 재는 것은 큰 값에서 절대 오차가 무의미하기 때문이다.
 */
function nearlyEqual(a, b) {
  const scale = Math.max(1, Math.abs(a), Math.abs(b))
  return Math.abs(a - b) <= scale * 1e-9
}

function matches(row, cond) {
  // 배열·문자열·계산 실패는 숫자 조건을 만족하지 않는다. 값이 없는데 '이하'
  // 일 수는 없다.
  const value = toNumber(row[cond.key])
  if (!Number.isFinite(value)) return null

  const a = Number(cond.value)
  switch (cond.op) {
    case 'lte': return value <= a
    case 'gte': return value >= a
    case 'eq': return nearlyEqual(value, a)
    case 'between': {
      const b = Number(cond.value2)
      const lo = Math.min(a, b)
      const hi = Math.max(a, b)
      return value >= lo && value <= hi
    }
    default: return null
  }
}

/**
 * 조건을 모두(AND) 만족하는 행만.
 *
 * @returns { rows, total, matched, skipped }
 *   skipped 는 숫자가 아니라서 판정할 수 없었던 행 수다.
 */
export function applyConditions(rows, conditions) {
  const list = Array.isArray(rows) ? rows : []
  const active = (conditions || []).filter(isUsable)

  if (active.length === 0) {
    return { rows: list, total: list.length, matched: list.length, skipped: 0 }
  }

  let skipped = 0
  const out = list.filter((row) => {
    let undecidable = false
    for (const cond of active) {
      const hit = matches(row, cond)
      if (hit === null) { undecidable = true; break }
      if (!hit) return false
    }
    if (undecidable) { skipped += 1; return false }
    return true
  })

  return { rows: out, total: list.length, matched: out.length, skipped }
}

/**
 * 어느 열이 실제로 가질 수 있는 값의 범위.
 *
 * 하나도 안 걸렸을 때 **왜 안 걸렸는지**를 말해 주려고 쓴다. "조건을 만족하는
 * 조합이 없습니다" 만으로는 조건을 늦출지 범위를 넓힐지 알 수 없다.
 */
export function rangeOf(rows, key) {
  let min = Infinity
  let max = -Infinity
  for (const row of rows || []) {
    const v = toNumber(row[key])
    if (!Number.isFinite(v)) continue
    if (v < min) min = v
    if (v > max) max = v
  }
  return Number.isFinite(min) ? { min, max } : null
}

export default applyConditions
