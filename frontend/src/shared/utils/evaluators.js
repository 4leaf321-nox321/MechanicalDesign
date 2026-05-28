// Variable evaluators — shared by single-calc view and DOE runner
// (원래 InputVariables.jsx 안에 있던 함수들을 재사용 가능하도록 분리)

// ============================================
// 수식·조건식에서 사용할 수 있는 내장 함수
// ============================================

// 표준 정규분포 CDF — Abramowitz & Stegun 7.1.26 erf 근사 (오차 ~1.5e-7)
function _erf(x) {
  const sign = x < 0 ? -1 : 1
  const ax = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * ax)
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax)
  return sign * y
}

function _normCdf(x, mean, stdev) {
  if (!Number.isFinite(stdev) || stdev <= 0) return NaN
  return 0.5 * (1 + _erf((x - mean) / (stdev * Math.SQRT2)))
}

const MATH_FUNCS = {
  sin: (x) => Math.sin(x),
  cos: (x) => Math.cos(x),
  tan: (x) => Math.tan(x),
  asin: (x) => Math.asin(x),
  acos: (x) => Math.acos(x),
  atan: (x) => Math.atan(x),
  atan2: (y, x) => Math.atan2(y, x),
  radians: (deg) => deg * Math.PI / 180,
  degrees: (rad) => rad * 180 / Math.PI,
  pi: () => Math.PI,
  abs: (x) => Math.abs(x),
  sqrt: (x) => Math.sqrt(x),
  log: (x) => Math.log(x),
  log10: (x) => Math.log10(x),
  exp: (x) => Math.exp(x),
  pow: (b, e) => Math.pow(b, e),
  min: (...args) => Math.min(...args.flat(Infinity)),
  max: (...args) => Math.max(...args.flat(Infinity)),
  average: (...args) => {
    const flat = args.flat(Infinity)
    if (flat.length === 0) return NaN
    return flat.reduce((a, b) => a + b, 0) / flat.length
  },
  // 정규분포 누적 확률 (%) — value 이하일 확률
  prob: (value, mean, stdev) => _normCdf(value, mean, stdev) * 100,
}
export const MATH_FUNC_NAMES = Object.keys(MATH_FUNCS)
export const RESERVED_NAMES = new Set(MATH_FUNC_NAMES)

// 식별자 단위 치환 — 변수 기호는 값으로 바꾸고, 함수 이름은 그대로 둔다.
// allowStrings=true이면 따옴표 문자열 안의 텍스트는 보존하고, 문자열 변수도 JSON 리터럴로 치환.
function _substituteIdents(expr, symbolMap, opts = {}) {
  let out = ''
  let i = 0
  const n = expr.length
  let inStr = false
  let strCh = null
  while (i < n) {
    const ch = expr[i]
    if (inStr) {
      out += ch
      if (ch === '\\' && i + 1 < n) { out += expr[i + 1]; i += 2; continue }
      if (ch === strCh) { inStr = false; strCh = null }
      i++
      continue
    }
    if (opts.allowStrings && (ch === '"' || ch === "'")) {
      inStr = true; strCh = ch; out += ch; i++; continue
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i
      while (j < n && /[A-Za-z0-9_]/.test(expr[j])) j++
      const ident = expr.slice(i, j)
      // 다음 비공백 문자가 '('이면 함수 호출
      let k = j
      while (k < n && expr[k] === ' ') k++
      const isFuncCall = expr[k] === '('

      if (isFuncCall && RESERVED_NAMES.has(ident)) {
        out += ident
      } else if (Object.prototype.hasOwnProperty.call(symbolMap, ident)) {
        const val = symbolMap[ident]
        if (val === undefined || val === null || val === '') {
          return { error: `${ident} 값 없음` }
        }
        const numVal = Number(val)
        if (Number.isFinite(numVal)) {
          out += `(${numVal})`
        } else if (opts.allowStrings) {
          out += JSON.stringify(String(val))
        } else {
          return { error: `${ident}는 문자열이라 수식에서 사용할 수 없음` }
        }
      } else if (RESERVED_NAMES.has(ident)) {
        // 함수 이름인데 `()` 없이 단독 사용 — 일단 그대로 두고 JS가 처리 (대개 에러)
        out += ident
      } else {
        out += ident
      }
      i = j
      continue
    }
    out += ch
    i++
  }
  return { expr: out, error: null }
}

