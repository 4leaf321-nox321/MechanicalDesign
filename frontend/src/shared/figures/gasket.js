/**
 * 개스킷 압축 — 냉장고 도어 실, 방수 오링, 세탁기 창.
 *
 * 실링 계산의 전부는 압축률 하나다:
 *
 *     C = (h0 − h) / h0     (h0 자유 높이, h 눌린 높이)
 *
 * 그리고 이 값에는 **창이 있다.** 덜 누르면(대개 10 % 아래) 틈이 다 안 닫혀
 * 새고, 너무 누르면(대개 35 % 위) 반발력이 치솟고 고무가 영구변형(압축줄음)을
 * 일으켜 몇 달 뒤에 샌다. 더 세게 누른다고 더 잘 막는 것이 아니다 — 창을
 * 벗어나면 양쪽 다 샌다.
 *
 * h0 와 h 두 숫자를 나란히 놓아도 지금이 창 안인지 밖인지는 안 보인다.
 * 그림이 자유 상태와 눌린 상태를 나란히 그리고, 판정을 대신 말한다.
 */

import { ROLE, bounds, dim, path, positive, rect, tag } from './geometry'

const PARAMS = [
  { key: 'h0', label: '자유 높이', required: true },
  { key: 'h', label: '눌린 높이', required: true },
  { key: 'w', label: '단면 폭', required: false },
]

const EXAMPLE = { h0: 12, h: 9 }

/** 압축률 창 — 재질·단면마다 다르지만 대개 이 언저리를 쓴다. */
const C_LOW = 10
const C_HIGH = 35

function build(values) {
  const missing = PARAMS.filter(p => p.required && !positive(values[p.key]))
  const example = missing.length > 0
  const h0 = example ? EXAMPLE.h0 : positive(values.h0)
  const h = example ? EXAMPLE.h : positive(values.h)

  const notes = []
  const givenW = example ? null : positive(values.w)
  const wv = givenW || h0 * 0.8
  if (!example && !givenW) {
    notes.push('단면 폭이 배선되지 않아 보기 좋은 비율로 그렸습니다.')
  }

  // 눌리지 않은 경우도 그린다 — 틈이 남는 것이 곧 판정이다.
  const squeezed = Math.min(h, h0)
  const gapLeft = h - squeezed                       // h > h0 면 남는 틈

  const spacing = wv * 2.1
  const xL = -spacing / 2
  const xR = spacing / 2
  const tf = h0 * 0.32
  const flangeW = wv * 1.9

  const shapes = [
    // 플랜지는 개스킷과 다른 부재다 — 해칭을 반대로 쳐서 가른다.
    rect(xL - flangeW / 2, 0, spacing + flangeW, tf, ROLE.cut, true),
    rect(xR - flangeW / 2, -h - tf, flangeW, tf, ROLE.cut, true),
    // 자유 상태 — 아직 안 눌린 단면.
    rect(xL - wv / 2, -h0, wv, h0, ROLE.cut),
  ]

  // 눌린 상태 — 줄어든 높이만큼 옆으로 배가 나온다. 고무는 부피가 거의 안
  // 줄기 때문이고, 이 배가 곧 「눌렸다」 는 표시다.
  const bulge = (h0 - squeezed) * 0.38
  shapes.push(path(
    `M ${xR - wv / 2} ${-squeezed} L ${xR + wv / 2} ${-squeezed}`
    + ` Q ${xR + wv / 2 + bulge} ${-squeezed / 2} ${xR + wv / 2} 0`
    + ` L ${xR - wv / 2} 0`
    + ` Q ${xR - wv / 2 - bulge} ${-squeezed / 2} ${xR - wv / 2} ${-squeezed} Z`,
    ROLE.cut,
  ))

  const pad = h0 * 0.42
  const shown = (v) => (example ? null : v)
  const dims = [
    dim([xL - wv / 2, -h0], [xL - wv / 2, 0],
        { offset: -pad, label: '{}', symbol: 'h0',
          value: shown(h0), unit: values._units?.h0 }),
    // h 는 개스킷이 아니라 **플랜지 사이 틈**에서 잰다 — 조립이 정하는 값이다.
    dim([xR + flangeW / 2, -h], [xR + flangeW / 2, 0],
        { offset: pad * 0.7, label: '{}', symbol: 'h',
          value: shown(h), unit: values._units?.h }),
  ]
  if (example || givenW) {
    dims.push(dim([xL - wv / 2, -h0], [xL + wv / 2, -h0],
                  { offset: -pad * 0.7, label: '{}', symbol: 'w',
                    value: example ? null : givenW, unit: values._units?.w }))
  }

  const tags = [
    tag(xL, pad * 1.6 + tf, '자유', 'middle'),
    tag(xR, pad * 1.6 + tf, '조립', 'middle'),
  ]

  if (!example) {
    if (h >= h0) {
      notes.push(`눌린 높이(${h})가 자유 높이(${h0}) 이상입니다 — 개스킷이 눌리지`
        + ' 않아 틈이 그대로 샙니다.')
    } else {
      const c = Math.round(((h0 - h) / h0) * 1000) / 10
      if (c < C_LOW) {
        notes.push(`압축률 C = ${c} % 입니다 (구한 값) — ${C_LOW} % 아래라 틈이`
          + ' 다 안 닫혀 샐 수 있습니다.')
      } else if (c > C_HIGH) {
        notes.push(`압축률 C = ${c} % 입니다 (구한 값) — ${C_HIGH} % 위라 반발력이`
          + ' 치솟고, 영구변형(압축줄음)으로 시간이 지나며 샙니다.')
      } else {
        notes.push(`압축률 C = ${c} % 입니다 (구한 값, 대개 ${C_LOW}~${C_HIGH} % 창을`
          + ' 씁니다 — 재질·단면마다 다릅니다).')
      }
    }
  }
  notes.push('더 세게 누른다고 더 잘 막는 것이 아닙니다 — 창을 벗어나면 양쪽 다 샙니다.')
  notes.push('반발력은 그대로 문을 닫는 힘이 됩니다 — 냉장고 문이 무거워지는 그 힘입니다.')
  notes.push('플랜지 크기는 보기 좋은 비율일 뿐, 계산에는 h0 와 h 만 쓰입니다.')

  if (gapLeft > 0) {
    // 안 눌린 채 틈이 남았다. 그 틈을 손가락으로 짚는다.
    tags.push(tag(xR + wv * 0.9, -h + gapLeft * 0.5, '틈', 'start'))
  }

  return {
    ok: true,
    example,
    missing: missing.map(p => p.key),
    shapes,
    dims,
    tags,
    notes,
    box: bounds([...shapes, ...dims, ...tags]),
  }
}

export default {
  id: 'gasket_seal',
  name: '개스킷 압축',
  summary: '자유·조립 상태를 나란히. 압축률이 창(10~35 %) 안인지 판정합니다.',
  params: PARAMS,
  build,
}
