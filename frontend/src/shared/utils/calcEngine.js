/**
 * 카드 계산 — 입력값을 받아 중간값·결과값을 구한다.
 *
 * **계산 순서를 아는 곳은 여기 하나다.** 예전에는 같은 절차가 두 벌이었다
 * (카드 화면의 계산 버튼, DOE 러너). 이제 서버 검증까지 세 번째가 붙는데,
 * 세 벌이 되면 "화면에서는 되는데 DOE에서는 다른 값" 같은 어긋남이 생긴다.
 *
 * 절차:
 *   1. 입력 변수의 기호에 값을 담는다
 *   2. 중간값을 **풀릴 때까지 반복** 계산한다 — 서로를 참조할 수 있으므로
 *      한 번 훑어서는 순서를 알 수 없다. 한 바퀴 돌아 하나도 못 풀면 멈춘다
 *      (순환 참조이거나 값이 빠진 것)
 *   3. 결과값을 계산한다
 *
 * 반환은 변수 id 기준이다. DOE 처럼 기호 기준이 필요한 쪽은 바깥에서 바꾼다.
 */

// 확장자를 적는다. Vite 는 없어도 찾지만, 서버가 이 파일을 node 로 그대로
// 실행하기 때문이다(backend/evaluator/run.mjs) — node 는 확장자를 요구한다.
import { evaluateVariable } from './evaluators.js'

/** 이 변수가 계산에 쓸 정의를 갖고 있는가. */
export function hasDefinition(v) {
  if (v.var_type === 'table') return !!v.table_data
  if (v.var_type === 'conditional') return !!v.conditional_data
  if (v.var_type === 'interp_table') return !!v.interp_data
  return !!v.formula
}

/** 정의가 없을 때 화면에 보일 사유. */
export function missingLabel(v) {
  if (v.var_type === 'table') return '테이블 정의 없음'
  if (v.var_type === 'conditional') return '조건부 정의 없음'
  if (v.var_type === 'interp_table') return '보간 테이블 정의 없음'
  return '수식 없음'
}

/** 입력 변수의 기본값 — 사용자가 아직 아무것도 넣지 않았을 때. */
export function defaultInputValue(v) {
  if (v.var_type === 'array') return []
  if (v.var_type === 'slider') return v.min_value
  if (v.var_type === 'dropdown') {
    try {
      const opts = JSON.parse(v.options_data || '[]')
      return Array.isArray(opts) ? (opts[0] ?? '') : ''
    } catch {
      return ''
    }
  }
  return ''
}

/**
 * 카드 하나를 계산한다.
 *
 * `values` 는 변수 id → 값. 없으면 그 변수의 기본값을 쓴다.
 * 돌려주는 `results` 는 변수 id → `{ value, error }`.
 */
export function calculateCard(variables, values = {}) {
  const list = variables || []
  const symbolMap = {}

  list.forEach(v => {
    if (v.symbol && v.category === 'input') {
      symbolMap[v.symbol] = values[v.id] ?? defaultInputValue(v)
    }
  })

  const results = {}
  const intermediates = list.filter(v => v.category === 'intermediate')
  const outputs = list.filter(v => v.category === 'output')

  intermediates.forEach(v => {
    if (!hasDefinition(v)) results[v.id] = { value: null, error: missingLabel(v) }
  })

  // 중간값 — 서로 참조할 수 있으므로 더 못 풀 때까지 반복한다.
  let remaining = intermediates.filter(hasDefinition)
  let progressed = true
  while (progressed && remaining.length > 0) {
    progressed = false
    const next = []
    for (const v of remaining) {
      const result = evaluateVariable(v, symbolMap)
      if (result.value !== null) {
        results[v.id] = result
        if (v.symbol) symbolMap[v.symbol] = result.value
        progressed = true
      } else {
        next.push(v)
      }
    }
    remaining = next
  }
  // 끝까지 못 푼 것은 마지막 오류를 그대로 남긴다 — 순환 참조이거나 값이 빠졌다.
  remaining.forEach(v => { results[v.id] = evaluateVariable(v, symbolMap) })

  outputs.forEach(v => {
    if (!hasDefinition(v)) {
      results[v.id] = { value: null, error: missingLabel(v) }
      return
    }
    const result = evaluateVariable(v, symbolMap)
    results[v.id] = result
    if (v.symbol && result.value !== null) symbolMap[v.symbol] = result.value
  })

  return { results, symbols: symbolMap }
}
