/**
 * 색 토큰이 실제로 있는지.
 *
 * **없는 이름은 조용히 사라진다.** `hsl(var(--fg-mutd))` 는 오류가 아니라 그냥
 * 색이 없는 것이 되어, 글자가 검게(상속된 색으로) 나오거나 배경이 투명해진다.
 * 오타 하나가 화면 한 곳만 망가뜨리고 아무 데도 안 알린다 — 이 방식으로 색을
 * 옮긴 이상 여기서 막아야 한다.
 *
 * 그리고 **어두운 판에 빠진 토큰**도 잡는다. 밝은 판에만 있으면 어두운 판에서
 * 그 색만 밝은 값 그대로 남아, 검은 바탕에 흰 상자가 하나 뜬다.
 */

import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

const CSS = readFileSync('src/styles/tokens.css', 'utf-8')

/** 주석은 빼고 본다. 설명 안의 `var(--x)` 같은 예시까지 세면 못 쓴다. */
function code(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(jsx?|css)$/.test(name) && !name.endsWith('.test.js')) out.push(full)
  }
  return out
}

/** `:root { ... }` 또는 `:root.dark { ... }` 안에 정의된 이름들. */
function defined(selector) {
  const names = new Set()
  const re = new RegExp(`${selector}\\s*\\{([^}]*)\\}`, 'g')
  let m
  while ((m = re.exec(CSS))) {
    for (const decl of m[1].matchAll(/--([\w-]+)\s*:/g)) names.add(decl[1])
  }
  return names
}

const light = defined(':root(?!\\.dark)')
const dark = defined(':root\\.dark')

/** 판에 따라 갈려야 하는 것들 — 모양과 글꼴은 갈릴 필요가 없다. */
const SHARED = new Set([
  'radius', 'radius-sm', 'radius-lg', 'font-sans', 'font-mono',
])

describe('색 토큰', () => {
  it('쓰이는 이름은 모두 정의되어 있다', () => {
    const missing = new Map()
    for (const file of walk('src')) {
      if (file.endsWith(join('styles', 'tokens.css'))) continue
      const src = code(readFileSync(file, 'utf-8'))
      for (const use of src.matchAll(/var\(--([\w-]+)/g)) {
        if (!light.has(use[1])) {
          missing.set(use[1], (missing.get(use[1]) || []).concat(file))
        }
      }
    }
    expect([...missing.keys()], `정의 없는 토큰: ${[...missing.keys()]}`)
      .toEqual([])
  })

  it('어두운 판이 색 토큰을 하나도 빠뜨리지 않는다', () => {
    // 빠지면 그 색만 밝은 판 값으로 남아, 검은 바탕에 흰 상자가 하나 뜬다.
    const gaps = [...light].filter(n => !SHARED.has(n) && !dark.has(n))
    expect(gaps, `어두운 판에 없는 토큰: ${gaps}`).toEqual([])
  })

  it('화면 색에 직접 쓴 16진수가 남아 있지 않다', () => {
    // 남으면 그 자리만 판을 안 따라간다. 차트(Plotly)는 예외 — 자료 색은
    // 화면 색과 규칙이 다르고, `chartColors` 가 판마다 따로 정한다.
    const CHARTS = /(Plot|Heatmap|Scatter3DPlot|SplomPlot|chartColors)\.jsx?$/
    const dirty = []
    for (const file of walk('src')) {
      if (CHARTS.test(file) || file.endsWith('.css')) continue
      const hits = (readFileSync(file, 'utf-8').match(/#[0-9a-fA-F]{3,8}\b/g) || [])
      if (hits.length) dirty.push(`${file}: ${hits.join(' ')}`)
    }
    expect(dirty, dirty.join('\n')).toEqual([])
  })
})
