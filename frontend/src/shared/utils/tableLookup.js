/**
 * 표 조회 — 행 조회 · 열 조회 · 행열(교차) 조회.
 *
 * 엔지니어링 표는 대개 **행렬** 로 생겼다.
 *
 *          │ 10mm │ 20mm │ 30mm      ← 열 머리글 (두께)
 *   ───────┼──────┼──────┼──────
 *    SS400 │  245 │  240 │  235
 *    SM45C │  343 │  338 │  330
 *      ↑ 행 머리글 (재료)
 *
 * 예전에는 이런 표를 조회하려면 "재료·두께·항복강도" 세 열짜리 **긴 표로 손수
 * 펼쳐** 적어야 했다. 열이 10개면 행이 10배가 되고, 원본이 바뀔 때마다 다시
 * 펼쳐야 한다. 여기서는 행렬 모양 그대로 두고 두 축을 각각 조회한다.
 *
 * 세 가지 조회 방식:
 *
 *   row     조회 열들로 **행** 을 좁히고, 결과 열의 값을 꺼낸다 (예전부터 있던 것)
 *   column  조회 행들로 **열** 을 좁히고, 결과 행의 값을 꺼낸다 (표가 누워 있는 경우)
 *   cell    행과 열을 **둘 다** 좁혀 교차점을 꺼낸다 (행렬표)
 *
 * `column` 은 표를 전치하면 `row` 와 완전히 같아진다. 그래서 따로 구현하지 않고
 * 전치해서 같은 코드를 태운다 — 규칙이 둘로 갈리면 한쪽만 고치는 일이 생긴다.
 */

// --- 축 매칭 ------------------------------------------------------------------

/** 축 하나를 어떻게 맞출 것인가. 행 축과 열 축이 각각 따로 고른다. */
export const MATCH_MODES = ['exact', 'nearest', 'floor', 'ceiling', 'interpolate', 'range']

export const MATCH_MODE_LABEL = {
  exact: '정확히 일치',
  nearest: '가장 가까운 값',
  floor: '내림 (구간 시작값)',
  ceiling: '올림 (구간 끝값)',
  interpolate: '사이값 보간',
  range: '범위 머리글',
}

const NUMERIC_MODES = new Set(['nearest', 'floor', 'ceiling', 'interpolate'])

function toNumber(value) {
  if (value === null || value === undefined) return NaN
  const text = String(value).trim()
  if (text === '') return NaN
  // 엑셀에서 온 "1,000" 같은 천단위 구분은 숫자로 읽는다.
  return Number(text.replace(/,/g, ''))
}

function sameValue(cell, target) {
  const cellText = String(cell ?? '').trim()
  const targetText = String(target ?? '').trim()
  if (cellText === targetText) return true
  const targetNum = toNumber(target)
  if (Number.isFinite(targetNum)) {
    const cellNum = toNumber(cell)
    if (Number.isFinite(cellNum) && cellNum === targetNum) return true
  }
  return false
}

/**
 * 범위로 적힌 머리글을 읽는다.
 *
 * **자동으로 읽고 조용히 넘어가지 않는다.** 표기가 제각각이라(`10~20`,
 * `10 이상 20 미만`, `>=10` …) 잘못 읽고도 값을 내놓는 것이 가장 나쁘다.
 * 그래서 읽은 결과를 `describeRange` 로 되비춰 화면에 보여 준다 — 틀리게
 * 읽었으면 사람이 바로 본다.
 *
 * 읽지 못하면 null. 그 머리글은 매칭에서 빠지고, 하나도 못 읽으면 오류가 된다.
 */
