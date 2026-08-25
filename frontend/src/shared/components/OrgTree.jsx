/**
 * 조직 트리 — 왼쪽에 늘 떠 있는 화면의 뼈대.
 *
 * 카드가 스무 장을 넘어가면 격자 하나로는 찾을 수가 없다. "볼트 계산 어디
 * 있어요" 라는 질문에 답하려면 **자리 이름**이 있어야 하고, 회사에서 그 이름은
 * 조직도다.
 *
 * 맨 위는 내 개인 공간이다. 카드는 거기서 태어나 조직에 게시되므로, 만든 사람이
 * 가장 자주 여는 자리가 거기다. 조직도 아래에 묻어 두면 자기 초안을 찾으려고
 * 트리를 뒤지게 된다.
 *
 * **개인 공간은 트리에 섞지 않는다.** 사람이 늘 때마다 조직도 끝이 사람 목록으로
 * 길어지면 정작 부서를 찾을 수 없다.
 *
 * 관리자는 드래그로 조직을 옮긴다. 줄마다 **떨어뜨릴 자리가 둘**이다.
 *
 *     줄 위쪽 얇은 띠   그 조직의 **바로 앞 형제**가 된다
 *     줄 본체          그 조직의 **마지막 자식**이 된다
 *
 * "뒤에 놓기" 는 따로 두지 않았다. 부모 줄에 떨어뜨리면 맨 뒤로 가므로 두
 * 자리만으로 트리의 어느 위치든 갈 수 있고, 셋이 되면 좁은 줄에서 어디에
 * 떨어질지 눈으로 가늠할 수 없어진다.
 *
 * 라이브러리를 쓰지 않고 브라우저 기본 DnD 로 만든다. 트리는 기껏해야 수십 줄이라
 * 가상 스크롤도 충돌 판정도 필요 없고, 배포 패키지에 의존성을 얹을 이유가 없다.
 */

import React, { useState } from 'react'
import styled from 'styled-components'

const Panel = styled.nav`
  width: 260px;
  flex-shrink: 0;
  background: hsl(var(--surface));
  border-right: 1px solid hsl(var(--border));
  padding: 18px 0 32px;
  overflow-y: auto;

  @media (max-width: 900px) {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid hsl(var(--border));
    max-height: 260px;
  }
`

const SectionLabel = styled.div`
  padding: 6px 18px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: hsl(var(--fg-subtle));
  text-transform: uppercase;
  margin-top: 14px;

  &:first-of-type {
    margin-top: 0;
  }
`

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px 7px ${(p) => 12 + p.$depth * 14}px;
  cursor: pointer;
  font-size: 0.87rem;
  color: ${(p) => (p.$active ? 'hsl(var(--fg))' : 'hsl(var(--fg-muted))')};
  background: ${(p) => (p.$active ? 'hsl(var(--accent-soft))' : 'transparent')};
  border-left: 3px solid ${(p) => (p.$active ? p.$color || 'hsl(var(--primary))' : 'transparent')};
  font-weight: ${(p) => (p.$active ? 600 : 400)};

  &:hover {
    background: ${(p) => (p.$active ? 'hsl(var(--accent-soft))' : 'hsl(var(--surface-2))')};
  }

  &:hover .org-actions {
    opacity: 1;
  }

  /* 안쪽으로 들어가는 중. 테두리로 표시한다 — 배경색을 바꾸면 선택 상태와
     구분되지 않는다. */
  ${(p) =>
    p.$dropInside &&
    `
    outline: 2px solid hsl(var(--primary));
    outline-offset: -2px;
    background: hsl(var(--info-soft));
  `}

  ${(p) => p.$dragging && 'opacity: 0.4;'}
`

/** 접기 화살표. 하위가 없으면 자리만 차지한다 — 없으면 글자가 좌우로 흔들린다. */
const Caret = styled.button`
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  border: none;
  background: none;
  padding: 0;
  cursor: ${(p) => (p.$has ? 'pointer' : 'default')};
  color: hsl(var(--fg-subtle));
  font-size: 0.7rem;
  line-height: 1;
  transform: rotate(${(p) => (p.$open ? 90 : 0)}deg);
  transition: transform 0.12s;
`

/** 줄 위쪽 얇은 띠 — 여기 떨어뜨리면 앞 형제가 된다. */
const DropBand = styled.div`
  height: 6px;
  margin-top: -3px;
  margin-bottom: -3px;
  position: relative;
  z-index: 1;

  &::after {
    content: '';
    position: absolute;
    left: ${(p) => 12 + p.$depth * 14}px;
    right: 10px;
    top: 2px;
    height: 2px;
    border-radius: var(--radius-sm);
    background: ${(p) => (p.$over ? 'hsl(var(--primary))' : 'transparent')};
  }
`

const Label = styled.span`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

/**
 * 카드 수 · 워크플로 수.
 *
 * **합쳐서 하나로 세지 않는다.** 워크플로는 카드를 묶는 상위 개념이라 같은
 * 단위로 더하면 뜻이 흐려진다 — '14' 만 보고는 카드 12에 워크플로 2인지,
 * 카드 14인지 알 수 없다. 0 인 쪽은 아예 안 그려 숫자가 늘어지지 않게 한다.
 */
