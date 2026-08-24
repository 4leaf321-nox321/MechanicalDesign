/**
 * 조직 게시 — 이 카드를 어디에서 보이게 할지 고른다.
 *
 * **복사가 아니라 참조다.** 개인 공간의 원본을 고치면 걸려 있는 모든 조직에
 * 그대로 반영된다. 사본이었다면 "그 팀 게시판 것만 옛날 계수" 라는 상태가
 * 조용히 생기고, 알아챌 방법이 없다.
 *
 * 체크를 껐다 켤 때마다 서버에 바로 보낸다. 한꺼번에 저장하는 방식이면 창을
 * 닫는 순간 무엇이 반영되고 무엇이 안 됐는지 알 수 없고, 실패한 항목 하나를
 * 다시 시도할 방법도 없다.
 *
 * **왼쪽 사이드바와 같은 트리를 그대로 쓴다.** 평면 목록이면 '1팀' 이 어느
 * 본부 소속인지 알 수 없는데, 회사에는 같은 이름의 팀이 본부마다 있다. 트리를
 * 새로 받아오지 않고 화면이 이미 들고 있는 것을 넘겨받는다 — 따로 받으면 사이
 * 드바와 이 창의 내용이 어긋나는 순간이 생긴다.
 */

import React, { useEffect, useState } from 'react'
import styled from 'styled-components'
import { apiFetch } from '../api/client'

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`

const Box = styled.div`
  background: white;
  border-radius: 10px;
  width: min(460px, 92vw);
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
`

const Head = styled.div`
  padding: 20px 24px 12px;
  border-bottom: 1px solid #eef0f4;
`

const Title = styled.h3`
  margin: 0 0 4px;
  font-size: 1.05rem;
  color: #1a1a2e;
`

const Sub = styled.p`
  margin: 0;
  font-size: 0.82rem;
  color: #6b7280;
  line-height: 1.5;
`

const List = styled.div`
  padding: 8px 0;
  overflow-y: auto;
  flex: 1;
`

const Item = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 24px 8px ${(p) => 24 + p.$depth * 16}px;
  cursor: pointer;
  font-size: 0.88rem;
  color: #374151;

  &:hover {
    background: #f6f7f9;
  }
`

/** 접기 화살표. 하위가 없어도 자리는 차지한다 — 없으면 이름이 좌우로 흔들린다. */
const Caret = styled.button`
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  border: none;
  background: none;
  padding: 0;
  cursor: ${(p) => (p.$has ? 'pointer' : 'default')};
  color: #9aa3af;
  font-size: 0.62rem;
  line-height: 1;
  transform: rotate(${(p) => (p.$open ? 90 : 0)}deg);
`

const Name = styled.span`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

/** 하위 조직에 걸려 있다는 표시. 상위를 열면 그 카드가 이미 보이므로, 여기에
    또 거는 것은 대개 필요 없다 — 모르면 같은 카드를 겹쳐 걸게 된다. */
const InheritTag = styled.span`
  font-size: 0.68rem;
  color: #8b93a1;
  flex-shrink: 0;
`

const Empty = styled.div`
  padding: 24px;
  text-align: center;
  color: #98a2b3;
  font-size: 0.85rem;
  line-height: 1.6;
`

const Foot = styled.div`
  padding: 12px 24px 18px;
  border-top: 1px solid #eef0f4;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
`

const Err = styled.span`
  color: #c0392b;
  font-size: 0.8rem;
  flex: 1;
`

const CloseBtn = styled.button`
  padding: 8px 18px;
  border: none;
  border-radius: 6px;
  background: #1a1a2e;
  color: white;
  cursor: pointer;
  font-size: 0.85rem;
