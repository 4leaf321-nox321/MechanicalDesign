/**
 * 축차대입 반복 — 서로 물고 있는 값을 돌려서 수렴시킨다.
 *
 *     x₀    = 초기 추정값
 *     x_k+1 = x_k + ω(f(x_k) − x_k)
 *
 * 계산이 무엇인지는 모른다. `step` 이 한 바퀴를 돌고 새 값을 돌려주면, 여기서는
 * **멈출 때를 판정**할 뿐이다. 그 판정이 이 파일의 전부이자 이 기능에서 가장
 * 위험한 자리다.
 *
 * ## 왜 판정을 사람에게 맡기지 않는가
 *
 * "`abs(d - d_prev) < 0.01` 이면 멈춤" 같은 식을 손으로 쓰게 두면, 그 식을 잘못
 * 쓴 워크플로가 **수렴하지 않은 숫자를 답으로 내놓고 아무 오류도 내지 않는다.**
 * 단위 배율 어긋남과 같은 종류다 — 숫자는 그럴듯하고 계산은 멀쩡히 돈다.
 *
 * 사람이 정하는 것은 기준(허용오차·한도·완화계수)이고, 판정은 여기서 한다.
 * 그리고 **수렴하지 못하면 답이 아니다.** 마지막 값을 돌려주지 않는다.
 *
 * ## 잔차는 완화 **전** 값으로 잰다
 *
 * 완화계수 ω 를 곱한 뒤의 변화량으로 재면, ω 를 작게 준 것만으로 변화가 작아져
 * 수렴한 것처럼 보인다. 실제로 풀려는 것은 `f(x) = x` 이므로 잰다면 `f(x) − x`
 * 여야 한다. ω 는 가는 보폭일 뿐 도착 판정과 무관하다.
 */

export const OUTCOME = {
  converged: 'converged',   // 잡혔다. 이것만 답이다
  diverged: 'diverged',     // 튀었다
  maxed: 'maxed',           // 한도까지 갔는데 안 잡혔다
  failed: 'failed',         // 도는 중에 계산이 깨졌다
}

/**
 * 기본값.
 *
 * ## 왜 완화계수가 1 이 아닌가
 *
 * 두 실제 예제를 재 보면 최적 w 가 정반대로 나온다:
 *
 *     축 지름 ⇄ 자중     w=1 에서 5회,  w=0.7 에서 14회
 *     펌프 운전점        w=1 에서 44회, w=0.7 에서 10회, w=0.6 에서 6회
 *
 * 고리의 이득(gain)에 달린 것이라 **모두에게 최선인 값은 없다.** 그러면 고를
 * 기준은 「가장 빠른 값」이 아니라 「가장 덜 실패하는 값」이다. 반복 한 바퀴는
 * 1 ms 아래고, 잘못된 「안 잡혔습니다」 는 사람이 기능을 못 믿게 만든다.
 *
 * w<1 은 보폭을 줄여 튀는 고리를 잡아 준다 — w=1 에서 발산하던 것이 잡히기도
 * 한다. 그 반대는 없다. 그래서 조금 손해 보고 안전한 쪽에 둔다.
 *
 * 한도도 넉넉히 둔다. 펌프 예제가 w=1 에서 44회였는데 한도가 50 이면, 조금만
 * 뻣뻣한 모델도 멀쩡히 수렴하면서 「못 잡았다」 는 소리를 듣는다.
 */
export const DEFAULTS = {
  relTolerance: 1e-6,
  absTolerance: 1e-9,
  maxIterations: 200,
  relaxation: 0.7,
}

/**
 * 값이 이보다 커지면 볼 것도 없이 튄 것이다.
 *
 * **크기로 본다.** 상대 잔차로만 보면 `x ← 3x` 같은 배수 발산을 못 잡는다 —
 * 매 바퀴 세 배가 되어도 상대 변화는 늘 0.667 로 일정하다. 잔차는 가만있는데
 * 값만 하늘로 간다.
 *
 * 기계 설계에서 나오는 숫자는 큰 기계라도 1e9 언저리다. 발산은 지수로 커지니
 * 여유를 크게 두어도 몇 바퀴 안에 이 선을 넘는다.
 */
