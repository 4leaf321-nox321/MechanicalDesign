import React, { useState } from 'react'
import styled from 'styled-components'

const API_URL = import.meta.env.VITE_API_URL || '/api'

const ContainerCard = styled.div`
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 14px 16px;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
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
  margin-top: 16px;
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
      const res = await fetch(`${API_URL}/cards/${cardId}/containers`, {
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

  const handleUpdate = async (id) => {
    if (!editName.trim()) return
    try {
      await fetch(`${API_URL}/cards/${cardId}/containers/${id}`, {
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
      await fetch(`${API_URL}/cards/${cardId}/containers/${id}`, { method: 'DELETE' })
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
    <>
      {containers.length === 0 ? (
        <EmptyState>정의된 컨테이너가 없습니다.</EmptyState>
      ) : (
        containers.map((c) => (
          <ContainerCard key={c.id}>
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
                  <IconBtn $danger onClick={() => handleDelete(c.id)}>삭제</IconBtn>
                </Actions>
              </>
            )}
          </ContainerCard>
        ))
      )}

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
    </>
  )
}

export default ContainerTab