export function parseRangeHeader(text) {
  const raw = String(text ?? '').trim()
  if (raw === '') return null

  const num = (s) => {
    const v = toNumber(s)
    return Number.isFinite(v) ? v : null
  }

  // 10 이상 20 미만 / 10 초과 20 이하 (두 경계를 한 칸에 적은 형태)
  let m = raw.match(/^(-?[\d.,]+)\s*(이상|초과)\s*(-?[\d.,]+)\s*(이하|미만)$/)
  if (m && num(m[1]) !== null && num(m[3]) !== null) {
    return { min: num(m[1]), minInclusive: m[2] === '이상',
             max: num(m[3]), maxInclusive: m[4] === '이하' }
  }

  // 10~20 / 10-20  — 양끝 포함으로 읽는다. 구간이 붙어 있으면 앞선 것이 이긴다.
  m = raw.match(/^(-?[\d.,]+)\s*[~〜–—-]\s*(-?[\d.,]+)$/)
  if (m && num(m[1]) !== null && num(m[2]) !== null) {
    return { min: num(m[1]), minInclusive: true, max: num(m[2]), maxInclusive: true }
  }

  // 한쪽만 있는 형태
  m = raw.match(/^(-?[\d.,]+)\s*(이상|초과)$/)
  if (m && num(m[1]) !== null) {
    return { min: num(m[1]), minInclusive: m[2] === '이상', max: Infinity, maxInclusive: true }
  }
  m = raw.match(/^(-?[\d.,]+)\s*(이하|미만)$/)
  if (m && num(m[1]) !== null) {
    return { min: -Infinity, minInclusive: true, max: num(m[1]), maxInclusive: m[2] === '이하' }
  }

  // 부등호 표기 (≥ ≤ > < >= <=)
  m = raw.match(/^(>=|≥|>|<=|≤|<)\s*(-?[\d.,]+)$/)
  if (m && num(m[2]) !== null) {
    const v = num(m[2])
    if (m[1] === '>=' || m[1] === '≥') return { min: v, minInclusive: true, max: Infinity, maxInclusive: true }
    if (m[1] === '>') return { min: v, minInclusive: false, max: Infinity, maxInclusive: true }
    if (m[1] === '<=' || m[1] === '≤') return { min: -Infinity, minInclusive: true, max: v, maxInclusive: true }
    return { min: -Infinity, minInclusive: true, max: v, maxInclusive: false }
  }

  // 숫자 하나 — 그 값만 해당하는 구간으로 본다.
  const single = num(raw)
  if (single !== null) {
    return { min: single, minInclusive: true, max: single, maxInclusive: true }
  }
  return null
}

/** 읽어낸 구간을 사람 말로. 화면에 되비춰 주는 용도. */
export function describeRange(range) {
  if (!range) return '읽을 수 없음'
  const { min, minInclusive, max, maxInclusive } = range
  if (min === max) return `${min} 만`
  const left = min === -Infinity ? '' : `${min} ${minInclusive ? '이상' : '초과'}`
  const right = max === Infinity ? '' : `${max} ${maxInclusive ? '이하' : '미만'}`
  return [left, right].filter(Boolean).join(' ~ ') || '전체'
}

function inRange(range, value) {
  if (!range) return false
  const okMin = range.minInclusive ? value >= range.min : value > range.min
  const okMax = range.maxInclusive ? value <= range.max : value < range.max
  return okMin && okMax
}

/**
 * 머리글 목록에서 조회 값에 해당하는 자리를 찾는다.
 *
 * 돌려주는 것:
 *   { index }              한 자리로 정해진 경우
 *   { lo, hi, ratio }      보간 — lo 와 hi 사이 ratio 지점
 *   { error }              찾지 못함
 *
 * 두 축이 같은 함수를 쓴다. 규칙이 축마다 갈리면 "행은 되는데 열은 안 되는"
 * 상태가 생긴다.
 */
export function resolveAxis(headers, target, matchMode) {
  const list = headers || []
  if (list.length === 0) return { error: '머리글이 없습니다' }

  if (matchMode === 'exact') {
    const index = list.findIndex(h => sameValue(h, target))
    return index >= 0 ? { index } : { error: `일치하는 머리글 없음: ${target}` }
  }

  if (matchMode === 'range') {
    const value = toNumber(target)
    if (!Number.isFinite(value)) return { error: `범위 조회는 숫자만 가능: ${target}` }
    let readable = 0
    for (let i = 0; i < list.length; i++) {
      const range = parseRangeHeader(list[i])
      if (!range) continue
      readable++
      if (inRange(range, value)) return { index: i }
    }
    if (readable === 0) return { error: '범위로 읽을 수 있는 머리글이 없습니다' }
    return { error: `어느 구간에도 들지 않음: ${target}` }
  }

  if (!NUMERIC_MODES.has(matchMode)) return { error: `알 수 없는 매칭 방법: ${matchMode}` }

  const value = toNumber(target)
  if (!Number.isFinite(value)) return { error: `${MATCH_MODE_LABEL[matchMode]} 조회는 숫자만 가능: ${target}` }

  // 숫자로 읽히는 머리글만 후보다. 행렬표는 첫 칸이 이름인 경우가 흔해서
  // 숫자가 아닌 머리글이 섞여 있는 것이 정상이다.
  const points = []
  list.forEach((h, i) => {
    const n = toNumber(h)
    if (Number.isFinite(n)) points.push({ index: i, value: n })
  })
  if (points.length === 0) return { error: '숫자 머리글이 없습니다' }
  points.sort((a, b) => a.value - b.value)

  if (matchMode === 'nearest') {
    let best = points[0]
    for (const p of points) {
      if (Math.abs(p.value - value) < Math.abs(best.value - value)) best = p
    }
    return { index: best.index }
  }

  if (matchMode === 'floor') {
    const under = points.filter(p => p.value <= value)
    if (under.length === 0) return { error: `${value} 이하인 머리글이 없습니다` }
    return { index: under[under.length - 1].index }
  }

  if (matchMode === 'ceiling') {
    const over = points.filter(p => p.value >= value)
    if (over.length === 0) return { error: `${value} 이상인 머리글이 없습니다` }
    return { index: over[0].index }
  }

  // interpolate — 사이는 내삽, 양 끝 밖은 가장 가까운 두 점으로 외삽.
  // 보간 테이블 변수(evaluateInterpTable)와 같은 규칙이다.
  if (points.length === 1) return { index: points[0].index }
  let lo = points[0]
  let hi = points[1]
  for (let i = 0; i < points.length - 1; i++) {
    if (value >= points[i].value && value <= points[i + 1].value) {
      lo = points[i]
      hi = points[i + 1]
      break
    }
    if (value > points[i + 1].value) {
      lo = points[points.length - 2]
      hi = points[points.length - 1]
    }
  }
  if (hi.value === lo.value) return { index: lo.index }
  return { lo: lo.index, hi: hi.index, ratio: (value - lo.value) / (hi.value - lo.value) }
}

