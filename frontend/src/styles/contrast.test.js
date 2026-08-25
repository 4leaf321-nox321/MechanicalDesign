/**
 * 두 판의 명암비.
 *
 * 색을 바꾸는 일은 늘 "조금만 밝게" 로 시작해서, 어느 날 흐린 글씨가
 * 안 읽히는 데서 끝난다. 눈으로는 그 경계를 못 잡는다 — 밝은 화면에서
 * 보면 다 읽히고, 어두운 사무실에서 보면 다 흐리다.
 *
 * 그래서 숫자로 못 박는다. WCAG AA 는 본문 4.5 다. 선(border)은 글자가
 * 아니라서 뺀다 — 나누는 선은 오히려 흐린 편이 낫다.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'

const css = readFileSync('src/styles/tokens.css', 'utf-8')

/** `:root {` / `:root.dark {` 블록의 선언을 뽑는다. */
function block(head) {
  const at = css.indexOf(head)
  if (at < 0) return {}
  const open = css.indexOf('{', at)
  const close = css.indexOf('}', open)
  const out = {}
  for (const d of css.slice(open, close).matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    out[d[1]] = d[2].trim()
  }
  return out
}

function hslToRgb(spec) {
  const [h, s, l] = spec.split(/\s+/).map(parseFloat)
  const S = s / 100
  const L = l / 100
  const a = S * Math.min(L, 1 - L)
  const k = (n) => (n + h / 30) % 12
  const f = (n) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [f(0), f(8), f(4)]
}

function luminance(spec) {
  const c = hslToRgb(spec).map(v => (v <= 0.03928 ? v / 12.92
    : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const TEXT_PAIRS = [
  ['fg', 'surface'], ['fg-muted', 'surface'], ['fg-subtle', 'surface'],
  ['fg', 'bg'], ['fg-muted', 'bg'],
  ['danger', 'danger-soft'], ['warn', 'warn-soft'],
  ['ok', 'ok-soft'], ['info', 'info-soft'], ['accent', 'accent-soft'],
  ['primary', 'surface'], ['accent', 'surface'],
  ['header-fg', 'header-bg'], ['solid-fg', 'primary'], ['solid-fg', 'danger'],
]

const light = block(':root {')
// 어두운 판은 밝은 판을 덮어쓴 결과다 — 안 덮은 토큰은 그대로 물려받는다.
const dark = { ...light, ...block(':root.dark {') }

describe('명암비', () => {
  for (const [name, tokens] of [['밝은 판', light], ['어두운 판', dark]]) {
    it(name + ' 의 글자는 모두 AA 를 넘는다', () => {
      const weak = []
      for (const [fg, bg] of TEXT_PAIRS) {
        expect(tokens[fg], fg + ' 토큰이 없다').toBeTruthy()
        expect(tokens[bg], bg + ' 토큰이 없다').toBeTruthy()
        const r = ratio(tokens[fg], tokens[bg])
        if (r < 4.5) weak.push(fg + '/' + bg + ' = ' + r.toFixed(2))
      }
      expect(weak, weak.join(', ')).toEqual([])
    })
  }
})
