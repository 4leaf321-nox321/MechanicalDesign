/**
 * 이전 기록 고르기 — 카드와 워크플로가 함께 쓴다.
 *
 * 기록은 쌓인다. 같은 카드로 백 번 계산하면 백 개가 쌓이고, 그중에서 「그때
 * 그 조건」을 찾아내는 것이 이 창이 하는 일의 전부다. 그래서 목록이 아니라
 * **찾는 도구**로 만든다 — 검색과 페이지가 없으면 스무 개만 넘어가도 못 쓴다.
 *
 * ## 무엇을 고르게 하나는 여기서 정하지 않는다
 *
 * 카드는 「그 카드의 기록」, 워크플로는 「그 워크플로의 기록」을 고른다. 그
 * 차이는 `query` 하나로 들어오고, 고른 뒤에 무엇을 하는지도 부르는 쪽이 정한다.
 * 값을 어떻게 맞출지는 카드와 워크플로가 서로 다르고, 그 규칙까지 여기 들이면
 * 이 창이 둘을 다 알아야 한다.
 *
 * ## 검색은 서버가 한다
 *
 * 받아 온 뒤 걸러 내면 **첫 페이지 안에서만** 찾게 된다 — 100번째 기록은 검색해도
 * 안 나온다. 찾는 도구가 찾는 시늉만 하는 것이 이 창에서 가장 나쁜 실패다.
 */

import React, { useCallback, useEffect, useState } from 'react'
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
  background: hsl(var(--surface));
  border-radius: var(--radius);
  width: 80vw;
  height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
  overflow: hidden;
`

const Head = styled.div`
  padding: 18px 24px 14px;
  border-bottom: 1px solid hsl(var(--border));
`

const Title = styled.h3`
  margin: 0 0 4px;
  font-size: 1.05rem;
  color: hsl(var(--fg));
`

const Sub = styled.p`
  margin: 0;
  font-size: 0.82rem;
  color: hsl(var(--fg-muted));
  line-height: 1.55;
`

const Tools = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 24px;
  border-bottom: 1px solid hsl(var(--surface-2));
`

const Search = styled.input`
  flex: 1;
  padding: 8px 12px;
  border: 1px solid hsl(var(--border-strong));
  border-radius: var(--radius);
  font-size: 0.88rem;

  &:focus {
    outline: none;
    border-color: hsl(var(--accent));
  }
`

const Toggle = styled.label`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.83rem;
  color: hsl(var(--fg-muted));
  white-space: nowrap;
  cursor: pointer;
`

/** 표만 스크롤한다. 창째로 스크롤하면 머리와 페이지 단추가 따라 올라간다. */
const Scroll = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
`

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.86rem;
`

const Th = styled.th`
  position: sticky;
  top: 0;
  background: hsl(var(--surface-2));
  text-align: left;
  padding: 9px 24px;
  font-size: 0.76rem;
  font-weight: 700;
  color: hsl(var(--fg-muted));
  border-bottom: 1px solid hsl(var(--border));
  white-space: nowrap;
`

const Td = styled.td`
  padding: 11px 24px;
  border-bottom: 1px solid hsl(var(--surface-2));
  color: hsl(var(--fg-muted));
  vertical-align: top;
`

const Row = styled.tr`
  cursor: pointer;

  &:hover {
    background: hsl(var(--surface-2));
  }
`

const RowTitle = styled.div`
  color: hsl(var(--fg));
  font-weight: 600;
`

const RowNote = styled.div`
  margin-top: 2px;
  font-size: 0.78rem;
  color: hsl(var(--fg-subtle));
`

const Loop = styled.span`
  margin-left: 8px;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 999px;
  background: hsl(var(--warn-soft));
  color: hsl(var(--warn));
  border: 1px solid hsl(var(--warn-border));
  white-space: nowrap;
`

const Foot = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 24px;
  border-top: 1px solid hsl(var(--border));
`

const Count = styled.span`
  font-size: 0.82rem;
  color: hsl(var(--fg-muted));
  margin-right: auto;
`

const Btn = styled.button`
  border: 1px solid hsl(var(--border-strong));
  background: hsl(var(--surface));
  border-radius: var(--radius);
  padding: 7px 14px;
  font-size: 0.84rem;
  color: hsl(var(--fg-muted));
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: hsl(var(--accent));
    color: hsl(var(--accent));
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`

const Empty = styled.div`
  padding: 40px 24px;
  text-align: center;
  color: hsl(var(--fg-subtle));
  font-size: 0.88rem;
  line-height: 1.7;
`

const ErrorBox = styled.div`
  margin: 14px 24px;
  padding: 11px 14px;
  border-radius: var(--radius);
  background: hsl(var(--danger-soft));
  border: 1px solid hsl(var(--danger-border));
  color: hsl(var(--danger));
  font-size: 0.85rem;
