import React, { useState, useEffect, useMemo, useRef } from 'react'
import styled from 'styled-components'
import { RESERVED_NAMES } from '../../utils/evaluators'
import { apiFetch } from '../../api/client'
import { flattenClipboardCells } from '../../utils/clipboard'
import { MATCH_MODE_LABEL, describeRange, parseRangeHeader } from '../../utils/tableLookup'
import TableGrid, { shiftColumnIndex } from './TableGrid'


// ============================================
// Styled Components
// ============================================
const FormWrapper = styled.div`
  background: hsl(var(--surface-2));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  padding: 24px;
`

const FormTitle = styled.h3`
  font-size: 1rem;
  font-weight: 600;
  color: hsl(var(--fg));
  margin: 0 0 20px 0;
`

const FormGroup = styled.div`
  margin-bottom: 18px;
`

const Label = styled.label`
  display: block;
  font-size: 0.85rem;
  font-weight: 500;
  color: hsl(var(--fg-muted));
  margin-bottom: 6px;
`

const Input = styled.input`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  font-size: 0.9rem;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s;

  &:focus {
    border-color: hsl(var(--primary));
  }
`

const Select = styled.select`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  font-size: 0.9rem;
  outline: none;
  box-sizing: border-box;
  background: hsl(var(--surface));
  cursor: pointer;

  &:focus {
    border-color: hsl(var(--primary));
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
  border-radius: var(--radius);
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
`

const CancelBtn = styled(Button)`
  background: hsl(var(--surface-2));
  color: hsl(var(--fg-muted));
  &:hover { background: hsl(var(--border)); }
`

const SaveBtn = styled(Button)`
  background: hsl(var(--primary));
  color: white;
  &:hover { background: hsl(var(--primary)); }
  &:disabled { background: hsl(var(--primary) / 0.45); cursor: not-allowed; }
`

const ErrorMsg = styled.p`
  color: hsl(var(--danger));
  font-size: 0.85rem;
  margin: 0 0 12px 0;
`

const TypeLabel = styled.span`
  display: inline-block;
  padding: 4px 12px;
  border-radius: var(--radius);
  font-size: 0.85rem;
  background: hsl(var(--accent-soft));
  color: hsl(var(--accent));
  font-weight: 500;
`

const FormulaTextarea = styled.textarea`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  font-size: 0.9rem;
  font-family: 'Consolas', 'Monaco', monospace;
  outline: none;
  box-sizing: border-box;
  resize: vertical;
  min-height: 60px;
  transition: border-color 0.2s;

  &:focus {
    border-color: hsl(var(--accent));
  }
`

const FormulaHint = styled.p`
  font-size: 0.78rem;
  color: hsl(var(--fg-subtle));
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
  border: 1px solid ${p => p.$active ? 'hsl(var(--primary))' : 'hsl(var(--border))'};
  background: ${p => p.$active ? 'hsl(var(--primary))' : 'white'};
  color: ${p => p.$active ? 'white' : 'hsl(var(--fg-muted))'};
  border-radius: var(--radius);
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  &:hover { border-color: hsl(var(--primary)); }
`

// 표 **위**에 놓는다(요구사항). 라벨 → 버튼 → 표 순서라 표를 눈으로 훑고
// 내려가지 않아도 버튼이 먼저 보인다.
const SmallBtn = styled.button`
  padding: 6px 12px;
  border: 1px dashed hsl(var(--border-strong));
  background: hsl(var(--surface));
  color: hsl(var(--fg-muted));
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  cursor: pointer;
  &:hover { border-color: hsl(var(--primary)); color: hsl(var(--primary)); }
`

// 표 참조 상태 배너. 원본이 있다는 사실과, 여기서 고치면 어디까지 퍼지는지를
// 항상 눈에 보이게 둔다 — 참조는 편한 만큼 사고도 멀리 퍼진다.
const RefBanner = styled.div`
  border: 1px solid ${p => (p.$error ? 'hsl(var(--danger-border))' : 'hsl(var(--primary) / 0.45)')};
  background: ${p => (p.$error ? 'hsl(var(--danger-soft))' : 'hsl(var(--info-soft))')};
  border-radius: var(--radius);
  padding: 10px 12px;
  margin-bottom: 12px;
  font-size: 0.82rem;
  color: ${p => (p.$error ? 'hsl(var(--danger))' : 'hsl(var(--primary))')};
  line-height: 1.5;
`

const RefBannerRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
`

const RefName = styled.strong`
  font-weight: 700;
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
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.85rem;
  outline: none;
  box-sizing: border-box;
  &:focus { border-color: hsl(var(--primary)); }
`

const OptionRow = styled.div`
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
`

const OptionRemoveBtn = styled.button`
  width: 32px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--surface));
  color: hsl(var(--border-strong));
  cursor: pointer;
  border-radius: var(--radius);
  font-size: 0.9rem;
  &:hover { background: hsl(var(--danger-soft)); color: hsl(var(--danger)); border-color: hsl(var(--danger-soft)); }
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
  color: hsl(var(--fg-subtle));
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
  color: hsl(var(--fg-muted));
  font-weight: 500;
  white-space: nowrap;
`

const CondInput = styled.input`
  width: 100%;
  padding: 8px 10px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.85rem;
  outline: none;
  box-sizing: border-box;
  &:focus { border-color: hsl(var(--primary)); }
`

const DefaultRow = styled.div`
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding-top: 10px;
  border-top: 1px dashed hsl(var(--border));
`

const TemplateBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  padding: 8px 10px;
  background: hsl(var(--surface-2));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
`

const TemplateBarLabel = styled.span`
  font-size: 0.8rem;
  font-weight: 600;
  color: hsl(var(--fg-muted));
  margin-right: 4px;
`

const TemplateBtn = styled.button`
  padding: 5px 12px;
  border: 1px solid hsl(var(--border-strong));
  background: hsl(var(--surface));
  color: hsl(var(--fg-muted));
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  cursor: pointer;
  &:hover { border-color: hsl(var(--primary)); color: hsl(var(--primary)); }
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
  background: hsl(var(--surface));
  border-radius: var(--radius-lg);
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
  border-bottom: 1px solid hsl(var(--border));
  flex-shrink: 0;
`

const TplTitle = styled.h2`
  font-size: 1.1rem;
  font-weight: 600;
  color: hsl(var(--fg));
  margin: 0;
`

const TplCloseBtn = styled.button`
  background: none;
  border: none;
  font-size: 1.4rem;
  color: hsl(var(--fg-subtle));
  cursor: pointer;
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  &:hover { background: hsl(var(--bg)); color: hsl(var(--fg)); }
`

const TplSearchRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 24px;
  border-bottom: 1px solid hsl(var(--bg));
  flex-shrink: 0;
`

const TplSearchInput = styled.input`
  flex: 1;
  padding: 10px 14px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  font-size: 0.95rem;
  outline: none;
  &:focus { border-color: hsl(var(--primary)); }
`

const TplCount = styled.span`
  font-size: 0.8rem;
  color: hsl(var(--fg-subtle));
  white-space: nowrap;
`

const TplListBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 8px 14px;
  background: hsl(var(--surface-2));
`

const TplCard = styled.div`
  background: hsl(var(--surface));
  border: 1px solid hsl(var(--surface-2));
  border-radius: var(--radius);
  padding: 12px 14px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: border-color 0.12s, box-shadow 0.12s;
  &:hover {
    border-color: hsl(var(--primary));
    border: 1px solid hsl(var(--border));
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
  color: hsl(var(--fg));
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
  color: hsl(var(--fg-muted));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const TplCardDate = styled.span`
  font-size: 0.72rem;
  color: hsl(var(--fg-subtle));
`

const TplDeleteBtn = styled.button`
  background: none;
  border: 1px solid transparent;
  color: hsl(var(--border-strong));
  cursor: pointer;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  flex-shrink: 0;
  &:hover { background: hsl(var(--danger-soft)); color: hsl(var(--danger)); border-color: hsl(var(--danger-soft)); }
`

const TplEmpty = styled.div`
  padding: 60px 20px;
  text-align: center;
  color: hsl(var(--border-strong));
  font-size: 0.95rem;
`

const TplSaveRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 24px;
  border-top: 1px solid hsl(var(--border));
  background: hsl(var(--surface-2));
  flex-shrink: 0;
`

const TplSaveLabel = styled.span`
  font-size: 0.85rem;
  font-weight: 600;
  color: hsl(var(--fg-muted));
  white-space: nowrap;
`

const TplNameInput = styled.input`
  flex: 1;
  padding: 8px 12px;
  border: 1px solid hsl(var(--border-strong));
  border-radius: var(--radius);
  font-size: 0.9rem;
  outline: none;
  &:focus { border-color: hsl(var(--primary)); }
`

