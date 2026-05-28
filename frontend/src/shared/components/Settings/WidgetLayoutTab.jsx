import React, { useState, useMemo } from 'react'
import styled from 'styled-components'

const API_URL = import.meta.env.VITE_API_URL || '/api'

const Layout = styled.div`
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 20px;
  min-height: 400px;
`

const Panel = styled.div`
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  min-height: 200px;
`

const StickyPanel = styled(Panel)`
  position: sticky;
  top: 0;
  align-self: start;
  max-height: calc(80vh - 160px);
  overflow: hidden;
`

const PanelTitle = styled.h4`
  font-size: 0.9rem;
  font-weight: 600;
  color: #555;
  margin: 0 0 10px 0;
  padding-bottom: 6px;
  border-bottom: 1px solid #e9ecef;
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const ContainerLabel = styled.span`
  font-size: 0.95rem;
  font-weight: 600;
  color: #333;
`

const ContainerSub = styled.span`
  font-size: 0.7rem;
  font-weight: 500;
  color: #888;
`

const RightList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 100%;
`

const DropZone = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  border-radius: 6px;
  background: ${p => p.$over ? '#e3f2fd' : 'transparent'};
  transition: background 0.15s;
  ${p => p.$scrollable
    ? 'overflow-y: auto; min-height: 0;'
    : 'min-height: 60px;'}
