import React from 'react'
import styled from 'styled-components'

const Wrapper = styled.div`
  min-height: 100vh;
  background: #f5f5f5;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
`

const Header = styled.header`
  display: flex;
  align-items: center;
  background: #1a1a2e;
  color: white;
  padding: 16px 32px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
`

const LeftSection = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
`

const HomeButton = styled.button`
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: background 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.2);
  }
`

const Title = styled.h1`
  font-size: 1.3rem;
  font-weight: 600;
  margin: 0;
`

const RightSection = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const SettingsButton = styled.button`
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: background 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;

  &:hover {
    background: rgba(255, 255, 255, 0.2);
  }
`

const EditModeBtn = styled.button`
  background: ${props => props.$active ? 'rgba(52, 152, 219, 0.8)' : 'rgba(255, 255, 255, 0.1)'};
  border: 1px solid ${props => props.$active ? '#3498db' : 'rgba(255, 255, 255, 0.2)'};
  color: white;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;

  &:hover {
    background: ${props => props.$active ? 'rgba(52, 152, 219, 0.9)' : 'rgba(255, 255, 255, 0.2)'};
  }
`

const Content = styled.main`
  padding: 24px 32px;
`

function ModuleLayout({ title, onGoHome, onSettings, editMode, onToggleEditMode, children }) {
  return (
    <Wrapper>
      <Header>
        <LeftSection>
          <HomeButton onClick={onGoHome}>← 홈</HomeButton>
          <Title>{title}</Title>
        </LeftSection>
        <RightSection>
          {onToggleEditMode && (
            <EditModeBtn $active={editMode} onClick={onToggleEditMode}>
              {editMode ? '편집 완료' : '레이아웃 편집'}
            </EditModeBtn>
          )}
          {onSettings && (
            <SettingsButton onClick={onSettings}>⚙ 설정</SettingsButton>
          )}
        </RightSection>
      </Header>
      <Content>{children}</Content>
    </Wrapper>
  )
}

export default ModuleLayout
