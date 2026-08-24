/**
 * 역계산 — 목표 결과값이 나오는 입력값을 찾는다.
 *
 * "허용응력 200MPa 를 만족하는 최대 두께는?" 은 설계에서 가장 자주 하는 질문인데,
 * 지금까지는 숫자를 바꿔 가며 손으로 찾아야 했다. 카드는 입력 → 출력 방향으로만
 * 도니, 반대 방향은 **여러 번 돌려 보는 것**으로 만든다.
 *
 * ## 왜 이분법만 쓰지 않는가
 *
 * 이분법은 구간 양 끝에서 부호가 다를 때만 쓸 수 있다. 그런데 설계 계산은 단조가
 * 아닌 경우가 흔하다 — 좌굴, 공진, 최적점을 낀 식은 가운데가 볼록하다. 양 끝만
 * 보면 **답이 둘인데 하나도 못 찾는** 일이 생긴다.
 *
 * 그래서 먼저 구간을 훑어 부호가 뒤집히는 자리를 **전부** 찾고, 그 안에서만
 * 이분법으로 좁힌다. 답이 여러 개면 여러 개로 돌려준다 — 하나만 주면 사람은
 * 다른 답이 있다는 것을 영영 모른다.
 *
 * ## 못 찾았을 때가 더 중요하다
 *
 * "찾지 못했습니다" 만으로는 범위를 넓혀야 하는지, 애초에 불가능한지 알 수 없다.
 * 훑는 동안 본 **결과값의 최소·최대**를 함께 돌려준다. 그러면 "이 범위에서
 * 응력은 12~48 이라 200 은 나올 수 없다" 를 화면이 말할 수 있다.
 */

import { calculateCard } from './calcEngine'

/** 구간을 훑는 점의 수. 촘촘할수록 답을 놓칠 확률이 줄지만 그만큼 느리다. */
const SCAN_POINTS = 200

/** 이분법 반복 횟수. 2^60 이면 배정도 실수의 한계까지 좁혀진다. */
const BISECT_STEPS = 60

/**
 * @param variables  카드의 변수 전부
 * @param baseValues 지금 화면의 입력값 — 푸는 변수 말고는 이 값으로 고정된다
 * @param options    { inputId, outputId, target, min, max }
 */
