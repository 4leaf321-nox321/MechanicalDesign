// DOE (Design of Experiments) engine — full factorial combinations + batch evaluation
import { evaluateVariable } from './evaluators'

// DOE 입력 정의:
// spec = {
//   [variableId]: { mode: 'fixed' | 'range', ... type-specific fields }
// }
// fixed: { mode: 'fixed', value: <single value> }
// range (slider): { mode: 'range', start, end, steps }  → linspace
// range (dropdown): { mode: 'range', selected: [...] }
// range (text): { mode: 'range', values: [...] }

export function expandRange(inputVar, spec) {
  if (!spec || spec.mode === 'fixed') {
    return [spec?.value]
  }
  if (inputVar.var_type === 'slider') {
    const start = Number(spec.start)
    const end = Number(spec.end)
    const steps = Math.max(1, Math.floor(Number(spec.steps) || 1))
    if (!Number.isFinite(start) || !Number.isFinite(end)) return [start]
    if (steps === 1) return [start]
    const out = []
    const step = (end - start) / (steps - 1)
    for (let i = 0; i < steps; i++) out.push(+(start + step * i).toFixed(10))
    return out
  }
  if (inputVar.var_type === 'dropdown') {
    const sel = Array.isArray(spec.selected) ? spec.selected : []
    return sel.length > 0 ? sel : [spec?.fallback ?? '']
  }
  if (inputVar.var_type === 'text') {
    const vs = Array.isArray(spec.values) ? spec.values : []
    return vs.length > 0 ? vs : [spec?.fallback ?? '']
  }
  return [spec.value]
}

// Cartesian product
export function cartesianProduct(arrays) {
  return arrays.reduce(
    (acc, curr) => acc.flatMap(a => curr.map(c => [...a, c])),
    [[]]
  )
}

// 총 조합 수 (실행 전 미리 알려주는 용도)
export function combinationCount(arrays) {
  return arrays.reduce((n, a) => n * a.length, 1)
}

// ============================================
// Latin Hypercube Sampling
// ============================================
// numVars × numSamples [0, 1) 행렬 생성
// 각 변수(열)마다 [0,1)을 numSamples개 균등 구간으로 나눠 무작위 샘플 하나씩 뽑고,
// 열별로 독립적으로 섞어서 상관을 낮춤
export function latinHypercube(numVars, numSamples, rng = Math.random) {
  const columns = []
  for (let v = 0; v < numVars; v++) {
    const col = []
    for (let i = 0; i < numSamples; i++) {
      col.push((i + rng()) / numSamples)
    }
    // Fisher-Yates shuffle
    for (let i = col.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[col[i], col[j]] = [col[j], col[i]]
    }
    columns.push(col)
  }
  // 전치해서 행 단위로 반환
  const rows = []
  for (let i = 0; i < numSamples; i++) {
    const row = []
    for (let v = 0; v < numVars; v++) row.push(columns[v][i])
    rows.push(row)
  }
  return rows
}

