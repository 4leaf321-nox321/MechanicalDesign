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
import { STATUS, runWorkflow, terminalNodes } from '../../shared/utils/workflowEngine'
import { fmt } from '../../shared/utils/goalSeek'
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
  const [run, setRun] = useState(null)
  const [recordTitle, setRecordTitle] = useState('')
  const [saving, setSaving] = useState(false)

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
    // 배선이나 값이 바뀌면 지난 실행 결과는 더 이상 이 워크플로의 결과가
    // 아니다. 남겨 두면 바뀐 화면 아래에 옛 숫자가 붙어 있게 된다.
    setRun(null)
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

  /**
   * 돌린다. 계산은 브라우저에서 한다 — 카드 화면과 **같은 계산기**를 쓰는
   * 것이 중요하다. 서버가 따로 돌리면 두 곳의 답이 갈리는 날이 온다.
   */
  const execute = () => {
    setError('')
    setRun(runWorkflow(workflow, cardVariables))
  }

  /**
   * 이 실행을 기록으로 남긴다.
   *
   * **화면이 보여 준 숫자를 그대로 보낸다.** 서버가 다시 계산해 넣으면 둘이
   * 어긋나는 날 어느 쪽을 믿어야 할지 알 수 없다 — 카드 기록과 같은 판단이다.
   */
  const saveRecord = async () => {
    if (!run?.nodes) return
    setSaving(true)
    setError('')

    const inputs = {}
    const results = {}
    for (const node of workflow.nodes) {
      const r = run.nodes[node.id]
      if (!r) continue
      inputs[node.id] = r.values || {}
      results[node.id] = r.results || {}
    }

    const res = await apiFetch('/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflow_id: workflow.id, title: recordTitle, inputs, results,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error || '기록을 저장하지 못했습니다.')
      return
    }
    setRecordTitle('')
    setNotice('기록으로 남겼습니다. 「계산 기록」에서 다시 볼 수 있습니다.')
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

      {/* --- 실행 -------------------------------------------------------- */}
      {workflow.nodes.length > 0 && (
        <S.Panel style={{ marginTop: 14 }}>
          <S.PanelHead>
            실행
            <S.Primary style={{ marginLeft: 'auto' }}
                       onClick={execute}
                       disabled={errors.length > 0}>
              돌리기
            </S.Primary>
          </S.PanelHead>

          {errors.length > 0 && (
            <S.Muted>검증 오류를 먼저 고쳐야 돌릴 수 있습니다.</S.Muted>
          )}

          {run && !run.nodes && <S.Issue $bad>{run.message}</S.Issue>}

          {run?.nodes && (
            <>
              {/* 결론을 먼저, 크게. 중간 노드까지 같은 크기로 늘어놓으면
                  무엇이 답인지 알 수 없다. */}
              <S.SubTitle>결론</S.SubTitle>
              <S.Finals>
                {terminalNodes(workflow).map(node => {
                  const r = run.nodes[node.id]
                  const vars = (cardVariables[node.card_id] || [])
                    .filter(v => v.category === 'output')
                  return (
                    <S.Final key={node.id} $bad={r?.status !== STATUS.ok}>
                      <S.FinalName>{node.alias}</S.FinalName>
                      {r?.status === STATUS.blocked ? (
                        <S.Muted>{r.message}</S.Muted>
                      ) : vars.length === 0 ? (
                        <S.Muted>결과값이 없는 카드입니다.</S.Muted>
                      ) : vars.map(v => {
                        const cell = r?.results?.[v.id]
                        return (
                          <S.FinalRow key={v.id}>
                            <span>{v.name}{v.symbol ? ` (${v.symbol})` : ''}</span>
                            <b>
                              {cell?.error ? '—' : fmt(cell?.value)}
                              {!cell?.error && v.unit ? ` ${v.unit}` : ''}
                            </b>
                          </S.FinalRow>
                        )
                      })}
                    </S.Final>
                  )
                })}
              </S.Finals>

              <S.SubTitle>노드별</S.SubTitle>
              {workflow.order?.map(nodeId => {
                const node = nodeById.get(String(nodeId))
                const r = run.nodes[nodeId]
                if (!node || !r) return null
                const vars = cardVariables[node.card_id] || []
                return (
                  <S.RunRow key={nodeId} $status={r.status}>
                    <S.RunName>{node.alias}</S.RunName>
                    {r.status === STATUS.blocked ? (
                      <S.RunWhy>{r.message}</S.RunWhy>
                    ) : (
                      <S.RunVals>
                        {vars.filter(v => v.category !== 'input').map(v => {
                          const cell = r.results?.[v.id]
                          return (
                            <span key={v.id}>
                              {v.symbol || v.name}={cell?.error ? 'ERR' : fmt(cell?.value)}
                            </span>
                          )
                        })}
                      </S.RunVals>
                    )}
                  </S.RunRow>
                )
              })}

              {/* 기록은 **돌린 뒤에만** 남긴다. 화면에 없는 숫자가 기록으로
                  들어가는 것이 이 기능에서 가장 나쁜 실패다. */}
              <S.SaveBar>
                <S.Value style={{ width: 280 }}
                         value={recordTitle}
                         onChange={(e) => setRecordTitle(e.target.value)}
                         placeholder="무슨 계산인가요? 예: Model X 브래킷" />
                <S.Primary onClick={saveRecord}
                           disabled={saving || !recordTitle.trim()}>
                  {saving ? '저장 중…' : '기록 저장'}
                </S.Primary>
              </S.SaveBar>
            </>
          )}
        </S.Panel>
      )}

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
