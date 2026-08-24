import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import styled from 'styled-components'
import { apiFetch } from '../shared/api/client'
import { useAuth } from '../shared/auth/AuthContext'
import OrgTree from '../shared/components/OrgTree'
import PublishToOrgDialog from '../shared/components/PublishToOrgDialog'


// ============================================
// Styled Components
// ============================================
const PageWrapper = styled.div`
  min-height: 100vh;
  background: #f0f2f5;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
`

const HeaderRow = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;
`

const UserArea = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.88rem;
  color: #d0d0da;
`

const UserName = styled.span`
  font-weight: 600;
  color: white;
`

const HeaderBtn = styled.button`
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  padding: 7px 14px;
  border-radius: 6px;
  font-size: 0.82rem;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    background: rgba(255, 255, 255, 0.12);
  }
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

/** 왼쪽 트리 + 오른쪽 카드. 트리는 화면의 뼈대라 스크롤과 무관하게 자리를 지킨다. */
const Body = styled.div`
  display: flex;
  align-items: stretch;
  min-height: calc(100vh - 150px);

  @media (max-width: 900px) {
    flex-direction: column;
  }
`

const Main = styled.div`
  flex: 1;
  min-width: 0;
`

/** 지금 어느 자리를 보고 있는지. 없으면 목록이 비었을 때 "카드가 없는 것" 인지
    "빈 조직을 보고 있는 것" 인지 구분할 수 없다. */
const Crumb = styled.div`
  padding: 22px 48px 0;
  font-size: 0.9rem;
  color: #6b7280;

  b {
    color: #1a1a2e;
    font-size: 1.05rem;
  }
`

const EmptyNote = styled.div`
  padding: 48px;
  color: #98a2b3;
  font-size: 0.9rem;
  line-height: 1.7;
`

const OrgChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 10px;
`

const OrgChip = styled.span`
  font-size: 0.68rem;
  padding: 2px 7px;
  border-radius: 999px;
  background: #eef2ff;
  color: #4f5d8f;
`

const MountBtn = styled.button`
  margin-top: 14px;
  padding: 7px 14px;
  border: 1px solid #d5dae2;
  border-radius: 6px;
  background: white;
  color: #4b5563;
  font-size: 0.8rem;
  cursor: pointer;

  &:hover {
    border-color: #3498db;
    color: #3498db;
  }
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

  /* 초안은 한눈에 구분되어야 한다. 별도 컴포넌트를 as 로 끼우지 않고 여기서
     직접 정하는 이유는, 그러면 두 클래스가 같은 속성을 두고 다투고 승자는
     스타일시트에 먼저 들어간 쪽이 정하기 때문이다. */
  ${props => props.$draft && `
    background: #fffdf6;
    border: 1px dashed #e0c97a;
    border-left: 4px solid ${props.$color || '#3498db'};
  `}

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

/**
 * 초안 표시.
 *
 * **눈에 띄어야 한다.** 초안은 밖에서 AI 가 만들었고 아직 아무도 확인하지
 * 않은 카드다. 게시된 카드와 똑같이 보이면 만든 사람도 그 차이를 잊고,
 * 확인 없이 쓰다가 남에게는 왜 안 보이는지 묻게 된다.
 */
/**
 * 태그 줄. 카드 하나에 표시가 둘 이상 붙을 수 있다
 * (초안이면서 AI 가 만든 것).
 */
const TagRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 8px;
`

const Tag = styled.span`
  display: inline-block;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 0.72rem;
  font-weight: 700;
`

const AiTag = styled(Tag)`
  background: #eef2ff;
  color: #4053b8;
  border: 1px solid #c9d2f5;
`

/**
 * **게시 후에 AI 가 또 고친 카드.**
 *
 * 다른 표시와 색을 달리한다. 게시 기록은 그대로 남아 있어서, 이 말을 하지
 * 않으면 검토를 거친 카드처럼 보인다 — 정작 그 사람이 본 것은 지금 화면에
 * 있는 카드가 아니다.
 */
const StaleReviewTag = styled(Tag)`
  background: #fdecea;
  color: #a4343a;
  border: 1px solid #f5c6cb;
`

const DraftTag = styled(Tag)`
  background: #fff4d6;
  color: #8a6d1a;
  border: 1px solid #f0d98c;
`

