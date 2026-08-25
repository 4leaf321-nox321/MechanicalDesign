/**
 * 계정 관리 — 관리자 전용.
 *
 * 임시 비밀번호는 **여기서 한 번만** 보인다. 서버가 저장하지 않으므로 이 창을
 * 닫으면 다시 볼 수 없다. 메일을 보낼 수단이 없어서 관리자가 구두로 전달하는
 * 것을 전제로 하고, 그래서 첫 로그인에서 변경이 강제된다.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styled from 'styled-components'
import AppHeader from '../../shared/components/AppHeader'

import { api } from '../../shared/api/client'
import { useAuth } from '../../shared/auth/AuthContext'

const STATUS_LABEL = {
  pending: '승인 대기',
  active: '정상',
  suspended: '정지',
}

const STATUS_COLOR = {
  pending: 'hsl(var(--warn))',
  active: 'hsl(var(--ok))',
  suspended: 'hsl(var(--danger))',
}

const FILTERS = [
  { key: '', label: '전체' },
  { key: 'pending', label: '승인 대기' },
  { key: 'active', label: '정상' },
  { key: 'suspended', label: '정지' },
]

const Page = styled.div`
  /* 껍데기가 이미 화면 높이를 잡았다. 여기서 또 100vh 를 쓰면
     사이드바 높이만큼 아래로 넘친다. */
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: hsl(var(--bg));
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
`

const Body = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 32px 48px;
  max-width: 1200px;
`

const Bar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
  flex-wrap: wrap;
`

const Tab = styled.button`
  background: ${(p) => (p.$on ? 'hsl(var(--fg))' : 'white')};
  color: ${(p) => (p.$on ? 'white' : 'hsl(var(--fg-muted))')};
  border: 1px solid ${(p) => (p.$on ? 'hsl(var(--fg))' : 'hsl(var(--border))')};
  padding: 8px 16px;
  border-radius: var(--radius);
  font-size: 0.85rem;
  cursor: pointer;
`

const PrimaryBtn = styled.button`
  margin-left: auto;
  background: hsl(var(--primary));
  color: hsl(var(--solid-fg));
  border: none;
  padding: 9px 18px;
  border-radius: var(--radius);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    background: hsl(var(--primary) / 0.85);
  }
`

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  background: hsl(var(--surface));
  border-radius: var(--radius);
  overflow: hidden;
  border: 1px solid hsl(var(--border));
  font-size: 0.88rem;

  th,
  td {
    padding: 13px 16px;
    text-align: left;
    border-bottom: 1px solid hsl(var(--bg));
    vertical-align: middle;
  }

  th {
    background: hsl(var(--surface-2));
    font-weight: 600;
    color: hsl(var(--fg-muted));
    font-size: 0.8rem;
  }

  tr:last-child td {
    border-bottom: none;
  }
`

const Badge = styled.span`
  display: inline-block;
  padding: 3px 9px;
  border-radius: var(--radius);
  font-size: 0.75rem;
  font-weight: 600;
  color: hsl(var(--solid-fg));
  background: ${(p) => p.$color || 'hsl(var(--fg-subtle))'};
`

const RowActions = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
`

const SmallBtn = styled.button`
  background: hsl(var(--surface));
  border: 1px solid hsl(var(--border));
  color: ${(p) => p.$danger ? 'hsl(var(--danger))' : 'hsl(var(--fg-muted))'};
  padding: 5px 10px;
  border-radius: var(--radius-sm);
  font-size: 0.78rem;
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: ${(p) => p.$danger ? 'hsl(var(--danger))' : 'hsl(var(--primary))'};
  }

  &:disabled {
    color: hsl(var(--border-strong));
    cursor: not-allowed;
  }
`

const Message = styled.div`
  border-radius: var(--radius);
  padding: 13px 16px;
  font-size: 0.87rem;
  line-height: 1.5;
  margin-bottom: 18px;
  white-space: pre-line;
  background: ${(p) => (p.$error ? 'hsl(var(--danger-soft))' : 'hsl(var(--ok-soft))')};
  border: 1px solid ${(p) => (p.$error ? 'hsl(var(--danger-border))' : 'hsl(var(--ok-border))')};
  color: ${(p) => (p.$error ? 'hsl(var(--danger))' : 'hsl(var(--ok))')};
`

const Secret = styled.code`
  display: inline-block;
  background: hsl(var(--fg));
  color: hsl(var(--ok));
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  font-size: 0.95rem;
  letter-spacing: 0.4px;
  user-select: all;
`

const Empty = styled.div`
  background: hsl(var(--surface));
  border-radius: var(--radius);
  padding: 48px;
  text-align: center;
  color: hsl(var(--fg-subtle));
  font-size: 0.9rem;