`

const PER_PAGE = 15

function when(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} `
    + `${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * @param query   `{card_id}` 또는 `{workflow_id}` — 어느 기록을 고를 것인가
 * @param onPick  고른 기록의 **상세**를 받는다. 목록에는 입력값이 안 실려 온다
 * @param note    부르는 쪽이 설명할 것 (무엇이 채워지고 무엇은 안 채워지는지)
 */
function RecordPicker({ query, title = '이전 입력 불러오기', note, onPick, onClose }) {
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [mineOnly, setMineOnly] = useState(false)
  const [body, setBody] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const scope = JSON.stringify(query)

  const load = useCallback(async () => {
    const params = new URLSearchParams({ ...JSON.parse(scope) })
    params.set('page', String(page))
    params.set('per_page', String(PER_PAGE))
    if (keyword.trim()) params.set('q', keyword.trim())
    if (mineOnly) params.set('mine', '1')
    try {
      const res = await apiFetch(`/records?${params}`)
      const got = await res.json()
      if (!res.ok) throw new Error(got.error)
      setBody(got)
      setError('')
    } catch (err) {
      setError(err.message || '기록을 불러오지 못했습니다.')
    }
  }, [scope, page, keyword, mineOnly])

  useEffect(() => {
    // 글자를 칠 때마다 부르지 않는다. 사람이 손을 멈춘 뒤에 한 번이면 된다.
    const timer = setTimeout(load, 250)
    return () => clearTimeout(timer)
  }, [load])

  // 검색어가 바뀌면 1쪽부터. 3쪽을 보다 검색하면 결과가 한 쪽뿐일 수 있다.
  useEffect(() => { setPage(1) }, [keyword, mineOnly])

  const pick = async (row) => {
    setBusy(true)
    setError('')
    try {
      // 목록에는 입력값이 안 실려 온다(스냅샷이 커서 상세에만 있다).
      const res = await apiFetch(`/records/${row.id}`)
      const full = await res.json()
      if (!res.ok) throw new Error(full.error)
      onPick(full)
    } catch (err) {
      setError(err.message || '기록을 불러오지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const items = body?.items || []
  const pages = body?.pages || 1

  return (
    <Backdrop onClick={onClose}>
      <Box onClick={(e) => e.stopPropagation()}>
        <Head>
          <Title>{title}</Title>
          <Sub>{note}</Sub>
        </Head>

        <Tools>
          <Search
            autoFocus
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="이름표로 찾기 — 예: Model X 브래킷"
          />
          <Toggle>
            <input type="checkbox" checked={mineOnly}
                   onChange={(e) => setMineOnly(e.target.checked)} />
            내 기록만
          </Toggle>
        </Tools>

        {error && <ErrorBox>{error}</ErrorBox>}

        <Scroll>
          {body === null ? (
            <Empty>불러오는 중…</Empty>
          ) : items.length === 0 ? (
            <Empty>
              {keyword.trim()
                ? `'${keyword.trim()}' 에 맞는 기록이 없습니다.`
                : '아직 남긴 기록이 없습니다. 계산한 뒤 「기록 저장」 을 누르면 여기에 쌓입니다.'}
            </Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>이름표</Th>
                  <Th>계산한 사람</Th>
                  <Th>계산한 때</Th>
                </tr>
              </thead>
              <tbody>
                {items.map(row => (
                  <Row key={row.id} onClick={() => !busy && pick(row)}>
                    <Td>
                      <RowTitle>
                        {row.title}
                        {/* 반복으로 얻은 값이면 그 사실이 여기서도 보여야 한다.
                            불러온 초기 추정값이 어떤 성격인지가 달라진다. */}
                        {row.run_meta?.loops?.length > 0 && <Loop>↺ 반복</Loop>}
                      </RowTitle>
                      {row.note && <RowNote>{row.note}</RowNote>}
                    </Td>
                    <Td>{row.created_by_name || '—'}</Td>
                    <Td>{when(row.created_at)}</Td>
                  </Row>
                ))}
              </tbody>
            </Table>
          )}
        </Scroll>

        <Foot>
          <Count>
            {body ? `${body.total}건 중 ${items.length}건 · ${body.page}/${pages} 쪽` : ''}
          </Count>
          <Btn disabled={!body || body.page <= 1}
               onClick={() => setPage(p => p - 1)}>← 이전</Btn>
          <Btn disabled={!body || body.page >= pages}
               onClick={() => setPage(p => p + 1)}>다음 →</Btn>
          <Btn onClick={onClose}>닫기</Btn>
        </Foot>
      </Box>
    </Backdrop>
  )
}

export default RecordPicker
