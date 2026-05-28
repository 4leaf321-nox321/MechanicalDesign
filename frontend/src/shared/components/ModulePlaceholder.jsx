import React, { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import styled from 'styled-components'
import ModuleLayout from './ModuleLayout'
import SettingsPanel from './Settings/SettingsPanel'
import InputVariables from './InputVariables'
import DoeInputPanel from './DOE/DoeInputPanel'
import DoeResultsView from './DOE/DoeResultsView'
import { runFactorial, runLhs, combinationCount, expandRange } from '../utils/doeEngine'

const API_URL = import.meta.env.VITE_API_URL || '/api'

const ModeTabs = styled.div`
  display: flex;
  gap: 6px;
  margin-bottom: 16px;
  padding: 4px;
  background: #e9ecef;
  border-radius: 8px;
  width: fit-content;
`

const ModeTab = styled.button`
  padding: 8px 18px;
  border: none;
  border-radius: 6px;
  background: ${p => p.$active ? 'white' : 'transparent'};
  color: ${p => p.$active ? '#333' : '#777'};
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  box-shadow: ${p => p.$active ? '0 1px 3px rgba(0,0,0,0.12)' : 'none'};
  transition: all 0.15s;
  &:hover { color: #333; }
`

const DoeWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const DoeSubTabs = styled.div`
  display: flex;
  border-bottom: 2px solid #e9ecef;
`

const DoeSubTab = styled.button`
  padding: 10px 20px;
  border: none;
  background: none;
  font-size: 0.95rem;
  font-weight: 500;
  color: ${p => p.$active ? '#3498db' : '#888'};
  border-bottom: 2px solid ${p => p.$active ? '#3498db' : 'transparent'};
  margin-bottom: -2px;
  cursor: pointer;
  &:hover { color: #3498db; }
`

const RunRow = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  background: white;
  padding: 14px 18px;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
`

const RunBtn = styled.button`
  padding: 10px 22px;
  background: linear-gradient(135deg, #3498db, #2980b9);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  &:hover { background: linear-gradient(135deg, #2980b9, #2471a3); }
  &:disabled { background: #b0d4f1; cursor: not-allowed; }
`

const CountBadge = styled.span`
  font-size: 0.9rem;
  color: ${p => p.$warn ? '#e67e22' : '#555'};
  font-weight: 500;
`

const WarnMsg = styled.div`
  font-size: 0.8rem;
  color: #e67e22;
  margin-left: auto;
`

const MethodBar = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  background: white;
  padding: 12px 18px;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  flex-wrap: wrap;
`

const MethodToggle = styled.div`
  display: inline-flex;
  border: 1px solid #ddd;
  border-radius: 6px;
  overflow: hidden;
`

const MethodBtn = styled.button`
  padding: 7px 14px;
  font-size: 0.85rem;
  background: ${p => p.$active ? '#3498db' : 'white'};
  color: ${p => p.$active ? 'white' : '#666'};
  border: none;
  cursor: pointer;
  &:hover { background: ${p => p.$active ? '#3498db' : '#f0f0f0'}; }
`

const MethodField = styled.label`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  color: #555;
`

const SmallNumInput = styled.input`
  width: 80px;
  padding: 6px 8px;
  border: 1px solid #ddd;
  border-radius: 5px;
  font-size: 0.85rem;
  outline: none;
  &:focus { border-color: #3498db; }
`

const MethodHint = styled.div`
  font-size: 0.76rem;
  color: #999;
  margin-left: auto;
`

function ModulePlaceholder({ onGoHome }) {
  const location = useLocation()
  const [card, setCard] = useState(null)
  const [variables, setVariables] = useState([])
  const [containers, setContainers] = useState([])
  const [images, setImages] = useState([])
  const [inputValues, setInputValues] = useState({})
  const [showSettings, setShowSettings] = useState(false)
  const [editMode, setEditMode] = useState(false)

  // DOE 모드 상태
  const [mode, setMode] = useState('single')      // 'single' | 'doe'
  const [doeSubTab, setDoeSubTab] = useState('setup') // 'setup' | 'results'
  const [doeSpecs, setDoeSpecs] = useState({})    // { [varId]: spec }
  const [doeResult, setDoeResult] = useState(null)
  const [doeRunning, setDoeRunning] = useState(false)
  const [doeMethod, setDoeMethod] = useState('factorial') // 'factorial' | 'lhs'
  const [lhsSamples, setLhsSamples] = useState(50)
  const [lhsSeed, setLhsSeed] = useState('')       // 빈 값이면 Math.random 사용

  useEffect(() => {
    const fetchCard = async () => {
      try {
        const res = await fetch(`${API_URL}/cards`)
        if (!res.ok) return
        const text = await res.text()
        if (!text) return
        const cards = JSON.parse(text)
        const currentPath = decodeURIComponent(location.pathname)
        const found = cards.find(c => c.route === currentPath)
        if (found) setCard(found)
      } catch (err) {
        console.error('Failed to fetch card:', err)
      }
    }
    fetchCard()
  }, [location.pathname])

  const fetchData = useCallback(async () => {
    if (!card) return
    try {
      const [varsRes, ctnsRes, imgsRes] = await Promise.all([
        fetch(`${API_URL}/cards/${card.id}/variables`),
        fetch(`${API_URL}/cards/${card.id}/containers`),
        fetch(`${API_URL}/cards/${card.id}/images`),
      ])
      if (varsRes.ok) {
        const text = await varsRes.text()
        if (text) setVariables(JSON.parse(text))
      }
      if (ctnsRes.ok) {
        const text = await ctnsRes.text()
        if (text) setContainers(JSON.parse(text))
      }
      if (imgsRes.ok) {
        const text = await imgsRes.text()
        if (text) setImages(JSON.parse(text))
      }
    } catch (err) {
      console.error('Failed to fetch data:', err)
    }
  }, [card])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleSettingsClose = () => {
    setShowSettings(false)
    fetchData()
  }

  const handleLayoutChange = async (layouts) => {
    if (!card) return
    try {
      const res = await fetch(`${API_URL}/cards/${card.id}/containers/layout`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layouts }),
      })
      if (res.ok) {
        setContainers(await res.json())
      }
    } catch (err) {
      console.error('Failed to save layout:', err)
    }
  }

  // DOE 조합 수 미리 계산
  const inputVars = variables.filter(v => v.category === 'input')
  const factorialCombos = React.useMemo(() => {
    if (inputVars.length === 0) return 0
    const arrays = inputVars.map(v => expandRange(v, doeSpecs[v.id] ?? { mode: 'fixed', value: v.var_type === 'slider' ? (v.min_value ?? 0) : '' }))
    return combinationCount(arrays)
  }, [inputVars, doeSpecs])

  const rangeInputCount = React.useMemo(() => (
    inputVars.filter(v => doeSpecs[v.id]?.mode === 'range').length
  ), [inputVars, doeSpecs])

  const totalCombos = doeMethod === 'factorial' ? factorialCombos : (rangeInputCount > 0 ? lhsSamples : 1)

  const runDoeNow = () => {
    setDoeRunning(true)
    // 비동기 형식을 유지하되 JS 계산은 동기 — UI 잠깐 프리즈 방지용 setTimeout
    setTimeout(() => {
      try {
        const result = doeMethod === 'lhs'
          ? runLhs(variables, doeSpecs, lhsSamples, lhsSeed === '' ? undefined : lhsSeed)
          : runFactorial(variables, doeSpecs)
        setDoeResult(result)
        setDoeSubTab('results')
      } catch (err) {
        console.error('DOE 실행 오류', err)
      } finally {
        setDoeRunning(false)
      }
    }, 30)
  }

  const renderSingleMode = () => (
    <InputVariables
      variables={variables}
      containers={containers}
      images={images}
      values={inputValues}
      onChange={setInputValues}
      editMode={editMode}
      onLayoutChange={handleLayoutChange}
    />
  )

  const renderDoeMode = () => (
    <DoeWrapper>
      <DoeSubTabs>
        <DoeSubTab $active={doeSubTab === 'setup'} onClick={() => setDoeSubTab('setup')}>
          1. 설정
        </DoeSubTab>
        <DoeSubTab $active={doeSubTab === 'results'} onClick={() => setDoeSubTab('results')} disabled={!doeResult}>
          2. 결과 {doeResult && `(${doeResult.rows.length})`}
        </DoeSubTab>
      </DoeSubTabs>

      {doeSubTab === 'setup' && (
        <>
          <MethodBar>
            <MethodField>
              <span>샘플링 방식:</span>
              <MethodToggle>
                <MethodBtn $active={doeMethod === 'factorial'} onClick={() => setDoeMethod('factorial')}>
                  Full Factorial
                </MethodBtn>
                <MethodBtn $active={doeMethod === 'lhs'} onClick={() => setDoeMethod('lhs')}>
                  Latin Hypercube
                </MethodBtn>
              </MethodToggle>
            </MethodField>
            {doeMethod === 'lhs' && (
              <>
                <MethodField>
                  샘플 수
                  <SmallNumInput
                    type="number"
                    min={1}
                    value={lhsSamples}
                    onChange={(e) => setLhsSamples(Math.max(1, Number(e.target.value) || 1))}
                  />
                </MethodField>
                <MethodField>
                  시드 (선택)
                  <SmallNumInput
                    type="number"
                    value={lhsSeed}
                    onChange={(e) => setLhsSeed(e.target.value)}
                    placeholder="무작위"
                  />
                </MethodField>
              </>
            )}
            <MethodHint>
              {doeMethod === 'factorial'
                ? '모든 조합을 완전 탐색 (범위 변수의 값 수가 곱해져 조합 수 폭발 주의)'
                : '범위 변수별 샘플 수만큼 통계적 균등 샘플링. 시드 지정 시 재현 가능'}
            </MethodHint>
          </MethodBar>
          <RunRow>
            <CountBadge $warn={totalCombos > 1000}>
              총 {totalCombos.toLocaleString()}개 조합
            </CountBadge>
            {totalCombos > 10000 && (
              <WarnMsg>조합이 매우 많습니다 — 실행 시간이 오래 걸릴 수 있어요.</WarnMsg>
            )}
            <div style={{ marginLeft: 'auto' }}>
              <RunBtn onClick={runDoeNow} disabled={doeRunning || totalCombos === 0}>
                {doeRunning ? '실행 중...' : 'DOE 실행'}
              </RunBtn>
            </div>
          </RunRow>
          <DoeInputPanel
            inputVars={inputVars}
            containers={containers}
            specs={doeSpecs}
            onChange={setDoeSpecs}
            method={doeMethod}
          />
        </>
      )}

      {doeSubTab === 'results' && (
        <DoeResultsView result={doeResult} variables={variables} />
      )}
    </DoeWrapper>
  )

  return (
    <>
      <ModuleLayout
        title={card?.name || '모듈'}
        onGoHome={onGoHome}
        onSettings={card ? () => setShowSettings(true) : undefined}
        editMode={mode === 'single' ? editMode : false}
        onToggleEditMode={mode === 'single' ? () => setEditMode(prev => !prev) : undefined}
      >
        <ModeTabs>
          <ModeTab $active={mode === 'single'} onClick={() => setMode('single')}>단일 계산</ModeTab>
          <ModeTab $active={mode === 'doe'} onClick={() => setMode('doe')}>DOE 탐색</ModeTab>
        </ModeTabs>

        {mode === 'single' ? renderSingleMode() : renderDoeMode()}
      </ModuleLayout>

      {showSettings && card && (
        <SettingsPanel
          cardId={card.id}
          onClose={handleSettingsClose}
        />
      )}
    </>
  )
}

export default ModulePlaceholder
