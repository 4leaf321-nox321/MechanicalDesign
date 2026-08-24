/**
 * 표 정의 — 여러 변수가 함께 쓰는 표를 여기서 관리한다.
 *
 * 전에는 변수 편집 안의 템플릿 모달에서만 다룰 수 있었다. 표가 몇 개인지, 어느
 * 변수가 무엇을 쓰는지 보려면 변수를 하나 열어야 했고, 원본을 고치려면 그 표를
 * 참조하는 변수를 찾아 들어가야 했다.
 *
 * 저장소는 변수 템플릿과 같다(`/api/templates`, var_type=table). 여기서 만든 표를
 * 변수 정의의 `🔗 표 참조` 로 연결하면, 원본을 한 번 고칠 때 참조하는 변수가
 * 모두 함께 바뀐다.
 */

import React, { useCallback, useEffect, useState } from 'react'
import styled from 'styled-components'

import { apiFetch } from '../../api/client'
import { TabPane, TabScroll, TabToolbar } from './TabLayout'
import TableGrid from './TableGrid'

const Toolbar = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
`

const SearchInput = styled.input`
  flex: 1;
  padding: 9px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.9rem;
  outline: none;
  &:focus { border-color: #3498db; }
`

const AddBtn = styled.button`
  padding: 9px 18px;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  &:hover { background: #2980b9; }
`

/**
 * 목록을 여러 열로 편다.
 *
 * 한 열이면 카드가 모달 너비만큼 늘어나 **이름 한 줄에 빈 공간이 한 뼘**
 * 남는다. 정작 세로로는 길어져서, 변수가 스무 개면 아래쪽은 스크롤해야만
 * 보인다. 자동 채움으로 두면 모달이 좁을 때는 한 열, 넓을 때는 두세 열이
 * 되어 어느 쪽으로도 낭비가 없다.
 *
 * `minmax(N, 1fr)` 의 N 은 **카드가 읽히는 최소 너비**다. 이보다 좁아지면
 * 이름이 잘리고 배지가 줄바꿈돼 오히려 알아보기 어렵다.
 */
const TableGridWrap = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 10px;
  align-items: start;
`

const Card = styled.div`
  background: #f8f9fa;
  border: 1px solid ${p => (p.$open ? '#3498db' : '#e9ecef')};
  border-radius: 8px;
  overflow: hidden;

  /* 펼친 표는 **줄 전체**를 쓴다. 한 칸 너비에 가두면 열이 몇 개만 돼도
     격자가 가로로 밀려, 편집하려고 연 사람이 스크롤부터 하게 된다. */
  ${p => p.$open && 'grid-column: 1 / -1;'}
`

const CardHead = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 16px;
  cursor: pointer;
  &:hover { background: #f1f3f5; }
`

const Name = styled.div`
  font-weight: 600;
  font-size: 0.92rem;
  color: #333;
  flex-shrink: 0;
`

const Shape = styled.span`
  font-size: 0.78rem;
  color: #888;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const UsageBadge = styled.span`
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 10px;
  flex-shrink: 0;
  background: ${p => (p.$count > 0 ? '#e3f2fd' : '#f0f0f0')};
  color: ${p => (p.$count > 0 ? '#1565c0' : '#bbb')};
`

const IconBtn = styled.button`
  background: none;
  border: none;
  color: ${p => (p.$danger ? '#c0392b' : '#888')};
  cursor: pointer;
  padding: 5px 9px;
  border-radius: 4px;
  font-size: 0.82rem;
  flex-shrink: 0;
  &:hover { background: ${p => (p.$danger ? '#fee' : '#e9ecef')}; }
`

const Body = styled.div`
  padding: 0 16px 16px 16px;
  border-top: 1px solid #e9ecef;
`

const NameRow = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 14px 0;
`

const NameInput = styled.input`
  flex: 1;
  padding: 8px 11px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.9rem;
  outline: none;
  &:focus { border-color: #3498db; }
`

const SaveBtn = styled.button`
  padding: 8px 16px;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  &:hover:not(:disabled) { background: #2980b9; }
  &:disabled { background: #b0d4f1; cursor: not-allowed; }
`

const UsageList = styled.div`
  font-size: 0.8rem;
  color: #666;
  background: #eaf4fc;
  border: 1px solid #b3d9f2;
  border-radius: 6px;
  padding: 9px 12px;
  margin-bottom: 12px;
  line-height: 1.6;
`

const Message = styled.div`
  border-radius: 6px;
  padding: 11px 13px;
  font-size: 0.85rem;
  line-height: 1.5;
  margin-bottom: 12px;
  white-space: pre-line;
  background: ${p => (p.$error ? '#fdecea' : '#eef7ee')};
  border: 1px solid ${p => (p.$error ? '#f5c6cb' : '#cbe5cb')};
  color: ${p => (p.$error ? '#a4343a' : '#2f6b34')};
`

const Empty = styled.div`
  text-align: center;
  padding: 48px 24px;
  color: #bbb;
  font-size: 0.95rem;
  line-height: 1.7;
`

const EMPTY_TABLE = { columns: ['열 1', '열 2'], rows: [['', ''], ['', '']] }

function parseTable(raw) {
  try {
    const d = JSON.parse(raw || '{}')
    return {
      columns: Array.isArray(d.columns) && d.columns.length ? d.columns : EMPTY_TABLE.columns,
      rows: Array.isArray(d.rows) && d.rows.length ? d.rows : EMPTY_TABLE.rows,
    }
  } catch {
    return { ...EMPTY_TABLE }
  }
}

function TableDefinitionTab() {
  const [tables, setTables] = useState([])
  const [usage, setUsage] = useState({})       // { [id]: 사용하는 변수 목록 }
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState(null)
  const [draft, setDraft] = useState(null)     // { name, columns, rows }
  const [message, setMessage] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/templates?var_type=table')
      if (!res.ok) return
      const list = await res.json()
      setTables(list)

      // 사용처는 표마다 따로 물어야 한다. 목록에 바로 보여야 "이거 지워도 되나"
      // 를 판단할 수 있어서, 목록을 읽을 때 함께 가져온다.
      const counts = {}
      await Promise.all(list.map(async (t) => {
        try {
          const r = await apiFetch(`/templates/${t.id}/usage`)
          if (r.ok) counts[t.id] = (await r.json()).users
        } catch { /* 사용처를 못 읽어도 목록은 보여 준다 */ }
      }))
      setUsage(counts)
    } catch {
      setMessage({ error: true, text: '표 목록을 불러오지 못했습니다.' })
    }
  }, [])

  useEffect(() => { load() }, [load])

  const open = (tpl) => {
    setMessage(null)
    if (openId === tpl.id) { setOpenId(null); setDraft(null); return }
    setOpenId(tpl.id)
    setDraft({ name: tpl.name, ...parseTable(tpl.data) })
  }

  const create = async () => {
    setMessage(null)
    const name = window.prompt('새 표의 이름을 입력하세요.\n(예: 재료 물성표, 베어링 규격표)')
    if (name === null) return
    if (!name.trim()) { setMessage({ error: true, text: '표 이름을 입력해주세요.' }); return }
    try {
      const res = await apiFetch('/templates', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(), var_type: 'table', data: JSON.stringify(EMPTY_TABLE),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setMessage({ error: true, text: body.error || '표를 만들지 못했습니다.' }); return }
      await load()
      setOpenId(body.id)
      setDraft({ name: body.name, ...parseTable(body.data) })
    } catch {
      setMessage({ error: true, text: '서버 통신 실패' })
    }
  }

  /**
   * 표를 통째로 복사한다.
   *
   * **이름이 겹치면 안 된다.** `POST /templates` 는 같은 이름·타입이 이미
   * 있으면 새로 만들지 않고 **그것을 덮어쓴다.** 복사하려다 원본을 날리는
   * 셈이라, 비어 있는 이름을 먼저 찾아 넣어 준다.
   */
  const duplicate = async (e, tpl) => {
    e.stopPropagation()
    setMessage(null)

    const taken = new Set(tables.map(t => t.name))
    let suggested = tpl.name + ' 사본'
    let n = 2
    while (taken.has(suggested)) { suggested = tpl.name + ' 사본 ' + n; n += 1 }

    const name = window.prompt('복사본의 이름을 입력하세요.', suggested)
    if (name === null) return
    const trimmed = name.trim()
    if (!trimmed) { setMessage({ error: true, text: '표 이름을 입력해주세요.' }); return }
    if (taken.has(trimmed)) {
      setMessage({ error: true, text: `'${trimmed}' 표가 이미 있습니다. 그 표를 덮어쓰게 되므로 다른 이름을 쓰세요.` })
      return
    }

    try {
      const res = await apiFetch('/templates', {
        method: 'POST',
        body: JSON.stringify({ name: trimmed, var_type: 'table', data: tpl.data }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setMessage({ error: true, text: body.error || '복사하지 못했습니다.' }); return }
      await load()
      // 복사한 것을 바로 열어 준다. 복사는 대개 고치려고 하는 일이다.
      setOpenId(body.id)
      setDraft({ name: body.name, ...parseTable(body.data) })
      setMessage({ text: `'${trimmed}' 로 복사했습니다.` })
    } catch {
      setMessage({ error: true, text: '서버 통신 실패' })
    }
  }

  const save = async (tpl) => {
    if (!draft.name.trim()) { setMessage({ error: true, text: '표 이름을 입력해주세요.' }); return }
    const users = usage[tpl.id] || []
    if (users.length > 0) {
      // 참조는 편한 만큼 사고도 멀리 퍼진다. 몇 군데가 함께 바뀌는지 먼저 알린다.
      if (!window.confirm(
        `이 표를 참조하는 변수가 ${users.length}개 있습니다.\n` +
        '저장하면 그 변수들의 계산 결과도 함께 바뀝니다. 계속할까요?'
      )) return
    }
    setSaving(true)
    setMessage(null)
    try {
      const res = await apiFetch(`/templates/${tpl.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: draft.name.trim(),
          data: JSON.stringify({ columns: draft.columns, rows: draft.rows }),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setMessage({ error: true, text: body.error || '저장하지 못했습니다.' }); return }
      await load()
      setMessage({
        error: false,
        text: users.length > 0
          ? `"${draft.name.trim()}" 을(를) 저장했습니다. 참조하는 변수 ${users.length}개에 반영됩니다.`
          : `"${draft.name.trim()}" 을(를) 저장했습니다.`,
      })
    } catch {
      setMessage({ error: true, text: '서버 통신 실패' })
    } finally {
      setSaving(false)
    }
  }

  const remove = async (e, tpl) => {
    e.stopPropagation()
    setMessage(null)
    if (!window.confirm(`표 "${tpl.name}" 을(를) 삭제할까요?`)) return
    try {
      const res = await apiFetch(`/templates/${tpl.id}`, { method: 'DELETE' })
      if (!res.ok) {
        // 참조 중이면 서버가 막는다 — 어디서 쓰는지까지 알려 준다.
        const body = await res.json().catch(() => ({}))
        setMessage({ error: true, text: body.error || '삭제하지 못했습니다.' })
        return
      }
      if (openId === tpl.id) { setOpenId(null); setDraft(null) }
      await load()
    } catch {
      setMessage({ error: true, text: '서버 통신 실패' })
    }
  }

  const shapeOf = (tpl) => {
    const t = parseTable(tpl.data)
    return `${t.columns.length}열 × ${t.rows.length}행 · ${t.columns.join(', ')}`
  }

  const term = search.trim().toLowerCase()
  const filtered = term
    ? tables.filter(t => (t.name || '').toLowerCase().includes(term)
        || (t.data || '').toLowerCase().includes(term))
    : tables

  return (
    <TabPane>
      <TabToolbar>
        <Toolbar>
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="표 이름이나 내용으로 검색..."
          />
          <AddBtn onClick={create}>+ 새 표</AddBtn>
        </Toolbar>
      </TabToolbar>

      <TabScroll>
        {message && <Message $error={message.error}>{message.text}</Message>}

        {filtered.length === 0 ? (
          <Empty>
            {tables.length === 0 ? (
              <>
                아직 정의된 표가 없습니다.
                <br />
                여기서 만든 표는 변수 정의의 <strong>🔗 표 참조</strong> 로 연결할 수 있고,
                <br />
                원본을 한 번 고치면 참조하는 변수가 모두 함께 바뀝니다.
              </>
            ) : '검색 결과가 없습니다.'}
          </Empty>
        ) : (
          <TableGridWrap>
          {filtered.map(tpl => {
            const users = usage[tpl.id] || []
            const isOpen = openId === tpl.id
            return (
              <Card key={tpl.id} $open={isOpen}>
                <CardHead onClick={() => open(tpl)}>
                  <Name>{tpl.name}</Name>
                  <Shape>{shapeOf(tpl)}</Shape>
                  <UsageBadge
                    $count={users.length}
                    title={users.length === 0 ? '아직 아무 변수도 쓰지 않습니다' : `${users.length}개 변수가 참조`}
                  >
                    {users.length}
                  </UsageBadge>
                  <IconBtn>{isOpen ? '닫기' : '편집'}</IconBtn>
                  <IconBtn onClick={(e) => duplicate(e, tpl)} title="이 표를 복사해 새로 만듭니다">복사</IconBtn>
                  <IconBtn $danger onClick={(e) => remove(e, tpl)}>삭제</IconBtn>
                </CardHead>

                {isOpen && draft && (
                  <Body>
                    <NameRow>
                      <NameInput
                        value={draft.name}
                        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                        placeholder="표 이름"
                      />
                      <SaveBtn onClick={() => save(tpl)} disabled={saving}>
                        {saving ? '저장 중...' : '저장'}
                      </SaveBtn>
                    </NameRow>

                    {users.length > 0 && (
                      <UsageList>
                        이 표를 참조하는 변수 {users.length}개 — 저장하면 모두에 반영됩니다.
                        <br />
                        {users.map(u => `${u.card_name} / ${u.variable_name}`).join(' · ')}
                      </UsageList>
                    )}

                    <TableGrid
                      value={draft}
                      onChange={(next) => setDraft({ ...draft, ...next })}
                    />
                  </Body>
                )}
              </Card>
            )
          })}
          </TableGridWrap>
        )}
      </TabScroll>
    </TabPane>
  )
}

export default TableDefinitionTab