`

const WidgetCard = styled.div`
  background: white;
  border: 1px solid ${p => p.$dragging ? '#3498db' : '#e0e0e0'};
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: grab;
  opacity: ${p => p.$dragging ? 0.4 : 1};
  user-select: none;
  transition: border-color 0.15s, box-shadow 0.15s;

  &:hover { border-color: #3498db; box-shadow: 0 2px 6px rgba(52, 152, 219, 0.15); }
  &:active { cursor: grabbing; }
`

const DropIndicator = styled.div`
  height: 2px;
  background: #3498db;
  border-radius: 1px;
  margin: 0 4px;
`

const KindBadge = styled.span`
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
  background: ${p => p.$kind === 'image' ? '#e0f7fa' : '#ede7f6'};
  color: ${p => p.$kind === 'image' ? '#00838f' : '#5e35b1'};
  flex-shrink: 0;
`

const CategoryBadge = styled.span`
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.68rem;
  font-weight: 500;
  background: ${p => {
    if (p.$cat === 'input') return '#e3f2fd'
    if (p.$cat === 'intermediate') return '#fff8e1'
    if (p.$cat === 'output') return '#fce4ec'
    return '#eee'
  }};
  color: ${p => {
    if (p.$cat === 'input') return '#1976d2'
    if (p.$cat === 'intermediate') return '#f57c00'
    if (p.$cat === 'output') return '#c62828'
    return '#666'
  }};
  flex-shrink: 0;
`

const WidgetName = styled.span`
  font-size: 0.9rem;
  color: #333;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const SymbolText = styled.span`
  font-size: 0.75rem;
  color: #7b1fa2;
  font-family: 'Consolas', 'Monaco', monospace;
  flex-shrink: 0;
`

const Thumb = styled.img`
  width: 32px;
  height: 32px;
  object-fit: contain;
  background: #fafafa;
  border: 1px solid #eee;
  border-radius: 3px;
  flex-shrink: 0;
`

const EmptyHint = styled.div`
  padding: 12px 8px;
  color: #bbb;
  font-size: 0.8rem;
  text-align: center;
`

function WidgetCardView({ widget, dragging, onDragStart, onDragEnd, cardId }) {
  return (
    <WidgetCard
      draggable
      $dragging={dragging}
      onDragStart={(e) => onDragStart(e, widget.uid)}
      onDragEnd={onDragEnd}
    >
      <KindBadge $kind={widget.kind}>{widget.kind === 'image' ? '이미지' : '변수'}</KindBadge>
      {widget.kind === 'variable' && widget.category && (
        <CategoryBadge $cat={widget.category}>
          {widget.category === 'input' ? 'In' : widget.category === 'intermediate' ? 'Mid' : 'Out'}
        </CategoryBadge>
      )}
      {widget.kind === 'image' && (
        <Thumb src={`${API_URL}/cards/${cardId}/images/${widget.id}/file`} alt={widget.name} />
      )}
      <WidgetName title={widget.name}>{widget.name}</WidgetName>
      {widget.symbol && <SymbolText>({widget.symbol})</SymbolText>}
    </WidgetCard>
  )
}

function WidgetLayoutTab({ cardId, variables, images, containers, onRefresh }) {
  const [dragging, setDragging] = useState(null)       // dragged widget uid
  const [dragOver, setDragOver] = useState(null)       // { bucket: 'unassigned' | container_id, index }

  const widgets = useMemo(() => {
    const all = [
      ...variables.map(v => ({
        kind: 'variable', id: v.id, uid: `v-${v.id}`,
        name: v.name, category: v.category, symbol: v.symbol,
        container_id: v.container_id, sort_order: v.sort_order || 0,
      })),
      ...images.map(i => ({
        kind: 'image', id: i.id, uid: `i-${i.id}`,
        name: i.filename,
        container_id: i.container_id, sort_order: i.sort_order || 0,
      })),
    ]
    return all
  }, [variables, images])

  const sortWidgets = (ws) => [...ws].sort((a, b) => (a.sort_order - b.sort_order) || a.uid.localeCompare(b.uid))

  const unassigned = sortWidgets(widgets.filter(w => !w.container_id))
  const byContainer = useMemo(() => {
    const map = {}
    containers.forEach(c => {
      map[c.id] = sortWidgets(widgets.filter(w => w.container_id === c.id))
    })
    return map
  }, [widgets, containers])

  const handleDragStart = (e, uid) => {
    setDragging(uid)
    e.dataTransfer.effectAllowed = 'move'
    try { e.dataTransfer.setData('text/plain', uid) } catch {}
  }

  const handleDragEnd = () => {
    setDragging(null)
    setDragOver(null)
  }

  const bucketKey = (containerIdOrNull) => containerIdOrNull === null ? 'unassigned' : String(containerIdOrNull)

  const handleItemDragOver = (e, bucket, index) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const midY = rect.top + rect.height / 2
    const insertIndex = e.clientY < midY ? index : index + 1
    setDragOver({ bucket, index: insertIndex })
  }

  const handleZoneDragOver = (e, bucket, lastIndex) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!dragOver || dragOver.bucket !== bucket) {
      setDragOver({ bucket, index: lastIndex })
    }
  }

  const handleDrop = async (e, bucket) => {
    e.preventDefault()
    e.stopPropagation()
    const uid = dragging
    const over = dragOver
    handleDragEnd()
    if (!uid || !over || over.bucket !== bucket) return

    const current = widgets.find(w => w.uid === uid)
    if (!current) return

    const targetContainerId = bucket === 'unassigned' ? null : Number(bucket)
    const srcBucket = bucketKey(current.container_id)

    // 원본 리스트에서 제거
    let srcList = srcBucket === 'unassigned' ? [...unassigned] : [...(byContainer[Number(srcBucket)] || [])]
    const srcOrigIdx = srcList.findIndex(w => w.uid === uid)
    if (srcOrigIdx >= 0) srcList.splice(srcOrigIdx, 1)

    // 타깃 리스트 계산
    let targetList
    if (srcBucket === bucket) {
      targetList = srcList
    } else {
      targetList = bucket === 'unassigned' ? [...unassigned] : [...(byContainer[Number(bucket)] || [])]
    }

    // 삽입 인덱스 보정 (같은 리스트 내에서 원본 제거 반영)
    let insertIdx = over.index
    if (srcBucket === bucket && srcOrigIdx >= 0 && srcOrigIdx < over.index) {
      insertIdx = over.index - 1
    }
    if (insertIdx < 0) insertIdx = 0
    if (insertIdx > targetList.length) insertIdx = targetList.length

    const moved = { ...current, container_id: targetContainerId }
    targetList.splice(insertIdx, 0, moved)

    // 업데이트 페이로드
    const payload = { variables: [], images: [] }
    const pushEntry = (list, w, container_id) => {
      list.forEach((item, idx) => {
        const entry = { id: item.id, container_id, sort_order: idx }
        if (item.kind === 'variable') payload.variables.push(entry)
        else payload.images.push(entry)
      })
    }
    if (srcBucket !== bucket) {
      const srcContainerId = srcBucket === 'unassigned' ? null : Number(srcBucket)
      pushEntry(srcList, null, srcContainerId)
    }
    pushEntry(targetList, null, targetContainerId)

    try {
      await fetch(`${API_URL}/cards/${cardId}/widgets/layout`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      onRefresh()
    } catch (err) {
      console.error('위젯 배치 저장 실패', err)
    }
  }

  const renderList = (list, bucket, scrollable = false) => (
    <DropZone
      $over={dragOver?.bucket === bucket}
      $scrollable={scrollable}
      onDragOver={(e) => handleZoneDragOver(e, bucket, list.length)}
      onDrop={(e) => handleDrop(e, bucket)}
    >
      {list.length === 0 && <EmptyHint>여기로 드래그해서 배치</EmptyHint>}
      {list.map((w, idx) => (
        <React.Fragment key={w.uid}>
          {dragOver?.bucket === bucket && dragOver.index === idx && <DropIndicator />}
          <div onDragOver={(e) => handleItemDragOver(e, bucket, idx)}>
            <WidgetCardView
              widget={w}
              dragging={dragging === w.uid}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              cardId={cardId}
            />
          </div>
        </React.Fragment>
      ))}
      {dragOver?.bucket === bucket && dragOver.index >= list.length && <DropIndicator />}
    </DropZone>
  )

  return (
    <Layout>
      <StickyPanel>
        <PanelTitle>
          <span>미배정</span>
          <ContainerSub>{unassigned.length}개</ContainerSub>
        </PanelTitle>
        {renderList(unassigned, 'unassigned', true)}
      </StickyPanel>

      <RightList>
        {containers.length === 0 && (
          <EmptyHint>먼저 "컨테이너 정의"에서 컨테이너를 만들어주세요.</EmptyHint>
        )}
        {containers.map(c => (
          <Panel key={c.id}>
            <PanelTitle>
              <ContainerLabel>{c.name}</ContainerLabel>
              <ContainerSub>
                {c.container_type && c.container_type !== 'default' && `${c.container_type} · `}
                {c.column_count || 1}열 · {byContainer[c.id]?.length || 0}개
              </ContainerSub>
            </PanelTitle>
            {renderList(byContainer[c.id] || [], String(c.id))}
          </Panel>
        ))}
      </RightList>
    </Layout>
  )
}

export default WidgetLayoutTab
