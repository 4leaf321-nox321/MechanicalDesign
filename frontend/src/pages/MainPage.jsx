import React, { useState, useEffect } from 'react'
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import styled from 'styled-components'

import AppHeader, { BarButton, BarText } from '../shared/components/AppHeader'
import { apiFetch } from '../shared/api/client'
import { useAuth } from '../shared/auth/AuthContext'
import PublishToOrgDialog from '../shared/components/PublishToOrgDialog'
import WorkflowSection from '../shared/components/WorkflowSection'

/** 휴지통은 조직이 아니지만 트리에서 한 자리를 차지한다. slug 와 겹치지 않는 값. */
// 껍데기가 트리와 함께 들고 있다. 홈은 「지금 무엇을 보는가」만 안다.
import { TRASH } from '../shared/components/AppShell'
// 워크플로 만들기도 같은 창을 쓴다 — 이름 하나 받는 일은 같다.
import { OrgFormModal } from '../shared/components/OrgModals'
import { useDialog } from '../shared/components/Dialog'


// ============================================
// Styled Components
// ============================================
const PageWrapper = styled.div`
  /* 껍데기가 이미 화면 높이를 잡았다. 여기서 또 100vh 를 쓰면
     사이드바 높이만큼 아래로 넘친다. */
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: hsl(var(--bg));
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
`

/**
 * 왼쪽 트리 + 오른쪽 카드.
 *
 * 트리는 화면의 뼈대라 자리를 지킨다 — **트리와 카드가 따로 구른다.**
 * 함께 구르면 카드를 보려고 내렸을 때 조직 트리가 위로 사라져, 다른
 * 조직으로 옮기려면 도로 올라가야 한다.
 */
const Body = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: stretch;

  @media (max-width: 900px) {
    flex-direction: column;
    overflow-y: auto;
  }
`

const Main = styled.div`
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;

  /* 좁은 화면에서는 트리가 위로 접히므로 바깥이 통째로 구른다. */
  @media (max-width: 900px) {
    overflow-y: visible;
  }
`

/** 지금 어느 자리를 보고 있는지. 없으면 목록이 비었을 때 "카드가 없는 것" 인지
    "빈 조직을 보고 있는 것" 인지 구분할 수 없다. */
const Crumb = styled.div`
  padding: 22px 48px 0;
  font-size: 0.9rem;
  color: hsl(var(--fg-muted));

  b {
    color: hsl(var(--fg));
    font-size: 1.05rem;
  }
`

const OrgErrorBar = styled.div`
  margin: 14px 48px 0;
  padding: 10px 14px;
  background: hsl(var(--danger-soft));
  border: 1px solid hsl(var(--danger-border));
  border-radius: var(--radius);
  color: hsl(var(--danger));
  font-size: 0.84rem;
  display: flex;
  align-items: center;
  gap: 10px;
`

const CloseX = styled.button`
  margin-left: auto;
  border: none;
  background: none;
  color: hsl(var(--danger));
  cursor: pointer;
  font-size: 0.8rem;
`

const EmptyNote = styled.div`
  padding: 48px;
  color: hsl(var(--fg-subtle));
  font-size: 0.9rem;
  line-height: 1.7;
`

const SearchRow = styled.div`
  display: flex;
  gap: 8px;
  padding: 22px 48px 0;
  max-width: 1400px;
`

const SearchInput = styled.input`
  flex: 1;
  padding: 10px 14px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  font-size: 0.9rem;
  background: hsl(var(--surface));

  &:focus {
    outline: none;
    border-color: hsl(var(--primary));
  }
`

const ClearBtn = styled.button`
  padding: 8px 14px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  background: hsl(var(--surface));
  color: hsl(var(--fg-muted));
  font-size: 0.83rem;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    border-color: hsl(var(--primary));
    color: hsl(var(--primary));
  }
`

const MatchRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 10px;
`

const MatchChip = styled.span`
  font-size: 0.68rem;
  padding: 2px 7px;
  border-radius: 999px;
  background: hsl(var(--warn-soft));
  color: hsl(var(--warn));
  border: 1px solid hsl(var(--warn-border));
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
  background: hsl(var(--accent-soft));
  color: hsl(var(--fg-muted));
`