// --- 표 다루기 ----------------------------------------------------------------

/**
 * 행과 열을 뒤집는다 — `column` 조회를 `row` 조회로 되돌린다.
 *
 * 누워 있는 표에서는 각 행이 하나의 항목이고, 그 이름은 `labelColumnIndex` 열에
 * 들어 있다. 전치하면 그 이름들이 열 머리글이 되어 평범한 세로 표가 된다.
 *
 *   항목   값1     값2              재료     항복강도
 *   재료   SS400  SM45C     →      SS400    245
 *   항복강도 245    343             SM45C    343
 */
export function transposeTable(table, labelColumnIndex = 0) {
  const columns = table.columns || []
  const rows = table.rows || []
  const newColumns = rows.map(r => String(r[labelColumnIndex] ?? ''))
  const newRows = []
  for (let c = 0; c < columns.length; c++) {
    if (c === labelColumnIndex) continue
    newRows.push(rows.map(r => r[c] ?? ''))
  }
  return { columns: newColumns, rows: newRows }
}

function cellValue(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return null
  const num = toNumber(raw)
  return Number.isFinite(num) ? num : String(raw)
}

function blend(a, b, ratio) {
  if (typeof a !== 'number' || typeof b !== 'number') return null
  return a + (b - a) * ratio
}

/**
 * 행열(교차) 조회.
 *
 * 행 머리글은 지정한 열에, 열 머리글은 표의 헤더(columns)에 있다. 두 축을 각각
 * 맞춰 교차점을 꺼내고, 보간이 걸린 축은 이웃한 값을 섞는다. 양 축이 모두
 * 보간이면 네 모서리를 두 번 섞는 쌍선형 보간이 된다.
 */
function lookupCell(table, rowHeaderIndex, rowResult, columnResult) {
  const rows = table.rows || []
  const at = (r, c) => cellValue(rows[r] ? rows[r][c] : null)

  const rowIdx = rowResult.index !== undefined ? [rowResult.index] : [rowResult.lo, rowResult.hi]
  const colIdx = columnResult.index !== undefined ? [columnResult.index] : [columnResult.lo, columnResult.hi]

  const corner = (r, c) => at(r, c)

  // 열 축을 먼저 섞고, 그 결과를 행 축으로 섞는다.
  const alongColumn = (r) => {
    if (colIdx.length === 1) return corner(r, colIdx[0])
    const left = corner(r, colIdx[0])
    const right = corner(r, colIdx[1])
    return blend(left, right, columnResult.ratio)
  }

  let value
  if (rowIdx.length === 1) {
    value = alongColumn(rowIdx[0])
  } else {
    value = blend(alongColumn(rowIdx[0]), alongColumn(rowIdx[1]), rowResult.ratio)
  }

  if (value === null || value === undefined) {
    return { value: null, error: '교차점에 값이 없습니다' }
  }
  // 행 머리글 열 자체를 결과로 읽는 실수를 막는다.
  if (colIdx.includes(rowHeaderIndex)) {
    return { value: null, error: '결과가 행 머리글 열입니다. 열 머리글 조회를 확인하세요.' }
  }
  return { value, error: null }
}

export { lookupCell, toNumber as _toNumber }
