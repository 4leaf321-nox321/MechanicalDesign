/**
 * 기둥 좌굴 도해.
 *
 * 이 도해의 전부는 **단말계수 n 이 그림과 맞느냐**다. n 하나로 좌굴하중이 열여섯
 * 배 갈리는데 화면에서는 숫자 칸 하나일 뿐이라, 그림이 n 을 되읽어 줘야 실제
 * 구조와 어긋난 것이 눈에 띈다.
 *
 * 그래서 휜 모양이 **진짜 좌굴 형상**이어야 한다. 대충 그린 반원은 어느 조건에서나
 * 비슷해 보여서 n 을 되읽어 주지 못한다. 여기서는 끝단의 조건을 곡선에서 직접
 * 잰다 — 고정단은 처짐도 기울기도 0, 핀은 처짐만 0.
 */

import { describe, expect, it } from 'vitest'
import column from './column'

const curveOf = (b) => {
  const p = b.shapes.find(s => s.type === 'path' && s.role === 'hidden')
  return p.d.replace('M ', '').split(' L ')
    .map(pair => pair.split(' ').map(Number))
}

/**
 * 끝단의 **첫 걸음과 둘째 걸음의 비.** 기울기가 0인 끝(고정)은 곡선이 s² 로
 * 시작해 1 : 3 이 되고, 기울기가 있는 끝(핀·자유)은 s 로 시작해 1 : 1 이 된다.
 *
 * 배율과 무관한 값이라 진폭을 얼마로 그리든 흔들리지 않는다.
 */
function startRatio(points) {
  const d1 = Math.abs(points[1][0] - points[0][0])
  const d2 = Math.abs(points[2][0] - points[1][0])
  return d1 / d2
}

const endRatio = (points) => startRatio([...points].reverse())

describe('휜 모양이 그 조건의 좌굴 형상이다', () => {
  // 곡선의 아래끝(첫 점)이 s=0, 위끝(마지막 점)이 s=1 이다.
  it('핀 – 핀 : 양끝 다 처짐 0, 기울기는 있다', () => {
    const p = curveOf(column.build({ L: 3000, n: 1 }))
    expect(p[0][0]).toBeCloseTo(0, 6)
    expect(p[p.length - 1][0]).toBeCloseTo(0, 6)
    expect(startRatio(p)).toBeGreaterThan(0.8)
    expect(endRatio(p)).toBeGreaterThan(0.8)
  })

  it('고정 – 고정 : 양끝 다 기울기가 0이다', () => {
    const p = curveOf(column.build({ L: 3000, n: 4 }))
    expect(startRatio(p)).toBeLessThan(0.5)
    expect(endRatio(p)).toBeLessThan(0.5)
  })

  it('고정 – 자유 : 아래는 기울기 0, 위는 가장 많이 휜다', () => {
    const p = curveOf(column.build({ L: 3000, n: 0.25 }))
    expect(startRatio(p)).toBeLessThan(0.5)
    const top = p[p.length - 1][0]
    expect(Math.max(...p.map(q => q[0]))).toBeCloseTo(top, 6)
  })

  it('고정 – 핀 : 아래만 기울기 0이다', () => {
    const p = curveOf(column.build({ L: 3000, n: 2 }))
    expect(startRatio(p)).toBeLessThan(0.5)
    expect(endRatio(p)).toBeGreaterThan(0.8)
    // 진폭 **대비**로 재다 — 그려진 크기가 바뀌어도 뜻은 같아야 한다.
    const peak = Math.max(...p.map(q => q[0]))
    expect(Math.abs(p[p.length - 1][0]) / peak).toBeLessThan(1e-6)
  })

  it('고정 – 핀의 최대 휨은 한가운데가 아니라 고정단에서 0.6L 쯤이다', () => {
    // **이 시험이 이 파일의 이유다.** 반원으로 대충 그리면 여기서 걸린다.
    const p = curveOf(column.build({ L: 3000, n: 2 }))
    const peak = p.reduce((a, q) => (q[0] > a[0] ? q : a))
    const fromFixed = (3000 - peak[1]) / 3000        // y = L 이 고정단
    expect(fromFixed).toBeGreaterThan(0.55)
    expect(fromFixed).toBeLessThan(0.65)
  })
})

