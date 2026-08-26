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
import RecordPicker from './RecordPicker'
import { mapRecordInputs } from '../utils/loadCardInputs'
import GoalSeekPanel from './GoalSeekPanel'
import SensitivityPanel from './SensitivityPanel'
import { useAuth } from '../auth/AuthContext'


/**
 * 카드 상태 배너.
 *
 * **목록의 배지만으로는 부족하다.** 사람은 주소를 저장해 두고 카드로 바로
 * 들어오며, 실제로 그 숫자를 보고 판단하는 자리가 여기다. 목록을 거쳐 오지
 * 않은 사람에게는 배지가 아예 보이지 않는다.
 */
const Banner = styled.div`
  border-radius: var(--radius);
  padding: 12px 16px;
  margin-bottom: 16px;
  font-size: 0.88rem;
  line-height: 1.55;
  background: ${p => (p.$warn ? 'hsl(var(--danger-soft))' : 'hsl(var(--warn-soft))')};
  border: 1px solid ${p => (p.$warn ? 'hsl(var(--danger-border))' : 'hsl(var(--warn-border))')};
  color: ${p => (p.$warn ? 'hsl(var(--danger))' : 'hsl(var(--warn))')};
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
/** 계산 전 줄. 저장 바(계산 후)와 색을 달리해 둘을 헷갈리지 않게 한다. */
const LoadBar = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  background: hsl(var(--surface-2));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  padding: 10px 14px;
  margin-top: 16px;
`

const LoadBtn = styled.button`
  padding: 7px 14px;
  border: 1px solid hsl(var(--border-strong));
  border-radius: var(--radius);
  background: hsl(var(--surface));
  color: hsl(var(--fg-muted));
  font-size: 0.83rem;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    border-color: hsl(var(--primary));
    color: hsl(var(--primary));
  }
`

const LoadMsg = styled.span`
  font-size: 0.82rem;
  flex: 1 1 240px;
  color: ${p => (p.$warn ? 'hsl(var(--warn))' : 'hsl(var(--ok))')};
`

const SaveBar = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  background: hsl(var(--info-soft));
  border: 1px solid hsl(var(--info-border));
  border-radius: var(--radius);
  padding: 12px 14px;
  margin-top: 16px;
`

const SaveHint = styled.span`
  font-size: 0.85rem;
  color: hsl(var(--info));
  flex: 1 1 200px;
`

const SaveInput = styled.input`
  flex: 2 1 260px;
  padding: 9px 12px;
  border: 1px solid hsl(var(--info-border));
  border-radius: var(--radius);
  font-size: 0.9rem;

  &:focus {
    outline: none;
    border-color: hsl(var(--primary));
  }
`

const SaveBtn = styled.button`
  padding: 9px 18px;
  background: hsl(var(--primary));
  color: white;
  border: none;
  border-radius: var(--radius);
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;

  &:hover:not(:disabled) { background: hsl(var(--primary) / 0.8); }
  &:disabled { background: hsl(var(--border-strong)); cursor: not-allowed; }
`

const SaveMsg = styled.span`
  font-size: 0.85rem;
  font-weight: 600;
  color: ${p => (p.$error ? 'hsl(var(--danger))' : 'hsl(var(--ok))')};
  flex-basis: 100%;
`

/** 계산 방식 탭 + 오른쪽 끝의 도구. 탭만 담을 때는 줄을 다 안 썼다. */
const ModeRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
`

const ModeTabs = styled.div`
  display: flex;
  gap: 6px;
  padding: 4px;
  background: hsl(var(--surface-2));
  border-radius: var(--radius);
  width: fit-content;
`

const ModeTab = styled.button`
  padding: 8px 18px;
  border: none;
  border-radius: var(--radius);
  background: ${p => p.$active ? 'white' : 'transparent'};
  color: ${p => p.$active ? 'hsl(var(--fg))' : 'hsl(var(--fg-subtle))'};
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  box-shadow: ${p => p.$active ? '0 1px 3px rgba(0,0,0,0.12)' : 'none'};
  transition: all 0.15s;
  &:hover { color: hsl(var(--fg)); }
`

const DoeWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const DoeSubTabs = styled.div`
  display: flex;
  border-bottom: 2px solid hsl(var(--surface-2));
`

const DoeSubTab = styled.button`
  padding: 10px 20px;
  border: none;
  background: none;
  font-size: 0.95rem;
  font-weight: 500;
  color: ${p => p.$active ? 'hsl(var(--primary))' : 'hsl(var(--fg-subtle))'};
  border-bottom: 2px solid ${p => p.$active ? 'hsl(var(--primary))' : 'transparent'};
  margin-bottom: -2px;
  cursor: pointer;
  &:hover { color: hsl(var(--primary)); }
`

const RunRow = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  background: hsl(var(--surface));
  padding: 14px 18px;
  border-radius: var(--radius);
  border: 1px solid hsl(var(--border));
`

const RunBtn = styled.button`
  padding: 10px 22px;
  background: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary)));
  color: white;
  border: none;
  border-radius: var(--radius);
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  &:hover { background: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.8)); }
  &:disabled { background: hsl(var(--primary) / 0.45); cursor: not-allowed; }
`

const CountBadge = styled.span`
  font-size: 0.9rem;
  color: ${p => p.$warn ? 'hsl(var(--warn))' : 'hsl(var(--fg-muted))'};
  font-weight: 500;
`

const WarnMsg = styled.div`
  font-size: 0.8rem;
  color: hsl(var(--warn));
  margin-left: auto;
`

const MethodBar = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  background: hsl(var(--surface));
  padding: 12px 18px;
  border-radius: var(--radius);
  border: 1px solid hsl(var(--border));
  flex-wrap: wrap;
`

const MethodToggle = styled.div`
  display: inline-flex;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  overflow: hidden;
`

const MethodBtn = styled.button`
  padding: 7px 14px;
  font-size: 0.85rem;
  background: ${p => p.$active ? 'hsl(var(--primary))' : 'white'};
  color: ${p => p.$active ? 'white' : 'hsl(var(--fg-muted))'};
  border: none;
  cursor: pointer;
  &:hover { background: ${p => p.$active ? 'hsl(var(--primary))' : 'hsl(var(--bg))'}; }
`

const MethodField = styled.label`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  color: hsl(var(--fg-muted));
`

const SmallNumInput = styled.input`
  width: 80px;
  padding: 6px 8px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  outline: none;
  &:focus { border-color: hsl(var(--primary)); }
`

const MethodHint = styled.div`
  font-size: 0.76rem;
  color: hsl(var(--fg-subtle));
  margin-left: auto;
`