function Counts({ cards = 0, workflows = 0 }) {
  if (!cards && !workflows) return null
  return (
    <Count title={`카드 ${cards}장 · 워크플로 ${workflows}개`}>
      {cards > 0 && cards}
      {cards > 0 && workflows > 0 && <Dot>·</Dot>}
      {workflows > 0 && <WfCount>{workflows}</WfCount>}
    </Count>
  )
}

const Dot = styled.span`
  margin: 0 3px;
  color: hsl(var(--border-strong));
`

/** 워크플로 쪽은 색을 달리한다 — 두 숫자가 같은 것을 센다고 오해하지 않게. */
const WfCount = styled.span`
  color: hsl(var(--accent));
`

const Count = styled.span`
  font-size: 0.72rem;
  color: hsl(var(--fg-subtle));
  flex-shrink: 0;
`

const Actions = styled.span`
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.12s;
  flex-shrink: 0;
`

const IconBtn = styled.button`
  border: none;
  background: none;
  cursor: pointer;
  padding: 1px 4px;
  font-size: 0.75rem;
  color: hsl(var(--fg-subtle));
  border-radius: var(--radius-sm);

  &:hover {
    background: hsl(var(--border));
    color: hsl(var(--fg));
  }
`

const DragHint = styled.div`
  margin: 12px;
  padding: 9px 11px;
  background: hsl(var(--info-soft));
  border: 1px solid hsl(var(--info-border));
  border-radius: var(--radius);
  font-size: 0.74rem;
  color: hsl(var(--info));
  line-height: 1.6;
`

const AddRootBtn = styled.button`
  margin: 10px 12px 0;
  padding: 6px 10px;
  width: calc(100% - 24px);
  border: 1px dashed hsl(var(--border-strong));
  border-radius: var(--radius);
  background: none;
  color: hsl(var(--fg-muted));
  font-size: 0.8rem;
  cursor: pointer;

  &:hover {
    border-color: hsl(var(--primary));
    color: hsl(var(--primary));
  }
`

function OrgNode({
  node, depth, index, parentSlug, selected, onSelect, isAdmin,
  onAdd, onRename, onDelete, dnd,
}) {
  const [open, setOpen] = useState(true)
  const has = node.children && node.children.length > 0
  const active = selected === node.slug

  const draggable = isAdmin && !!dnd
  const forbidden = dnd?.forbidden?.has(node.slug)

  // 자기 자신과 그 하위로는 떨어뜨릴 수 없다. 허용해 두면 그 가지가 루트에서
  // 끊겨 트리에서 통째로 사라진다 — 서버도 막지만, 막힐 자리를 파란 선으로
  // 안내하면 사람은 될 줄 알고 놓는다.
  const allowInside = draggable && dnd.dragging && !forbidden
  const allowBefore = draggable && dnd.dragging && !forbidden

  return (
    <>
      {allowBefore && (
        <DropBand
          $depth={depth}
          $over={dnd.over === `before:${node.slug}`}
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
            dnd.setOver(`before:${node.slug}`)
          }}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            dnd.drop({ parentSlug, position: index })
          }}
        />
      )}
      <Row
        $depth={depth}
        $active={active}
        $color={node.color}
        $dragging={dnd?.dragging === node.slug}
        $dropInside={dnd?.over === `inside:${node.slug}`}
        draggable={draggable}
        onDragStart={(e) => {
          e.stopPropagation()
          e.dataTransfer.effectAllowed = 'move'
          // 텍스트를 실어야 파이어폭스가 드래그를 시작한다.
          e.dataTransfer.setData('text/plain', node.slug)
          dnd.start(node.slug)
        }}
        onDragEnd={() => dnd?.end()}
        onDragOver={(e) => {
          if (!allowInside) return
          e.preventDefault()
          dnd.setOver(`inside:${node.slug}`)
        }}
        onDrop={(e) => {
          if (!allowInside) return
          e.preventDefault()
          e.stopPropagation()
          // 줄 본체에 놓으면 그 조직의 **마지막 자식**이 된다.
          dnd.drop({ parentSlug: node.slug, position: null })
        }}
        onClick={() => onSelect(node.slug)}
        title={node.description || node.name}
      >
        <Caret
          $has={has}
          $open={open}
          onClick={(e) => {
            e.stopPropagation()
            if (has) setOpen((v) => !v)
          }}
        >
          {has ? '▶' : ''}
        </Caret>
        <Label>{node.name}</Label>
        {/* 하위에 걸린 것까지 세지는 않는다. 여기 숫자는 **이 조직에 직접
            게시된 수**다. 합계를 보여 주면 본부를 눌렀을 때 나오는 목록
            길이와 숫자가 달라 보인다. */}
        <Counts cards={node.card_count} workflows={node.workflow_count} />
        {isAdmin && (
          <Actions className="org-actions">
            <IconBtn title="하위 조직 추가" onClick={(e) => { e.stopPropagation(); onAdd(node.slug) }}>＋</IconBtn>
            <IconBtn title="이름 바꾸기" onClick={(e) => { e.stopPropagation(); onRename(node) }}>✎</IconBtn>
            <IconBtn title="삭제" onClick={(e) => { e.stopPropagation(); onDelete(node) }}>✕</IconBtn>
          </Actions>
        )}
      </Row>
      {open &&
        (node.children || []).map((child, i) => (
          <OrgNode
            key={child.slug}
            node={child}
            depth={depth + 1}
            index={i}
            parentSlug={node.slug}
            selected={selected}
            onSelect={onSelect}
            isAdmin={isAdmin}
            onAdd={onAdd}
            onRename={onRename}
            onDelete={onDelete}
            dnd={dnd}
          />
        ))}
      {/* 자식들의 맨 뒤. 접혀 있으면 줄 본체에 놓는 것과 같으므로 안 그린다. */}
      {open && has && dnd?.dragging && !forbidden && (
        <DropBand
          $depth={depth + 1}
          $over={dnd.over === `last:${node.slug}`}
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
            dnd.setOver(`last:${node.slug}`)
          }}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            dnd.drop({ parentSlug: node.slug, position: null })
          }}
        />
      )}
    </>
  )
}