const DIVERGE_AT = 1e12
/** 잔차가 이만큼 연달아 커지고 크기까지 크면 튄 것으로 본다. */
const RISE_LIMIT = 5
const RISE_SCALE = 1e3

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * @param seed           `{ key: 숫자 }` 초기 추정값
 * @param step           `(values) => { next: {key: 숫자} }` 또는 `{ error: '...' }`
 * @param settings       `{ relTolerance, absTolerance, maxIterations, relaxation }`
 * @returns `{ outcome, iterations, residual, values, detail, message }`
 */
export function fixedPoint(seed, step, settings = {}) {
  const {
    relTolerance = DEFAULTS.relTolerance,
    absTolerance = DEFAULTS.absTolerance,
    maxIterations = DEFAULTS.maxIterations,
    relaxation = DEFAULTS.relaxation,
  } = settings

  const keys = Object.keys(seed || {})
  if (keys.length === 0) {
    return {
      outcome: OUTCOME.failed, iterations: 0, residual: null,
      message: '되먹임할 값이 없습니다.',
    }
  }

  let current = { ...seed }
  let residual = null
  let detail = null
  const history = []

  for (let k = 1; k <= maxIterations; k++) {
    const turn = step(current, k)
    if (turn?.error) {
      return {
        outcome: OUTCOME.failed, iterations: k, residual,
        message: `${k}번째 반복에서 ${turn.error}`,
      }
    }

    const next = turn.next || {}
    detail = turn.detail

    // 이번 바퀴가 얼마나 움직였나 — 완화 전, 날것으로.
    let worst = 0
    let settled = true
    for (const id of keys) {
      const before = num(current[id])
      const after = num(next[id])
      if (after === null) {
        return {
          outcome: OUTCOME.diverged, iterations: k, residual,
          message: `${k}번째 반복에서 값이 숫자가 아니게 되었습니다.`,
        }
      }
      if (Math.abs(after) > DIVERGE_AT) {
        return {
          outcome: OUTCOME.diverged, iterations: k, residual,
          message: `${k}번째 반복에서 값이 발산했습니다.`
            + ' 초기 추정값을 답에 가깝게 주거나 완화계수를 낮춰 보세요.',
        }
      }
      const delta = Math.abs(after - before)
      if (delta > absTolerance + relTolerance * Math.abs(after)) settled = false
      // 0 근처에서 상대변화가 무의미해지지 않도록 아래를 받쳐 준다.
      worst = Math.max(worst, delta / Math.max(Math.abs(after), 1e-12))
    }
    residual = worst
    history.push(worst)

    if (settled) {
      return {
        outcome: OUTCOME.converged, iterations: k, residual,
        values: next, detail,
        message: '',
      }
    }

    if (rising(history)) {
      return {
        outcome: OUTCOME.diverged, iterations: k, residual,
        message: `${k}번째 반복에서 값이 발산했습니다.`
          + ' 초기 추정값을 답에 가깝게 주거나 완화계수를 낮춰 보세요.',
      }
    }

    // 완화. ω = 1 이면 그냥 f(x) 를 그대로 쓴다.
    const moved = {}
    for (const id of keys) {
      const before = num(current[id])
      const after = num(next[id])
      moved[id] = before + relaxation * (after - before)
    }
    current = moved
  }

  return {
    outcome: OUTCOME.maxed,
    iterations: maxIterations,
    residual,
    message: `${maxIterations}번 돌렸는데 수렴하지 않았습니다`
      + ` (잔차 ${residual?.toExponential(2)}).`
      + (flapping(history)
        ? ' 값이 줄지 않고 오갑니다 — 조건부 변수가 반복마다 다른 가지로 갈 수'
          + ' 있습니다. 완화계수를 낮춰 보세요.'
        : ' 반복 한도를 늘리거나 완화계수를 낮춰 보세요.'),
  }
}

/** 잔차가 연달아 커지고 크기까지 크면 튄 것이다. 느리게 잡히는 고리를 안 죽이려고 보수적으로 본다. */
function rising(history) {
  if (history.length <= RISE_LIMIT) return false
  const tail = history.slice(-(RISE_LIMIT + 1))
  if (tail[tail.length - 1] < RISE_SCALE) return false
  for (let i = 1; i < tail.length; i++) {
    if (tail[i] <= tail[i - 1]) return false
  }
  return true
}

/** 줄지도 늘지도 않고 제자리를 오가는가. 조건부 가지가 튈 때 이렇게 된다. */
function flapping(history) {
  if (history.length < 6) return false
  const recent = Math.min(...history.slice(-3))
  const earlier = Math.min(...history.slice(-6, -3))
  return recent >= earlier * 0.9
}

export default fixedPoint
