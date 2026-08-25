/**
 * 앱 껍데기 — **왼쪽 사이드바는 어느 화면에서도 사라지지 않는다.**
 *
 * 조직 트리가 홈 화면 안에만 있었다. 카드를 열면 트리가 사라져서, 다른 조직으로
 * 가려면 왼쪽 위 「← 홈」 까지 마우스를 올렸다가 다시 트리로 내려와야 했다.
 * 화면을 옮길 때마다 그 왕복이 붙는다.
 *
 * 트리는 이 앱의 **길잡이**다. 홈 화면의 부속이 아니라 껍데기의 일부여야 한다.
 * ReportArchive·MatNexus 도 같은 모양이다 — 사이드바가 먼저 있고 그 오른쪽에서
 * 화면이 바뀐다.
 *
 * ## 고른 조직이 주소에 있는 까닭
 *
 * 트리가 껍데기로 올라오면 「지금 어느 조직을 보는가」 를 홈 화면 혼자 알 수
 * 없다. 상태를 위로 올려 내려보낼 수도 있지만, **주소에 두면 링크로 나눌 수
 * 있고 새로고침해도 그대로다.** 조직별 화면을 누군가에게 보낼 일이 실제로 있다.
 *
 * ## 조직 관리도 여기 있다
 *
 * 만들기·이름 바꾸기·지우기·드래그는 트리를 따라온다. 트리만 옮기고 관리를
 * 홈에 두면, 트리를 오른쪽 클릭했을 때 반응하는 코드가 다른 화면에 있게 된다.
 */

import React, { useCallback, useEffect, useState } from 'react'
import {
  Outlet, useLocation, useNavigate, useSearchParams,
} from 'react-router-dom'
import styled from 'styled-components'

import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import OrgTree from './OrgTree'
import { OrgDeleteModal, OrgFormModal } from './OrgModals'

/** 휴지통은 조직이 아니지만 트리에서 같은 자리를 쓴다. */
export const TRASH = '__trash__'

const Frame = styled.div`
  display: flex;
  height: 100vh;
  overflow: hidden;

  /* 인쇄에서는 사이드바가 잉크만 먹는다. 종이에는 본문만 간다. */
  @media print {
    display: block;
    height: auto;
    overflow: visible;
  }
`

const Side = styled.aside`
  display: flex;
  flex-direction: column;
  width: 248px;
  flex-shrink: 0;
  border-right: 1px solid hsl(var(--border));
  background: hsl(var(--surface));

  @media print {
    display: none;
  }

  /* 좁은 화면에서는 자리를 다투므로 접는다. 그때는 머리띠의 「← 홈」 이 길이다. */
  @media (max-width: 900px) {
    display: none;
  }
`

/** 앱 이름 줄. 머리띠와 같은 높이라 옆 화면과 선이 맞는다. */
const Brand = styled.button`
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 56px;
  flex-shrink: 0;
  padding: 0 16px;
  border: none;
  border-bottom: 1px solid hsl(var(--border));
  background: none;
  text-align: left;
  cursor: pointer;
  font-family: inherit;

  &:hover {
    background: hsl(var(--surface-2));
  }
`

const BrandName = styled.span`
  font-size: 0.95rem;
  font-weight: 600;
  color: hsl(var(--fg));
  letter-spacing: -0.01em;
`

const BrandSub = styled.span`
  font-size: 0.72rem;
  color: hsl(var(--fg-muted));
`

const Nav = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  border-bottom: 1px solid hsl(var(--border));
`

const NavItem = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 10px;
  border: none;
  border-radius: var(--radius-sm);
  background: ${p => (p.$on ? 'hsl(var(--surface-2))' : 'none')};
  color: ${p => (p.$on ? 'hsl(var(--fg))' : 'hsl(var(--fg-muted))')};
  font-size: 0.85rem;
  font-family: inherit;
  font-weight: ${p => (p.$on ? 600 : 400)};
  text-align: left;
  cursor: pointer;

  &:hover {
    background: hsl(var(--surface-2));
    color: hsl(var(--fg));
  }
`

/** 트리만 스크롤한다. 위쪽 이동 링크는 늘 제자리에 있어야 한다. */
const TreeArea = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
`

const Content = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  @media print {
    display: block;
    overflow: visible;
  }
`

const Problem = styled.div`
  margin: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: hsl(var(--danger-soft));
  border: 1px solid hsl(var(--danger-border));
  color: hsl(var(--danger));
  font-size: 0.78rem;
  line-height: 1.5;
`

