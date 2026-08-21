/** 로그인·가입·비밀번호 화면이 함께 쓰는 스타일. 톤은 MainPage 헤더에 맞춘다. */

import styled from 'styled-components'

export const Page = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f0f2f5;
  padding: 24px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
`

export const Panel = styled.form`
  width: 100%;
  max-width: 400px;
  background: white;
  border-radius: 12px;
  padding: 40px 36px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
`

export const Title = styled.h1`
  font-size: 1.5rem;
  font-weight: 700;
  color: #1a1a2e;
  margin: 0 0 6px 0;
`

export const Subtitle = styled.p`
  font-size: 0.9rem;
  color: #888;
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
  color: #555;
  margin-bottom: 6px;
`

export const Input = styled.input`
  width: 100%;
  box-sizing: border-box;
  padding: 11px 13px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.95rem;
  transition: border-color 0.15s ease;

  &:focus {
    outline: none;
    border-color: #3498db;
  }

  &:disabled {
    background: #f5f5f5;
    color: #999;
  }
`

export const Hint = styled.span`
  display: block;
  font-size: 0.78rem;
  color: #aaa;
  margin-top: 5px;
`

export const Submit = styled.button`
  width: 100%;
  padding: 12px;
  background: #1a1a2e;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover:not(:disabled) {
    background: #2a2a4e;
  }

  &:disabled {
    background: #aaa;
    cursor: not-allowed;
  }
`

/**
 * 오류는 **입력칸 위쪽 고정 자리**에 띄운다. alert 로 띄우면 사용자가 닫는
 * 순간 무엇이 틀렸는지 다시 볼 수 없다.
 */
export const ErrorBox = styled.div`
  background: #fdecea;
  border: 1px solid #f5c6cb;
  color: #a4343a;
  border-radius: 6px;
  padding: 11px 13px;
  font-size: 0.85rem;
  line-height: 1.45;
  margin-bottom: 18px;
  white-space: pre-line;
`

export const NoticeBox = styled.div`
  background: #eef7ee;
  border: 1px solid #cbe5cb;
  color: #2f6b34;
  border-radius: 6px;
  padding: 11px 13px;
  font-size: 0.85rem;
  line-height: 1.45;
  margin-bottom: 18px;
  white-space: pre-line;
`

export const FootNote = styled.p`
  margin: 22px 0 0 0;
  font-size: 0.85rem;
  color: #888;
  text-align: center;

  a {
    color: #3498db;
    text-decoration: none;
    font-weight: 600;
  }

  a:hover {
    text-decoration: underline;
  }
`
