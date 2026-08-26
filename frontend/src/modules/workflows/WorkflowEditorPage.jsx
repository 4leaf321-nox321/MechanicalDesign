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

import React, {
  useCallback, useDeferredValue, useEffect, useMemo, useState,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../shared/api/client'
import { validateWorkflow } from '../../shared/utils/workflowValidate'
import { STATUS, runWorkflow, terminalNodes } from '../../shared/utils/workflowEngine'
import { executionBlocks } from '../../shared/utils/scc'
import { cardIdsWithin } from '../../shared/utils/workflowInterface'
import { handleAt, nestedIds, parseSlot, slotsOf } from '../../shared/utils/slots'
import { fmt } from '../../shared/utils/goalSeek'
import AppHeader, { BarButton } from '../../shared/components/AppHeader'
import { useDialog } from '../../shared/components/Dialog'
import RecordPicker from '../../shared/components/RecordPicker'
import HistoryPanel from '../../shared/components/HistoryPanel'
import { describeLoad, mapWorkflowInputs } from './loadWorkflowInputs'
import WorkflowCanvas from './WorkflowCanvas'
import * as S from './editorStyles'

function WorkflowEditorPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { confirm, prompt } = useDialog()

  const [workflow, setWorkflow] = useState(null)
  const [cardVariables, setCardVariables] = useState({})
  const [cards, setCards] = useState([])
  // 자리에 통째로 넣을 수 있는 다른 워크플로들.
  const [allWorkflows, setSubs] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [picking, setPicking] = useState(false)
  const [linking, setLinking] = useState(null)   // { fromNode, fromVar, toNode, toVar }
  const [recordTitle, setRecordTitle] = useState('')
  const [saving, setSaving] = useState(false)
  // 순서도와 표는 **같은 연결을 다르게 보는 것**이다. 자료를 나누지 않고
  // 보는 방법만 바꾼다.
  const [view, setView] = useState('canvas')

  // 아직 못 불러왔을 수 있으니 옵셔널로. 좌표 저장 콜백이 이 값 하나만
  // 의존하게 두면 워크플로가 바뀔 때마다 새로 만들어지지 않는다.
  const wfId = workflow?.id

  // 카드를 고르는 `picking` 과 다른 창이다. 하나는 무엇을 넣을지,
  // 다른 하나는 어떤 값으로 채울지를 고른다.
  const [showHistory, setShowHistory] = useState(false)
  const [loadingRecord, setLoadingRecord] = useState(false)
  const [loadMsg, setLoadMsg] = useState(null)
  // 순서도에서 지금 고른 노드들. 묶을 것이 있는지가 여기서 정해진다.
  const [picked, setPicked] = useState([])

  const load = useCallback(async () => {
    const route = decodeURIComponent(location.pathname)
    const res = await apiFetch(`/workflows/lookup?route=${encodeURIComponent(route)}`)
    if (!res.ok) {
      setError('워크플로를 찾을 수 없습니다.')
      return
    }
    const wf = await res.json()

    // 노드가 쓰는 카드의 변수를 **한 번에** 받는다. 노드마다 따로 부르면 그중
    // 하나가 늦게 와서 화면이 반쯤 그려진 상태로 남는다.
    //
    // 하위 워크플로 **안쪽 카드까지** 모은다. 겉의 노드만 훑으면 중첩 자리의
    // 얼굴을 만들 재료가 없어서, 손잡이 하나 없는 빈 상자가 그려진다.
    const ids = [...cardIdsWithin(wf)]
    let vars = {}
    if (ids.length) {
      const vres = await apiFetch(`/cards/variables?ids=${ids.join(',')}`)
      if (vres.ok) vars = await vres.json()
    }

    // 워크플로와 변수를 **같이** 넣는다. 워크플로만 먼저 넣으면 변수가 없는
    // 한 프레임이 생기고, 그 프레임에서는 모든 배선이 끊어진 것으로 보인다 —
    // 검증이 빨갛게 번쩍이고 계산도 건너뛴다.
    setWorkflow(wf)
    setCardVariables(vars)
  }, [location.pathname])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    // 넣을 수 있는 카드 목록. 내 초안까지 포함해야 방금 만든 카드를 넣을 수 있다.
    apiFetch('/cards?org=' + encodeURIComponent(''))
      .then(r => r.json())
      .then(rows => setCards(Array.isArray(rows) ? rows : []))
      .catch(() => {})

    // 자리에 넣을 수 있는 워크플로 목록.
    //
    // 여기서는 **자기 자신만** 뺀다. 「나를 품고 있는 워크플로」 까지 걸러 내려면
    // 후보를 전부 펼쳐 봐야 하는데, 그건 이 창을 여는 값으로는 너무 비싸다.
    // 서버가 그 순환을 막고 어느 워크플로가 문제인지 이름으로 말해 준다.
    apiFetch('/workflows')
      .then(r => r.json())
      .then(rows => setSubs(Array.isArray(rows) ? rows : []))
      .catch(() => {})
  }, [])

  const issues = useMemo(
    () => (workflow ? validateWorkflow(workflow, cardVariables) : []),
    [workflow, cardVariables],
  )

  /**
   * 값이 바뀌면 **바로 다시 돈다.** 「돌리기」 단추는 두지 않는다.
   *
   * 단추를 두면 화면의 숫자가 지금 값의 결과인지 아까 눌렀을 때의 결과인지
   * 알 수 없다. 파생값으로 두면 어긋날 자리가 아예 없다.
   *
   * ## 계산이 길어지면
   *
   * 단추는 그 답이 못 된다 — 기다리는 시점만 옮길 뿐 빨라지지 않고, 대신
   * 어긋남을 도로 불러온다. 진짜 문제는 **렌더를 막는 것**이라 그쪽을 푼다.
   *
   * 재 본 값(노드마다 배열 연산 몇 개씩):
   *
   *     노드 3개, 스칼라만        0.3ms   ← 지금 쓰는 규모
   *     노드 20개 × 배열 1만개  136ms
   *     노드 100개 × 배열 1만개 675ms   ← 엔진이 허용하는 최악
   *
   * `range` 가 배열을 1만개로 막아 두어 노드당 일은 위가 있다. 그래서 최악도
   * 1초 아래고, 값을 **확정할 때마다** 한 번이지 글자마다가 아니다.
   *
   * `useDeferredValue` 로 계산을 뒤로 미룬다. 브라우저가 바뀐 입력을 먼저
   * 그리고 나서 계산하므로, 오래 걸려도 화면이 멎지 않는다. 그동안 보이는
   * 숫자는 이전 것이라 **낡았다고 표시한다** — 말없이 옛 숫자를 두는 것이
   * 단추를 두는 것과 똑같은 실패다.
   *
   * 오류가 있으면 돌리지 않는다 — 깨진 배선 위에서 나온 숫자를 보여 주는 것이
   * 아무것도 안 보여 주는 것보다 나쁘다.
   */
  const data = useMemo(
    () => ({ workflow, cardVariables }), [workflow, cardVariables])
  const settled = useDeferredValue(data)
  const calculating = settled !== data

  const run = useMemo(() => {
    const wf = settled.workflow
    if (!wf || wf.nodes.length === 0) return null
    // 미뤄 둔 짝으로 검증까지 다시 한다. 지금 것과 섞으면 워크플로와 변수가
    // 어긋난 한순간에 배선이 끊어진 것으로 보인다.
    const bad = validateWorkflow(wf, settled.cardVariables)
      .some(i => i.level === 'error')
    if (bad) return null
    return runWorkflow(wf, settled.cardVariables)
  }, [settled])

  /**
   * 고리를 닫는 선들. 계산기와 **같은 함수**로 찾는다 — 화면이 따로 판단하면
   * 초기값을 넣으라고 표시한 칸과 계산기가 읽는 칸이 서로 달라진다.
   */
  const feedbackIds = useMemo(() => {
    const out = new Set()
    for (const block of executionBlocks(workflow?.nodes, workflow?.links)) {
      for (const link of block.feedback) out.add(String(link.id))
    }
    return out
  }, [workflow?.nodes, workflow?.links])

  /** 어느 입력이 연결로 채워지는가. 편집을 막는 판단의 근거다. */
  const linkedInputs = useMemo(() => {
    const nested = nestedIds(workflow)
    const map = new Map()
    for (const link of workflow?.links || []) {
      map.set(`${link.to_node_id}:${handleAt(link, 'to', nested)}`, link)
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

  /**
   * 자리 하나를 만든다. 카드 한 장이거나 워크플로 통째다.
   *
   * 둘을 **한 길**로 보낸다 — 자리의 나머지(별칭, 좌표, 입력값, 배선)는
   * 완전히 같기 때문이다. 길을 나누면 그 나머지가 두 벌이 된다.
   */
  const addNode = (body) => {
    setPicking(false)
    call(`/workflows/${workflow.id}/nodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  /**
   * 카드를 뺀다. **몇 개의 연결이 함께 끊기는지 먼저 말한다.**
   *
   * 순서도에서는 카드 하나가 여러 선의 출발점일 수 있어서, 하나를 빼면
   * 그림의 절반이 사라지기도 한다. 그것을 누른 뒤에 알게 하면 안 된다.
   *
   * `useCallback` 인 것은 캔버스 노드 자료에 실려 가기 때문이다 —
   * `setInput` 과 같은 이유로, 매번 새로 만들면 렌더가 무한히 돈다.
   */
  const removeNode = useCallback(async (node) => {
    const linked = (workflow?.links || []).filter(
      l => l.from_node_id === node.id || l.to_node_id === node.id).length
    const ok = await confirm({
      title: `'${node.alias}' 를 뺍니다`,
      body: linked
        ? `이 카드에 닿은 연결 ${linked}개도 함께 끊깁니다.`
          + '\n입력값도 사라지고, 되돌릴 수 없습니다.'
        : '입력값도 함께 사라지고, 되돌릴 수 없습니다.',
      confirmLabel: '빼기',
      tone: 'danger',
    })
    if (!ok) return

    setError('')
    const res = await apiFetch(`/workflows/${wfId}/nodes/${node.id}`,
                               { method: 'DELETE' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error || '빼지 못했습니다.')
      return
    }
    await load()
  }, [workflow?.links, wfId, load, confirm])

  /**
   * 입력 하나를 저장한다. 순서도와 표가 **같은 길**을 쓴다.
   *
   * `useCallback` 인 것이 중요하다. 이 함수는 캔버스 노드 자료에 실려 가는데,
   * 매번 새로 만들어지면 노드 자료가 매 렌더마다 바뀐 것으로 보여 캔버스가
   * 자기 상태를 다시 넣고, 그것이 또 렌더를 부른다 — 무한히 돈다.
   */
  const setInput = useCallback(async (node, variableId, value) => {
    setError('')
    const next = { ...(node.inputs || {}), [variableId]: value }
    const res = await apiFetch(`/workflows/${wfId}/nodes/${node.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: next }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error || '값을 저장하지 못했습니다.')
      return
    }
    await load()
  }, [wfId, load])

  const addLink = async () => {
    const { fromNode, fromVar, toNode, toVar } = linking || {}
    if (!fromNode || !fromVar || !toNode || !toVar) {
      setError('네 칸을 모두 고르세요.')
      return
    }
    const body = await call(`/workflows/${workflow.id}/links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // 고른 것은 **자리 이름**이다. 순서도의 손잡이와 같은 글자라, 표에서 이은
      // 연결과 그림에서 이은 연결이 서버에 똑같은 모양으로 도착한다.
      body: JSON.stringify((() => {
        const from = parseSlot(fromVar, fromNode)
        const to = parseSlot(toVar, toNode)
        return {
          from_node_id: Number(fromNode),
          from_inner_node_id: from.inner, from_variable_id: from.variable,
          to_node_id: Number(toNode),
          to_inner_node_id: to.inner, to_variable_id: to.variable,
        }
      })()),
    })
    if (body) {
      setLinking(null)
      setNotice('연결했습니다.')
    }
  }

  const removeLink = async (linkId) => {
    await call(`/workflows/${workflow.id}/links/${linkId}`, { method: 'DELETE' })
  }

  /** 순서도에서 손잡이끼리 이었을 때. 표의 「잇기」와 같은 곳으로 간다. */
  const connectOnCanvas = async (payload) => {
    const body = await call(`/workflows/${workflow.id}/links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (body) setNotice('연결했습니다.')
  }

  /** 옮겨 놓은 자리를 저장한다. 그림이 그 워크플로의 일부가 되도록. */
  const moveNode = useCallback(async (nodeId, at) => {
    // 좌표만 바뀐 것이라 `call` 을 쓰지 않는다. 여기서 화면을 다시 받으면
    // 방금 놓은 자리가 서버 응답으로 한 번 튀어 보이고, 실행 결과도
    // 까닭 없이 지워진다.
    await apiFetch(`/workflows/${wfId}/nodes/${nodeId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        layout_x: Math.round(at.x), layout_y: Math.round(at.y),
      }),
    })
  }, [wfId])

  /**
   * 자동 배치한 좌표를 한 번만 저장한다.
   *
   * 저장하지 않으면 열 때마다 다시 계산되므로, 사람이 옮겨 둔 자리가
   * 다음에 열 때 사라진 것처럼 보인다.
   */
  const persistLayout = useCallback(async (positions) => {
    const entries = Object.entries(positions || {})
    if (entries.length === 0) return
    await Promise.all(entries.map(([id, at]) => moveNode(id, at)))
  }, [moveNode])

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
    const loops = []
    const seen = new Set()
    for (const node of workflow.nodes) {
      const r = run.nodes[node.id]
      if (!r) continue
      inputs[node.id] = r.values || {}
      results[node.id] = r.results || {}

      // 고리 하나에 한 줄. 블록 안 노드는 같은 반복 정보를 갖고 있다.
      if (!r.loop?.converged) continue
      const tag = `${r.loop.iterations}:${r.loop.residual}`
      if (seen.has(tag)) { loops[loops.length - 1].node_ids.push(node.id); continue }
      seen.add(tag)
      loops.push({
        node_ids: [node.id],
        iterations: r.loop.iterations,
        residual: r.loop.residual,
      })
    }

    const res = await apiFetch('/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflow_id: workflow.id, title: recordTitle, inputs, results,
        // **반복 횟수만으로는 아무 말도 못 한다.** 10회가 좋은 것인지는
        // 그때의 허용오차와 완화계수를 알아야 정해지고, 그 값들은
        // 나중에 바뀐다. 그래서 기준을 함께 박아 둔다.
        run_meta: loops.length ? {
          loops,
          iteration: {
            tolerance: workflow.iter_tolerance,
            max: workflow.iter_max,
            relaxation: workflow.iter_relaxation,
          },
        } : undefined,
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

  /**
   * 지난 기록의 입력값을 지금 워크플로에 채운다.
   *
   * 노드마다 따로 저장하므로 **한 번에 보내고 한 번만 다시 읽는다.** 노드마다
   * `call` 을 쓰면 저장할 때마다 화면을 다시 받아, 다섯 노드짜리 워크플로가
   * 다섯 번 깜빡인다.
   */
  const loadInputs = async (record) => {
    const mapped = mapWorkflowInputs(record, workflow, cardVariables, feedbackIds)
    setLoadingRecord(false)
    setError('')

    const writes = Object.entries(mapped.byNode)
    for (const [nodeId, values] of writes) {
      const node = nodeById.get(String(nodeId))
      const next = { ...(node?.inputs || {}), ...values }
      const res = await apiFetch(`/workflows/${wfId}/nodes/${nodeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: next }),
      })
      if (!res.ok) {
        setError('값을 저장하지 못했습니다.')
        return
      }
    }
    await load()

    const said = describeLoad(mapped)
    setLoadMsg({ ...said, text: `'${record.title}' — ${said.text}` })
  }

  /**
   * 고른 노드를 한 상자로 묶는다.
   *
   * **계산에는 아무 영향이 없다.** 실행 순서는 배선이 정하고 묶음은 사람이
   * 보기 좋으라고 두는 것이다. 묶었더니 답이 달라진다면 그림이 계산을
   * 건드린 것이고, 그게 이 기능에서 가장 나쁜 실패다.
   */
  const groupPicked = async () => {
    const name = await prompt({
      title: `카드 ${picked.length}장을 묶습니다`,
      body: '순서도에서 한 상자로 두릅니다.'
        + '\n계산에는 아무 영향이 없습니다 — 실행 순서는 배선이 정합니다.',
      placeholder: '예: 관로 계열',
      initial: '계열',
      confirmLabel: '묶기',
    })
    if (name === null) return
    await call(`/workflows/${workflow.id}/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, node_ids: picked }),
    })
    setPicked([])
  }

  /** 묶음을 푼다. **노드는 남는다** — 상자만 걷어내는 일이다. */
  const ungroup = async (group) => {
    const ok = await confirm({
      title: `'${group.name}' 묶음을 풉니다`,
      body: '상자만 사라집니다. 카드와 연결은 그대로 있습니다.',
      confirmLabel: '풀기',
    })
    if (!ok) return
    await call(`/workflows/${workflow.id}/groups/${group.id}`,
               { method: 'DELETE' })
  }

  /** 반복 기준. 서버가 범위를 막으므로 여기서는 보내고 답을 그대로 보여 준다. */
  const setIteration = async (patch) => {
    await call(`/workflows/${workflow.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
  }

  const publish = async () => {
    const ok = await confirm({
      title: `'${workflow.name}' 을(를) 게시합니다`,
      body: '게시하면 조직에 올릴 수 있게 됩니다.'
        + '\n검증에 오류가 없는지 확인하셨나요?',
      confirmLabel: '게시하기',
    })
    if (!ok) return
    const body = await call(`/workflows/${workflow.id}/publish`, { method: 'POST' })
    if (body) setNotice('게시했습니다.')
  }

  // 못 불러온 화면에도 머리띠는 남긴다. 여기서 사라지면 홈으로 돌아갈 길이
  // 없어서 뒤로 가기 말고는 방법이 없다.
  const shell = (inner) => (
    <S.Page>
      <AppHeader title="워크플로" onHome={() => navigate('/')} />
      <S.Wrap>{inner}</S.Wrap>
    </S.Page>
  )
  if (error && !workflow) return shell(<S.Error>{error}</S.Error>)
  if (!workflow) return shell(<S.Muted>불러오는 중…</S.Muted>)

  const nodeById = new Map(workflow.nodes.map(n => [String(n.id), n]))
  const errors = issues.filter(i => i.level === 'error')
  const warnings = issues.filter(i => i.level === 'warning')
  const hasLoop = feedbackIds.size > 0

  // 고리마다 한 줄만. 블록 안 노드는 같은 반복 정보를 갖고 있어서, 노드마다
  // 찍으면 같은 말이 여러 번 나온다.
  const loopRuns = []
  const seenLoops = new Set()
  for (const node of workflow.nodes) {
    const loop = run?.nodes?.[node.id]?.loop
    if (!loop?.converged) continue
    const tag = `${loop.iterations}:${loop.residual}`
    if (seenLoops.has(tag)) continue
    seenLoops.add(tag)
    loopRuns.push({ node, loop })
  }

  // 카드 자리든 워크플로 자리든 **같은 모양**으로 받는다. 노드 종류마다 길이
  // 갈리면, 한쪽에만 중첩을 붙였을 때 다른 쪽은 그 노드를 빈 칸으로 그린다.
  const outputsOf = (nodeId) =>
    slotsOf(nodeById.get(String(nodeId)), cardVariables, 'output')
  const inputsOf = (nodeId) =>
    slotsOf(nodeById.get(String(nodeId)), cardVariables, 'input')

  const subs = allWorkflows.filter(w => w.id !== workflow.id)

  /** 순서도 위에 얹을 단추. 표 보기에서는 아래쪽에 같은 것이 놓인다. */
  const tools = (
    <S.Tools>
      {/* 「카드 넣기」 가 아니다 — 워크플로도 자리에 놓인다. 단추가 한쪽만
          말하면 나머지 하나는 아무도 못 찾는다. */}
      <S.ToolButton onClick={() => setPicking(!picking)}>
        ＋ 넣기
      </S.ToolButton>
      {/* 고른 것이 둘 이상일 때만 뜬다. 하나짜리 상자는 그릴 값이 없다. */}
      {picked.length >= 2 && (
        <S.ToolButton onClick={groupPicked}>
          ▢ {picked.length}개 묶기
        </S.ToolButton>
      )}
      {/* 이미 있는 묶음은 여기서 푼다. 상자를 눌러 풀게 하면, 상자를 잘못
          눌렀을 때 묶음이 사라진다. */}
      {(workflow.groups || []).map(g => (
        <S.ToolButton key={g.id} onClick={() => ungroup(g)}
                      title="이 묶음을 풉니다 (카드는 남습니다)">
          ▢ {g.name} 풀기
        </S.ToolButton>
      ))}
      {picking && (
        <S.Picker style={{ width: 260, marginTop: 0 }}>
          <S.PickerHead>카드 한 장</S.PickerHead>
          {cards.length === 0 && <S.Muted>넣을 수 있는 카드가 없습니다.</S.Muted>}
          {cards.map(c => (
            <S.PickItem key={c.id} onClick={() => addNode({ card_id: c.id })}>
              {c.name}
              {c.status === 'draft' && <S.DraftTag>초안</S.DraftTag>}
            </S.PickItem>
          ))}
          {/* 워크플로도 자리에 놓인다. 여러 워크플로에 되풀이해 나오는 앞단
              계산을 한 번만 그려 두고 **참조**로 쓰기 위한 것이다 — 복제가
              아니라서, 그 워크플로를 고치면 쓰는 데가 모두 따라 바뀐다. */}
          <S.PickerHead style={{ marginTop: 10 }}>워크플로 통째로</S.PickerHead>
          {/* 카드와 같은 규칙이라 이유를 함께 적는다 — 방금 만든 것이 목록에
              없으면 사람은 기능이 고장 난 줄 안다. */}
          {subs.length === 0 && (
            <S.Muted>게시된 워크플로만 넣을 수 있습니다.</S.Muted>
          )}
          {subs.map(w => (
            <S.PickItem key={`w${w.id}`}
                        onClick={() => addNode({ sub_workflow_id: w.id })}>
              ▣ {w.name}
            </S.PickItem>
          ))}
          <S.Small onClick={() => setPicking(false)}>닫기</S.Small>
        </S.Picker>
      )}
    </S.Tools>
  )

  return (
    <S.Page>
      {/* 다른 화면과 같은 머리띠. 여기만 없어서 들어오면 홈으로 갈 길이
          사라지고, 띠 높이가 달라 같은 앱이 아닌 것처럼 보였다. */}
      <AppHeader
        title={workflow.name}
        subtitle={`카드 ${workflow.nodes.length}장 · 연결`
          + ` ${workflow.links.length}개`
          + (workflow.status === 'draft' ? ' · 초안 (나만 보임)' : '')}
        onHome={() => navigate('/')}
        right={(
          <>
            <BarButton onClick={() => { setLoadMsg(null); setLoadingRecord(true) }}
                       disabled={workflow.nodes.length === 0}>
              이전 입력 불러오기
            </BarButton>
            <BarButton onClick={() => navigate(`/records?workflow_id=${workflow.id}`)}>
              계산 기록
            </BarButton>
            {/* 「답이 어제와 다른데 아무도 손댄 기억이 없다」 를 되짚는 자리.
                카드와 같은 판을 쓴다. */}
            <BarButton onClick={() => setShowHistory(true)}>
              변경 이력
            </BarButton>
            {workflow.status === 'draft' && (
              <BarButton onClick={publish} disabled={workflow.nodes.length === 0}>
                게시하기
              </BarButton>
            )}
          </>
        )}
      />

      <S.Wrap>
        {/* 이름과 단추는 머리띠로 갔다. 여기 남은 것은 **무엇을 보고 있는가** 뿐이라
            한 줄을 통째로 쓰지 않고 오른쪽에 붙인다. */}
        <S.Head>
          <S.ViewTabs style={{ marginLeft: 'auto' }}>
            <S.ViewTab $on={view === 'canvas'} onClick={() => setView('canvas')}>
              순서도
            </S.ViewTab>
            <S.ViewTab $on={view === 'table'} onClick={() => setView('table')}>
              표
            </S.ViewTab>
          </S.ViewTabs>
        </S.Head>

        {error && <S.Error>{error}</S.Error>}
        {notice && <S.Notice onClick={() => setNotice('')}>{notice}</S.Notice>}
        {/* 무엇을 채웠고 무엇이 빠졌는지. 조용한 성공보다 시끄러운 성공이 낫다. */}
        {loadMsg && (
          <S.Issue $level={loadMsg.warn ? 'warning' : 'info'}
                   style={{ marginTop: 0, marginBottom: 12, cursor: 'pointer' }}
                   onClick={() => setLoadMsg(null)}>
            {loadMsg.text}
          </S.Issue>
        )}

        {loadingRecord && (
          <RecordPicker
            query={{ workflow_id: workflow.id }}
            note={<>고른 기록의 <b>입력값만</b> 채웁니다. 연결로 들어오는 칸은 앞 노드가 덮으므로 건너뛰고, <b>되먹임 초기 추정값</b>은 사람이 정하는 값이라 그대로 가져옵니다.</>}
            onPick={loadInputs}
            onClose={() => setLoadingRecord(false)}
          />
        )}

        {showHistory && (
          <HistoryPanel
            kind="workflow"
            cardId={workflow.id}
            cardName={workflow.name}
            onClose={() => setShowHistory(false)}
          />
        )}

        <S.Split>
          {/* --- 왼쪽: 계산 흐름 ------------------------------------------- */}
          <S.Main>
            {view === 'canvas' && (
              workflow.nodes.length === 0 ? (
                <S.Empty>
                  <div>아직 비어 있습니다.</div>
                  {tools}
                </S.Empty>
              ) : (
                <>
                  <WorkflowCanvas
                    workflow={workflow}
                    cardVariables={cardVariables}
                    run={run}
                    tools={tools}
                    stale={calculating}
                    onConnect={connectOnCanvas}
                    onInput={setInput}
                    onRemove={removeNode}
                    onDisconnect={removeLink}
                    onMove={moveNode}
                    onRelayout={persistLayout}
                    onSelect={setPicked}
                  />
                  <S.CanvasHint>
                    값을 고치면 <b>바로 다시 계산</b>됩니다. <b>결과</b> 손잡이에서
                    끌어다 다른 카드의 <b>입력</b> 손잡이에 놓으면 이어지고, 선을
                    고른 뒤 Delete 를 누르면 끊깁니다. 자리를 빼려면 <b>✕</b>.
                  </S.CanvasHint>
                </>
              )
            )}

            {view === 'table' && (
              <S.Scroll>
                <S.SectionTitle style={{ marginTop: 0 }}>노드</S.SectionTitle>
                {workflow.nodes.length === 0 && (
                  <S.Muted>아직 비어 있습니다. 카드나 워크플로를 넣으면 여기에 놓입니다.</S.Muted>
                )}

                {workflow.nodes.map(node => (
                  <S.Node key={node.id}
                          $bad={node.card_deleted || node.sub_workflow_deleted}>
                    <S.NodeHead>
                      <S.NodeName>{node.alias}</S.NodeName>
                      {/* 카드 한 장인지 워크플로 통째인지. 표에서도 구분이
                          되어야 「고치러 어디를 열까」 가 읽힌다. */}
                      <S.NodeCard>
                        {node.sub_workflow_id
                          ? `▣ ${node.sub_workflow_name}`
                          : node.card_name}
                      </S.NodeCard>
                      {node.card_deleted && <S.Bad>카드가 휴지통에 있습니다</S.Bad>}
                      {node.sub_workflow_deleted && (
                        <S.Bad>워크플로가 휴지통에 있습니다</S.Bad>
                      )}
                      <S.Small onClick={() => removeNode(node)}>빼기</S.Small>
                    </S.NodeHead>

                    <S.Inputs>
                      {inputsOf(node.id).length === 0 && (
                        <S.Muted>여기에는 채울 입력이 없습니다.</S.Muted>
                      )}
                      {inputsOf(node.id).map(v => {
                        const link = linkedInputs.get(`${node.id}:${v.key}`)
                        const stored = (node.inputs || {})[v.key]
                        return (
                          <S.InputRow key={v.key}>
                            <S.VarName>
                              {v.label}
                              {v.unit ? <S.Unit>{v.unit}</S.Unit> : null}
                            </S.VarName>
                            {link && !feedbackIds.has(String(link.id)) ? (
                              // **연결된 칸은 편집하지 않는다.** 고칠 수 있는데 앞
                              // 노드 값에 덮여 무시되는 것이 가장 나쁜 실패다.
                              // 되먹임만 예외다 — 거기 적힌 숫자는 앞 노드가
                              // 덮는 값이 아니라 고리가 출발하는 값이다.
                              <S.Linked>
                                ← {nodeById.get(String(link.from_node_id))?.alias}
                                .{link.from_label}
                              </S.Linked>
                            ) : (
                              <S.Value
                                defaultValue={stored ?? ''}
                                placeholder="값"
                                onBlur={(e) => {
                                  const next = e.target.value
                                  if (String(stored ?? '') !== next) {
                                    setInput(node, v.key, next)
                                  }
                                }}
                              />
                            )}
                          </S.InputRow>
                        )
                      })}
                    </S.Inputs>
                  </S.Node>
                ))}

                {tools}

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
                      <b>{nodeById.get(String(link.from_node_id))?.alias}</b>
                      .{link.from_label}
                      {'  →  '}
                      <b>{nodeById.get(String(link.to_node_id))?.alias}</b>
                      .{link.to_label}
                    </span>
                    <S.Small onClick={() => removeLink(link.id)}>끊기</S.Small>
                  </S.Link>
                ))}

                {workflow.nodes.length >= 2 && (
                  linking ? (
                    <S.LinkForm>
                      <S.Select
                        value={linking.fromNode || ''}
                        onChange={(e) => setLinking({
                          ...linking, fromNode: e.target.value, fromVar: '',
                        })}>
                        <option value="">보내는 노드</option>
                        {workflow.nodes.map(n => (
                          <option key={n.id} value={n.id}>{n.alias}</option>
                        ))}
                      </S.Select>
                      <S.Select
                        value={linking.fromVar || ''} disabled={!linking.fromNode}
                        onChange={(e) => setLinking({ ...linking, fromVar: e.target.value })}>
                        <option value="">보내는 값 (결과)</option>
                        {outputsOf(linking.fromNode).map(v => (
                          <option key={v.key} value={v.key}>
                            {v.label}{v.unit ? ` [${v.unit}]` : ''}
                          </option>
                        ))}
                      </S.Select>
                      <span>→</span>
                      <S.Select
                        value={linking.toNode || ''}
                        onChange={(e) => setLinking({
                          ...linking, toNode: e.target.value, toVar: '',
                        })}>
                        <option value="">받는 노드</option>
                        {workflow.nodes.map(n => (
                          <option key={n.id} value={n.id}>{n.alias}</option>
                        ))}
                      </S.Select>
                      <S.Select
                        value={linking.toVar || ''} disabled={!linking.toNode}
                        onChange={(e) => setLinking({ ...linking, toVar: e.target.value })}>
                        <option value="">받는 입력</option>
                        {inputsOf(linking.toNode)
                          // 이미 연결된 입력은 고를 수 없다. 한 입력에는 하나만 이어진다.
                          .filter(v => !linkedInputs.has(`${linking.toNode}:${v.key}`))
                          .map(v => (
                            <option key={v.key} value={v.key}>
                              {v.label}{v.unit ? ` [${v.unit}]` : ''}
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
              </S.Scroll>
            )}
          </S.Main>

          {/* --- 오른쪽: 검증과 결과 --------------------------------------- */}
          <S.Side>
            {/* 검증이 먼저 온다. 카드는 살아 있는 참조라, 그림이 멀쩡해 보여도
                가리키던 변수가 사라져 있을 수 있다. */}
            <S.Panel>
              <S.PanelHead>
                검증
                {errors.length > 0 && <S.Bad>오류 {errors.length}</S.Bad>}
                {warnings.length > 0 && <S.Warn>경고 {warnings.length}</S.Warn>}
                {issues.length === 0 && <S.Good>문제 없음</S.Good>}
              </S.PanelHead>
              {issues.map((issue, i) => (
                <S.Issue key={i} $level={issue.level}>
                  {issue.message}
                </S.Issue>
              ))}
            </S.Panel>

            {/* 반복이 없는 워크플로에는 보이지 않는다. 안 쓰는 손잡이를 늘어놓으면
                쓰는 손잡이가 묻힌다. */}
            {hasLoop && (
              <S.Panel>
                <S.PanelHead>반복 기준</S.PanelHead>
                <S.Muted style={{ padding: '4px 0 6px' }}>
                  서로 물린 값을 수렴할 때까지 돌립니다. 안 잡히면 완화계수를
                  낮춰 보세요 — 보폭이 줄어 튀는 고리가 잡힙니다.
                </S.Muted>
                <S.Knob>
                  허용오차
                  <input type="number" step="1e-6" min="1e-12" max="0.1"
                         defaultValue={workflow.iter_tolerance}
                         key={`tol-${workflow.iter_tolerance}`}
                         onBlur={(e) => setIteration(
                           { iter_tolerance: Number(e.target.value) })} />
                </S.Knob>
                <S.Knob>
                  최대 반복
                  <input type="number" step="10" min="1" max="500"
                         defaultValue={workflow.iter_max}
                         key={`max-${workflow.iter_max}`}
                         onBlur={(e) => setIteration(
                           { iter_max: Number(e.target.value) })} />
                </S.Knob>
                <S.Knob>
                  완화계수 ω
                  <input type="number" step="0.1" min="0.01" max="2"
                         defaultValue={workflow.iter_relaxation}
                         key={`w-${workflow.iter_relaxation}`}
                         onBlur={(e) => setIteration(
                           { iter_relaxation: Number(e.target.value) })} />
                </S.Knob>
              </S.Panel>
            )}

            {workflow.nodes.length > 0 && (
              <S.Panel>
                <S.PanelHead>
                  결과
                  {calculating && <S.Warn>다시 계산 중…</S.Warn>}
                </S.PanelHead>

                {errors.length > 0 && (
                  <S.Muted>검증 오류를 먼저 고쳐야 계산됩니다.</S.Muted>
                )}

                {run?.nodes && (
                  <>
                    {/* 결론만 크게. 노드마다의 숫자는 순서도가 이미 제자리에서
                        보여 주므로 여기서 되풀이하지 않는다. */}
                    <S.Finals>
                      {terminalNodes(workflow).map(node => {
                        const r = run.nodes[node.id]
                        // 중간값은 결론이 아니다. 중첩 자리는 얼굴이 이미
                        // 결론만 내놓으므로 걸러 낼 것이 없다.
                        const vars = slotsOf(node, cardVariables, 'output')
                          .filter(v => v.category !== 'intermediate')
                        return (
                          <S.Final key={node.id} $bad={r?.status !== STATUS.ok}>
                            <S.FinalName>{node.alias}</S.FinalName>
                            {r?.status === STATUS.blocked ? (
                              <S.Muted>{r.message}</S.Muted>
                            ) : vars.length === 0 ? (
                              <S.Muted>결과값이 없습니다.</S.Muted>
                            ) : vars.map(v => {
                              const cell = r?.results?.[v.key]
                              return (
                                <S.FinalRow key={v.key}>
                                  <span>{v.label}</span>
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

                    {/* 몇 번 돌려 어디까지 좁혀졌는지. 이 줄이 없으면 화면의
                        숫자가 수렴한 값인지 한 번 계산한 값인지 알 수 없다. */}
                    {loopRuns.map(({ node, loop }) => (
                      <S.LoopLine key={node.id}>
                        <b>↺ {node.alias}</b>
                        <span>{loop.iterations}회 반복</span>
                        <span>잔차 {loop.residual?.toExponential(1)}</span>
                      </S.LoopLine>
                    ))}

                    {/* 화면에 보이는 숫자를 그대로 남긴다. 화면에 없는 숫자가
                        기록으로 들어가는 것이 이 기능에서 가장 나쁜 실패다. */}
                    <S.SaveBar>
                      <S.Value style={{ flex: 1, minWidth: 130 }}
                               value={recordTitle}
                               onChange={(e) => setRecordTitle(e.target.value)}
                               placeholder="무슨 계산인가요?" />
                      {/* 낡은 숫자를 기록으로 남기면 안 된다. 그 기록은 어떤
                          입력의 결과인지 영영 알 수 없어진다. */}
                      <S.Primary onClick={saveRecord}
                                 disabled={saving || calculating || !recordTitle.trim()}>
                        {saving ? '저장 중…' : '기록 저장'}
                      </S.Primary>
                    </S.SaveBar>
                  </>
                )}
              </S.Panel>
            )}
          </S.Side>
        </S.Split>
      </S.Wrap>
    </S.Page>
  )
}

export default WorkflowEditorPage
