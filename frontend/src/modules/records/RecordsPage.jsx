/**
 * 계산 기록 목록.
 *
 * 사람이 여기 오는 이유는 하나다 — **"지난주에 한 그 계산"** 을 다시 찾으려고.
 * 그래서 기본은 최신순이고, 찾는 수단은 이름표와 카드 이름 둘 다다. 사람은
 * 둘 중 기억나는 쪽으로 찾는다.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import styled from 'styled-components'
import AppHeader, { BarButton } from '../../shared/components/AppHeader'

import { api } from '../../shared/api/client'
import { useAuth } from '../../shared/auth/AuthContext'
import { useDialog } from '../../shared/components/Dialog'
import {
  Body, Empty, ErrorBox, Page, Panel, Table, Td, Th,
} from './recordStyles'

const Bar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 18px;
  flex-wrap: wrap;
`

const Search = styled.input`
  flex: 1 1 260px;
  padding: 10px 13px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  font-size: 0.92rem;

  &:focus {
    outline: none;
    border-color: hsl(var(--primary));
  }
`

const Toggle = styled.button`
  padding: 10px 16px;
  border-radius: var(--radius);
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid ${p => (p.$on ? 'hsl(var(--fg))' : 'hsl(var(--border))')};
  background: ${p => (p.$on ? 'hsl(var(--fg))' : 'white')};
  color: ${p => (p.$on ? 'white' : 'hsl(var(--fg-muted))')};
`

const Row = styled.tr`
  cursor: pointer;

  &:hover {
    background: hsl(var(--surface-2));
  }
`

const TitleCell = styled.div`
  font-weight: 600;
  color: hsl(var(--fg));
`

const NoteCell = styled.div`
  font-size: 0.82rem;
  color: hsl(var(--fg-subtle));
  margin-top: 3px;
`

/** 카드가 지워진 기록. 그 계산이 무엇이었는지는 스냅샷에 남아 있다. */
const GoneTag = styled.span`
  display: inline-block;
  margin-left: 6px;
  background: hsl(var(--surface-2));
  color: hsl(var(--fg-subtle));
  border-radius: var(--radius-sm);
  padding: 1px 6px;
  font-size: 0.72rem;
  font-weight: 600;
`

/** 카드 기록과 워크플로 기록이 한 목록에 섞인다. 어느 쪽인지는 보여야 한다. */
const KindTag = styled.span`
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 700;
  background: hsl(var(--accent-soft));
  color: hsl(var(--accent));
  border: 1px solid hsl(var(--accent) / 0.35);
`

const DangerBtn = styled.button`
  padding: 5px 11px;
  background: none;
  border: 1px solid hsl(var(--danger-border));
  color: hsl(var(--danger));
  border-radius: var(--radius-sm);
  font-size: 0.78rem;
  cursor: pointer;

  &:hover { background: hsl(var(--danger-soft)); }
`

const Pager = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
`

/** 본문용 단추. `GhostBtn` 은 남색 머리띠 위에 놓는 것이라 글씨가 희다. */
const PageBtn = styled.button`
  border: 1px solid hsl(var(--border-strong));
  background: hsl(var(--surface));
  border-radius: var(--radius);
  padding: 7px 14px;
  font-size: 0.84rem;
  color: hsl(var(--fg-muted));
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: hsl(var(--primary));
    color: hsl(var(--primary));
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`

const PagerCount = styled.span`
  margin-right: auto;
  font-size: 0.83rem;
  color: hsl(var(--fg-muted));
