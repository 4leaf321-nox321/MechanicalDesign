import React, { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import styled from 'styled-components'
import ModuleLayout from './ModuleLayout'
import SettingsPanel from './Settings/SettingsPanel'
import HistoryPanel from './HistoryPanel'
import ValidationPanel from './ValidationPanel'
import InputVariables from './InputVariables'
import DoeInputPanel from './DOE/DoeInputPanel'
import DoeResultsView from './DOE/DoeResultsView'
import { runFactorial, runLhs, combinationCount, expandRange } from '../utils/doeEngine'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'


/**
 * 카드 상태 배너.
 *
 * **목록의 배지만으로는 부족하다.** 사람은 주소를 저장해 두고 카드로 바로
 * 들어오며, 실제로 그 숫자를 보고 판단하는 자리가 여기다. 목록을 거쳐 오지
 * 않은 사람에게는 배지가 아예 보이지 않는다.
 */
const Banner = styled.div`
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
  font-size: 0.88rem;
  line-height: 1.55;
  background: ${p => (p.$warn ? '#fdecea' : '#fff8e1')};
  border: 1px solid ${p => (p.$warn ? '#f5c6cb' : '#f0d98c')};
  color: ${p => (p.$warn ? '#a4343a' : '#8a6d1a')};
`

const BannerTitle = styled.strong`
  display: block;
  margin-bottom: 3px;
`

/**
 * 계산 기록 저장 바.
 *
 * **계산 버튼 옆이 아니라 여기 있는 이유**: 계산 버튼은 입력 컨테이너마다 하나씩
 * 있을 수 있어서, 거기에 저장을 붙이면 저장 버튼이 여러 개 생긴다. 기록은 카드
 * 전체의 일이라 카드 수준에 한 번만 둔다.
 *
 * 계산을 한 뒤에만 뜬다. 입력을 바꾸면 다시 사라진다 — 화면에 없는 옛 숫자가
 * 기록으로 저장되는 것이 이 기능에서 가장 나쁜 실패다.
 */
const SaveBar = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  background: #f1f7fd;
  border: 1px solid #cfe3f7;
  border-radius: 8px;
  padding: 12px 14px;
  margin-top: 16px;
`

const SaveHint = styled.span`
  font-size: 0.85rem;
  color: #34618c;
  flex: 1 1 200px;
`

const SaveInput = styled.input`
  flex: 2 1 260px;
  padding: 9px 12px;
  border: 1px solid #cfe3f7;
  border-radius: 6px;
  font-size: 0.9rem;

  &:focus {
    outline: none;
    border-color: #3498db;
  }
`

const SaveBtn = styled.button`
  padding: 9px 18px;
  background: #2980b9;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;

  &:hover:not(:disabled) { background: #2471a3; }
  &:disabled { background: #aab; cursor: not-allowed; }
`

const SaveMsg = styled.span`
  font-size: 0.85rem;
  font-weight: 600;
  color: ${p => (p.$error ? '#a4343a' : '#2f6b34')};
  flex-basis: 100%;
`

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
  const [showHistory, setShowHistory] = useState(false)
  const [showValidation, setShowValidation] = useState(false)
  const { user } = useAuth()
  const [editMode, setEditMode] = useState(false)

  // 마지막 계산 결과. null 이면 아직 계산하지 않았거나 입력이 바뀌어
  // 결과가 무효가 된 것이다 — 그때는 저장할 것이 없다.
  const [lastResults, setLastResults] = useState(null)
  const [recordTitle, setRecordTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState(null)

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
        const res = await apiFetch(`/cards`)
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
        apiFetch(`/cards/${card.id}/variables`),
        apiFetch(`/cards/${card.id}/containers`),
        apiFetch(`/cards/${card.id}/images`),
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
      const res = await apiFetch(`/cards/${card.id}/containers/layout`, {
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

  const handleCalculated = useCallback((results) => {
    setLastResults(results)
    setSaveMsg(null)
  }, [])

  const handleSaveRecord = async () => {
    if (!card || !lastResults) return
    setSaving(true)
    setSaveMsg(null)
    try {
      const res = await apiFetch('/records', {
        method: 'POST',
        body: JSON.stringify({
          card_id: card.id,
          title: recordTitle,
          // 화면이 보여 준 바로 그 숫자를 보낸다. 서버가 다시 계산해 넣으면
          // 둘이 어긋나는 날 어느 쪽을 믿어야 할지 알 수 없게 된다.
          inputs: inputValues,
          results: lastResults,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setSaveMsg({ error: true, text: body.error || '기록을 저장하지 못했습니다.' })
        return
      }
      setRecordTitle('')
      setSaveMsg({ error: false, text: `'${body.title}' 로 저장했습니다.` })
    } catch (err) {
      setSaveMsg({ error: true, text: '기록을 저장하지 못했습니다: ' + err.message })
    } finally {
      setSaving(false)
    }
  }

  const renderSingleMode = () => (
    <>
      <InputVariables
        variables={variables}
        containers={containers}
        images={images}
        values={inputValues}
        onChange={setInputValues}
        editMode={editMode}
        onLayoutChange={handleLayoutChange}
        onCalculated={handleCalculated}
      />

      {lastResults && !editMode && (
        <SaveBar>
          <SaveHint>
            이 계산을 남겨 두면 나중에 그때 값을 그대로 다시 볼 수 있습니다.
          </SaveHint>
          <SaveInput
            value={recordTitle}
            onChange={(e) => setRecordTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && recordTitle.trim()) handleSaveRecord() }}
            placeholder="무슨 계산인가요? 예: Model X 브래킷 볼트"
            maxLength={200}
          />
          <SaveBtn onClick={handleSaveRecord} disabled={saving || !recordTitle.trim()}>
            {saving ? '저장 중…' : '기록 저장'}
          </SaveBtn>
          {saveMsg && <SaveMsg $error={saveMsg.error}>{saveMsg.text}</SaveMsg>}
        </SaveBar>
      )}
    </>
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
        onHistory={card ? () => setShowHistory(true) : undefined}
        onValidate={card ? () => setShowValidation(true) : undefined}
        editMode={mode === 'single' ? editMode : false}
        onToggleEditMode={mode === 'single' ? () => setEditMode(prev => !prev) : undefined}
      >
        {card?.ai_edited_after_publish && (
          <Banner $warn>
            <BannerTitle>게시 후 AI 가 이 카드를 수정했습니다</BannerTitle>
            게시할 때 사람이 확인한 내용과 지금 내용이 다를 수 있습니다.
            결과를 쓰기 전에 수식을 한 번 살펴보세요.
          </Banner>
        )}
        {card?.status === 'draft' && (
          <Banner>
            <BannerTitle>초안입니다 — 아직 다른 사람에게 보이지 않습니다</BannerTitle>
            {card.origin === 'mcp'
              ? 'AI 가 만든 카드입니다. 계산이 돈다는 것과 값이 맞다는 것은 다릅니다 — 숫자를 확인한 뒤 홈에서 게시하세요.'
              : '홈 화면에서 게시하면 모두가 쓸 수 있게 됩니다.'}
          </Banner>
        )}

        <ModeTabs>
          <ModeTab $active={mode === 'single'} onClick={() => setMode('single')}>단일 계산</ModeTab>
          <ModeTab $active={mode === 'doe'} onClick={() => setMode('doe')}>DOE 탐색</ModeTab>
        </ModeTabs>

        {mode === 'single' ? renderSingleMode() : renderDoeMode()}
      </ModuleLayout>

      {showValidation && card && (
        <ValidationPanel
          cardId={card.id}
          cardName={card.name}
          values={inputValues}
          onClose={() => setShowValidation(false)}
        />
      )}

      {showHistory && card && (
        <HistoryPanel
          cardId={card.id}
          cardName={card.name}
          canRestore={!!user && (user.is_admin || user.id === card.created_by_id)}
          onClose={() => setShowHistory(false)}
          onRestored={fetchData}
        />
      )}

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