const TplSaveBtn = styled.button`
  padding: 8px 18px;
  border: none;
  background: hsl(var(--primary));
  color: white;
  border-radius: var(--radius);
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  &:hover { background: hsl(var(--primary)); }
  &:disabled { background: hsl(var(--primary) / 0.45); cursor: not-allowed; }
`

const TplOverflowHint = styled.div`
  text-align: center;
  padding: 10px;
  font-size: 0.78rem;
  color: hsl(var(--fg-subtle));
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

/**
 * 템플릿을 참조 상태의 편집기 값으로.
 *
 * 열·행은 원본에서 그대로 가져오되 `source_template_id` 를 달아 둔다. 저장할 때
 * 서버가 이 표시를 보고 사본(열·행)을 떼어 내므로, 이후에는 원본만 바뀌면 된다.
 * 조회 키와 결과 열은 변수마다 다르니 비운 채로 시작한다.
 */
function referenceTableData(tpl) {
  const source = parseTableData(tpl.data)
  return {
    source_template_id: tpl.id,
    source_name: tpl.name,
    columns: source.columns,
    rows: source.rows,
    result_column_index: 0,
    keys: [],
  }
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

  // 엑셀 등에서 여러 셀(가로·세로 무관)을 붙여넣으면 옵션을 일괄 추가.
  // 한 셀만 복사한 경우는 가로채지 않는다 — 브라우저 기본 붙여넣기가 맞다.
  const handlePaste = (idx, e) => {
    const cells = flattenClipboardCells(e.clipboardData?.getData('text'))
    if (!cells) return
    e.preventDefault()
    const next = [...options]
    next.splice(idx, 1, ...cells)
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
// 표 조회 설정 — 행 / 열 / 행열(교차)
// ============================================
const LOOKUP_MODES = [
  {
    key: 'row',
    label: '행 조회',
    help: '조회 열의 값으로 행을 고르고, 정해 둔 결과 열의 값을 꺼냅니다. 한 행이 한 항목인 보통의 세로 표.',
  },
  {
    key: 'column',
    label: '열 조회',
    help: '조회 행의 값으로 열을 고르고, 정해 둔 결과 행의 값을 꺼냅니다. 항목이 가로로 누운 표.',
  },
  {
    key: 'cell',
    label: '행열 조회',
    help: '행과 열을 모두 골라 만나는 칸의 값을 꺼냅니다. 행 머리글과 열 머리글이 있는 행렬표 — 펼쳐 적을 필요가 없습니다.',
  },
]

// 행/열 조회는 표 안의 값과 맞추므로 보간이 성립하지 않는다(값 하나를 고르는
// 일이라 중간값이 없다). 교차 조회의 축 매칭만 보간·범위를 갖는다.
const ROW_MATCH_MODES = ['exact', 'nearest', 'floor', 'ceiling', 'range']
const AXIS_MATCH_MODES = ['exact', 'nearest', 'floor', 'ceiling', 'interpolate', 'range']

const RangeNote = styled.div`
  font-size: 0.75rem;
  color: hsl(var(--fg-subtle));
  background: hsl(var(--surface-2));
  border: 1px solid hsl(var(--surface-2));
  border-radius: var(--radius-sm);
  padding: 7px 10px;
  margin: 4px 0 8px 0;
  line-height: 1.6;
`

const RangeBad = styled.span`
  color: hsl(var(--danger));
