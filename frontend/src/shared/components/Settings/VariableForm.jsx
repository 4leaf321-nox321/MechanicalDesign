import React, { useState, useEffect, useMemo, useRef } from 'react'
import styled from 'styled-components'
import { RESERVED_NAMES } from '../../utils/evaluators'

const API_URL = import.meta.env.VITE_API_URL || '/api'

// ============================================
// Styled Components
// ============================================
const FormWrapper = styled.div`
  background: #f8f9fa;
  border: 1px solid #e0e0e0;
  border-radius: 10px;
  padding: 24px;
`

const FormTitle = styled.h3`
  font-size: 1rem;
  font-weight: 600;
  color: #333;
  margin: 0 0 20px 0;
`

const FormGroup = styled.div`
  margin-bottom: 18px;
`

const Label = styled.label`
  display: block;
  font-size: 0.85rem;
  font-weight: 500;
  color: #555;
  margin-bottom: 6px;
`

const Input = styled.input`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.9rem;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s;

  &:focus {
    border-color: #3498db;
  }
`

const Select = styled.select`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.9rem;
  outline: none;
  box-sizing: border-box;
  background: white;
  cursor: pointer;

  &:focus {
    border-color: #3498db;
  }
`

const RangeRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
`

const FormRow = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
`

const ButtonRow = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
`

const Button = styled.button`
  padding: 9px 20px;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
