/**
 * 리벳 이음 — 겹치기 이음의 옆면.
 *
 * 리벳 계산이 실제로 무엇을 재는지는 **어디가 먼저 끊어지느냐**로 갈린다. 한
 * 이음에서 세 가지 파손이 서로 경쟁한다:
 *
 *     리벳 전단   판이 맞닿은 면에서 리벳이 잘린다      d
 *     판 압축     구멍 벽이 눌려 늘어난다               d 와 t
 *     판 인장     리벳 사이에 남은 살이 찢어진다        p 와 t
 *
 * 셋 다 `d`·`t`·`p` 라는 같은 세 값에서 나오는데, 숫자만 봐서는 어느 자리
 * 이야기인지 알 수 없다. 그림은 그 자리를 짚는다 — 전단면은 두 판 사이, 압축은
 * 구멍 벽, 인장은 리벳 사이의 남은 폭이다.
 *
 * 하중 화살표는 **바깥을 향한다.** 이음을 잡아당겨야 맞닿은 면에서 리벳이
 * 잘린다. 안쪽으로 그리면 누르는 그림이 되어 계산과 다른 말을 한다.
 */

import { ROLE, bounds, dim, flow, line, path, positive, rect } from './geometry'

const PARAMS = [
  { key: 'd', label: '리벳 지름', required: true },
  { key: 't', label: '판 두께', required: true },
  { key: 'p', label: '피치', required: false },
  { key: 'n', label: '리벳 수', required: false },
]

const EXAMPLE = { d: 16, t: 10, p: 48, n: 3 }

/** 리벳을 몇 개까지 그릴까. 넘으면 안 읽히기만 하고 뜻이 늘지 않는다. */
const MAX_RIVETS = 6

function build(values) {
  const missing = PARAMS.filter(p => p.required && !positive(values[p.key]))
  const example = missing.length > 0
  const d = example ? EXAMPLE.d : positive(values.d)
  const t = example ? EXAMPLE.t : positive(values.t)

  const notes = []

  // 피치를 안 주면 3d 로 그린다. 관례 값이라 형상은 그럴듯하지만 **카드의 값이
  // 아니므로 치수를 안 붙인다** — 붙이면 없는 숫자를 지어낸 것이 된다.
  const givenP = example ? EXAMPLE.p : positive(values.p)
  const pitch = givenP || d * 3
  if (!givenP) {
    notes.push('피치가 배선되지 않아 3d 로 그렸습니다 — 그 치수를 안 붙인 것은 그래서입니다.')
  }

  const asked = Math.round((example ? EXAMPLE.n : positive(values.n)) || 3)
  const n = Math.min(Math.max(asked, 1), MAX_RIVETS)
  if (asked > MAX_RIVETS) {
    notes.push(`리벳 ${asked}개 중 ${MAX_RIVETS}개만 그렸습니다 — 나머지도 같은 간격입니다.`)
  }

  const edge = d * 1.5                      // 연거리 — 리벳에서 판 끝까지
  const span = (n - 1) * pitch
  // 판이 이음 밖으로 뻗은 길이. **짧게 잡는다** — 이 부분은 아무 값도 안 나르는데
  // 길면 그림 전체가 납작해져서 정작 봐야 할 겹친 자리가 안 읽힌다.
  const reach = Math.max(d * 2, pitch * 0.5)
  const aLeft = -edge - reach
  const aRight = span + edge
  const bLeft = -edge
  const bRight = span + edge + reach

  // 두 판의 해칭을 **서로 반대로** 친다. 맞붙은 다른 부재라는 제도 관례이고,
  // 여기서는 그것 말고 두 판을 갈라 볼 방법이 없다 — 두께가 같아서 나란히 치면
  // 한 장짜리 판으로 읽힌다.
  const shapes = [
    rect(aLeft, -t, aRight - aLeft, t, ROLE.cut),           // 위 판
    rect(bLeft, 0, bRight - bLeft, t, ROLE.cut, true),      // 아래 판
  ]

  // 리벳은 **단면을 치지 않는다.** 체결물은 잘라 그리지 않는 것이 관례이고,
  // 해칭이 없어야 판과 구별된다. 판보다 나중에 그려 뒤를 가린다.
  const hw = d * 0.8
  const hh = d * 0.75
  for (let i = 0; i < n; i += 1) {
    const x = i * pitch
    shapes.push(rect(x - d / 2, -t, d, t * 2, ROLE.front))
    shapes.push(path(`M ${x - hw} ${-t} Q ${x} ${-t - hh * 1.6} ${x + hw} ${-t} Z`, ROLE.front))
    shapes.push(path(`M ${x - hw} ${t} Q ${x} ${t + hh * 1.6} ${x + hw} ${t} Z`, ROLE.front))
    shapes.push(line(x, -t - hh * 1.9, x, t + hh * 1.9, ROLE.center))
  }

  // 잡아당기는 힘. 판 끝에서 시작해 바깥으로 나간다.
  const flows = example ? [] : [
    flow(aLeft, -t / 2, aLeft - reach * 0.7, -t / 2, 'W'),
    flow(bRight, t / 2, bRight + reach * 0.7, t / 2, 'W'),
  ]

  const shown = (v) => (example ? null : v)
  const low = t + hh * 1.9
  const dims = [
    dim([-d / 2, low], [d / 2, low],
        { offset: d * 1.2, label: 'Ø{}', symbol: 'd',
          value: shown(d), unit: values._units?.d }),
    // 판 두께는 **겹치는 쪽 끝**에서 잰다. 판 바깥쪽 끝은 하중 화살표 자리다.
    dim([bLeft, 0], [bLeft, t],
        { offset: -d * 1.1, label: '{}', symbol: 't',
          value: shown(t), unit: values._units?.t }),
  ]
  if (givenP && n > 1) {
    dims.push(dim([0, -low], [pitch, -low],
                  { offset: -d * 1.2, label: '{}', symbol: 'p',
                    value: shown(pitch), unit: values._units?.p }))
  }

  // 전단면은 두 판이 맞닿은 자리라 **선을 그으면 판 경계에 묻혀 안 보인다.**
  // 지시선으로 짚되 **오른쪽 위**로 뺀다 — 바로 위는 피치 치수가, 아래는 지름
  // 치수가 이미 쓰고 있고, 마지막 리벳과 판 끝 사이가 유일하게 빈 자리다.
  const foot = span + edge * 0.55
  const rise = t + hh * 2.4
  const elbow = foot + d * 1.1
  shapes.push(line(foot, 0, elbow, -rise, ROLE.ghost))
  shapes.push(line(elbow, -rise, elbow + d * 0.5, -rise, ROLE.ghost))
  const tags = [{ type: 'tag', x: elbow + d * 0.7, y: -rise + d * 0.16,
                  text: '전단면', anchor: 'start' }]

  if (!example) {
    notes.push('머리 모양과 판이 뻗은 길이는 보기 좋은 비율일 뿐, 계산에 쓰이지 않습니다.')
  }

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
  id: 'rivet',
  name: '리벳 이음',
  summary: '겹치기 이음. 전단면·구멍 벽·리벳 사이 살을 한 그림에서 짚습니다.',
  params: PARAMS,
  build,
}