describe('n 에서 조건을 고른다', () => {
  const nameOf = (n) => column.build({ L: 3000, n }).tags[0].text

  it('표준 값은 그대로 간다', () => {
    expect(nameOf(0.25)).toBe('고정 – 자유')
    expect(nameOf(1)).toBe('핀 – 핀')
    expect(nameOf(2)).toBe('고정 – 핀')
    expect(nameOf(4)).toBe('고정 – 고정')
  })

  it('어중간한 값은 **비율로** 가까운 쪽을 고른다', () => {
    // n=0.6 은 차이로 재면 0.25(0.35 차이)가 1(0.4 차이)보다 가깝지만, n 은
    // 0.25에서 4까지 걸쳐 있어 차이로 재면 큰 쪽만 촘촘해진다. 0.25와 1의
    // 기하평균이 0.5 이므로 0.6 은 1 쪽이다.
    expect(nameOf(0.6)).toBe('핀 – 핀')
    expect(nameOf(0.4)).toBe('고정 – 자유')
  })

  it('표준 값이 아니면 무엇으로 바꿔 그렸는지 적는다', () => {
    const b = column.build({ L: 3000, n: 1.5 })
    expect(b.notes.some(t => t.includes('1.5') && t.includes('고정 – 핀'))).toBe(true)
  })

  it('n 이 없으면 핀 – 핀으로 그리고 그렇다고 적는다', () => {
    const b = column.build({ L: 3000 })
    expect(b.tags[0].text).toBe('핀 – 핀')
    expect(b.notes.some(t => t.includes('배선되지'))).toBe(true)
  })

  it('어떤 조건으로 그렸는지 **늘** 적는다', () => {
    // 실제 구조와 다르면 여기서 걸려야 한다.
    for (const n of [0.25, 1, 2, 4]) {
      const b = column.build({ L: 3000, n })
      expect(b.notes.some(t => t.includes('실제 구조와 다르면'))).toBe(true)
    }
  })
})

describe('지점과 하중', () => {
  it('위끝이 자유면 위에 지점 기호가 없다', () => {
    const free = column.build({ L: 3000, n: 0.25 })
    const both = column.build({ L: 3000, n: 4 })
    const walls = (b) => b.shapes.filter(s => s.type === 'rect' && s.role === 'cut')
    expect(walls(free)).toHaveLength(1)
    expect(walls(both)).toHaveLength(2)
  })

  it('하중 화살표가 위끝 지점 기호보다 위에 있다', () => {
    // 겹치면 어느 쪽이 기호이고 어느 쪽이 힘인지 안 읽힌다.
    const b = column.build({ L: 3000, n: 4, P: 80000 })
    const wallTop = Math.min(...b.shapes
      .filter(s => s.type === 'rect' && s.role === 'cut').map(s => s.y))
    expect(b.flows[0].y2).toBeLessThan(wallTop)
  })

  it('축하중이 없으면 화살표를 안 그린다', () => {
    expect(column.build({ L: 3000, n: 1 }).flows).toHaveLength(0)
  })
})

describe('치수', () => {
  it('길이 치수가 휜 쪽 반대편으로 간다', () => {
    // 곡선은 +x 로 부푼다. 같은 쪽이면 치수선이 형상을 가로지른다.
    const b = column.build({ L: 3000, n: 1 })
    expect(b.dims[0].offset).toBeLessThan(0)
  })

  it('휨량은 임의 배율이라고 적는다', () => {
    const b = column.build({ L: 3000, n: 1 })
    expect(b.notes.some(t => t.includes('임의 배율'))).toBe(true)
  })
})

describe('값이 아직 없을 때', () => {
  it('보기 비율로 그리고 숫자를 안 적는다', () => {
    const b = column.build({ n: 4 })
    expect(b.example).toBe(true)
    expect(b.missing).toEqual(['L'])
    expect(b.dims.every(d => d.value === null)).toBe(true)
  })
})
