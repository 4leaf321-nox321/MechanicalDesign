/**
 * 차트에 쓸 색 — **토큰을 실제 색 문자열로 풀어서** 넘긴다.
 *
 * Plotly 는 캔버스에 직접 그린다. `hsl(var(--surface))` 같은 문자열을 주면
 * CSS 변수를 풀 주체가 없어서 그대로 실패한다 — 화면 색과 달리 여기서는
 * 변수를 쓸 수 없다.
 *
 * 그래서 `getComputedStyle` 로 지금 판의 값을 읽어 `hsl(...)` 문자열을 만든다.
 * 판이 바뀌면 다시 읽어야 하므로 훅으로 감싼다.
 *
 * ## 자료 색은 토큰이 아니다
 *
 * 계열을 가르는 색(빨강–파랑 상관 눈금 같은 것)은 화면 색과 규칙이 다르다.
 * 화면 색은 "위험은 빨강" 처럼 뜻이 있지만, 자료 색은 **서로 구분되는 것**이
 * 전부다. 그래서 여기서 판마다 따로 정한다 — 어두운 판에서는 채도를 낮추고
 * 밝기를 올려야 어두운 바탕에서 서로 갈린다.
 */

import { useEffect, useState } from 'react'
import { useTheme } from './ThemeContext'

/** `--surface` → `hsl(0 0% 100%)`. 없으면 넘긴 기본값. */
export function token(name, fallback = '#ffffff') {
  if (typeof window === 'undefined') return fallback
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(`--${name}`).trim()
  return raw ? `hsl(${raw})` : fallback
}

/**
 * 토큰 몇 개를 실제 색으로 풀어 준다.
 *
 * SVG 는 두 갈래다. `style` 로 준 색은 CSS 가 풀어 주지만, `fill="..."` 처럼
 * **속성**으로 준 색은 아무도 안 풀어서 `var(--x)` 가 그대로 남는다.
 * reactflow 의 배경 점과 미니맵이 그 갈래라, 여기서 풀어 넘겨야 한다.
 */
export function useTokens(names) {
  const { theme } = useTheme()
  const [values, setValues] = useState(() => resolve(names))
  useEffect(() => { setValues(resolve(names)) },
    // 이름 목록은 부르는 쪽에서 고정된 것으로 넘긴다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme])
  return values
}

function resolve(names) {
  const out = {}
  for (const name of names) out[name] = token(name)
  return out
}

/** 계열을 가르는 색. 뜻이 아니라 **서로 다름**이 목적이다. */
const SERIES = {
  light: ['#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6',
          '#1abc9c', '#e67e22', '#34495e', '#16a085', '#c0392b'],
  dark: ['#5dade2', '#ec7063', '#58d68d', '#f5b041', '#bb8fce',
         '#48c9b0', '#eb984e', '#85929e', '#45b39d', '#e6746b'],
}

/** 낮음 → 높음 눈금. 파랑에서 빨강으로 — 온도처럼 읽힌다. */
const SCALE = {
  light: [[0, '#e3f2fd'], [0.25, '#3498db'], [0.5, '#4caf50'],
          [0.75, '#ff9800'], [1, '#d32f2f']],
  dark: [[0, '#1b3a52'], [0.25, '#5dade2'], [0.5, '#58d68d'],
         [0.75, '#f5b041'], [1, '#ec7063']],
}

/** 음수 ↔ 양수 눈금. 가운데가 0 이라 양쪽이 대칭이어야 한다. */
const DIVERGING = {
  light: [[0, '#d32f2f'], [0.25, '#ef9a9a'], [0.5, '#ffffff'],
          [0.75, '#90caf9'], [1, '#1565c0']],
  dark: [[0, '#ec7063'], [0.25, '#a94442'], [0.5, '#2a3441'],
         [0.75, '#3d6b8f'], [1, '#5dade2']],
}

/**
 * 지금 판에 맞는 차트 색 한 벌.
 *
 * 판이 바뀌면 다시 읽는다. CSS 변수는 클래스가 바뀐 **뒤에야** 새 값을 주므로
 * `theme` 이 바뀔 때마다 다시 계산해야 한다.
 */
export function useChartColors() {
  const { theme } = useTheme()
  const [colors, setColors] = useState(() => read(theme))
  useEffect(() => { setColors(read(theme)) }, [theme])
  return colors
}

function read(theme) {
  const dark = theme === 'dark'
  return {
    theme,
    paper: token('surface', dark ? '#232a3a' : '#ffffff'),
    plot: token('surface-2', dark ? '#2a3140' : '#fafbfc'),
    fg: token('fg', dark ? '#e8edf5' : '#1a1a2e'),
    muted: token('fg-muted', dark ? '#9aa6b8' : '#6b7280'),
    grid: token('border', dark ? '#39414f' : '#e0e4ea'),
    primary: token('primary', dark ? '#5dade2' : '#3498db'),
    series: dark ? SERIES.dark : SERIES.light,
    scale: dark ? SCALE.dark : SCALE.light,
    diverging: dark ? DIVERGING.dark : DIVERGING.light,
  }
}

export default useChartColors
