/**
 * 기둥 좌굴 — 오일러 하중과 그 **단말 조건**.
 *
 *     Pcr = n · π² E I / L²
 *
 * 여기서 `n` 이 하는 일은 다른 어떤 값도 못 한다. 길이도 단면도 그대로인데 양끝을
 * 어떻게 잡느냐만으로 좌굴하중이 **열여섯 배** 갈린다 (1/4 대 4). 그런데 숫자
 * 화면에서는 그냥 `n = 4` 라고 적힌 칸 하나일 뿐이라, 그 값이 「양끝 고정」을
 * 뜻한다는 것도, 지금 설계가 정말 양끝 고정인지도 눈에 안 들어온다.
 *
 * 그래서 이 도해는 `n` 을 **그림으로 되읽는다.** 값을 넣으면 그에 맞는 지점
 * 기호와 휜 모양이 나오므로, 실제 구조와 다르면 그림에서 바로 어긋나 보인다.
 *
 * 휜 모양은 대충 그린 곡선이 아니라 각 조건의 **좌굴 형상 자체**다. 고정–핀은
 * tan(kL) = kL 의 해 kL = 4.4934 에서 나오고, 그래서 최대 휨이 한가운데가 아니라
 * 고정단에서 0.6L 쯤에 온다 — 대충 그린 반원과 다른 자리다.
 */

import { ROLE, bounds, dim, flow, path, positive, rect } from './geometry'
import { fixed as fixedEnd, pin, roller } from './supports'

const PARAMS = [
  { key: 'L', label: '기둥 길이', required: true },
  { key: 'n', label: '단말계수', required: false },
  { key: 'P', label: '축하중', required: false },
]

const EXAMPLE = { L: 3000, n: 1 }

/**
 * 고정–핀 조건의 특성근. tan(kL) = kL 의 첫 해.
 *
 * 자릿수를 다 적는 이유: 이 값이 바로 위끝의 처짐을 0으로 만드는 근이라,
 * 4.4934 로 끊으면 곡선이 핀 자리를 살짝 빗나간다. 눈으로는 모르지만
 * 「여기가 처짐 0이다」 를 재는 시험은 그 차이를 본다.
 */
const FIXED_PINNED = 4.493409457909064

/**
 * 단말 조건 넷. `n` 이 곧 이름이다.
 *
 * `shape(s)` 는 아래끝(s=0)에서 위끝(s=1)까지의 좌굴 형상이고, 크기는 여기서
 * 맞추지 않는다 — 그릴 때 최댓값으로 나눈다. 그래야 식을 손댈 때 배율까지 같이
 * 계산할 일이 없다.
 */
const ENDS = [
  { n: 0.25, name: '고정 – 자유', bottom: 'fixed', top: 'free',
    shape: (s) => 1 - Math.cos((Math.PI * s) / 2) },
  { n: 1, name: '핀 – 핀', bottom: 'pin', top: 'roller',
    shape: (s) => Math.sin(Math.PI * s) },
  { n: 2, name: '고정 – 핀', bottom: 'fixed', top: 'roller',
    shape: (s) => {
      const a = FIXED_PINNED
      return Math.sin(a * s) - a * Math.cos(a * s) - a * s + a
    } },
  { n: 4, name: '고정 – 고정', bottom: 'fixed', top: 'fixed',
    shape: (s) => (1 - Math.cos(2 * Math.PI * s)) / 2 },
]

/** 곡선을 몇 토막으로 나눠 그릴까. */
const STEPS = 56

/**
 * 준 `n` 에 가장 가까운 조건. **비율로** 잰다 — n 은 0.25 에서 4 까지라
 * 차이로 재면 큰 쪽만 촘촘해진다.
 */
function nearest(n) {
  return ENDS.reduce((best, e) => (
    Math.abs(Math.log(e.n / n)) < Math.abs(Math.log(best.n / n)) ? e : best
  ), ENDS[0])
}

