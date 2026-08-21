import { lookupCell, resolveAxis, transposeTable } from './tableLookup.js'

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

/**
 * 배열 값.
 *
 * **실수로 스칼라처럼 쓰는 것을 막는다.** 자바스크립트에서 `[1,2] + [3,4]` 는
 * 오류가 아니라 `"1,23,4"` 라는 문자열이 된다. 그대로 두면 잘못된 값이 조용히
 * 흘러가 화면에는 이상한 글자만 남는다. 그래서 숫자·문자열로 변환되려는 순간
 * 멈추고, 무엇을 써야 하는지 알려 준다.
 *
 * `Symbol.species` 를 Array 로 두어 `map`·`flat` 결과는 평범한 배열이 된다.
 * 감싼 것이 계속 번지면 함수 안에서 또 걸리기 때문이다.
 */
class ArrayValue extends Array {
  static get [Symbol.species]() { return Array }

  _reject() {
    const err = new TypeError(
      '배열에는 + - * / 를 직접 쓸 수 없습니다. add(), sub(), mul(), div() 를 쓰세요.'
    )
    err.__calc = true
    throw err
  }

  valueOf() { return this._reject() }
  toString() { return this._reject() }
}

/** 계산 중 사람에게 보여 줄 오류. 자바스크립트 내부 오류와 구분한다. */
function _calcError(message) {
  const err = new Error(message)
  err.__calc = true
  throw err
}

function _isArrayValue(v) {
  return Array.isArray(v)
}

/** 배열이면 원소들을, 스칼라면 그 하나를 담은 배열로. 집계 함수가 쓴다. */
function _flatten(args) {
  return args.flat(Infinity)
}

function _requireNumber(v, where) {
  const n = Number(v)
  if (!Number.isFinite(n)) _calcError(`${where}: 숫자가 아닙니다 (${v})`)
  return n
}

/**
 * 원소별 연산 — 배열끼리, 또는 배열과 스칼라.
 *
 * 길이가 다른 두 배열은 **오류**다. 짧은 쪽에 맞춰 자르거나 0으로 채우면
 * 계산은 되지만 결과가 조용히 틀린다.
 */
function _pairwise(name, a, b, op) {
  const aList = _isArrayValue(a)
  const bList = _isArrayValue(b)

  if (!aList && !bList) return op(_requireNumber(a, name), _requireNumber(b, name))

  if (aList && bList) {
    if (a.length !== b.length) {
      _calcError(`${name}: 길이가 다른 배열입니다 (${a.length} vs ${b.length})`)
    }
    return ArrayValue.from(a, (x, i) => op(_requireNumber(x, name), _requireNumber(b[i], name)))
  }

  // 한쪽만 배열이면 스칼라를 모든 원소에 적용한다.
  const list = aList ? a : b
  const scalar = _requireNumber(aList ? b : a, name)
  return ArrayValue.from(list, (x) => {
    const n = _requireNumber(x, name)
    return aList ? op(n, scalar) : op(scalar, n)
  })
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

  // --- 집계 — 배열을 받아 값 하나로 줄인다 ---
  min: (...args) => Math.min(..._flatten(args)),
  max: (...args) => Math.max(..._flatten(args)),
  average: (...args) => {
    const flat = _flatten(args)
    if (flat.length === 0) return NaN
    return flat.reduce((a, b) => a + b, 0) / flat.length
  },
  sum: (...args) => _flatten(args).reduce((a, b) => a + Number(b), 0),
  count: (...args) => _flatten(args).length,
  size: (...args) => _flatten(args).length,

  // --- 원소별 — 결과가 다시 배열이다 ---
  add: (a, b) => _pairwise('add', a, b, (x, y) => x + y),
  sub: (a, b) => _pairwise('sub', a, b, (x, y) => x - y),
  mul: (a, b) => _pairwise('mul', a, b, (x, y) => x * y),
  div: (a, b) => _pairwise('div', a, b, (x, y) => {
    if (y === 0) _calcError('div: 0으로 나눌 수 없습니다')
    return x / y
  }),

  // --- 배열 만들기·꺼내기 ---
  /** range(1, 5) → [1,2,3,4,5], range(0, 10, 2) → [0,2,4,6,8,10] */
  range: (start, end, step = 1) => {
    const s = _requireNumber(start, 'range')
    const e = _requireNumber(end, 'range')
    const st = _requireNumber(step, 'range')
    if (st === 0) _calcError('range: 간격이 0일 수 없습니다')
    const out = new ArrayValue()
    if (st > 0) { for (let v = s; v <= e + 1e-12; v += st) out.push(v) }
    else { for (let v = s; v >= e - 1e-12; v += st) out.push(v) }
    if (out.length > 10000) _calcError('range: 원소가 너무 많습니다 (10000개 초과)')
    return out
  },
  /** at(A, 1) → 첫 번째 원소. 화면이 "열 1" 처럼 1부터 세므로 여기도 1부터. */
  at: (list, index) => {
    if (!_isArrayValue(list)) _calcError('at: 첫 번째 인자가 배열이 아닙니다')
    const i = _requireNumber(index, 'at')
    if (i < 1 || i > list.length) {
      _calcError(`at: ${i} 번째 원소가 없습니다 (1 ~ ${list.length})`)
    }
    return list[Math.trunc(i) - 1]
  },

  // 정규분포 누적 확률 (%) — value 이하일 확률
  prob: (value, mean, stdev) => _normCdf(value, mean, stdev) * 100,
}
export const MATH_FUNC_NAMES = Object.keys(MATH_FUNCS)
export const RESERVED_NAMES = new Set(MATH_FUNC_NAMES)

