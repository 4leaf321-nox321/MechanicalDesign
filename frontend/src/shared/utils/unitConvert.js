/**
 * 입력 단위 환산.
 *
 * 변수는 자기 단위를 하나 선언한다(예: `N`). 계산은 **언제나 그 단위의 값**으로
 * 돈다 — 저장되는 값도, 수식에 들어가는 값도, 계산 기록에 남는 값도 그렇다.
 * 사용자가 kN 으로 넣고 싶어 하는 것은 넣는 방식일 뿐 계산의 일부가 아니다.
 *
 * 그래서 여기서 하는 일은 곱셈 하나다.
 *
 *     선언 단위 값 = 넣은 값 × (고른 단위 배율 / 선언 단위 배율)
 *
 * **단위가 무엇인지는 서버가 안다.** 배율은 변수와 함께 내려온다(`unit_info`).
 * 화면이 단위 문자열을 해석하기 시작하면 단위 규칙이 두 벌이 되고, 두 벌은
 * 반드시 어긋난다 — 그 어긋남은 "화면에서는 환산했는데 검증은 다르게 보는"
 * 형태라 원인을 찾기가 아주 어렵다.
 */

/** 이 변수에 단위를 골라 넣을 수 있는가. 고를 것이 하나뿐이면 고를 이유가 없다. */
export function hasChoices(unitInfo) {
  return !!unitInfo && Array.isArray(unitInfo.alternatives)
    && unitInfo.alternatives.length > 1
}

function factorOf(unitInfo, unit) {
  if (!unitInfo) return null
  const hit = (unitInfo.alternatives || []).find(a => a.unit === unit)
  return hit ? hit.factor : null
}

/**
 * 사용자가 친 글자 → 선언 단위의 값.
 *
 * 숫자가 아니면 **그대로 돌려준다.** 지우는 중이거나("", "-", "1.") 아직 다 안
 * 친 상태인데 0 으로 바꿔 버리면, 타이핑 도중에 값이 멋대로 변한다.
 */
export function toDeclared(text, unitInfo, chosenUnit) {
  if (text === '' || text === null || text === undefined) return ''
  const factor = factorOf(unitInfo, chosenUnit)
  if (factor === null || !unitInfo) return text
  const value = Number(text)
  if (!Number.isFinite(value)) return text
  return value * (factor / unitInfo.factor)
}

/**
 * 선언 단위의 값 → 고른 단위로 보일 글자.
 *
 * 단위를 바꿔 고를 때 쓴다. 값 자체는 그대로이고 보이는 표기만 바뀐다.
 */
export function fromDeclared(value, unitInfo, chosenUnit) {
  if (value === '' || value === null || value === undefined) return ''
  const factor = factorOf(unitInfo, chosenUnit)
  if (factor === null || !unitInfo) return String(value)
  const number = Number(value)
  if (!Number.isFinite(number)) return String(value)
  return formatNumber(number * (unitInfo.factor / factor))
}

/**
 * 부동소수점 찌꺼기를 걷어낸다.
 *
 * 1500 N 을 kN 으로 되돌리면 `1.4999999999999998` 이 나온다. 그 글자가 칸에
 * 뜨면 사용자는 자기가 잘못 넣은 줄 안다. 유효숫자 12자리로 다듬으면 실제
 * 계산에 쓰는 정밀도는 그대로 두면서 그 찌꺼기만 사라진다.
 */
export function formatNumber(value) {
  if (!Number.isFinite(value)) return String(value)
  if (value === 0) return '0'
  const cleaned = Number(value.toPrecision(12))
  return String(cleaned)
}