export function goalSeek(variables, baseValues, { inputId, outputId, target, min, max }) {
  // **빈 칸을 Number() 에 그냥 넘기면 안 된다.** Number('') 는 0 이라, 목표값을
  // 비운 채 실행하면 "0 이 되는 지점" 을 조용히 찾아 준다.
  const blank = (v) => v === '' || v === null || v === undefined
  if (blank(target)) {
    return { ok: false, reason: 'target', message: '목표값을 입력해 주세요.' }
  }
  if (blank(min) || blank(max)) {
    return { ok: false, reason: 'range', message: '찾을 범위를 입력해 주세요.' }
  }

  const lo = Number(min)
  const hi = Number(max)
  const goal = Number(target)

  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    return { ok: false, reason: 'range', message: '찾을 범위를 숫자로 입력해 주세요.' }
  }
  if (lo >= hi) {
    return { ok: false, reason: 'range', message: '범위의 끝이 시작보다 커야 합니다.' }
  }
  if (!Number.isFinite(goal)) {
    return { ok: false, reason: 'target', message: '목표값을 숫자로 입력해 주세요.' }
  }

  /** 이 입력값일 때 목표까지의 거리. 계산이 안 되면 null. */
  const gap = (x) => {
    const { results } = calculateCard(variables, { ...baseValues, [inputId]: x })
    const r = results[outputId]
    if (!r || r.error) return null
    const value = Number(r.value)
    return Number.isFinite(value) ? value - goal : null
  }

  // --- 1단계: 훑기 ---------------------------------------------------------------
  const step = (hi - lo) / SCAN_POINTS
  const samples = []
  let seenMin = Infinity
  let seenMax = -Infinity
  let failures = 0

  for (let i = 0; i <= SCAN_POINTS; i += 1) {
    const x = lo + step * i
    const g = gap(x)
    if (g === null) {
      failures += 1
      samples.push({ x, g: null })
      continue
    }
    const y = g + goal
    if (y < seenMin) seenMin = y
    if (y > seenMax) seenMax = y
    samples.push({ x, g })
  }

  if (failures > SCAN_POINTS) {
    return {
      ok: false,
      reason: 'error',
      message: '이 범위에서 계산이 되지 않습니다. 다른 입력값이나 범위를 확인해 주세요.',
    }
  }

  // --- 2단계: 부호가 뒤집히는 구간마다 이분법 --------------------------------------
  const roots = []

  // 훑는 점이 정확히 답에 떨어진 경우. 이분법은 부호가 **뒤집히는** 구간을
  // 찾으므로 이 자리를 잡지 못한다.
  for (const sample of samples) {
    if (sample.g === 0) roots.push(sample.x)
  }

  for (let i = 1; i < samples.length; i += 1) {
    const a = samples[i - 1]
    const b = samples[i]
    if (a.g === null || b.g === null) continue
    // 0 인 끝점은 위에서 이미 담았다. 여기서 또 좁히면 **같은 답이 두 번**
    // 나오는데, 답이 둘인 것과 구분되지 않아 사람이 잘못 읽는다.
    if (a.g === 0 || b.g === 0) continue
    if (a.g > 0 === b.g > 0) continue

    let left = a.x
    let right = b.x
    let leftGap = a.g
    for (let k = 0; k < BISECT_STEPS; k += 1) {
      const mid = (left + right) / 2
      const midGap = gap(mid)
      if (midGap === null) break
      if (midGap === 0) { left = mid; right = mid; break }
      if (leftGap > 0 === midGap > 0) {
        left = mid
        leftGap = midGap
      } else {
        right = mid
      }
    }
    roots.push((left + right) / 2)
  }

  // 이웃한 구간이 사실상 같은 자리로 좁혀지는 일이 있다. 훑는 간격의 절반보다
  // 가까우면 같은 답으로 본다 — 그보다 촘촘한 두 답은 이 격자로 구분할 수 없다.
  const tolerance = Math.abs(hi - lo) / SCAN_POINTS / 2
  roots.sort((p, q) => p - q)
  const unique = roots.filter((x, i) => i === 0 || Math.abs(x - roots[i - 1]) > tolerance)
  roots.length = 0
  roots.push(...unique)

  if (roots.length === 0) {
    return {
      ok: false,
      reason: 'no-root',
      // **범위를 함께 말해 주는 것이 핵심이다.** 이것이 없으면 범위를 넓혀야
      // 하는지 애초에 불가능한지 알 수 없어, 사람은 숫자를 바꿔 가며 다시
      // 손으로 찾게 된다.
      achievable: Number.isFinite(seenMin) ? { min: seenMin, max: seenMax } : null,
      message: Number.isFinite(seenMin)
        ? `이 범위에서 결과는 ${fmt(seenMin)} ~ ${fmt(seenMax)} 사이입니다. 목표 ${fmt(goal)} 은(는) 나오지 않습니다.`
        : '이 범위에서 결과를 계산하지 못했습니다.',
      partial: failures > 0,
    }
  }

  // 답마다 실제로 나온 결과값을 함께 담는다. 이분법이 좁힌 자리가 정말 목표에
  // 닿는지는 **다시 계산해 보여 주는 것**으로만 확인된다.
  const solutions = roots.map((x) => {
    const { results } = calculateCard(variables, { ...baseValues, [inputId]: x })
    const r = results[outputId] || {}
    return { input: x, output: Number(r.value) }
  })

  return {
    ok: true,
    solutions,
    achievable: Number.isFinite(seenMin) ? { min: seenMin, max: seenMax } : null,
    // 계산이 실패한 점이 섞여 있었다면 놓친 답이 있을 수 있다.
    partial: failures > 0,
  }
}

/** 화면과 메시지에서 같은 방식으로 줄인다. */
export function fmt(n) {
  if (!Number.isFinite(n)) return '-'
  if (n !== 0 && (Math.abs(n) >= 1e6 || Math.abs(n) < 1e-4)) return n.toExponential(4)
  return String(Math.round(n * 1e6) / 1e6)
}

export default goalSeek
