/** 계산 기록 화면이 함께 쓰는 스타일. 톤은 MainPage 헤더에 맞춘다. */

import styled from 'styled-components'

export const Page = styled.div`
  min-height: 100vh;
  background: #f0f2f5;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
`

export const Header = styled.header`
  background: #1a1a2e;
  color: white;
  padding: 28px 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);

  /* 인쇄할 때는 남색 머리띠가 잉크만 먹고 아무것도 알려 주지 않는다. */
  @media print {
    display: none;
  }
`

export const HeaderTitle = styled.h1`
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0;
`

export const HeaderSub = styled.p`
  margin: 5px 0 0 0;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.6);
`

export const GhostBtn = styled.button`
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.35);
  color: white;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 0.85rem;
  cursor: pointer;
  margin-left: 8px;

  &:hover {
    background: rgba(255, 255, 255, 0.12);
  }
`

export const Body = styled.div`
  padding: 32px 48px;
  max-width: 1100px;

  @media print {
    padding: 0;
    max-width: none;
  }
`

export const Panel = styled.div`
  background: white;
  border-radius: 10px;
  padding: 22px 24px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  margin-bottom: 20px;

  @media print {
    box-shadow: none;
    border: 1px solid #ddd;
    border-radius: 0;
    margin-bottom: 12px;
    padding: 14px 16px;
    /* 표 하나가 페이지 경계에서 잘리면 계산서로 못 쓴다. */
    break-inside: avoid;
  }
`

export const PanelTitle = styled.h2`
  font-size: 1rem;
  font-weight: 700;
  color: #1a1a2e;
  margin: 0 0 14px 0;
`

export const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
`

export const Th = styled.th`
  text-align: left;
  padding: 9px 12px;
  border-bottom: 2px solid #eee;
  color: #666;
  font-weight: 600;
  font-size: 0.8rem;
  white-space: nowrap;
`

export const Td = styled.td`
  padding: 10px 12px;
  border-bottom: 1px solid #f2f2f2;
  color: #333;
  vertical-align: top;
`

export const Mono = styled.span`
  font-family: 'Consolas', 'Menlo', monospace;
  color: #555;
`

export const Empty = styled.p`
  color: #999;
  font-size: 0.9rem;
  margin: 6px 0 0 0;
`

export const ErrorBox = styled.div`
  background: #fdecea;
  border: 1px solid #f5c6cb;
  color: #a4343a;
  border-radius: 6px;
  padding: 11px 13px;
  font-size: 0.85rem;
  margin-bottom: 18px;
  white-space: pre-line;
`
