/**
 * 이웃 파일에서 가져오는 이름이 실제로 있는가.
 *
 * **빌드도 ESLint 도 이걸 안 잡는다.** esbuild 는 번들할 때 이름을 맞춰 보지
 * 않고, `no-undef` 는 import 로 들어온 이름을 무조건 있는 것으로 친다. 그래서
 * 브라우저가 그 모듈을 실제로 불러오는 순간에야 터진다 —
 *
 *     Uncaught SyntaxError: The requested module './recordStyles.js'
 *     does not provide an export named 'GhostBtn'
 *
 * 그 화면을 열어 봐야 알고, 열기 전까지는 전부 초록불이다. 스타일 하나를
 * 지우면서 import 를 안 지운 적이 있어서 여기서 막는다.
 *
 * `jsxIdentifiers.test.js` 와 같은 종류다 — 도구가 못 보는 자리를 테스트가 본다.
 */

import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { dirname, join, relative, resolve } from 'path'

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.jsx?$/.test(name)) out.push(full)
  }
  return out
}

/** 그 파일이 내보내는 이름들. */
function exportsOf(file) {
  const src = readFileSync(file, 'utf-8')
  const names = new Set()
  for (const m of src.matchAll(
    /^export\s+(?:async\s+)?(?:const|function|class|let|var)\s+(\w+)/gm)) {
    names.add(m[1])
  }
  // `export { a, b as c }` — 밖에서 부르는 이름은 `as` 뒤쪽이다.
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim()
      if (name) names.add(name)
    }
  }
  if (/^export\s+default/m.test(src)) names.add('default')
  return names
}

/** 상대 경로를 실제 파일로. 확장자를 생략해서 쓰는 곳이 있다. */
function resolveSpec(from, spec) {
  const base = resolve(dirname(from), spec)
  for (const candidate of [base, `${base}.js`, `${base}.jsx`,
                           join(base, 'index.js'), join(base, 'index.jsx')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

describe('모듈 사이의 이름', () => {
  it('가져오는 이름이 모두 실제로 있다', () => {
    const broken = []

    for (const file of walk('src')) {
      const src = readFileSync(file, 'utf-8')
      for (const m of src.matchAll(
        /import\s+(?:\w+\s*,\s*)?\{([^}]*)\}\s*from\s*'(\.[^']+)'/g)) {
        const target = resolveSpec(file, m[2])
        if (!target) {
          broken.push(`${relative('src', file)} → ${m[2]} (파일 없음)`)
          continue
        }
        const have = exportsOf(target)
        for (const part of m[1].split(',')) {
          const name = part.trim().split(/\s+as\s+/)[0].trim()
          if (name && !have.has(name)) {
            broken.push(`${relative('src', file)}: `
              + `'${name}' 이 ${relative('src', target)} 에 없다`)
          }
        }
      }
    }

    expect(broken, `\n${broken.join('\n')}`).toEqual([])
  })
})
