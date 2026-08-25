/**
 * 내 액세스 토큰 — MCP·스크립트가 내 권한으로 붙을 때 쓰는 자격 증명.
 *
 * **원문은 만든 직후 한 번만 보인다.** 서버가 해시만 저장하므로 이 화면을
 * 떠나면 다시 볼 방법이 없다. 그래서 발급 결과를 조용한 성공 메시지로
 * 흘리지 않고, 복사 버튼과 함께 화면 위쪽에 붙잡아 둔다 — 지나쳐 버리면
 * 토큰을 새로 만드는 것 말고는 할 수 있는 일이 없다.
 *
 * 관리자 전용이 아니다. 토큰은 만든 사람의 권한으로 돌기 때문에, 관리자
 * 토큰 하나를 모두가 돌려 쓰면 "누가 만든 카드인지" 가 통째로 사라진다.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styled from 'styled-components'
import AppHeader from '../../shared/components/AppHeader'

import { api } from '../../shared/api/client'
import { useAuth } from '../../shared/auth/AuthContext'
import { useDialog } from '../../shared/components/Dialog'

const STATE_LABEL = { active: '사용 중', expired: '만료됨', revoked: '폐기됨' }
const STATE_COLOR = { active: 'hsl(var(--ok))', expired: 'hsl(var(--warn))', revoked: 'hsl(var(--danger))' }

const EXPIRY_CHOICES = [
  { days: 30, label: '30일' },
  { days: 90, label: '90일' },
  { days: 180, label: '180일' },
  { days: 365, label: '1년' },
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
  max-width: 960px;
`

const Panel = styled.div`
  background: hsl(var(--surface));
  border-radius: var(--radius);
  padding: 24px 26px;
  border: 1px solid hsl(var(--border));
  margin-bottom: 22px;
`

const PanelTitle = styled.h2`
  font-size: 1.05rem;
  font-weight: 700;
  color: hsl(var(--fg));
  margin: 0 0 6px 0;
`

const PanelNote = styled.p`
  font-size: 0.85rem;
  color: hsl(var(--fg-subtle));
  line-height: 1.55;
  margin: 0 0 18px 0;
`

const Row = styled.div`
  display: flex;
  gap: 10px;
  align-items: flex-end;
  flex-wrap: wrap;
`

const Field = styled.label`
  display: block;
  flex: ${(p) => p.$grow || '0 0 auto'};
`

const FieldLabel = styled.span`
  display: block;
  font-size: 0.82rem;
  font-weight: 600;
  color: hsl(var(--fg-muted));
  margin-bottom: 6px;
`

const Input = styled.input`
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  font-size: 0.92rem;

  &:focus {
    outline: none;
    border-color: hsl(var(--primary));
  }
`

const Select = styled.select`
  padding: 10px 12px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  font-size: 0.92rem;
  background: hsl(var(--surface));
`

const PrimaryBtn = styled.button`
  padding: 10px 20px;
  background: hsl(var(--fg));
  color: hsl(var(--solid-fg));
  border: none;
  border-radius: var(--radius);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: hsl(var(--header-bg) / 0.85);
  }

  &:disabled {
    background: hsl(var(--fg-subtle));
    cursor: not-allowed;
  }
`

const DangerBtn = styled.button`
  padding: 6px 12px;
  background: none;
  border: 1px solid hsl(var(--danger-border));
  color: hsl(var(--danger));
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: hsl(var(--danger-soft));
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

const ErrorBox = styled.div`
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

/** 새로 발급된 토큰. 눈에 띄어야 하므로 목록과 다른 색으로 크게 잡는다. */
const SecretBox = styled.div`
  background: hsl(var(--warn-soft));
  border: 1px solid hsl(var(--warn-border));
  border-radius: var(--radius);
  padding: 16px 18px;
  margin-bottom: 20px;
`

const SecretTitle = styled.div`
  font-size: 0.9rem;
  font-weight: 700;
  color: hsl(var(--warn));
  margin-bottom: 8px;
`

const SecretValue = styled.code`
  display: block;
  background: hsl(var(--surface));
  border: 1px solid hsl(var(--warn-border));
  border-radius: var(--radius-sm);
  padding: 11px 13px;
  font-family: 'Consolas', 'Menlo', monospace;
  font-size: 0.86rem;
  color: hsl(var(--fg));
  word-break: break-all;
  margin-bottom: 10px;
`

const SecretNote = styled.p`
  margin: 0;
  font-size: 0.82rem;
  color: hsl(var(--warn));
  line-height: 1.5;
`

const CopyBtn = styled.button`
  padding: 7px 14px;
  background: hsl(var(--warn));
  color: hsl(var(--solid-fg));
  border: none;
  border-radius: var(--radius-sm);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  margin-right: 8px;
`

