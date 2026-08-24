/**
 * 트레이드오프 곡선 — 미지수 둘, 목표 하나.
 *
 * *"응력 200 을 만족하는 (두께, 폭) 조합은?"* 미지수가 둘이면 답이 **점이 아니라
 * 선**이다. 두께 10·폭 50 도, 두께 12·폭 41.7 도 같은 응력을 낸다. 그래서 하나를
 * 골라 주는 대신 **가능한 조합 전부**를 곡선으로 그린다.
 *
 * 설계에서 최적점은 대개 이 선 위에 있다 — 응력이 딱 허용치인 지점이 가장 가볍고
 * 싸다. DOE 필터가 "쓸 수 있는 영역" 을 칠해 준다면, 이 곡선은 그 영역의
 * **가장자리**다.
 *
 * ## 방법
 *
 * 한 변수를 훑으면서, 각 지점마다 나머지 하나를 역계산한다. 즉 1차원 문제를
 * 여러 번 푸는 것이라 `goalSeek` 을 그대로 쓴다 — 단조가 아닌 식에서 답이 둘인
 * 것도 그쪽이 이미 처리한다.
 *
 * ## 답이 여러 개인 x 를 어떻게 그릴 것인가
 *
 * x 마다 답이 하나가 아닐 수 있다. 전부 한 줄로 이으면 곡선이 위아래를 오가며
 * **실제로는 없는 연결선**을 그린다. 그래서 답의 순번(작은 것부터)으로 갈래를
 * 나눠 각각 따로 잇는다.
 */

import { goalSeek } from './goalSeek'

/** x 축을 몇 등분할지. 늘리면 곡선이 매끄러워지고 그만큼 느려진다. */
const DEFAULT_STEPS = 40

/**
 * @param variables   카드의 변수 전부
 * @param baseValues  화면의 입력값 — 두 미지수 말고는 이 값으로 고정된다
 * @param options     { sweepId, sweepMin, sweepMax, solveId, solveMin, solveMax,
 *                      outputId, target, steps }
 */
export function tradeoffCurve(variables, baseValues, options) {
  const {
    sweepId, sweepMin, sweepMax,
    solveId, solveMin, solveMax,
    outputId, target, steps = DEFAULT_STEPS,
  } = options

  const blank = (v) => v === '' || v === null || v === undefined
  if (blank(target)) {
    return { ok: false, reason: 'target', message: '목표값을 입력해 주세요.' }
  }
  if ([sweepMin, sweepMax, solveMin, solveMax].some(blank)) {
    return { ok: false, reason: 'range', message: '두 변수의 범위를 모두 입력해 주세요.' }
  }
  if (String(sweepId) === String(solveId)) {
    return {
      ok: false,
      reason: 'same',
      message: '훑는 변수와 푸는 변수가 같습니다. 서로 다른 변수를 고르세요.',
    }
  }

  const lo = Number(sweepMin)
  const hi = Number(sweepMax)
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo >= hi) {
    return { ok: false, reason: 'range', message: '훑을 범위의 끝이 시작보다 커야 합니다.' }
  }

  const n = Math.max(2, Math.min(200, Math.floor(steps)))
  const step = (hi - lo) / n

  const points = []       // { x, ys: [...] }
  let solvedCount = 0
  let maxBranches = 0

  for (let i = 0; i <= n; i += 1) {
    const x = lo + step * i
    const found = goalSeek(variables, { ...baseValues, [sweepId]: x }, {
      inputId: solveId,
      outputId,
      target,
      min: solveMin,
      max: solveMax,
    })

    if (!found.ok) {
      // 이 x 에서는 목표를 만들 수 없다. **점을 빼는 것이 아니라 빈 자리로
      // 남긴다** — 어느 구간이 불가능한지가 곡선에서 보여야 한다.
      points.push({ x, ys: [] })
      continue
    }
    solvedCount += 1
    const ys = found.solutions.map(s => s.input).sort((a, b) => a - b)
    if (ys.length > maxBranches) maxBranches = ys.length
    points.push({ x, ys })
  }

  if (solvedCount === 0) {
    return {
      ok: false,
      reason: 'no-solution',
      message: '훑은 범위 어디에서도 목표를 만족하는 조합을 찾지 못했습니다. '
        + '목표값이나 두 변수의 범위를 넓혀 보세요.',
    }
  }

  // 답의 순번으로 갈래를 나눈다. 한 줄로 이으면 실제로는 없는 연결선이 생긴다.
  const branches = []
  for (let b = 0; b < maxBranches; b += 1) {
    const xs = []
    const ys = []
    for (const p of points) {
      if (p.ys.length > b) {
        xs.push(p.x)
        ys.push(p.ys[b])
      } else {
        // 곡선이 끊긴 자리. null 을 넣으면 그래프가 이어 그리지 않는다.
        xs.push(p.x)
        ys.push(null)
      }
    }
    branches.push({ xs, ys })
  }

  return {
    ok: true,
    branches,
    points,
    solvedCount,
    total: points.length,
    // 일부 구간만 풀렸다면 그 사실을 말해야 한다. 곡선만 보면 끊긴 자리가
    // "계산이 덜 됐나" 로 읽힌다.
    partial: solvedCount < points.length,
  }
}

export default tradeoffCurve