`

function formatWhen(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function RecordsPage() {
  const navigate = useNavigate()
  const { confirm } = useDialog()
  const { user } = useAuth()

  const [body, setBody] = useState(null)
  const [page, setPage] = useState(1)
  const records = body?.items || []
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [mineOnly, setMineOnly] = useState(false)

  // 카드나 워크플로 화면에서 「이걸로 계산한 기록」 을 누르면 여기로 온다.
  // 걸러 내기는 서버가 이미 하고 있었다 — 화면만 그 길을 안 쓰고 있었다.
  const [params, setParams] = useSearchParams()
  const onlyCard = params.get('card_id')
  const onlyWorkflow = params.get('workflow_id')
  const scoped = onlyCard || onlyWorkflow

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const query = new URLSearchParams()
      if (keyword.trim()) query.set('q', keyword.trim())
      if (mineOnly) query.set('mine', '1')
      if (onlyCard) query.set('card_id', onlyCard)
      if (onlyWorkflow) query.set('workflow_id', onlyWorkflow)
      query.set('page', String(page))
      setBody(await api.get(`/records?${query}`))
      setError('')
    } catch (err) {
      setError(err.message || '기록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [keyword, mineOnly, onlyCard, onlyWorkflow, page])

  // 찾는 말이 바뀌면 1쪽부터. 3쪽을 보다 검색하면 결과가 한 쪽뿐일 수 있다.
  useEffect(() => { setPage(1) }, [keyword, mineOnly, onlyCard, onlyWorkflow])

  useEffect(() => {
    // 글자를 칠 때마다 부르지 않는다. 사람이 손을 멈춘 뒤에 한 번이면 된다.
    const timer = setTimeout(load, 250)
    return () => clearTimeout(timer)
  }, [load])

  const handleDelete = async (event, record) => {
    event.stopPropagation()
    const ok = await confirm({
      title: `'${record.title}' 기록을 지웁니다`,
      body: '그때의 입력값·결과·계산 정의가 함께 사라집니다.'
        + '\n되돌릴 수 없습니다.',
      confirmLabel: '지우기',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await api.del(`/records/${record.id}`)
      await load()
    } catch (err) {
      setError(err.message || '기록을 지우지 못했습니다.')
    }
  }

  return (
    <Page>
      {/* 걸러진 목록에서 그 사실을 안 밝히면, 기록이 사라진 줄 안다. */}
      <AppHeader
        title="계산 기록"
        subtitle={scoped
          ? `${records[0]?.source_name || '이것'} 으로 계산한 기록만 보고 있습니다 (${body?.total ?? 0}건)`
          : `${user?.display_name} — 언제 무엇을 어떤 값으로 계산했는지`}
        onHome={() => navigate('/')}
        right={scoped && (
          <BarButton onClick={() => setParams({})}>전체 기록 보기</BarButton>
        )}
      />

      <Body>
        {error && <ErrorBox>{error}</ErrorBox>}

        <Bar>
          <Search
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="이름표나 카드 이름으로 찾기"
          />
          <Toggle $on={mineOnly} onClick={() => setMineOnly(v => !v)}>
            {mineOnly ? '내 기록만' : '전체'}
          </Toggle>
        </Bar>

        <Panel>
          {loading ? (
            <Empty>불러오는 중…</Empty>
          ) : records.length === 0 ? (
            <Empty>
              {keyword.trim()
                ? '찾는 기록이 없습니다.'
                : '아직 남긴 기록이 없습니다. 카드에서 계산한 뒤 "기록 저장" 을 눌러 보세요.'}
            </Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>기록</Th>
                  <Th>카드</Th>
                  <Th>계산한 사람</Th>
                  <Th>언제</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <Row key={record.id} onClick={() => navigate(`/records/${record.id}`)}>
                    <Td>
                      <TitleCell>{record.title}</TitleCell>
                      {record.note && <NoteCell>{record.note}</NoteCell>}
                    </Td>
                    <Td>
                      {/* 카드 기록이든 워크플로 기록이든 이름은 하나로
                          정해져 온다. 화면이 종류를 따지기 시작하면 종류가
                          늘 때마다 여기도 늘어난다. */}
                      {record.source_name}
                      {record.kind === 'workflow' && <KindTag>워크플로</KindTag>}
                      {!record.source_exists && (
                        <GoneTag>
                          삭제된 {record.kind === 'workflow' ? '워크플로' : '카드'}
                        </GoneTag>
                      )}
                    </Td>
                    <Td>{record.created_by_name || '—'}</Td>
                    <Td>{formatWhen(record.created_at)}</Td>
                    <Td>
                      {(record.created_by_id === user?.id || user?.is_admin) && (
                        <DangerBtn onClick={(e) => handleDelete(e, record)}>삭제</DangerBtn>
                      )}
                    </Td>
                  </Row>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>

        {/* 몇 건 중 몇 쪽인지 없으면, 목록이 여기서 끝인지 잘린 것인지 모른다. */}
        {body && body.pages > 1 && (
          <Pager>
            <PagerCount>
              {body.total}건 · {body.page}/{body.pages} 쪽
            </PagerCount>
            <PageBtn disabled={body.page <= 1}
                     onClick={() => setPage(p => p - 1)}>← 이전</PageBtn>
            <PageBtn disabled={body.page >= body.pages}
                     onClick={() => setPage(p => p + 1)}>다음 →</PageBtn>
          </Pager>
        )}
      </Body>
    </Page>
  )
}
