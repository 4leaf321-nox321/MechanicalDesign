/**
 * 트레이드오프 곡선.
 *
 * **조용히 틀리는 것 둘.**
 *
 *   끊긴 구간을 빼 버리면   불가능한 구간이 곡선에서 사라져, 이어진 것처럼 보인다
 *   답 여럿을 한 줄로 이으면 위아래를 오가며 실제로는 없는 연결선을 그린다
 */

import { describe, expect, it } from 'vitest'
import { tradeoffCurve } from './tradeoff'

/** sig = F / (t * w) — 두께 t 와 폭 w 가 미지수, F 는 고정. */
const beam = [
  { id: 1, category: 'input', var_type: 'text', symbol: 't', name: '두께' },
  { id: 2, category: 'input', var_type: 'text', symbol: 'w', name: '폭' },
  { id: 3, category: 'input', var_type: 'text', symbol: 'F', name: '하중' },
  { id: 4, category: 'output', var_type: 'formula', symbol: 'sig', name: '응력',
    formula: 'F / (t * w)' },
]

const run = (opts) => tradeoffCurve(beam, { 3: 6000 }, {
  sweepId: 1, sweepMin: 5, sweepMax: 20,
  solveId: 2, solveMin: 1, solveMax: 500,
  outputId: 4, target: 200, steps: 15,
  ...opts,
})

describe('곡선', () => {
  it('훑은 점마다 나머지를 풀어 준다', () => {
    const got = run()
    expect(got.ok).toBe(true)
    expect(got.branches).toHaveLength(1)
    expect(got.points).toHaveLength(16)   // steps=15 → 끝점 포함 16개
  })

  it('곡선 위의 점이 실제로 목표를 만족한다', () => {
    // sig = 200 이려면 t*w = 6000/200 = 30. t=10 이면 w=3.
    const got = run()
    const at10 = got.points.find(p => Math.abs(p.x - 10) < 1e-9)
    expect(at10.ys[0]).toBeCloseTo(3, 6)
  })

  it('반비례 관계가 곡선으로 나온다 — t 가 커지면 w 가 작아진다', () => {
    const got = run()
    const ys = got.branches[0].ys.filter(y => y !== null)
    for (let i = 1; i < ys.length; i += 1) {
      expect(ys[i]).toBeLessThan(ys[i - 1])
    }
  })
})

describe('풀 수 없는 구간', () => {
  it('빈 자리로 남긴다 — 점을 빼지 않는다', () => {
    // w 를 10~500 으로 좁히면, t 가 큰 쪽에서는 w 가 그보다 작아야 해서
    // 답이 없다. 그 구간이 곡선에서 **사라지면** 이어진 것처럼 보인다.
    const got = run({ solveMin: 10, solveMax: 500, sweepMin: 1, sweepMax: 20 })

    expect(got.ok).toBe(true)
    expect(got.partial).toBe(true)
    expect(got.points).toHaveLength(16)
    expect(got.branches[0].ys.some(y => y === null)).toBe(true)
    expect(got.solvedCount).toBeLessThan(got.total)
  })

  it('어디에서도 못 찾으면 그렇다고 말한다', () => {
    const got = run({ target: 999999, solveMin: 1, solveMax: 2 })
    expect(got.ok).toBe(false)
    expect(got.reason).toBe('no-solution')
  })
})

describe('답이 여럿인 경우', () => {
  it('갈래를 나눠 각각 잇는다', () => {
    // y = (w - x)^2 = 4 → w = x ± 2. x 마다 답이 둘이다.
    const vars = [
      { id: 1, category: 'input', var_type: 'text', symbol: 'x', name: 'x' },
      { id: 2, category: 'input', var_type: 'text', symbol: 'w', name: 'w' },
      { id: 4, category: 'output', var_type: 'formula', symbol: 'y', name: 'y',
        formula: '(w - x) ^ 2' },
    ]
    const got = tradeoffCurve(vars, {}, {
      sweepId: 1, sweepMin: 10, sweepMax: 20,
      solveId: 2, solveMin: 0, solveMax: 40,
      outputId: 4, target: 4, steps: 10,
    })

    expect(got.ok).toBe(true)
    // 한 줄로 이으면 위아래를 오가는 없는 선이 생긴다.
    expect(got.branches).toHaveLength(2)
    const first = got.points[0]
    expect(first.ys).toHaveLength(2)
    expect(first.ys[0]).toBeCloseTo(first.x - 2, 5)
    expect(first.ys[1]).toBeCloseTo(first.x + 2, 5)
  })
})

describe('안 되는 입력', () => {
  it.each([
    [{ target: '' }, 'target'],
    [{ sweepMin: '' }, 'range'],
    [{ solveMax: '' }, 'range'],
    [{ sweepMin: 20, sweepMax: 5 }, 'range'],
    [{ solveId: 1 }, 'same'],
  ])('%o → %s', (opts, reason) => {
    const got = run(opts)
    expect(got.ok).toBe(false)
    expect(got.reason).toBe(reason)
  })
})
