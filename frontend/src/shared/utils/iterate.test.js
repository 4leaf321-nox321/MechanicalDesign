import { describe, expect, it } from 'vitest'
import { OUTCOME, fixedPoint } from './iterate'

/** x = f(x) 를 푸는 한 바퀴. 값 하나짜리 고리. */
const turning = (f) => (current) => ({ next: { a: f(current.a) } })

describe('fixedPoint', () => {
  it('수렴하면 잡힌 값을 준다', () => {
    // x = cos(x) → 0.739085…
    const got = fixedPoint({ a: 1 }, turning(Math.cos), { maxIterations: 200 })
    expect(got.outcome).toBe(OUTCOME.converged)
    expect(got.values.a).toBeCloseTo(0.7390851, 6)
    expect(got.iterations).toBeGreaterThan(1)
  })

  it('발산하면 값을 주지 않는다', () => {
    // **수렴 못 한 값은 답이 아니다.** 마지막 숫자를 돌려주면 사람은 그것을
    // 결과로 읽고, 그 순간 이 기능은 조용히 틀린 답을 내는 장치가 된다.
    const got = fixedPoint({ a: 2 }, turning(x => x * 3), { maxIterations: 100 })
    expect(got.outcome).toBe(OUTCOME.diverged)
    expect(got.values).toBeUndefined()
    expect(got.message).toContain('발산')
  })

  it('숫자가 아니게 되면 발산이다', () => {
    const got = fixedPoint({ a: -1 }, turning(Math.sqrt))
    expect(got.outcome).toBe(OUTCOME.diverged)
    expect(got.values).toBeUndefined()
  })

  it('한도까지 갔는데 안 잡히면 실패다', () => {
    const got = fixedPoint({ a: 1 }, turning(Math.cos), { maxIterations: 3 })
    expect(got.outcome).toBe(OUTCOME.maxed)
    expect(got.values).toBeUndefined()
    expect(got.iterations).toBe(3)
    expect(got.message).toContain('3번')
  })

  it('완화계수가 있어야 잡히는 고리', () => {
    // x = 1 - 2x 는 그대로 돌리면 부호를 바꾸며 커진다. ω 를 낮추면 잡힌다.
    const f = turning(x => 1 - 2 * x)
    expect(fixedPoint({ a: 0 }, f, { maxIterations: 60 }).outcome)
      .not.toBe(OUTCOME.converged)

    const relaxed = fixedPoint({ a: 0 }, f, { maxIterations: 200, relaxation: 0.3 })
    expect(relaxed.outcome).toBe(OUTCOME.converged)
    expect(relaxed.values.a).toBeCloseTo(1 / 3, 6)
  })

  it('잔차는 완화 **전** 값으로 잰다', () => {
    // ω 를 아주 작게 주면 실제 움직임은 작아진다. 그것으로 판정하면 잡히지도
    // 않은 고리가 수렴한 것으로 보인다 — 완화계수를 만졌다는 이유만으로.
    const got = fixedPoint({ a: 0 }, turning(x => x + 10),
      { maxIterations: 5, relaxation: 1e-9 })
    expect(got.outcome).not.toBe(OUTCOME.converged)
  })

  it('값이 여럿이면 모두 잡혀야 수렴이다', () => {
    const step = (c) => ({ next: { a: Math.cos(c.a), b: c.b * 0.5 + 1 } })
    const got = fixedPoint({ a: 1, b: 0 }, step, { maxIterations: 500 })
    expect(got.outcome).toBe(OUTCOME.converged)
    // 허용오차만큼만 정확하다. 수렴은 '더 이상 안 움직인다' 이지 '무한히
    // 정확하다' 가 아니다 — 답을 소수점 끝까지 맞다고 읽으면 안 된다.
    expect(got.values.a).toBeCloseTo(0.7390851, 5)
    expect(got.values.b).toBeCloseTo(2, 5)
  })

  it('한 바퀴가 깨지면 어느 바퀴였는지 말한다', () => {
    const step = (c, k) => (k === 3 ? { error: "'축' 의 계산이 실패했습니다" }
      : { next: { a: c.a + 1 } })
    const got = fixedPoint({ a: 0 }, step)
    expect(got.outcome).toBe(OUTCOME.failed)
    expect(got.message).toContain('3번째')
  })

  it('제자리를 오가면 그렇다고 말한다', () => {
    // 조건부 변수가 반복마다 다른 가지로 가면 이 모양이 된다. 「한도 초과」
    // 라고만 하면 한도를 늘리게 되고, 늘려도 영영 안 잡힌다.
    //
    // w=1 을 못 박아 둔다. 기본값 0.7 로는 이 고리가 잡혀 버리는데, 그것이
    // 바로 안내문이 완화계수를 낮춰 보라고 하는 이유다 — 보폭을 줄이면
    // 가지를 오가던 값이 가운데로 눌러앉는다.
    const got = fixedPoint({ a: 0 }, turning(x => (x === 0 ? 1 : 0)),
      { maxIterations: 20, relaxation: 1 })
    expect(got.outcome).toBe(OUTCOME.maxed)
    expect(got.message).toContain('오갑니다')
  })

  it('되먹임할 값이 없으면 돌지 않는다', () => {
    const got = fixedPoint({}, turning(x => x))
    expect(got.outcome).toBe(OUTCOME.failed)
  })

  it('처음부터 맞으면 한 바퀴에 끝난다', () => {
    const got = fixedPoint({ a: 5 }, turning(() => 5))
    expect(got.outcome).toBe(OUTCOME.converged)
    expect(got.iterations).toBe(1)
  })
})
