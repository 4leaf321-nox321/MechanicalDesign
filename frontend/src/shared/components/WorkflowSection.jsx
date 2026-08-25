/**
 * 조직 화면의 워크플로 구역 — 카드 격자 **위**에 놓인다.
 *
 * 카드와 탭으로 나누지 않는 이유: 사람이 조직 화면에서 묻는 질문은 "여기 뭐가
 * 있나" 이지 "카드가 뭐가 있나" 가 아니다. 탭이면 그 질문에 두 번 눌러 답해야
 * 하고, 더 나쁜 것은 **반대쪽을 안 눌러 보면 있는지도 모른다**는 점이다.
 *
 * 워크플로를 위에 두는 것은 그것이 카드를 **묶는** 상위 개념이기 때문이다. 수도
 * 훨씬 적어서(카드 12장에 워크플로 2개 꼴) 위에 얹어도 화면을 잡아먹지 않는다.
 * 그래도 길어질 수 있으니 구역째 접힌다.
 */

import React, { useState } from 'react'
import styled from 'styled-components'

const Wrap = styled.section`
  padding: 24px 48px 0;
  max-width: 1400px;
`

const Head = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: none;
  padding: 0 0 12px;
  cursor: pointer;
  font-size: 0.95rem;
  font-weight: 600;
  color: #1a1a2e;
`

const Caret = styled.span`
  color: #9aa3af;
  font-size: 0.7rem;
  transform: rotate(${p => (p.$open ? 90 : 0)}deg);
  transition: transform 0.12s;
`

const Count = styled.span`
  font-size: 0.8rem;
  color: #6c5ce7;
  font-weight: 700;
`

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
`

/** 카드와 색·모양을 달리한다. 같아 보이면 격자 두 개가 한 덩어리로 읽힌다. */
const Item = styled.div`
  background: white;
  border-radius: 10px;
  padding: 20px 22px;
  cursor: pointer;
  position: relative;
  border-left: 4px solid ${p => p.$color || '#6c5ce7'};
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.07);
  transition: all 0.2s ease;

  ${p => p.$draft && `
    background: #fffdf6;
    border: 1px dashed #e0c97a;
    border-left: 4px solid ${p.$color || '#6c5ce7'};
  `}

  &:hover {
    transform: translateY(-3px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.11);
  }

  &:hover .wf-delete {
    opacity: 1;
  }
`

const Name = styled.h4`
  margin: 0 0 6px;
  font-size: 1.05rem;
  color: #1a1a2e;
`

const Desc = styled.p`
  margin: 0 0 10px;
  font-size: 0.84rem;
  color: #98a2b3;
  line-height: 1.45;
`

/** 몇 장을 어떻게 이었는지. 열기 전에 규모를 알 수 있어야 한다. */
const Shape = styled.div`
  font-size: 0.76rem;
  color: #6b7280;
`

const TagRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 8px;
`

const Tag = styled.span`
  display: inline-block;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 0.7rem;
  font-weight: 700;
  background: #fff4d6;
  color: #8a6d1a;
  border: 1px solid #f0d98c;
`

const OrgChip = styled.span`
  font-size: 0.68rem;
  padding: 2px 7px;
  border-radius: 999px;
  background: #efeaff;
  color: #5b4bb5;
`

const DeleteBtn = styled.button`
  position: absolute;
  top: 10px;
  right: 10px;
  background: none;
  border: none;
  color: #ccc;
  font-size: 1rem;
  cursor: pointer;
  padding: 2px 7px;
  border-radius: 4px;
  opacity: 0;
  transition: all 0.2s;

  &:hover {
    background: #fee;
    color: #e74c3c;
  }
`

const AddItem = styled.div`
  border: 2px dashed #dcd6f5;
  border-radius: 10px;
  padding: 20px 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #8878d6;
  cursor: pointer;
  font-size: 0.9rem;
  min-height: 92px;

  &:hover {
    border-color: #6c5ce7;
    color: #6c5ce7;
  }
`

const Empty = styled.div`
  font-size: 0.85rem;
  color: #98a2b3;
  line-height: 1.6;
  padding: 4px 0 8px;
`

function WorkflowSection({
  workflows, isTrashView, query, canAdd,
  onOpen, onAdd, onDelete, onRestore, onPurge,
}) {
  const [open, setOpen] = useState(true)

  // **비어 있어도 구역을 남긴다.**
  //
  // 처음에는 조직 화면에서 워크플로가 없으면 통째로 감췄는데, 그러면 워크플로가
  // 하나도 없는 동안 이 기능이 화면 어디에도 나타나지 않는다 — 만들 자리가
  // 「내 공간」에만 있어서, 거기를 눌러 본 사람만 기능의 존재를 안다. 탭으로
  // 나누지 않기로 한 것과 같은 이유로 이것도 틀렸다.
  //
  // 카드는 어느 자리에서든 '＋ 카드 추가' 가 보인다. 워크플로도 같아야 한다.
  if (workflows.length === 0 && !canAdd) return null

  return (
    <Wrap>
      <Head onClick={() => setOpen(v => !v)}>
        <Caret $open={open}>▶</Caret>
        워크플로
        {workflows.length > 0 && <Count>{workflows.length}</Count>}
      </Head>

      {open && (
        <>
          {workflows.length === 0 && (
            <Empty>
              {isTrashView
                ? '지운 워크플로가 없습니다.'
                : '카드 여러 장을 이어 값이 흐르게 하려면 워크플로를 만듭니다. '
                  + '앞 카드의 결과가 뒤 카드의 입력이 되어, 손으로 옮겨 적지 않아도 됩니다.'}
            </Empty>
          )}

          <Grid>
            {workflows.map(wf => (
              <Item
                key={wf.id}
                $color={wf.color}
                $draft={wf.status === 'draft'}
                onClick={() => onOpen(wf)}
              >
                {!isTrashView && canAdd && (
                  <DeleteBtn className="wf-delete"
                             onClick={(e) => { e.stopPropagation(); onDelete(wf) }}>
                    ✕
                  </DeleteBtn>
                )}

                {(wf.status === 'draft' || (query && wf.match?.length)) && (
                  <TagRow>
                    {wf.status === 'draft' && <Tag>초안 · 나만 보임</Tag>}
                    {query && wf.match?.map((m, i) => <OrgChip key={i}>{m}</OrgChip>)}
                  </TagRow>
                )}

                <Name>{wf.name}</Name>
                {wf.description && <Desc>{wf.description}</Desc>}
                <Shape>
                  카드 {wf.node_count}장 · 연결 {wf.link_count}개
                  {wf.node_count === 0 && ' — 아직 비어 있습니다'}
                </Shape>

                {wf.mounted_orgs?.length > 0 && (
                  <TagRow style={{ marginTop: 10, marginBottom: 0 }}>
                    {wf.mounted_orgs.map(o => (
                      <OrgChip key={o.slug}>{o.name}</OrgChip>
                    ))}
                  </TagRow>
                )}

                {isTrashView && (
                  <Shape style={{ marginTop: 10 }}>
                    <button onClick={(e) => { e.stopPropagation(); onRestore(wf) }}>
                      되살리기
                    </button>
                    {' '}
                    <button onClick={(e) => { e.stopPropagation(); onPurge(wf) }}>
                      완전 삭제
                    </button>
                  </Shape>
                )}
              </Item>
            ))}

            {canAdd && !isTrashView && (
              <AddItem onClick={onAdd}>＋ 워크플로 만들기</AddItem>
            )}
          </Grid>
        </>
      )}
    </Wrap>
  )
}

export default WorkflowSection
