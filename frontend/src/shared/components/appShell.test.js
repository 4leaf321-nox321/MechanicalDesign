/**
 * 화면 껍데기의 규칙 — **머리띠는 늘 보이고, 구르는 것은 그 아래뿐이다.**
 *
 * 렌더 테스트가 아니라 소스 검사다. 이 저장소는 순수 로직만 테스트하는데,
 * 이 규칙은 로직이 아니라 CSS 에 산다. 그래도 못을 박아 두는 이유는 **화면이
 * 늘 때마다 조용히 깨지는 종류**이기 때문이다 — 새 화면을 하나 만들면서
 * `min-height: 100vh` 를 쓰면 아무도 모르는 사이에 그 화면만 페이지째 구른다.
 *
 * 그때 잃는 것은 모양이 아니라 길이다. 아래로 내려가면 「← 홈」 이 화면 밖으로
 * 사라져서, 돌아가려면 도로 올라가야 한다.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'

/**
 * 머리띠를 이고 있는 화면들. 새 화면을 만들면 여기에 더한다.
 *
 * 이제 화면 높이는 **껍데기(`AppShell`)가 잡는다.** 각 화면은 그 안을 채우므로
 * `height: 100%` 다 — 안에서 또 `100vh` 를 쓰면 사이드바 높이만큼 아래로 넘친다.
 */
const SCREENS = {
  '홈': 'src/pages/MainPage.jsx',
  '카드': 'src/shared/components/ModuleLayout.jsx',
  '워크플로': 'src/modules/workflows/editorStyles.js',
  '기록': 'src/modules/records/recordStyles.js',
  '토큰': 'src/modules/auth/TokensPage.jsx',
  '계정 관리': 'src/modules/accounts/AccountsAdminPage.jsx',
}

/** 화면 전체를 감싸는 상자 — `Page` 또는 `Wrapper` 또는 `PageWrapper`. */
function shell(source) {
  const m = /const (?:Page|Wrapper|PageWrapper) = styled\.div`([^`]*)`/.exec(source)
  return m ? m[1] : null
}

describe('화면 껍데기', () => {
  it('껍데기가 화면 높이를 잡는다', () => {
    const frame = readFileSync('src/shared/components/AppShell.jsx', 'utf-8')
    expect(frame).toContain('height: 100vh')
    expect(frame).toContain('overflow: hidden')
  })

  it('바깥 상자는 부모를 꽉 채우되 스스로 늘어나지 않는다', () => {
    for (const [name, path] of Object.entries(SCREENS)) {
      const box = shell(readFileSync(path, 'utf-8'))
      expect(box, `${name}: 바깥 상자를 못 찾았다`).not.toBeNull()
      expect(box.includes('height: 100%'), `${name}: height: 100% 가 없다`).toBe(true)
      // `min-height` 면 내용만큼 늘어나 페이지째 구른다.
      expect(box.includes('min-height: 100vh'), `${name}: min-height 는 늘어난다`)
        .toBe(false)
    }
  })

  it('바깥 상자는 스스로 구르지 않는다', () => {
    for (const [name, path] of Object.entries(SCREENS)) {
      const box = shell(readFileSync(path, 'utf-8'))
      expect(box.includes('overflow: hidden'), `${name}: 바깥이 구른다`).toBe(true)
      expect(box.includes('flex-direction: column'), `${name}: 세로로 안 쌓인다`)
        .toBe(true)
    }
  })

  it('인쇄하는 화면은 그 제한을 푼다', () => {
    // 높이를 못 박은 채로 인쇄하면 첫 화면 분량만 나오고 나머지가 잘린다.
    // 계산서를 PDF 로 뽑는 것이 기록 화면의 존재 이유다.
    for (const path of ['src/modules/records/recordStyles.js',
                        'src/shared/components/ModuleLayout.jsx']) {
      const src = readFileSync(path, 'utf-8')
      expect(src).toContain('@media print')
      expect(src).toContain('overflow: visible')
    }
  })

  it('머리띠는 눌리지 않는다', () => {
    const src = readFileSync('src/shared/components/AppHeader.jsx', 'utf-8')
    expect(src).toContain('flex-shrink: 0')
  })
})