/** 카드 오른쪽 위. 삭제(✕)와 같은 줄에 두면 잘못 누르기 쉬워 왼쪽에 둔다. */
const CopyBtn = styled.button`
  position: absolute;
  top: 12px;
  right: 40px;
  border: none;
  background: none;
  color: hsl(var(--fg-subtle));
  font-size: 0.72rem;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: var(--radius-sm);

  &:hover {
    background: hsl(var(--accent-soft));
    color: hsl(var(--primary));
  }
`

const NoticeBar = styled.div`
  margin: 14px 48px 0;
  padding: 10px 14px;
  background: hsl(var(--info-soft));
  border: 1px solid hsl(var(--info-border));
  border-radius: var(--radius);
  color: hsl(var(--info));
  font-size: 0.84rem;
  display: flex;
  align-items: center;
  gap: 10px;
`

const TrashActions = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 14px;
`

const RestoreBtn = styled.button`
  padding: 7px 14px;
  border: 1px solid hsl(var(--border-strong));
  border-radius: var(--radius);
  background: hsl(var(--surface));
  color: hsl(var(--fg-muted));
  font-size: 0.8rem;
  cursor: pointer;

  &:hover {
    border-color: hsl(var(--primary));
    color: hsl(var(--primary));
  }
`

const PurgeBtn = styled(RestoreBtn)`
  color: hsl(var(--danger));

  &:hover {
    border-color: hsl(var(--danger));
    color: hsl(var(--danger));
  }
`

const DeletedNote = styled.div`
  margin-top: 10px;
  font-size: 0.73rem;
  color: hsl(var(--fg-subtle));