const PublishBtn = styled.button`
  margin-top: 12px;
  width: 100%;
  padding: 8px;
  background: #8a6d1a;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: #a08228;
  }

  &:disabled {
    background: #bbb;
    cursor: not-allowed;
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
  const { user, logout } = useAuth()
  const [cards, setCards] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // 조직 트리. `selected` 가 빈 문자열이면 전체 보기다.
  const [tree, setTree] = useState([])
  const [personal, setPersonal] = useState(null)
  const [selected, setSelected] = useState('')
  const [mountTarget, setMountTarget] = useState(null)

  useEffect(() => {
    fetchTree()
  }, [])

  // 고른 자리가 바뀌면 목록을 다시 받는다. **화면에서 거르지 않는다** — 거르면
  // 남의 개인 공간 카드가 응답에는 이미 실려 온 뒤라 개발자도구에 그대로 보인다.
  useEffect(() => {
    fetchCards(selected)
  }, [selected])

  const fetchTree = async () => {
    try {
      const res = await apiFetch('/orgs/tree')
      const data = await res.json()
      setTree(data.tree || [])
      setPersonal(data.personal || null)
    } catch (err) {
      console.error('Failed to fetch org tree:', err)
    }
  }

  const fetchCards = async (org) => {
    try {
      const res = await apiFetch(org ? `/cards?org=${encodeURIComponent(org)}` : '/cards')
      const data = await res.json()
      setCards(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to fetch cards:', err)
    }
  }

  /** 카드 수가 바뀌면 트리의 숫자도 함께 틀어진다. 둘을 같이 새로 받는다. */
  const refresh = () => {
    fetchCards(selected)
    fetchTree()
  }

  // --- 조직 관리 (관리자) -------------------------------------------------------

  const handleAddOrg = async (parentSlug) => {
    const name = window.prompt(
      parentSlug ? '하위 조직 이름' : '조직 이름 (최상위)',
    )
    if (!name || !name.trim()) return
    const res = await apiFetch('/orgs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), parent_slug: parentSlug }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      window.alert(body.error || '조직을 만들지 못했습니다.')
      return
    }
    fetchTree()
  }

  const handleRenameOrg = async (org) => {
    const name = window.prompt('조직 이름', org.name)
    if (!name || !name.trim() || name.trim() === org.name) return
    // 이름만 바꾼다. 주소(slug)는 그대로 둔다 — 바꾸면 저장해 둔 링크가 죽는다.
    const res = await apiFetch(`/orgs/${encodeURIComponent(org.slug)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      window.alert(body.error || '이름을 바꾸지 못했습니다.')
      return
    }
    fetchTree()
  }

  const handleDeleteOrg = async (org) => {
    if (!window.confirm(`'${org.name}' 조직을 삭제합니다.

하위 조직이나 게시된 카드가 있으면 삭제되지 않습니다.`)) return
    const res = await apiFetch(`/orgs/${encodeURIComponent(org.slug)}`, { method: 'DELETE' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      // 무엇을 잃게 되는지 서버가 숫자로 말해 준다. 그대로 보여 준다.
      window.alert(body.error || '삭제하지 못했습니다.')
      return
    }
    if (selected === org.slug) setSelected('')
    fetchTree()
  }

  /**
   * 초안을 게시한다.
   *
   * **여기서 확인 창을 띄우는 것이 이 기능의 전부다.** 밖에서 AI 가 만든
   * 카드가 검토 없이 모두에게 퍼지는 것을 막는 자리가 사람의 클릭 한 번이다.
   * 그러니 무엇을 하는 것인지 분명히 묻는다.
   */
  const handlePublish = async (e, card) => {
    e.stopPropagation()
    const ok = window.confirm(
      `'${card.name}' 를 게시합니다.\n\n` +
        '이 카드가 모든 사용자에게 보이고, 사람들이 이 계산으로 설계 판단을 하게 됩니다.\n' +
        '열어서 숫자를 확인해 보셨나요? 계산이 돈다는 것과 값이 맞다는 것은 다릅니다.',
    )
    if (!ok) return

    try {
      const res = await apiFetch(`/cards/${card.id}/publish`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) {
        // 검증에 걸렸으면 무엇이 틀렸는지 함께 보여 준다. "게시 실패" 만으로는
        // 고칠 수가 없다.
        const issues = (body.validation?.issues || []).filter(i => i.level === 'error')
        const detail = issues.length
          ? '\n\n' + issues.map(i => `· ${i.symbol || i.variable_name || ''} ${i.message}`).join('\n')
          : ''
        window.alert((body.error || '게시하지 못했습니다.') + detail)
        return
      }
      await fetchCards()
    } catch (err) {
      window.alert('게시하지 못했습니다: ' + err.message)
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
      const res = await apiFetch(`/cards`, {
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
      const res = await apiFetch(`/cards/${cardId}`, { method: 'DELETE' })
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

  const isPersonalView = !!personal && selected === personal.slug

  /** 지금 보고 있는 자리의 이름. 트리를 평탄화해 찾는다. */
  const selectedLabel = (() => {
    if (!selected) return '전체'
    if (isPersonalView) return '내 카드'
    const walk = (nodes) => {
      for (const n of nodes) {
        if (n.slug === selected) return n.name
        const hit = walk(n.children || [])
        if (hit) return hit
      }
      return null
    }
    return walk(tree) || selected
  })()

  /**
   * 조직에 올리고 내릴 수 있는 사람인가.
   *
   * 서버가 같은 판정을 다시 한다. 여기 것은 **버튼을 감추는 용도**일 뿐이다 —
   * 화면에서만 막으면 요청을 직접 보내는 길이 그대로 열려 있다.
   */
  const canPlace = (card) => !!user && (user.is_admin || card.created_by_id === user.id)

  return (
    <PageWrapper>
      <Header>
        <HeaderRow>
          <div>
            <HeaderTitle>Mechanical Design</HeaderTitle>
            <HeaderSubtitle>기계설계 엔지니어링 도구 모음</HeaderSubtitle>
          </div>
          {user && (
            <UserArea>
              <UserName>{user.display_name}</UserName>
              {user.is_admin && (
                <HeaderBtn onClick={() => navigate('/accounts')}>계정 관리</HeaderBtn>
              )}
              <HeaderBtn onClick={() => navigate('/records')}>계산 기록</HeaderBtn>
              <HeaderBtn onClick={() => navigate('/tokens')}>토큰</HeaderBtn>
              <HeaderBtn onClick={() => navigate('/change-password')}>비밀번호</HeaderBtn>
              <HeaderBtn onClick={logout}>로그아웃</HeaderBtn>
            </UserArea>
          )}
        </HeaderRow>
      </Header>

      <Body>
        <OrgTree
          tree={tree}
          personal={personal}
          selected={selected}
          onSelect={setSelected}
          isAdmin={!!user?.is_admin}
          onAdd={handleAddOrg}
          onRename={handleRenameOrg}
          onDelete={handleDeleteOrg}
        />

        <Main>
          <Crumb>
            <b>{selectedLabel}</b>
            {isPersonalView && ' — 아직 어디에도 올리지 않은 카드가 여기 있습니다'}
          </Crumb>

          <CardGrid>
        {cards.map((card) => {
          const isDraft = card.status === 'draft'
          const byAi = card.origin === 'mcp'
          // 서버가 두 시각을 비교해 알려 준다. 화면이 직접 비교하면 방향을
          // 한 번만 틀려도 "괜찮다" 로 표시되고, 그 오류는 아무도 못 찾는다.
          const staleReview = card.ai_edited_after_publish
          return (
            <Card
              key={card.id}
              $color={card.color}
              $draft={isDraft}
              onClick={() => navigate(card.route)}
            >
              <DeleteBtn className="delete-btn" onClick={(e) => handleDeleteCard(e, card.id)}>
                ✕
              </DeleteBtn>
              {(isDraft || byAi || staleReview) && (
                <TagRow>
                  {isDraft && <DraftTag>초안 · 나만 보임</DraftTag>}
                  {byAi && <AiTag>AI 작성</AiTag>}
                  {staleReview && (
                    <StaleReviewTag title="게시 후 AI 가 이 카드를 수정했습니다. 게시할 때 확인한 내용과 지금 내용이 다를 수 있습니다.">
                      게시 후 AI 수정됨
                    </StaleReviewTag>
                  )}
                </TagRow>
              )}
              <CardName>{card.name}</CardName>
              <CardDesc>{card.description}</CardDesc>
              {/* 어디에 걸려 있는지 카드 위에서 바로 보인다. 대화상자를 열어야만
                  알 수 있으면, 내려야 할 카드가 걸린 채로 남는다. */}
              {card.mounted_orgs?.length > 0 && (
                <OrgChips>
                  {card.mounted_orgs.map((o) => (
                    <OrgChip key={o.slug}>{o.name}</OrgChip>
                  ))}
                </OrgChips>
              )}
              {isDraft ? (
                <PublishBtn onClick={(e) => handlePublish(e, card)}>게시하기</PublishBtn>
              ) : (
                canPlace(card) && (
                  <MountBtn
                    onClick={(e) => {
                      e.stopPropagation()
                      setMountTarget(card)
                    }}
                  >
                    {card.mounted_orgs?.length ? '조직 게시 관리' : '조직에 게시'}
                  </MountBtn>
                )
              )}
            </Card>
          )
        })}

        <AddCard onClick={openModal}>
          <AddIcon>+</AddIcon>
          <AddText>카드 추가</AddText>
        </AddCard>
          </CardGrid>

          {cards.length === 0 && (
            <EmptyNote>
              {isPersonalView
                ? '내 카드가 없습니다. 오른쪽 위 “카드 추가”로 만들면 여기에 놓입니다.'
                : selected
                  ? '이 조직에 게시된 카드가 없습니다. 카드를 만든 사람이 “조직에 게시”로 올릴 수 있습니다.'
                  : '카드가 없습니다.'}
            </EmptyNote>
          )}
        </Main>
      </Body>

      {mountTarget && (
        <PublishToOrgDialog
          card={mountTarget}
          onClose={() => {
            setMountTarget(null)
            refresh()
          }}
          onChanged={(updated) => setMountTarget(updated)}
        />
      )}

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
