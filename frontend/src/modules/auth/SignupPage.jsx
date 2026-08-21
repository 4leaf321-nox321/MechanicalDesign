import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { api } from '../../shared/api/client'
import { ErrorBox, Field, FieldLabel, FootNote, Hint, Input, Page, Panel, Submit, Subtitle, Title } from './authStyles'

const MIN_PASSWORD = 10

export function SignupPage() {
  const navigate = useNavigate()

  const [form, setForm] = useState({ email: '', display_name: '', password: '', confirm: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    setError(null)

    // 확인란은 서버가 알 필요가 없는 화면만의 규칙이라 여기서 본다.
    if (form.password !== form.confirm) {
      setError('비밀번호가 서로 다릅니다.')
      return
    }

    setBusy(true)
    try {
      await api.post('/auth/signup', {
        email: form.email.trim(),
        display_name: form.display_name.trim(),
        password: form.password,
      })
      // 승인 전까지는 로그인할 수 없다. 바로 로그인시키려 하면 403 만 보게 된다.
      navigate('/login', {
        replace: true,
        state: { notice: '가입 신청이 접수되었습니다.\n관리자가 승인하면 로그인할 수 있습니다.' },
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page>
      <Panel onSubmit={submit}>
        <Title>가입 신청</Title>
        <Subtitle>관리자가 승인하면 로그인할 수 있습니다.</Subtitle>

        {error && <ErrorBox>{error}</ErrorBox>}

        <Field>
          <FieldLabel>아이디</FieldLabel>
          <Input
            type="text"
            value={form.email}
            onChange={set('email')}
            autoComplete="username"
            autoFocus
            required
          />
          <Hint>로그인에 쓰는 이름입니다(이메일이어도 됩니다). 나중에 본인이 바꿀 수 없습니다.</Hint>
        </Field>

        <Field>
          <FieldLabel>이름</FieldLabel>
          <Input
            type="text"
            value={form.display_name}
            onChange={set('display_name')}
            autoComplete="name"
            required
          />
        </Field>

        <Field>
          <FieldLabel>비밀번호</FieldLabel>
          <Input
            type="password"
            value={form.password}
            onChange={set('password')}
            autoComplete="new-password"
            minLength={MIN_PASSWORD}
            required
          />
          <Hint>{MIN_PASSWORD}자 이상. 길이 제한은 사실상 없습니다.</Hint>
        </Field>

        <Field>
          <FieldLabel>비밀번호 확인</FieldLabel>
          <Input
            type="password"
            value={form.confirm}
            onChange={set('confirm')}
            autoComplete="new-password"
            required
          />
        </Field>

        <Submit type="submit" disabled={busy}>
          {busy ? '신청 중…' : '가입 신청'}
        </Submit>

        <FootNote>
          이미 계정이 있으신가요? <Link to="/login">로그인</Link>
        </FootNote>
      </Panel>
    </Page>
  )
}

export default SignupPage
