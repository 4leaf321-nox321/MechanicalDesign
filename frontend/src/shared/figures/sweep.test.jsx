/**
 * 스물다섯 도해 전수 검사.
 *
 * 도해 하나하나의 시험은 그 도해의 **뜻**을 지킨다. 여기는 반대로, 어느 도해든
 * 지켜야 하는 **공통 성질**을 전부에 대해 한꺼번에 잰다 — 좌표가 유한할 것,
 * 그린 것이 상자 안에 있을 것, 치수가 준 값 그대로일 것, 아무 값에나 조용히
 * 죽지 않을 것, 실제로 렌더될 것.
 *
 * 이 층이 잡는 잘못은 개별 시험이 놓친다. 상자 계산이 path 를 안 세던 버그가
 * 그랬다 — 다른 도형이 우연히 자리를 덮은 도해에서는 안 보이고, 경로뿐인
 * 자리(휜 판 스프링의 꼭대기)에서만 잘렸다.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { ServerStyleSheet } from 'styled-components'
import { describe, expect, it } from 'vitest'
import FigureView from '../components/FigureView'
import { FIGURES } from './index'
import { SAMPLE } from './samples'

/** 재현 가능한 유사난수. Math.random 은 실패를 재현 못 한다. */
function lcg(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

/** 도형 하나가 차지하는 x·y 범위. path 는 명령을 직접 읽는다. */
function extentOf(s) {
  const xs = []
  const ys = []
  const put = (x, y) => { xs.push(x); ys.push(y) }
  if (s.type === 'circle') { put(s.cx - s.r, s.cy - s.r); put(s.cx + s.r, s.cy + s.r) }
  if (s.type === 'rect') { put(s.x, s.y); put(s.x + s.w, s.y + s.h) }
  if (s.type === 'line' || s.type === 'flow') { put(s.x1, s.y1); put(s.x2, s.y2) }
  if (s.type === 'path') {
    // M/L 은 좌표쌍, Q 는 제어점+끝점, A 는 일곱 값 중 마지막 둘만 좌표다.
    const re = /([MLQA])([^MLQAZ]*)/g
    let m
    while ((m = re.exec(s.d)) !== null) {
      const nums = (m[2].match(/-?\d*\.?\d+(?:e[+-]?\d+)?/gi) || []).map(Number)
      if (m[1] === 'A') {
        for (let i = 0; i + 6 < nums.length; i += 7) put(nums[i + 5], nums[i + 6])
      } else {
        for (let i = 0; i + 1 < nums.length; i += 2) put(nums[i], nums[i + 1])
      }
    }
  }
  return { xs, ys }
}

function numbersOf(value, out = []) {
  if (typeof value === 'number') out.push(value)
  else if (Array.isArray(value)) value.forEach(v => numbersOf(v, out))
  else if (value && typeof value === 'object') {
    Object.values(value).forEach(v => numbersOf(v, out))
  }
  return out
}

const everything = (b) => [
  ...(b.shapes || []), ...(b.dims || []), ...(b.flows || []),
  ...(b.moments || []), ...(b.tags || []),
]

describe('모든 도해, 모든 값에서', () => {
  it('좌표에 NaN·Infinity 가 없다', () => {
    for (const f of FIGURES) {
      for (const values of [{}, SAMPLE[f.id]]) {
        const b = f.build(values)
        expect(b.ok, f.id).toBe(true)
        for (const n of numbersOf(everything(b))) {
          expect(Number.isFinite(n), `${f.id}: ${n}`).toBe(true)
        }
      }
    }
  })

  it('그린 모든 도형이 box 안에 있다 — 밖이면 화면에서 잘린다', () => {
    // 치수 글자가 차지하는 자리는 viewBox 가 따로 넓히므로 여기서는 형상만 본다.
    for (const f of FIGURES) {
      for (const [name, values] of [['예시', {}], ['표본', SAMPLE[f.id]]]) {
        const b = f.build(values)
        for (const s of b.shapes) {
          const { xs, ys } = extentOf(s)
          for (const x of xs) {
            expect(x >= b.box.x - 1e-6 && x <= b.box.x + b.box.w + 1e-6,
                   `${f.id} ${name}: ${s.type} x=${x}`).toBe(true)
          }
          for (const y of ys) {
            expect(y >= b.box.y - 1e-6 && y <= b.box.y + b.box.h + 1e-6,
                   `${f.id} ${name}: ${s.type} y=${y}`).toBe(true)
          }
        }
      }
    }
  })

  it('같은 입력이면 같은 그림이다 — 숨은 상태가 없다', () => {
    for (const f of FIGURES) {
      const a = JSON.stringify(f.build(SAMPLE[f.id]))
      const b = JSON.stringify(f.build(SAMPLE[f.id]))
      expect(a, f.id).toBe(b)
    }
  })

  it('치수가 입력값을 그대로 적는다 — 배율을 곱해 적지 않는다', () => {
    // 그림은 부풀리거나 줄여도 되지만(그렇다고 적는 조건으로) 치수는 안 된다.
    for (const f of FIGURES) {
      const values = SAMPLE[f.id]
      const b = f.build(values)
      const paramKeys = new Set(f.params.map(p => p.key))
      for (const d of b.dims) {
        if (d.symbol && paramKeys.has(d.symbol) && values[d.symbol] !== undefined) {
          expect(d.value, `${f.id}: ${d.symbol}`).toBe(values[d.symbol])
        }
      }
    }
  })

  it('마구 흔든 값에도 조용히 죽지 않는다', () => {
    // ok:false 로 거절하는 것은 정상이다. 던지거나 NaN 을 그리는 것이 잘못이다.
    const rand = lcg(20260827)
    for (const f of FIGURES) {
      for (let round = 0; round < 60; round += 1) {
        const values = {}
        for (const [k, v] of Object.entries(SAMPLE[f.id])) {
          const roll = rand()
          if (roll < 0.15) continue                      // 빠뜨리기
          if (roll < 0.25) values[k] = 0                 // 0
          else if (roll < 0.35) values[k] = -v           // 부호 뒤집기
          else if (roll < 0.45) values[k] = v * 1000     // 극단적으로 크게
          else if (roll < 0.55) values[k] = v * 0.001    // 극단적으로 작게
          else values[k] = v * (0.5 + rand())            // 절반~1.5배
        }
        let b
        try {
          b = f.build(values)
        } catch (err) {
          throw new Error(`${f.id} 가 던졌다: ${JSON.stringify(values)} → ${err.message}`)
        }
        if (b.ok) {
          for (const n of numbersOf(everything(b))) {
            expect(Number.isFinite(n),
                   `${f.id}: ${JSON.stringify(values)} 에서 ${n}`).toBe(true)
          }
        } else {
          expect(typeof b.impossible, f.id).toBe('string')
        }
      }
    }
  })

  it('실제 컴포넌트로 렌더된다 — 마크업에 NaN·undefined 가 없다', () => {
    // build 가 멀쩡해도 렌더 층(labelOf·dimParts·hatch)에서 깨질 수 있다.
    for (const f of FIGURES) {
      for (const [name, values] of [['예시', {}], ['표본', SAMPLE[f.id]]]) {
        const keys = Object.keys(values)
        const figure = { kind: f.id, mapping: Object.fromEntries(keys.map(k => [k, k])) }
        const lookup = (id) => ({ value: values[id], unit: id === 'z' ? '' : 'mm' })
        const sheet = new ServerStyleSheet()
        const html = renderToStaticMarkup(
          sheet.collectStyles(<FigureView figure={figure} lookup={lookup} />),
        )
        sheet.seal()
        expect(html, `${f.id} ${name}`).toContain('<svg')
        expect(html, `${f.id} ${name}`).not.toMatch(/NaN|Infinity|undefined/)
      }
    }
  })
})

describe('물리 교차검증', () => {
  it('ㄷ형강 도심 — 다른 분해(전체 − 빈 곳)와 일치한다', () => {
    const channel = FIGURES.find(f => f.id === 'section_channel')
    const rand = lcg(7)
    for (let k = 0; k < 30; k += 1) {
      const b = 40 + rand() * 120
      const h = 80 + rand() * 220
      const tw = 4 + rand() * 10
      const tf = 5 + rand() * 14
      if (tf * 2 >= h || tw >= b) continue
      const built = channel.build({ b, h, tw, tf })
      const area = b * h - (b - tw) * (h - 2 * tf)
      const alt = (b * h * (b / 2)
        - (b - tw) * (h - 2 * tf) * (tw + (b - tw) / 2)) / area
      const dim = built.dims.find(d => d.symbol === 'x̄')
      // 치수는 표기용으로 소수 둘째 자리에서 반올림해 적는다. 그만큼만 허용.
      expect(Math.abs(dim.value - alt)).toBeLessThanOrEqual(0.005 + 1e-9)
    }
  })

  it('벨트 — 아무 값에서나 두 가닥이 두 원에 정확히 접한다', () => {
    const belt = FIGURES.find(f => f.id === 'belt')
    const rand = lcg(11)
    const distance = (s, cx, cy) => {
      const dx = s.x2 - s.x1
      const dy = s.y2 - s.y1
      return Math.abs(dy * cx - dx * cy + s.x2 * s.y1 - s.y2 * s.x1)
        / Math.hypot(dx, dy)
    }
    for (let k = 0; k < 30; k += 1) {
      const D1 = 60 + rand() * 200
      const D2 = 60 + rand() * 500
      const C = (D1 + D2) / 2 + 20 + rand() * 800
      const built = belt.build({ D1, D2, C })
      const [small, big] = [Math.min(D1, D2), Math.max(D1, D2)]
      const strands = built.shapes.filter(s => s.type === 'line' && s.role === 'body')
      for (const s of strands) {
        expect(distance(s, 0, 0)).toBeCloseTo(small / 2, 5)
        expect(distance(s, C, 0)).toBeCloseTo(big / 2, 5)
      }
    }
  })

  it('모어원 — X·Y 점이 아무 값에서나 원 위에 있다', () => {
    const mohr = FIGURES.find(f => f.id === 'mohr_circle')
    const rand = lcg(13)
    for (let k = 0; k < 30; k += 1) {
      const sx = (rand() - 0.5) * 400
      const sy = (rand() - 0.5) * 400
      const txy = (rand() - 0.5) * 200
      const built = mohr.build({ sx, sy, txy })
      if (!built.ok) continue
      const circle = built.shapes.find(s => s.type === 'circle')
      const lines = built.shapes.filter(s => s.type === 'line' && s.role === 'ghost')
      const chord = lines.reduce((a, s) => (
        Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > Math.hypot(a.x2 - a.x1, a.y2 - a.y1)
          ? s : a
      ))
      for (const [x, y] of [[chord.x1, chord.y1], [chord.x2, chord.y2]]) {
        expect(Math.hypot(x - circle.cx, y - circle.cy)).toBeCloseTo(circle.r, 5)
      }
    }
  })

  it('기어 — 이 높이가 어디서나 2.25 모듈이다', () => {
    const gear = FIGURES.find(f => f.id === 'gear')
    for (const [m, z] of [[2, 18], [4, 24], [8, 35], [3, 60]]) {
      const built = gear.build({ m, z })
      const tooth = built.shapes.find(s => s.type === 'path')
      const pts = [...tooth.d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)]
        .map(q => Math.hypot(Number(q[1]), Number(q[2])))
      const rTip = Math.max(...pts)
      const rRoot = Math.min(...pts)
      // path 좌표는 셋째 자리로 반올림해 적힌다. 그 누적만큼만 허용.
      expect(rTip - rRoot).toBeCloseTo(2.25 * m, 2)
      expect(rTip).toBeCloseTo((m * z) / 2 + m, 2)
    }
  })

  it('코일 스프링 — 소선 반지름이 아무 값에서나 준 값 그대로다', () => {
    const coil = FIGURES.find(f => f.id === 'spring_coil')
    const rand = lcg(17)
    for (let k = 0; k < 30; k += 1) {
      const d = 2 + rand() * 12
      const D = d * (3 + rand() * 12)
      const built = coil.build({ D, d, n: 3 + Math.round(rand() * 5) })
      const wires = built.shapes.filter(s => s.type === 'circle')
      for (const w of wires) expect(w.r).toBeCloseTo(d / 2, 9)
      const xs = [...new Set(wires.map(w => Math.round(w.cx * 1e6) / 1e6))]
      expect(Math.abs(xs[0] - xs[1])).toBeCloseTo(D, 5)
    }
  })
})
