import React, { useState, useCallback } from 'react'
import styled from 'styled-components'
import { ReactGridLayout, WidthProvider } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { evaluateVariable } from '../utils/evaluators'

const API_URL = import.meta.env.VITE_API_URL || '/api'
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
    background: #3498db !important;
    opacity: 0.15 !important;
    border-radius: 10px;
  }
  .react-resizable-handle::after {
    border-right-color: ${props => props.$editMode ? '#3498db' : 'transparent'} !important;
    border-bottom-color: ${props => props.$editMode ? '#3498db' : 'transparent'} !important;
  }
`

const ContainerBox = styled.div`
  background: white;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  padding: 20px 24px;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: ${props => props.$editMode ? '2px dashed #3498db33' : '2px solid transparent'};
  transition: border-color 0.2s;
`

const ContainerTitle = styled.h2`
  font-size: 1.05rem;
  font-weight: 600;
  color: #333;
  margin: 0 0 16px 0;
  padding-bottom: 10px;
  border-bottom: 2px solid #e9ecef;
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
    background: #ddd;
    border-radius: 2px;
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
    border-radius: 6px;
    background: #fafafa;
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
  color: #444;
`

const SymbolHint = styled.span`
  font-size: 0.78rem;
  color: #7b1fa2;
  font-family: 'Consolas', 'Monaco', monospace;
  margin-left: 4px;
