/**
 * JSX 에서 쓰는 컴포넌트가 실제로 그 파일에 있는지 본다.
 *
 * **빌드가 이것을 잡지 못한다.** esbuild 는 JSX 안의 식별자를 해석하지 않아서,
 * `import` 를 빠뜨린 컴포넌트를 써도 빌드는 통과한다. 그러고는 그 자리를 누르는
 * 순간 `ReferenceError` 로 화면이 하얗게 된다. 실제로 한 번 그렇게 나갔다 —
 * 조직 모달을 붙이면서 import 한 줄이 빠졌고, 빌드도 테스트도 초록불이었다.
 *
 * 완전한 검사는 아니다. 여기서 보는 것은 **대문자로 시작하는 태그**뿐이고,
 * 그것이 이 파일 안에서 선언·import 됐는지만 확인한다. 값이 맞는지, 실제로
 * 컴포넌트인지는 보지 않는다. 그래도 빠뜨린 import 는 전부 걸린다.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** React 가 기본 제공하거나 JSX 문법 자체인 이름. */
const BUILT_IN = new Set(['React', 'Fragment'])

function jsxFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) jsxFiles(full, out)
    else if (entry.name.endsWith('.jsx')) out.push(full)
  }
  return out
}

/**
 * 주석과 문자열을 걷어낸다. 주석 속 예시 코드나 문자열 안의 `<Tag>` 가 태그로
 * 잡히면, 없는 것을 있다고 우기는 실패가 나온다.
 */
function stripNoise(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/`(?:[^`\\]|\\[\s\S])*`/g, '``')
    .replace(/'(?:[^'\\\n]|\\[\s\S])*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\[\s\S])*"/g, '""')
}

/**
 * `<Foo`, `<Foo.Bar` 에서 첫 마디만. 소문자로 시작하는 html 태그는 뺀다.
 *
 * **비교 연산자를 태그로 읽지 않는다.** `Math.abs(a) < Math.abs(b)` 의 `< Math`
 * 가 태그로 잡히면, 있지도 않은 컴포넌트를 없다고 우기게 된다. 그런 오탐이
 * 쌓이면 사람이 검사기를 믿지 않게 되고, 그때부터는 진짜 빠진 import 도 그냥
 * 넘어간다 — 검사기가 조용히 무력해지는 길이다.
 *
 * 가르는 법: 여는 태그 앞에는 `(`·`{`·`>`·`?`·`:`·`,`·`=`·줄바꿈 같은 것이 오고,
 * 비교 연산자 앞에는 **값이 끝난 자리**가 온다 — 닫는 괄호나 이름의 마지막 글자.
 */
function usedComponents(source) {
  const names = new Set()
  for (const m of source.matchAll(/<\s*([A-Z][A-Za-z0-9_]*)/g)) {
    const before = source.slice(0, m.index).replace(/\s+$/, '').slice(-1)
    if (/[)\]\w.]/.test(before)) continue      // 값 뒤 → 비교 연산자다
    names.add(m[1])
  }
  return names
}

/** import / const / function / class 로 이 파일에 들어온 이름. */
function declaredNames(source) {
  const names = new Set(BUILT_IN)

  // 부수효과 import(`import 'x.css'`)를 먼저 걷어낸다. 문자열은 이미 비워졌으니
  // `import ''` 모양이다. 남겨 두면 그 뒤의 `from` 을 찾아 다음 import 까지
  // 통째로 삼켜, **바로 다음 줄에서 들여온 이름이 통째로 사라진다.**
  source = source.replace(/import\s+(?:''|"")\s*/g, ' ')

  for (const m of source.matchAll(/import\s+([\s\S]*?)\s+from\s/g)) {
    const clause = m[1]
    // default 와 namespace: `A`, `* as A`
    const lead = clause.match(/^\s*(?:\*\s+as\s+)?([A-Za-z_$][\w$]*)/)
    if (lead) names.add(lead[1])
    // 중괄호: `{ A, B as C }` — 실제로 쓰는 이름은 as 뒤쪽이다.
    const braces = clause.match(/\{([\s\S]*?)\}/)
    if (braces) {
      for (const part of braces[1].split(',')) {
        const bits = part.trim().split(/\s+as\s+/)
        const name = (bits[1] || bits[0] || '').trim()
        if (name) names.add(name)
      }
    }
  }

  for (const m of source.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1])
  for (const m of source.matchAll(/function\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1])
  for (const m of source.matchAll(/class\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1])

  return names
}

describe('JSX 에서 쓰는 컴포넌트는 그 파일에 있어야 한다', () => {
  const files = jsxFiles(SRC)

  it('검사할 파일이 실제로 있다', () => {
    // 경로가 어긋나 0개를 훑고 통과하는 것이 가장 나쁜 결과다.
    expect(files.length).toBeGreaterThan(5)
  })

  it.each(files.map((f) => [path.relative(SRC, f), f]))('%s', (_label, file) => {
    const source = stripNoise(fs.readFileSync(file, 'utf8'))
    const declared = declaredNames(source)
    const missing = [...usedComponents(source)].filter((n) => !declared.has(n))
    expect(missing).toEqual([])
  })
})