/**
 * 완성된 따옴표 문자열을 통째로 걷어낸다.
 *
 * 문자열 **안**의 글자는 값이지 수식이 아니다. 검사도 치환도 바깥에만 해야 한다.
 * 이스케이프를 규칙대로 건너뛰므로 자바스크립트가 읽는 경계와 같다.
 *
 * 닫히지 않은 따옴표는 남는다. 그러면 허용 문자 검사에 걸려 그 사실을 말해 준다.
 */
function _stripStringLiterals(expr) {
  return expr
    .replace(/"(?:\\.|[^"\\])*"/g, '')
    .replace(/'(?:\\.|[^'\\])*'/g, '')
}

/**
 * 변수 기호를 **함수 인자로** 바꾼다.
 *
 * 예전에는 기호 자리에 값을 글자로 끼워 넣었다(`A` → `(5)`). 그 방식은 세 가지가
 * 걸렸다.
 *
 *   - 문자열 값을 넣으려면 따옴표를 이스케이프해 소스에 박아야 했다. 그 규칙이
 *     자바스크립트와 어긋나면 검사를 통과한 뒤 엉뚱하게 실행된다.
 *   - 배열은 `[1,2]` 로 넣어야 하는데, 대괄호를 허용하면 `"a"["constructor"]("…")()`
 *     같은 길이 열린다.
 *   - 기호가 `if` 처럼 자바스크립트 예약어면 값으로 바뀌어 우연히 동작했다.
 *
 * 이제는 값을 소스에 넣지 않는다. 기호를 `_s0`, `_s1` 로 바꿔 쓰고 그 자리에
 * 진짜 값을 인자로 넘긴다. 문자열도 배열도 그대로 들어가고, 소스에는 계산 기호만
 * 남는다.
 */
function _bindSymbols(expr, symbolMap) {
  const names = []
  const values = []
  const alias = new Map()

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
    if (ch === '"' || ch === "'") { inStr = true; strCh = ch; out += ch; i++; continue }

    if (/[A-Za-z_]/.test(ch)) {
      let j = i
      while (j < n && /[A-Za-z0-9_]/.test(expr[j])) j++
      const ident = expr.slice(i, j)

      if (RESERVED_NAMES.has(ident)) {
        out += ident
      } else if (alias.has(ident)) {
        out += alias.get(ident)
      } else if (Object.prototype.hasOwnProperty.call(symbolMap, ident)) {
        const bound = _bindValue(symbolMap[ident])
        if (bound.error) return { error: `${ident} ${bound.error}` }
        const name = `_s${names.length}`
        alias.set(ident, name)
        names.push(name)
        values.push(bound.value)
        out += name
      } else {
        return { error: `알 수 없는 이름: ${ident}` }
      }
      i = j
      continue
    }
    out += ch
    i++
  }
  return { code: out, names, values }
}

/** 심볼 값을 계산에 쓸 형태로. 숫자로 읽히는 문자열은 숫자로 본다(예전과 같다). */
function _bindValue(raw) {
  if (raw === undefined || raw === null || raw === '') return { error: '값 없음' }
  if (Array.isArray(raw)) {
    if (raw.length === 0) return { error: '값 없음 (빈 배열)' }
    return { value: ArrayValue.from(raw) }
  }
  const num = Number(raw)
  if (Number.isFinite(num)) return { value: num }
  return { value: String(raw) }
}

function _run(code, names, values) {
  // eslint-disable-next-line no-new-func
  const fn = new Function(...MATH_FUNC_NAMES, ...names, `"use strict"; return (${code})`)
  return fn(...MATH_FUNC_NAMES.map(n => MATH_FUNCS[n]), ...values)
}

