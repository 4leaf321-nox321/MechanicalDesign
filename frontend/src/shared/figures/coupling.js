/**
 * 플랜지 커플링.
 *
 * 토크를 볼트가 나르는데, 볼트가 힘을 받는 자리는 축 중심이 아니라 **볼트원
 * 반지름**이다:
 *
 *     T = n · F · D/2
 *
 * 그래서 볼트를 바깥으로 벌릴수록 볼트 하나가 받는 힘이 준다. 숫자만 보면
 * `D` 가 커플링 바깥지름인지 볼트원인지, 볼트가 몇 개인지가 눈에 안 들어온다 —
 * 둘 다 계산에 그대로 들어가는 값인데도.
 *
 * 볼트원은 **중심선으로** 그린다. 재료의 경계가 아니라 볼트 자리를 정하는
 * 약속된 기준이기 때문이다 — 기어의 피치원과 같은 이유다.
 */

import { ROLE, bounds, circle, crosshair, dim, moment, positive } from './geometry'

const PARAMS = [
  { key: 'D', label: '볼트원 지름', required: true },
  { key: 'db', label: '볼트 지름', required: true },
  { key: 'n', label: '볼트 수', required: true },
  { key: 'd', label: '축 지름', required: false },
  { key: 'T', label: '전달토크', required: false },
]

const EXAMPLE = { D: 160, db: 16, n: 6, d: 60 }

/** 볼트를 몇 개까지 그릴까. */
const MAX_BOLTS = 12

function build(values) {
  const missing = PARAMS.filter(p => p.required && !positive(values[p.key]))
  const example = missing.length > 0
  const D = example ? EXAMPLE.D : positive(values.D)
  const db = example ? EXAMPLE.db : positive(values.db)
  const asked = Math.round(example ? EXAMPLE.n : positive(values.n))

  const notes = []
  const n = Math.min(Math.max(asked, 2), MAX_BOLTS)
  if (asked > MAX_BOLTS) {
    notes.push(`볼트 ${asked}개 중 ${MAX_BOLTS}개만 그렸습니다 — 나머지도 같은 간격입니다.`)
  }

  const rBolt = D / 2
  const bore = example ? EXAMPLE.d : positive(values.d)
  if (!example && bore && bore / 2 + db >= rBolt) {
    return {
      ok: false,
      impossible: `축 지름(${bore})이 커서 볼트원(${D}) 안에 볼트가 안 들어갑니다.`,
    }
  }

  // 바깥지름은 계산에 없는 값이라 보기 좋은 비율로만 그리고 치수를 안 붙인다.
  const rOuter = rBolt + db * 1.6
  const shapes = [circle(0, 0, rOuter)]

  // 볼트원 — **기준**이지 재료의 경계가 아니다.
  shapes.push(circle(0, 0, rBolt, ROLE.center))
  for (let k = 0; k < n; k += 1) {
    // 첫 볼트를 12시에 둔다. 치수를 걸 자리가 분명해진다.
    const a = -Math.PI / 2 + (k * Math.PI * 2) / n
    shapes.push(circle(rBolt * Math.cos(a), rBolt * Math.sin(a), db / 2))
  }
  if (bore) shapes.push(circle(0, 0, bore / 2))
  shapes.push(...crosshair(0, 0, rOuter))

  const moments = []
  if (!example && positive(values.T)) {
    moments.push(moment(0, 0, rOuter * 1.28, 'T'))
  }

  const pad = D * 0.16
  const shown = (v) => (example ? null : v)
  const dims = [
    dim([-rBolt, 0], [rBolt, 0],
        { offset: rOuter + pad, label: 'Ø{}', symbol: 'D',
          value: shown(D), unit: values._units?.D }),
    // 개수를 **볼트 치수에 붙인다** (`6× Ø16`). 제도에서 쓰는 방식이고,
    // 따로 이름표를 놓으면 가운데 빈 자리가 없어 축 구멍 위에 얹힌다.
    dim([-db / 2, -rBolt], [db / 2, -rBolt],
        { offset: -pad * 1.4, label: example ? 'Ø{}' : `${n}× Ø{}`, symbol: 'db',
          value: shown(db), unit: values._units?.db }),
  ]
  if (bore) {
    dims.push(dim([-bore / 2, 0], [bore / 2, 0],
                  { offset: rOuter + pad * 2.5, label: 'Ø{}', symbol: 'd',
                    value: shown(bore), unit: values._units?.d }))
  }

  const tags = []

  notes.push('토크는 볼트원 반지름에서 받습니다 — 볼트를 벌릴수록 하나가 받는 힘이 줍니다.')
  notes.push('바깥지름과 살두께는 보기 좋은 비율일 뿐, 이 계산에 쓰이지 않습니다.')

  return {
    ok: true,
    example,
    missing: missing.map(p => p.key),
    shapes,
    moments,
    dims,
    tags,
    notes,
    box: bounds([...shapes, ...dims, ...tags]),
  }
}

export default {
  id: 'flange_coupling',
  name: '플랜지 커플링',
  summary: '볼트원 지름과 볼트 배치. 토크를 받는 반지름이 어디인지 보입니다.',
  params: PARAMS,
  build,
}
