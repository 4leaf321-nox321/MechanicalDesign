/**
 * 워크플로 실행 — 순서대로 카드를 돌리고 값을 다음 카드로 옮긴다.
 *
 * 계산 절차는 `calcEngine` 하나가 안다. 여기가 하는 일은 **순서와 배선**뿐이다 —
 * 계산을 여기서 다시 구현하면 카드 화면과 워크플로가 다른 답을 내는 날이 오고,
 * 그 어긋남은 원인을 찾기가 아주 어렵다.
 *
 * ## 앞이 실패하면 뒤를 계산하지 않는다
 *
 * 이것이 이 파일에서 가장 중요한 규칙이다. 앞 노드가 실패했는데 뒤 노드를 그냥
 * 돌리면, 빠진 입력이 **기본값(대개 0)** 으로 채워져 계산이 멀쩡히 돈다. 숫자도
 * 그럴듯하게 나온다. 그 카드를 연 사람은 그것이 진짜 결과인 줄 안다.
 *
 * 그래서 막힌 노드는 계산하지 않고 `blocked` 로 두고, **무엇 때문에 막혔는지**
 * 를 함께 남긴다. 이유를 안 남기면 사람은 그 노드를 열어 입력을 채우려 들고,
 * 정작 고쳐야 할 곳은 앞 노드다.
 *
 * ## 서로 물고 있는 노드들 — 반복 블록
 *
 * 순환은 이제 거절이 아니라 **묶음**이다(`scc.js`). 서로 물고 있는 노드들을 한
 * 블록으로 묶으면 블록끼리는 순환이 없어 위 규칙이 그대로 산다. 블록 안에서만
 * 축차대입으로 돌린다(`iterate.js`).
 *
 * 여기서 지키는 것 하나: **수렴하지 못한 블록은 통째로 `failed` 다.** 마지막
 * 값을 답처럼 돌려주지 않는다. 그렇게 두면 위의 규칙이 저절로 뒤 노드를 막아
 * 주므로, 반복을 위해 새 규칙을 만들 필요가 없다.
 *
 * ## 자리에 워크플로가 놓일 수 있다
 *
 * 그러면 이 함수가 자기를 부른다. 하위 워크플로를 돌리고, 그 **얼굴**만
 * (`workflowInterface`) 바깥으로 내놓는다 — 안쪽 중간값까지 내보내면 다른
 * 워크플로가 그 속을 들여다보게 되고, 안을 고칠 때마다 바깥이 깨진다.
 *
 * 안쪽 자리는 `노드:변수` 로 적는다. 변수 id 만으로는 못 짚는다 — 같은 카드가
 * 안에서 두 자리에 놓이면 변수 id 가 똑같기 때문이다.
 */

import { calculateCard } from './calcEngine'
import { executionBlocks } from './scc'
import { DEFAULTS, OUTCOME, fixedPoint } from './iterate'
import { workflowInterface } from './workflowInterface'

export const STATUS = {
  ok: 'ok',
  blocked: 'blocked',   // 앞 노드가 값을 못 줘서 돌리지 않았다
  failed: 'failed',     // 돌렸는데 이 노드 안에서 계산이 실패했다
}

/** 반복 설정. 워크플로에 저장된 값이 있으면 그것을, 없으면 기본값을. */
function iterationSettings(workflow) {
  const pick = (v, fallback) => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : fallback
  }
  return {
    relTolerance: pick(workflow?.iter_tolerance, DEFAULTS.relTolerance),
    absTolerance: DEFAULTS.absTolerance,
    maxIterations: pick(workflow?.iter_max, DEFAULTS.maxIterations),
    relaxation: pick(workflow?.iter_relaxation, DEFAULTS.relaxation),
  }
}

/** 하위 워크플로 안의 한 자리. 변수 id 만으로는 못 짚는다. */
export function slot(innerNodeId, variableId) {
  return `${innerNodeId}:${variableId}`
}

/** 이 노드에서 그 배선이 닿는 칸의 이름. 카드면 변수 id, 워크플로면 안쪽 자리. */
function keyFor(node, link, side) {
  const variableId = link[`${side}_variable_id`]
  if (!node?.sub_workflow) return variableId
  return slot(link[`${side}_inner_node_id`] ?? node.id, variableId)
}

