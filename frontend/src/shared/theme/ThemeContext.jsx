/**
 * 밝은 판 / 어두운 판.
 *
 * ReportArchive 와 **같은 방식**이다 — `<html>` 에 `dark` 클래스 하나를 붙였다
 * 떼고, 색은 CSS 변수가 알아서 갈린다. 화면 컴포넌트는 판이 무엇인지 몰라도 된다.
 *
 * ## 처음 판은 어떻게 정하나
 *
 * 1. 지난번에 고른 것 (`localStorage`)
 * 2. 없으면 운영체제 설정 (`prefers-color-scheme`)
 *
 * 순서가 중요하다. 반대로 하면 어두운 운영체제를 쓰는 사람이 밝은 판을 골라
 * 둬도 열 때마다 어두운 판으로 돌아간다 — 고른 것이 안 지켜진다.
 *
 * ## 왜 깜빡임을 여기서 못 막나
 *
 * React 가 뜨기 전에는 `<html>` 이 아직 밝은 판이라, 어두운 판을 고른 사람은
 * 첫 프레임에 흰 화면을 본다. 그래서 `index.html` 에 같은 판단을 하는 짧은
 * 스크립트를 하나 더 둔다. **두 곳에 같은 규칙이 있는 것**은 원래 나쁘지만,
 * 여기서는 한쪽이 어긋나도 판이 한 번 튀고 말 뿐이고 그 대가로 깜빡임이 사라진다.
 */

import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react'

const STORAGE_KEY = 'md:theme:v1'

const ThemeContext = createContext(null)

function readStored() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved === 'dark' || saved === 'light' ? saved : null
  } catch {
    // 사파리 비공개 모드처럼 저장이 막힌 곳이 있다. 못 읽어도 화면은 떠야 한다.
    return null
  }
}

function systemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark' : 'light'
}

function apply(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => readStored() || systemTheme())

  useEffect(() => {
    apply(theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      /* 저장이 막혀도 이번 판은 이미 적용됐다 */
    }
  }, [theme])

  // 고른 적이 없는 사람은 운영체제를 따라간다 — 켜 둔 채로 밤이 되어도.
  useEffect(() => {
    if (readStored()) return undefined
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!media) return undefined
    const follow = (e) => setTheme(e.matches ? 'dark' : 'light')
    media.addEventListener('change', follow)
    return () => media.removeEventListener('change', follow)
  }, [])

  const toggle = useCallback(
    () => setTheme(t => (t === 'dark' ? 'light' : 'dark')), [])

  const value = useMemo(() => ({ theme, setTheme, toggle }), [theme, toggle])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

/** 판을 모르면 안 되는 곳에서만. 색은 CSS 변수로 받는 것이 먼저다. */
export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('ThemeProvider 안에서만 쓸 수 있습니다.')
  return ctx
}

export default ThemeProvider
