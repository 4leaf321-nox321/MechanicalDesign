import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import styled from 'styled-components'

const API_URL = import.meta.env.VITE_API_URL || '/api'

// ============================================
// Styled Components
// ============================================
const PageWrapper = styled.div`
  min-height: 100vh;
  background: #f0f2f5;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
`

const Header = styled.header`
  background: #1a1a2e;
  color: white;
  padding: 32px 48px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
`

const HeaderTitle = styled.h1`
  font-size: 1.8rem;
  font-weight: 700;
  margin: 0 0 8px 0;
`

const HeaderSubtitle = styled.p`
  font-size: 0.95rem;
  color: #a0a0b0;
  margin: 0;
`

const CardGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 24px;
  padding: 40px 48px;
  max-width: 1400px;
`

const Card = styled.div`
  background: white;
  border-radius: 12px;
  padding: 32px 28px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  border-left: 4px solid ${props => props.$color || '#3498db'};
  position: relative;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  }

  &:hover .delete-btn {
    opacity: 1;
  }
`

const CardName = styled.h3`
  font-size: 1.2rem;
  font-weight: 600;
  color: #333;
  margin: 0 0 8px 0;
`

const CardDesc = styled.p`
  font-size: 0.9rem;
  color: #888;
  margin: 0;
  line-height: 1.4;
  flex: 1;
`

const DeleteBtn = styled.button`
  position: absolute;
  top: 12px;
  right: 12px;
  background: none;
  border: none;
  color: #ccc;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  line-height: 1;
  opacity: 0;
  transition: all 0.2s;

  &:hover {
    background: #fee;
    color: #e74c3c;
  }
`

// 카드 추가 버튼
const AddCard = styled.div`
  background: white;
  border-radius: 12px;
  padding: 32px 28px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  border: 2px dashed #ccc;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  min-height: 120px;

  &:hover {
    border-color: #3498db;
    background: #f8fbff;
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  }
`

const AddIcon = styled.div`
  font-size: 2rem;
  color: #ccc;
  margin-bottom: 8px;

  ${AddCard}:hover & {
    color: #3498db;
  }
`

const AddText = styled.p`
  font-size: 0.95rem;
  color: #aaa;
  margin: 0;

  ${AddCard}:hover & {
    color: #3498db;
  }
`

// 모달
const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
`

const Modal = styled.div`
  background: white;
  border-radius: 12px;
  padding: 32px;
  width: 420px;
  max-width: 90vw;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
`

const ModalTitle = styled.h2`
  font-size: 1.3rem;
  font-weight: 600;
  color: #333;
  margin: 0 0 24px 0;
`

const FormGroup = styled.div`
  margin-bottom: 20px;
`

const Label = styled.label`
  display: block;
  font-size: 0.9rem;
  font-weight: 500;
  color: #555;
  margin-bottom: 6px;
`

const Input = styled.input`
  width: 100%;
  padding: 10px 14px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 0.95rem;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s;

  &:focus {
    border-color: #3498db;
  }
`

const TextArea = styled.textarea`
  width: 100%;
  padding: 10px 14px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 0.95rem;
  outline: none;
  box-sizing: border-box;
  resize: vertical;
  min-height: 80px;
  transition: border-color 0.2s;

  &:focus {
    border-color: #3498db;
  }
`

const ButtonRow = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 28px;
`

const Button = styled.button`
  padding: 10px 24px;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
`

const CancelButton = styled(Button)`
  background: #f0f0f0;
  color: #666;

  &:hover {
    background: #e0e0e0;
  }
`

const SubmitButton = styled(Button)`
  background: #3498db;
  color: white;

  &:hover {
    background: #2980b9;
  }

  &:disabled {
    background: #b0d4f1;
    cursor: not-allowed;
  }
`

const ErrorMsg = styled.p`
  color: #e74c3c;
  font-size: 0.85rem;
  margin: -12px 0 16px 0;
`

// ============================================
// Component
// ============================================
function MainPage() {
  const navigate = useNavigate()
  const [cards, setCards] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchCards()
  }, [])

  const fetchCards = async () => {
    try {
      const res = await fetch(`${API_URL}/cards`)
      const data = await res.json()
      setCards(data)
    } catch (err) {
      console.error('Failed to fetch cards:', err)
    }
  }

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('카드 이름을 입력해주세요.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch(`${API_URL}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || '카드 생성에 실패했습니다.')
        return
      }

      setCards(prev => [...prev, data])
      setShowModal(false)
      setName('')
      setDescription('')
    } catch (err) {
      setError('서버와 통신할 수 없습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === 'Escape') {
      setShowModal(false)
    }
  }

  const handleDeleteCard = async (e, cardId) => {
    e.stopPropagation()
    if (!window.confirm('이 카드를 삭제하시겠습니까?')) return
    try {
      const res = await fetch(`${API_URL}/cards/${cardId}`, { method: 'DELETE' })
      if (res.ok) {
        setCards(prev => prev.filter(c => c.id !== cardId))
      }
    } catch (err) {
      console.error('Failed to delete card:', err)
    }
  }

  const openModal = () => {
    setName('')
    setDescription('')
    setError('')
    setShowModal(true)
  }

  return (
    <PageWrapper>
      <Header>
        <HeaderTitle>Mechanical Design</HeaderTitle>
        <HeaderSubtitle>기계설계 엔지니어링 도구 모음</HeaderSubtitle>
      </Header>

      <CardGrid>
        {cards.map((card) => (
          <Card
            key={card.id}
            $color={card.color}
            onClick={() => navigate(card.route)}
          >
            <DeleteBtn className="delete-btn" onClick={(e) => handleDeleteCard(e, card.id)}>
              ✕
            </DeleteBtn>
            <CardName>{card.name}</CardName>
            <CardDesc>{card.description}</CardDesc>
          </Card>
        ))}

        <AddCard onClick={openModal}>
          <AddIcon>+</AddIcon>
          <AddText>카드 추가</AddText>
        </AddCard>
      </CardGrid>

      {showModal && (
        <Overlay onClick={() => setShowModal(false)}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>새 카드 추가</ModalTitle>
            <FormGroup>
              <Label>카드 이름</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="예: 베어링 계산기"
                autoFocus
              />
            </FormGroup>
            <FormGroup>
              <Label>설명</Label>
              <TextArea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="이 모듈에 대한 간단한 설명"
              />
            </FormGroup>
            {error && <ErrorMsg>{error}</ErrorMsg>}
            <ButtonRow>
              <CancelButton onClick={() => setShowModal(false)}>취소</CancelButton>
              <SubmitButton onClick={handleSubmit} disabled={loading}>
                {loading ? '추가 중...' : '추가'}
              </SubmitButton>
            </ButtonRow>
          </Modal>
        </Overlay>
      )}
    </PageWrapper>
  )
}

export default MainPage
