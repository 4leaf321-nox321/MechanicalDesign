import React, { useState, useEffect, useRef } from 'react'
import styled from 'styled-components'
import VariableForm from './VariableForm'
import ContainerTab from './ContainerTab'
import ImageTab from './ImageTab'
import WidgetLayoutTab from './WidgetLayoutTab'
import { apiFetch } from '../../api/client'
import { TabPane, TabScroll, TabToolbar } from './TabLayout'
import { useDragAutoScroll } from '../../utils/useDragAutoScroll'
import { placedContainerIds } from '../../utils/placements'
import TableDefinitionTab from './TableDefinitionTab'


// ============================================
// Styled Components
// ============================================
const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  justify-content: center;
  align-items: center;
`

const Modal = styled.div`
  width: 80vw;
  height: 80vh;
  background: white;
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  overflow: hidden;
`

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 28px;
  border-bottom: 1px solid #eee;
  flex-shrink: 0;
`

const ModalTitle = styled.h2`
  font-size: 1.3rem;
  font-weight: 600;
  color: #333;
  margin: 0;
`

const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 1.5rem;
  color: #999;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  &:hover { background: #f0f0f0; color: #333; }
`

const TabBar = styled.div`
  display: flex;
  border-bottom: 1px solid #eee;
  padding: 0 28px;
  flex-shrink: 0;
`

const Tab = styled.button`
  padding: 12px 24px;
  border: none;
  background: none;
  font-size: 0.95rem;
  font-weight: 500;
  color: ${props => props.$active ? '#3498db' : '#888'};
  border-bottom: 2px solid ${props => props.$active ? '#3498db' : 'transparent'};
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    color: #3498db;
  }
