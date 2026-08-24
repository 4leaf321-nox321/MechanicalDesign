import React, { useState } from 'react'
import styled from 'styled-components'
import { apiFetch } from '../../api/client'
import { TabPane, TabScroll, TabToolbar } from './TabLayout'


/**
 * 목록을 여러 열로 편다.
 *
 * 한 열이면 카드가 모달 너비만큼 늘어나 이름과 배지 오른쪽이 통째로 빈다.
 * 정작 세로로는 길어져서, 컨테이너가 예닐곱 개만 돼도 아래쪽은 스크롤해야
 * 보인다. 자동 채움으로 두면 좁을 때는 한 열, 넓을 때는 두세 열이 된다.
 */
const ContainerGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 10px;
  align-items: start;
`

const ContainerCard = styled.div`
  background: #f8f9fa;
  border: 1px solid ${p => (p.$editing ? '#3498db' : '#e9ecef')};
  border-radius: 8px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;

  /* 편집 중인 카드는 **줄 전체**를 쓴다. 이름 칸과 셀렉트 둘, 버튼 둘이
     한 칸 너비에 들어가면 서로 밀려 이름 칸이 글자 몇 개만 남는다. */
  ${p => p.$editing && 'grid-column: 1 / -1;'}
`

const ContainerName = styled.span`
  font-weight: 600;
  color: #333;
  font-size: 0.95rem;
`

const Actions = styled.div`
  display: flex;
  gap: 4px;
