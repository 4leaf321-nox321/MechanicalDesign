/**
 * 묻는 창은 하나뿐이어야 한다.
 *
 * `window.confirm` 은 쓰기 쉬워서 새 코드에 슬쩍 다시 들어온다. 그러면 화면
 * 절반은 우리 창이고 절반은 브라우저 창이 되어, **어느 것이 위험한 일인지**
 * 구분이 다시 사라진다. 되돌릴 수 없는 일과 그냥 확인하는 일이 똑같이 생기는
 * 것이 애초에 이 창을 만든 이유였다.
 *
 * 그리고 브라우저 기본 창은 **화면을 멈춘다** — 그 사이 아무것도 못 그린다.
 */

import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.jsx?$/.test(name) && !name.endsWith('.test.js')) out.push(full)
  }
  return out
}

/** 주석 안의 설명까지 세지 않는다 — 이 파일도 그 낱말을 말하고 있다. */
function code(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

describe('묻는 창', () => {
  it('브라우저 기본 대화상자를 쓰지 않는다', () => {
    const found = []
    for (const file of walk('src')) {
      const hits = code(readFileSync(file, 'utf-8'))
        .match(/window\.(confirm|prompt|alert)\s*\(/g)
      if (hits) found.push(`${file}: ${hits.join(' ')}`)
    }
    expect(found, found.join('\n')).toEqual([])
  })

  it('되돌릴 수 없는 일에는 tone 을 준다', () => {
    // 지우는 창과 이름 묻는 창이 똑같이 생기면 사람은 둘 다 대충 누른다.
    const src = readFileSync('src/shared/components/Dialog.jsx', 'utf-8')
    expect(src).toContain("tone === 'danger'")
    // 위험한 창에서는 「취소」에 손이 가 있어야 한다.
    expect(src).toContain('cancel.current?.focus()')
  })

  it('단추에 무엇을 하는지 적을 수 있다', () => {
    // 창을 안 읽고 단추만 보는 사람에게 마지막으로 말할 기회다.
    expect(readFileSync('src/shared/components/Dialog.jsx', 'utf-8'))
      .toContain('confirmLabel')
  })
})