`

const CancelBtn = styled(Button)`
  background: #e9ecef;
  color: #666;
  &:hover { background: #dee2e6; }
`

const SaveBtn = styled(Button)`
  background: #3498db;
  color: white;
  &:hover { background: #2980b9; }
  &:disabled { background: #b0d4f1; cursor: not-allowed; }
`

const ErrorMsg = styled.p`
  color: #e74c3c;
  font-size: 0.85rem;
  margin: 0 0 12px 0;
`

const TypeLabel = styled.span`
  display: inline-block;
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 0.85rem;
  background: #f3e5f5;
  color: #7b1fa2;
  font-weight: 500;
`

const FormulaTextarea = styled.textarea`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.9rem;
  font-family: 'Consolas', 'Monaco', monospace;
  outline: none;
  box-sizing: border-box;
  resize: vertical;
  min-height: 60px;
  transition: border-color 0.2s;

  &:focus {
    border-color: #7b1fa2;
  }
`

const FormulaHint = styled.p`
  font-size: 0.78rem;
  color: #999;
  margin: 6px 0 0 0;
  line-height: 1.4;
`

const SegmentedRow = styled.div`
  display: flex;
  gap: 6px;
`

const SegmentBtn = styled.button`
  flex: 1;
  padding: 8px 12px;
  border: 1px solid ${p => p.$active ? '#3498db' : '#ddd'};
  background: ${p => p.$active ? '#3498db' : 'white'};
  color: ${p => p.$active ? 'white' : '#555'};
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  &:hover { border-color: #3498db; }
`

const TableWrap = styled.div`
  border: 1px solid #ddd;
  border-radius: 6px;
  background: white;
  overflow: auto;
  max-height: 300px;
`

const TableEl = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
`

const Th = styled.th`
  background: #f1f3f5;
  border-bottom: 1px solid #ddd;
  border-right: 1px solid #eee;
  padding: 0;
  min-width: 100px;
  position: relative;
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
  &:hover:not(:focus) { background: #eef2f5; }
  &:focus { background: #e3f2fd; }
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
  color: #bbb;
  cursor: pointer;
  font-size: 0.9rem;
  line-height: 1;
  border-radius: 3px;
  &:hover { background: #fee; color: #e74c3c; }
`

const Td = styled.td`
  border-bottom: 1px solid #f0f0f0;
  border-right: 1px solid #f0f0f0;
  padding: 0;
  &:last-child { border-right: none; }
`

const CellInput = styled.input`
  width: 100%;
  padding: 6px 10px;
  border: none;
  background: transparent;
  font-size: 0.85rem;
  outline: none;
  box-sizing: border-box;
  &:focus { background: #e3f2fd; }
`

const RowRemoveCell = styled.td`
  width: 32px;
  text-align: center;
  border-bottom: 1px solid #f0f0f0;
  background: #fafbfc;
`

const RowRemoveBtn = styled.button`
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  background: transparent;
  color: #bbb;
  cursor: pointer;
  font-size: 0.85rem;
  border-radius: 3px;
  &:hover { background: #fee; color: #e74c3c; }
`

const TableActions = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 8px;
`

const SmallBtn = styled.button`
  padding: 6px 12px;
  border: 1px dashed #bbb;
  background: white;
  color: #666;
  border-radius: 5px;
  font-size: 0.8rem;
  cursor: pointer;
  &:hover { border-color: #3498db; color: #3498db; }
`

const ColumnPickerRow = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
`

const KeyRow = styled.div`
  display: grid;
  grid-template-columns: minmax(120px, 1fr) minmax(160px, 2fr) minmax(140px, 1fr) auto;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
`

const KeyExprInput = styled.input`
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.85rem;
  outline: none;
  box-sizing: border-box;
  &:focus { border-color: #3498db; }
`

const OptionRow = styled.div`
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
`

const OptionRemoveBtn = styled.button`
  width: 32px;
  border: 1px solid #eee;
  background: white;
  color: #bbb;
  cursor: pointer;
  border-radius: 6px;
  font-size: 0.9rem;
  &:hover { background: #fee; color: #e74c3c; border-color: #fee; }
`

const ColumnNamesGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 8px;
`

const ColumnNameField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`

const ColumnIndexLabel = styled.span`
  font-size: 0.72rem;
  color: #999;
  font-weight: 500;
`

const CondBranchRow = styled.div`
  display: grid;
  grid-template-columns: auto 1fr auto 1fr auto;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
`

const CondLabel = styled.span`
  font-size: 0.78rem;
  color: #666;
  font-weight: 500;
  white-space: nowrap;
`

const CondInput = styled.input`
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.85rem;
  outline: none;
  box-sizing: border-box;
  &:focus { border-color: #3498db; }
`

const DefaultRow = styled.div`
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding-top: 10px;
  border-top: 1px dashed #ddd;
`

const TemplateBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  padding: 8px 10px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
`

const TemplateBarLabel = styled.span`
  font-size: 0.8rem;
  font-weight: 600;
  color: #475569;
  margin-right: 4px;
`

const TemplateBtn = styled.button`
  padding: 5px 12px;
  border: 1px solid #cbd5e1;
  background: white;
  color: #475569;
  border-radius: 5px;
  font-size: 0.8rem;
  cursor: pointer;
  &:hover { border-color: #3498db; color: #3498db; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`

// ===== Template Modal =====
const TplOverlay = styled.div`
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
`

const TplModal = styled.div`
  width: min(720px, 90vw);
  height: min(720px, 85vh);
  background: white;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  overflow: hidden;
`

const TplHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  border-bottom: 1px solid #eee;
  flex-shrink: 0;
`

const TplTitle = styled.h2`
  font-size: 1.1rem;
  font-weight: 600;
  color: #333;
  margin: 0;
`

const TplCloseBtn = styled.button`
  background: none;
  border: none;
  font-size: 1.4rem;
  color: #999;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 4px;
  &:hover { background: #f0f0f0; color: #333; }
`

const TplSearchRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 24px;
  border-bottom: 1px solid #f0f0f0;
  flex-shrink: 0;
`

const TplSearchInput = styled.input`
  flex: 1;
  padding: 10px 14px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.95rem;
  outline: none;
  &:focus { border-color: #3498db; }
`

const TplCount = styled.span`
  font-size: 0.8rem;
  color: #94a3b8;
  white-space: nowrap;
`

const TplListBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 8px 14px;
  background: #fafbfc;
`

const TplCard = styled.div`
  background: white;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 12px 14px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: border-color 0.12s, box-shadow 0.12s;
  &:hover {
    border-color: #3498db;
    box-shadow: 0 2px 8px rgba(52, 152, 219, 0.15);
  }
`

const TplCardHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 4px;
`

const TplCardName = styled.span`
  font-weight: 600;
  color: #333;
  font-size: 0.95rem;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const TplCardPreview = styled.div`
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.82rem;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const TplCardDate = styled.span`
  font-size: 0.72rem;
  color: #94a3b8;
`

const TplDeleteBtn = styled.button`
  background: none;
  border: 1px solid transparent;
  color: #cbd5e1;
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.85rem;
  flex-shrink: 0;
  &:hover { background: #fee; color: #e74c3c; border-color: #fee; }
`

const TplEmpty = styled.div`
  padding: 60px 20px;
  text-align: center;
  color: #bbb;
  font-size: 0.95rem;
`

const TplSaveRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 24px;
  border-top: 1px solid #eee;
  background: #f8fafc;
  flex-shrink: 0;
`

const TplSaveLabel = styled.span`
  font-size: 0.85rem;
  font-weight: 600;
  color: #475569;
  white-space: nowrap;
`

const TplNameInput = styled.input`
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.9rem;
  outline: none;
  &:focus { border-color: #3498db; }
`

const TplSaveBtn = styled.button`
  padding: 8px 18px;
  border: none;
  background: #3498db;
  color: white;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  &:hover { background: #2980b9; }
  &:disabled { background: #b0d4f1; cursor: not-allowed; }
`

const TplOverflowHint = styled.div`
  text-align: center;
  padding: 10px;
  font-size: 0.78rem;
  color: #94a3b8;
`

// ============================================
// Default table shape
// ============================================
const DEFAULT_TABLE = {
  columns: ['열 1', '열 2'],
  rows: [['', ''], ['', '']],
  result_column_index: 1,
  keys: [{ column_index: 0, expression: '', match_mode: 'exact' }],
}

function _normalizeKeys(parsed) {
  if (Array.isArray(parsed.keys) && parsed.keys.length > 0) {
    return parsed.keys.map(k => ({
      column_index: Number(k?.column_index ?? 0),
      expression: String(k?.expression ?? ''),
      match_mode: k?.match_mode || 'exact',
    }))
  }
  // 구 shape 마이그레이션
  if (parsed.key_column_index != null) {
    return [{
      column_index: Number(parsed.key_column_index),
      expression: String(parsed.key_expression || ''),
      match_mode: parsed.match_mode || 'exact',
    }]
  }
  return [{ column_index: 0, expression: '', match_mode: 'exact' }]
}

function parseTableData(raw) {
  if (!raw) return { columns: [...DEFAULT_TABLE.columns], rows: DEFAULT_TABLE.rows.map(r => [...r]), result_column_index: 1, keys: [{ ...DEFAULT_TABLE.keys[0] }] }
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return {
      columns: Array.isArray(parsed.columns) ? parsed.columns : DEFAULT_TABLE.columns,
      rows: Array.isArray(parsed.rows) ? parsed.rows : DEFAULT_TABLE.rows,
      result_column_index: parsed.result_column_index ?? 1,
      keys: _normalizeKeys(parsed),
    }
  } catch {
    return { columns: [...DEFAULT_TABLE.columns], rows: DEFAULT_TABLE.rows.map(r => [...r]), result_column_index: 1, keys: [{ ...DEFAULT_TABLE.keys[0] }] }
  }
}

const DEFAULT_INTERP = {
  columns: ['x', 'y'],
  rows: [['', ''], ['', '']],
  x_column_index: 0,
  y_column_index: 1,
  x_expression: '',
}

function parseInterpData(raw) {
  const fresh = () => ({
    columns: [...DEFAULT_INTERP.columns],
    rows: DEFAULT_INTERP.rows.map(r => [...r]),
    x_column_index: 0,
    y_column_index: 1,
    x_expression: '',
  })
  if (!raw) return fresh()
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return {
      columns: Array.isArray(parsed.columns) ? parsed.columns : DEFAULT_INTERP.columns,
      rows: Array.isArray(parsed.rows) ? parsed.rows : DEFAULT_INTERP.rows,
      x_column_index: parsed.x_column_index ?? 0,
      y_column_index: parsed.y_column_index ?? 1,
      x_expression: parsed.x_expression || '',
    }
  } catch {
    return fresh()
  }
}

function parseOptions(raw) {
  if (!raw) return ['']
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(parsed) || parsed.length === 0) return ['']
    return parsed.map(x => String(x))
  } catch {
    return ['']
  }
}

const DEFAULT_CONDITIONAL = {
  branches: [{ condition: '', formula: '' }],
  default_formula: '',
}

function parseConditional(raw) {
  if (!raw) return { ...DEFAULT_CONDITIONAL }
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    const branches = Array.isArray(parsed.branches) ? parsed.branches.map(b => ({
      condition: String(b.condition ?? ''),
      formula: String(b.formula ?? ''),
    })) : DEFAULT_CONDITIONAL.branches
    return {
      branches: branches.length > 0 ? branches : DEFAULT_CONDITIONAL.branches,
      default_formula: String(parsed.default_formula ?? ''),
    }
  } catch {
    return { ...DEFAULT_CONDITIONAL }
  }
}

// ============================================
// Conditional editor sub-component
// ============================================
function ConditionalEditor({ value, onChange, availableSymbols }) {
  const data = value
  const setBranch = (idx, patch) => {
    onChange({
      ...data,
      branches: data.branches.map((b, i) => i === idx ? { ...b, ...patch } : b),
    })
  }
  const addBranch = () => {
    onChange({ ...data, branches: [...data.branches, { condition: '', formula: '' }] })
  }
  const removeBranch = (idx) => {
    if (data.branches.length <= 1) {
      onChange({ ...data, branches: [{ condition: '', formula: '' }] })
      return
    }
    onChange({ ...data, branches: data.branches.filter((_, i) => i !== idx) })
  }

  return (
    <FormGroup>
      <Label>조건부 정의</Label>
      {data.branches.map((b, i) => (
        <CondBranchRow key={i}>
          <CondLabel>{i === 0 ? 'if' : 'else if'}</CondLabel>
          <CondInput
            value={b.condition}
            onChange={(e) => setBranch(i, { condition: e.target.value })}
            placeholder="예: A > 10, material == &quot;SS400&quot;, A >= B && C < 5"
          />
          <CondLabel>→ 값</CondLabel>
          <CondInput
            value={b.formula}
            onChange={(e) => setBranch(i, { formula: e.target.value })}
            placeholder="예: A * 2, B + 1, material"
          />
          <OptionRemoveBtn type="button" onClick={() => removeBranch(i)} title="분기 삭제">✕</OptionRemoveBtn>
        </CondBranchRow>
      ))}
      <SmallBtn type="button" onClick={addBranch} style={{ marginTop: 4 }}>+ 분기 추가</SmallBtn>
      <DefaultRow>
        <CondLabel>else (그 외) → 값</CondLabel>
        <CondInput
          value={data.default_formula}
          onChange={(e) => onChange({ ...data, default_formula: e.target.value })}
          placeholder="예: 0, A, 어떤 조건에도 맞지 않을 때의 수식"
        />
      </DefaultRow>
      <FormulaHint>
        위에서부터 순서대로 조건을 평가해 처음으로 참인 분기의 수식을 계산합니다. 비교 연산자: {'<, >, <=, >=, ==, !='}, 논리 연산자: {'&&, ||, !'}. 문자열 비교는 {'material == "SS400"'}처럼 큰따옴표로 감싸세요.
        {availableSymbols.length > 0 && <> 사용 가능한 기호: {availableSymbols.join(', ')}</>}
      </FormulaHint>
    </FormGroup>
  )
}

// ============================================
// Dropdown options editor
// ============================================
function OptionsEditor({ value, onChange }) {
  const options = value
  const update = (idx, v) => onChange(options.map((o, i) => i === idx ? v : o))
  const add = () => onChange([...options, ''])
  const remove = (idx) => onChange(options.length > 1 ? options.filter((_, i) => i !== idx) : options)

  // 엑셀 등에서 여러 셀(가로·세로 무관)을 붙여넣으면 옵션을 일괄 추가
  const handlePaste = (idx, e) => {
    const text = e.clipboardData?.getData('text')
    if (!text) return
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const lines = normalized.split('\n')
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
    if (lines.length === 0) return
    const matrix = lines.map(line => line.split('\t'))
    const isMulti = matrix.length > 1 || matrix[0].length > 1
    if (!isMulti) return
    e.preventDefault()

    const flat = []
    matrix.forEach(row => row.forEach(cell => flat.push(cell)))
    const cleaned = flat.map(s => s.trim()).filter(s => s !== '')
    if (cleaned.length === 0) return

    const next = [...options]
    next.splice(idx, 1, ...cleaned)
    onChange(next)
  }

  return (
    <FormGroup>
      <Label>옵션 리스트</Label>
      {options.map((opt, i) => (
        <OptionRow key={i}>
          <Input
            value={opt}
            onChange={(e) => update(i, e.target.value)}
            onPaste={(e) => handlePaste(i, e)}
            placeholder={`옵션 ${i + 1}`}
          />
          <OptionRemoveBtn type="button" onClick={() => remove(i)} disabled={options.length <= 1} title="삭제">✕</OptionRemoveBtn>
        </OptionRow>
      ))}
      <SmallBtn type="button" onClick={add} style={{ marginTop: 4 }}>+ 옵션 추가</SmallBtn>
      <FormulaHint>
        사용자가 선택한 옵션 문자열이 이 변수의 기호에 저장됩니다. 숫자/문자열 모두 사용 가능.
        {' '}💡 엑셀에서 여러 셀(가로·세로)을 복사한 뒤 옵션 칸에 붙여넣으면 그 위치부터 옵션이 한꺼번에 추가됩니다.
      </FormulaHint>
    </FormGroup>
  )
}

// ============================================
// Table editor sub-component
// ============================================
function TableEditor({ value, onChange, availableSymbols }) {
  const data = value

  const set = (patch) => onChange({ ...data, ...patch })

  const renameColumn = (idx, name) => {
    const cols = data.columns.map((c, i) => i === idx ? name : c)
    set({ columns: cols })
  }

  const setCell = (rowIdx, colIdx, val) => {
    const rows = data.rows.map((r, i) =>
      i === rowIdx ? r.map((c, j) => j === colIdx ? val : c) : r
    )
    set({ rows })
  }

  const addRow = () => {
    set({ rows: [...data.rows, data.columns.map(() => '')] })
  }

  const removeRow = (idx) => {
    set({ rows: data.rows.filter((_, i) => i !== idx) })
  }

  const addColumn = () => {
    const newName = `열 ${data.columns.length + 1}`
    set({
      columns: [...data.columns, newName],
      rows: data.rows.map(r => [...r, '']),
    })
  }

  const removeColumn = (idx) => {
    if (data.columns.length <= 1) return
    const adjust = (i) => i > idx ? i - 1 : (i === idx ? 0 : i)
    set({
      columns: data.columns.filter((_, i) => i !== idx),
      rows: data.rows.map(r => r.filter((_, i) => i !== idx)),
      result_column_index: adjust(data.result_column_index),
      keys: data.keys.map(k => ({ ...k, column_index: adjust(k.column_index) })),
    })
  }

  const updateKey = (idx, patch) => {
    set({ keys: data.keys.map((k, i) => i === idx ? { ...k, ...patch } : k) })
  }
  const addKey = () => {
    const usedCols = new Set(data.keys.map(k => k.column_index))
    let col = 0
    for (let i = 0; i < data.columns.length; i++) {
      if (!usedCols.has(i) && i !== data.result_column_index) { col = i; break }
    }
    set({ keys: [...data.keys, { column_index: col, expression: '', match_mode: 'exact' }] })
  }
  const removeKey = (idx) => {
    if (data.keys.length <= 1) {
      set({ keys: [{ column_index: 0, expression: '', match_mode: 'exact' }] })
      return
    }
    set({ keys: data.keys.filter((_, i) => i !== idx) })
  }

  // 엑셀 TSV 클립보드 파싱 — 멀티셀일 때만 매트릭스 반환, 아니면 null
  const parseClipboardMatrix = (text) => {
    if (!text) return null
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const lines = normalized.split('\n')
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
    if (lines.length === 0) return null
    const matrix = lines.map(line => line.split('\t'))
    const isMulti = matrix.length > 1 || matrix[0].length > 1
    return isMulti ? matrix : null
  }

  // 데이터 셀(rowIdx, colIdx)에 붙여넣기 — 필요 시 행·열 확장
  const handleCellPaste = (rowIdx, colIdx, e) => {
    const text = e.clipboardData?.getData('text')
    const matrix = parseClipboardMatrix(text)
    if (!matrix) return
    e.preventDefault()

    const pasteRows = matrix.length
    const pasteCols = Math.max(...matrix.map(r => r.length))
    const neededCols = colIdx + pasteCols
    const neededRows = rowIdx + pasteRows

    const newColumns = [...data.columns]
    const newRows = data.rows.map(r => [...r])
    while (newColumns.length < neededCols) {
      newColumns.push(`열 ${newColumns.length + 1}`)
      newRows.forEach(r => r.push(''))
    }
    while (newRows.length < neededRows) {
      newRows.push(newColumns.map(() => ''))
    }
    for (let ri = 0; ri < pasteRows; ri++) {
      for (let ci = 0; ci < matrix[ri].length; ci++) {
        newRows[rowIdx + ri][colIdx + ci] = matrix[ri][ci]
      }
    }
    set({ columns: newColumns, rows: newRows })
  }

  // 헤더(colIdx)에 붙여넣기 — 첫 줄은 열 이름, 이후 줄은 데이터 (행 0부터)
  const handleHeaderPaste = (colIdx, e) => {
    const text = e.clipboardData?.getData('text')
    const matrix = parseClipboardMatrix(text)
    if (!matrix) return
    e.preventDefault()

    const [headerLine, ...dataLines] = matrix
    const pasteCols = Math.max(headerLine.length, ...dataLines.map(r => r.length), 0)
    const neededCols = colIdx + pasteCols
    const neededRows = dataLines.length

    const newColumns = [...data.columns]
    const newRows = data.rows.map(r => [...r])
    while (newColumns.length < neededCols) {
      newColumns.push(`열 ${newColumns.length + 1}`)
      newRows.forEach(r => r.push(''))
    }
    while (newRows.length < neededRows) {
      newRows.push(newColumns.map(() => ''))
    }

    for (let ci = 0; ci < headerLine.length; ci++) {
      newColumns[colIdx + ci] = headerLine[ci]
    }
    for (let ri = 0; ri < dataLines.length; ri++) {
      for (let ci = 0; ci < dataLines[ri].length; ci++) {
        newRows[ri][colIdx + ci] = dataLines[ri][ci]
      }
    }
    set({ columns: newColumns, rows: newRows })
  }

  return (
    <>
      <FormGroup>
        <Label>열 이름</Label>
        <ColumnNamesGrid>
          {data.columns.map((col, ci) => (
            <ColumnNameField key={ci}>
              <ColumnIndexLabel>열 {ci + 1}</ColumnIndexLabel>
              <Input
                value={col}
                onChange={(e) => renameColumn(ci, e.target.value)}
                placeholder={`열 ${ci + 1}`}
              />
            </ColumnNameField>
          ))}
        </ColumnNamesGrid>
        <FormulaHint>
          여기서 정의한 이름은 아래 "테이블 데이터"의 헤더, "조회 열"·"결과 열" 셀렉트에도 함께 반영됩니다.
        </FormulaHint>
      </FormGroup>

      <FormGroup>
        <Label>테이블 데이터</Label>
        <TableWrap>
          <TableEl>
            <thead>
              <tr>
                {data.columns.map((col, ci) => (
                  <Th key={ci}>
                    <HeaderInput
                      value={col}
                      onChange={(e) => renameColumn(ci, e.target.value)}
                      onPaste={(e) => handleHeaderPaste(ci, e)}
                      placeholder={`열 ${ci + 1}`}
                    />
                    {data.columns.length > 1 && (
                      <ColRemoveBtn type="button" onClick={() => removeColumn(ci)} title="열 삭제">✕</ColRemoveBtn>
                    )}
                  </Th>
                ))}
                <Th style={{ width: 32, minWidth: 32, background: '#f1f3f5' }} />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, ri) => (
                <tr key={ri}>
                  {data.columns.map((_, ci) => (
                    <Td key={ci}>
                      <CellInput
                        value={row[ci] ?? ''}
                        onChange={(e) => setCell(ri, ci, e.target.value)}
                        onPaste={(e) => handleCellPaste(ri, ci, e)}
                      />
                    </Td>
                  ))}
                  <RowRemoveCell>
                    <RowRemoveBtn type="button" onClick={() => removeRow(ri)} title="행 삭제">✕</RowRemoveBtn>
                  </RowRemoveCell>
                </tr>
              ))}
            </tbody>
          </TableEl>
        </TableWrap>
        <TableActions>
          <SmallBtn type="button" onClick={addRow}>+ 행 추가</SmallBtn>
          <SmallBtn type="button" onClick={addColumn}>+ 열 추가</SmallBtn>
        </TableActions>
        <FormulaHint>
          💡 엑셀에서 범위를 복사한 뒤 셀에 붙여넣으면 그 위치부터 데이터가 채워지고 행·열이 자동으로 확장됩니다. 헤더 칸에 붙여넣으면 첫 줄이 열 이름으로 사용됩니다.
        </FormulaHint>
      </FormGroup>

      <FormGroup>
        <Label>결과 열 (Result)</Label>
        <Select
          value={data.result_column_index}
          onChange={(e) => set({ result_column_index: Number(e.target.value) })}
        >
          {data.columns.map((c, i) => (
            <option key={i} value={i}>{c || `열 ${i + 1}`}</option>
          ))}
        </Select>
      </FormGroup>

      <FormGroup>
        <Label>조회 키 (Keys)</Label>
        {data.keys.map((k, i) => (
          <KeyRow key={i}>
            <Select
              value={k.column_index}
              onChange={(e) => updateKey(i, { column_index: Number(e.target.value) })}
            >
              {data.columns.map((c, ci) => (
                <option key={ci} value={ci}>{c || `열 ${ci + 1}`}</option>
              ))}
            </Select>
            <KeyExprInput
              value={k.expression}
              onChange={(e) => updateKey(i, { expression: e.target.value })}
              placeholder="조회 수식 (예: A, d_i, A + 2)"
            />
            <Select
              value={k.match_mode}
              onChange={(e) => updateKey(i, { match_mode: e.target.value })}
            >
              <option value="exact">정확히 일치</option>
              <option value="nearest">가장 가까운 값</option>
              <option value="floor">내림 (Floor)</option>
              <option value="ceiling">올림 (Ceiling)</option>
            </Select>
            <OptionRemoveBtn type="button" onClick={() => removeKey(i)} title="조회 키 삭제">✕</OptionRemoveBtn>
          </KeyRow>
        ))}
        <SmallBtn type="button" onClick={addKey} style={{ marginTop: 4 }}>+ 조회 키 추가</SmallBtn>
        <FormulaHint>
          여러 조회 키를 정의하면 모든 키가 동시에 매칭되는 행(AND)을 찾습니다. 예) "직경(가장 가까운 값) AND 재질(정확히 일치)".
          {' '}내림/올림은 숫자 키에서만 동작하며, 동점이면 거리 합이 가장 작은 행이 선택됩니다.
          {availableSymbols.length > 0 && <> 사용 가능한 기호: {availableSymbols.join(', ')}</>}
        </FormulaHint>
      </FormGroup>
    </>
  )
}

// ============================================
// Interpolation table editor — 단일 x/y 열, 선형 내삽·외삽
// ============================================
function InterpTableEditor({ value, onChange, availableSymbols }) {
  const data = value
  const set = (patch) => onChange({ ...data, ...patch })

  const renameColumn = (idx, name) => {
    const cols = data.columns.map((c, i) => i === idx ? name : c)
    set({ columns: cols })
  }

  const setCell = (rowIdx, colIdx, val) => {
    const rows = data.rows.map((r, i) =>
      i === rowIdx ? r.map((c, j) => j === colIdx ? val : c) : r
    )
    set({ rows })
  }

  const addRow = () => {
    set({ rows: [...data.rows, data.columns.map(() => '')] })
  }

  const removeRow = (idx) => {
    set({ rows: data.rows.filter((_, i) => i !== idx) })
  }

  const addColumn = () => {
    set({
      columns: [...data.columns, `열 ${data.columns.length + 1}`],
      rows: data.rows.map(r => [...r, '']),
    })
  }

  const removeColumn = (idx) => {
    if (data.columns.length <= 2) return
    const adjust = (i) => i > idx ? i - 1 : (i === idx ? 0 : i)
    set({
      columns: data.columns.filter((_, i) => i !== idx),
      rows: data.rows.map(r => r.filter((_, i) => i !== idx)),
      x_column_index: adjust(data.x_column_index),
      y_column_index: adjust(data.y_column_index),
    })
  }

  const parseClipboardMatrix = (text) => {
    if (!text) return null
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const lines = normalized.split('\n')
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
    if (lines.length === 0) return null
    const matrix = lines.map(line => line.split('\t'))
    const isMulti = matrix.length > 1 || matrix[0].length > 1
    return isMulti ? matrix : null
  }

  const handleCellPaste = (rowIdx, colIdx, e) => {
    const text = e.clipboardData?.getData('text')
    const matrix = parseClipboardMatrix(text)
    if (!matrix) return
    e.preventDefault()
    const pasteRows = matrix.length
    const pasteCols = Math.max(...matrix.map(r => r.length))
    const neededCols = colIdx + pasteCols
    const neededRows = rowIdx + pasteRows
    const newColumns = [...data.columns]
    const newRows = data.rows.map(r => [...r])
    while (newColumns.length < neededCols) {
      newColumns.push(`열 ${newColumns.length + 1}`)
      newRows.forEach(r => r.push(''))
    }
    while (newRows.length < neededRows) {
      newRows.push(newColumns.map(() => ''))
    }
    for (let ri = 0; ri < pasteRows; ri++) {
      for (let ci = 0; ci < matrix[ri].length; ci++) {
        newRows[rowIdx + ri][colIdx + ci] = matrix[ri][ci]
      }
    }
    set({ columns: newColumns, rows: newRows })
  }

  const handleHeaderPaste = (colIdx, e) => {
    const text = e.clipboardData?.getData('text')
    const matrix = parseClipboardMatrix(text)
    if (!matrix) return
    e.preventDefault()
    const [headerLine, ...dataLines] = matrix
    const pasteCols = Math.max(headerLine.length, ...dataLines.map(r => r.length), 0)
    const neededCols = colIdx + pasteCols
    const neededRows = dataLines.length
    const newColumns = [...data.columns]
    const newRows = data.rows.map(r => [...r])
    while (newColumns.length < neededCols) {
      newColumns.push(`열 ${newColumns.length + 1}`)
      newRows.forEach(r => r.push(''))
    }
    while (newRows.length < neededRows) {
      newRows.push(newColumns.map(() => ''))
    }
    for (let ci = 0; ci < headerLine.length; ci++) {
      newColumns[colIdx + ci] = headerLine[ci]
    }
    for (let ri = 0; ri < dataLines.length; ri++) {
      for (let ci = 0; ci < dataLines[ri].length; ci++) {
        newRows[ri][colIdx + ci] = dataLines[ri][ci]
      }
    }
    set({ columns: newColumns, rows: newRows })
  }

  return (
    <>
      <FormGroup>
        <Label>열 이름</Label>
        <ColumnNamesGrid>
          {data.columns.map((col, ci) => (
            <ColumnNameField key={ci}>
              <ColumnIndexLabel>열 {ci + 1}</ColumnIndexLabel>
              <Input
                value={col}
                onChange={(e) => renameColumn(ci, e.target.value)}
                placeholder={`열 ${ci + 1}`}
              />
            </ColumnNameField>
          ))}
        </ColumnNamesGrid>
      </FormGroup>

      <FormGroup>
        <Label>(x, y) 데이터</Label>
        <TableWrap>
          <TableEl>
            <thead>
              <tr>
                {data.columns.map((col, ci) => (
                  <Th key={ci}>
                    <HeaderInput
                      value={col}
                      onChange={(e) => renameColumn(ci, e.target.value)}
                      onPaste={(e) => handleHeaderPaste(ci, e)}
                      placeholder={`열 ${ci + 1}`}
                    />
                    {data.columns.length > 2 && (
                      <ColRemoveBtn type="button" onClick={() => removeColumn(ci)} title="열 삭제">✕</ColRemoveBtn>
                    )}
                  </Th>
                ))}
                <Th style={{ width: 32, minWidth: 32, background: '#f1f3f5' }} />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, ri) => (
                <tr key={ri}>
                  {data.columns.map((_, ci) => (
                    <Td key={ci}>
                      <CellInput
                        value={row[ci] ?? ''}
                        onChange={(e) => setCell(ri, ci, e.target.value)}
                        onPaste={(e) => handleCellPaste(ri, ci, e)}
                      />
                    </Td>
                  ))}
                  <RowRemoveCell>
                    <RowRemoveBtn type="button" onClick={() => removeRow(ri)} title="행 삭제">✕</RowRemoveBtn>
                  </RowRemoveCell>
                </tr>
              ))}
            </tbody>
          </TableEl>
        </TableWrap>
        <TableActions>
          <SmallBtn type="button" onClick={addRow}>+ 행 추가</SmallBtn>
          <SmallBtn type="button" onClick={addColumn}>+ 열 추가</SmallBtn>
        </TableActions>
        <FormulaHint>
          💡 엑셀에서 (x, y) 쌍을 복사해 붙여넣을 수 있습니다. 비숫자 행은 평가 시 자동으로 무시됩니다.
        </FormulaHint>
      </FormGroup>

      <ColumnPickerRow>
        <FormGroup>
          <Label>x 열 (입력)</Label>
          <Select
            value={data.x_column_index}
            onChange={(e) => set({ x_column_index: Number(e.target.value) })}
          >
            {data.columns.map((c, i) => (
              <option key={i} value={i}>{c || `열 ${i + 1}`}</option>
            ))}
          </Select>
        </FormGroup>
        <FormGroup>
          <Label>y 열 (결과)</Label>
          <Select
            value={data.y_column_index}
            onChange={(e) => set({ y_column_index: Number(e.target.value) })}
          >
            {data.columns.map((c, i) => (
              <option key={i} value={i}>{c || `열 ${i + 1}`}</option>
            ))}
          </Select>
        </FormGroup>
        <div />
      </ColumnPickerRow>

      <FormGroup>
        <Label>x 수식</Label>
        <FormulaTextarea
          value={data.x_expression}
          onChange={(e) => set({ x_expression: e.target.value })}
          placeholder="예: A, d_i, A + 2"
          style={{ minHeight: 40 }}
        />
        <FormulaHint>
          이 수식 결과 x로 (x, y) 데이터에서 y를 선형 보간합니다. 데이터 사이는 인접한 두 점으로 내삽, 양 끝 밖은 가장 가까운 두 점으로 외삽합니다.
          {availableSymbols.length > 0 && <> 사용 가능한 기호: {availableSymbols.join(', ')}</>}
        </FormulaHint>
      </FormGroup>
    </>
  )
}

// ============================================
// Template — 수식/테이블/조건부/보간 정의 본문을 이름으로 저장·재사용
// ============================================
const TYPE_LABEL = { formula: '수식', table: '테이블', conditional: '조건부', interp_table: '보간 테이블' }
const MAX_DISPLAY = 200

function templatePreview(tpl) {
  if (tpl.var_type === 'formula') {
    return `= ${tpl.data || ''}`
  }
  if (tpl.var_type === 'table') {
    try {
      const t = JSON.parse(tpl.data || '{}')
      const cols = (t.columns || []).length
      const rows = (t.rows || []).length
      const resCol = t.columns?.[t.result_column_index] ?? '?'
      const keyList = Array.isArray(t.keys) && t.keys.length > 0
        ? t.keys
        : (t.key_column_index != null ? [{ column_index: t.key_column_index, expression: t.key_expression, match_mode: t.match_mode }] : [])
      const keyDesc = keyList
        .map(k => `${t.columns?.[k.column_index] ?? '?'}${k.expression ? `=${k.expression}` : ''}`)
        .join(' & ')
      return `${cols}열 × ${rows}행 · ${keyDesc || '?'} → ${resCol}`
    } catch { return '' }
  }
  if (tpl.var_type === 'conditional') {
    try {
      const c = JSON.parse(tpl.data || '{}')
      const branches = c.branches || []
      const first = branches[0]
      const head = first?.condition ? `if ${first.condition} → ${first.formula || ''}` : ''
      return `${branches.length}개 분기${c.default_formula ? ' + else' : ''}${head ? ` · ${head}` : ''}`
    } catch { return '' }
  }
  if (tpl.var_type === 'interp_table') {
    try {
      const t = JSON.parse(tpl.data || '{}')
      const rows = (t.rows || []).length
      const xCol = t.columns?.[t.x_column_index] ?? 'x'
      const yCol = t.columns?.[t.y_column_index] ?? 'y'
      const xe = t.x_expression ? ` · x=${t.x_expression}` : ''
      return `${rows}점 · ${xCol} → ${yCol}${xe}`
    } catch { return '' }
  }
  return ''
}

function formatDate(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch { return '' }
}

function TemplateModal({ varType, getCurrentData, onLoad, onClose, initialMode = 'load' }) {
  const [templates, setTemplates] = useState([])
  const [search, setSearch] = useState('')
  const [tplName, setTplName] = useState('')
  const [busy, setBusy] = useState(false)
  const searchRef = useRef(null)
  const nameRef = useRef(null)

  const fetchTemplates = async () => {
    try {
      const res = await fetch(`${API_URL}/templates?var_type=${encodeURIComponent(varType)}`)
      if (res.ok) setTemplates(await res.json())
    } catch (err) {
      console.error('템플릿 목록 불러오기 실패', err)
    }
  }

  useEffect(() => {
    fetchTemplates()
    setTimeout(() => {
      if (initialMode === 'save') nameRef.current?.focus()
      else searchRef.current?.focus()
    }, 50)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [varType])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    if (!s) return templates
    return templates.filter(t =>
      (t.name || '').toLowerCase().includes(s) ||
      (t.data || '').toLowerCase().includes(s)
    )
  }, [templates, search])

  const visible = filtered.slice(0, MAX_DISPLAY)
  const hiddenCount = filtered.length - visible.length

  const handleSave = async () => {
    const name = tplName.trim()
    if (!name) return
    const data = getCurrentData()
    if (data == null) return
    setBusy(true)
    try {
      const res = await fetch(`${API_URL}/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, var_type: varType, data }),
      })
      if (res.ok) {
        await fetchTemplates()
        setTplName('')
      }
    } catch (err) {
      console.error('템플릿 저장 실패', err)
    }
    setBusy(false)
  }

  const handleDelete = async (e, tpl) => {
    e.stopPropagation()
    if (!window.confirm(`템플릿 "${tpl.name}"을(를) 삭제할까요?`)) return
    try {
      await fetch(`${API_URL}/templates/${tpl.id}`, { method: 'DELETE' })
      fetchTemplates()
    } catch (err) {
      console.error('템플릿 삭제 실패', err)
    }
  }

  const handleLoad = (tpl) => {
    onLoad(tpl)
    onClose()
  }

  return (
    <TplOverlay onClick={onClose}>
      <TplModal onClick={(e) => e.stopPropagation()}>
        <TplHeader>
          <TplTitle>{TYPE_LABEL[varType] || ''} 템플릿</TplTitle>
          <TplCloseBtn type="button" onClick={onClose}>✕</TplCloseBtn>
        </TplHeader>

        <TplSearchRow>
          <TplSearchInput
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름 또는 내용으로 검색..."
          />
          <TplCount>
            {search ? `${filtered.length} / ${templates.length}` : `${templates.length}개`}
          </TplCount>
        </TplSearchRow>

        <TplListBody>
          {filtered.length === 0 ? (
            <TplEmpty>
              {templates.length === 0 ? '저장된 템플릿이 없습니다. 아래에서 현재 정의를 저장해보세요.' : '검색 결과가 없습니다.'}
            </TplEmpty>
          ) : (
            <>
              {visible.map(tpl => (
                <TplCard key={tpl.id} onClick={() => handleLoad(tpl)} title="클릭해서 불러오기">
                  <TplCardHeader>
                    <TplCardName>{tpl.name}</TplCardName>
                    <TplCardDate>{formatDate(tpl.created_at)}</TplCardDate>
                    <TplDeleteBtn type="button" onClick={(e) => handleDelete(e, tpl)} title="삭제">✕</TplDeleteBtn>
                  </TplCardHeader>
                  <TplCardPreview>{templatePreview(tpl)}</TplCardPreview>
                </TplCard>
              ))}
              {hiddenCount > 0 && (
                <TplOverflowHint>
                  + {hiddenCount}개 더 — 검색어로 좁혀보세요
                </TplOverflowHint>
              )}
            </>
          )}
        </TplListBody>

        <TplSaveRow>
          <TplSaveLabel>현재 정의 저장:</TplSaveLabel>
          <TplNameInput
            ref={nameRef}
            value={tplName}
            onChange={(e) => setTplName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
            placeholder="템플릿 이름 (같은 이름이면 덮어쓰기)"
          />
          <TplSaveBtn type="button" onClick={handleSave} disabled={busy || !tplName.trim()}>
            저장
          </TplSaveBtn>
        </TplSaveRow>
      </TplModal>
    </TplOverlay>
  )
}

function TemplateToolbar({ varType, getCurrentData, onLoad }) {
  const [open, setOpen] = useState(null)  // null | 'load' | 'save'
  return (
    <>
      <TemplateBar>
        <TemplateBarLabel>📋 템플릿</TemplateBarLabel>
        <TemplateBtn type="button" onClick={() => setOpen('load')}>
          🔍 검색·불러오기
        </TemplateBtn>
        <TemplateBtn type="button" onClick={() => setOpen('save')}>
          + 현재 정의 저장
        </TemplateBtn>
      </TemplateBar>
      {open && (
        <TemplateModal
          varType={varType}
          getCurrentData={getCurrentData}
          onLoad={onLoad}
          initialMode={open}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  )
}

// ============================================
// Component
// ============================================
function VariableForm({ initial, containers = [], variables = [], onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || '')
  const [symbol, setSymbol] = useState(initial?.symbol || '')
  const [category, setCategory] = useState(initial?.category || 'input')
  const [varType, setVarType] = useState(initial?.var_type || 'slider')
  const [unit, setUnit] = useState(initial?.unit || '')
  const [formula, setFormula] = useState(initial?.formula || '')
  const [tableData, setTableData] = useState(() => parseTableData(initial?.table_data))
  const [options, setOptions] = useState(() => parseOptions(initial?.options_data))
  const [conditionalData, setConditionalData] = useState(() => parseConditional(initial?.conditional_data))
  const [interpData, setInterpData] = useState(() => parseInterpData(initial?.interp_data))
  const [containerId, setContainerId] = useState(initial?.container_id ?? '')
  const [minValue, setMinValue] = useState(initial?.min_value ?? 0)
  const [maxValue, setMaxValue] = useState(initial?.max_value ?? 100)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // 수식에서 사용 가능한 기호 목록 (현재 편집 중인 변수 제외)
  const availableSymbols = variables
    .filter(v => v.id !== initial?.id && v.symbol)
    .map(v => v.symbol)

  const handleCategoryChange = (newCategory) => {
    setCategory(newCategory)
    const computedTypes = ['formula', 'table', 'conditional', 'interp_table']
    if (newCategory === 'intermediate' || newCategory === 'output') {
      if (!computedTypes.includes(varType)) setVarType('formula')
    } else if (computedTypes.includes(varType)) {
      setVarType('slider')
    }
  }

  const isComputedCategory = category === 'intermediate' || category === 'output'

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('변수 이름을 입력해주세요.')
      return
    }
    const trimmedSymbol = symbol.trim()
    if (!trimmedSymbol) {
      setError('변수 기호를 입력해주세요.')
      return
    }
    // 수식 파싱에 안전한 식별자만 허용 (영문/언더스코어로 시작, 영숫자/언더스코어 조합)
    // 순수 숫자(예: "2", "123")는 수식 안의 숫자 리터럴과 충돌하므로 금지
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmedSymbol)) {
      setError('변수 기호는 영문자나 언더스코어(_)로 시작하고 영숫자·언더스코어만 사용할 수 있습니다. (예: A, B, F_a, d_i, A111)')
      return
    }
    if (RESERVED_NAMES.has(trimmedSymbol)) {
      setError(`"${trimmedSymbol}"은(는) 내장 함수 이름이라 변수 기호로 사용할 수 없습니다. 다른 이름을 사용해주세요.`)
      return
    }
    // 기호 중복 검사
    const duplicateSymbol = variables.find(
      v => v.id !== initial?.id && v.symbol === trimmedSymbol
    )
    if (duplicateSymbol) {
      setError(`기호 "${trimmedSymbol}"은(는) 이미 "${duplicateSymbol.name}" 변수에서 사용 중입니다.`)
      return
    }
    if (category === 'input' && varType === 'slider') {
      if (minValue === '' || maxValue === '') {
        setError('슬라이더의 최소/최대 값을 입력해주세요.')
        return
      }
      if (Number(minValue) >= Number(maxValue)) {
        setError('최소값은 최대값보다 작아야 합니다.')
        return
      }
    }
    if (category === 'input' && varType === 'dropdown') {
      const cleaned = options.map(o => o.trim()).filter(o => o !== '')
      if (cleaned.length === 0) {
        setError('드롭다운 옵션을 최소 1개 이상 입력해주세요.')
        return
      }
      const dupes = cleaned.filter((o, i) => cleaned.indexOf(o) !== i)
      if (dupes.length > 0) {
        setError(`중복된 옵션이 있습니다: ${dupes[0]}`)
        return
      }
    }
    if (isComputedCategory && varType === 'formula' && !formula.trim()) {
      setError('수식을 입력해주세요.')
      return
    }
    if (isComputedCategory && varType === 'table') {
      if (!tableData.columns?.length || !tableData.rows?.length) {
        setError('테이블에 최소 1개의 열과 1개의 행이 필요합니다.')
        return
      }
      const keys = tableData.keys || []
      if (keys.length === 0) {
        setError('조회 키를 1개 이상 정의해주세요.')
        return
      }
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i]
        if (!k.expression?.trim()) {
          setError(`조회 키 ${i + 1}의 수식을 입력해주세요.`)
          return
        }
        if (k.column_index === tableData.result_column_index) {
          setError(`조회 키 ${i + 1}의 열은 결과 열과 달라야 합니다.`)
          return
        }
      }
      const colSet = new Set(keys.map(k => k.column_index))
      if (colSet.size !== keys.length) {
        setError('서로 다른 열을 조회 키로 지정해주세요.')
        return
      }
    }
    if (isComputedCategory && varType === 'interp_table') {
      if (!interpData.columns?.length || !interpData.rows?.length) {
        setError('보간 테이블에 최소 1개의 열과 1개의 행이 필요합니다.')
        return
      }
      if (!interpData.x_expression?.trim()) {
        setError('보간 테이블의 x 수식을 입력해주세요.')
        return
      }
      if (interpData.x_column_index === interpData.y_column_index) {
        setError('x 열과 y 열은 서로 달라야 합니다.')
        return
      }
      const numericRows = (interpData.rows || []).filter(r => {
        const xv = Number(r?.[interpData.x_column_index])
        const yv = Number(r?.[interpData.y_column_index])
        return Number.isFinite(xv) && Number.isFinite(yv)
      })
      if (numericRows.length < 2) {
        setError('보간을 위해 (x, y)가 모두 숫자인 행이 최소 2개 필요합니다.')
        return
      }
    }
    if (isComputedCategory && varType === 'conditional') {
      const validBranches = (conditionalData.branches || []).filter(b => b.condition?.trim() && b.formula?.trim())
      if (validBranches.length === 0 && !conditionalData.default_formula?.trim()) {
        setError('최소 1개의 조건 분기 또는 else 기본 수식이 필요합니다.')
        return
      }
      const partial = (conditionalData.branches || []).find(b => (b.condition?.trim() && !b.formula?.trim()) || (!b.condition?.trim() && b.formula?.trim()))
      if (partial) {
        setError('각 분기는 조건식과 수식을 모두 채우거나 둘 다 비워야 합니다.')
        return
      }
    }

    setSaving(true)
    setError('')

    const effectiveVarType = isComputedCategory
      ? (['table', 'conditional', 'interp_table'].includes(varType) ? varType : 'formula')
      : varType

    const cleanedOptions = options.map(o => o.trim()).filter(o => o !== '')
    const cleanedConditional = {
      branches: (conditionalData.branches || []).filter(b => b.condition?.trim() || b.formula?.trim()),
      default_formula: (conditionalData.default_formula || '').trim(),
    }

    const formData = {
      name: name.trim(),
      symbol: trimmedSymbol,
      category,
      var_type: effectiveVarType,
      unit: unit.trim(),
      formula: effectiveVarType === 'formula' ? formula.trim() : '',
      table_data: effectiveVarType === 'table' ? JSON.stringify(tableData) : '',
      options_data: effectiveVarType === 'dropdown' ? JSON.stringify(cleanedOptions) : '',
      conditional_data: effectiveVarType === 'conditional' ? JSON.stringify(cleanedConditional) : '',
      interp_data: effectiveVarType === 'interp_table' ? JSON.stringify(interpData) : '',
      // container_id는 "위젯 배치" 탭에서 관리 — 여기서 보내지 않음
    }

    if (category === 'input' && varType === 'slider') {
      formData.min_value = Number(minValue)
      formData.max_value = Number(maxValue)
    }

    const err = await onSave(formData)
    if (err) {
      setError(err)
    }
    setSaving(false)
  }

  return (
    <FormWrapper>
      <FormTitle>{initial ? '변수 편집' : '새 변수 추가'}</FormTitle>

      <FormRow>
        <FormGroup>
          <Label>변수 이름</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 내경, 하중, 수명"
            autoFocus
          />
        </FormGroup>

        <FormGroup>
          <Label>변수 기호</Label>
          <Input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="예: A, B, F_a, d_i"
          />
        </FormGroup>

        <FormGroup>
          <Label>단위</Label>
          <Input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="예: mm, kN, rpm"
          />
        </FormGroup>
      </FormRow>

      <FormRow>
        <FormGroup>
          <Label>변수 구분</Label>
          <Select value={category} onChange={(e) => handleCategoryChange(e.target.value)}>
            <option value="input">Input (입력값)</option>
            <option value="intermediate">Intermediate (중간값)</option>
            <option value="output">Output (결과값)</option>
          </Select>
        </FormGroup>

        {category === 'input' ? (
          <FormGroup>
            <Label>변수 타입</Label>
            <Select value={varType} onChange={(e) => setVarType(e.target.value)}>
              <option value="slider">슬라이더</option>
              <option value="text">텍스트</option>
              <option value="dropdown">드롭다운</option>
            </Select>
          </FormGroup>
        ) : (
          <FormGroup>
            <Label>변수 타입</Label>
            <SegmentedRow>
              <SegmentBtn
                type="button"
                $active={!['table', 'conditional', 'interp_table'].includes(varType)}
                onClick={() => setVarType('formula')}
              >
                수식
              </SegmentBtn>
              <SegmentBtn
                type="button"
                $active={varType === 'table'}
                onClick={() => setVarType('table')}
              >
                테이블
              </SegmentBtn>
              <SegmentBtn
                type="button"
                $active={varType === 'interp_table'}
                onClick={() => setVarType('interp_table')}
              >
                보간 테이블
              </SegmentBtn>
              <SegmentBtn
                type="button"
                $active={varType === 'conditional'}
                onClick={() => setVarType('conditional')}
              >
                조건부
              </SegmentBtn>
            </SegmentedRow>
          </FormGroup>
        )}
        <div />
      </FormRow>

      {category === 'input' ? (
        <>
          {varType === 'slider' && (
            <RangeRow>
              <FormGroup>
                <Label>최소값 (Min)</Label>
                <Input
                  type="number"
                  value={minValue}
                  onChange={(e) => setMinValue(e.target.value)}
                />
              </FormGroup>
              <FormGroup>
                <Label>최대값 (Max)</Label>
                <Input
                  type="number"
                  value={maxValue}
                  onChange={(e) => setMaxValue(e.target.value)}
                />
              </FormGroup>
            </RangeRow>
          )}

          {varType === 'dropdown' && (
            <OptionsEditor value={options} onChange={setOptions} />
          )}
        </>
      ) : (
        <>
          {varType === 'table' ? (
            <>
              <TemplateToolbar
                varType="table"
                getCurrentData={() => JSON.stringify(tableData)}
                onLoad={(tpl) => setTableData(parseTableData(tpl.data))}
              />
              <TableEditor
                value={tableData}
                onChange={setTableData}
                availableSymbols={availableSymbols}
              />
            </>
          ) : varType === 'conditional' ? (
            <>
              <TemplateToolbar
                varType="conditional"
                getCurrentData={() => JSON.stringify(conditionalData)}
                onLoad={(tpl) => setConditionalData(parseConditional(tpl.data))}
              />
              <ConditionalEditor
                value={conditionalData}
                onChange={setConditionalData}
                availableSymbols={availableSymbols}
              />
            </>
          ) : varType === 'interp_table' ? (
            <>
              <TemplateToolbar
                varType="interp_table"
                getCurrentData={() => JSON.stringify(interpData)}
                onLoad={(tpl) => setInterpData(parseInterpData(tpl.data))}
              />
              <InterpTableEditor
                value={interpData}
                onChange={setInterpData}
                availableSymbols={availableSymbols}
              />
            </>
          ) : (
            <>
              <TemplateToolbar
                varType="formula"
                getCurrentData={() => formula}
                onLoad={(tpl) => setFormula(tpl.data || '')}
              />
              <FormGroup>
                <Label>수식 정의</Label>
                <FormulaTextarea
                  value={formula}
                  onChange={(e) => setFormula(e.target.value)}
                  placeholder="예: A + B, A * B / 2, (A + B) * C"
                />
                <FormulaHint>
                  {availableSymbols.length > 0
                    ? <>사용 가능한 기호: {availableSymbols.join(', ')}</>
                    : <>다른 변수에 기호를 정의하면 수식에서 사용할 수 있습니다.</>}
                  <br />
                  연산자: +, -, *, /, (, ), ^ (거듭제곱, 예: A^2)
                  <br />
                  함수: sin, cos, tan, asin, acos, atan, atan2, radians, degrees, pi(), abs, sqrt, log, log10, exp, pow, min(a,b,...), max(a,b,...), average(a,b,...), prob(값,평균,표준편차) — 정규분포에서 그 값 <b>이하일 확률(%)</b>
                </FormulaHint>
                {category === 'intermediate' && (
                  <FormulaHint>
                    중간값은 Input과 다른 Intermediate를 참조해 계산되며, Output 수식에서 다시 사용할 수 있습니다.
                  </FormulaHint>
                )}
              </FormGroup>
            </>
          )}
        </>
      )}

      {error && <ErrorMsg>{error}</ErrorMsg>}

      <ButtonRow>
        <CancelBtn onClick={onCancel}>취소</CancelBtn>
        <SaveBtn onClick={handleSubmit} disabled={saving}>
          {saving ? '저장 중...' : '저장'}
        </SaveBtn>
      </ButtonRow>
    </FormWrapper>
  )
}

export default VariableForm
