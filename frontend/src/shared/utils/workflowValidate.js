/**
 * 워크플로 검증 — 돌리기 전에 무엇이 깨져 있는지 말한다.
 *
 * 카드는 **살아 있는 참조**다. 카드를 고치면 워크플로에 그대로 반영되는데, 그
 * 대가로 카드에서 변수를 지우면 그 변수를 쓰던 배선이 끊긴다. 끊긴 채로 조용히
 * 도는 것이 이 구조에서 가장 나쁜 실패라, 검증이 1급 기능이다.
 *
 * ## 단위 검사를 어떻게 하는가
 *
 * **화면이 단위 문자열을 해석하지 않는다.** 그러면 단위 규칙이 두 벌이 되고, 두
 * 벌은 반드시 어긋난다 — 서버가 이미 그렇게 정해 두었다(`units.describe`).
 *
 * 대신 서버가 변수마다 실어 보내는 `unit_info` 를 쓴다. 같은 차원의 단위는
 * **고를 수 있는 대안 목록이 같다**(N 과 kN 은 둘 다 [N, kN, …] 를 준다). 그래서
 *
 *     대안 목록이 다르다   → 차원이 다르다. 토크를 힘에 꽂는 실수다
 *     같은데 factor 가 다르다 → 배율이 어긋난다. N 자리에 kN 을 보내는 것이다
 *
 * 배율 어긋남이 특히 조용하다. 값은 1000배 틀리는데 계산은 멀쩡히 돌고 숫자도
 * 그럴듯해서, 이것만은 사람도 잘 못 잡는다.
 */

export const LEVELS = { error: 'error', warning: 'warning' }

function variableMap(variables) {
  const map = new Map()
  for (const v of variables || []) map.set(String(v.id), v)
  return map
}

function label(variable, fallback) {
  if (!variable) return fallback
  return variable.symbol ? `${variable.name} (${variable.symbol})` : variable.name
}

/** 같은 차원인가. 대안 목록의 단위 이름 집합으로 판단한다. */
function sameDimension(a, b) {
  const names = (info) => (info?.alternatives || []).map(x => x.unit).sort().join('|')
  return names(a) === names(b)
}

/**
 * @param workflow       `{ nodes, links, order }` — 서버가 준 그대로
 * @param cardVariables  `{ [cardId]: [variable, ...] }`
 * @returns 문제 목록. 비어 있으면 돌릴 준비가 된 것이다.
 */
