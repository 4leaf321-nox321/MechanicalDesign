/** 로그인·가입·비밀번호 화면이 함께 쓰는 스타일. 톤은 MainPage 헤더에 맞춘다. */

import styled from 'styled-components'

export const Page = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: hsl(var(--bg));
  padding: 24px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
`

export const Panel = styled.form`
  width: 100%;
  max-width: 400px;
  background: hsl(var(--surface));
  border-radius: var(--radius-lg);
  padding: 40px 36px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
`

export const Title = styled.h1`
  font-size: 1.5rem;
  font-weight: 700;
  color: hsl(var(--fg));
  margin: 0 0 6px 0;
`

export const Subtitle = styled.p`
  font-size: 0.9rem;
  color: hsl(var(--fg-subtle));
  margin: 0 0 28px 0;
  line-height: 1.5;
`

export const Field = styled.label`
  display: block;
  margin-bottom: 18px;
`

export const FieldLabel = styled.span`
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  color: hsl(var(--fg-muted));
  margin-bottom: 6px;
`

export const Input = styled.input`
  width: 100%;
  box-sizing: border-box;
  padding: 11px 13px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  font-size: 0.95rem;
  transition: border-color 0.15s ease;

  &:focus {
    outline: none;
    border-color: hsl(var(--primary));
  }

  &:disabled {
    background: hsl(var(--bg));
    color: hsl(var(--fg-subtle));
  }
`

export const Hint = styled.span`
  display: block;
  font-size: 0.78rem;
  color: hsl(var(--fg-subtle));
  margin-top: 5px;
`

export const Submit = styled.button`
  width: 100%;
  padding: 12px;
  background: hsl(var(--fg));
  color: hsl(var(--solid-fg));
  border: none;
  border-radius: var(--radius);
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover:not(:disabled) {
    background: hsl(var(--header-bg) / 0.85);
  }

  &:disabled {
    background: hsl(var(--fg-subtle));
    cursor: not-allowed;
  }
`

/**
 * 오류는 **입력칸 위쪽 고정 자리**에 띄운다. alert 로 띄우면 사용자가 닫는
 * 순간 무엇이 틀렸는지 다시 볼 수 없다.
 */
export const ErrorBox = styled.div`
  background: hsl(var(--danger-soft));
  border: 1px solid hsl(var(--danger-border));
  color: hsl(var(--danger));
  border-radius: var(--radius);
  padding: 11px 13px;
  font-size: 0.85rem;
  line-height: 1.45;
  margin-bottom: 18px;
  white-space: pre-line;
`

export const NoticeBox = styled.div`
  background: hsl(var(--ok-soft));
  border: 1px solid hsl(var(--ok-border));
  color: hsl(var(--ok));
  border-radius: var(--radius);
  padding: 11px 13px;
  font-size: 0.85rem;
  line-height: 1.45;
  margin-bottom: 18px;
  white-space: pre-line;
`

export const FootNote = styled.p`
  margin: 22px 0 0 0;
  font-size: 0.85rem;
  color: hsl(var(--fg-subtle));
  text-align: center;

  a {
    color: hsl(var(--primary));
    text-decoration: none;
    font-weight: 600;
  }

  a:hover {
    text-decoration: underline;
  }
`