function _checkUnknownIdent(expr) {
  // 따옴표 문자열 제거 후 식별자 추출 — 모두 RESERVED여야 OK
  const cleaned = expr.replace(/"(?:\\.|[^"\\])*"/g, '""').replace(/'(?:\\.|[^'\\])*'/g, "''")
  const idents = cleaned.match(/[A-Za-z_][A-Za-z0-9_]*/g) || []
  for (const id of idents) {
    if (!RESERVED_NAMES.has(id)) return id
  }
  return null
}

function _evalWithMath(expr) {
  // eslint-disable-next-line no-new-func
  const fn = new Function(...MATH_FUNC_NAMES, `"use strict"; return (${expr})`)
  return fn(...MATH_FUNC_NAMES.map(n => MATH_FUNCS[n]))
}

export function evaluateFormula(formula, symbolMap) {
  if (!formula) return { value: null, error: '수식 없음' }
  try {
    let expression = formula.replace(/\^/g, '**')
    const sub = _substituteIdents(expression, symbolMap)
    if (sub.error) return { value: null, error: sub.error }
    expression = sub.expr

    const unknown = _checkUnknownIdent(expression)
    if (unknown) return { value: null, error: `알 수 없는 이름: ${unknown}` }

    if (!/^[\w\s+\-*/().,]+$/.test(expression)) {
      return { value: null, error: '잘못된 수식' }
    }

    const result = _evalWithMath(expression)
    if (typeof result !== 'number' || !isFinite(result)) {
      return { value: null, error: '계산 오류' }
    }
    return { value: result, error: null }
  } catch {
    return { value: null, error: '수식 오류' }
  }
}

export function evaluateExpression(expr, symbolMap) {
  const trimmed = (expr || '').trim()
  if (!trimmed) return { value: null, error: '수식 없음' }
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) {
    const val = symbolMap[trimmed]
    if (val === undefined) return { value: null, error: `${trimmed} 미정의` }
    if (val === null || val === '') return { value: null, error: `${trimmed} 값 없음` }
    return { value: val, error: null }
  }
  return evaluateFormula(trimmed, symbolMap)
}

// 다중 조회 키 정규화 — 새 shape({keys:[...]})와 구 shape({key_column_index,...}) 모두 동일한 배열로 반환
export function normalizeTableKeys(table) {
  if (!table || typeof table !== 'object') return []
  if (Array.isArray(table.keys) && table.keys.length > 0) {
    return table.keys.map(k => ({
      column_index: Number(k?.column_index ?? 0),
      expression: String(k?.expression ?? ''),
      match_mode: k?.match_mode || 'exact',
    }))
  }
  if (table.key_column_index != null) {
    return [{
      column_index: Number(table.key_column_index),
      expression: String(table.key_expression || ''),
      match_mode: table.match_mode || 'exact',
    }]
  }
  return []
}

function _exactCellMatches(cell, target) {
  if (cell === undefined || cell === null) return false
  const cellStr = String(cell).trim()
  const targetStr = String(target).trim()
  if (cellStr === targetStr) return true
  const targetNum = Number(target)
  if (Number.isFinite(targetNum)) {
    const cellNum = Number(cell)
    if (Number.isFinite(cellNum) && cellNum === targetNum) return true
  }
  return false
}

