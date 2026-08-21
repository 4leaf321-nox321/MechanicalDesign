import React, { useState, useMemo } from 'react'
import styled from 'styled-components'
import { apiFetch } from '../../api/client'
import AuthedImage from '../AuthedImage'


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

/**
 * 팔레트의 사용 횟수 배지.
 *
 * 몇 군데에 놓았는지가 팔레트에서 바로 보여야 한다. 배치가 여러 곳일 수 있게
 * 되면서, 컨테이너를 하나씩 열어 보지 않고는 "이 변수 어디에 뒀더라" 를 알 수
 * 없어졌기 때문이다. 0 은 아직 아무 데도 안 놓은 것이다.
 */
const UsageBadge = styled.span`
  font-size: 0.7rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 10px;
  flex-shrink: 0;
  background: ${p => (p.$count > 0 ? '#e3f2fd' : '#f0f0f0')};
  color: ${p => (p.$count > 0 ? '#1565c0' : '#bbb')};
`

const PaletteHint = styled.div`
  font-size: 0.72rem;
  color: #999;
  line-height: 1.45;
  padding: 0 2px 8px 2px;
`

const ErrorMsg = styled.p`
  color: #e74c3c;
  font-size: 0.85rem;
  margin: 0 0 12px 0;
`

function WidgetCardView({ widget, dragging, onDragStart, onDragEnd, cardId, usage }) {
  return (
    <WidgetCard
      draggable
      $dragging={dragging}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <KindBadge $kind={widget.kind}>{widget.kind === 'image' ? '이미지' : '변수'}</KindBadge>
      {widget.kind === 'variable' && widget.category && (
        <CategoryBadge $cat={widget.category}>
          {widget.category === 'input' ? 'In' : widget.category === 'intermediate' ? 'Mid' : 'Out'}
        </CategoryBadge>
      )}
      {widget.kind === 'image' && (
        <Thumb as={AuthedImage} path={`/cards/${cardId}/images/${widget.id}/file`} alt={widget.name} />
      )}
      <WidgetName title={widget.name}>{widget.name}</WidgetName>
      {widget.symbol && <SymbolText>({widget.symbol})</SymbolText>}
      {usage !== undefined && (
        <UsageBadge
          $count={usage}
          title={usage === 0 ? '아직 배치하지 않음' : `${usage}개 컨테이너에 배치됨`}
        >
          {usage}
        </UsageBadge>
      )}
    </WidgetCard>
  )
}

/**
 * 위젯 배치 — 왼쪽은 **팔레트**, 오른쪽은 컨테이너.
 *
 * 팔레트는 이 카드의 모든 위젯을 항상 보여 준다(배치해도 사라지지 않는다).
 * 한 위젯이 여러 컨테이너에 놓일 수 있게 되면서 "미배치 목록"이 성립하지 않기
 * 때문이다 — 이미 배치된 것도 다시 끌어다 다른 곳에 더 놓을 수 있어야 한다.
 *
 *   팔레트 → 컨테이너    그 컨테이너에 **추가**
 *   컨테이너 → 컨테이너  이동
 *   컨테이너 → 팔레트    그 배치만 **제거** (위젯 자체는 남는다)
 *   같은 컨테이너 안      순서 바꾸기
 */