`

const IconBtn = styled.button`
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 0.85rem;
  &:hover { background: #e9ecef; color: ${props => props.$danger ? '#e74c3c' : '#333'}; }
`

const TypeBadge = styled.span`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
  margin-left: 8px;
  background: ${props => {
    if (props.$type === 'input') return '#e3f2fd'
    if (props.$type === 'output') return '#fce4ec'
    if (props.$type === 'hidden') return '#eceff1'
    return '#f5f5f5'
  }};
  color: ${props => {
    if (props.$type === 'input') return '#1976d2'
    if (props.$type === 'output') return '#c62828'
    if (props.$type === 'hidden') return '#546e7a'
    return '#888'
  }};
`

const AddRow = styled.div`
  display: flex;
  gap: 10px;
`

const Input = styled.input`
  flex: 1;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.9rem;
  outline: none;
  box-sizing: border-box;
  &:focus { border-color: #3498db; }
`

const Select = styled.select`
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.9rem;
  outline: none;
  background: white;
  cursor: pointer;
  &:focus { border-color: #3498db; }
`

const AddBtn = styled.button`
  padding: 10px 20px;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  &:hover { background: #2980b9; }
  &:disabled { background: #b0d4f1; cursor: not-allowed; }
`

const EditRow = styled.div`
  display: flex;
  gap: 8px;
  flex: 1;
`

const EmptyState = styled.div`
  text-align: center;
  padding: 48px 24px;
  color: #bbb;
  font-size: 0.95rem;
`

const ErrorMsg = styled.p`
  color: #e74c3c;
  font-size: 0.85rem;
  margin: 8px 0 0 0;
`

function ContainerTab({ cardId, containers, onRefresh }) {
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('default')
  const [newColumnCount, setNewColumnCount] = useState(1)
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editType, setEditType] = useState('default')
  const [editColumnCount, setEditColumnCount] = useState(1)
  const [error, setError] = useState('')

  const handleAdd = async () => {
    if (!newName.trim()) return
    setError('')
    try {
      const res = await apiFetch(`/cards/${cardId}/containers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          container_type: newType,
          column_count: newColumnCount,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || '생성 실패')
        return
      }
      setNewName('')
      setNewType('default')
      setNewColumnCount(1)
      onRefresh()
    } catch {
      setError('서버 통신 실패')
    }
  }

  /**
   * 컨테이너를 복사한다. 이름만 바꿔 **바로 만든다.**
   *
   * 변수와 달리 폼을 열어 두지 않는다. 컨테이너에는 겹치면 곤란한 기호가
   * 없고 이름은 겹쳐도 되므로, 확인받을 것이 없다. 만들고 나면 그 자리에서
   * 편집 상태로 열어 주니 이름을 고칠 기회도 바로 온다.
   *
   * **위젯 배치는 따라오지 않는다.** 컨테이너에 놓인 변수는 배치(placement)
   * 이지 컨테이너의 속성이 아니다 — 같이 복사하면 같은 변수가 두 자리에
   * 나타나는데, 그것은 대개 복사한 사람이 원한 결과가 아니다.
   */
  const handleDuplicate = async (c) => {
    setError('')
    const taken = new Set(containers.map(x => x.name))
    let name = c.name + ' 사본'
    let n = 2
    while (taken.has(name)) { name = c.name + ' 사본 ' + n; n += 1 }

    try {
      const res = await apiFetch(`/cards/${cardId}/containers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          container_type: c.container_type,
          column_count: c.column_count || 1,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || '복사 실패')
        return
      }
      const created = await res.json().catch(() => null)
      onRefresh()
      // 만든 것을 바로 편집 상태로 연다. 복사는 대개 이름을 고치려고 한다.
      if (created?.id) {
        setEditingId(created.id)
        setEditName(created.name)
        setEditType(created.container_type || 'default')
        setEditColumnCount(created.column_count || 1)
      }
    } catch {
      setError('서버 통신 실패')
    }
  }

  const handleUpdate = async (id) => {
    if (!editName.trim()) return
    try {
      await apiFetch(`/cards/${cardId}/containers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          container_type: editType,
          column_count: editColumnCount,
        }),
      })
      setEditingId(null)
      onRefresh()
    } catch {
      setError('수정 실패')
    }
  }

  const handleDelete = async (id) => {
    try {
      await apiFetch(`/cards/${cardId}/containers/${id}`, { method: 'DELETE' })
      onRefresh()
    } catch {
      setError('삭제 실패')
    }
  }

  const startEdit = (c) => {
    setEditingId(c.id)
    setEditName(c.name)
    setEditType(c.container_type || 'default')
    setEditColumnCount(c.column_count || 1)
  }

  const getTypeLabel = (type) => {
    if (type === 'input') return '입력'
    if (type === 'output') return '출력'
    if (type === 'hidden') return '숨김'
    return '일반'
  }

  const handleKeyDown = (e, action) => {
    if (e.key === 'Enter') action()
    if (e.key === 'Escape') setEditingId(null)
  }

  return (
    <TabPane>
      <TabToolbar>
        <AddRow>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, handleAdd)}
            placeholder="새 컨테이너 이름"
          />
          <Select value={newType} onChange={(e) => setNewType(e.target.value)}>
            <option value="default">일반</option>
            <option value="input">입력</option>
            <option value="output">출력</option>
            <option value="hidden">숨김</option>
          </Select>
          <Select value={newColumnCount} onChange={(e) => setNewColumnCount(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6].map(n => (
              <option key={n} value={n}>{n}열</option>
            ))}
          </Select>
          <AddBtn onClick={handleAdd} disabled={!newName.trim()}>추가</AddBtn>
        </AddRow>
        {error && <ErrorMsg>{error}</ErrorMsg>}
      </TabToolbar>
      <TabScroll>
      {containers.length === 0 ? (
        <EmptyState>정의된 컨테이너가 없습니다.</EmptyState>
      ) : (
        <ContainerGrid>
        {containers.map((c) => (
          <ContainerCard key={c.id} $editing={editingId === c.id}>
            {editingId === c.id ? (
              <EditRow>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, () => handleUpdate(c.id))}
                  autoFocus
                />
                <Select value={editType} onChange={(e) => setEditType(e.target.value)}>
                  <option value="default">일반</option>
                  <option value="input">입력</option>
                  <option value="output">출력</option>
                  <option value="hidden">숨김</option>
                </Select>
                <Select value={editColumnCount} onChange={(e) => setEditColumnCount(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5, 6].map(n => (
                    <option key={n} value={n}>{n}열</option>
                  ))}
                </Select>
                <IconBtn onClick={() => handleUpdate(c.id)}>저장</IconBtn>
                <IconBtn onClick={() => setEditingId(null)}>취소</IconBtn>
              </EditRow>
            ) : (
              <>
                <ContainerName>
                  {c.name}
                  <TypeBadge $type={c.container_type}>{getTypeLabel(c.container_type)}</TypeBadge>
                  <TypeBadge>{(c.column_count || 1)}열</TypeBadge>
                </ContainerName>
                <Actions>
                  <IconBtn onClick={() => startEdit(c)}>편집</IconBtn>
                  <IconBtn onClick={() => handleDuplicate(c)} title="이 컨테이너를 복사해 새로 만듭니다">복사</IconBtn>
                  <IconBtn $danger onClick={() => handleDelete(c.id)}>삭제</IconBtn>
                </Actions>
              </>
            )}
          </ContainerCard>
        ))}
        </ContainerGrid>
      )}
      </TabScroll>
    </TabPane>
  )
}

export default ContainerTab
