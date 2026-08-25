import React, { useState, useCallback } from 'react'
import styled from 'styled-components'
import { ReactGridLayout, WidthProvider } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import AuthedImage from './AuthedImage'
import { groupByContainer, unplaced } from '../utils/placements'
import { flattenClipboardCells } from '../utils/clipboard'
import ArrayResult from './ArrayResult'
import { calculateCard, defaultInputValue } from '../utils/calcEngine'
import { fromDeclared, hasChoices, toDeclared } from '../utils/unitConvert'

const ResponsiveGridLayout = WidthProvider(ReactGridLayout)

// ============================================
// Styled Components
// ============================================
const GridWrapper = styled.div`
  .react-grid-item {
    transition: all 200ms ease;
  }
  .react-grid-item.react-draggable-dragging {
    z-index: 100;
    opacity: 0.9;
    box-shadow: 0 8px 32px rgba(0,0,0,0.18);
  }
  .react-grid-placeholder {
    background: hsl(var(--primary)) !important;
    opacity: 0.15 !important;
    border-radius: var(--radius);
  }
  .react-resizable-handle::after {
    border-right-color: ${props => props.$editMode ? 'hsl(var(--primary))' : 'transparent'} !important;
    border-bottom-color: ${props => props.$editMode ? 'hsl(var(--primary))' : 'transparent'} !important;
  }
`

const ContainerBox = styled.div`
  background: hsl(var(--surface));
  border-radius: var(--radius);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  padding: 20px 24px;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: ${props => props.$editMode ? '2px dashed hsl(var(--primary) / 0.2)' : '2px solid transparent'};
  transition: border-color 0.2s;
`

const ContainerTitle = styled.h2`
  font-size: 1.05rem;
  font-weight: 600;
  color: hsl(var(--fg));
  margin: 0 0 16px 0;
  padding-bottom: 10px;
  border-bottom: 2px solid hsl(var(--surface-2));
  cursor: ${props => props.$editMode ? 'grab' : 'default'};
  flex-shrink: 0;
  user-select: none;

  &:active { cursor: ${props => props.$editMode ? 'grabbing' : 'default'}; }
`

const ContainerContent = styled.div`
  flex: 1;
  overflow-y: auto;
  min-height: 0;

  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-thumb {
    background: hsl(var(--border));
    border-radius: var(--radius-sm);
  }

  ${props => props.$columns > 1 && `
    display: grid;
    grid-template-columns: repeat(${props.$columns}, minmax(0, 1fr));
    column-gap: 20px;
    align-content: start;
  `}
`

const ImageArea = styled.div`
  padding: 4px 4px 8px;
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const ImageBlock = styled.div`
  img {
    display: block;
    width: 100%;
    height: auto;
    border-radius: var(--radius);
    background: hsl(var(--surface-2));
  }
`

const VarRow = styled.div`
  margin-bottom: 16px;
  &:last-child { margin-bottom: 0; }
`

const LabelRow = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 6px;
`

const VarLabel = styled.label`
  font-size: 0.88rem;
  font-weight: 500;
  color: hsl(var(--fg-muted));
`

const SymbolHint = styled.span`
  font-size: 0.78rem;
  color: hsl(var(--accent));
  font-family: 'Consolas', 'Monaco', monospace;
  margin-left: 4px;
`

const UnitText = styled.span`
  font-size: 0.78rem;
  color: hsl(var(--fg-subtle));
`

const SliderWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`

const SliderColumn = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
`

const Slider = styled.input`
  width: 100%;
  -webkit-appearance: none;
  appearance: none;
  height: 6px;
  border-radius: var(--radius-sm);
  background: hsl(var(--border));
  outline: none;

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: hsl(var(--primary));
    cursor: pointer;
  }
  &::-webkit-slider-thumb:hover { background: hsl(var(--primary)); }
  &::-moz-range-thumb {
    width: 18px; height: 18px;
    border-radius: 50%;
    background: hsl(var(--primary));
    cursor: pointer;
    border: none;
  }
`

const SliderValue = styled.div`
  min-width: 72px;
  text-align: right;
  font-size: 0.9rem;
  font-weight: 600;
  color: hsl(var(--fg));
`

const SliderRange = styled.div`
  display: flex;
  justify-content: space-between;
  margin-top: 3px;
  font-size: 0.72rem;
  color: hsl(var(--border-strong));
`

const TextInputWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const TextInput = styled.input`
  flex: 1;
  padding: 8px 10px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  font-size: 0.9rem;
  outline: none;
  box-sizing: border-box;
  &:focus { border-color: hsl(var(--primary)); }
`

const DropdownSelect = styled.select`
  flex: 1;
  padding: 8px 10px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  font-size: 0.9rem;
  outline: none;
  box-sizing: border-box;
  background: hsl(var(--surface));
  cursor: pointer;
  &:focus { border-color: hsl(var(--primary)); }
`

/**
 * 단위 고르는 칸.
 *
 * 글자로만 적혀 있던 자리를 고를 수 있는 칸으로 바꾼다. 고를 것이 하나뿐인
 * 변수(단위를 안 적었거나 무차원)는 예전처럼 글자로만 둔다 — 못 고르는
 * 드롭다운은 누를 수 있는 것처럼 보여서 헷갈리게만 한다.
 */
const UnitSelect = styled.select`
  padding: 6px 4px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  font-size: 0.82rem;
  color: hsl(var(--fg-muted));
  background: hsl(var(--surface-2));
  cursor: pointer;
  outline: none;
  min-width: 62px;
  &:focus { border-color: hsl(var(--primary)); }
`

const InputUnit = styled.span`
  font-size: 0.85rem;
  color: hsl(var(--fg-muted));
  font-weight: 500;
  min-width: 28px;
`

const CalculateBtn = styled.button`
  width: 100%;
  padding: 10px;
  margin-top: 12px;
  background: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary)));
  color: white;
  border: none;
  border-radius: var(--radius);
  font-size: 0.92rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;

  &:hover {
    background: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.8));
    box-shadow: 0 4px 12px rgba(52, 152, 219, 0.35);
  }
  &:active { transform: scale(0.98); }
`

const OutputRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid hsl(var(--bg));
  &:last-child { border-bottom: none; }
`

const OutputLabel = styled.div`
  display: flex;
  align-items: baseline;
  gap: 5px;
  flex-wrap: wrap;
`

const OutputName = styled.span`
  font-size: 0.88rem;
  font-weight: 500;
  color: hsl(var(--fg-muted));
`

const OutputSymbol = styled.span`
  font-size: 0.78rem;
  color: hsl(var(--accent));
  font-family: 'Consolas', 'Monaco', monospace;
`

const OutputValue = styled.span`
  font-size: 1rem;
  font-weight: 700;
  color: ${props => props.$error ? 'hsl(var(--danger))' : 'hsl(var(--fg))'};
  font-family: 'Consolas', 'Monaco', monospace;
  white-space: nowrap;
`

const OutputFormula = styled.span`
  font-size: 0.72rem;
  color: hsl(var(--fg-subtle));
  font-family: 'Consolas', 'Monaco', monospace;
`

const NoResultMsg = styled.div`
  text-align: center;
  padding: 16px;
  color: hsl(var(--border-strong));
  font-size: 0.85rem;
`

function parseDropdownOptions(v) {
  if (!v.options_data) return []
  try {
    const parsed = JSON.parse(v.options_data)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * 배열 입력은 화면에서 "10, 20, 30" 처럼 글자로 다룬다.
 *
 * 값 자체는 숫자 배열로 들고 있어야 계산에서 그대로 쓸 수 있다. 글자로만 두면
 * 수식마다 다시 쪼개야 하고, 쪼개는 규칙이 여러 곳에 흩어진다.
 */
function arrayToText(value) {
  if (!Array.isArray(value)) return ''
  return value.join(', ')
}

function textToArray(text) {
  // 입력 도중에는 "10, " 처럼 끝이 비어 있다. 그건 아직 값이 아니므로 버린다.
  return String(text ?? '')
    .split(/[,\s]+/)
    .filter(s => s !== '')
    .map(s => Number(s))
    .filter(n => Number.isFinite(n))
}



// ============================================
// Sub-components
// ============================================
function formatComputed(value) {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) {
    // 긴 배열을 통째로 늘어놓으면 칸을 넘겨 화면이 무너진다. 앞뒤만 보여 주고
    // 개수를 함께 적어 "몇 개짜리인지" 를 알 수 있게 한다.
    const shown = value.slice(0, 8).map(formatComputed)
    const more = value.length > 8 ? `, … (총 ${value.length}개)` : ''
    return `[${shown.join(', ')}${more}]`
  }
  if (typeof value === 'string') return value
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return String(value)
    return value.toFixed(4)
  }
  return String(value)
}

const OutputBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 0;
  border-bottom: 1px solid hsl(var(--bg));
  min-width: 0;

  &:last-child { border-bottom: none; }
`

