import React, { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '../../shared/auth/AuthContext'
import { ErrorBox, Field, FieldLabel, FootNote, Input, NoticeBox, Page, Panel, Submit, Subtitle, Title } from './authStyles'

export function LoginPage() {
  const { status, user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  // 가입 직후 이 화면으로 돌아온다. 어떻게 됐는지 말해 주지 않으면 신청이
  // 접수됐는지 알 수 없다.
  const notice = location.state && location.state.notice

  if (status === 'loading') return <Page />
  if (status === 'authenticated' && user) {
    // 이미 로그인돼 있는데 /login 을 열면, 가려던 곳이 있으면 그리로 보낸다.
    const back = (location.state && location.state.from && location.state.from.pathname) || '/'
    return <Navigate to={back} replace />
  }

  const submit = async (event) => {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const me = await login(email.trim(), password)
      if (me.must_change_password) {
        navigate('/change-password', { replace: true })
        return
      }
      const back = (location.state && location.state.from && location.state.from.pathname) || '/'
      navigate(back, { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page>
      <Panel onSubmit={submit}>
        <Title>Mechanical Design</Title>
        <Subtitle>계속하려면 로그인하세요.</Subtitle>

        {notice && <NoticeBox>{notice}</NoticeBox>}
        {error && <ErrorBox>{error}</ErrorBox>}

        <Field>
          <FieldLabel>아이디</FieldLabel>
          <Input
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </Field>

        <Field>
          <FieldLabel>비밀번호</FieldLabel>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>

        <Submit type="submit" disabled={busy}>
          {busy ? '로그인 중…' : '로그인'}
        </Submit>

        <FootNote>
          계정이 없으신가요? <Link to="/signup">가입 신청</Link>
        </FootNote>
      </Panel>
    </Page>
  )
}

export default LoginPage
