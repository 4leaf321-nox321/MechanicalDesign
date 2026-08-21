import React, { useState, useEffect } from 'react'
import styled from 'styled-components'
import VariableForm from './VariableForm'
import ContainerTab from './ContainerTab'
import ImageTab from './ImageTab'
import WidgetLayoutTab from './WidgetLayoutTab'
import { apiFetch } from '../../api/client'
import { TabPane, TabScroll, TabToolbar } from './TabLayout'
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

const VariableCard = styled.div`
  background: #f8f9fa;
  border: 1px solid ${p => p.$dragging ? '#3498db' : '#e9ecef'};
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
  opacity: ${p => p.$dragging ? 0.4 : 1};
  display: flex;
  gap: 10px;
  align-items: stretch;
  transition: border-color 0.15s, box-shadow 0.15s;
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

const DropIndicator = styled.div`
  height: 2px;
  background: #3498db;
  border-radius: 1px;
  margin: -6px 4px 6px;
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
    setShowForm(true)
  }

  const handleAdd = () => {
    setEditingVar(null)
    setShowForm(true)
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingVar(null)
  }

  const handleVarDragStart = (e, varId) => {
    setDraggingVarId(varId)
    e.dataTransfer.effectAllowed = 'move'
    try { e.dataTransfer.setData('text/plain', String(varId)) } catch {}
  }

  const handleVarDragOver = (e, idx) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const midY = rect.top + rect.height / 2
    const insertIdx = e.clientY < midY ? idx : idx + 1
    setDragOverIdx(insertIdx)
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
                    initial={editingVar}
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
                  <TabScroll>
                  {variables.length === 0 ? (
                    <EmptyState>정의된 변수가 없습니다.</EmptyState>
                  ) : (
                    variables.map((v, idx) => (
                      <React.Fragment key={v.id}>
                        {dragOverIdx === idx && draggingVarId !== null && <DropIndicator />}
                        <VariableCard
                          $dragging={draggingVarId === v.id}
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
                    ))
                  )}
                  {dragOverIdx === variables.length && draggingVarId !== null && <DropIndicator />}
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
