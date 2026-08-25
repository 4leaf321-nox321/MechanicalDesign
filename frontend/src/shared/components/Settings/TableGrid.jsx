/**
 * 표 그리드 — 열 이름과 데이터를 편집한다.
 *
 * 두 곳이 함께 쓴다: 변수 정의의 테이블 편집기, 그리고 "표 정의" 탭. 같은 표를
 * 두 화면에서 다루므로 붙여넣기·행열 추가 규칙이 달라지면 안 된다.
 *
 * **열을 지울 때는 부모에게 알린다.** 변수 쪽에서는 조회 키와 결과 열이 열 번호를
 * 가리키고 있어서, 열이 사라지면 그 번호를 함께 손봐야 한다. 그리드는 그 사정을
 * 모르므로 "몇 번째를 지웠다" 만 전하고 판단은 부모가 한다.
 */

import React from 'react'
import styled from 'styled-components'

import { parseClipboardMatrix } from '../../utils/clipboard'

const Wrap = styled.div`
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  background: hsl(var(--surface));
  overflow: auto;
  max-height: ${p => p.$maxHeight || '300px'};
`

const TableEl = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
`

const Th = styled.th`
  background: hsl(var(--surface-2));
  border-bottom: 1px solid hsl(var(--border));
  border-right: 1px solid hsl(var(--border));
  padding: 0;
  min-width: 100px;
  position: relative;
  &:last-child { border-right: none; }
`

const Td = styled.td`
  border-bottom: 1px solid hsl(var(--bg));
  border-right: 1px solid hsl(var(--bg));
  padding: 0;
  &:last-child { border-right: none; }
`

const HeaderInput = styled.input`
  width: 100%;
  padding: 8px 22px 8px 10px;
  border: none;
  background: transparent;
  font-weight: 600;
  font-size: 0.85rem;
  outline: none;
  box-sizing: border-box;
  cursor: text;
  &:hover:not(:focus) { background: hsl(var(--surface-2)); }
  &:focus { background: hsl(var(--primary-soft)); }
  &:disabled { cursor: default; color: hsl(var(--fg-muted)); }
`

const CellInput = styled.input`
  width: 100%;
  padding: 6px 10px;
  border: none;
  background: transparent;
  font-size: 0.85rem;
  outline: none;
  box-sizing: border-box;
  &:focus { background: hsl(var(--primary-soft)); }
  &:disabled { color: hsl(var(--fg-muted)); }
`

const ColRemoveBtn = styled.button`
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  background: transparent;
  color: hsl(var(--border-strong));
  cursor: pointer;
  font-size: 0.9rem;
  line-height: 1;
  border-radius: var(--radius-sm);
  &:hover { background: hsl(var(--danger-soft)); color: hsl(var(--danger)); }
`

const RowRemoveCell = styled.td`
  width: 32px;
  text-align: center;
  border-bottom: 1px solid hsl(var(--bg));
  background: hsl(var(--surface-2));
`

const RowRemoveBtn = styled.button`
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  background: transparent;
  color: hsl(var(--border-strong));
  cursor: pointer;
  font-size: 0.85rem;
  line-height: 1;
  border-radius: var(--radius-sm);
  &:hover { background: hsl(var(--danger-soft)); color: hsl(var(--danger)); }
`

// 표 **위**에 놓는다. 라벨 → 버튼 → 표 순서라 표를 훑고 내려가지 않아도 된다.
const Actions = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
`

const ActionBtn = styled.button`
  padding: 6px 12px;
  border: 1px dashed hsl(var(--border-strong));
  background: hsl(var(--surface));
  color: hsl(var(--fg-muted));
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  cursor: pointer;
  &:hover { border-color: hsl(var(--primary)); color: hsl(var(--primary)); }
`

const Hint = styled.p`
  font-size: 0.78rem;
  color: hsl(var(--fg-subtle));
  margin: 8px 0 0 0;
  line-height: 1.5;
`

const DEFAULT_HINT =
  '💡 엑셀에서 범위를 복사한 뒤 셀에 붙여넣으면 그 위치부터 데이터가 채워지고 행·열이 자동으로 확장됩니다. 헤더 칸에 붙여넣으면 첫 줄이 열 이름으로 사용됩니다.'

/**
 * 열이 하나 사라졌을 때, 열 번호를 가리키던 값을 어디로 옮길지.
 *
 * 뒤쪽 열은 한 칸 당겨진다. **지워진 열 자신을 가리키고 있었다면 0번으로 보낸다** —
 * 그 지정은 이미 의미를 잃었고, 범위 밖 번호를 남기면 나중에 조용히 빈 값을 읽는다.
 *
 * 조회 키·결과 열(테이블)과 x·y 열(보간)이 같은 규칙을 쓴다.
 */
export function shiftColumnIndex(index, removedIndex) {
  if (index > removedIndex) return index - 1
  if (index === removedIndex) return 0
  return index
}