export function validateWorkflow(workflow, cardVariables) {
  const issues = []
  const nodes = workflow?.nodes || []
  const links = workflow?.links || []

  if (nodes.length === 0) {
    issues.push({
      level: LEVELS.error,
      code: 'empty',
      message: '노드가 없습니다. 카드를 하나 이상 넣어 주세요.',
    })
    return issues
  }

  // --- 순환 --------------------------------------------------------------------
  // 서버가 순서를 못 정하면 null 을 준다. 여기서 멈춰야 한다 — 나머지 검사는
  // 순서가 있다고 보고 도는 것이라 의미가 없어진다.
  if (workflow.order === null || workflow.order === undefined) {
    issues.push({
      level: LEVELS.error,
      code: 'cycle',
      message: '순환 연결이 있어 실행 순서를 정할 수 없습니다. 연결을 하나 끊어 주세요.',
    })
    return issues
  }

  const varsOf = (node) => variableMap(cardVariables?.[node.card_id])
  const nodeById = new Map(nodes.map(n => [String(n.id), n]))

  // --- 휴지통에 있는 카드 --------------------------------------------------------
  for (const node of nodes) {
    if (node.card_deleted) {
      issues.push({
        level: LEVELS.error,
        code: 'card-trashed',
        node_id: node.id,
        message: `'${node.alias}' 의 카드가 휴지통에 있습니다. 되살리거나 노드를 빼 주세요.`,
      })
    }
  }

  // --- 끊긴 연결 + 단위 ----------------------------------------------------------
  //
  // 연결 행은 변수가 사라져도 남는다(외래키를 안 걸었다). 그래서 **무엇을
  // 가리키던 것인지** 이름 사본으로 말할 수 있다.
  const linkedTargets = new Set()
  for (const link of links) {
    const src = nodeById.get(String(link.from_node_id))
    const dst = nodeById.get(String(link.to_node_id))
    if (!src || !dst) continue

    const fromVar = varsOf(src).get(String(link.from_variable_id))
    const toVar = varsOf(dst).get(String(link.to_variable_id))

    if (!fromVar) {
      issues.push({
        level: LEVELS.error,
        code: 'broken-link',
        link_id: link.id,
        message: `'${src.alias}' 의 ${link.from_label || '변수'} 이(가) 카드에서 사라져 `
          + `'${dst.alias}' 로 가던 연결이 끊겼습니다.`,
      })
    }
    if (!toVar) {
      issues.push({
        level: LEVELS.error,
        code: 'broken-link',
        link_id: link.id,
        message: `'${dst.alias}' 의 ${link.to_label || '변수'} 이(가) 카드에서 사라져 `
          + '연결이 끊겼습니다.',
      })
    }
    if (!fromVar || !toVar) continue

    linkedTargets.add(`${link.to_node_id}:${link.to_variable_id}`)

    const a = fromVar.unit_info
    const b = toVar.unit_info
    if (!a || !b) {
      // 단위를 안 적었거나 못 읽는 경우. 빈 칸은 '무차원' 이 아니라 '안 적었다'
      // 이므로, 맞다고 단정하지 않고 검사를 건너뛴다는 사실만 알린다.
      if ((fromVar.unit || '') !== (toVar.unit || '')) {
        issues.push({
          level: LEVELS.warning,
          code: 'unit-unknown',
          link_id: link.id,
          message: `${label(fromVar)} → ${label(toVar)} : 단위를 확인할 수 없어 `
            + '검사를 건너뜁니다. 두 변수의 단위를 적어 두면 잡아 줍니다.',
        })
      }
    } else if (!sameDimension(a, b)) {
      issues.push({
        level: LEVELS.error,
        code: 'unit-dimension',
        link_id: link.id,
        message: `${label(fromVar)}[${a.unit}] 을(를) ${label(toVar)}[${b.unit}] 에 `
          + '연결했습니다 — 단위의 차원이 다릅니다.',
      })
    } else if (a.factor !== b.factor) {
      const ratio = a.factor / b.factor
      issues.push({
        level: LEVELS.warning,
        code: 'unit-scale',
        link_id: link.id,
        message: `${label(fromVar)}[${a.unit}] → ${label(toVar)}[${b.unit}] : `
          + `값이 ${formatRatio(ratio)}배 어긋납니다. 계산은 돌지만 숫자가 틀립니다.`,
      })
    }
  }

  // --- 안 채워진 입력 ------------------------------------------------------------
  for (const node of nodes) {
    const variables = cardVariables?.[node.card_id] || []
    const stored = node.inputs || {}
    for (const v of variables) {
      if (v.category !== 'input') continue
      if (linkedTargets.has(`${node.id}:${v.id}`)) continue

      const value = stored[String(v.id)] ?? stored[v.id]
      const blank = value === '' || value === null || value === undefined
        || (Array.isArray(value) && value.length === 0)
      if (blank) {
        issues.push({
          level: LEVELS.warning,
          code: 'empty-input',
          node_id: node.id,
          variable_id: v.id,
          message: `'${node.alias}' 의 ${label(v)} 이(가) 비어 있습니다 — `
            + '연결도 없고 값도 없습니다.',
        })
      }
    }
  }

  return issues
}

function formatRatio(ratio) {
  if (!Number.isFinite(ratio) || ratio === 0) return '?'
  const value = ratio > 1 ? ratio : 1 / ratio
  const rounded = Math.round(value * 1e6) / 1e6
  return ratio > 1 ? String(rounded) : `1/${rounded}`
}

export default validateWorkflow
