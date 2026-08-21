/**
 * 계산 기록 목록.
 *
 * 사람이 여기 오는 이유는 하나다 — **"지난주에 한 그 계산"** 을 다시 찾으려고.
 * 그래서 기본은 최신순이고, 찾는 수단은 이름표와 카드 이름 둘 다다. 사람은
 * 둘 중 기억나는 쪽으로 찾는다.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styled from 'styled-components'

import { api } from '../../shared/api/client'
import { useAuth } from '../../shared/auth/AuthContext'
import {
  Body, Empty, ErrorBox, GhostBtn, Header, HeaderSub, HeaderTitle,
  Page, Panel, Table, Td, Th,
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
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.92rem;

  &:focus {
    outline: none;
    border-color: #3498db;
  }
`

const Toggle = styled.button`
  padding: 10px 16px;
  border-radius: 6px;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid ${p => (p.$on ? '#1a1a2e' : '#ddd')};
  background: ${p => (p.$on ? '#1a1a2e' : 'white')};
  color: ${p => (p.$on ? 'white' : '#555')};
`

const Row = styled.tr`
  cursor: pointer;

  &:hover {
    background: #f7fafd;
  }
`

const TitleCell = styled.div`
  font-weight: 600;
  color: #1a1a2e;
`

const NoteCell = styled.div`
  font-size: 0.82rem;
  color: #999;
  margin-top: 3px;
`

/** 카드가 지워진 기록. 그 계산이 무엇이었는지는 스냅샷에 남아 있다. */
const GoneTag = styled.span`
  display: inline-block;
  margin-left: 6px;
  background: #f2f2f2;
  color: #888;
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 0.72rem;
  font-weight: 600;
`

const DangerBtn = styled.button`
  padding: 5px 11px;
  background: none;
  border: 1px solid #e0b4b4;
  color: #a4343a;
  border-radius: 5px;
  font-size: 0.78rem;
  cursor: pointer;

  &:hover { background: #fdecea; }
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
  const { user } = useAuth()

  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [mineOnly, setMineOnly] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const query = new URLSearchParams()
      if (keyword.trim()) query.set('q', keyword.trim())
      if (mineOnly) query.set('mine', '1')
      const suffix = query.toString() ? `?${query}` : ''
      setRecords(await api.get(`/records${suffix}`))
      setError('')
    } catch (err) {
      setError(err.message || '기록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [keyword, mineOnly])

  useEffect(() => {
    // 글자를 칠 때마다 부르지 않는다. 사람이 손을 멈춘 뒤에 한 번이면 된다.
    const timer = setTimeout(load, 250)
    return () => clearTimeout(timer)
  }, [load])

  const handleDelete = async (event, record) => {
    event.stopPropagation()
    const ok = window.confirm(
      `'${record.title}' 기록을 지웁니다.\n\n` +
        '그때의 입력값·결과·계산 정의가 함께 사라집니다. 되돌릴 수 없습니다.',
    )
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
      <Header>
        <div>
          <HeaderTitle>계산 기록</HeaderTitle>
          <HeaderSub>{user?.display_name} — 언제 무엇을 어떤 값으로 계산했는지</HeaderSub>
        </div>
        <div>
          <GhostBtn onClick={() => navigate('/')}>← 홈으로</GhostBtn>
        </div>
      </Header>

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
                      {record.card_name}
                      {!record.card_exists && <GoneTag>삭제된 카드</GoneTag>}
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
      </Body>
    </Page>
  )
}
