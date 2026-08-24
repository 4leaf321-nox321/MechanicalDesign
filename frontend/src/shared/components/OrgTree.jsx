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
 */

import React, { useState } from 'react'
import styled from 'styled-components'

const Panel = styled.nav`
  width: 260px;
  flex-shrink: 0;
  background: white;
  border-right: 1px solid #e3e6ec;
  padding: 18px 0 32px;
  overflow-y: auto;

  @media (max-width: 900px) {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid #e3e6ec;
    max-height: 260px;
  }
`

const SectionLabel = styled.div`
  padding: 6px 18px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #98a2b3;
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
  color: ${(p) => (p.$active ? '#1a1a2e' : '#4b5563')};
  background: ${(p) => (p.$active ? '#eef2ff' : 'transparent')};
  border-left: 3px solid ${(p) => (p.$active ? p.$color || '#3498db' : 'transparent')};
  font-weight: ${(p) => (p.$active ? 600 : 400)};

  &:hover {
    background: ${(p) => (p.$active ? '#eef2ff' : '#f6f7f9')};
  }

  &:hover .org-actions {
    opacity: 1;
  }
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
  color: #9aa3af;
  font-size: 0.7rem;
  line-height: 1;
  transform: rotate(${(p) => (p.$open ? 90 : 0)}deg);
  transition: transform 0.12s;
`

const Label = styled.span`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Count = styled.span`
  font-size: 0.72rem;
  color: #98a2b3;
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
  color: #8b93a1;
  border-radius: 4px;

  &:hover {
    background: #e5e7eb;
    color: #1a1a2e;
  }
`

const AddRootBtn = styled.button`
  margin: 10px 12px 0;
  padding: 6px 10px;
  width: calc(100% - 24px);
  border: 1px dashed #cbd2dc;
  border-radius: 6px;
  background: none;
  color: #6b7280;
  font-size: 0.8rem;
  cursor: pointer;

  &:hover {
    border-color: #3498db;
    color: #3498db;
  }
`

function OrgNode({ node, depth, selected, onSelect, isAdmin, onAdd, onRename, onDelete }) {
  const [open, setOpen] = useState(true)
  const has = node.children && node.children.length > 0
  const active = selected === node.slug

  return (
    <>
      <Row
        $depth={depth}
        $active={active}
        $color={node.color}
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
        {node.card_count > 0 && <Count>{node.card_count}</Count>}
        {isAdmin && (
          <Actions className="org-actions">
            <IconBtn title="하위 조직 추가" onClick={(e) => { e.stopPropagation(); onAdd(node.slug) }}>＋</IconBtn>
            <IconBtn title="이름 바꾸기" onClick={(e) => { e.stopPropagation(); onRename(node) }}>✎</IconBtn>
            <IconBtn title="삭제" onClick={(e) => { e.stopPropagation(); onDelete(node) }}>✕</IconBtn>
          </Actions>
        )}
      </Row>
      {open &&
        (node.children || []).map((child) => (
          <OrgNode
            key={child.slug}
            node={child}
            depth={depth + 1}
            selected={selected}
            onSelect={onSelect}
            isAdmin={isAdmin}
            onAdd={onAdd}
            onRename={onRename}
            onDelete={onDelete}
          />
        ))}
    </>
  )
}

function OrgTree({ tree, personal, selected, onSelect, isAdmin, onAdd, onRename, onDelete }) {
  return (
    <Panel>
      <SectionLabel>내 공간</SectionLabel>
      {personal && (
        <Row
          $depth={0}
          $active={selected === personal.slug}
          $color="#94a3b8"
          onClick={() => onSelect(personal.slug)}
          title="아직 어디에도 올리지 않은 카드가 여기 있습니다"
        >
          <Caret $has={false} />
          <Label>내 카드</Label>
          {personal.card_count > 0 && <Count>{personal.card_count}</Count>}
        </Row>
      )}

      <SectionLabel>조직</SectionLabel>
      {/* 전체 보기가 없으면 "어느 조직에도 안 걸린 게시 카드" 를 볼 방법이
          사라진다. 조직을 만들기 전부터 있던 카드가 그렇다. */}
      <Row $depth={0} $active={!selected} $color="#3498db" onClick={() => onSelect('')}>
        <Caret $has={false} />
        <Label>전체</Label>
      </Row>
      {tree.map((node) => (
        <OrgNode
          key={node.slug}
          node={node}
          depth={0}
          selected={selected}
          onSelect={onSelect}
          isAdmin={isAdmin}
          onAdd={onAdd}
          onRename={onRename}
          onDelete={onDelete}
        />
      ))}

      {isAdmin && <AddRootBtn onClick={() => onAdd(null)}>＋ 조직 추가</AddRootBtn>}
    </Panel>
  )
}

export default OrgTree