function OutputVar({ v, computedValue, error }) {
  const isString = typeof computedValue === 'string'
  const isArray = !error && Array.isArray(computedValue)
  const displayValue = error ? error : formatComputed(computedValue)

  const label = (
    <OutputLabel>
      <OutputName>{v.name}</OutputName>
      {v.symbol && <OutputSymbol>({v.symbol})</OutputSymbol>}
      {v.var_type === 'formula' && v.formula && <OutputFormula>= {v.formula}</OutputFormula>}
      {v.var_type === 'table' && <OutputFormula>= 테이블 조회</OutputFormula>}
      {v.var_type === 'interp_table' && <OutputFormula>= 보간 테이블</OutputFormula>}
      {v.var_type === 'conditional' && <OutputFormula>= 조건부</OutputFormula>}
    </OutputLabel>
  )

  // 배열은 한 줄로 찍으면 읽을 수가 없다. 그래프·표로 따로 보여 준다.
  if (isArray) {
    return (
      <OutputBlock>
        {label}
        <ArrayResult values={computedValue} unit={v.unit} name={v.name} />
      </OutputBlock>
    )
  }

  return (
    <OutputRow>
      {label}
      <OutputValue $error={!!error}>
        {displayValue}
        {!error && !isString && v.unit && ` ${v.unit}`}
      </OutputValue>
    </OutputRow>
  )
}

function VarInput({ v, currentValue, onChange }) {
  return (
    <VarRow>
      <LabelRow>
        <VarLabel>
          {v.name}
          {v.symbol && <SymbolHint>({v.symbol})</SymbolHint>}
        </VarLabel>
      </LabelRow>
      {v.var_type === 'slider' ? (
        <SliderWrapper>
          <SliderColumn>
            <Slider
              type="range"
              min={v.min_value}
              max={v.max_value}
              step={(v.max_value - v.min_value) / 100}
              value={currentValue}
              onChange={(e) => onChange(Number(e.target.value))}
            />
            <SliderRange>
              <span>{v.min_value}</span>
              <span>{v.max_value}</span>
            </SliderRange>
          </SliderColumn>
          <SliderValue>
            {Number(currentValue).toFixed((v.max_value - v.min_value) < 10 ? 2 : 1)}
            {v.unit && ` ${v.unit}`}
          </SliderValue>
        </SliderWrapper>
      ) : v.var_type === 'dropdown' ? (
        <TextInputWrapper>
          <DropdownSelect
            value={currentValue ?? ''}
            onChange={(e) => onChange(e.target.value)}
          >
            {parseDropdownOptions(v).length === 0 && (
              <option value="">(옵션 없음)</option>
            )}
            {parseDropdownOptions(v).map((opt, i) => (
              <option key={i} value={opt}>{opt}</option>
            ))}
          </DropdownSelect>
          {v.unit && <InputUnit>{v.unit}</InputUnit>}
        </TextInputWrapper>
      ) : v.var_type === 'array' ? (
        <TextInputWrapper>
          <TextInput
            type="text"
            value={arrayToText(currentValue)}
            onChange={(e) => onChange(textToArray(e.target.value))}
            onPaste={(e) => {
              // 엑셀에서 한 줄·한 칸씩 복사한 것을 그대로 받는다.
              const cells = flattenClipboardCells(e.clipboardData?.getData('text'))
              if (!cells) return
              e.preventDefault()
              onChange(cells.map(c => Number(c)).filter(n => Number.isFinite(n)))
            }}
            placeholder={`쉼표로 구분 (예: 10, 20, 30)${v.unit ? ` [${v.unit}]` : ''}`}
          />
          <InputUnit>
            {Array.isArray(currentValue) ? `${currentValue.length}개` : '0개'}
            {v.unit && ` ${v.unit}`}
          </InputUnit>
        </TextInputWrapper>
      ) : (
        <UnitizedInput v={v} currentValue={currentValue} onChange={onChange} />
      )}
    </VarRow>
  )
}