export function TableGrid({
  value,
  onChange,
  readOnly = false,
  hint = DEFAULT_HINT,
  maxHeight,
  minColumns = 1,
}) {
  const columns = value.columns || []
  const rows = value.rows || []

  // meta 는 "구조를 어떻게 바꿨는가". 부모가 열 번호를 들고 있으면 그것을
  // 맞춰야 하는데, 결과만 보고는 몇 번째가 사라졌는지 알 수 없다.
  const emit = (next, meta) => onChange({ ...value, ...next }, meta)

  const renameColumn = (idx, name) =>
    emit({ columns: columns.map((c, i) => (i === idx ? name : c)) })

  const setCell = (rowIdx, colIdx, val) =>
    emit({
      rows: rows.map((r, i) => (i === rowIdx ? r.map((c, j) => (j === colIdx ? val : c)) : r)),
    })

  const addRow = () => emit({ rows: [...rows, columns.map(() => '')] })

  const removeRow = (idx) => emit({ rows: rows.filter((_, i) => i !== idx) })

  const addColumn = () =>
    emit({
      columns: [...columns, `열 ${columns.length + 1}`],
      rows: rows.map(r => [...r, '']),
    })

  const removeColumn = (idx) => {
    if (columns.length <= minColumns) return
    emit(
      {
        columns: columns.filter((_, i) => i !== idx),
        rows: rows.map(r => r.filter((_, i) => i !== idx)),
      },
      { type: 'removeColumn', index: idx },
    )
  }

  // 붙여넣은 범위가 지금 표보다 크면 행·열을 늘린다. 사용자가 먼저 크기를
  // 맞춰 두게 하면 엑셀에서 가져오는 의미가 없다.
  const handleCellPaste = (rowIdx, colIdx, e) => {
    const matrix = parseClipboardMatrix(e.clipboardData?.getData('text'))
    if (!matrix) return
    e.preventDefault()

    const pasteRows = matrix.length
    const pasteCols = Math.max(...matrix.map(r => r.length))
    const nextColumns = [...columns]
    const nextRows = rows.map(r => [...r])

    while (nextColumns.length < colIdx + pasteCols) {
      nextColumns.push(`열 ${nextColumns.length + 1}`)
      nextRows.forEach(r => r.push(''))
    }
    while (nextRows.length < rowIdx + pasteRows) {
      nextRows.push(nextColumns.map(() => ''))
    }
    for (let ri = 0; ri < pasteRows; ri++) {
      for (let ci = 0; ci < matrix[ri].length; ci++) {
        nextRows[rowIdx + ri][colIdx + ci] = matrix[ri][ci]
      }
    }
    emit({ columns: nextColumns, rows: nextRows })
  }

  // 헤더에 붙여넣으면 첫 줄이 열 이름, 나머지가 데이터다 — 엑셀에서 표를
  // 통째로 복사했을 때 가장 자연스러운 해석이다.
  const handleHeaderPaste = (colIdx, e) => {
    const matrix = parseClipboardMatrix(e.clipboardData?.getData('text'))
    if (!matrix) return
    e.preventDefault()

    const header = matrix[0]
    const body = matrix.slice(1)
    const nextColumns = [...columns]
    const nextRows = rows.map(r => [...r])

    while (nextColumns.length < colIdx + header.length) {
      nextColumns.push(`열 ${nextColumns.length + 1}`)
      nextRows.forEach(r => r.push(''))
    }
    header.forEach((name, i) => {
      if (String(name).trim() !== '') nextColumns[colIdx + i] = name
    })
    while (nextRows.length < body.length) {
      nextRows.push(nextColumns.map(() => ''))
    }
    body.forEach((row, ri) => {
      row.forEach((cell, ci) => {
        if (colIdx + ci < nextColumns.length) nextRows[ri][colIdx + ci] = cell
      })
    })
    emit({ columns: nextColumns, rows: nextRows })
  }

  return (
    <>
      {!readOnly && (
        <Actions>
          <ActionBtn type="button" onClick={addRow}>+ 행 추가</ActionBtn>
          <ActionBtn type="button" onClick={addColumn}>+ 열 추가</ActionBtn>
        </Actions>
      )}
      <Wrap $maxHeight={maxHeight}>
        <TableEl>
          <thead>
            <tr>
              {columns.map((col, ci) => (
                <Th key={ci}>
                  <HeaderInput
                    value={col}
                    onChange={(e) => renameColumn(ci, e.target.value)}
                    onPaste={(e) => handleHeaderPaste(ci, e)}
                    placeholder={`열 ${ci + 1}`}
                    disabled={readOnly}
                  />
                  {!readOnly && columns.length > minColumns && (
                    <ColRemoveBtn type="button" onClick={() => removeColumn(ci)} title="열 삭제">✕</ColRemoveBtn>
                  )}
                </Th>
              ))}
              <Th style={{ width: 32, minWidth: 32, background: 'hsl(var(--surface-2))' }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {columns.map((_, ci) => (
                  <Td key={ci}>
                    <CellInput
                      value={row[ci] ?? ''}
                      onChange={(e) => setCell(ri, ci, e.target.value)}
                      onPaste={(e) => handleCellPaste(ri, ci, e)}
                      disabled={readOnly}
                    />
                  </Td>
                ))}
                <RowRemoveCell>
                  {!readOnly && (
                    <RowRemoveBtn type="button" onClick={() => removeRow(ri)} title="행 삭제">✕</RowRemoveBtn>
                  )}
                </RowRemoveCell>
              </tr>
            ))}
          </tbody>
        </TableEl>
      </Wrap>
      {hint && <Hint>{hint}</Hint>}
    </>
  )
}

export default TableGrid