function WidgetLayoutTab({ cardId, variables, images, containers, onRefresh }) {
  // 드래그 중인 것이 "어디서" 왔는지 함께 들고 있어야 한다. 같은 위젯이 팔레트와
  // 여러 컨테이너에 동시에 보이므로 uid 만으로는 출처를 알 수 없다.
  const [dragging, setDragging] = useState(null)   // { uid, from: 'palette' | '<containerId>' }
  const [dragOver, setDragOver] = useState(null)   // { bucket, index }
  const [error, setError] = useState('')

  const widgets = useMemo(() => ([
    ...variables.map(v => ({
      kind: 'variable', id: v.id, uid: `v-${v.id}`,
      name: v.name, category: v.category, symbol: v.symbol,
      placements: v.placements || [], sort_order: v.sort_order || 0,
    })),
    ...images.map(i => ({
      kind: 'image', id: i.id, uid: `i-${i.id}`,
      name: i.filename,
      placements: i.placements || [], sort_order: i.sort_order || 0,
    })),
  ]), [variables, images])

  // 팔레트는 변수 먼저, 그다음 이미지 — 변수 정의 탭과 같은 순서라 눈이 헤매지 않는다.
  const palette = useMemo(() => [...widgets].sort((a, b) => (
    (a.kind === b.kind ? 0 : a.kind === 'variable' ? -1 : 1)
    || (a.sort_order - b.sort_order)
    || a.uid.localeCompare(b.uid)
  )), [widgets])

  const usageOf = (w) => (w.placements ? w.placements.length : 0)
  const placedCount = palette.filter(w => usageOf(w) > 0).length

  // 컨테이너 안의 순서는 **그 배치의** sort_order 를 따른다. 위젯 자체의
  // sort_order 를 쓰면 컨테이너마다 순서를 따로 정할 수 없다.
  const byContainer = useMemo(() => {
    const map = {}
    containers.forEach(c => { map[c.id] = [] })
    widgets.forEach(w => {
      (w.placements || []).forEach(p => {
        if (!map[p.container_id]) return
        map[p.container_id].push({ w, sort: p.sort_order ?? 0 })
      })
    })
    Object.keys(map).forEach(k => {
      map[k].sort((a, b) => a.sort - b.sort)
      map[k] = map[k].map(e => e.w)
    })
    return map
  }, [widgets, containers])

  const handleDragStart = (e, uid, from) => {
    setDragging({ uid, from })
    e.dataTransfer.effectAllowed = 'move'
    try { e.dataTransfer.setData('text/plain', uid) } catch { /* 일부 브라우저는 무시 */ }
  }

  const handleDragEnd = () => {
    setDragging(null)
    setDragOver(null)
  }

  const handleItemDragOver = (e, bucket, index) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const midY = rect.top + rect.height / 2
    setDragOver({ bucket, index: e.clientY < midY ? index : index + 1 })
  }

  const handleZoneDragOver = (e, bucket, lastIndex) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!dragOver || dragOver.bucket !== bucket) setDragOver({ bucket, index: lastIndex })
  }

  const handleDrop = async (e, bucket) => {
    e.preventDefault()
    e.stopPropagation()
    const drag = dragging
    const over = dragOver
    handleDragEnd()
    if (!drag || !over || over.bucket !== bucket) return

    const widget = widgets.find(w => w.uid === drag.uid)
    if (!widget) return

    // 현재 상태를 복사해 옮긴다. 서버에는 "지금 이런 상태다" 를 통째로 보낸다.
    const next = {}
    containers.forEach(c => { next[c.id] = [...(byContainer[c.id] || [])] })

    let insertIdx = over.index

    // 1) 출처에서 뺀다. 팔레트는 출처가 아니다 — 거기서 끌어오는 것은 복사다.
    if (drag.from !== 'palette') {
      const list = next[Number(drag.from)]
      if (list) {
        const i = list.findIndex(w => w.uid === drag.uid)
        if (i >= 0) {
          list.splice(i, 1)
          if (String(drag.from) === String(bucket) && i < insertIdx) insertIdx -= 1
        }
      }
    }

    // 2) 대상에 넣는다. 팔레트가 대상이면 넣지 않는다 = 그 배치만 사라진다.
    if (bucket !== 'palette') {
      const list = next[Number(bucket)]
      if (!list) return
      if (list.some(w => w.uid === drag.uid)) {
        setError(`"${widget.name}" 은(는) 이미 이 컨테이너에 있습니다.`)
        return
      }
      list.splice(Math.max(0, Math.min(insertIdx, list.length)), 0, widget)
    } else if (drag.from === 'palette') {
      return   // 팔레트 → 팔레트. 바뀐 것이 없다.
    }

    setError('')
    const payload = {
      containers: containers.map(c => ({
        container_id: c.id,
        widgets: (next[c.id] || []).map(w => ({ kind: w.kind, id: w.id })),
      })),
    }

    try {
      const res = await apiFetch(`/cards/${cardId}/widgets/layout`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || '배치 저장 실패')
        return
      }
      onRefresh()
    } catch {
      setError('서버 통신 실패')
    }
  }

  const renderList = (list, bucket, options) => {
    const { scrollable = false, showUsage = false, emptyHint } = options || {}
    return (
      <DropZone
        $over={dragOver?.bucket === bucket}
        $scrollable={scrollable}
        onDragOver={(e) => handleZoneDragOver(e, bucket, list.length)}
        onDrop={(e) => handleDrop(e, bucket)}
      >
        {list.length === 0 && <EmptyHint>{emptyHint || '여기로 드래그해서 배치'}</EmptyHint>}
        {list.map((w, idx) => (
          <React.Fragment key={w.uid}>
            {dragOver?.bucket === bucket && dragOver.index === idx && <DropIndicator />}
            <div onDragOver={(e) => handleItemDragOver(e, bucket, idx)}>
              <WidgetCardView
                widget={w}
                dragging={dragging?.uid === w.uid && dragging?.from === bucket}
                onDragStart={(e) => handleDragStart(e, w.uid, bucket)}
                onDragEnd={handleDragEnd}
                cardId={cardId}
                usage={showUsage ? usageOf(w) : undefined}
              />
            </div>
          </React.Fragment>
        ))}
        {dragOver?.bucket === bucket && dragOver.index >= list.length && <DropIndicator />}
      </DropZone>
    )
  }

  return (
    <>
      {error && <ErrorMsg>{error}</ErrorMsg>}
      <Layout>
        <StickyPanel>
          <PanelTitle>
            <span>전체 위젯</span>
            <ContainerSub>{placedCount} / {palette.length} 배치됨</ContainerSub>
          </PanelTitle>
          <PaletteHint>
            컨테이너로 끌어다 놓으세요. 배치해도 목록에서 사라지지 않으니 같은
            위젯을 여러 컨테이너에 놓을 수 있습니다. 오른쪽 숫자는 배치된 컨테이너
            수이고, 컨테이너에서 이리로 끌어오면 그 배치만 지워집니다.
          </PaletteHint>
          {renderList(palette, 'palette', {
            scrollable: true,
            showUsage: true,
            emptyHint: '변수나 이미지를 먼저 만들어주세요.',
          })}
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
    </>
  )
}

export default WidgetLayoutTab