/**
 * 단위를 골라 넣는 칸.
 *
 * **여기가 없으면 "N 칸에 kN 값을 넣는" 실수를 막을 방법이 없다.** 정의가
 * 맞는지는 검증이 보지만, 넣은 숫자가 어느 단위인지는 사람 머릿속에만 있다.
 *
 * 계산에 들어가는 값은 **언제나 선언 단위**다. 고른 단위는 넣는 방식일 뿐이라
 * 저장되지도, 계산에 쓰이지도 않는다.
 *
 * 친 글자를 그대로 들고 있는 이유: 환산한 값을 되돌려 칸에 넣으면 `1.5` 를
 * 치는 도중에 `1.` 이 `1` 로 바뀌어 소수점을 찍을 수가 없다.
 */
function UnitizedInput({ v, currentValue, onChange }) {
  const info = v.unit_info
  const [unit, setUnit] = React.useState(info ? info.unit : v.unit || '')
  const [typed, setTyped] = React.useState(null)
  const emitted = React.useRef(null)

  // 밖에서 값이 바뀌면(초기화·기록 불러오기) 친 글자는 버린다.
  //
  // **우리가 일으킨 변경은 빼야 한다.** 글자를 칠 때마다 onChange 로 값이
  // 바뀌는데, 그것까지 "밖에서 바뀌었다" 로 보면 친 글자가 매번 지워진다.
  // 그러면 kN 칸에 '1.' 을 친 순간 '1' 로 되돌아가 소수점을 찍을 수가 없다.
  React.useEffect(() => {
    if (emitted.current !== null && currentValue === emitted.current) return
    setTyped(null)
  }, [currentValue])

  const shown = typed !== null
    ? typed
    : (info ? fromDeclared(currentValue, info, unit) : (currentValue ?? ''))

  const handleType = (text) => {
    setTyped(text)
    const value = info ? toDeclared(text, info, unit) : text
    emitted.current = value
    onChange(value)
  }

  const handleUnit = (next) => {
    // **값은 그대로 두고 보이는 표기만 바꾼다.** 여기서 onChange 를 부르면
    // 단위를 고르는 것만으로 값이 바뀌어 버린다.
    setUnit(next)
    setTyped(null)
  }

  return (
    <TextInputWrapper>
      <TextInput
        type="text"
        value={shown}
        onChange={(e) => handleType(e.target.value)}
        placeholder={`값 입력${unit ? ` (${unit})` : ''}`}
      />
      {hasChoices(info) ? (
        <UnitSelect
          value={unit}
          onChange={(e) => handleUnit(e.target.value)}
          title={`이 값을 넣을 단위. 계산에는 ${info.unit} 로 환산해 들어갑니다.`}
        >
          {info.alternatives.map(a => (
            <option key={a.unit} value={a.unit}>{a.unit}</option>
          ))}
        </UnitSelect>
      ) : (
        v.unit && <InputUnit>{v.unit}</InputUnit>
      )}
    </TextInputWrapper>
  )
}

