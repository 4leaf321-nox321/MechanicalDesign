import React from 'react'
import styled from 'styled-components'
import { expandRange } from '../../utils/doeEngine'
import { groupByContainer } from '../../utils/placements'

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const GroupBox = styled.div`
  background: white;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  padding: 20px 24px;
`

const GroupTitle = styled.h3`
  font-size: 1.05rem;
  font-weight: 600;
  color: #333;
  margin: 0 0 14px 0;
  padding-bottom: 8px;
  border-bottom: 2px solid #e9ecef;
`

const CardGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px 20px;
`

const VarCard = styled.div`
  padding: 10px 12px;
  border: 1px solid #eef0f2;
  border-radius: 8px;
  background: #fafbfc;
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
`

const Name = styled.div`
  font-size: 0.9rem;
  font-weight: 500;
  color: #444;
`

const Sym = styled.span`
  font-size: 0.78rem;
  color: #7b1fa2;
  font-family: 'Consolas', 'Monaco', monospace;
  margin-left: 6px;
`

const Toggle = styled.div`
  display: inline-flex;
  gap: 4px;
  border: 1px solid #ddd;
  border-radius: 6px;
  overflow: hidden;
`

const ToggleBtn = styled.button`
  padding: 4px 10px;
  font-size: 0.78rem;
  background: ${p => p.$active ? '#3498db' : 'white'};
  color: ${p => p.$active ? 'white' : '#666'};
  border: none;
  cursor: pointer;
  &:hover { background: ${p => p.$active ? '#3498db' : '#f0f0f0'}; }
`

const Row = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  align-items: end;
`

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 0.72rem;
  color: #888;