// seed 기반 PRNG (재현 가능한 LHS용, 옵션)
export function seededRng(seed) {
  let s = seed >>> 0 || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

// [0,1) 유니폼 값을 각 변수의 범위로 매핑
function mapUniformToValue(v, spec, u) {
  if (!spec || spec.mode === 'fixed') return spec?.value
  if (v.var_type === 'slider') {
    const start = Number(spec.start)
    const end = Number(spec.end)
    if (!Number.isFinite(start) || !Number.isFinite(end)) return start
    return +(start + u * (end - start)).toFixed(10)
  }
  if (v.var_type === 'dropdown') {
    const sel = Array.isArray(spec.selected) ? spec.selected : []
    if (sel.length === 0) return ''
    return sel[Math.min(sel.length - 1, Math.floor(u * sel.length))]
  }
  if (v.var_type === 'text') {
    const vs = Array.isArray(spec.values) ? spec.values : []
    if (vs.length === 0) return ''
    return vs[Math.min(vs.length - 1, Math.floor(u * vs.length))]
  }
  return spec.value
}

// 공용 평가 함수 — combos 리스트(행 = 입력 값들)를 받아 결과 rows 반환
function evaluateCombinations(variables, inputs, combos) {
  const intermediates = variables.filter(v => v.category === 'intermediate')
  const outputs = variables.filter(v => v.category === 'output')

  const inputKeys = inputs.map(v => v.symbol || v.name)
  const intermediateKeys = intermediates.filter(v => v.symbol || v.name).map(v => v.symbol || v.name)
  const outputKeys = outputs.filter(v => v.symbol || v.name).map(v => v.symbol || v.name)

  const rows = combos.map((combo) => {
    const symbolMap = {}
    const row = { __errors: {} }

    // 입력 값 세팅
    inputs.forEach((v, idx) => {
      const key = v.symbol || v.name
      const val = combo[idx]
      if (v.symbol) symbolMap[v.symbol] = val
      row[key] = val
    })

    // 중간값: fixed-point iteration (상호 참조 해결)
    const pending = intermediates.filter(v => hasDefinition(v))
    const missing = intermediates.filter(v => !hasDefinition(v))
    missing.forEach(v => {
      const key = v.symbol || v.name
      row[key] = null
      row.__errors[key] = missingLabel(v)
    })
    let remaining = [...pending]
    let progressed = true
    while (progressed && remaining.length > 0) {
      progressed = false
      const next = []
      for (const v of remaining) {
        const result = evaluateVariable(v, symbolMap)
        if (result.value !== null) {
          const key = v.symbol || v.name
          row[key] = result.value
          if (v.symbol) symbolMap[v.symbol] = result.value
          progressed = true
        } else {
          next.push(v)
        }
      }
      remaining = next
    }
    remaining.forEach(v => {
      const key = v.symbol || v.name
      const r = evaluateVariable(v, symbolMap)
      row[key] = r.value
      if (r.error) row.__errors[key] = r.error
    })

    // 출력값
    outputs.forEach(v => {
      const key = v.symbol || v.name
      if (!hasDefinition(v)) {
        row[key] = null
        row.__errors[key] = missingLabel(v)
        return
      }
      const r = evaluateVariable(v, symbolMap)
      row[key] = r.value
      if (r.error) row.__errors[key] = r.error
      if (v.symbol && r.value !== null) symbolMap[v.symbol] = r.value
    })

    return row
  })

  return { inputKeys, intermediateKeys, outputKeys, rows }
}

// Full Factorial DOE
export function runFactorial(variables, specs) {
  const inputs = variables.filter(v => v.category === 'input')
  const perInputValues = inputs.map(v => expandRange(v, specs[v.id]))
  const combos = cartesianProduct(perInputValues)
  return evaluateCombinations(variables, inputs, combos)
}

// Latin Hypercube DOE
// rangeInputs에만 LHS 샘플링 적용, 고정 입력은 단일값 고정
export function runLhs(variables, specs, numSamples, seed) {
  const inputs = variables.filter(v => v.category === 'input')
  const rangeInputs = inputs.filter(v => specs[v.id]?.mode === 'range')
  const rng = seed !== undefined && seed !== null && seed !== ''
    ? seededRng(Number(seed))
    : Math.random

  const N = Math.max(1, Math.floor(numSamples || 1))

  // rangeInputs이 없으면 고정값 한 번만 실행
  if (rangeInputs.length === 0) {
    const combo = inputs.map(v => specs[v.id]?.value)
    return evaluateCombinations(variables, inputs, [combo])
  }

  const lhsMatrix = latinHypercube(rangeInputs.length, N, rng)
  const combos = lhsMatrix.map(sample => {
    return inputs.map(v => {
      const spec = specs[v.id]
      if (!spec || spec.mode === 'fixed') return spec?.value
      const rIdx = rangeInputs.indexOf(v)
      return mapUniformToValue(v, spec, sample[rIdx])
    })
  })
  return evaluateCombinations(variables, inputs, combos)
}

// 하위 호환 — 기존 runDoe 시그니처 유지 (Full Factorial)
export function runDoe(variables, specs) {
  return runFactorial(variables, specs)
}

function hasDefinition(v) {
  if (v.var_type === 'table') return !!v.table_data
  if (v.var_type === 'conditional') return !!v.conditional_data
  if (v.var_type === 'interp_table') return !!v.interp_data
  return !!v.formula
}

function missingLabel(v) {
  if (v.var_type === 'table') return '테이블 정의 없음'
  if (v.var_type === 'conditional') return '조건부 정의 없음'
  if (v.var_type === 'interp_table') return '보간 테이블 정의 없음'
  return '수식 없음'
}

// CSV 문자열 생성
export function toCsv(keys, rows) {
  const esc = (v) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const header = keys.map(esc).join(',')
  const body = rows.map(r => keys.map(k => esc(r[k])).join(',')).join('\n')
  return header + '\n' + body
}
