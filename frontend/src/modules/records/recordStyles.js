/**
 * 계산 기록 화면이 함께 쓰는 스타일.
 *
 * 남색 머리띠는 여기 없다 — `AppHeader` 가 모든 화면 몫으로 맡는다.
 * 화면마다 따로 두었더니 높이가 제각각이 되어 화면을 옮길 때마다 띠가
 * 출렁였다.
 */

import styled from 'styled-components'

export const Page = styled.div`
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

/** 머리띠 아래만 구른다. 인쇄에서는 그 제한을 푼다 — 안 그러면 첫 장만 나온다. */
export const Body = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 32px 48px;
  max-width: 1100px;

  @media print {
    height: auto;
    overflow: visible;
    padding: 0;
    max-width: none;
  }
`

export const Panel = styled.div`
  background: hsl(var(--surface));
  border-radius: var(--radius);
  padding: 22px 24px;
  border: 1px solid hsl(var(--border));
  margin-bottom: 20px;

  @media print {
    box-shadow: none;
    border: 1px solid hsl(var(--border));
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
  color: hsl(var(--fg));
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
  border-bottom: 2px solid hsl(var(--border));
  color: hsl(var(--fg-muted));
  font-weight: 600;
  font-size: 0.8rem;
  white-space: nowrap;
`

export const Td = styled.td`
  padding: 10px 12px;
  border-bottom: 1px solid hsl(var(--surface-2));
  color: hsl(var(--fg));
  vertical-align: top;
`

export const Mono = styled.span`
  font-family: 'Consolas', 'Menlo', monospace;
  color: hsl(var(--fg-muted));
`

export const Empty = styled.p`
  color: hsl(var(--fg-subtle));
  font-size: 0.9rem;
  margin: 6px 0 0 0;
`

export const ErrorBox = styled.div`
  background: hsl(var(--danger-soft));
  border: 1px solid hsl(var(--danger-border));
  color: hsl(var(--danger));
  border-radius: var(--radius);
  padding: 11px 13px;
  font-size: 0.85rem;
  margin-bottom: 18px;
  white-space: pre-line;
`
