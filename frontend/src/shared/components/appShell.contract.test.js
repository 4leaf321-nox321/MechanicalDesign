/**
 * 껍데기와 화면 사이의 약속.
 *
 * 조직 트리를 홈에서 껍데기로 올리면서 둘이 **주소**와 **`Outlet` 문맥**으로만
 * 이어졌다. 그 이음매는 도구가 못 본다 — `useOutletContext()` 가 없는 키를
 * 꺼내면 `undefined` 가 나오고, 그 자리에서 안 터지고 **한참 뒤 호출할 때**
 * 터진다. 라우트에서 `AppShell` 을 빼먹어도 마찬가지다.
 *
 * 그래서 약속을 글로 못 박는다.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'

const shell = readFileSync('src/shared/components/AppShell.jsx', 'utf-8')
const main = readFileSync('src/pages/MainPage.jsx', 'utf-8')
const app = readFileSync('src/App.jsx', 'utf-8')

describe('껍데기와 화면', () => {
  it('껍데기가 내려보내는 것과 홈이 꺼내 쓰는 것이 맞는다', () => {
    const given = /<Outlet context=\{\{([^}]*)\}\}/.exec(shell)
    expect(given, '껍데기가 문맥을 안 내려보낸다').not.toBeNull()
    const offered = given[1].split(',')
      .map(s => s.trim().split(':')[0].trim()).filter(Boolean)

    const taken = /const \{([^}]*)\} = useOutletContext\(\)/.exec(main)
    expect(taken, '홈이 문맥을 안 꺼낸다').not.toBeNull()
    const wanted = taken[1].split(',').map(s => s.trim()).filter(Boolean)

    const missing = wanted.filter(n => !offered.includes(n))
    expect(missing, `껍데기가 안 주는 것: ${missing}`).toEqual([])
  })

  it('문맥을 쓰는 화면은 껍데기 안에 있다', () => {
    // 밖에 두면 `useOutletContext()` 가 `null` 이라 첫 렌더에서 바로 터진다.
    expect(app).toMatch(/<Route element=\{<AppShell \/>\}>/)
    expect(app).toMatch(/<Route path="\/" element=\{<MainPage \/>\} \/>/)

    // 껍데기 여는 자리와 닫는 자리 수가 맞는가 — 라우트 중첩은 눈으로 못 센다.
    const opens = (app.match(/<Route element=\{<AppShell \/>\}>/g) || []).length
    expect(opens).toBeGreaterThan(0)
  })

  it('강제 비밀번호 변경은 껍데기 밖에 있다', () => {
    // 사이드바로 딴 데 갈 수 있으면 강제가 강제가 아니다.
    const shellAt = app.indexOf('<Route element={<AppShell />}>')
    const pwAt = app.indexOf('path="/change-password"')
    expect(pwAt).toBeGreaterThan(-1)
    expect(pwAt).toBeLessThan(shellAt)
  })

  it('고른 조직은 주소에 있다', () => {
    // 상태로 들고 있으면 새로고침에 사라지고 링크로 나눌 수도 없다.
    expect(main).toContain("params.get('org')")
    expect(shell).toContain("params.get('org')")
  })
})