`

const UnitText = styled.span`
  font-size: 0.78rem;
  color: #999;
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
  border-radius: 3px;
  background: #e0e0e0;
  outline: none;

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #3498db;
    cursor: pointer;
  }
  &::-webkit-slider-thumb:hover { background: #2980b9; }
  &::-moz-range-thumb {
    width: 18px; height: 18px;
    border-radius: 50%;
    background: #3498db;
    cursor: pointer;
    border: none;
  }
`

const SliderValue = styled.div`
  min-width: 72px;
  text-align: right;
  font-size: 0.9rem;
  font-weight: 600;
  color: #333;
`

const SliderRange = styled.div`
  display: flex;
  justify-content: space-between;
  margin-top: 3px;
  font-size: 0.72rem;
  color: #bbb;
`

const TextInputWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const TextInput = styled.input`
  flex: 1;
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.9rem;
  outline: none;
  box-sizing: border-box;
  &:focus { border-color: #3498db; }
`

const DropdownSelect = styled.select`
  flex: 1;
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.9rem;
  outline: none;
  box-sizing: border-box;
  background: white;
  cursor: pointer;
  &:focus { border-color: #3498db; }
`

const InputUnit = styled.span`
  font-size: 0.85rem;
  color: #666;
  font-weight: 500;
  min-width: 28px;
`

const CalculateBtn = styled.button`
  width: 100%;
  padding: 10px;
  margin-top: 12px;
  background: linear-gradient(135deg, #3498db, #2980b9);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 0.92rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;

  &:hover {
    background: linear-gradient(135deg, #2980b9, #2471a3);
    box-shadow: 0 4px 12px rgba(52, 152, 219, 0.35);
  }
  &:active { transform: scale(0.98); }
`

const OutputRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid #f0f0f0;
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
  color: #444;
`

const OutputSymbol = styled.span`
  font-size: 0.78rem;
  color: #7b1fa2;
  font-family: 'Consolas', 'Monaco', monospace;
`

const OutputValue = styled.span`
  font-size: 1rem;
  font-weight: 700;
  color: ${props => props.$error ? '#e74c3c' : '#2c3e50'};
  font-family: 'Consolas', 'Monaco', monospace;
  white-space: nowrap;
`

const OutputFormula = styled.span`
  font-size: 0.72rem;
  color: #aaa;
  font-family: 'Consolas', 'Monaco', monospace;
`

const NoResultMsg = styled.div`
  text-align: center;
  padding: 16px;
  color: #bbb;
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

function getDefaultInputValue(v) {
  if (v.var_type === 'slider') return v.min_value
  if (v.var_type === 'dropdown') {
    const opts = parseDropdownOptions(v)
    return opts[0] ?? ''
  }
  return ''
}

// ============================================
// Sub-components
// ============================================
function formatComputed(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return String(value)
    return value.toFixed(4)
  }
  return String(value)
}

function OutputVar({ v, computedValue, error }) {
  const isString = typeof computedValue === 'string'
  const displayValue = error ? error : formatComputed(computedValue)
  return (
    <OutputRow>
      <OutputLabel>
        <OutputName>{v.name}</OutputName>
        {v.symbol && <OutputSymbol>({v.symbol})</OutputSymbol>}
        {v.var_type === 'formula' && v.formula && <OutputFormula>= {v.formula}</OutputFormula>}
        {v.var_type === 'table' && <OutputFormula>= 테이블 조회</OutputFormula>}
        {v.var_type === 'interp_table' && <OutputFormula>= 보간 테이블</OutputFormula>}
        {v.var_type === 'conditional' && <OutputFormula>= 조건부</OutputFormula>}
      </OutputLabel>
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
      ) : (
        <TextInputWrapper>
          <TextInput
            type="text"
            value={currentValue}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`값 입력${v.unit ? ` (${v.unit})` : ''}`}
          />
          {v.unit && <InputUnit>{v.unit}</InputUnit>}
        </TextInputWrapper>
      )}
    </VarRow>
  )
}

// ============================================
// Main Component
// ============================================
function InputVariables({ variables, containers, images = [], values, onChange, editMode, onLayoutChange }) {
  const [calculated, setCalculated] = useState(false)
  const [computedOutputs, setComputedOutputs] = useState({})

  const inputVars = variables.filter(v => v.category === 'input')
  const intermediateVars = variables.filter(v => v.category === 'intermediate')
  const outputVars = variables.filter(v => v.category === 'output')

  const handleChange = (varId, newValue) => {
    setCalculated(false)
    onChange({ ...values, [varId]: newValue })
  }

  const handleCalculate = () => {
    const symbolMap = {}
    variables.forEach(v => {
      if (v.symbol && v.category === 'input') {
        symbolMap[v.symbol] = values[v.id] ?? getDefaultInputValue(v)
      }
    })

    const results = {}
    const hasDefinition = (v) => {
      if (v.var_type === 'table') return !!v.table_data
      if (v.var_type === 'conditional') return !!v.conditional_data
      if (v.var_type === 'interp_table') return !!v.interp_data
      return !!v.formula
    }
    const missingLabel = (v) => {
      if (v.var_type === 'table') return '테이블 정의 없음'
      if (v.var_type === 'conditional') return '조건부 정의 없음'
      if (v.var_type === 'interp_table') return '보간 테이블 정의 없음'
      return '수식 없음'
    }

    // 중간값 계산 — 서로 참조할 수 있으므로 해결될 때까지 반복
    intermediateVars.forEach(v => {
      if (!hasDefinition(v)) {
        results[v.id] = { value: null, error: missingLabel(v) }
      }
    })
    const pending = intermediateVars.filter(hasDefinition)
    let progressed = true
    let remaining = [...pending]
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
    // 끝까지 해결 못한 중간값은 마지막 에러 상태로 기록
    remaining.forEach(v => {
      results[v.id] = evaluateVariable(v, symbolMap)
    })

    outputVars.forEach(v => {
      if (hasDefinition(v)) {
        const result = evaluateVariable(v, symbolMap)
        results[v.id] = result
        if (v.symbol && result.value !== null) symbolMap[v.symbol] = result.value
      } else {
        results[v.id] = { value: null, error: missingLabel(v) }
      }
    })
    setComputedOutputs(results)
    setCalculated(true)
  }

  // --- 변수 그룹핑 ---
  const inputByContainer = {}
  const inputUnassigned = []
  inputVars.forEach(v => {
    if (v.container_id) {
      if (!inputByContainer[v.container_id]) inputByContainer[v.container_id] = []
      inputByContainer[v.container_id].push(v)
    } else {
      inputUnassigned.push(v)
    }
  })

  const intermediateByContainer = {}
  const intermediateUnassigned = []
  intermediateVars.forEach(v => {
    if (v.container_id) {
      if (!intermediateByContainer[v.container_id]) intermediateByContainer[v.container_id] = []
      intermediateByContainer[v.container_id].push(v)
    } else {
      intermediateUnassigned.push(v)
    }
  })

  const outputByContainer = {}
  const outputUnassigned = []
  outputVars.forEach(v => {
    if (v.container_id) {
      if (!outputByContainer[v.container_id]) outputByContainer[v.container_id] = []
      outputByContainer[v.container_id].push(v)
    } else {
      outputUnassigned.push(v)
    }
  })

  const containerMap = {}
  containers.forEach(c => { containerMap[c.id] = c })

  const imagesByContainer = {}
  images.forEach(img => {
    if (img.container_id) {
      if (!imagesByContainer[img.container_id]) imagesByContainer[img.container_id] = []
      imagesByContainer[img.container_id].push(img)
    }
  })

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
      <ContainerBox $editMode={editMode} style={isHidden ? { opacity: 0.55, borderStyle: 'dashed', borderColor: '#90a4ae' } : undefined}>
        <ContainerTitle className="drag-handle" $editMode={editMode}>
          {container.name}
          {isHidden && <span style={{ marginLeft: 8, fontSize: '0.75rem', color: '#78909c', fontWeight: 500 }}>(숨김)</span>}
        </ContainerTitle>
        {imgs.length > 0 && (
          <ImageArea>
            {imgs.map(img => (
              <ImageBlock key={img.id}>
                <img src={`${API_URL}/cards/${img.card_id}/images/${img.id}/file`} alt={img.filename} />
              </ImageBlock>
            ))}
          </ImageArea>
        )}
        <ContainerContent $columns={columns}>
          {inVars.map(v => (
            <VarInput
              key={v.id} v={v}
              currentValue={values[v.id] ?? getDefaultInputValue(v)}
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
                      currentValue={values[v.id] ?? getDefaultInputValue(v)}
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
