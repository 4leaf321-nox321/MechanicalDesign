/**
 * 변경 이력 — 이 카드가 언제 누구에 의해 어떻게 바뀌었나.
 *
 * **"게시 후 AI 수정됨" 을 여기서 마무리한다.** 그 표시는 뭔가 바뀌었다고만
 * 말하고 끝났고, 그것을 본 사람이 할 수 있는 일은 수식을 눈으로 훑는 것뿐이었다.
 *
 * 그래서 목록에 **무엇이 바뀌었는지를 바로 적는다.** 접었다 펴야 보이면 아무도
 * 펴지 않는다 — 이력을 보러 온 사람이 알고 싶은 것이 정확히 그 한 줄이다.
 */

import React, { useCallback, useEffect, useState } from 'react'
import styled from 'styled-components'

import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useDialog } from './Dialog'

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  justify-content: flex-end;
  z-index: 1000;
`

const Panel = styled.div`
  width: min(560px, 100%);
  height: 100%;
  background: hsl(var(--surface-2));
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.18);
`

const Head = styled.div`
  background: hsl(var(--fg));
  color: white;
  padding: 20px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const HeadTitle = styled.h2`
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
`

const HeadSub = styled.p`
  margin: 4px 0 0 0;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.6);
`

const CloseBtn = styled.button`
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.35);
  color: white;
  border-radius: var(--radius);
  padding: 6px 12px;
  font-size: 0.85rem;
  cursor: pointer;

  &:hover { background: rgba(255, 255, 255, 0.12); }
`

const Body = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 18px 20px;
`

const Entry = styled.div`
  background: hsl(var(--surface));
  border-radius: var(--radius);
  border: 1px solid hsl(var(--border));
  padding: 14px 16px;
  margin-bottom: 12px;
`

const EntryHead = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
`

const Who = styled.span`
  font-weight: 700;
  color: hsl(var(--fg));
  font-size: 0.9rem;
`

const When = styled.span`
  font-size: 0.8rem;
  color: hsl(var(--fg-subtle));
`

/** 기계가 고친 것. 카드 목록의 "AI 작성" 과 같은 색으로 맞춘다. */
const AiTag = styled.span`
  background: hsl(var(--accent-soft));
  color: hsl(var(--accent));
  border: 1px solid hsl(var(--accent) / 0.35);
  border-radius: var(--radius-sm);
  padding: 1px 7px;
  font-size: 0.72rem;
  font-weight: 700;
`

const NowTag = styled.span`
  background: hsl(var(--ok-soft));
  color: hsl(var(--ok));
  border: 1px solid hsl(var(--ok-border));
  border-radius: var(--radius-sm);
  padding: 1px 7px;
  font-size: 0.72rem;
  font-weight: 700;
`

const Change = styled.div`
  font-size: 0.85rem;
  line-height: 1.6;
  color: hsl(var(--fg-muted));
  padding: 3px 0 3px 12px;
  border-left: 3px solid ${p => p.$color};
  margin-bottom: 4px;
  word-break: break-word;
`

const KIND_COLOR = {
  // 「여기서부터 기록한다」 는 표시. 누가 한 일이 아니라 출발점이라 무채색이다.
  baseline: 'hsl(var(--border-strong))',
  added: 'hsl(var(--ok))',
  removed: 'hsl(var(--danger))',
  changed: 'hsl(var(--warn))',
  // 워크플로 쪽에서 더 오는 둘. 값이 바뀐 것과 계산 방법이 바뀐 것은 성격이
  // 달라서, 한 목록에 섞여도 눈으로 갈라 볼 수 있어야 한다.
  value: 'hsl(var(--accent))',
  iteration: 'hsl(var(--info))',
}

const RestoreBtn = styled.button`
  margin-top: 10px;
  padding: 6px 14px;
  background: none;
  border: 1px solid hsl(var(--border-strong));
  color: hsl(var(--fg-muted));
  border-radius: var(--radius);
  font-size: 0.8rem;
  cursor: pointer;

  &:hover:not(:disabled) { background: hsl(var(--surface-2)); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`

const Empty = styled.p`
  color: hsl(var(--fg-subtle));
  font-size: 0.88rem;
  text-align: center;
  margin-top: 40px;
  line-height: 1.6;
`

const ErrorBox = styled.div`
  background: hsl(var(--danger-soft));
  border: 1px solid hsl(var(--danger-border));
  color: hsl(var(--danger));
  border-radius: var(--radius);
  padding: 11px 13px;
  font-size: 0.85rem;
  margin-bottom: 14px;
  white-space: pre-line;
`