/** 감싼 배열은 밖으로 내보내기 전에 평범한 배열로 되돌린다. */
function _unwrap(value) {
  return Array.isArray(value) ? Array.from(value) : value
}

function _toPowerOperator(expr) {
  let out = ''
  let inStr = false
  let strCh = null
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i]
    if (inStr) {
      out += ch
      if (ch === '\\' && i + 1 < expr.length) { out += expr[i + 1]; i++; continue }
      if (ch === strCh) { inStr = false; strCh = null }
      continue
    }
    if (ch === '"' || ch === "'") { inStr = true; strCh = ch; out += ch; continue }
    out += ch === '^' ? '**' : ch
  }
  return out
}

/**
 * 수식 계산. 숫자·문자열·**배열** 을 다룬다.
 *
 * 문자열 합치기는 `+` 로 한다: `"두께 " + t + "mm"`.
 * 배열은 함수로 다룬다: 집계는 `min/max/average/sum/count`, 원소별 계산은
 * `add/sub/mul/div`, 만들고 꺼내기는 `range/at/size`.
 *
 * **배열에 `+` 를 쓰면 막는다.** 자바스크립트에서 `[1,2] + [3,4]` 는 오류가
 * 아니라 `"1,23,4"` 라는 문자열이 되기 때문이다. 조용히 틀린 값이 흘러가는 것을
 * 막고 무엇을 써야 하는지 알려 준다.
 *
 * 값은 소스에 끼워 넣지 않고 **함수 인자로** 넘긴다(`_bindSymbols`). 그래서
 * 문자열 밖에 남는 글자는 계산 기호뿐이고, 그것만 허용 목록으로 좁힌다.
 */
