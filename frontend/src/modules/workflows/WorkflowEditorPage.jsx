/**
 * 워크플로 편집기 — 표 형식.
 *
 * **캔버스로 시작하지 않는다.** 연결선을 그리는 화면은 만들기도 크고, 무엇이
 * 정말 필요한지는 써 봐야 안다. 표로 먼저 쓰면서 필요한 것이 보이면 그때 캔버스를
 * 얹는다 — 노드에 좌표 칸을 미리 만들어 둔 것이 그래서다. 데이터 모델은 안 바뀐다.
 *
 * 화면이 지켜야 하는 것 하나: **연결된 입력은 손으로 못 고치게 한다.**
 * 값이 들어오는 칸을 편집할 수 있게 두면, 고쳐 놓고도 앞 노드 값에 덮여 무시된다.
 * 고칠 수 있는데 무시되는 것이 이 화면에서 가장 나쁜 실패다.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../shared/api/client'
import { validateWorkflow } from '../../shared/utils/workflowValidate'
import * as S from './editorStyles'

function WorkflowEditorPage() {
  const location = useLocation()
  const navigate = useNavigate()

  const [workflow, setWorkflow] = useState(null)
  const [cardVariables, setCardVariables] = useState({})
  const [cards, setCards] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [picking, setPicking] = useState(false)
  const [linking, setLinking] = useState(null)   // { fromNode, fromVar, toNode, toVar }

  const load = useCallback(async () => {
    const route = decodeURIComponent(location.pathname)
    const res = await apiFetch(`/workflows/lookup?route=${encodeURIComponent(route)}`)
    if (!res.ok) {
      setError('워크플로를 찾을 수 없습니다.')
      return
    }
    const wf = await res.json()
    setWorkflow(wf)

    // 노드가 쓰는 카드의 변수를 **한 번에** 받는다. 노드마다 따로 부르면 그중
    // 하나가 늦게 와서 화면이 반쯤 그려진 상태로 남는다.
    const ids = [...new Set(wf.nodes.map(n => n.card_id))]
    if (ids.length) {
      const vres = await apiFetch(`/cards/variables?ids=${ids.join(',')}`)
      if (vres.ok) setCardVariables(await vres.json())
    } else {
      setCardVariables({})
    }
  }, [location.pathname])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    // 넣을 수 있는 카드 목록. 내 초안까지 포함해야 방금 만든 카드를 넣을 수 있다.
    apiFetch('/cards?org=' + encodeURIComponent(''))
      .then(r => r.json())
      .then(rows => setCards(Array.isArray(rows) ? rows : []))
      .catch(() => {})
  }, [])

  const issues = useMemo(
    () => (workflow ? validateWorkflow(workflow, cardVariables) : []),
    [workflow, cardVariables],
  )

  /** 어느 입력이 연결로 채워지는가. 편집을 막는 판단의 근거다. */
  const linkedInputs = useMemo(() => {
    const map = new Map()
    for (const link of workflow?.links || []) {
      map.set(`${link.to_node_id}:${link.to_variable_id}`, link)
    }
    return map
  }, [workflow])

  const call = async (path, options) => {
    setError('')
    const res = await apiFetch(path, options)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error || '처리하지 못했습니다.')
      return null
    }
    await load()
    return res.json().catch(() => ({}))
  }

  const addNode = (cardId) => {
    setPicking(false)
    call(`/workflows/${workflow.id}/nodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card_id: cardId }),
    })
  }

  const removeNode = async (node) => {
    const linked = (workflow.links || []).filter(
      l => l.from_node_id === node.id || l.to_node_id === node.id).length
    const ask = `'${node.alias}' 를 빼시겠습니까?`
      + (linked ? `\n\n이 노드에 닿은 연결 ${linked}개도 함께 끊깁니다.` : '')
    if (!window.confirm(ask)) return
    await call(`/workflows/${workflow.id}/nodes/${node.id}`, { method: 'DELETE' })
  }

  const setInput = async (node, variableId, value) => {
    const next = { ...(node.inputs || {}), [variableId]: value }
    await call(`/workflows/${workflow.id}/nodes/${node.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: next }),
    })
  }

  const addLink = async () => {
    const { fromNode, fromVar, toNode, toVar } = linking || {}
    if (!fromNode || !fromVar || !toNode || !toVar) {
      setError('네 칸을 모두 고르세요.')
      return
    }
    const body = await call(`/workflows/${workflow.id}/links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from_node_id: Number(fromNode), from_variable_id: Number(fromVar),
        to_node_id: Number(toNode), to_variable_id: Number(toVar),
      }),
    })
    if (body) {
      setLinking(null)
      setNotice('연결했습니다.')
    }
  }

  const removeLink = async (link) => {
    await call(`/workflows/${workflow.id}/links/${link.id}`, { method: 'DELETE' })
  }

  const publish = async () => {
    const ok = window.confirm(
      `'${workflow.name}' 을(를) 게시합니다.\n\n`
      + '게시하면 조직에 올릴 수 있게 됩니다. 검증에 오류가 없는지 확인하셨나요?')
    if (!ok) return
    const body = await call(`/workflows/${workflow.id}/publish`, { method: 'POST' })
    if (body) setNotice('게시했습니다.')
  }

  if (error && !workflow) return <S.Wrap><S.Error>{error}</S.Error></S.Wrap>
  if (!workflow) return <S.Wrap><S.Muted>불러오는 중…</S.Muted></S.Wrap>

  const nodeById = new Map(workflow.nodes.map(n => [String(n.id), n]))
  const errors = issues.filter(i => i.level === 'error')
  const warnings = issues.filter(i => i.level === 'warning')

  const outputsOf = (nodeId) => {
    const node = nodeById.get(String(nodeId))
    return (cardVariables[node?.card_id] || []).filter(v => v.category !== 'input')
  }
  const inputsOf = (nodeId) => {
    const node = nodeById.get(String(nodeId))
    return (cardVariables[node?.card_id] || []).filter(v => v.category === 'input')
  }

  return (
    <S.Wrap>
      <S.Head>
        <div>
          <S.Back onClick={() => navigate('/')}>← 목록</S.Back>
          <S.Title>
            {workflow.name}
            {workflow.status === 'draft' && <S.DraftTag>초안 · 나만 보임</S.DraftTag>}
          </S.Title>
          <S.Sub>
            카드 {workflow.nodes.length}장 · 연결 {workflow.links.length}개
          </S.Sub>
        </div>
        <div>
          {workflow.status === 'draft' && (
            <S.Primary onClick={publish} disabled={workflow.nodes.length === 0}>
              게시하기
            </S.Primary>
          )}
        </div>
      </S.Head>

      {error && <S.Error>{error}</S.Error>}
      {notice && <S.Notice onClick={() => setNotice('')}>{notice}</S.Notice>}

      {/* 검증이 먼저 온다. 카드는 살아 있는 참조라, 아래 표가 멀쩡해 보여도
          가리키던 변수가 사라져 있을 수 있다. */}
      <S.Panel>
        <S.PanelHead>
          검증
          {errors.length > 0 && <S.Bad>오류 {errors.length}</S.Bad>}
          {warnings.length > 0 && <S.Warn>경고 {warnings.length}</S.Warn>}
          {issues.length === 0 && <S.Good>문제 없음</S.Good>}
        </S.PanelHead>
        {issues.map((issue, i) => (
          <S.Issue key={i} $bad={issue.level === 'error'}>
            {issue.message}
          </S.Issue>
        ))}
      </S.Panel>

      {/* --- 노드 -------------------------------------------------------- */}
      <S.SectionTitle>노드</S.SectionTitle>
      {workflow.nodes.length === 0 && (
        <S.Muted>아직 비어 있습니다. 카드를 넣으면 여기에 놓입니다.</S.Muted>
      )}

      {workflow.nodes.map(node => (
        <S.Node key={node.id} $bad={node.card_deleted}>
          <S.NodeHead>
            <S.NodeName>{node.alias}</S.NodeName>
            <S.NodeCard>{node.card_name}</S.NodeCard>
            {node.card_deleted && <S.Bad>카드가 휴지통에 있습니다</S.Bad>}
            <S.Small onClick={() => removeNode(node)}>빼기</S.Small>
          </S.NodeHead>

          <S.Inputs>
            {inputsOf(node.id).length === 0 && (
              <S.Muted>이 카드에는 입력이 없습니다.</S.Muted>
            )}
            {inputsOf(node.id).map(v => {
              const link = linkedInputs.get(`${node.id}:${v.id}`)
              const stored = (node.inputs || {})[String(v.id)] ?? (node.inputs || {})[v.id]
              return (
                <S.InputRow key={v.id}>
                  <S.VarName>
                    {v.name}{v.symbol ? ` (${v.symbol})` : ''}
                    {v.unit ? <S.Unit>{v.unit}</S.Unit> : null}
                  </S.VarName>
                  {link ? (
                    // **연결된 칸은 편집하지 않는다.** 고칠 수 있는데 앞 노드
                    // 값에 덮여 무시되는 것이 가장 나쁜 실패다.
                    <S.Linked>
                      ← {nodeById.get(String(link.from_node_id))?.alias}.{link.from_label}
                    </S.Linked>
                  ) : (
                    <S.Value
                      defaultValue={stored ?? ''}
                      placeholder="값"
                      onBlur={(e) => {
                        const next = e.target.value
                        if (String(stored ?? '') !== next) setInput(node, v.id, next)
                      }}
                    />
                  )}
                </S.InputRow>
              )
            })}
          </S.Inputs>
        </S.Node>
      ))}

      <S.Add onClick={() => setPicking(true)}>＋ 카드 넣기</S.Add>

      {picking && (
        <S.Picker>
          <S.PickerHead>어느 카드를 넣을까요</S.PickerHead>
          {cards.length === 0 && <S.Muted>넣을 수 있는 카드가 없습니다.</S.Muted>}
          {cards.map(c => (
            <S.PickItem key={c.id} onClick={() => addNode(c.id)}>
              {c.name}
              {c.status === 'draft' && <S.DraftTag>초안</S.DraftTag>}
            </S.PickItem>
          ))}
          <S.Small onClick={() => setPicking(false)}>닫기</S.Small>
        </S.Picker>
      )}

      {/* --- 연결 -------------------------------------------------------- */}
      <S.SectionTitle>연결</S.SectionTitle>
      {workflow.links.length === 0 && (
        <S.Muted>
          아직 연결이 없습니다. 앞 카드의 결과를 뒤 카드의 입력으로 이으면
          값이 흐릅니다.
        </S.Muted>
      )}

      {workflow.links.map(link => (
        <S.Link key={link.id}>
          <span>
            <b>{nodeById.get(String(link.from_node_id))?.alias}</b>.{link.from_label}
            {'  →  '}
            <b>{nodeById.get(String(link.to_node_id))?.alias}</b>.{link.to_label}
          </span>
          <S.Small onClick={() => removeLink(link)}>끊기</S.Small>
        </S.Link>
      ))}

      {workflow.nodes.length >= 2 && (
        linking ? (
          <S.LinkForm>
            <S.Select value={linking.fromNode || ''}
                      onChange={(e) => setLinking({ ...linking, fromNode: e.target.value, fromVar: '' })}>
              <option value="">보내는 노드</option>
              {workflow.nodes.map(n => <option key={n.id} value={n.id}>{n.alias}</option>)}
            </S.Select>
            <S.Select value={linking.fromVar || ''} disabled={!linking.fromNode}
                      onChange={(e) => setLinking({ ...linking, fromVar: e.target.value })}>
              <option value="">보내는 값 (결과)</option>
              {outputsOf(linking.fromNode).map(v => (
                <option key={v.id} value={v.id}>
                  {v.name}{v.symbol ? ` (${v.symbol})` : ''}{v.unit ? ` [${v.unit}]` : ''}
                </option>
              ))}
            </S.Select>
            <span>→</span>
            <S.Select value={linking.toNode || ''}
                      onChange={(e) => setLinking({ ...linking, toNode: e.target.value, toVar: '' })}>
              <option value="">받는 노드</option>
              {workflow.nodes.map(n => <option key={n.id} value={n.id}>{n.alias}</option>)}
            </S.Select>
            <S.Select value={linking.toVar || ''} disabled={!linking.toNode}
                      onChange={(e) => setLinking({ ...linking, toVar: e.target.value })}>
              <option value="">받는 입력</option>
              {inputsOf(linking.toNode)
                // 이미 연결된 입력은 고를 수 없다. 한 입력에는 하나만 이어진다.
                .filter(v => !linkedInputs.has(`${linking.toNode}:${v.id}`))
                .map(v => (
                  <option key={v.id} value={v.id}>
                    {v.name}{v.symbol ? ` (${v.symbol})` : ''}{v.unit ? ` [${v.unit}]` : ''}
                  </option>
                ))}
            </S.Select>
            <S.Primary onClick={addLink}>잇기</S.Primary>
            <S.Small onClick={() => setLinking(null)}>취소</S.Small>
          </S.LinkForm>
        ) : (
          <S.Add onClick={() => setLinking({})}>＋ 연결 만들기</S.Add>
        )
      )}
    </S.Wrap>
  )
}

export default WorkflowEditorPage