`

/**
 * 범위 머리글을 **어떻게 읽었는지 되비춘다.**
 *
 * `10~20` 같은 표기는 사람마다 다르게 쓴다. 자동으로 읽고 조용히 넘어가면 잘못
 * 읽고도 값이 나오는데, 그게 제일 찾기 어려운 오류다. 읽은 결과를 그대로
 * 보여 주면 틀렸을 때 사람이 바로 본다.
 */
function RangePreview({ show, headers }) {
  if (!show) return null
  const list = (headers || []).filter(h => String(h ?? '').trim() !== '')
  if (list.length === 0) return null
  return (
    <RangeNote>
      읽은 구간:{' '}
      {list.map((h, i) => {
        const parsed = parseRangeHeader(h)
        return (
          <React.Fragment key={i}>
            {i > 0 && ' · '}
            <b>{String(h)}</b>
            {' → '}
            {parsed ? describeRange(parsed) : <RangeBad>읽을 수 없음</RangeBad>}
          </React.Fragment>
        )
      })}
    </RangeNote>
  )
}

// ============================================
// Table editor sub-component
// ============================================
function TableEditor({ value, onChange, availableSymbols }) {
  const data = value

  const lookupMode = data.lookup_mode || 'row'

  // 조회 방식을 바꾸면 그 방식이 쓰는 칸만 채워 둔다. 다른 방식의 설정은 지우지
  // 않는다 — 잘못 눌렀다가 되돌릴 때 다시 입력하게 되면 성가시다.
  const setLookupMode = (mode) => {
    const patch = { lookup_mode: mode }
    if (mode === 'row' && !data.keys?.length) {
      patch.keys = [{ column_index: 0, expression: '', match_mode: 'exact' }]
    }
    if (mode === 'column') {
      if (data.label_column_index == null) patch.label_column_index = 0
      if (!data.keys?.length) patch.keys = [{ row_label: '', expression: '', match_mode: 'exact' }]
    }
    if (mode === 'cell') {
      if (data.row_header_index == null) patch.row_header_index = 0
      if (!data.row_lookup) patch.row_lookup = { expression: '', match_mode: 'exact' }
      if (!data.column_lookup) patch.column_lookup = { expression: '', match_mode: 'exact' }
    }
    set(patch)
  }

  // 누운 표에서 각 행의 이름 — "항목 이름이 든 열"의 값들.
  const rowLabels = (data.rows || []).map(r => String(r[data.label_column_index ?? 0] ?? ''))
  const valuesOfRow = (label) => {
    const idx = rowLabels.indexOf(String(label ?? ''))
    if (idx < 0) return []
    return (data.rows[idx] || []).filter((_, i) => i !== (data.label_column_index ?? 0))
  }

  // 표 참조 — 열·행은 원본(템플릿)에서 오고, 조회 키와 결과 열만 이 변수의 것이다.
  const isRef = data.source_template_id != null
  const [editingSource, setEditingSource] = useState(false)
  const [usage, setUsage] = useState(null)
  const [refMsg, setRefMsg] = useState('')
  // 참조 중에는 데이터를 못 고친다. "원본 편집" 을 눌러야 열린다 — 무심코 고쳐서
  // 다른 변수까지 바뀌는 일을 막는다.
  const locked = isRef && !editingSource

  const startEditingSource = async () => {
    setRefMsg('')
    try {
      const res = await apiFetch(`/templates/${data.source_template_id}/usage`)
      if (res.ok) {
        const body = await res.json()
        setUsage(body.users.length)
        if (body.users.length > 1) {
          const others = body.users.length - 1
          if (!window.confirm(
            `이 표는 다른 변수 ${others}개도 함께 쓰고 있습니다.` +
            '\n여기서 고치면 그 변수들의 계산 결과도 함께 바뀝니다. 계속할까요?'
          )) return
        }
      }
    } catch { /* 사용처를 못 읽어도 편집 자체는 막지 않는다 */ }
    setEditingSource(true)
  }

  const saveSource = async () => {
    setRefMsg('')
    try {
      const res = await apiFetch(`/templates/${data.source_template_id}`, {
        method: 'PUT',
        body: JSON.stringify({ data: JSON.stringify({ columns: data.columns, rows: data.rows }) }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setRefMsg(body.error || '원본 저장 실패')
        return
      }
      setEditingSource(false)
      setRefMsg('원본 표를 저장했습니다. 이 표를 참조하는 변수에 모두 반영됩니다.')
    } catch {
      setRefMsg('서버 통신 실패')
    }
  }

  const detach = () => {
    if (!window.confirm(
      '참조를 풀고 지금 내용을 이 변수만의 복사본으로 만듭니다.' +
      '\n이후에는 원본을 고쳐도 여기에 반영되지 않습니다. 계속할까요?'
    )) return
    const { source_template_id, source_name, source_error, ...rest } = data
    onChange(rest)
  }


  const set = (patch) => onChange({ ...data, ...patch })

  const renameColumn = (idx, name) => {
    const cols = data.columns.map((c, i) => i === idx ? name : c)
    set({ columns: cols })
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

  return (
    <>
      {isRef && (
        <RefBanner $error={Boolean(data.source_error)}>
          {data.source_error ? (
            <>⚠ {data.source_error}</>
          ) : (
            <>
              📎 <RefName>{data.source_name || '저장된 표'}</RefName> 를 참조하고 있습니다.
              열과 행은 원본에서 옵니다 — 원본을 고치면 이 표를 쓰는 변수가 모두 함께 바뀝니다.
              조회 키와 결과 열은 이 변수만의 설정입니다.
              {usage != null && usage > 1 && <> (지금 {usage}개 변수가 이 표를 씁니다)</>}
            </>
          )}
          <RefBannerRow>
            {editingSource ? (
              <>
                <SmallBtn type="button" onClick={saveSource}>원본에 저장</SmallBtn>
                <SmallBtn type="button" onClick={() => setEditingSource(false)}>편집 취소</SmallBtn>
              </>
            ) : (
              <SmallBtn type="button" onClick={startEditingSource}>원본 표 편집</SmallBtn>
            )}
            <SmallBtn type="button" onClick={detach}>참조 해제 (복사본으로)</SmallBtn>
          </RefBannerRow>
          {refMsg && <div style={{ marginTop: 8 }}>{refMsg}</div>}
        </RefBanner>
      )}

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
                disabled={locked}
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
        <TableGrid
          value={data}
          readOnly={locked}
          onChange={(next, meta) => {
            // 열을 지우면 조회 키·결과 열이 가리키던 번호가 밀린다. 그리드는
            // 그 사정을 모르므로 여기서 맞춘다.
            if (meta?.type === 'removeColumn') {
              const shift = (i) => shiftColumnIndex(i, meta.index)
              set({
                ...next,
                result_column_index: shift(data.result_column_index),
                keys: (data.keys || []).map(k => ({ ...k, column_index: shift(k.column_index) })),
              })
              return
            }
            set(next)
          }}
        />
      </FormGroup>

      <FormGroup>
        <Label>조회 방식</Label>
        <SegmentedRow>
          {LOOKUP_MODES.map(m => (
            <SegmentBtn
              key={m.key}
              type="button"
              $active={lookupMode === m.key}
              onClick={() => setLookupMode(m.key)}
              title={m.help}
            >
              {m.label}
            </SegmentBtn>
          ))}
        </SegmentedRow>
        <FormulaHint>
          {LOOKUP_MODES.find(m => m.key === lookupMode)?.help}
        </FormulaHint>
      </FormGroup>

      {lookupMode === 'row' && (
        <>
          <FormGroup>
            <Label>결과 열 (Result)</Label>
            <Select
              value={data.result_column_index ?? 0}
              onChange={(e) => set({ result_column_index: Number(e.target.value) })}
            >
              {data.columns.map((c, i) => (
                <option key={i} value={i}>{c || `열 ${i + 1}`}</option>
              ))}
            </Select>
          </FormGroup>

          <FormGroup>
            <Label>조회 열 (Keys)</Label>
            {(data.keys || []).map((k, i) => (
              <div key={i}>
                <KeyRow>
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
                    {ROW_MATCH_MODES.map(m => (
                      <option key={m} value={m}>{MATCH_MODE_LABEL[m]}</option>
                    ))}
                  </Select>
                  <OptionRemoveBtn type="button" onClick={() => removeKey(i)} title="조회 열 삭제">✕</OptionRemoveBtn>
                </KeyRow>
                <RangePreview
                  show={k.match_mode === 'range'}
                  headers={data.rows.map(r => r[k.column_index])}
                />
              </div>
            ))}
            <SmallBtn type="button" onClick={addKey} style={{ marginTop: 4 }}>+ 조회 열 추가</SmallBtn>
            <FormulaHint>
              여러 조회 열을 정의하면 모든 조건이 동시에 맞는 행(AND)을 찾습니다. 예) "직경(가장 가까운 값) AND 재질(정확히 일치)".
              {' '}동점이면 거리 합이 가장 작은 행이 선택됩니다.
              {availableSymbols.length > 0 && <> 사용 가능한 기호: {availableSymbols.join(', ')}</>}
            </FormulaHint>
          </FormGroup>
        </>
      )}

      {lookupMode === 'column' && (
        <>
          <FormGroup>
            <Label>항목 이름이 든 열</Label>
            <Select
              value={data.label_column_index ?? 0}
              onChange={(e) => set({ label_column_index: Number(e.target.value) })}
            >
              {data.columns.map((c, i) => (
                <option key={i} value={i}>{c || `열 ${i + 1}`}</option>
              ))}
            </Select>
            <FormulaHint>
              누운 표에서는 각 <b>행</b>이 하나의 항목입니다. 그 이름(예: 재료, 항복강도)이 들어 있는 열을 고르세요.
            </FormulaHint>
          </FormGroup>

          <FormGroup>
            <Label>결과 행 (Result)</Label>
            <Select
              value={data.result_row_label ?? ''}
              onChange={(e) => set({ result_row_label: e.target.value })}
            >
              <option value="">선택하세요</option>
              {rowLabels.map((label, i) => (
                <option key={i} value={label}>{label || `행 ${i + 1}`}</option>
              ))}
            </Select>
          </FormGroup>

          <FormGroup>
            <Label>조회 행 (Keys)</Label>
            {(data.keys || []).map((k, i) => (
              <div key={i}>
                <KeyRow>
                  <Select
                    value={k.row_label ?? ''}
                    onChange={(e) => updateKey(i, { row_label: e.target.value })}
                  >
                    <option value="">선택하세요</option>
                    {rowLabels.map((label, ri) => (
                      <option key={ri} value={label}>{label || `행 ${ri + 1}`}</option>
                    ))}
                  </Select>
                  <KeyExprInput
                    value={k.expression}
                    onChange={(e) => updateKey(i, { expression: e.target.value })}
                    placeholder="조회 수식 (예: A, mat)"
                  />
                  <Select
                    value={k.match_mode}
                    onChange={(e) => updateKey(i, { match_mode: e.target.value })}
                  >
                    {ROW_MATCH_MODES.map(m => (
                      <option key={m} value={m}>{MATCH_MODE_LABEL[m]}</option>
                    ))}
                  </Select>
                  <OptionRemoveBtn type="button" onClick={() => removeKey(i)} title="조회 행 삭제">✕</OptionRemoveBtn>
                </KeyRow>
                <RangePreview
                  show={k.match_mode === 'range'}
                  headers={valuesOfRow(k.row_label)}
                />
              </div>
            ))}
            <SmallBtn type="button" onClick={addKey} style={{ marginTop: 4 }}>+ 조회 행 추가</SmallBtn>
            <FormulaHint>
              조회 행의 값들과 맞춰 <b>열</b>을 고르고, 그 열에서 결과 행의 값을 꺼냅니다.
              {availableSymbols.length > 0 && <> 사용 가능한 기호: {availableSymbols.join(', ')}</>}
            </FormulaHint>
          </FormGroup>
        </>
      )}

      {lookupMode === 'cell' && (
        <>
          <FormGroup>
            <Label>행 머리글이 든 열</Label>
            <Select
              value={data.row_header_index ?? 0}
              onChange={(e) => set({ row_header_index: Number(e.target.value) })}
            >
              {data.columns.map((c, i) => (
                <option key={i} value={i}>{c || `열 ${i + 1}`}</option>
              ))}
            </Select>
            <FormulaHint>
              보통 맨 왼쪽 열입니다. 나머지 열의 <b>머리글</b>이 다른 한 축이 됩니다.
              결과는 두 축이 만나는 칸의 값입니다 — 결과 열을 따로 고르지 않습니다.
            </FormulaHint>
          </FormGroup>

          <FormGroup>
            <Label>행 조회 (세로 축)</Label>
            <KeyRow>
              <KeyExprInput
                value={data.row_lookup?.expression ?? ''}
                onChange={(e) => set({ row_lookup: { ...(data.row_lookup || {}), expression: e.target.value } })}
                placeholder="조회 수식 (예: mat)"
              />
              <Select
                value={data.row_lookup?.match_mode ?? 'exact'}
                onChange={(e) => set({ row_lookup: { ...(data.row_lookup || {}), match_mode: e.target.value } })}
              >
                {AXIS_MATCH_MODES.map(m => (
                  <option key={m} value={m}>{MATCH_MODE_LABEL[m]}</option>
                ))}
              </Select>
            </KeyRow>
            <RangePreview
              show={data.row_lookup?.match_mode === 'range'}
              headers={data.rows.map(r => r[data.row_header_index ?? 0])}
            />
          </FormGroup>

          <FormGroup>
            <Label>열 조회 (가로 축)</Label>
            <KeyRow>
              <KeyExprInput
                value={data.column_lookup?.expression ?? ''}
                onChange={(e) => set({ column_lookup: { ...(data.column_lookup || {}), expression: e.target.value } })}
                placeholder="조회 수식 (예: t)"
              />
              <Select
                value={data.column_lookup?.match_mode ?? 'exact'}
                onChange={(e) => set({ column_lookup: { ...(data.column_lookup || {}), match_mode: e.target.value } })}
              >
                {AXIS_MATCH_MODES.map(m => (
                  <option key={m} value={m}>{MATCH_MODE_LABEL[m]}</option>
                ))}
              </Select>
            </KeyRow>
            <RangePreview
              show={data.column_lookup?.match_mode === 'range'}
              headers={data.columns.filter((_, i) => i !== (data.row_header_index ?? 0))}
            />
            <FormulaHint>
              축마다 매칭 방법을 따로 고를 수 있습니다. 예) 재료는 <b>정확히 일치</b>, 두께는 <b>사이값 보간</b>.
              {' '}두 축 모두 보간이면 네 모서리를 섞는 쌍선형 보간이 됩니다.
              {availableSymbols.length > 0 && <> 사용 가능한 기호: {availableSymbols.join(', ')}</>}
            </FormulaHint>
          </FormGroup>
        </>
      )}
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
        <TableGrid
          value={data}
          minColumns={2}
          hint=""
          onChange={(next, meta) => {
            // x·y 열은 번호로 지정돼 있다. 열이 사라지면 그 번호도 밀어야 한다.
            if (meta?.type === 'removeColumn') {
              const shift = (i) => shiftColumnIndex(i, meta.index)
              set({
                ...next,
                x_column_index: shift(data.x_column_index),
                y_column_index: shift(data.y_column_index),
              })
              return
            }
            set(next)
          }}
        />
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

function TemplateModal({ varType, getCurrentData, onLoad, onReference, onClose, initialMode = 'load' }) {
  // 'reference' 는 표를 **연결**한다(원본을 고치면 따라 바뀐다).
  // 'load' 는 내용을 복사해 온다(이후 원본과 무관해진다).
  const isReferenceMode = initialMode === 'reference'
  const [deleteError, setDeleteError] = useState('')
  const [templates, setTemplates] = useState([])
  const [search, setSearch] = useState('')
  const [tplName, setTplName] = useState('')
  const [busy, setBusy] = useState(false)
  const searchRef = useRef(null)
  const nameRef = useRef(null)

  const fetchTemplates = async () => {
    try {
      const res = await apiFetch(`/templates?var_type=${encodeURIComponent(varType)}`)
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
      const res = await apiFetch(`/templates`, {
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
    setDeleteError('')
    try {
      const res = await apiFetch(`/templates/${tpl.id}`, { method: 'DELETE' })
      if (!res.ok) {
        // 참조 중이면 서버가 막는다. 그 사실을 화면에 보여 주지 않으면
        // "삭제를 눌렀는데 그대로" 로만 보인다.
        const body = await res.json().catch(() => ({}))
        setDeleteError(body.error || '삭제하지 못했습니다.')
        return
      }
      fetchTemplates()
    } catch {
      setDeleteError('서버 통신 실패')
    }
  }

  const handleLoad = (tpl) => {
    if (isReferenceMode) onReference(tpl)
    else onLoad(tpl)
    onClose()
  }

  return (
    <TplOverlay onClick={onClose}>
      <TplModal onClick={(e) => e.stopPropagation()}>
        <TplHeader>
          <TplTitle>
            {TYPE_LABEL[varType] || ''} 템플릿
            {isReferenceMode && ' — 참조할 표 고르기'}
          </TplTitle>
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

        {deleteError && (
          <RefBanner $error style={{ margin: '0 0 10px 0' }}>{deleteError}</RefBanner>
        )}

        <TplListBody>
          {filtered.length === 0 ? (
            <TplEmpty>
              {templates.length === 0 ? '저장된 템플릿이 없습니다. 아래에서 현재 정의를 저장해보세요.' : '검색 결과가 없습니다.'}
            </TplEmpty>
          ) : (
            <>
              {visible.map(tpl => (
                <TplCard
                  key={tpl.id}
                  onClick={() => handleLoad(tpl)}
                  title={isReferenceMode ? '클릭해서 참조 연결' : '클릭해서 불러오기(복사)'}
                >
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

function TemplateToolbar({ varType, getCurrentData, onLoad, onReference }) {
  const [open, setOpen] = useState(null)  // null | 'load' | 'save' | 'reference'
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
        {onReference && (
          <TemplateBtn type="button" onClick={() => setOpen('reference')} title="원본을 고치면 함께 바뀝니다">
            🔗 표 참조
          </TemplateBtn>
        )}
      </TemplateBar>
      {open && (
        <TemplateModal
          varType={varType}
          getCurrentData={getCurrentData}
          onLoad={onLoad}
          onReference={onReference}
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
      const mode = tableData.lookup_mode || 'row'

      if (mode === 'cell') {
        // 교차 조회는 결과 열을 고르지 않는다 — 두 축이 만나는 칸이 결과다.
        if (!tableData.row_lookup?.expression?.trim()) {
          setError('행 조회 수식을 입력해주세요.')
          return
        }
        if (!tableData.column_lookup?.expression?.trim()) {
          setError('열 조회 수식을 입력해주세요.')
          return
        }
        if (tableData.columns.length < 2) {
          setError('행열 조회에는 행 머리글 열 외에 값 열이 최소 1개 필요합니다.')
          return
        }
      } else if (mode === 'column') {
        if (!tableData.result_row_label) {
          setError('결과 행을 골라주세요.')
          return
        }
        const keys = tableData.keys || []
        if (keys.length === 0) {
          setError('조회 행을 1개 이상 정의해주세요.')
          return
        }
        for (let i = 0; i < keys.length; i++) {
          if (!keys[i].row_label) {
            setError(`조회 행 ${i + 1}을(를) 골라주세요.`)
            return
          }
          if (!keys[i].expression?.trim()) {
            setError(`조회 행 ${i + 1}의 수식을 입력해주세요.`)
            return
          }
          if (keys[i].row_label === tableData.result_row_label) {
            setError(`조회 행 ${i + 1}은(는) 결과 행과 달라야 합니다.`)
            return
          }
        }
        if (new Set(keys.map(k => k.row_label)).size !== keys.length) {
          setError('서로 다른 행을 조회 행으로 지정해주세요.')
          return
        }
      } else {
        const keys = tableData.keys || []
        if (keys.length === 0) {
          setError('조회 열을 1개 이상 정의해주세요.')
          return
        }
        for (let i = 0; i < keys.length; i++) {
          const k = keys[i]
          if (!k.expression?.trim()) {
            setError(`조회 열 ${i + 1}의 수식을 입력해주세요.`)
            return
          }
          if (k.column_index === tableData.result_column_index) {
            setError(`조회 열 ${i + 1}은(는) 결과 열과 달라야 합니다.`)
            return
          }
        }
        if (new Set(keys.map(k => k.column_index)).size !== keys.length) {
          setError('서로 다른 열을 조회 열로 지정해주세요.')
          return
        }
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
              <option value="array">배열 (여러 값)</option>
            </Select>
            {/* 입력값에는 계산 타입이 없다. 구분을 바꾸면 타입 칸이 셀렉트에서
                버튼 줄로 바뀌는데, 그 사실을 모르면 "테이블이 없어졌다" 로 보인다. */}
            <FormulaHint>
              수식 · 테이블 · 보간 테이블 · 조건부는 계산 결과라, 변수 구분을
              <strong> 중간값</strong>이나 <strong>결과값</strong>으로 바꾸면 고를 수 있습니다.
            </FormulaHint>
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

          {varType === 'array' && (
            <FormGroup>
              <FormulaHint>
                값을 여러 개 담는 변수입니다. 카드 화면에서 쉼표로 구분해 넣거나
                엑셀에서 복사해 붙여넣습니다.
                <br />
                수식에서는 함수로 다룹니다 — 집계: <b>sum, average, min, max, count</b>,
                {' '}원소별 계산: <b>add, sub, mul, div</b>, 꺼내기: <b>at(배열, 번째)</b>.
                <br />
                <b>sin, cos, sqrt, abs, log, exp</b> 같은 수학 함수도 배열을 주면
                {' '}원소마다 걸립니다.
                <br />
                예) <b>{'sum(L)'}</b>, <b>{'average(L)'}</b>, <b>{'max(mul(L, W))'}</b>,
                {' '}<b>{'sin(radians(A))'}</b> — 원소별 결과는 다시 배열이 됩니다.
                <br />
                배열에 <b>+ - * /</b> 를 직접 쓰면 막습니다. 자바스크립트에서 그 연산이
                엉뚱한 문자열을 만들어 조용히 틀린 값이 되기 때문입니다.
              </FormulaHint>
            </FormGroup>
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
                onReference={(tpl) => setTableData(referenceTableData(tpl))}
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
                  placeholder={'예: A + B, A * B / 2, (A + B) * C, "재료: " + name'}
                />
                <FormulaHint>
                  {availableSymbols.length > 0
                    ? <>사용 가능한 기호: {availableSymbols.join(', ')}</>
                    : <>다른 변수에 기호를 정의하면 수식에서 사용할 수 있습니다.</>}
                  <br />
                  연산자: +, -, *, /, (, ), ^ (거듭제곱, 예: A^2)
                  <br />
                  문자열: 큰따옴표로 감싸고 <b>+</b> 로 잇습니다. 예: {'"두께 " + t + "mm"'} → 두께 12mm
                  {' '}(한쪽이라도 숫자가 아니면 더하기가 아니라 잇기가 됩니다)
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
