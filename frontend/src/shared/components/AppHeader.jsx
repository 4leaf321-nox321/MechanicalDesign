/**
 * 화면 맨 위 줄 — **모든 화면이 같은 것을 쓴다.**
 *
 * 넷이 따로 있었다. 홈은 32px/1.8rem, 기록은 28px/1.5rem, 카드는 16px/1.3rem,
 * 워크플로는 아예 없었다. 화면을 옮길 때마다 높이가 출렁이면 같은 앱이
 * 아닌 것처럼 보이고, 없는 화면에서는 홈으로 돌아갈 길이 사라진다.
 *
 * ## 띠가 아니라 줄이다
 *
 * 예전에는 남색을 칠했다. 그러면 그 색이 화면에서 **가장 강한 것**이 되어,
 * 정작 봐야 할 숫자보다 눈에 먼저 든다. ReportArchive·MatNexus 가 둘 다
 * 페이지와 같은 바탕에 아래 선 하나만 두는 것도 같은 이유다.
 *
 * 높이는 56px 로 못 박는다. 안에 무엇이 들어와도 줄이 출렁이지 않는다.
 *
 * 인쇄할 때는 사라진다. 화면을 옮기는 장치라 종이에서는 할 일이 없다.
 */

import React from 'react'
import styled from 'styled-components'
import { useTheme } from '../theme/ThemeContext'

const Bar = styled.header`
  display: flex;
  align-items: center;
  gap: 12px;
  height: 56px;
  padding: 0 16px;
  background: hsl(var(--header-bg));
  color: hsl(var(--header-fg));
  /* 그림자가 아니라 선. 그림자는 어두운 판에서 안 보여 층이 사라진다. */
  border-bottom: 1px solid hsl(var(--border));
  /* 아래가 길어도 눌리지 않는다. 눌리면 제목이 잘린다. */
  flex-shrink: 0;
  /* 좁아져도 단추가 줄바꿈하지 않게. 줄이 늘면 높이가 다시 출렁인다. */
  flex-wrap: nowrap;

  @media print {
    display: none;
  }
`

const Left = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  flex: 1;
  min-width: 0;
`

const Names = styled.div`
  min-width: 0;
`

const Title = styled.h1`
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Sub = styled.p`
  margin: 1px 0 0;
  font-size: 0.76rem;
  color: hsl(var(--fg-muted));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Right = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
`

/** 머리띠 위의 단추. 어두운 바탕용이라 본문에 그대로 쓰면 안 보인다. */
/**
 * 줄 위의 단추. 32px 높이 — 두 앱의 `h-8` 과 같다.
 *
 * 평소에는 **테두리도 없다.** 줄에 단추가 예닐곱 개 놓이는데 전부 테두리를
 * 두르면 그것만으로 화면이 시끄러워진다. 마우스를 얹을 때만 바탕이 든다.
 */
export const BarButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 10px;
  background: ${p => (p.$on ? 'hsl(var(--primary))' : 'transparent')};
  border: 1px solid ${p => (p.$on ? 'hsl(var(--primary))' : 'transparent')};
  color: ${p => (p.$on ? 'hsl(var(--solid-fg))' : 'hsl(var(--fg-muted))')};
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 0.82rem;
  font-family: inherit;
  white-space: nowrap;
  transition: background-color 100ms ease, color 100ms ease;

  &:hover:not(:disabled) {
    background: ${p => (p.$on
      ? 'hsl(var(--primary) / 0.9)' : 'hsl(var(--surface-2))')};
    color: ${p => (p.$on ? 'hsl(var(--solid-fg))' : 'hsl(var(--fg))')};
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`

/** 사람 이름처럼 누를 수 없는 것. 단추 사이에 섞여도 단추로 안 보여야 한다. */
export const BarText = styled.span`
  font-size: 0.82rem;
  color: hsl(var(--fg-muted));
  white-space: nowrap;
  margin-right: 4px;
`

/** 판 전환. 글자 대신 그림 하나 — 단추 줄이 길어서 자리를 아껴야 한다. */
const ThemeToggle = styled(BarButton)`
  padding: 7px 10px;
  font-size: 0.95rem;
  line-height: 1;
`

/**
 * @param onHome 홈으로 갈 길. 홈 화면 자신이면 넘기지 않는다
 * @param right  오른쪽에 놓을 것들 (`BarButton` 을 쓴다)
 */
function AppHeader({ title, subtitle, onHome, right }) {
  const { theme, toggle } = useTheme()

  return (
    <Bar>
      <Left>
        {onHome && <BarButton onClick={onHome}>← 홈</BarButton>}
        <Names>
          <Title>{title}</Title>
          {subtitle && <Sub>{subtitle}</Sub>}
        </Names>
      </Left>
      <Right>
        {right}
        {/* 늘 맨 오른쪽 끝. 화면마다 자리가 달라지면 찾아 헤매게 된다. */}
        <ThemeToggle
          onClick={toggle}
          title={theme === 'dark' ? '밝은 화면으로' : '어두운 화면으로'}
          aria-label={theme === 'dark' ? '밝은 화면으로' : '어두운 화면으로'}>
          {theme === 'dark' ? '☀' : '☾'}
        </ThemeToggle>
      </Right>
    </Bar>
  )
}

export default AppHeader