function ModulePlaceholder({ onGoHome }) {
  const location = useLocation()
  const [card, setCard] = useState(null)
  const [variables, setVariables] = useState([])
  const [containers, setContainers] = useState([])
  // 도해 — 올린 그림이 아니라 값으로 그리는 형상. 이미지와 따로 둔다.
  const [figures, setFigures] = useState([])
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
  const [showLoadInputs, setShowLoadInputs] = useState(false)
  const [loadMsg, setLoadMsg] = useState(null)
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
        // **목록에서 고르지 않는다.** 전에는 `/cards` 를 통째로 받아 route 가
        // 같은 것을 찾았는데, 목록이 게시된 카드만 담게 되자 초안이 하나도
        // 열리지 않았다. 열 수 있는 카드와 목록에 보일 카드는 다른 질문이다.
        const currentPath = decodeURIComponent(location.pathname)
        const res = await apiFetch(`/cards/lookup?route=${encodeURIComponent(currentPath)}`)
        if (!res.ok) return
        const text = await res.text()
        if (text) setCard(JSON.parse(text))
      } catch (err) {
        console.error('Failed to fetch card:', err)
      }
    }
    fetchCard()
  }, [location.pathname])

  const fetchData = useCallback(async () => {
    if (!card) return
    try {
      const [varsRes, ctnsRes, imgsRes, figsRes] = await Promise.all([
        apiFetch(`/cards/${card.id}/variables`),
        apiFetch(`/cards/${card.id}/containers`),
        apiFetch(`/cards/${card.id}/images`),
        apiFetch(`/cards/${card.id}/figures`),
      ])
      if (varsRes.ok) {
        const text = await varsRes.text()
        if (text) setVariables(JSON.parse(text))
      }
      if (ctnsRes.ok) {
        const text = await ctnsRes.text()
        if (text) setContainers(JSON.parse(text))
      }
      if (figsRes.ok) {
        const text = await figsRes.text()
        if (text) setFigures(JSON.parse(text))
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

  /**
   * 고른 기록의 입력값을 화면에 채운다.
   *
   * **결과는 지운다.** 입력이 바뀌었는데 옛 결과가 남아 있으면, 그 숫자가
   * 방금 채운 입력으로 나온 것처럼 보인다 — 그 상태로 기록을 저장하면
   * 입력과 결과가 어긋난 기록이 남는다.
   *
   * 못 맞춘 입력이 있으면 개수를 말해 준다. 조용히 빠뜨리면 사람은 빈칸을
   * 못 본 채로 계산한다.
   */
  const handleLoadInputs = ({ values, matched, missing }, record) => {
    setInputValues(values)
    setLastResults(null)
    setShowLoadInputs(false)
    setLoadMsg(
      missing.length
        ? {
            warn: true,
            text: `'${record.title}' 의 입력 ${matched}개를 채웠습니다. `
              + `${missing.length}개는 지금 카드에 없어 빠졌습니다: ${missing.join(', ')}`,
          }
        : { text: `'${record.title}' 의 입력 ${matched}개를 채웠습니다. 계산 버튼을 눌러 주세요.` },
    )
  }

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
        figures={figures}
        values={inputValues}
        onChange={setInputValues}
        editMode={editMode}
        onLayoutChange={handleLayoutChange}
        onCalculated={handleCalculated}
      />

      {/* 무엇을 채웠고 무엇이 빠졌는지. 단추는 위로 갔지만 이 말은 값 옆에
          있어야 한다 — 빠진 칸을 찾아보게 만드는 말이라서다. */}
      {loadMsg && !editMode && (
        <LoadBar>
          <LoadMsg $warn={loadMsg.warn}>{loadMsg.text}</LoadMsg>
        </LoadBar>
      )}

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

        <ModeRow>
          <ModeTabs>
            <ModeTab $active={mode === 'single'} onClick={() => setMode('single')}>단일 계산</ModeTab>
            <ModeTab $active={mode === 'doe'} onClick={() => setMode('doe')}>DOE 탐색</ModeTab>
            <ModeTab $active={mode === 'goal'} onClick={() => setMode('goal')}>역계산</ModeTab>
            <ModeTab $active={mode === 'sens'} onClick={() => setMode('sens')}>민감도</ModeTab>
          </ModeTabs>
          {/* 불러오기는 **어느 방식에서든** 먼저 하는 일이라 탭 밖에 둔다. */}
          {!editMode && (
            <LoadBtn style={{ marginLeft: 'auto' }}
                     onClick={() => { setLoadMsg(null); setShowLoadInputs(true) }}>
              이전 입력 불러오기
            </LoadBtn>
          )}
        </ModeRow>

        {showLoadInputs && card && (
          <RecordPicker
            query={{ card_id: card.id }}
            note={<>고른 기록의 <b>입력값만</b> 지금 화면에 채웁니다. 결과는 계산 단추를 눌러 지금 수식으로 다시 냅니다 — 옛 숫자를 그대로 보여 주지 않습니다.</>}
            onPick={(full) => handleLoadInputs(
              mapRecordInputs(full, variables), full)}
            onClose={() => setShowLoadInputs(false)}
          />
        )}

        {mode === 'single' && renderSingleMode()}
        {mode === 'doe' && renderDoeMode()}
        {mode === 'sens' && (
          <SensitivityPanel variables={variables} values={inputValues} />
        )}
        {mode === 'goal' && (
          <GoalSeekPanel
            variables={variables}
            values={inputValues}
            onApply={(varId, value) => {
              // 찾은 값을 입력에 넣고 **단일 계산으로 돌려보낸다.** 역계산
              // 화면에 남겨 두면 그 값으로 카드 전체가 어떻게 되는지를 못 본다.
              setInputValues(prev => ({ ...prev, [varId]: value }))
              setLastResults(null)
              setMode('single')
            }}
          />
        )}
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