export function evaluateTable(tableJson, symbolMap) {
  if (!tableJson) return { value: null, error: '테이블 정의 없음' }
  let table
  try {
    table = typeof tableJson === 'string' ? JSON.parse(tableJson) : tableJson
  } catch {
    return { value: null, error: '테이블 파싱 오류' }
  }
  const { columns, rows, result_column_index } = table || {}
  if (!Array.isArray(columns) || !Array.isArray(rows) || rows.length === 0) {
    return { value: null, error: '테이블 데이터 없음' }
  }
  if (result_column_index == null) {
    return { value: null, error: '결과 열 미지정' }
  }
  const keys = normalizeTableKeys(table)
  if (keys.length === 0) return { value: null, error: '조회 키 미정의' }

  // 각 키의 조회값 평가
  const evaluatedKeys = []
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]
    if (!k.expression || !k.expression.trim()) {
      return { value: null, error: `조회 키 ${i + 1} 수식 없음` }
    }
    const r = evaluateExpression(k.expression, symbolMap)
    if (r.value === null) return { value: null, error: `조회 키 ${i + 1}: ${r.error}` }
    const numericMode = ['nearest', 'floor', 'ceiling'].includes(k.match_mode)
    let targetNum = null
    if (numericMode) {
      const tn = Number(r.value)
      if (!Number.isFinite(tn)) {
        return { value: null, error: `조회 키 ${i + 1} ${k.match_mode} 매칭은 숫자 키에서만 가능` }
      }
      targetNum = tn
    }
    evaluatedKeys.push({ ...k, target: r.value, targetNum, numericMode })
  }

  // 모든 키 조건을 만족하는 후보 행 필터링
  // - exact: 셀 값이 target과 일치
  // - floor: 숫자 셀이고 cell <= target
  // - ceiling: 숫자 셀이고 cell >= target
  // - nearest: 숫자 셀이면 후보 (필터 통과), 비숫자는 제외
  let candidates = rows.map((row, idx) => ({ row, idx }))
  for (const ek of evaluatedKeys) {
    candidates = candidates.filter(({ row }) => {
      const cell = row[ek.column_index]
      if (ek.match_mode === 'exact') return _exactCellMatches(cell, ek.target)
      const v = Number(cell)
      if (!Number.isFinite(v)) return false
      if (ek.match_mode === 'floor') return v <= ek.targetNum
      if (ek.match_mode === 'ceiling') return v >= ek.targetNum
      return true  // nearest: 모든 숫자 행 후보
    })
    if (candidates.length === 0) {
      return { value: null, error: `조회 키 ${evaluatedKeys.indexOf(ek) + 1} 매칭되는 행 없음` }
    }
  }

  // 후보 중 best 행 선택: nearest/floor/ceiling은 |cell - target| 합이 최소인 행
  const numericKeys = evaluatedKeys.filter(k => k.numericMode)
  let best = candidates[0]
  if (numericKeys.length > 0) {
    let bestScore = Infinity
    for (const c of candidates) {
      let s = 0
      let valid = true
      for (const ek of numericKeys) {
        const v = Number(c.row[ek.column_index])
        if (!Number.isFinite(v)) { valid = false; break }
        s += Math.abs(v - ek.targetNum)
      }
      if (!valid) continue
      if (s < bestScore) { bestScore = s; best = c }
    }
  }

  const resultVal = best.row[result_column_index]
  if (resultVal === undefined || resultVal === null || String(resultVal).trim() === '') {
    return { value: null, error: '결과값 없음' }
  }
  const num = Number(resultVal)
  const value = Number.isFinite(num) && String(resultVal).trim() !== '' ? num : String(resultVal)
  return { value, error: null }
}

export function evaluateCondition(expression, symbolMap) {
  if (!expression || !expression.trim()) return { value: null, error: '조건식 없음' }
  try {
    let expr = expression.replace(/\^/g, '**')
    const sub = _substituteIdents(expr, symbolMap, { allowStrings: true })
    if (sub.error) return { value: null, error: sub.error }
    expr = sub.expr

    const unknown = _checkUnknownIdent(expr)
    if (unknown) return { value: null, error: `알 수 없는 이름: ${unknown}` }

    const stripped = expr.replace(/"(?:\\.|[^"\\])*"/g, '""')
    if (!/^[\w\s+\-*/().,<>=!&|"]+$/.test(stripped)) {
      return { value: null, error: '잘못된 조건식' }
    }
    const result = _evalWithMath(expr)
    return { value: !!result, error: null }
  } catch {
    return { value: null, error: '조건식 오류' }
  }
}