/**
 * 그대로 복사해 붙일 명령.
 *
 * **한 줄로 둔다.** 줄바꿈을 넣으면 이어 붙이는 기호가 셸마다 다르다
 * (PowerShell 은 백틱, bash 는 역슬래시). 어느 쪽에 붙일지 모르는 글을
 * 보여 주면, 복사한 사람 절반이 깨진 명령을 실행하게 된다. 길어도 한 줄이
 * 어디서나 돈다.
 */
const Command = styled.code`
  display: block;
  background: hsl(var(--fg));
  color: hsl(var(--header-fg) / 0.9);
  border-radius: var(--radius);
  padding: 12px 14px;
  font-family: 'Consolas', 'Menlo', monospace;
  font-size: 0.8rem;
  line-height: 1.6;
  word-break: break-all;
  margin-bottom: 10px;
`

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
`

const Th = styled.th`
  text-align: left;
  padding: 10px 12px;
  border-bottom: 2px solid hsl(var(--border));
  color: hsl(var(--fg-muted));
  font-weight: 600;
  font-size: 0.82rem;
`

const Td = styled.td`
  padding: 11px 12px;
  border-bottom: 1px solid hsl(var(--surface-2));
  color: hsl(var(--fg));
  vertical-align: middle;
`

const Mono = styled.span`
  font-family: 'Consolas', 'Menlo', monospace;
  color: hsl(var(--fg-muted));
`

const StateTag = styled.span`
  color: ${(p) => STATE_COLOR[p.$state] || 'hsl(var(--fg-muted))'};
  font-weight: 600;
  font-size: 0.82rem;
`

const Empty = styled.p`
  color: hsl(var(--fg-subtle));
  font-size: 0.88rem;
  margin: 6px 0 0 0;
`

const Steps = styled.pre`
  background: hsl(var(--fg));
  color: hsl(var(--header-fg) / 0.9);
  border-radius: var(--radius);
  padding: 14px 16px;
  font-family: 'Consolas', 'Menlo', monospace;
  font-size: 0.82rem;
  line-height: 1.6;
  overflow-x: auto;
  margin: 0;
