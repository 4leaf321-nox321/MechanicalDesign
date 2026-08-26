/**
 * 볼트 이음 — 두 판을 볼트 하나로 죈 모습.
 *
 * 볼트 검토는 **어느 단면이 견디는가**로 갈린다. 인장이면 나사부의 유효단면적이,
 * 전단이면 판 사이를 지나는 몸통 단면이 버틴다. 그림이 그 자리를 가리켜야 한다.
 *
 * ## 왜 판을 함께 그리는가
 *
 * 볼트만 그리면 「어디가 전단면인가」 를 말할 수 없다. 전단면은 볼트에 있는 것이
 * 아니라 **판이 맞닿은 자리**에 있다 — 판 둘을 그려야 그 경계가 생긴다. 판
 * 두께는 카드에 없는 값이라 보기 좋은 비율로만 그리고 치수를 안 붙인다.
 */

import { ROLE, bounds, dim, flow, line, positive, rect } from './geometry'

const PARAMS = [
  { key: 'd', label: '볼트 지름', required: true },
  { key: 'L', label: '볼트 길이', required: false },
  { key: 'F', label: '하중', required: false },
]

const EXAMPLE = { d: 12 }

/** 머리·판·나사부를 지름 대비 몇 배로 그릴까. 전부 그림용이고 치수는 안 붙는다. */
const HEAD_D = 1.7
const HEAD_H = 0.7
const PLATE = 0.8
const NUT_H = 0.8

function build(values) {
  const missing = PARAMS.filter(p => p.required && !positive(values[p.key]))
  const example = missing.length > 0
  const d = example ? EXAMPLE.d : positive(values.d)

  const givenL = example ? null : positive(values.L)
  // 판 둘과 너트는 볼트 길이 **안에** 들어가야 한다. 기본 비율(지름 기준)로는
  // M12×20 같은 짧은 실제 규격에서 너트가 판 속에 그려진다 — 볼트 지름은 준
  // 값이라 못 건드리지만, 판·너트는 그림용 값이므로 길이에 맞춰 세로만 조인다.
  // 가로(머리 지름·판 폭)는 지름 기준 그대로다.
  const squeeze = givenL
    ? Math.min(1, givenL / (d * (PLATE * 2 + NUT_H) * 1.25))
    : 1
  const plate = d * PLATE * squeeze
  const headH = d * HEAD_H
  const headR = (d * HEAD_D) / 2
  const nutH = d * NUT_H * squeeze
  // 길이를 안 주면 머리 밑에서 너트 끝까지 딱 맞는 만큼만.
  const L = givenL || plate * 2 + nutH * 1.4

  const shapes = []
  const top = 0                               // 판 윗면 = 머리 밑면
  const plateW = headR * 3.2

  // **판을 먼저, 볼트를 나중에.** 순서를 바꾸면 판이 볼트를 덮어 몸통이 사라진다.
  //
  // 판은 잘린 면이라 해칭하고, **볼트는 해칭하지 않는다** — 체결물은 단면을 치지
  // 않는 것이 도면 관례다. 그 덕에 해칭 유무만으로 둘이 갈린다.
  shapes.push(rect(-plateW / 2, top, plateW, plate, ROLE.cut))
  shapes.push(rect(-plateW / 2, top + plate, plateW, plate, ROLE.cut))

  // 전단면 — 두 판이 맞닿은 자리. 전단면은 볼트가 아니라 **여기**에 있다.
  shapes.push(line(-plateW * 0.66, top + plate, plateW * 0.66, top + plate, ROLE.ghost))

  // 볼트 몸통·머리·너트. 세로로 세운다 — 인장이 위아래로 걸리는 모양이라 읽힌다.
  shapes.push(rect(-d / 2, top, d, L, ROLE.front))
  shapes.push(rect(-headR, top - headH, headR * 2, headH, ROLE.front))
  shapes.push(rect(-headR, top + L - nutH, headR * 2, nutH, ROLE.front))
  shapes.push(line(0, top - headH - d * 0.4, 0, top + L + d * 0.4, ROLE.center))

  const flows = []
  if (!example && positive(values.F)) {
    // **바깥쪽을 향한다.** 안쪽으로 그리면 누르는 그림이 되어, 인장 검토인데
    // 압축으로 읽힌다. 화살표 둘이라야 「잡아당겨진다」 가 된다.
    flows.push(flow(0, top - headH - d * 0.4, 0, top - headH - d * 1.6, 'F'))
    flows.push(flow(0, top + L + d * 0.4, 0, top + L + d * 1.6, 'F'))
  }

  const pad = d * 1.5
  const at = (key) => (example ? null : positive(values[key]))
  const dims = [
    // 너트 아래로 뺀다. 몸통 위에 두면 글자가 형상과 엉켜 치수인지 선인지 모른다.
    dim([-d / 2, top + L], [d / 2, top + L],
        // 하중 화살표보다 **더 아래로.** 겹치면 「F」 와 「Ø12 mm」 가 엉킨다.
        { offset: d * 2.3, label: 'Ø{}', symbol: 'd',
          value: at('d'), unit: values._units?.d }),
  ]
  if (givenL) {
    dims.push(dim([-d / 2, top], [-d / 2, top + L],
                  { offset: -pad, label: '{}', symbol: 'L',
                    value: L, unit: values._units?.L }))
  }

  const notes = []
  if (!example) {
    notes.push('판 두께와 머리·너트 크기는 이 계산에 쓰이지 않아 보기 좋은 비율로만 그렸습니다.')
  }

  return {
    ok: true,
    example,
    missing: missing.map(p => p.key),
    shapes,
    flows,
    dims,
    notes,
    box: bounds([...shapes, ...dims, ...flows]),
  }
}

export default {
  id: 'bolt',
  name: '볼트 이음',
  summary: '볼트 지름 하나면 그려집니다. 두 판의 경계가 전단면입니다.',
  params: PARAMS,
  build,
}
