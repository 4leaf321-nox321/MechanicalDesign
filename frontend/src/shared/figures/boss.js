/**
 * 나사 보스 — 셀프태핑 스크류가 들어가는 수지 기둥.
 *
 * 하우징 체결의 사실상 전부인데, 계산은 세 값의 비로 끝난다:
 *
 *     보스 외경   D ≈ 2 d          얇으면 조립 때 세로로 갈라진다
 *     구멍 지름   d1 ≈ 0.8 d       수지마다 다르다 — 크면 안 물리고 작으면 터진다
 *     물림 길이   h ≥ 2 d          짧으면 나사산이 뽑힌다
 *
 * 숫자만 봐서는 **어느 살이 힘을 받는지** 안 보인다. 스크류는 조이는 내내
 * 구멍을 밖으로 벌리고, 그 후프힘을 받는 것이 살두께 (D − d1)/2 다. 그림이
 * 그 살을 해칭으로 보여 주고, 나사산이 어디를 파고드는지 겹쳐 보인다.
 */

import { ROLE, bounds, dim, line, path, positive, rect, tag } from './geometry'

const PARAMS = [
  { key: 'd', label: '스크류 외경', required: true },
  { key: 'D', label: '보스 외경', required: true },
  { key: 'd1', label: '구멍 지름', required: false },
  { key: 'h', label: '물림 길이', required: false },
]

const EXAMPLE = { d: 3, D: 6 }

function build(values) {
  const missing = PARAMS.filter(p => p.required && !positive(values[p.key]))
  const example = missing.length > 0
  const d = example ? EXAMPLE.d : positive(values.d)
  const D = example ? EXAMPLE.D : positive(values.D)

  const notes = []
  const givenD1 = example ? null : positive(values.d1)
  const d1 = givenD1 || d * 0.8
  if (!example && !givenD1) {
    notes.push('구멍 지름이 배선되지 않아 0.8d 로 그렸습니다(수지마다 다릅니다)'
      + ' — 그 치수를 안 붙인 것은 그래서입니다.')
  }
  if (d1 >= D) {
    return {
      ok: false,
      impossible: `구멍(${Math.round(d1 * 100) / 100})이 보스 외경(${D})보다 작아야 살이 남습니다.`,
    }
  }

  const givenH = example ? null : positive(values.h)
  const h = givenH || d * 2
  if (!example && !givenH) {
    notes.push('물림 길이가 배선되지 않아 권고값 2d 로 그렸습니다.')
  }

  // 보스와 바닥. 구멍은 바닥 몸살 위에서 끝난다.
  const Hb = h + d * 0.6
  const wallW = (D - d1) / 2
  const W = D * 2.2
  const tb = d * 0.9
  const shapes = [
    rect(-W / 2, 0, W, tb, ROLE.cut),                    // 바닥 몸살
    rect(-D / 2, -Hb, wallW, Hb, ROLE.cut),              // 보스 왼 살
    rect(d1 / 2, -Hb, wallW, Hb, ROLE.cut),              // 보스 오른 살
  ]

  // 스크류 — 박기 직전. 박힌 모습으로 그리면 지름을 잴 자리가 없다.
  // 체결물이라 단면을 안 치고, 나사산이 구멍보다 넓게 나온 만큼이 물리는 살이다.
  const gap = d * 0.8
  const dm = d * 0.72                                    // 골지름 — 그림용
  const Ls = h + d * 0.8
  const tipY = -Hb - gap
  const topY = tipY - Ls
  const headH = d * 0.55
  shapes.push(rect(-dm / 2, topY, dm, Ls, ROLE.front))
  shapes.push(rect(-d * 0.9, topY - headH, d * 1.8, headH, ROLE.front))
  const teeth = 5
  const pitch = Ls / teeth
  for (let i = 0; i < teeth; i += 1) {
    const yTooth = tipY - i * pitch - pitch * 0.72
    for (const side of [-1, 1]) {
      shapes.push(path(
        `M ${side * dm / 2} ${yTooth} L ${side * d / 2} ${yTooth + pitch * 0.28}`
        + ` L ${side * dm / 2} ${yTooth + pitch * 0.56} Z`, ROLE.front,
      ))
    }
  }
  shapes.push(line(0, topY - headH - d * 0.4, 0, tb + d * 0.3, ROLE.center))

  const pad = D * 0.35
  const shown = (v) => (example ? null : v)
  const dims = [
    dim([-D / 2, 0], [D / 2, 0],
        { offset: tb + pad * 0.6, label: 'Ø{}', symbol: 'D',
          value: shown(D), unit: values._units?.D }),
  ]
  if (example || givenD1) {
    dims.push(dim([-d1 / 2, -Hb], [d1 / 2, -Hb],
                  { offset: -gap * 0.45, label: 'Ø{}', symbol: 'd1',
                    value: example ? null : givenD1, unit: values._units?.d1 }))
  }
  if (example || givenH) {
    dims.push(dim([d1 / 2, -Hb], [d1 / 2, -Hb + h],
                  { offset: wallW + pad * 0.8, label: '{}', symbol: 'h',
                    value: example ? null : givenH, unit: values._units?.h }))
  }

  // 스크류 지름은 지시선으로. 머리 너머로 치수선을 끌면 형상을 가로지른다.
  const ym = tipY - Ls * 0.45
  shapes.push(line(d / 2, ym, d / 2 + pad * 0.9, ym - pad * 0.45, ROLE.ghost))
  const tags = [tag(d / 2 + pad, ym - pad * 0.45,
                    example ? '스크류 Ød' : `스크류 Ø${d}`, 'start')]

  if (!example) {
    const wall = Math.round(wallW * 100) / 100
    notes.push(`보스 살두께 (D − d1)/2 = ${wall} 입니다 — 스크류가 구멍을 벌리는`
      + ' 후프힘을 이 살이 받습니다.')
    const ratio = Math.round((D / d) * 100) / 100
    if (ratio < 1.8) {
      notes.push(`보스 외경이 스크류의 ${ratio} 배입니다 — 2 배 안팎을 씁니다.`
        + ' 얇으면 조립 때 세로로 갈라집니다.')
    } else {
      notes.push(`D/d = ${ratio} 입니다 (2 배 안팎 권고).`)
    }
    if (d <= d1) {
      notes.push('스크류 외경이 구멍보다 작습니다 — 나사산이 물릴 살이 없습니다.')
    }
    if (givenH && givenH < d * 2) {
      notes.push(`물림 길이가 스크류 지름의 ${Math.round((givenH / d) * 10) / 10} 배`
        + ' 입니다 — 수지에는 2 배 이상을 둡니다. 짧으면 나사산이 뽑힙니다.')
    }
  }
  notes.push('골지름·나사산 모양·바닥 두께는 보기 좋은 비율일 뿐, 계산에 쓰이지 않습니다.')

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
  id: 'screw_boss',
  name: '나사 보스',
  summary: '셀프태핑 보스. 후프힘을 받는 살두께 (D−d1)/2 를 해칭으로 보입니다.',
  params: PARAMS,
  build,
}