/** 저장된 입력에서 숫자 하나. 키가 문자열일 수도 숫자일 수도 있다. */
function storedValue(node, variableId, overrides) {
  const raw = (overrides?.[node.id] || {})[variableId]
    ?? (node.inputs || {})[variableId]
    ?? (node.inputs || {})[String(variableId)]
  if (raw === null || raw === undefined || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/**
 * @param workflow      `{ nodes, links }` — 서버가 준 그대로
 * @param cardVariables `{ [cardId]: [variable, ...] }`
 * @param overrides     `{ [nodeId]: { [variableId]: 값 } }` — 화면에서 임시로 바꾼 값.
 *                      저장된 입력보다 우선하고, **연결보다는 뒤진다.**
 * @param depth         중첩된 층. 하위 워크플로를 돌 때 자기가 올린다.
 */
//: 펼칠 수 있는 깊이. 순환은 막지만 깊이 자체가 실수일 수 있다.
const MAX_DEPTH = 12

export function runWorkflow(workflow, cardVariables, overrides = {}, depth = 0) {
  const nodes = workflow?.nodes || []
  const links = workflow?.links || []
  const settings = iterationSettings(workflow)

  const nodeById = new Map(nodes.map(n => [String(n.id), n]))
  // 들어오는 배선을 목적지 기준으로 모은다. 노드마다 전체 목록을 훑으면
  // 노드 수 × 연결 수가 되고, 배선이 많은 워크플로에서 눈에 띄게 느려진다.
  const incoming = new Map()
  for (const link of links) {
    const key = String(link.to_node_id)
    if (!incoming.has(key)) incoming.set(key, [])
    incoming.get(key).push(link)
  }

  const blocks = executionBlocks(nodes, links)
  const out = {}

  /** 이 노드의 입력을 모은다. `resolve` 가 연결값을 어디서 가져올지 정한다. */
  const gather = (node, resolve) => {
    // 저장된 값 → 화면에서 바꾼 값 → 연결로 들어온 값 순으로 덮는다.
    // **연결이 마지막인 것이 중요하다.** 앞 노드가 방금 계산한 값이 손으로 적어
    // 둔 값보다 최신이고, 그렇지 않으면 배선이 있으나 마나 해진다.
    const values = { ...(node.inputs || {}), ...(overrides[node.id] || {}) }
    const blockedBy = []

    for (const link of incoming.get(String(node.id)) || []) {
      const source = nodeById.get(String(link.from_node_id))
      const sourceName = source ? source.alias : `노드 ${link.from_node_id}`
      const got = resolve(link)

      if (got?.blocked) {
        blockedBy.push(`'${sourceName}' 이(가) 계산되지 않았습니다`)
        continue
      }
      if (got?.error) {
        blockedBy.push(
          `'${sourceName}' 의 ${link.from_label || '값'} 을(를) 구하지 못했습니다`
          + ` (${got.error})`)
        continue
      }
      values[keyFor(node, link, 'to')] = got.value
    }
    return { values, blockedBy }
  }

  /** 이미 끝난 블록에서 값을 꺼낸다. */
  const fromFinished = (link) => {
    const from = out[link.from_node_id]
    if (!from || from.status !== STATUS.ok) return { blocked: true }
    const source = nodeById.get(String(link.from_node_id))
    const result = from.results[keyFor(source, link, 'from')]
    if (!result || result.error) return { error: result?.error || '값 없음' }
    return { value: result.value }
  }

  const calculate = (node, values) => {
    if (node.sub_workflow) return runNested(node, values)

    const variables = cardVariables?.[node.card_id] || []
    const { results } = calculateCard(variables, values)
    const failed = Object.entries(results).filter(([, r]) => r && r.error)
    return {
      status: failed.length ? STATUS.failed : STATUS.ok,
      values,
      results,
      // 실패한 칸이 있어도 **나머지 결과는 남긴다.** 한 칸이 안 나왔다고 그
      // 노드에서 나온 다른 값까지 감추면, 뒤 노드가 왜 막혔는지 읽을 수 없다.
      message: failed.length
        ? `계산되지 않은 값이 ${failed.length}개 있습니다.`
        : '',
    }
  }

  /** 실패한 칸 하나를 이름과 사유로. 여럿이면 첫 칸만 — 나머지는 대개 딸림이다. */
  const why = (node, done) => {
    const variables = cardVariables?.[node.card_id] || []
    const named = new Map(variables.map(v => [String(v.id), v.symbol || v.name]))
    const broken = Object.entries(done.results)
      .filter(([, r]) => r && r.error)
      .map(([id, r]) => `${named.get(String(id)) || id}: ${r.error}`)
    return broken.length > 1
      ? `${broken[0]} (외 ${broken.length - 1}개)`
      : (broken[0] || done.message)
  }

  /**
   * 자리에 놓인 워크플로를 돌린다.
   *
   * 밖에서 들어온 값(`values`)은 `노드:변수` 로 적혀 있다. 그것을 안쪽
   * `overrides` 모양으로 풀어 넣고, 나온 결과 중 **얼굴에 있는 것만** 다시
   * `노드:변수` 로 싸서 내놓는다.
   *
   * 안이 하나라도 안 풀리면 이 자리는 실패다. 그러면 「앞이 실패하면 뒤는
   * 계산하지 않는다」 는 규칙이 바깥에서 저절로 이어진다 — 반복 블록 때와
   * 같은 이유로 새 규칙을 만들 필요가 없다.
   */
  const runNested = (node, values) => {
    if (depth >= MAX_DEPTH) {
      return {
        status: STATUS.failed, values, results: {},
        message: `워크플로가 ${MAX_DEPTH}겹보다 깊습니다. `
          + '이쯤이면 사람이 읽을 수 있는 물건이 아닙니다.',
      }
    }

    const { inputs, outputs } = workflowInterface(node.sub_workflow, cardVariables)

    // 얼굴의 자리 이름은 **맨 안쪽** 노드를 가리킨다. 두 겹 넘게 들어가면 그
    // 노드가 바로 아래 층에 없으므로, 어느 자식을 거쳐 가야 하는지를 얼굴이
    // 함께 들고 있는 `outerNodeId` 로 되짚는다. 이것 없이 곧장 넣으면 값이
    // 아무 데도 안 닿고 **오류도 안 난다** — 조용히 옛 값으로 계산된다.
    const through = new Map()
    for (const face of inputs) through.set(String(face.nodeId), face.outerNodeId)

    const inner = {}
    for (const [key, value] of Object.entries(values)) {
      const [innerNodeId, variableId] = String(key).split(':')
      if (variableId === undefined) continue
      const child = String(through.get(innerNodeId) ?? innerNodeId)
      if (!inner[child]) inner[child] = {}
      // 자식이 곧 그 노드면 변수 id 로, 더 아래면 자리 이름 그대로 넘긴다.
      inner[child][child === innerNodeId ? variableId : key] = value
    }

    const ran = runWorkflow(node.sub_workflow, cardVariables, inner, depth + 1)

    // 얼굴에 있는 것만 내놓는다. 안쪽 중간값까지 내보내면 다른 워크플로가
    // 그 속을 들여다보게 되고, 안을 고칠 때마다 바깥이 깨진다.
    const results = {}
    for (const face of outputs) {
      const child = String(face.outerNodeId ?? face.nodeId)
      const key = child === String(face.nodeId)
        ? face.variableId
        : slot(face.nodeId, face.variableId)
      const cell = ran.nodes?.[child]?.results?.[key]
      if (cell) results[slot(face.nodeId, face.variableId)] = cell
    }

    const broken = Object.values(ran.nodes || {})
      .filter(r => r.status !== STATUS.ok)
    if (broken.length) {
      return {
        status: STATUS.failed, values, results,
        // 안에서 무엇이 왜 막혔는지 그대로 올린다. 「하위 워크플로 실패」
        // 만으로는 어느 카드를 열어야 하는지 알 수 없다.
        message: `'${node.alias}' 안에서 ${broken.length}개가 계산되지`
          + ` 않았습니다 — ${broken[0].message}`,
        inner: ran,
      }
    }

    return { status: STATUS.ok, values, results, message: '', inner: ran }
  }

  const trashed = (node) => ({
    status: STATUS.blocked,
    message: node?.sub_workflow_deleted
      ? '이 자리의 워크플로가 휴지통에 있습니다.'
      : '이 노드의 카드가 휴지통에 있습니다.',
    values: {}, results: {},
  })

  const blockedResult = (values, blockedBy) => ({
    status: STATUS.blocked,
    blockedBy,
    // 앞에서 막힌 것이지 이 노드가 잘못된 것이 아니다. 그 구분을 안 하면
    // 사람은 이 노드의 입력을 채우려 들고, 고쳐야 할 곳은 앞이다.
    message: `앞 노드 때문에 계산하지 않았습니다 — ${blockedBy.join(', ')}`,
    values, results: {},
  })

  // --- 한 번만 도는 블록 ---------------------------------------------------------
  const runOnce = (node) => {
    if (node.card_deleted || node.sub_workflow_deleted) {
      out[node.id] = trashed(node)
      return
    }
    const { values, blockedBy } = gather(node, fromFinished)
    out[node.id] = blockedBy.length
      ? blockedResult(values, blockedBy)
      : calculate(node, values)
  }

  // --- 반복 블록 -----------------------------------------------------------------
  const runLoop = (block) => {
    const members = block.ids.map(id => nodeById.get(String(id)))
    const inside = new Set(block.ids.map(String))
    const feedbackIds = new Set(block.feedback.map(l => String(l.id)))

    const stop = (message, extra = {}) => {
      // **블록은 하나로 성공하고 하나로 실패한다.** 절반만 답인 상태는 없다.
      for (const node of members) {
        out[node.id] = {
          status: STATUS.failed, message, values: {}, results: {}, ...extra,
        }
      }
    }

    for (const node of members) {
      if (node.card_deleted || node.sub_workflow_deleted) {
        stop('반복 블록 안의 카드나 워크플로가 휴지통에 있습니다.')
        return
      }
    }

    // 바깥에서 들어오는 값이 준비되었는가. 하나라도 아니면 블록째로 막힌다.
    for (const link of block.entryLinks) {
      const got = fromFinished(link)
      if (got.blocked || got.error) {
        const source = nodeById.get(String(link.from_node_id))
        const name = source ? source.alias : `노드 ${link.from_node_id}`
        const why = `'${name}' 이(가) 계산되지 않았습니다`
        for (const node of members) {
          out[node.id] = blockedResult({}, [why])
        }
        return
      }
    }

    // 초기 추정값. 되돌아가는 선마다 하나씩 있어야 고리가 시작된다.
    const seed = {}
    for (const link of block.feedback) {
      const target = nodeById.get(String(link.to_node_id))
      const value = storedValue(target, keyFor(target, link, 'to'), overrides)
      if (value === null) {
        stop(`'${target?.alias}' 의 ${link.to_label || '입력'} 에 초기 추정값이`
          + ' 없습니다. 되먹임으로 들어오는 값은 시작할 숫자가 필요합니다.')
        return
      }
      seed[link.id] = value
    }

    // 한 바퀴 — 블록 안 노드를 순서대로 돌린다(Gauss–Seidel). 앞으로 가는 선은
    // 이번 바퀴에서 방금 나온 값을, 되돌아가는 선은 지난 바퀴 값을 쓴다.
    const sweep = (current) => {
      const turn = {}
      for (const node of members) {
        const { values, blockedBy } = gather(node, (link) => {
          if (!inside.has(String(link.from_node_id))) return fromFinished(link)
          if (feedbackIds.has(String(link.id))) return { value: current[link.id] }
          const from = turn[link.from_node_id]
          if (!from || from.status !== STATUS.ok) return { blocked: true }
          const source = nodeById.get(String(link.from_node_id))
          const result = from.results[keyFor(source, link, 'from')]
          if (!result || result.error) return { error: result?.error || '값 없음' }
          return { value: result.value }
        })
        if (blockedBy.length) return { error: `'${node.alias}': ${blockedBy[0]}` }

        const done = calculate(node, values)
        if (done.status !== STATUS.ok) {
          // **무엇이 왜 깨졌는지까지 말한다.** 「계산되지 않은 값이 2개」 만으로는
          // 고칠 수가 없다. 반복 중에 깨지는 것은 대개 초기 추정값이 모델을 못
          // 쓰는 영역으로 민 것이라(유량 0 → 레이놀즈수 0 → 64/0), 어느 값에서
          // 무엇이 났는지가 곧 어디를 고쳐야 하는지다.
          return { error: `'${node.alias}' 의 계산이 실패했습니다 — ${why(node, done)}` }
        }
        turn[node.id] = done
      }

      const next = {}
      for (const link of block.feedback) {
        const source = nodeById.get(String(link.from_node_id))
        next[link.id] =
          turn[link.from_node_id].results[keyFor(source, link, 'from')].value
      }
      return { next, detail: turn }
    }

    const found = fixedPoint(seed, sweep, settings)
    const loop = {
      iterations: found.iterations,
      residual: found.residual,
      converged: found.outcome === OUTCOME.converged,
      outcome: found.outcome,
    }

    if (!loop.converged) {
      // 수렴하지 못한 값은 **답이 아니다.** 마지막 숫자를 돌려주면 사람은 그것을
      // 결과로 읽고, 그 순간 이 기능은 조용히 틀린 답을 내는 장치가 된다.
      stop(found.message, { loop })
      return
    }

    for (const node of members) {
      out[node.id] = { ...found.detail[node.id], loop }
    }
  }

  for (const block of blocks) {
    if (block.loop) runLoop(block)
    else runOnce(nodeById.get(String(block.ids[0])))
  }

  const statuses = Object.values(out).map(r => r.status)
  return {
    ok: statuses.length > 0 && statuses.every(s => s === STATUS.ok),
    nodes: out,
    order: blocks.flatMap(b => b.ids),
    blocks,
  }
}

/**
 * 마지막 노드들 — 아무 데로도 값을 보내지 않는 노드.
 *
 * 화면이 "이 워크플로의 결론" 으로 크게 보여 줄 것들이다. 중간 노드까지 같은
 * 크기로 늘어놓으면 무엇이 답인지 알 수 없다.
 */
export function terminalNodes(workflow) {
  const nodes = workflow?.nodes || []
  const sources = new Set((workflow?.links || []).map(l => String(l.from_node_id)))
  return nodes.filter(n => !sources.has(String(n.id)))
}

export default runWorkflow