`

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
`

const Modal = styled.form`
  background: hsl(var(--surface));
  border-radius: var(--radius-lg);
  padding: 28px;
  width: 100%;
  max-width: 380px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
`

const ModalTitle = styled.h2`
  margin: 0 0 18px 0;
  font-size: 1.15rem;
  color: hsl(var(--fg));
`

const Label = styled.label`
  display: block;
  margin-bottom: 14px;
  font-size: 0.85rem;
  color: hsl(var(--fg-muted));
  font-weight: 600;
`

const TextInput = styled.input`
  width: 100%;
  box-sizing: border-box;
  margin-top: 5px;
  padding: 10px 12px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  font-size: 0.9rem;
  font-weight: 400;

  &:focus {
    outline: none;
    border-color: hsl(var(--primary));
  }
`

const CheckRow = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.87rem;
  color: hsl(var(--fg-muted));
  margin-bottom: 18px;
  cursor: pointer;
`

const ModalActions = styled.div`
  display: flex;
  gap: 8px;
  justify-content: flex-end;
`

export function AccountsAdminPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [filter, setFilter] = useState('')
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState(null)
  const [creating, setCreating] = useState(false)
  const [newAccount, setNewAccount] = useState({ email: '', display_name: '', is_admin: false })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const query = filter ? `?status=${filter}` : ''
      setAccounts(await api.get(`/accounts${query}`))
    } catch (err) {
      setMessage({ error: true, text: err.message })
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    load()
  }, [load])

  /**
   * 실패해도 목록을 다시 읽는다 — 다른 관리자가 이미 처리했을 수 있다.
   *
   * action 은 문자열이나 `{ text, secret }` 을 돌려준다. 임시 비밀번호는
   * `secret` 으로 따로 받는다 — 문장 안에 섞어 두고 나중에 쪼개 꺼내는 방식은
   * 문구를 다듬는 순간 조용히 안 보이게 된다.
   */
  const run = async (action) => {
    setMessage(null)
    try {
      const result = await action()
      if (!result) return
      if (typeof result === 'string') setMessage({ error: false, text: result })
      else setMessage({ error: false, text: result.text, secret: result.secret })
    } catch (err) {
      setMessage({ error: true, text: err.message })
    } finally {
      load()
    }
  }

  const approve = (row) =>
    run(async () => {
      await api.post(`/accounts/${row.id}/approve`)
      return `${row.display_name} 님을 승인했습니다.`
    })

  const reject = (row) => {
    const note = window.prompt(`${row.display_name} 님의 신청을 거절합니다.\n사유를 적어 주세요 (본인에게 보이지는 않습니다).`)
    if (note === null) return
    run(async () => {
      await api.post(`/accounts/${row.id}/reject`, { note })
      return `${row.display_name} 님의 신청을 거절했습니다.`
    })
  }

  const setStatus = (row, next) =>
    run(async () => {
      await api.post(`/accounts/${row.id}/${next}`)
      return next === 'suspend'
        ? `${row.display_name} 님을 정지했습니다. 진행 중이던 세션도 함께 끊었습니다.`
        : `${row.display_name} 님을 다시 활성화했습니다.`
    })

  const toggleAdmin = (row) =>
    run(async () => {
      await api.put(`/accounts/${row.id}/admin`, { is_admin: !row.is_admin })
      return row.is_admin
        ? `${row.display_name} 님의 관리자 권한을 해제했습니다.`
        : `${row.display_name} 님에게 관리자 권한을 주었습니다.`
    })

  const resetPassword = (row) => {
    if (!window.confirm(`${row.display_name} 님의 비밀번호를 재설정합니다.\n진행 중이던 세션이 모두 끊깁니다. 계속할까요?`)) return
    run(async () => {
      const body = await api.post(`/accounts/${row.id}/reset-password`)
      return {
        text: `${row.display_name} 님의 임시 비밀번호를 발급했습니다.`,
        secret: body.temporary_password,
      }
    })
  }

  const remove = (row) => {
    if (!window.confirm(`${row.display_name} 님의 계정을 삭제합니다.\n로그인은 막히지만 이 사람이 만든 카드의 기록은 남습니다. 계속할까요?`)) return
    run(async () => {
      await api.del(`/accounts/${row.id}`)
      return `${row.display_name} 님의 계정을 삭제했습니다.`
    })
  }

  const create = (event) => {
    event.preventDefault()
    run(async () => {
      const body = await api.post('/accounts', {
        email: newAccount.email.trim(),
        display_name: newAccount.display_name.trim(),
        is_admin: newAccount.is_admin,
      })
      setCreating(false)
      setNewAccount({ email: '', display_name: '', is_admin: false })
      return {
        text: `${body.account.display_name} 님의 계정을 만들었습니다.`,
        secret: body.temporary_password,
      }
    })
  }

  // 임시 비밀번호는 눈에 띄어야 하고, 다시 볼 수 없다는 사실도 함께 보여야 한다.
  const renderMessage = (entry) => {
    if (!entry.secret) return entry.text
    return (
      <>
        {entry.text}
        {'\n'}
        <Secret>{entry.secret}</Secret>
        {'\n이 값은 다시 표시되지 않습니다. 본인에게 직접 전달하세요.'}
      </>
    )
  }

  return (
    <Page>
      <AppHeader title="계정 관리" onHome={() => navigate('/')} />

      <Body>
        {message && <Message $error={message.error}>{renderMessage(message)}</Message>}

        <Bar>
          {FILTERS.map((f) => (
            <Tab key={f.key} $on={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label}
            </Tab>
          ))}
          <PrimaryBtn onClick={() => setCreating(true)}>+ 계정 만들기</PrimaryBtn>
        </Bar>

        {loading ? (
          <Empty>불러오는 중…</Empty>
        ) : accounts.length === 0 ? (
          <Empty>해당하는 계정이 없습니다.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>이름</th>
                <th>아이디</th>
                <th>상태</th>
                <th>권한</th>
                <th>비고</th>
                <th>작업</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((row) => {
                const self = user && row.id === user.id
                const deleted = Boolean(row.deleted_at)
                return (
                  <tr key={row.id}>
                    <td>
                      {row.display_name}
                      {self && ' (나)'}
                    </td>
                    <td>{row.email}</td>
                    <td>
                      <Badge $color={deleted ? 'hsl(var(--fg-subtle))' : STATUS_COLOR[row.status]}>
                        {deleted ? '삭제됨' : STATUS_LABEL[row.status] || row.status}
                      </Badge>
                    </td>
                    <td>{row.is_admin ? '관리자' : '일반'}</td>
                    <td style={{ color: 'hsl(var(--fg-subtle))', fontSize: '0.82rem' }}>
                      {row.must_change_password && '비밀번호 변경 필요'}
                      {row.decision_note && `거절 사유: ${row.decision_note}`}
                    </td>
                    <td>
                      <RowActions>
                        {row.status === 'pending' && !deleted && (
                          <>
                            <SmallBtn onClick={() => approve(row)}>승인</SmallBtn>
                            <SmallBtn $danger onClick={() => reject(row)}>거절</SmallBtn>
                          </>
                        )}
                        {row.status === 'active' && !deleted && (
                          <SmallBtn $danger disabled={self} onClick={() => setStatus(row, 'suspend')}>
                            정지
                          </SmallBtn>
                        )}
                        {row.status === 'suspended' && !deleted && (
                          <SmallBtn onClick={() => setStatus(row, 'activate')}>활성화</SmallBtn>
                        )}
                        {!deleted && (
                          <>
                            <SmallBtn disabled={self} onClick={() => toggleAdmin(row)}>
                              {row.is_admin ? '관리자 해제' : '관리자 지정'}
                            </SmallBtn>
                            <SmallBtn onClick={() => resetPassword(row)}>비밀번호 재설정</SmallBtn>
                            <SmallBtn $danger disabled={self} onClick={() => remove(row)}>
                              삭제
                            </SmallBtn>
                          </>
                        )}
                      </RowActions>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </Body>

      {creating && (
        <Backdrop onClick={(e) => e.target === e.currentTarget && setCreating(false)}>
          <Modal onSubmit={create}>
            <ModalTitle>계정 만들기</ModalTitle>
            <Label>
              아이디
              <TextInput
                type="text"
                value={newAccount.email}
                onChange={(e) => setNewAccount({ ...newAccount, email: e.target.value })}
                autoFocus
                required
              />
            </Label>
            <Label>
              이름
              <TextInput
                type="text"
                value={newAccount.display_name}
                onChange={(e) => setNewAccount({ ...newAccount, display_name: e.target.value })}
                required
              />
            </Label>
            <CheckRow>
              <input
                type="checkbox"
                checked={newAccount.is_admin}
                onChange={(e) => setNewAccount({ ...newAccount, is_admin: e.target.checked })}
              />
              관리자 권한 부여
            </CheckRow>
            <ModalActions>
              <SmallBtn type="button" onClick={() => setCreating(false)}>
                취소
              </SmallBtn>
              <PrimaryBtn type="submit" style={{ marginLeft: 0 }}>
                만들기
              </PrimaryBtn>
            </ModalActions>
          </Modal>
        </Backdrop>
      )}
    </Page>
  )
}

export default AccountsAdminPage
