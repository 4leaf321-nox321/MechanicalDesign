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
  gap: 10px;
  padding: 9px 24px;
  cursor: pointer;
  font-size: 0.88rem;
  color: #374151;

  &:hover {
    background: #f6f7f9;
  }
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

function PublishToOrgDialog({ card, onClose, onChanged }) {
  const [orgs, setOrgs] = useState([])
  const [mounted, setMounted] = useState(
    () => new Set((card.mounted_orgs || []).map((o) => o.slug)),
  )
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    apiFetch('/orgs')
      .then((r) => r.json())
      .then(setOrgs)
      .catch(() => setError('조직 목록을 불러오지 못했습니다.'))
  }, [])

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
          </Sub>
        </Head>

        <List>
          {isDraft ? (
            <Empty>
              아직 초안입니다.
              <br />
              먼저 카드를 게시한 뒤에 조직에 올릴 수 있습니다.
            </Empty>
          ) : orgs.length === 0 ? (
            <Empty>
              조직이 아직 없습니다.
              <br />
              관리자가 왼쪽 트리에서 조직을 만들어야 합니다.
            </Empty>
          ) : (
            orgs.map((org) => (
              <Item key={org.slug}>
                <input
                  type="checkbox"
                  checked={mounted.has(org.slug)}
                  disabled={busy === org.slug}
                  onChange={(e) => toggle(org.slug, e.target.checked)}
                />
                <span>{org.name}</span>
              </Item>
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