/** 자신과 모든 하위의 slug. 드래그를 시작할 때 한 번만 구한다. */
function collectSubtree(nodes, slug, found = false, out = new Set()) {
  for (const n of nodes) {
    const hit = found || n.slug === slug
    if (hit) out.add(n.slug)
    collectSubtree(n.children || [], slug, hit, out)
  }
  return out
}

function OrgTree({
  tree, personal, selected, onSelect, isAdmin,
  onAdd, onRename, onDelete, onMove, trashSlug, trashCount,
}) {
  const [dragging, setDragging] = useState(null)
  const [over, setOver] = useState(null)

  const dnd = isAdmin && onMove
    ? {
        dragging,
        over,
        forbidden: dragging ? collectSubtree(tree, dragging) : new Set(),
        setOver,
        start: (slug) => {
          setDragging(slug)
          setOver(null)
        },
        end: () => {
          setDragging(null)
          setOver(null)
        },
        drop: ({ parentSlug, position }) => {
          const slug = dragging
          setDragging(null)
          setOver(null)
          if (slug) onMove(slug, parentSlug ?? null, position)
        },
      }
    : null

  return (
    <Panel
      onDragOver={(e) => {
        if (dnd?.dragging) e.preventDefault()
      }}
      onDrop={(e) => {
        // 패널 빈 자리에 놓으면 **최상위 맨 뒤**. 줄과 줄 사이가 아니면 갈 곳이
        // 없어서, 최상위로 꺼내려면 이 자리가 있어야 한다.
        if (!dnd?.dragging) return
        e.preventDefault()
        dnd.drop({ parentSlug: null, position: null })
      }}
    >
      <SectionLabel>내 공간</SectionLabel>
      {personal && (
        <Row
          $depth={0}
          $active={selected === personal.slug}
          $color="hsl(var(--fg-subtle))"
          onClick={() => onSelect(personal.slug)}
          title="아직 어디에도 올리지 않은 카드가 여기 있습니다"
        >
          <Caret $has={false} />
          <Label>내 공간</Label>
          <Counts cards={personal.card_count} workflows={personal.workflow_count} />
        </Row>
      )}

      <SectionLabel>조직</SectionLabel>
      {/* 전체 보기가 없으면 "어느 조직에도 안 걸린 게시 카드" 를 볼 방법이
          사라진다. 조직을 만들기 전부터 있던 카드가 그렇다. */}
      <Row $depth={0} $active={!selected} $color="hsl(var(--primary))" onClick={() => onSelect('')}>
        <Caret $has={false} />
        <Label>전체</Label>
      </Row>
      {tree.map((node, i) => (
        <OrgNode
          key={node.slug}
          node={node}
          depth={0}
          index={i}
          parentSlug={null}
          dnd={dnd}
          selected={selected}
          onSelect={onSelect}
          isAdmin={isAdmin}
          onAdd={onAdd}
          onRename={onRename}
          onDelete={onDelete}
        />
      ))}

      {trashSlug && (
        <>
          <SectionLabel>휴지통</SectionLabel>
          <Row
            $depth={0}
            $active={selected === trashSlug}
            $color="hsl(var(--fg-subtle))"
            onClick={() => onSelect(trashSlug)}
            title="지운 카드는 여기 있습니다. 되살리거나 완전히 지울 수 있습니다"
          >
            <Caret $has={false} />
            <Label>지운 카드</Label>
            {trashCount > 0 && <Count>{trashCount}</Count>}
          </Row>
        </>
      )}

      {dnd?.dragging && (
        <DragHint>
          줄 <b>사이</b>에 놓으면 그 앞으로, 줄 <b>위</b>에 놓으면 그 안으로 들어갑니다.
          <br />
          빈 곳에 놓으면 최상위 맨 뒤로 갑니다.
        </DragHint>
      )}

      {isAdmin && <AddRootBtn onClick={() => onAdd(null)}>＋ 조직 추가</AddRootBtn>}
    </Panel>
  )
}

export default OrgTree