function AppShell() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()

  const [tree, setTree] = useState([])
  const [personal, setPersonal] = useState(null)
  const [trashCount, setTrashCount] = useState(0)
  const [orgForm, setOrgForm] = useState(null)
  const [orgDelete, setOrgDelete] = useState(null)
  const [orgError, setOrgError] = useState('')

  const selected = params.get('org') || ''
  // `window.location` 이 아니라 훅으로 읽는다 — 주소만 바뀌는 이동에서는
  // window 값이 바뀌어도 React 가 다시 그리지 않아, 고른 자리 표시가 굳는다.
  const here = useLocation().pathname

  const fetchTree = useCallback(async () => {
    try {
      const res = await apiFetch('/orgs/tree')
      const data = await res.json()
      setTree(data.tree || [])
      setPersonal(data.personal || null)
    } catch {
      // 트리를 못 받아도 화면은 떠야 한다. 사이드바만 비어 보인다.
    }
    // 휴지통 개수는 조직 트리에 없다 — 조직이 아니기 때문이다. 옆에서 따로
    // 세어 트리와 같은 시점에 갱신한다.
    try {
      const res = await apiFetch('/cards/trash')
      const rows = await res.json()
      setTrashCount(Array.isArray(rows) ? rows.length : 0)
    } catch {
      setTrashCount(0)
    }
  }, [])

  useEffect(() => { fetchTree() }, [fetchTree])

  /**
   * 조직을 고르면 **홈으로 간다.**
   *
   * 카드를 보다가 다른 조직을 누르는 것은 "그 조직의 목록을 보겠다" 는 뜻이다.
   * 지금 화면에 머무르면 트리에서 고른 것과 보이는 것이 어긋난다.
   */
  const select = (slug) => {
    const next = slug ? `/?org=${encodeURIComponent(slug)}` : '/'
    if (here === '/') setParams(slug ? { org: slug } : {})
    else navigate(next)
  }

  const errorFrom = async (res) => {
    if (res.ok) return ''
    const body = await res.json().catch(() => ({}))
    return body.error || '처리하지 못했습니다.'
  }

  /** 트리에서 노드를 찾는다 — 하위 개수는 삭제 모달이 미리 알려 주는 데 쓴다. */
  const findNode = (nodes, slug) => {
    for (const n of nodes) {
      if (n.slug === slug) return n
      const hit = findNode(n.children || [], slug)
      if (hit) return hit
    }
    return null
  }

  const submitOrgForm = async (name) => {
    const creating = orgForm.mode === 'create'
    const res = creating
      ? await apiFetch('/orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parent_slug: orgForm.parentSlug || null }),
      })
      // 이름만 바꾼다. 주소(slug)는 그대로 둔다 — 바꾸면 저장해 둔 링크가 죽는다.
      : await apiFetch(`/orgs/${encodeURIComponent(orgForm.org.slug)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
    const message = await errorFrom(res)
    if (!message) fetchTree()
    return message
  }

  const confirmOrgDelete = async () => {
    const slug = orgDelete.org.slug
    const res = await apiFetch(`/orgs/${encodeURIComponent(slug)}`,
      { method: 'DELETE' })
    const message = await errorFrom(res)
    if (!message) {
      if (selected === slug) select('')
      fetchTree()
    }
    return message
  }

  /**
   * 드래그로 옮긴 결과를 보낸다.
   *
   * 순서 매기기는 서버가 한다 — 화면이 형제 전부의 번호를 계산해 보내면 요청이
   * 여러 개로 쪼개지고, 그중 하나가 실패하면 트리가 반쯤 옮겨진 채 남는다.
   */
  const handleMoveOrg = async (slug, parentSlug, position) => {
    const res = await apiFetch(`/orgs/${encodeURIComponent(slug)}/move`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent_slug: parentSlug, position }),
    })
    setOrgError(await errorFrom(res))
    // 성공이든 실패든 서버 상태로 다시 그린다. 실패했는데 화면만 옮겨져 있으면
    // 다음 드래그가 있지도 않은 자리를 기준으로 계산된다.
    fetchTree()
  }

  return (
    <Frame>
      <Side>
        <Brand onClick={() => navigate('/')}>
          <BrandName>Mechanical Design</BrandName>
          <BrandSub>기계설계 엔지니어링 도구</BrandSub>
        </Brand>

        <Nav>
          <NavItem $on={here === '/'} onClick={() => navigate('/')}>
            전체 카드
          </NavItem>
          <NavItem $on={here.startsWith('/records')}
                   onClick={() => navigate('/records')}>
            계산 기록
          </NavItem>
        </Nav>

        {orgError && <Problem>{orgError}</Problem>}

        <TreeArea>
          <OrgTree
            tree={tree}
            personal={personal}
            selected={here === '/' ? selected : ''}
            onSelect={select}
            isAdmin={!!user?.is_admin}
            onAdd={(parentSlug) => setOrgForm({
              mode: 'create',
              parentSlug,
              parentName: parentSlug ? findNode(tree, parentSlug)?.name : undefined,
            })}
            onRename={(org) => setOrgForm({ mode: 'rename', org })}
            onDelete={(org) => {
              const node = findNode(tree, org.slug)
              setOrgDelete({
                org: node || org,
                childCount: (node?.children || []).length,
              })
            }}
            onMove={handleMoveOrg}
            trashSlug={TRASH}
            trashCount={trashCount}
          />
        </TreeArea>
      </Side>

      <Content>
        {/* 화면마다 자기 머리띠와 본문을 그린다. 껍데기는 자리만 만든다. */}
        <Outlet context={{ tree, personal, trashCount, refreshTree: fetchTree }} />
      </Content>

      {orgForm && (
        <OrgFormModal
          mode={orgForm.mode}
          parentName={orgForm.parentName}
          initialName={orgForm.org?.name || ''}
          onSubmit={submitOrgForm}
          onClose={() => setOrgForm(null)}
        />
      )}
      {orgDelete && (
        <OrgDeleteModal
          org={orgDelete.org}
          childCount={orgDelete.childCount}
          onConfirm={confirmOrgDelete}
          onClose={() => setOrgDelete(null)}
        />
      )}
    </Frame>
  )
}

export default AppShell