export function evaluateFormula(formula, symbolMap) {
  if (!formula) return { value: null, error: '수식 없음' }
  try {
    const expression = _toPowerOperator(formula)
    const outside = _stripStringLiterals(expression)

    if (outside.includes('"') || outside.includes("'")) {
      return { value: null, error: '따옴표 짝이 맞지 않습니다' }
    }
    if (!/^[\w\s+\-*/().,]*$/.test(outside)) {
      return { value: null, error: '잘못된 수식' }
    }

    const bound = _bindSymbols(expression, symbolMap)
    if (bound.error) return { value: null, error: bound.error }

    const result = _run(bound.code, bound.names, bound.values)

    if (Array.isArray(result)) return { value: _unwrap(result), error: null }
    if (typeof result === 'string') return { value: result, error: null }
    if (typeof result !== 'number' || !isFinite(result)) {
      return { value: null, error: '계산 오류' }
    }
    return { value: result, error: null }
  } catch (err) {
    // 계산 중 우리가 던진 오류는 사유를 그대로 보여 준다. 그 외에는 수식 자체가
    // 잘못된 것이라 자바스크립트 내부 메시지를 노출하지 않는다.
    if (err && err.__calc) return { value: null, error: err.message }
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

/**
 * 조회 열들로 **행** 을 좁혀 결과 열의 값을 꺼낸다.
 *
 * 예전부터 있던 방식이고 규칙을 그대로 둔다. 여러 키는 AND 로 걸리고, 숫자
 * 매칭이 섞이면 거리 합이 가장 작은 행이 이긴다.
 */
function _lookupByRow(table, symbolMap) {
  const { columns, rows, result_column_index } = table || {}
  if (!Array.isArray(columns) || !Array.isArray(rows) || rows.length === 0) {
    return { value: null, error: '테이블 데이터 없음' }
  }
  if (result_column_index === null || result_column_index === undefined) {
    return { value: null, error: '결과 열 미지정' }
  }
  const keys = normalizeTableKeys(table)
  if (keys.length === 0) return { value: null, error: '조회 키 미정의' }

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

  let candidates = rows.map((row, idx) => ({ row, idx }))
  for (const ek of evaluatedKeys) {
    candidates = candidates.filter(({ row }) => {
      const cell = row[ek.column_index]
      if (ek.match_mode === 'exact') return _exactCellMatches(cell, ek.target)
      const v = Number(cell)
      if (!Number.isFinite(v)) return false
      if (ek.match_mode === 'floor') return v <= ek.targetNum
      if (ek.match_mode === 'ceiling') return v >= ek.targetNum
      return true
    })
    if (candidates.length === 0) {
      return { value: null, error: `조회 키 ${evaluatedKeys.indexOf(ek) + 1} 매칭되는 행 없음` }
    }
  }

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

/**
 * 행과 열을 **둘 다** 좁혀 교차점을 꺼낸다 — 행렬표.
 *
 * 행 머리글은 지정한 열에, 열 머리글은 표의 헤더에 있다. 축마다 매칭 방법을
 * 따로 고르므로 "재료는 정확히 일치, 두께는 사이값 보간" 같은 조합이 된다.
 */
function _lookupByCell(table, symbolMap) {
  const { columns, rows } = table || {}
  if (!Array.isArray(columns) || !Array.isArray(rows) || rows.length === 0) {
    return { value: null, error: '테이블 데이터 없음' }
  }
  const headerIndex = table.row_header_index ?? 0
  const rowLookup = table.row_lookup || {}
  const columnLookup = table.column_lookup || {}

  if (!rowLookup.expression || !rowLookup.expression.trim()) {
    return { value: null, error: '행 조회 수식 없음' }
  }
  if (!columnLookup.expression || !columnLookup.expression.trim()) {
    return { value: null, error: '열 조회 수식 없음' }
  }

  const rowTarget = evaluateExpression(rowLookup.expression, symbolMap)
  if (rowTarget.value === null) return { value: null, error: `행 조회: ${rowTarget.error}` }
  const colTarget = evaluateExpression(columnLookup.expression, symbolMap)
  if (colTarget.value === null) return { value: null, error: `열 조회: ${colTarget.error}` }

  const rowHeaders = rows.map(r => r[headerIndex])
  const rowHit = resolveAxis(rowHeaders, rowTarget.value, rowLookup.match_mode || 'exact')
  if (rowHit.error) return { value: null, error: `행 조회: ${rowHit.error}` }

  const colHit = resolveAxis(columns, colTarget.value, columnLookup.match_mode || 'exact')
  if (colHit.error) return { value: null, error: `열 조회: ${colHit.error}` }

  return lookupCell(table, headerIndex, rowHit, colHit)
}

/**
 * 표에서 값을 찾는다. 조회 방식은 셋 — 행 / 열 / 행열(교차).
 *
 * `column`(누운 표)은 전치하면 `row` 와 같아지므로 따로 구현하지 않는다.
 * 규칙이 둘로 갈리면 한쪽만 고치는 일이 생긴다.
 */
export function evaluateTable(tableJson, symbolMap) {
  if (!tableJson) return { value: null, error: '테이블 정의 없음' }
  let table
  try {
    table = typeof tableJson === 'string' ? JSON.parse(tableJson) : tableJson
  } catch {
    return { value: null, error: '테이블 파싱 오류' }
  }
  if (table && table.source_error) return { value: null, error: table.source_error }

  const mode = (table && table.lookup_mode) || 'row'

  if (mode === 'cell') return _lookupByCell(table, symbolMap)

  if (mode === 'column') {
    const labelIndex = table.label_column_index ?? 0
    const flipped = transposeTable(table, labelIndex)
    // 전치하면 원래의 "행 이름"이 열 머리글이 된다. 조회 행·결과 행은 그
    // 이름으로 가리키므로 새 열 번호로 옮겨 준다.
    const indexOfLabel = (name) => flipped.columns.findIndex(c => c === String(name ?? ''))
    const resultIndex = table.result_row_label !== undefined
      ? indexOfLabel(table.result_row_label)
      : (table.result_row_index ?? -1)
    if (resultIndex < 0) return { value: null, error: '결과 행을 찾을 수 없습니다' }

    const keys = (table.keys || []).map(k => ({
      column_index: k.row_label !== undefined ? indexOfLabel(k.row_label) : (k.row_index ?? -1),
      expression: k.expression,
      match_mode: k.match_mode || 'exact',
    }))
    if (keys.some(k => k.column_index < 0)) {
      return { value: null, error: '조회 행을 찾을 수 없습니다' }
    }
    return _lookupByRow({ ...flipped, result_column_index: resultIndex, keys }, symbolMap)
  }

  return _lookupByRow(table, symbolMap)
}

export function evaluateCondition(expression, symbolMap) {
  if (!expression || !expression.trim()) return { value: null, error: '조건식 없음' }
  try {
    const expr = _toPowerOperator(expression)
    const outside = _stripStringLiterals(expr)

    if (outside.includes('"') || outside.includes("'")) {
      return { value: null, error: '따옴표 짝이 맞지 않습니다' }
    }
    if (!/^[\w\s+\-*/().,<>=!&|]*$/.test(outside)) {
      return { value: null, error: '잘못된 조건식' }
    }

    const bound = _bindSymbols(expr, symbolMap)
    if (bound.error) return { value: null, error: bound.error }

    return { value: !!_run(bound.code, bound.names, bound.values), error: null }
  } catch (err) {
    if (err && err.__calc) return { value: null, error: err.message }
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