`

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

export default function TokensPage() {
  const navigate = useNavigate()
  const { confirm } = useDialog()
  const { user } = useAuth()

  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [days, setDays] = useState(90)
  const [creating, setCreating] = useState(false)
  // 방금 발급된 원문. 서버가 저장하지 않으므로 이 화면을 벗어나면 사라진다.
  const [issued, setIssued] = useState(null)
  const [copied, setCopied] = useState(false)
  const [copiedCommand, setCopiedCommand] = useState(false)
  // MCP 주소는 **서버가 알려 준다.** 화면이 3010 을 코드에 박아 두면,
  // 포트를 바꾼 서버에서 화면만 옛 주소를 들고 있게 된다.
  const [mcpUrl, setMcpUrl] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setList(await api.get('/auth/me/tokens'))
      setError('')
    } catch (err) {
      setError(err.message || '토큰 목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    let cancelled = false
    api.get('/config')
      .then((body) => { if (!cancelled) setMcpUrl(body.mcp_url || '') })
      .catch(() => { /* 주소를 못 받아도 토큰 발급은 되어야 한다 */ })
    return () => { cancelled = true }
  }, [])

  const handleCreate = async (event) => {
    event.preventDefault()
    setCreating(true)
    setError('')
    try {
      const body = await api.post('/auth/me/tokens', { name, expires_days: days })
      setIssued(body.token)
      setCopied(false)
      setName('')
      await load()
    } catch (err) {
      setError(err.message || '토큰을 만들지 못했습니다.')
    } finally {
      setCreating(false)
    }
  }

  /** 토큰과 주소가 다 채워진, 그대로 실행할 수 있는 명령. */
  const commandFor = (token) =>
    'claude mcp add --transport http mechanicaldesign '
    + `${mcpUrl || 'http://<서버주소>:3010/mcp'} `
    + `--header "Authorization: Bearer ${token}"`

  const copyText = async (text, mark) => {
    try {
      await navigator.clipboard.writeText(text)
      mark(true)
    } catch {
      // 복사가 막힌 환경(비 https 등)에서도 값은 화면에 있으므로 손으로
      // 긁어 갈 수 있다. 실패를 오류로 키우지 않는다.
      mark(false)
    }
  }

  const handleCopy = () => copyText(issued, setCopied)

  const handleRevoke = async (token) => {
    const ok = await confirm({
      title: `'${token.name}' 토큰을 폐기합니다`,
      body: '이 토큰을 쓰는 MCP·스크립트가 즉시 붙지 못하게 됩니다.'
        + '\n되돌릴 수 없습니다.',
      confirmLabel: '폐기',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await api.del(`/auth/me/tokens/${token.id}`)
      await load()
    } catch (err) {
      setError(err.message || '토큰을 폐기하지 못했습니다.')
    }
  }

  return (
    <Page>
      <AppHeader
        title="내 액세스 토큰"
        subtitle={`${user?.display_name || ''} — MCP·스크립트가 내 권한으로 붙을 때 쓰는 자격 증명`}
        onHome={() => navigate('/')}
      />

      <Body>
        {error && <ErrorBox>{error}</ErrorBox>}

        {issued && (
          <SecretBox>
            <SecretTitle>토큰이 발급되었습니다 — 지금 복사하세요</SecretTitle>
            <SecretValue>{issued}</SecretValue>
            <CopyBtn onClick={handleCopy}>{copied ? '복사됨' : '토큰만 복사'}</CopyBtn>
            <SecretNote>
              서버는 이 값을 저장하지 않습니다. 이 화면을 벗어나면 다시 볼 수 없고,
              잃어버리면 새로 만드는 수밖에 없습니다.
            </SecretNote>

            {/* 토큰만 주면 사람이 명령을 조립하다 틀린다 — 주소를 어디서
                가져올지, 헤더 따옴표를 어떻게 쓸지가 매번 걸린다.
                그냥 실행할 수 있는 형태로 준다. */}
            <SecretTitle style={{ marginTop: 18 }}>
              Claude Code 에 등록하려면 — 이대로 복사해 실행하세요
            </SecretTitle>
            <Command>{commandFor(issued)}</Command>
            <CopyBtn onClick={() => copyText(commandFor(issued), setCopiedCommand)}>
              {copiedCommand ? '복사됨' : '명령 복사'}
            </CopyBtn>
            <SecretNote style={{ marginTop: 10 }}>
              MCP 서버가 떠 있어야 붙습니다. 등록한 뒤 Claude 에게
              &ldquo;계산 카드 목록 보여줘&rdquo; 라고 해 보면 바로 확인됩니다.
            </SecretNote>
          </SecretBox>
        )}

        <Panel>
          <PanelTitle>새 토큰 만들기</PanelTitle>
          <PanelNote>
            토큰은 <b>내 권한</b>으로 동작합니다. 내가 할 수 없는 일은 이 토큰으로도
            할 수 없고, 이 토큰으로 만든 카드는 내가 만든 것으로 남습니다.
            새면 그 토큰만 폐기하면 되며 내 로그인은 그대로입니다.
          </PanelNote>
          <form onSubmit={handleCreate}>
            <Row>
              <Field $grow="1 1 260px">
                <FieldLabel>이름</FieldLabel>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="예: 사내 MCP 서버, 내 노트북 Claude"
                  maxLength={100}
                />
              </Field>
              <Field>
                <FieldLabel>유효 기간</FieldLabel>
                <Select value={days} onChange={(e) => setDays(Number(e.target.value))}>
                  {EXPIRY_CHOICES.map((c) => (
                    <option key={c.days} value={c.days}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <PrimaryBtn type="submit" disabled={creating || !name.trim()}>
                {creating ? '만드는 중…' : '토큰 만들기'}
              </PrimaryBtn>
            </Row>
          </form>
        </Panel>

        <Panel>
          <PanelTitle>발급한 토큰</PanelTitle>
          {loading ? (
            <Empty>불러오는 중…</Empty>
          ) : list.length === 0 ? (
            <Empty>아직 만든 토큰이 없습니다.</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>이름</Th>
                  <Th>앞자리</Th>
                  <Th>상태</Th>
                  <Th>만든 날</Th>
                  <Th>만료</Th>
                  <Th>마지막 사용</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {list.map((token) => (
                  <tr key={token.id}>
                    <Td>{token.name}</Td>
                    <Td>
                      <Mono>{token.token_prefix}…</Mono>
                    </Td>
                    <Td>
                      <StateTag $state={token.state}>
                        {STATE_LABEL[token.state] || token.state}
                      </StateTag>
                    </Td>
                    <Td>{formatDate(token.created_at)}</Td>
                    <Td>{formatDate(token.expires_at)}</Td>
                    <Td>
                      {/* 안 쓰는 토큰을 찾아내는 단서다. 한 번도 안 썼으면 그렇게 적는다. */}
                      {token.last_used_at ? formatDate(token.last_used_at) : '사용 기록 없음'}
                    </Td>
                    <Td>
                      <DangerBtn onClick={() => handleRevoke(token)}>폐기</DangerBtn>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>

        <Panel>
          <PanelTitle>Claude Code 에 등록하는 법</PanelTitle>
          <PanelNote>
            토큰을 만들면 <b>토큰과 주소가 다 채워진 명령</b>이 위에 나옵니다.
            그대로 복사해 실행하세요. 아래는 형태만 보여 주는 것입니다 —
            토큰은 만든 직후 한 번만 볼 수 있어서 여기에는 채워 넣을 수 없습니다.
          </PanelNote>
          <Steps>
{`claude mcp add --transport http mechanicaldesign ${mcpUrl || 'http://<서버주소>:3010/mcp'} --header "Authorization: Bearer <토큰>"`}
          </Steps>
        </Panel>
      </Body>
    </Page>
  )
}
