import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { api } from '../../shared/api/client'
import { useAuth } from '../../shared/auth/AuthContext'
import { ErrorBox, Field, FieldLabel, FootNote, Hint, Input, NoticeBox, Page, Panel, Submit, Subtitle, Title } from './authStyles'

const MIN_PASSWORD = 10

/**
 * 비밀번호 변경 — 강제와 자발적 변경을 같은 화면이 처리한다.
 *
 * 화면을 둘로 나누면 규칙(현재 비밀번호 확인·최소 길이·이전과 다를 것)이 두 벌이
 * 되고, 한쪽만 고치는 일이 생긴다.
 *
 * 변경에 성공하면 서버가 **모든 세션을 끊는다.** 바꾼 이유가 유출일 수 있기
 * 때문인데, 그래서 이 브라우저도 로그아웃된다. 그 사실을 미리 말해 주지 않으면
 * 사용자는 갑자기 튕긴 것으로 느낀다.
 */
export function ChangePasswordPage() {
  const { user, clear } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const forced = Boolean(user && user.must_change_password)
  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    setError(null)

    if (form.next !== form.confirm) {
      setError('새 비밀번호가 서로 다릅니다.')
      return
    }

    setBusy(true)
    try {
      await api.post('/auth/change-password', {
        current_password: form.current,
        new_password: form.next,
      })
      clear()
      navigate('/login', {
        replace: true,
        state: { notice: '비밀번호가 변경되었습니다.\n새 비밀번호로 다시 로그인해 주세요.' },
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
        <Title>비밀번호 변경</Title>
        <Subtitle>
          {forced
            ? '임시 비밀번호로 로그인하셨습니다. 계속하려면 먼저 비밀번호를 바꿔야 합니다.'
            : '변경하면 이 브라우저를 포함한 모든 기기에서 다시 로그인해야 합니다.'}
        </Subtitle>

        {forced && (
          <NoticeBox>
            관리자가 발급한 비밀번호는 전달 과정에서 다른 사람이 알게 될 수 있습니다.
            본인만 아는 값으로 바꿔 주세요.
          </NoticeBox>
        )}
        {error && <ErrorBox>{error}</ErrorBox>}

        <Field>
          <FieldLabel>현재 비밀번호</FieldLabel>
          <Input
            type="password"
            value={form.current}
            onChange={set('current')}
            autoComplete="current-password"
            autoFocus
            required
          />
        </Field>

        <Field>
          <FieldLabel>새 비밀번호</FieldLabel>
          <Input
            type="password"
            value={form.next}
            onChange={set('next')}
            autoComplete="new-password"
            minLength={MIN_PASSWORD}
            required
          />
          <Hint>{MIN_PASSWORD}자 이상. 이전과 달라야 합니다.</Hint>
        </Field>

        <Field>
          <FieldLabel>새 비밀번호 확인</FieldLabel>
          <Input
            type="password"
            value={form.confirm}
            onChange={set('confirm')}
            autoComplete="new-password"
            required
          />
        </Field>

        <Submit type="submit" disabled={busy}>
          {busy ? '변경 중…' : '비밀번호 변경'}
        </Submit>

        {!forced && (
          <FootNote>
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault()
                navigate('/')
              }}
            >
              돌아가기
            </a>
          </FootNote>
        )}
      </Panel>
    </Page>
  )
}

export default ChangePasswordPage