`

/** 이 노드 아래(자신 제외) 어딘가에 걸려 있는가. 상위 줄에 표시를 달 때 쓴다. */
function hasMountedDescendant(node, mounted) {
  return (node.children || []).some(
    (c) => mounted.has(c.slug) || hasMountedDescendant(c, mounted),
  )
}

function OrgRow({ node, depth, mounted, busy, onToggle }) {
  const [open, setOpen] = useState(true)
  const has = (node.children || []).length > 0
  const checked = mounted.has(node.slug)
  const inherited = !checked && hasMountedDescendant(node, mounted)

  return (
    <>
      <Item $depth={depth}>
        <Caret
          type="button"
          $has={has}
          $open={open}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (has) setOpen((v) => !v)
          }}
        >
          {has ? '▶' : ''}
        </Caret>
        <input
          type="checkbox"
          checked={checked}
          disabled={busy === node.slug}
          onChange={(e) => onToggle(node.slug, e.target.checked)}
        />
        <Name>{node.name}</Name>
        {inherited && <InheritTag>하위에 게시됨</InheritTag>}
      </Item>
      {open &&
        (node.children || []).map((child) => (
          <OrgRow
            key={child.slug}
            node={child}
            depth={depth + 1}
            mounted={mounted}
            busy={busy}
            onToggle={onToggle}
          />
        ))}
    </>
  )
}

function PublishToOrgDialog({ card, tree, onClose, onChanged }) {
  // 화면이 이미 들고 있는 트리를 그대로 쓴다. 없을 때만(트리를 안 넘긴 자리에서
  // 열렸을 때) 직접 받아온다.
  const [fetched, setFetched] = useState(null)
  const [mounted, setMounted] = useState(
    () => new Set((card.mounted_orgs || []).map((o) => o.slug)),
  )
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')

  const nodes = tree && tree.length ? tree : fetched || []

  useEffect(() => {
    if (tree && tree.length) return
    apiFetch('/orgs/tree')
      .then((r) => r.json())
      .then((body) => setFetched(body.tree || []))
      .catch(() => setError('조직 목록을 불러오지 못했습니다.'))
  }, [tree])

  const toggle = async (slug, on) => {
    setBusy(slug)
    setError('')
    try {
      const res = on
        ? await apiFetch(`/cards/${card.id}/mounts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ org_slug: slug }),
          })
        : await apiFetch(`/cards/${card.id}/mounts/${encodeURIComponent(slug)}`, {
            method: 'DELETE',
          })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error || '처리하지 못했습니다.')
        return
      }
      // 서버가 돌려준 카드를 그대로 믿는다. 화면이 자기 상태를 따로 세면
      // 실패한 요청 하나에 두 쪽이 어긋나기 시작한다.
      setMounted(new Set((body.card.mounted_orgs || []).map((o) => o.slug)))
      onChanged?.(body.card)
    } catch {
      setError('서버에 연결하지 못했습니다.')
    } finally {
      setBusy(null)
    }
  }

  const isDraft = card.status === 'draft'

  return (
    <Backdrop onClick={onClose}>
      <Box onClick={(e) => e.stopPropagation()}>
        <Head>
          <Title>{card.name} — 조직 게시</Title>
          <Sub>
            고른 조직에서 이 카드가 보입니다. <b>사본이 아니라 원본을 가리킵니다</b> —
            카드를 고치면 게시된 모든 조직에 그대로 반영됩니다.
            <br />
            팀에 걸면 그 <b>상위 본부에서도 보입니다.</b> 본부에 따로 걸 필요는 없습니다.
          </Sub>
        </Head>

        <List>
          {isDraft ? (
            <Empty>
              아직 초안입니다.
              <br />
              먼저 카드를 게시한 뒤에 조직에 올릴 수 있습니다.
            </Empty>
          ) : nodes.length === 0 ? (
            <Empty>
              조직이 아직 없습니다.
              <br />
              관리자가 왼쪽 트리에서 조직을 만들어야 합니다.
            </Empty>
          ) : (
            nodes.map((node) => (
              <OrgRow
                key={node.slug}
                node={node}
                depth={0}
                mounted={mounted}
                busy={busy}
                onToggle={toggle}
              />
            ))
          )}
        </List>

        <Foot>
          <Err>{error}</Err>
          <CloseBtn onClick={onClose}>닫기</CloseBtn>
        </Foot>
      </Box>
    </Backdrop>
  )
}

export default PublishToOrgDialog