function endSymbol(which, x, y, size, dir) {
  if (which === 'fixed') return fixedEnd(x, y, size, dir)
  if (which === 'roller') return roller(x, y, size, dir)
  if (which === 'pin') return pin(x, y, size, dir)
  return []
}

function build(values) {
  const missing = PARAMS.filter(p => p.required && !positive(values[p.key]))
  const example = missing.length > 0
  const L = example ? EXAMPLE.L : positive(values.L)

  const notes = []
  const given = example ? EXAMPLE.n : positive(values.n)
  const end = nearest(given || 1)
  if (!given) {
    notes.push('단말계수가 배선되지 않아 핀 – 핀(n = 1) 으로 그렸습니다.')
  } else if (Math.abs(given - end.n) > end.n * 0.02) {
    notes.push(`단말계수 n = ${given} 에 가장 가까운 ${end.name}(n = ${end.n}) 으로 그렸습니다.`)
  }
  // 그림이 무엇을 말하는지 **항상** 적는다. 실제 구조와 다르면 여기서 걸린다.
  notes.push(`이 그림은 ${end.name} 조건입니다 — 실제 구조와 다르면 n 을 고쳐야 합니다.`)

  // SVG 는 y 가 아래로 간다. 아래끝을 y = L, 위끝을 y = 0 에 둔다.
  const width = L * 0.045
  const size = L * 0.05
  const shapes = [rect(-width / 2, 0, width, L)]

  shapes.push(...endSymbol(end.bottom, 0, L, size, [0, 1]))
  shapes.push(...endSymbol(end.top, 0, 0, size, [0, -1]))

  // 좌굴 형상. 최댓값으로 나눠 배율을 맞춘다.
  const raw = []
  for (let i = 0; i <= STEPS; i += 1) {
    const s = i / STEPS
    raw.push([end.shape(s), L - s * L])
  }
  const peak = Math.max(...raw.map(q => Math.abs(q[0]))) || 1
  const amp = L * 0.11
  const curve = raw.map(([v, y]) => `${((v / peak) * amp).toFixed(3)} ${y.toFixed(3)}`)
  shapes.push(path(`M ${curve.join(' L ')}`, ROLE.hidden))

  // 위끝에 지점 기호가 있으면 하중 화살표를 그 위로 뺀다. 겹치면 어느 쪽이
  // 기호이고 어느 쪽이 힘인지 안 읽힌다.
  const headroom = end.top === 'free' ? 0 : size * 3.4
  const reach = L * 0.15
  const flows = []
  if (!example && positive(values.P)) {
    flows.push(flow(0, -headroom - reach, 0, -headroom - reach * 0.15, 'P'))
  }

  const dims = [
    // 휜 모양은 오른쪽으로 부푼다. 치수는 반대쪽으로 뺀다.
    dim([-width / 2, 0], [-width / 2, L],
        { offset: -L * 0.13, label: '{}', symbol: 'L',
          value: example ? null : L, unit: values._units?.L }),
  ]

  const tags = [
    { type: 'tag', x: amp * 1.25, y: L * 0.45, text: end.name, anchor: 'start' },
    { type: 'tag', x: amp * 1.25, y: L * 0.45 + size * 1.5,
      text: `n = ${end.n}`, anchor: 'start' },
  ]

  notes.push('휜 정도는 형상을 보이기 위한 임의 배율입니다 — 실제 변형량이 아닙니다.')

  return {
    ok: true,
    example,
    missing: missing.map(p => p.key),
    shapes,
    flows,
    dims,
    tags,
    notes,
    box: bounds([...shapes, ...dims, ...flows, ...tags]),
  }
}

export default {
  id: 'column',
  name: '기둥 좌굴',
  summary: '단말계수 n 을 지점 기호와 좌굴 형상으로 되읽습니다.',
  params: PARAMS,
  build,
}
