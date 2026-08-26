/**
 * 리브 — 몸살에 세운 보강 살과, 그 반대편의 싱크마크.
 *
 * 사출물 보강의 제1규칙이 여기 있다: **리브 뿌리는 몸살보다 얇아야 한다**
 * (외관면 기준 0.5~0.6 배). 이유가 그림이 아니면 안 보인다 — 리브가 붙은
 * 자리는 살이 두꺼워져 늦게 식고, 식으며 수축하는 살이 겉을 끌어들여
 * **리브 반대쪽 면**이 옴폭 꺼진다. 그게 싱크마크다.
 *
 * 함정이 정확히 거기다. 결함은 리브 쪽이 아니라 맞은편에 나는데, 맞은편이
 * 대개 외관면이다. `t`·`tr` 라는 숫자 둘만 봐서는 어느 면이 외관인지, 결함이
 * 어느 쪽에 날지 아무것도 안 보인다.
 */

import { ROLE, bounds, dim, line, path, positive, rect, tag } from './geometry'

const PARAMS = [
  { key: 't', label: '몸살 두께', required: true },
  { key: 'tr', label: '리브 뿌리 두께', required: true },
  { key: 'H', label: '리브 높이', required: false },
]

const EXAMPLE = { t: 2.5, tr: 1.25, H: 6 }

/** 외관면 기준으로 흔히 쓰는 리브/몸살 비의 상한. */
const RATIO_LIMIT = 0.6
/** 리브 높이의 권고 상한 — 몸살의 몇 배까지. */
const HEIGHT_LIMIT = 3

function build(values) {
  const missing = PARAMS.filter(p => p.required && !positive(values[p.key]))
  const example = missing.length > 0
  const t = example ? EXAMPLE.t : positive(values.t)
  const tr = example ? EXAMPLE.tr : positive(values.tr)

  const notes = []
  const givenH = example ? null : positive(values.H)
  const H = example ? EXAMPLE.H : (givenH || t * 2.5)
  if (!example && !givenH) {
    notes.push('리브 높이가 배선되지 않아 몸살의 2.5 배로 그렸습니다.')
  }

  const W = Math.max(H * 2.4, t * 9)
  const shapes = [
    // 몸살과 리브는 한 몸이다. 해칭 방향도 같다 — 다른 부재가 아니다.
    rect(-W / 2, 0, W, t, ROLE.cut),
    rect(-tr / 2, t, tr, H, ROLE.cut),
  ]

  // 싱크마크 — 리브 **반대쪽** 면이 옴폭 꺼진다. 참고선으로 과장해 그린다.
  shapes.push(path(
    `M ${-tr * 1.4} 0 Q 0 ${t * 0.3} ${tr * 1.4} 0`, ROLE.ghost,
  ))
  const lift = Math.max(t * 2.2, H * 0.4)
  shapes.push(line(0, t * 0.15, tr * 1.8, -lift, ROLE.ghost))
  const tags = [tag(tr * 2, -lift - t * 0.2, '싱크마크는 이쪽(외관면)에', 'start')]

  const pad = W * 0.09
  const shown = (v) => (example ? null : v)
  const dims = [
    dim([-W / 2, 0], [-W / 2, t],
        { offset: -pad * 0.7, label: '{}', symbol: 't',
          value: shown(t), unit: values._units?.t }),
    dim([-tr / 2, t + H], [tr / 2, t + H],
        { offset: pad * 0.8, label: '{}', symbol: 'tr',
          value: shown(tr), unit: values._units?.tr }),
  ]
  if (example || givenH) {
    dims.push(dim([tr / 2, t], [tr / 2, t + H],
                  { offset: pad * 2.4, label: '{}', symbol: 'H',
                    value: example ? null : givenH, unit: values._units?.H }))
  }

  if (!example) {
    const ratio = Math.round((tr / t) * 100) / 100
    if (ratio > RATIO_LIMIT) {
      notes.push(`리브 뿌리가 몸살의 ${ratio} 배입니다 — 외관면 기준 0.5~0.6 배를`
        + ' 넘으면 맞은편에 싱크마크가 나기 쉽습니다.')
    } else {
      notes.push(`tr/t = ${ratio} 입니다 (외관면 기준 0.5~0.6 배 이하를 씁니다).`)
    }
    if (givenH && givenH > t * HEIGHT_LIMIT) {
      notes.push(`리브 높이가 몸살의 ${Math.round((givenH / t) * 10) / 10} 배입니다`
        + ` — ${HEIGHT_LIMIT} 배를 넘으면 하나를 높이는 대신 여럿으로 나눠 세웁니다.`)
    }
  }
  notes.push('두꺼워진 뿌리가 늦게 식으며 겉을 끌어들여, 싱크마크는 리브 반대쪽'
    + ' 면에 납니다 — 어느 면이 외관인지는 숫자에 없습니다.')

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
  id: 'rib_wall',
  name: '리브 (싱크마크)',
  summary: '몸살과 리브 뿌리의 비. 싱크마크가 나는 반대쪽 면을 짚습니다.',
  params: PARAMS,
  build,
}
