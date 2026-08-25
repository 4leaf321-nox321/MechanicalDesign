/**
 * 카드 화면의 뼈대.
 *
 * 머리띠는 `AppHeader` 가 맡는다 — 홈·기록·워크플로가 같은 것을 쓴다. 화면마다
 * 따로 두었더니 높이가 제각각이 되어, 화면을 옮길 때마다 띠가 출렁였다.
 */

import React from 'react'
import styled from 'styled-components'
import AppHeader, { BarButton } from './AppHeader'

const Wrapper = styled.div`
  /* 껍데기가 이미 화면 높이를 잡았다. 여기서 또 100vh 를 쓰면
     사이드바 높이만큼 아래로 넘친다. */
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: hsl(var(--bg));
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

  /* 인쇄에서는 높이를 풀어야 한다. 못 박아 두면 첫 화면 분량만 나온다. */
  @media print {
    height: auto;
    overflow: visible;
  }
`

/** 머리띠 아래만 구른다. 페이지째 구르면 「← 홈」 이 위로 사라진다. */
const Content = styled.main`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 24px 32px;

  /* 인쇄에서는 높이를 풀어야 한다. 못 박아 두면 첫 화면 분량만 나온다. */
  @media print {
    height: auto;
    overflow: visible;
  }
`

function ModuleLayout({
  title, onGoHome, onSettings, onHistory, onValidate, onRecords,
  editMode, onToggleEditMode, children,
}) {
  return (
    <Wrapper>
      <AppHeader
        title={title}
        onHome={onGoHome}
        right={(
          <>
            {onToggleEditMode && (
              <BarButton $on={editMode} onClick={onToggleEditMode}>
                {editMode ? '편집 완료' : '레이아웃 편집'}
              </BarButton>
            )}
            {onRecords && <BarButton onClick={onRecords}>계산 기록</BarButton>}
            {onValidate && <BarButton onClick={onValidate}>검증</BarButton>}
            {onHistory && <BarButton onClick={onHistory}>변경 이력</BarButton>}
            {onSettings && <BarButton onClick={onSettings}>⚙ 설정</BarButton>}
          </>
        )}
      />
      <Content>{children}</Content>
    </Wrapper>
  )
}

export default ModuleLayout