`

const MountBtn = styled.button`
  margin-top: 14px;
  padding: 7px 14px;
  border: 1px solid hsl(var(--border-strong));
  border-radius: var(--radius);
  background: hsl(var(--surface));
  color: hsl(var(--fg-muted));
  font-size: 0.8rem;
  cursor: pointer;

  &:hover {
    border-color: hsl(var(--primary));
    color: hsl(var(--primary));
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
  background: hsl(var(--surface));
  border-radius: var(--radius-lg);
  padding: 32px 28px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid hsl(var(--border));
  border-left: 4px solid ${props => props.$color || 'hsl(var(--primary))'};
  position: relative;

  /* 초안은 한눈에 구분되어야 한다. 별도 컴포넌트를 as 로 끼우지 않고 여기서
     직접 정하는 이유는, 그러면 두 클래스가 같은 속성을 두고 다투고 승자는
     스타일시트에 먼저 들어간 쪽이 정하기 때문이다. */
  ${props => props.$draft && `
    background: hsl(var(--warn-soft));
    border: 1px dashed hsl(var(--warn-border));
    border-left: 4px solid ${props.$color || 'hsl(var(--primary))'};
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
  color: hsl(var(--fg));
  margin: 0 0 8px 0;
`

const CardDesc = styled.p`
  font-size: 0.9rem;
  color: hsl(var(--fg-subtle));
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
  color: hsl(var(--border-strong));
  font-size: 1.1rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  line-height: 1;
  opacity: 0;
  transition: all 0.2s;

  &:hover {
    background: hsl(var(--danger-soft));
    color: hsl(var(--danger));
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
  border-radius: var(--radius-sm);
  padding: 2px 8px;
  font-size: 0.72rem;
  font-weight: 700;
`

const AiTag = styled(Tag)`
  background: hsl(var(--accent-soft));
  color: hsl(var(--accent));
  border: 1px solid hsl(var(--accent) / 0.35);
`

/**
 * **게시 후에 AI 가 또 고친 카드.**
 *
 * 다른 표시와 색을 달리한다. 게시 기록은 그대로 남아 있어서, 이 말을 하지
 * 않으면 검토를 거친 카드처럼 보인다 — 정작 그 사람이 본 것은 지금 화면에
 * 있는 카드가 아니다.
 */
const StaleReviewTag = styled(Tag)`
  background: hsl(var(--danger-soft));
  color: hsl(var(--danger));
  border: 1px solid hsl(var(--danger-border));
`

const DraftTag = styled(Tag)`
  background: hsl(var(--warn-soft));
  color: hsl(var(--warn));
  border: 1px solid hsl(var(--warn-border));
`

const PublishBtn = styled.button`
  margin-top: 12px;
  width: 100%;
  padding: 8px;
  background: hsl(var(--warn));
  color: white;
  border: none;
  border-radius: var(--radius);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: hsl(var(--warn) / 0.85);
  }

  &:disabled {
    background: hsl(var(--border-strong));
    cursor: not-allowed;
  }
`

// 카드 추가 버튼
const AddCard = styled.div`
  background: hsl(var(--surface));
  border-radius: var(--radius-lg);
  padding: 32px 28px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid hsl(var(--border));
  border: 2px dashed hsl(var(--border-strong));
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  min-height: 120px;

  &:hover {
    border-color: hsl(var(--primary));
    background: hsl(var(--info-soft));
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  }
`

const AddIcon = styled.div`
  font-size: 2rem;
  color: hsl(var(--border-strong));
  margin-bottom: 8px;

  ${AddCard}:hover & {
    color: hsl(var(--primary));
  }
`

const AddText = styled.p`
  font-size: 0.95rem;
  color: hsl(var(--fg-subtle));
  margin: 0;

  ${AddCard}:hover & {
    color: hsl(var(--primary));
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
  background: hsl(var(--surface));
  border-radius: var(--radius-lg);
  padding: 32px;
  width: 420px;
  max-width: 90vw;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
`

const ModalTitle = styled.h2`
  font-size: 1.3rem;
  font-weight: 600;
  color: hsl(var(--fg));
  margin: 0 0 24px 0;
`

const FormGroup = styled.div`
  margin-bottom: 20px;
`

const Label = styled.label`
  display: block;
  font-size: 0.9rem;
  font-weight: 500;
  color: hsl(var(--fg-muted));
  margin-bottom: 6px;
`

const Input = styled.input`
  width: 100%;
  padding: 10px 14px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  font-size: 0.95rem;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s;

  &:focus {
    border-color: hsl(var(--primary));
  }
`

const TextArea = styled.textarea`
  width: 100%;
  padding: 10px 14px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  font-size: 0.95rem;
  outline: none;
  box-sizing: border-box;
  resize: vertical;
  min-height: 80px;
  transition: border-color 0.2s;

  &:focus {
    border-color: hsl(var(--primary));
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
  border-radius: var(--radius);
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
`

const CancelButton = styled(Button)`
  background: hsl(var(--bg));
  color: hsl(var(--fg-muted));

  &:hover {
    background: hsl(var(--border));
  }
`

const SubmitButton = styled(Button)`
  background: hsl(var(--primary));
  color: white;

  &:hover {
    background: hsl(var(--primary));
  }

  &:disabled {
    background: hsl(var(--primary) / 0.45);
    cursor: not-allowed;
  }
`

const ErrorMsg = styled.p`
  color: hsl(var(--danger));
  font-size: 0.85rem;
  margin: -12px 0 16px 0;
`

// ============================================
// Component
// ============================================
function MainPage() {
  const navigate = useNavigate()
  const { alert, confirm } = useDialog()
  const { user, logout } = useAuth()
  const [cards, setCards] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  /**
   * 지금 어느 조직을 보는가 — **주소에 있다.**
   *
   * 트리가 껍데기로 올라가면서 상태를 나눠 가져야 했는데, 위로 올려 내려보내는
   * 대신 주소에 두었다. 링크로 나눌 수 있고 새로고침해도 그대로다.
   * 빈 문자열이면 전체 보기.
   */
  const [params, setParams] = useSearchParams()

  /** 보는 조직을 바꾼다. 주소가 곧 상태라 뒤로 가기도 그대로 먹는다. */
  const goToOrg = (slug) => setParams(slug ? { org: slug } : {})
  const selected = params.get('org') || ''
  const { tree, personal, refreshTree } = useOutletContext()
  const [mountTarget, setMountTarget] = useState(null)
  const [workflows, setWorkflows] = useState([])
  // 입력 중인 글자와 **실제로 보낸 검색어**를 나눈다. 한 글자마다 요청을
  // 보내면 타이핑이 끊기고, 서버는 버려질 결과를 계속 만든다.
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')
  // 성공 알림. 오류(orgError)와 자리를 나눠 쓰면 성공이 붉게 보인다.
  const [notice, setNotice] = useState('')

  useEffect(() => {
  }, [])

  // 고른 자리가 바뀌면 목록을 다시 받는다. **화면에서 거르지 않는다** — 거르면
  // 남의 개인 공간 카드가 응답에는 이미 실려 온 뒤라 개발자도구에 그대로 보인다.
  useEffect(() => {
    fetchCards(selected, query)
    fetchWorkflows(selected, query)
  }, [selected, query])

  // 타이핑이 멎으면 그때 보낸다.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(searchInput.trim()), 250)
    return () => clearTimeout(timer)
  }, [searchInput])

  const fetchCards = async (org, q = '') => {
    try {
      // 휴지통은 **다른 엔드포인트**다. 평소 목록에 조건부로 섞으면, 거르는
      // 조건을 한 군데서 빠뜨리는 순간 지운 카드가 되살아난 것처럼 보인다.
      //
      // 검색은 자리를 가리지 않으므로 org 를 함께 보내지 않는다. 찾는다는
      // 것은 자리를 모른다는 뜻이다.
      const path = q
        ? `/cards?q=${encodeURIComponent(q)}`
        : org === TRASH
          ? '/cards/trash'
          : org
            ? `/cards?org=${encodeURIComponent(org)}`
            : '/cards'
      const res = await apiFetch(path)
      const data = await res.json()
      setCards(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to fetch cards:', err)
    }
  }

  /**
   * 워크플로 목록. **카드와 같은 자리를 본다** — 조직 화면에서 묻는 질문은
   * '여기 뭐가 있나' 이지 '카드가 뭐가 있나' 가 아니다.
   */
  const fetchWorkflows = async (org, q = '') => {
    try {
      const path = q
        ? `/workflows?q=${encodeURIComponent(q)}`
        : org === TRASH
          ? '/workflows/trash'
          : org
            ? `/workflows?org=${encodeURIComponent(org)}`
            : '/workflows'
      const res = await apiFetch(path)
      const data = await res.json()
      setWorkflows(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to fetch workflows:', err)
      setWorkflows([])
    }
  }

  /** 카드 수가 바뀌면 트리의 숫자도 함께 틀어진다. 셋을 같이 새로 받는다. */
  const refresh = () => {
    fetchCards(selected, query)
    fetchWorkflows(selected, query)
    refreshTree()
  }

  // --- 조직 관리 (관리자) -------------------------------------------------------
  //
  // 모달이 결과를 **문자열로 돌려받는다.** 빈 값이면 성공, 글자가 있으면 그것이
  // 오류 문구다. 모달이 서버 응답을 직접 읽게 하면 API 경로가 두 곳으로 갈리고,
  // 실패했을 때 창을 닫을지 남길지 판단도 두 곳에 생긴다.

  /** 이 화면에서 난 문제 한 줄. 조직·카드·워크플로가 같이 쓴다. */
  const [orgError, setOrgError] = useState('')

  const errorFrom = async (res) => {
    if (res.ok) return ''
    const body = await res.json().catch(() => ({}))
    return body.error || '처리하지 못했습니다.'
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
    const ok = await confirm({
      title: `'${card.name}' 를 게시합니다`,
      body: '이 카드가 모든 사용자에게 보이고, 사람들이 이 계산으로 설계'
        + ' 판단을 하게 됩니다.'
        + '\n\n열어서 숫자를 확인해 보셨나요?'
        + ' 계산이 돈다는 것과 값이 맞다는 것은 다릅니다.',
      confirmLabel: '게시하기',
    })
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
        await alert({
          title: '게시하지 못했습니다',
          body: (body.error || '') + detail,
        })
        return
      }
      await fetchCards()
    } catch (err) {
      await alert({ title: '게시하지 못했습니다', body: err.message })
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

  /** 휴지통으로 보낸다. 아직 지워지지 않으므로 무겁게 묻지 않는다. */
  const handleDeleteCard = async (e, cardId) => {
    e.stopPropagation()
    const ok = await confirm({
      title: '이 카드를 휴지통으로 옮깁니다',
      body: '휴지통에서 되살릴 수 있습니다.',
      confirmLabel: '휴지통으로',
    })
    if (!ok) return
    try {
      const res = await apiFetch(`/cards/${cardId}`, { method: 'DELETE' })
      if (res.ok) refresh()
    } catch (err) {
      console.error('Failed to delete card:', err)
    }
  }

  /**
   * 카드를 통째로 복제한다. 사본은 **내 개인 공간에 초안으로** 놓인다.
   *
   * 복제한 뒤 그 자리로 옮겨 준다. 목록에 남으면 방금 만든 사본이 어디 갔는지
   * 찾게 되는데, 지금 보고 있는 것이 조직 화면이면 사본은 거기 없다 — 아직
   * 아무 데도 게시되지 않았기 때문이다.
   */
  const handleDuplicateCard = async (e, card) => {
    e.stopPropagation()
    const res = await apiFetch(`/cards/${card.id}/duplicate`, { method: 'POST' })
    if (!res.ok) {
      setOrgError(await errorFrom(res))
      return
    }
    const body = await res.json()
    await refreshTree()
    // **자리를 옮기든 아니든 목록은 다시 받는다.** 같은 값으로 setSelected 하면
    // 상태가 안 바뀌어 useEffect 가 돌지 않는다 — 이미 「내 카드」를 보던 중이면
    // 방금 만든 사본이 새로고침 전까지 안 나온다.
    const target = personal ? personal.slug : selected
    goToOrg(target)
    fetchCards(target)
    setOrgError('')
    setNotice(`${body.message} 「내 카드」에 초안으로 놓였습니다.`)
  }

  // --- 워크플로 -----------------------------------------------------------

  const [wfForm, setWfForm] = useState(null)

  const submitWorkflow = async (name) => {
    const res = await apiFetch('/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const message = await errorFrom(res)
    if (message) return message
    const wf = await res.json()
    // 만든 것은 내 공간에 초안으로 놓인다. 조직 화면에 남으면 방금 만든
    // 것이 어디 갔는지 찾게 된다 — 카드 복제와 같은 이유다.
    const target = personal ? personal.slug : selected
    goToOrg(target)
    fetchWorkflows(target, '')
    refreshTree()
    setNotice(`'${wf.name}' 워크플로를 만들었습니다. 「내 공간」에 초안으로 놓였습니다.`)
    return ''
  }

  const handleDeleteWorkflow = async (wf) => {
    const ok = await confirm({
      title: `'${wf.name}' 을(를) 휴지통으로 옮깁니다`,
      body: '휴지통에서 되살릴 수 있습니다.'
        + '\n안에 있던 카드 자체는 그대로 있습니다.',
      confirmLabel: '휴지통으로',
    })
    if (!ok) return
    const res = await apiFetch(`/workflows/${wf.id}`, { method: 'DELETE' })
    if (!res.ok) { setOrgError(await errorFrom(res)); return }
    refresh()
  }

  const handleRestoreWorkflow = async (wf) => {
    const res = await apiFetch(`/workflows/${wf.id}/restore`, { method: 'POST' })
    if (!res.ok) { setOrgError(await errorFrom(res)); return }
    refresh()
  }

  const handlePurgeWorkflow = async (wf) => {
    const ok = await confirm({
      title: `'${wf.name}' 을(를) 완전히 삭제합니다`,
      body: '노드와 연결이 함께 사라지고 되돌릴 수 없습니다.'
        + '\n안에 있던 카드 자체는 지워지지 않습니다.',
      confirmLabel: '완전 삭제',
      tone: 'danger',
    })
    if (!ok) return
    const res = await apiFetch(`/workflows/${wf.id}/permanent`, { method: 'DELETE' })
    if (!res.ok) { setOrgError(await errorFrom(res)); return }
    refresh()
  }

  const handleRestoreCard = async (e, card) => {
    e.stopPropagation()
    const res = await apiFetch(`/cards/${card.id}/restore`, { method: 'POST' })
    if (!res.ok) {
      setOrgError(await errorFrom(res))
      return
    }
    refresh()
  }

  /**
   * 완전 삭제 — 되돌릴 수 없다.
   *
   * 여기서만 무겁게 묻는다. 무엇이 함께 사라지는지 이름을 대 준다 — "정말
   * 삭제할까요" 는 무엇을 잃는지 말해 주지 않아서, 사람은 읽지 않고 누른다.
   */
  const handlePurgeCard = async (e, card) => {
    e.stopPropagation()
    const ok = await confirm({
      title: `'${card.name}' 를 완전히 삭제합니다`,
      body: '변수·컨테이너·이미지·변경 이력이 함께 사라지고'
        + ' 되돌릴 수 없습니다.'
        + '\n이 카드로 계산한 기록은 남지만, 카드와의 연결은 끊어집니다.',
      confirmLabel: '완전 삭제',
      tone: 'danger',
    })
    if (!ok) return
    const res = await apiFetch(`/cards/${card.id}/permanent`, { method: 'DELETE' })
    if (!res.ok) {
      setOrgError(await errorFrom(res))
      return
    }
    refresh()
  }

  const openModal = () => {
    setName('')
    setDescription('')
    setError('')
    setShowModal(true)
  }

  const isPersonalView = !!personal && selected === personal.slug && !query
  const isTrashView = selected === TRASH && !query

  /** 지금 보고 있는 자리의 이름. 트리를 평탄화해 찾는다. */
  const selectedLabel = (() => {
    if (query) return `'${query}' 검색 결과`
    if (!selected) return '전체'
    if (isTrashView) return '지운 카드'
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
      {/* 홈 화면 자신이라 「← 홈」 은 넘기지 않는다. */}
      <AppHeader
        title="Mechanical Design"
        subtitle="기계설계 엔지니어링 도구 모음"
        right={user && (
          <>
            <BarText>{user.display_name}</BarText>
            {user.is_admin && (
              <BarButton onClick={() => navigate('/accounts')}>계정 관리</BarButton>
            )}
            <BarButton onClick={() => navigate('/records')}>계산 기록</BarButton>
            <BarButton onClick={() => navigate('/tokens')}>토큰</BarButton>
            <BarButton onClick={() => navigate('/change-password')}>비밀번호</BarButton>
            <BarButton onClick={logout}>로그아웃</BarButton>
          </>
        )}
      />

      <Body>
        <Main>
          <SearchRow>
            <SearchInput
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="카드 이름 · 설명 · 변수 · 수식에서 찾기 (예: 볼트, sig, 9.81)"
            />
            {searchInput && (
              <ClearBtn onClick={() => setSearchInput('')}>지우기</ClearBtn>
            )}
          </SearchRow>
          <Crumb>
            <b>{selectedLabel}</b>
            {isPersonalView && ' — 아직 어디에도 올리지 않은 카드가 여기 있습니다'}
            {isTrashView && ' — 되살리거나, 여기서 지워야 완전히 사라집니다'}
            {query && ` — ${cards.length}장 (조직과 무관하게 전부 찾습니다)`}
          </Crumb>

          {/* 드래그 실패를 조용히 넘기지 않는다. 트리는 서버 상태로 되돌아가
              제자리로 튕겨 보이는데, 왜 안 됐는지 말해 주지 않으면 사람은
              같은 동작을 몇 번 더 시도한다. */}
          {notice && (
            <NoticeBar>
              {notice}
              <CloseX onClick={() => setNotice('')}>✕</CloseX>
            </NoticeBar>
          )}

          {orgError && (
            <OrgErrorBar>
              {orgError}
              <CloseX onClick={() => setOrgError('')}>✕</CloseX>
            </OrgErrorBar>
          )}

          <WorkflowSection
            workflows={workflows}
            isTrashView={isTrashView}
            query={query}
            /* 카드의 '＋ 카드 추가' 와 같은 규칙 — 어느 자리에서 눌러도
               만들어지는 곳은 내 공간이다. 만드는 자리를 특정 화면에만 두면
               그 화면을 안 눌러 본 사람은 기능이 있는 줄도 모른다. */
            canAdd={!isTrashView}
            onOpen={(wf) => navigate(wf.route)}
            onAdd={() => setWfForm({ mode: 'create' })}
            onDelete={handleDeleteWorkflow}
            onRestore={handleRestoreWorkflow}
            onPurge={handlePurgeWorkflow}
          />

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
              {!isTrashView && (
                <DeleteBtn className="delete-btn" onClick={(e) => handleDeleteCard(e, card.id)}>
                  ✕
                </DeleteBtn>
              )}
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
              {isTrashView && card.deleted_at && (
                <DeletedNote>
                  {new Date(card.deleted_at).toLocaleString('ko-KR')}
                  {card.deleted_by_name ? ` · ${card.deleted_by_name}` : ''} 삭제
                </DeletedNote>
              )}
              {/* 어디에 걸려 있는지 카드 위에서 바로 보인다. 대화상자를 열어야만
                  알 수 있으면, 내려야 할 카드가 걸린 채로 남는다. */}
              {/* 무엇 때문에 걸렸는지. 이름만 보여 주면 그 카드의 **어디에**
                  그 값이 있는지 다시 찾아야 한다. */}
              {query && card.match?.length > 0 && (
                <MatchRow>
                  {card.match.map((m, i) => (
                    <MatchChip key={i}>{m}</MatchChip>
                  ))}
                </MatchRow>
              )}
              {card.mounted_orgs?.length > 0 && (
                <OrgChips>
                  {card.mounted_orgs.map((o) => (
                    <OrgChip key={o.slug}>{o.name}</OrgChip>
                  ))}
                </OrgChips>
              )}
              {!isTrashView && (
                <CopyBtn onClick={(e) => handleDuplicateCard(e, card)}
                         title="이 카드를 통째로 복사해 내 공간에 초안으로 만듭니다">
                  복제
                </CopyBtn>
              )}
              {isTrashView ? (
                <TrashActions>
                  <RestoreBtn onClick={(e) => handleRestoreCard(e, card)}>되살리기</RestoreBtn>
                  <PurgeBtn onClick={(e) => handlePurgeCard(e, card)}>완전 삭제</PurgeBtn>
                </TrashActions>
              ) : isDraft ? (
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

        {!isTrashView && (
          <AddCard onClick={openModal}>
            <AddIcon>+</AddIcon>
            <AddText>카드 추가</AddText>
          </AddCard>
        )}
          </CardGrid>

          {cards.length === 0 && (
            <EmptyNote>
              {query
                ? `'${query}' 로 찾은 카드가 없습니다. 이름·설명뿐 아니라 변수 이름과 수식에서도 찾습니다.`
                : isTrashView
                ? '휴지통이 비어 있습니다.'
                : isPersonalView
                ? '내 카드가 없습니다. 오른쪽 위 “카드 추가”로 만들면 여기에 놓입니다.'
                : selected
                  ? '이 조직에 게시된 카드가 없습니다. 카드를 만든 사람이 “조직에 게시”로 올릴 수 있습니다.'
                  : '카드가 없습니다.'}
            </EmptyNote>
          )}
        </Main>
      </Body>

      {wfForm && (
        <OrgFormModal
          mode="create"
          kind="워크플로"
          onSubmit={submitWorkflow}
          onClose={() => setWfForm(null)}
        />
      )}

      {mountTarget && (
        <PublishToOrgDialog
          card={mountTarget}
          tree={tree}
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