`

// **여기서 스크롤하지 않는다.** 툴바(추가·업로드 줄)를 스크롤 밖에 두려면
// 스크롤 컨테이너가 그 아래에 있어야 한다 — TabLayout 의 TabScroll 이 맡는다.
// 아래쪽 padding 도 주지 않는다. 주면 스크롤 영역이 그 위에서 잘려 마지막
// 항목과 모달 바닥 사이에 죽은 띠가 생긴다(TabScroll 이 padding-bottom 을 갖는다).
const ModalBody = styled.div`
  flex: 1;
  min-height: 0;
  padding: 24px 28px 0 28px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`

const AddButton = styled.button`
  width: 100%;
  padding: 12px;
  border: 2px dashed #ddd;
  border-radius: 8px;
  background: white;
  color: #888;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
  &:hover { border-color: #3498db; color: #3498db; background: #f8fbff; }
`

/**
 * 목록을 여러 열로 편다.
 *
 * 한 열이면 카드가 모달 너비만큼 늘어나 **이름 한 줄에 빈 공간이 한 뼘**
 * 남는다. 정작 세로로는 길어져서, 변수가 스무 개면 아래쪽은 스크롤해야만
 * 보인다. 자동 채움으로 두면 모달이 좁을 때는 한 열, 넓을 때는 두세 열이
 * 되어 어느 쪽으로도 낭비가 없다.
 *
 * `minmax(N, 1fr)` 의 N 은 **카드가 읽히는 최소 너비**다. 이보다 좁아지면
 * 이름이 잘리고 배지가 줄바꿈돼 오히려 알아보기 어렵다.
 */
const VarGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
  align-items: start;
`

const VariableCard = styled.div`
  background: #f8f9fa;
  border: 1px solid ${p => p.$dragging ? '#3498db' : '#e9ecef'};
  border-radius: 8px;
  padding: 16px;
  opacity: ${p => p.$dragging ? 0.4 : 1};
  display: flex;
  gap: 10px;
  align-items: stretch;
  transition: border-color 0.15s, box-shadow 0.15s;
  ${p => p.$dropBefore && dropEdge(p.$multiColumn ? 'left' : 'top')}
`

/** 맨 뒤에 놓을 때. 마지막 카드 뒤에는 칠할 카드가 없어 빈 칸 하나를 세운다. */
const DropTail = styled.div`
  border: 2px dashed #3498db;
  border-radius: 8px;
  min-height: 56px;
  opacity: 0.7;
`

const DragHandle = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  flex-shrink: 0;
  color: #bbb;
  cursor: grab;
  font-size: 1rem;
  line-height: 1;
  user-select: none;
  border-radius: 4px;
  &:hover { background: #e9ecef; color: #555; }
  &:active { cursor: grabbing; }
`

const VarBody = styled.div`
  flex: 1;
  min-width: 0;
`

/**
 * 끼워 넣을 자리 표시.
 *
 * 전에는 카드 사이에 **가로선 한 줄을 끼워 넣었다.** 한 열일 때는 맞았지만
 * 격자에서는 그 선이 **자기 칸을 하나 차지해** 뒤 카드가 통째로 밀린다 —
 * 드래그하는 동안 목록이 출렁이고, 정작 어디에 놓이는지는 더 알기 어렵다.
 *
 * 그래서 선을 넣지 않고 대상 카드의 **모서리를 칠한다.** 열이 여럿이면
 * 왼쪽(그 앞에 들어간다), 한 열이면 위쪽이다. 자리를 차지하지 않으므로
 * 아무것도 밀리지 않는다.
 */
const dropEdge = (side) => `
  box-shadow: inset ${side === 'left' ? '3px 0 0 0' : '0 3px 0 0'} #3498db;
`

const VarHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
`

const VarName = styled.span`
  font-weight: 600;
  color: #333;
  font-size: 0.95rem;
`

const VarActions = styled.div`
  display: flex;
  gap: 4px;
`

const IconBtn = styled.button`
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 0.85rem;
  &:hover { background: #e9ecef; color: ${props => props.$danger ? '#e74c3c' : '#333'}; }
`

const Badge = styled.span`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
  margin-right: 6px;
  background: ${props => props.$bg || '#eee'};
  color: ${props => props.$color || '#666'};
`

const VarMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  flex-wrap: wrap;
`

const VarDetail = styled.span`
  font-size: 0.8rem;
  color: #999;
`

const EmptyState = styled.div`
  text-align: center;
  padding: 48px 24px;
  color: #bbb;
  font-size: 0.95rem;
`

// ============================================
// Component
// ============================================
function SettingsPanel({ cardId, onClose }) {
  const [activeTab, setActiveTab] = useState('containers')
  const [variables, setVariables] = useState([])
  const [containers, setContainers] = useState([])
  const [images, setImages] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingVar, setEditingVar] = useState(null)
  const [draggingVarId, setDraggingVarId] = useState(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)

  // 드래그 중에는 휠이 먹지 않는다. 가장자리에 대면 목록이 따라 움직이게 한다.
  const varScrollRef = useRef(null)
  const varGridRef = useRef(null)
  // 표시 방향(왼쪽/위)을 정하는 데 쓴다. 드래그를 시작할 때 한 번 재고 그대로
  // 쓴다 — 매 프레임 getComputedStyle 을 부르면 드래그가 눈에 띄게 무거워진다.
  const [multiColumn, setMultiColumn] = useState(false)
  useDragAutoScroll(varScrollRef, draggingVarId !== null)

  useEffect(() => {
    fetchContainers()
    fetchVariables()
    fetchImages()
  }, [cardId])

  const fetchVariables = async () => {
    try {
      const res = await apiFetch(`/cards/${cardId}/variables`)
      setVariables(await res.json())
    } catch (err) {
      console.error('Failed to fetch variables:', err)
    }
  }

  const fetchContainers = async () => {
    try {
      const res = await apiFetch(`/cards/${cardId}/containers`)
      setContainers(await res.json())
    } catch (err) {
      console.error('Failed to fetch containers:', err)
    }
  }

  const fetchImages = async () => {
    try {
      const res = await apiFetch(`/cards/${cardId}/images`)
      if (res.ok) setImages(await res.json())
    } catch (err) {
      console.error('Failed to fetch images:', err)
    }
  }

  /**
   * 폼에 채워 넣을 값. `editingVar` 와 **다른 것**이다.
   *
   *   편집  editingVar = 그 변수, formInitial = 그 변수      → PUT
   *   추가  editingVar = null,   formInitial = null         → POST
   *   복사  editingVar = null,   formInitial = 원본의 사본  → POST
   */
  const [formInitial, setFormInitial] = useState(null)

  const handleSaveVariable = async (formData) => {
    try {
      const url = editingVar
        ? `/cards/${cardId}/variables/${editingVar.id}`
        : `/cards/${cardId}/variables`
      const method = editingVar ? 'PUT' : 'POST'

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!res.ok) {
        const err = await res.json()
        return err.error || '저장에 실패했습니다.'
      }

      await fetchVariables()
      setShowForm(false)
      setEditingVar(null)
      return null
    } catch {
      return '서버와 통신할 수 없습니다.'
    }
  }

  const handleDeleteVariable = async (varId) => {
    try {
      await apiFetch(`/cards/${cardId}/variables/${varId}`, { method: 'DELETE' })
      setVariables(prev => prev.filter(v => v.id !== varId))
    } catch (err) {
      console.error('Failed to delete variable:', err)
    }
  }

  const handleEdit = (variable) => {
    setEditingVar(variable)
    setFormInitial(variable)
    setShowForm(true)
  }

  const handleAdd = () => {
    setEditingVar(null)
    setFormInitial(null)
    setShowForm(true)
  }

  /**
   * 변수를 복사한다 — 값만 채워 주고 **저장은 사람이 누른다.**
   *
   * 바로 만들어 버리면 기호가 겹친 변수가 조용히 하나 더 생긴다. 계산은
   * 그대로 돌고 검증에서만 경고가 뜨는데, 그 경고를 볼 이유가 없는
   * 사람은 겹친 채로 쓰게 된다. 폼을 열어 두면 그 자리에서 고친다.
   *
   * 표·조건부·보간표 정의까지 통째로 따라온다 — 열 줄짜리 표를 다시
   * 입력하지 않으려고 쓰는 기능이다.
   */
  const handleDuplicate = (variable) => {
    const copy = { ...variable }
    delete copy.id
    delete copy.placements
    copy.name = nextFreeName(variable.name)
    copy.symbol = nextFreeSymbol(variable.symbol)
    setEditingVar(null)
    setFormInitial(copy)
    setShowForm(true)
  }

  /** '폭' → '폭 사본', 이미 있으면 '폭 사본 2'. */
  const nextFreeName = (name) => {
    const taken = new Set(variables.map(v => v.name))
    let candidate = (name || '변수') + ' 사본'
    let n = 2
    while (taken.has(candidate)) { candidate = (name || '변수') + ' 사본 ' + n; n += 1 }
    return candidate
  }

  /**
   * 'W' → 'W2'. 비어 있으면 비운 채로 둔다.
   *
   * 기호를 그대로 두면 겹친다. 겹친 기호는 수식에서 **어느 쪽을 가리키는지
   * 알 수 없게** 만드는데, 그 상태로도 계산은 돌아서 눈에 띄지 않는다.
   */
  const nextFreeSymbol = (symbol) => {
    if (!symbol) return ''
    const taken = new Set(variables.map(v => v.symbol).filter(Boolean))
    const base = symbol.replace(/[0-9]+$/, '') || symbol
    let n = 2
    while (taken.has(base + n)) n += 1
    return base + n
  }

  const handleCancel = () => {
    setFormInitial(null)
    setShowForm(false)
    setEditingVar(null)
  }

  const handleVarDragStart = (e, varId) => {
    setMultiColumn(varColumnCount() > 1)
    setDraggingVarId(varId)
    e.dataTransfer.effectAllowed = 'move'
    try { e.dataTransfer.setData('text/plain', String(varId)) } catch {}
  }

  /**
   * 어느 자리에 끼울지 정한다.
   *
   * **열이 여럿이면 좌우로 판단한다.** 한 열일 때는 카드 위/아래가 곧
   * 앞/뒤지만, 두 열이 되면 같은 줄의 오른쪽 카드가 '다음' 이다. 그때도
   * 위아래로 재면 옆 칸으로 옮기려는 동작이 전부 같은 자리로 읽힌다.
   */
  const handleVarDragOver = (e, idx) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const before = multiColumn
      ? e.clientX < rect.left + rect.width / 2
      : e.clientY < rect.top + rect.height / 2
    setDragOverIdx(before ? idx : idx + 1)
  }

  /** 지금 몇 열로 그려져 있나. 화면 너비에 따라 바뀌므로 그때그때 읽는다. */
  const varColumnCount = () => {
    const el = varGridRef.current
    if (!el) return 1
    const cols = window.getComputedStyle(el).gridTemplateColumns
    return cols ? cols.split(' ').filter(Boolean).length : 1
  }

  const handleVarDragEnd = () => {
    setDraggingVarId(null)
    setDragOverIdx(null)
  }

  const handleVarDrop = async (e) => {
    e.preventDefault()
    const srcId = draggingVarId
    const insertAt = dragOverIdx
    handleVarDragEnd()
    if (srcId == null || insertAt == null) return

    const srcIdx = variables.findIndex(v => v.id === srcId)
    if (srcIdx < 0) return

    const next = [...variables]
    const [moved] = next.splice(srcIdx, 1)
    let target = insertAt
    if (srcIdx < insertAt) target -= 1
    if (target < 0) target = 0
    if (target > next.length) target = next.length
    next.splice(target, 0, moved)

    if (next.every((v, i) => v.id === variables[i].id)) return

    setVariables(next)

    const payload = {
      variables: next.map((v, i) => ({ id: v.id, sort_order: i })),
    }
    try {
      await apiFetch(`/cards/${cardId}/widgets/layout`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } catch (err) {
      console.error('변수 순서 저장 실패', err)
      fetchVariables()
    }
  }

  const getContainerName = (containerId) => {
    const c = containers.find(ct => ct.id === containerId)
    return c ? c.name : null
  }

  const getCategoryBadge = (category) => {
    if (category === 'input') return <Badge $bg="#e3f2fd" $color="#1976d2">Input</Badge>
    if (category === 'intermediate') return <Badge $bg="#fff8e1" $color="#f57c00">Intermediate</Badge>
    return <Badge $bg="#fce4ec" $color="#c62828">Output</Badge>
  }

  const getTypeBadge = (varType) => {
    const map = {
      slider: { label: '슬라이더', bg: '#e8f5e9', color: '#2e7d32' },
      text: { label: '텍스트', bg: '#fff3e0', color: '#e65100' },
      dropdown: { label: '드롭다운', bg: '#ede7f6', color: '#5e35b1' },
      formula: { label: '수식', bg: '#f3e5f5', color: '#7b1fa2' },
      table: { label: '테이블', bg: '#e0f7fa', color: '#00838f' },
      interp_table: { label: '보간 테이블', bg: '#e0f2f1', color: '#00695c' },
      conditional: { label: '조건부', bg: '#fff3e0', color: '#ef6c00' },
    }
    const info = map[varType] || { label: varType, bg: '#eee', color: '#666' }
    return <Badge $bg={info.bg} $color={info.color}>{info.label}</Badge>
  }

  return (
    <Overlay onClick={onClose}>
      <Modal onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>설정</ModalTitle>
          <CloseButton onClick={onClose}>✕</CloseButton>
        </ModalHeader>

        <TabBar>
          <Tab $active={activeTab === 'containers'} onClick={() => { setActiveTab('containers'); setShowForm(false) }}>
            컨테이너 정의
          </Tab>
          <Tab $active={activeTab === 'variables'} onClick={() => { setActiveTab('variables'); setShowForm(false) }}>
            변수 정의
          </Tab>
          <Tab $active={activeTab === 'tables'} onClick={() => { setActiveTab('tables'); setShowForm(false) }}>
            표 정의
          </Tab>
          <Tab $active={activeTab === 'images'} onClick={() => { setActiveTab('images'); setShowForm(false) }}>
            이미지 정의
          </Tab>
          <Tab $active={activeTab === 'layout'} onClick={() => { setActiveTab('layout'); setShowForm(false) }}>
            위젯 배치
          </Tab>
        </TabBar>

        <ModalBody>
          {activeTab === 'containers' && (
            <ContainerTab
              cardId={cardId}
              containers={containers}
              onRefresh={fetchContainers}
            />
          )}

          {activeTab === 'variables' && (
            <TabPane>
              {showForm ? (
                <TabScroll>
                  <VariableForm
                    initial={formInitial}
                    containers={containers}
                    variables={variables}
                    onSave={handleSaveVariable}
                    onCancel={handleCancel}
                  />
                </TabScroll>
              ) : (
                <>
                  <TabToolbar>
                    <AddButton onClick={handleAdd}>+ 변수 추가</AddButton>
                  </TabToolbar>
                  <TabScroll ref={varScrollRef}>
                  {variables.length === 0 ? (
                    <EmptyState>정의된 변수가 없습니다.</EmptyState>
                  ) : (
                    <VarGrid ref={varGridRef}>
                    {variables.map((v, idx) => (
                      <React.Fragment key={v.id}>
                        <VariableCard
                          $dragging={draggingVarId === v.id}
                          $dropBefore={dragOverIdx === idx && draggingVarId !== null}
                          $multiColumn={multiColumn}
                          onDragOver={(e) => handleVarDragOver(e, idx)}
                          onDrop={handleVarDrop}
                        >
                          <DragHandle
                            draggable
                            onDragStart={(e) => handleVarDragStart(e, v.id)}
                            onDragEnd={handleVarDragEnd}
                            title="드래그해서 순서 변경"
                          >
                            <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
                              <circle cx="2" cy="3" r="1.3" />
                              <circle cx="8" cy="3" r="1.3" />
                              <circle cx="2" cy="8" r="1.3" />
                              <circle cx="8" cy="8" r="1.3" />
                              <circle cx="2" cy="13" r="1.3" />
                              <circle cx="8" cy="13" r="1.3" />
                            </svg>
                          </DragHandle>
                          <VarBody>
                        <VarHeader>
                          <VarName>
                            {v.name}
                            {v.symbol && <VarDetail style={{ marginLeft: 8, fontWeight: 400 }}>({v.symbol})</VarDetail>}
                          </VarName>
                          <VarActions>
                            <IconBtn onClick={() => handleEdit(v)}>편집</IconBtn>
                            <IconBtn onClick={() => handleDuplicate(v)} title="이 변수를 복사해 새로 만듭니다">복사</IconBtn>
                            <IconBtn $danger onClick={() => handleDeleteVariable(v.id)}>삭제</IconBtn>
                          </VarActions>
                        </VarHeader>
                        <VarMeta>
                          {getCategoryBadge(v.category)}
                          {getTypeBadge(v.var_type)}
                          {v.unit && <VarDetail>[{v.unit}]</VarDetail>}
                          {v.var_type === 'slider' && (
                            <VarDetail>범위: {v.min_value} ~ {v.max_value}</VarDetail>
                          )}
                          {v.var_type === 'formula' && v.formula && (
                            <VarDetail style={{ fontFamily: 'Consolas, Monaco, monospace' }}>
                              = {v.formula}
                            </VarDetail>
                          )}
                          {v.var_type === 'interp_table' && (() => {
                            try {
                              const t = JSON.parse(v.interp_data || '{}')
                              const xCol = t.columns?.[t.x_column_index] || 'x'
                              const yCol = t.columns?.[t.y_column_index] || 'y'
                              return (
                                <VarDetail style={{ fontFamily: 'Consolas, Monaco, monospace' }}>
                                  {xCol} = {t.x_expression || '?'} → {yCol} (선형 보간)
                                </VarDetail>
                              )
                            } catch { return null }
                          })()}
                          {v.var_type === 'table' && (() => {
                            try {
                              const t = JSON.parse(v.table_data || '{}')
                              const resCol = t.columns?.[t.result_column_index] || '?'
                              const keyList = Array.isArray(t.keys) && t.keys.length > 0
                                ? t.keys
                                : (t.key_column_index != null ? [{ column_index: t.key_column_index, expression: t.key_expression }] : [])
                              const keyDesc = keyList
                                .map(k => `${t.columns?.[k.column_index] || '?'} = ${k.expression || '?'}`)
                                .join(' & ')
                              return (
                                <VarDetail style={{ fontFamily: 'Consolas, Monaco, monospace' }}>
                                  {keyDesc || '?'} → {resCol}
                                </VarDetail>
                              )
                            } catch { return null }
                          })()}
                          {v.var_type === 'dropdown' && (() => {
                            try {
                              const opts = JSON.parse(v.options_data || '[]')
                              if (!Array.isArray(opts) || opts.length === 0) return null
                              const preview = opts.slice(0, 3).join(', ')
                              return (
                                <VarDetail>
                                  옵션: {preview}{opts.length > 3 ? ` 외 ${opts.length - 3}개` : ''}
                                </VarDetail>
                              )
                            } catch { return null }
                          })()}
                          {v.var_type === 'conditional' && (() => {
                            try {
                              const c = JSON.parse(v.conditional_data || '{}')
                              const count = (c.branches || []).filter(b => b.condition?.trim()).length
                              return (
                                <VarDetail>
                                  분기 {count}개{c.default_formula ? ' + else' : ''}
                                </VarDetail>
                              )
                            } catch { return null }
                          })()}
                          {/* 여러 컨테이너에 놓일 수 있으므로 배치마다 하나씩 */}
                          {placedContainerIds(v).map(cid => (
                            <Badge key={cid} $bg="#e0f2f1" $color="#00695c">
                              {getContainerName(cid)}
                            </Badge>
                          ))}
                        </VarMeta>
                          </VarBody>
                        </VariableCard>
                      </React.Fragment>
                    ))}
                    {dragOverIdx === variables.length && draggingVarId !== null && <DropTail />}
                    </VarGrid>
                  )}
                  </TabScroll>
                </>
              )}
            </TabPane>
          )}

          {/* 표 정의는 카드에 묶이지 않는다 — 여기서 만든 표를 어느 카드의
              변수에서든 참조할 수 있다. 그래서 cardId 를 넘기지 않는다. */}
          {activeTab === 'tables' && <TableDefinitionTab />}

          {activeTab === 'images' && (
            <ImageTab
              cardId={cardId}
              images={images}
              onRefresh={fetchImages}
            />
          )}

          {activeTab === 'layout' && (
            <TabScroll>
              <WidgetLayoutTab
                cardId={cardId}
                variables={variables}
                images={images}
                containers={containers}
                onRefresh={() => { fetchVariables(); fetchImages() }}
              />
            </TabScroll>
          )}
        </ModalBody>
      </Modal>
    </Overlay>
  )
}

export default SettingsPanel