`

const NumInput = styled.input`
  padding: 6px 8px;
  border: 1px solid #ddd;
  border-radius: 5px;
  font-size: 0.85rem;
  outline: none;
  &:focus { border-color: #3498db; }
`

const TextInput = styled(NumInput).attrs({ as: 'input' })``

const TextArea = styled.textarea`
  padding: 6px 8px;
  border: 1px solid #ddd;
  border-radius: 5px;
  font-size: 0.85rem;
  outline: none;
  min-height: 54px;
  font-family: inherit;
  &:focus { border-color: #3498db; }
`

const CheckGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 4px 10px;
  padding: 6px 8px;
  border: 1px solid #ddd;
  border-radius: 5px;
`

const CheckLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  cursor: pointer;
`

const PreviewHint = styled.div`
  margin-top: 6px;
  font-size: 0.72rem;
  color: #999;
`

function parseDropdownOptions(v) {
  try {
    const opts = JSON.parse(v.options_data || '[]')
    return Array.isArray(opts) ? opts : []
  } catch { return [] }
}

function renderFixedInput(v, spec, onChange) {
  const setValue = (val) => onChange({ mode: 'fixed', value: val })
  if (v.var_type === 'array') {
    // 배열은 DOE 인자가 될 수 없다(값이 여럿이라 "무엇을 바꿔 볼지" 가 없다).
    // 모든 실험에 같은 배열이 들어간다.
    const list = Array.isArray(spec?.value) ? spec.value : []
    return (
      <Row>
        <Field>
          값 (모든 실험 공통)
          <NumInput
            type="text"
            value={list.join(', ')}
            onChange={(e) => setValue(
              String(e.target.value).split(/[,\s]+/).filter(s => s !== '')
                .map(Number).filter(n => Number.isFinite(n))
            )}
            placeholder="예: 10, 20, 30"
          />
        </Field>
      </Row>
    )
  }
  if (v.var_type === 'slider') {
    return (
      <Row>
        <Field>
          값
          <NumInput
            type="number"
            value={spec?.value ?? v.min_value ?? 0}
            onChange={(e) => setValue(Number(e.target.value))}
          />
        </Field>
      </Row>
    )
  }
  if (v.var_type === 'dropdown') {
    const opts = parseDropdownOptions(v)
    return (
      <Row>
        <Field>
          값
          <select
            value={spec?.value ?? opts[0] ?? ''}
            onChange={(e) => setValue(e.target.value)}
            style={{ padding: '6px 8px', border: '1px solid #ddd', borderRadius: 5, fontSize: '0.85rem' }}
          >
            {opts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>
      </Row>
    )
  }
  return (
    <Row>
      <Field>
        값
        <TextInput
          value={spec?.value ?? ''}
          onChange={(e) => setValue(e.target.value)}
        />
      </Field>
    </Row>
  )
}

function renderRangeInput(v, spec, onChange, method) {
  if (v.var_type === 'slider') {
    const s = { start: v.min_value ?? 0, end: v.max_value ?? 10, steps: 5, ...spec, mode: 'range' }
    const preview = expandRange(v, s)
    return (
      <>
        <Row>
          <Field>
            시작
            <NumInput type="number" value={s.start} onChange={(e) => onChange({ ...s, start: Number(e.target.value) })} />
          </Field>
          <Field>
            끝
            <NumInput type="number" value={s.end} onChange={(e) => onChange({ ...s, end: Number(e.target.value) })} />
          </Field>
          {method !== 'lhs' && (
            <Field>
              분할 수
              <NumInput type="number" min={1} value={s.steps} onChange={(e) => onChange({ ...s, steps: Math.max(1, Number(e.target.value)) })} />
            </Field>
          )}
        </Row>
        {method !== 'lhs' && (
          <PreviewHint>
            {preview.length}개 값: {preview.slice(0, 6).map(x => typeof x === 'number' ? x.toFixed(2) : x).join(', ')}
            {preview.length > 6 && ` … (총 ${preview.length}개)`}
          </PreviewHint>
        )}
        {method === 'lhs' && (
          <PreviewHint>
            LHS가 [{s.start}, {s.end}] 구간을 전역 샘플 수로 균등 샘플링
          </PreviewHint>
        )}
      </>
    )
  }
  if (v.var_type === 'dropdown') {
    const opts = parseDropdownOptions(v)
    const s = { selected: spec?.selected ?? opts.slice(), mode: 'range' }
    const toggle = (opt) => {
      const cur = new Set(s.selected)
      if (cur.has(opt)) cur.delete(opt); else cur.add(opt)
      onChange({ ...s, selected: Array.from(cur) })
    }
    return (
      <>
        <CheckGrid>
          {opts.map(o => (
            <CheckLabel key={o}>
              <input
                type="checkbox"
                checked={s.selected.includes(o)}
                onChange={() => toggle(o)}
              />
              {o}
            </CheckLabel>
          ))}
        </CheckGrid>
        <PreviewHint>{s.selected.length}개 선택됨</PreviewHint>
      </>
    )
  }
  // text
  const raw = spec?.raw ?? ''
  const values = raw.split(/[\n,]+/).map(x => x.trim()).filter(x => x !== '')
  return (
    <>
      <Field>
        값 목록 (줄바꿈 또는 쉼표로 구분)
        <TextArea
          value={raw}
          onChange={(e) => onChange({ mode: 'range', raw: e.target.value, values: e.target.value.split(/[\n,]+/).map(x => x.trim()).filter(x => x !== '') })}
          placeholder={'예:\n10\n20.5\n30'}
        />
      </Field>
      <PreviewHint>{values.length}개 값</PreviewHint>
    </>
  )
}

function DoeInputPanel({ inputVars, containers, specs, onChange, method = 'factorial' }) {
  const containerMap = {}
  containers.forEach(c => { containerMap[c.id] = c })
  // **여기서는 변수를 한 번만 보여 준다.**
  //
  // 한 변수가 여러 컨테이너에 배치될 수 있는데, DOE 는 화면 배치가 아니라
  // 실험 인자 목록이다. 배치한 만큼 인자가 늘어나면 같은 변수를 두 번 설정하게
  // 되고 — 서로 다르게 설정하면 어느 쪽이 이기는지도 알 수 없다.
  // 그래서 **처음 놓인 컨테이너 한 곳**에만 싣는다.
  const grouped = groupByContainer(inputVars)
  const byContainer = {}
  const shown = new Set()
  containers.forEach(c => {
    const list = (grouped[c.id] || []).filter(v => !shown.has(v.id))
    if (list.length === 0) return
    list.forEach(v => shown.add(v.id))
    byContainer[c.id] = list
  })
  const unassigned = inputVars.filter(v => !shown.has(v.id))

  const setSpec = (varId, next) => onChange({ ...specs, [varId]: next })

  const renderGroup = (title, vars) => (
    <GroupBox>
      <GroupTitle>{title}</GroupTitle>
      <CardGrid>
      {vars.map(v => {
        const spec = specs[v.id] ?? { mode: 'fixed', value: v.var_type === 'array' ? []
          : v.var_type === 'slider' ? (v.min_value ?? 0) : '' }
        const mode = spec.mode || 'fixed'
        return (
          <VarCard key={v.id}>
            <Header>
              <Name>
                {v.name}
                {v.symbol && <Sym>({v.symbol})</Sym>}
                {v.unit && <span style={{ fontSize: '0.75rem', color: '#999', marginLeft: 6 }}>[{v.unit}]</span>}
              </Name>
              {/* 배열은 인자가 될 수 없으므로 고정/범위를 고를 것이 없다.
                  버튼을 남겨 두면 눌러 놓고 왜 안 바뀌는지 묻게 된다. */}
              <Toggle style={v.var_type === 'array' ? { visibility: 'hidden' } : undefined}>
                <ToggleBtn $active={mode === 'fixed'} onClick={() => setSpec(v.id, { mode: 'fixed', value: v.var_type === 'slider' ? (v.min_value ?? 0) : (v.var_type === 'dropdown' ? parseDropdownOptions(v)[0] ?? '' : '') })}>고정</ToggleBtn>
                <ToggleBtn $active={mode === 'range'} onClick={() => {
                  if (v.var_type === 'slider') {
                    setSpec(v.id, { mode: 'range', start: v.min_value ?? 0, end: v.max_value ?? 10, steps: 5 })
                  } else if (v.var_type === 'dropdown') {
                    setSpec(v.id, { mode: 'range', selected: parseDropdownOptions(v) })
                  } else {
                    setSpec(v.id, { mode: 'range', raw: '', values: [] })
                  }
                }}>범위</ToggleBtn>
              </Toggle>
            </Header>
            {v.var_type === 'array' || mode === 'fixed'
              ? renderFixedInput(v, spec, (s) => setSpec(v.id, s))
              : renderRangeInput(v, spec, (s) => setSpec(v.id, s), method)}
          </VarCard>
        )
      })}
      </CardGrid>
    </GroupBox>
  )

  const activeContainerIds = containers
    .filter(c => byContainer[c.id] && c.container_type !== 'hidden')
    .map(c => c.id)

  return (
    <Wrapper>
      {activeContainerIds.map(cId => renderGroup(containerMap[cId].name, byContainer[cId]))}
      {unassigned.length > 0 && renderGroup('기타 입력', unassigned)}
    </Wrapper>
  )
}

export default DoeInputPanel