// ============================================
// Main Component
// ============================================
function InputVariables({ variables, containers, images = [], values, onChange, editMode, onLayoutChange, onCalculated }) {
  const [calculated, setCalculated] = useState(false)
  const [computedOutputs, setComputedOutputs] = useState({})

  const inputVars = variables.filter(v => v.category === 'input')
  const intermediateVars = variables.filter(v => v.category === 'intermediate')
  const outputVars = variables.filter(v => v.category === 'output')

  const handleChange = (varId, newValue) => {
    setCalculated(false)
    // 입력이 바뀌면 화면의 결과는 지워진다. 바깥도 그 사실을 알아야 한다 —
    // 모르면 **화면에 없는 옛 숫자를 기록으로 저장**하게 된다.
    if (onCalculated) onCalculated(null)
    onChange({ ...values, [varId]: newValue })
  }

  const handleCalculate = () => {
    // 계산 절차는 calcEngine 하나가 안다 — DOE 러너와 서버 검증도 같은 것을 쓴다.
    const { results } = calculateCard(variables, values)
    setComputedOutputs(results)
    setCalculated(true)
    // 기록 저장은 카드 전체의 일이라 바깥이 맡는다. 계산 버튼은 컨테이너마다
    // 있을 수 있어서 여기에 저장 버튼을 두면 여러 개가 생긴다.
    if (onCalculated) onCalculated(results)
  }

  // --- 변수 그룹핑 ---
  //
  // 한 변수가 여러 컨테이너에 놓일 수 있다. 그래서 같은 변수가 아래 맵에 두 번
  // 이상 나올 수 있고, 그것이 의도다 — 값은 하나이므로 어느 쪽을 고쳐도 함께
  // 바뀐다(입력값이 varId 로 키잉되어 있다).
  const inputByContainer = groupByContainer(inputVars)
  const inputUnassigned = unplaced(inputVars)

  const intermediateByContainer = groupByContainer(intermediateVars)
  const intermediateUnassigned = unplaced(intermediateVars)

  const outputByContainer = groupByContainer(outputVars)
  const outputUnassigned = unplaced(outputVars)

  const containerMap = {}
  containers.forEach(c => { containerMap[c.id] = c })

  const imagesByContainer = groupByContainer(images)

  const activeContainerIds = containers
    .filter(c => inputByContainer[c.id] || intermediateByContainer[c.id] || outputByContainer[c.id] || imagesByContainer[c.id])
    .filter(c => editMode || c.container_type !== 'hidden')
    .map(c => c.id)

  const hasInputContainer = containers.some(c => c.container_type === 'input' && inputByContainer[c.id])

  // --- 그리드 레이아웃 생성 ---
  const buildLayout = () => {
    const items = []
    let fallbackY = 0

    activeContainerIds.forEach(cId => {
      const c = containerMap[cId]
      items.push({
        i: `c-${cId}`,
        x: c.layout_x ?? 0,
        y: c.layout_y ?? fallbackY,
        w: c.layout_w ?? 12,
        h: c.layout_h ?? 4,
        minW: 3, minH: 2,
        static: !editMode,
      })
      fallbackY = Math.max(fallbackY, (c.layout_y ?? 0) + (c.layout_h ?? 4))
    })

    if (inputUnassigned.length > 0) {
      items.push({
        i: 'unassigned-input',
        x: 0, y: fallbackY,
        w: 6, h: Math.max(2, Math.ceil(inputUnassigned.length * 1.5) + 1),
        minW: 3, minH: 2,
        static: !editMode,
      })
      fallbackY += items[items.length - 1].h
    }

    if (intermediateUnassigned.length > 0) {
      items.push({
        i: 'unassigned-intermediate',
        x: 0, y: fallbackY,
        w: 6, h: Math.max(2, Math.ceil(intermediateUnassigned.length * 1.2) + 1),
        minW: 3, minH: 2,
        static: !editMode,
      })
      fallbackY += items[items.length - 1].h
    }

    if (outputUnassigned.length > 0) {
      items.push({
        i: 'unassigned-output',
        x: 6, y: fallbackY,
        w: 6, h: Math.max(2, Math.ceil(outputUnassigned.length * 1.2) + 1),
        minW: 3, minH: 2,
        static: !editMode,
      })
    }

    return items
  }

  // --- 드래그/리사이즈 완료 시에만 서버 저장 ---
  const handleLayoutSave = useCallback((layout) => {
    if (!onLayoutChange || !editMode) return
    const updates = []
    layout.forEach(item => {
      if (item.i.startsWith('c-')) {
        const cId = Number(item.i.replace('c-', ''))
        updates.push({ id: cId, x: item.x, y: item.y, w: item.w, h: item.h })
      }
    })
    if (updates.length > 0) onLayoutChange(updates)
  }, [onLayoutChange, editMode])

  if (inputVars.length === 0 && intermediateVars.length === 0 && outputVars.length === 0 && images.length === 0) return null

  const hasComputed = intermediateVars.length > 0 || outputVars.length > 0

  // --- 컨테이너 내용 렌더 ---
  const renderContainerContent = (cId) => {
    const container = containerMap[cId]
    const inVars = inputByContainer[cId] || []
    const midVars = intermediateByContainer[cId] || []
    const outVars = outputByContainer[cId] || []
    const imgs = imagesByContainer[cId] || []
    const isInput = container.container_type === 'input'
    const isHidden = container.container_type === 'hidden'
    const computedVars = [...midVars, ...outVars]

    const columns = Math.min(Math.max(Number(container.column_count) || 1, 1), 6)

    return (
      <ContainerBox $editMode={editMode} style={isHidden ? { opacity: 0.55, borderStyle: 'dashed', borderColor: 'hsl(var(--fg-subtle))' } : undefined}>
        <ContainerTitle className="drag-handle" $editMode={editMode}>
          {container.name}
          {isHidden && <span style={{ marginLeft: 8, fontSize: '0.75rem', color: 'hsl(var(--fg-subtle))', fontWeight: 500 }}>(숨김)</span>}
        </ContainerTitle>
        {imgs.length > 0 && (
          <ImageArea>
            {imgs.map(img => (
              <ImageBlock key={img.id}>
                <AuthedImage path={`/cards/${img.card_id}/images/${img.id}/file`} alt={img.filename} />
              </ImageBlock>
            ))}
          </ImageArea>
        )}
        <ContainerContent $columns={columns}>
          {inVars.map(v => (
            <VarInput
              key={v.id} v={v}
              currentValue={values[v.id] ?? defaultInputValue(v)}
              onChange={(val) => handleChange(v.id, val)}
            />
          ))}
          {computedVars.length > 0 && (
            calculated ? computedVars.map(v => (
              <OutputVar key={v.id} v={v}
                computedValue={computedOutputs[v.id]?.value}
                error={computedOutputs[v.id]?.error}
              />
            )) : inVars.length === 0 ? (
              <NoResultMsg>"계산" 버튼을 눌러 결과를 확인하세요.</NoResultMsg>
            ) : null
          )}
        </ContainerContent>
        {isInput && hasComputed && (
          <CalculateBtn onClick={handleCalculate}>계산</CalculateBtn>
        )}
      </ContainerBox>
    )
  }

  const gridLayout = buildLayout()

  return (
    <GridWrapper $editMode={editMode}>
      <ResponsiveGridLayout
        className="layout"
        layout={gridLayout}
        cols={12}
        rowHeight={50}
        draggableHandle=".drag-handle"
        onDragStop={handleLayoutSave}
        onResizeStop={handleLayoutSave}
        isDraggable={editMode}
        isResizable={editMode}
        margin={[16, 16]}
      >
          {activeContainerIds.map(cId => (
            <div key={`c-${cId}`}>
              {renderContainerContent(cId)}
            </div>
          ))}

          {inputUnassigned.length > 0 && (
            <div key="unassigned-input">
              <ContainerBox $editMode={editMode}>
                <ContainerTitle className="drag-handle" $editMode={editMode}>
                  기타 입력
                </ContainerTitle>
                <ContainerContent>
                  {inputUnassigned.map(v => (
                    <VarInput key={v.id} v={v}
                      currentValue={values[v.id] ?? defaultInputValue(v)}
                      onChange={(val) => handleChange(v.id, val)}
                    />
                  ))}
                </ContainerContent>
                {!hasInputContainer && hasComputed && (
                  <CalculateBtn onClick={handleCalculate}>계산</CalculateBtn>
                )}
              </ContainerBox>
            </div>
          )}

          {intermediateUnassigned.length > 0 && (
            <div key="unassigned-intermediate">
              <ContainerBox $editMode={editMode}>
                <ContainerTitle className="drag-handle" $editMode={editMode}>
                  중간값
                </ContainerTitle>
                <ContainerContent>
                  {calculated ? intermediateUnassigned.map(v => (
                    <OutputVar key={v.id} v={v}
                      computedValue={computedOutputs[v.id]?.value}
                      error={computedOutputs[v.id]?.error}
                    />
                  )) : (
                    <NoResultMsg>"계산" 버튼을 눌러 결과를 확인하세요.</NoResultMsg>
                  )}
                </ContainerContent>
              </ContainerBox>
            </div>
          )}

          {outputUnassigned.length > 0 && (
            <div key="unassigned-output">
              <ContainerBox $editMode={editMode}>
                <ContainerTitle className="drag-handle" $editMode={editMode}>
                  계산 결과
                </ContainerTitle>
                <ContainerContent>
                  {calculated ? outputUnassigned.map(v => (
                    <OutputVar key={v.id} v={v}
                      computedValue={computedOutputs[v.id]?.value}
                      error={computedOutputs[v.id]?.error}
                    />
                  )) : (
                    <NoResultMsg>"계산" 버튼을 눌러 결과를 확인하세요.</NoResultMsg>
                  )}
                </ContainerContent>
              </ContainerBox>
            </div>
          )}
      </ResponsiveGridLayout>
    </GridWrapper>
  )
}

export default InputVariables
