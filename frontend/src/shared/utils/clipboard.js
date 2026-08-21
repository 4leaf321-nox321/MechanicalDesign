/**
 * 엑셀 클립보드(TSV) 파싱 — 붙여넣기를 다루는 곳이 공통으로 쓴다.
 *
 * 전에는 같은 파싱이 세 군데(옵션 리스트·테이블 데이터·보간 테이블)에 각각
 * 복사돼 있었다. 셋 다 `split('\t')` 로 잘랐는데, 그러면 **셀 안에 줄바꿈이 있는
 * 경우** 가 깨진다. 엑셀은 그런 셀을 큰따옴표로 감싸서 내보내므로
 *
 *     "첫줄
 *     둘째줄"	X
 *
 * 를 단순히 줄·탭으로 자르면 `"첫줄` / `둘째줄"` / `X` 세 조각이 되고 따옴표까지
 * 값에 남는다. 오류는 나지 않고 값만 조용히 어긋난다.
 *
 * 여기 한 곳에서 엑셀 규칙대로 읽는다:
 *   - 셀이 `"` 로 시작하면 닫는 `"` 까지가 한 셀이다 (그 안의 탭·줄바꿈은 내용)
 *   - 그 안의 `""` 는 따옴표 한 글자
 *   - 셀 중간에 나오는 `"` 는 그냥 글자다
 */

/**
 * 클립보드 텍스트를 2차원 배열로.
 *
 * **여러 셀일 때만** 배열을 돌려준다. 한 셀이면 `null` — 그때는 브라우저 기본
 * 붙여넣기(그 입력칸만 채우기)가 자연스럽고, 가로채면 오히려 방해가 된다.
 */
export function parseClipboardMatrix(text) {
  if (!text) return null

  const rows = []
  let row = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; continue }   // "" -> "
        inQuotes = false
        continue
      }
      cell += ch
      continue
    }

    // 따옴표는 **셀 맨 앞에서만** 인용의 시작이다. 중간에 나오면 글자다
    // (예: 3" 배관).
    if (ch === '"' && cell === '') { inQuotes = true; continue }
    if (ch === '\t') { row.push(cell); cell = ''; continue }
    if (ch === '\r') continue                                     // CRLF -> LF
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue }
    cell += ch
  }
  row.push(cell)
  rows.push(row)

  // 엑셀은 마지막에 줄바꿈을 붙인다. 그것 때문에 생긴 빈 줄만 걷어낸다.
  while (rows.length > 0 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') {
    rows.pop()
  }
  if (rows.length === 0) return null

  const isMulti = rows.length > 1 || rows[0].length > 1
  return isMulti ? rows : null
}

/**
 * 표를 한 줄로 편다 — 옵션 리스트처럼 순서만 있는 목록에 쓴다.
 * 빈 셀은 버린다(엑셀에서 범위를 넉넉히 잡아 복사하면 뒤가 비어 온다).
 */
export function flattenClipboardCells(text) {
  const matrix = parseClipboardMatrix(text)
  if (!matrix) return null
  const flat = []
  matrix.forEach(r => r.forEach(cell => flat.push(cell)))
  const cleaned = flat.map(s => s.trim()).filter(s => s !== '')
  return cleaned.length > 0 ? cleaned : null
}