export function evaluateConditional(jsonStr, symbolMap) {
  if (!jsonStr) return { value: null, error: '조건부 정의 없음' }
  let data
  try {
    data = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr
  } catch {
    return { value: null, error: '조건부 파싱 오류' }
  }
  const branches = Array.isArray(data?.branches) ? data.branches : []
  const defaultFormula = data?.default_formula || ''

  for (let i = 0; i < branches.length; i++) {
    const b = branches[i] || {}
    if (!b.condition || !b.condition.trim()) continue
    const cond = evaluateCondition(b.condition, symbolMap)
    if (cond.value === null) return { value: null, error: `조건${i + 1}: ${cond.error}` }
    if (cond.value === true) {
      if (!b.formula || !b.formula.trim()) {
        return { value: null, error: `조건${i + 1} 수식 없음` }
      }
      return evaluateExpression(b.formula, symbolMap)
    }
  }
  if (!defaultFormula.trim()) {
    return { value: null, error: '조건 미일치, 기본 수식 없음' }
  }
  return evaluateExpression(defaultFormula, symbolMap)
}

export function evaluateInterpTable(interpJson, symbolMap) {
  if (!interpJson) return { value: null, error: '보간 테이블 정의 없음' }
  let data
  try {
    data = typeof interpJson === 'string' ? JSON.parse(interpJson) : interpJson
  } catch {
    return { value: null, error: '보간 테이블 파싱 오류' }
  }
  const { columns, rows, x_column_index, y_column_index, x_expression } = data || {}
  if (!Array.isArray(columns) || !Array.isArray(rows) || rows.length === 0) {
    return { value: null, error: '테이블 데이터 없음' }
  }
  if (x_column_index == null || y_column_index == null) {
    return { value: null, error: 'x/y 열 미지정' }
  }
  if (x_column_index === y_column_index) {
    return { value: null, error: 'x와 y 열은 서로 달라야 함' }
  }
  if (!x_expression || !x_expression.trim()) {
    return { value: null, error: 'x 수식 없음' }
  }
  const xResult = evaluateExpression(x_expression, symbolMap)
  if (xResult.value === null) return { value: null, error: `x 값: ${xResult.error}` }
  const xTarget = Number(xResult.value)
  if (!Number.isFinite(xTarget)) return { value: null, error: 'x 값이 숫자가 아님' }

  // 숫자형 (x, y) 쌍만 추출 후 x 오름차순 정렬
  const points = []
  for (const row of rows) {
    const xv = Number(row?.[x_column_index])
    const yv = Number(row?.[y_column_index])
    if (Number.isFinite(xv) && Number.isFinite(yv)) points.push([xv, yv])
  }
  if (points.length === 0) return { value: null, error: '숫자형 데이터 행이 없음' }
  if (points.length === 1) return { value: points[0][1], error: null }
  points.sort((a, b) => a[0] - b[0])

  const interp = (x0, y0, x1, y1) => {
    if (x1 === x0) return y0
    return y0 + (y1 - y0) * (xTarget - x0) / (x1 - x0)
  }

  const first = points[0]
  const last = points[points.length - 1]
  let y
  if (xTarget <= first[0]) {
    // 외삽 (왼쪽): 처음 두 점
    const [x0, y0] = first
    const [x1, y1] = points[1]
    y = interp(x0, y0, x1, y1)
  } else if (xTarget >= last[0]) {
    // 외삽 (오른쪽): 마지막 두 점
    const [x0, y0] = points[points.length - 2]
    const [x1, y1] = last
    y = interp(x0, y0, x1, y1)
  } else {
    // 내삽: 이분탐색으로 구간 찾기
    let lo = 0, hi = points.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (points[mid][0] <= xTarget) lo = mid
      else hi = mid
    }
    const [x0, y0] = points[lo]
    const [x1, y1] = points[hi]
    y = interp(x0, y0, x1, y1)
  }

  if (!Number.isFinite(y)) return { value: null, error: '보간 계산 오류' }
  return { value: y, error: null }
}

export function evaluateVariable(v, symbolMap) {
  if (v.var_type === 'table') return evaluateTable(v.table_data, symbolMap)
  if (v.var_type === 'conditional') return evaluateConditional(v.conditional_data, symbolMap)
  if (v.var_type === 'interp_table') return evaluateInterpTable(v.interp_data, symbolMap)
  return evaluateFormula(v.formula, symbolMap)
}
