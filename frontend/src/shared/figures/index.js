/**
 * 도해 목록 — 앱이 그릴 줄 아는 형상들.
 *
 * **서버는 이 목록을 모른다.** 도해가 늘 때마다 서버를 고쳐야 하면 그림 하나
 * 추가에 배포가 걸린다. 서버는 종류를 글자로 보관만 하고, 무엇을 그릴 줄 아는지는
 * 화면이 안다.
 *
 * 그래서 모르는 종류가 올 수 있다 — 옛 도해를 지웠거나, 새 도해를 쓰는 카드를
 * 옛 화면이 열었거나. 그때는 **빈 자리로 두지 않고 모른다고 말한다.** 빈 자리는
 * 그림이 없는 것과 구분이 안 된다.
 */

import { cantilever, fixedBoth, overhang, simple } from './beam'
import bearing from './bearing'
import belt from './belt'
import bolt from './bolt'
import boss from './boss'
import coupling from './coupling'
import column from './column'
import filletWeld from './filletWeld'
import gasket from './gasket'
import gear from './gear'
import hinge from './hinge'
import journal from './journal'
import mohr from './mohr'
import draftAngle from './draftAngle'
import drop from './drop'
import finArray from './finArray'
import { fillet, hole } from './notch'
import pipe from './pipe'
import pressFit from './pressFit'
import rib from './rib'
import rivet from './rivet'
import sectionBox from './sectionBox'
import sectionChannel from './sectionChannel'
import sectionI from './sectionI'
import sectionRect from './sectionRect'
import shaft from './shaft'
import snapFit from './snapFit'
import { coil, leaf } from './spring'
import sunkKey from './sunkKey'
import thermalGap from './thermalGap'
import tolStack from './tolStack'
import vessel from './vessel'
import vibMount from './vibMount'

// 순서가 고르는 목록의 순서다. 자주 쓰는 것부터.
const ALL = [
  shaft, sunkKey, bearing, journal, coupling,  // 축계
  sectionRect, sectionI, sectionBox, sectionChannel,          // 단면
  cantilever, simple, fixedBoth, overhang, column,            // 보와 기둥
  bolt, rivet, filletWeld,                     // 체결
  gear, belt,                                  // 전동
  coil, leaf,                                  // 스프링
  vessel, fillet, hole, mohr,                  // 압력·응력
  snapFit, rib, boss, drop, finArray, vibMount,  // 기구 — 가전·전자기기
  hinge, pressFit, gasket,                     // 기구 — 힌지·압입·실링
  tolStack, draftAngle, thermalGap,            // 기구 — 공차·성형·온도
  pipe,                                        // 유체
]

export const FIGURES = ALL
export const byKind = Object.fromEntries(ALL.map(f => [f.id, f]))

export function figureOf(kind) {
  return byKind[kind] || null
}

/**
 * 도해가 쓸 값을 카드에서 모은다.
 *
 * @param figure  `{ kind, mapping }` — 서버가 준 것
 * @param lookup  변수 id → `{ value, unit }`
 *
 * 값을 못 찾은 칸은 **빼고 넘긴다.** 0 으로 채우면 도해가 그릴 수 있다고 판단해
 * 납작한 형상을 그리고, 사람은 그것을 계산 결과로 읽는다.
 */
export function valuesFor(figure, lookup) {
  const values = { _units: {} }
  for (const [slot, variableId] of Object.entries(figure?.mapping || {})) {
    const got = lookup(variableId)
    if (got === null || got === undefined) continue
    if (got.value === null || got.value === undefined || got.value === '') continue
    values[slot] = got.value
    if (got.unit) values._units[slot] = got.unit
  }
  return values
}

/** 어느 칸이 아직 안 묶였나. 설정 화면이 「이것부터 고르세요」 를 말하는 근거다. */
export function unwired(figure) {
  const spec = figureOf(figure?.kind)
  if (!spec) return []
  const mapping = figure?.mapping || {}
  return spec.params.filter(p => p.required && !mapping[p.key]).map(p => p.key)
}

/**
 * 기호가 같은 변수를 저절로 물린다.
 *
 * 도해가 `d`·`b`·`L` 을 쓰는데 카드에도 그 기호의 변수가 있는 경우가 대부분이다 —
 * 교과서에서 같은 글자를 쓰기 때문이다. 사람이 드롭다운 넷을 고르게 하는 대신
 * 미리 채워 두고, **고칠 수 있게** 둔다. 자동으로 맞춘 것을 못 고치게 하면
 * 어쩌다 틀렸을 때 빠져나갈 길이 없다.
 */
export function autoWire(kind, variables) {
  const spec = figureOf(kind)
  if (!spec) return {}
  const bySymbol = new Map()
  for (const v of variables || []) {
    const symbol = (v.symbol || '').trim()
    // 먼저 나온 것을 남긴다 — 기호가 겹치면 카드가 이미 이상한 것이고,
    // 여기서 조용히 뒤엣것으로 바꾸면 어느 것이 잡혔는지 알 수 없다.
    if (symbol && !bySymbol.has(symbol)) bySymbol.set(symbol, v.id)
  }
  const out = {}
  for (const p of spec.params) {
    if (bySymbol.has(p.key)) out[p.key] = bySymbol.get(p.key)
  }
  return out
}