function formatWhen(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} `
    + `${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * 카드와 워크플로가 **같은 판**을 쓴다.
 *
 * 이력 화면을 둘로 나누면 두 벌이 되고, 두 벌은 반드시 어긋난다 — 그때 나란히
 * 놓인 두 목록이 같은 종류의 변경을 서로 다른 말과 색으로 말하게 된다. 서버가
 * 두 이력을 같은 모양(`changes` 목록)으로 내려 주므로 화면도 하나면 된다.
 */
const SOURCE = {
  card: {
    base: (id) => `/cards/${id}`,
    empty: '변수를 고치면 여기에 남습니다.',
  },
  workflow: {
    base: (id) => `/workflows/${id}`,
    empty: '배선이나 값을 고치면 여기에 남습니다.',
    // 되돌리기가 없다. 되돌리려면 노드를 지우고 다시 만들어야 하는데, 이
    // 워크플로를 품은 바깥 워크플로의 배선은 **안쪽 노드 id** 를 가리킨다 —
    // 되돌리는 순간 그 배선들이 없는 자리를 가리키고, 아무 오류도 안 난다.
    noRestore: true,
  },
}

export default function HistoryPanel({
  kind = 'card', cardId, cardName, canRestore, onClose, onRestored,
}) {
  const source = SOURCE[kind] || SOURCE.card
  const { confirm } = useDialog()
  const { user } = useAuth()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setEntries(await api.get(`${source.base(cardId)}/revisions`))
      setError('')
    } catch (err) {
      setError(err.message || '이력을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [cardId, source])

  useEffect(() => { load() }, [load])

  const handleRestore = async (entry) => {
    const ok = await confirm({
      title: `${formatWhen(entry.created_at)} 시점으로 되돌립니다`,
      body: '그 뒤에 바뀐 수식·변수는 모두 그때 상태로 돌아갑니다.'
        + '\n되돌린 것도 이력에 남으므로 다시 앞으로 돌아올 수 있습니다.',
      confirmLabel: '되돌리기',
    })
    if (!ok) return
    setBusy(true)
    setError('')
    try {
      await api.post(`${source.base(cardId)}/revisions/${entry.id}/restore`, {})
      await load()
      if (onRestored) onRestored()
    } catch (err) {
      setError(err.message || '되돌리지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Overlay onClick={onClose}>
      <Panel onClick={(e) => e.stopPropagation()}>
        <Head>
          <div>
            <HeadTitle>변경 이력</HeadTitle>
            <HeadSub>{cardName}</HeadSub>
          </div>
          <CloseBtn onClick={onClose}>닫기</CloseBtn>
        </Head>

        <Body>
          {error && <ErrorBox>{error}</ErrorBox>}

          {loading ? (
            <Empty>불러오는 중…</Empty>
          ) : entries.length === 0 ? (
            <Empty>
              아직 기록된 변경이 없습니다.{'\n'}
              {source.empty}
            </Empty>
          ) : (
            entries.map((entry, index) => (
              <Entry key={entry.id}>
                <EntryHead>
                  {/* 출발점 줄에는 사람이 없다. 그 자리를 「삭제된 계정」 으로
                      메우면, 아무도 한 적 없는 일을 누가 하고 사라진 것처럼
                      읽힌다. */}
                  <Who>
                    {entry.changes.some(c => c.kind === 'baseline')
                      ? '기록 시작'
                      : (entry.changed_by_name || '(삭제된 계정)')}
                  </Who>
                  {entry.via_token && <AiTag>AI · MCP</AiTag>}
                  {index === 0 && <NowTag>현재</NowTag>}
                  <When>{formatWhen(entry.created_at)}</When>
                </EntryHead>

                {entry.changes.length === 0 ? (
                  <Change $color="hsl(var(--border-strong))">(내용을 읽지 못했습니다)</Change>
                ) : (
                  entry.changes.map((change, i) => (
                    <Change key={i} $color={KIND_COLOR[change.kind] || 'hsl(var(--border-strong))'}>
                      {change.text}
                    </Change>
                  ))
                )}

                {/* 지금 상태로 되돌리는 것은 아무 일도 아니므로 버튼을 두지 않는다. */}
                {canRestore && !source.noRestore && index > 0 && (
                  <RestoreBtn disabled={busy} onClick={() => handleRestore(entry)}>
                    이 시점으로 되돌리기
                  </RestoreBtn>
                )}
              </Entry>
            ))
          )}
        </Body>
      </Panel>
    </Overlay>
  )
}
