/**
 * 기록 비교 — 「왜 이번엔 답이 다르지」 에 답하는 화면.
 *
 * **판정을 맨 위에 놓는다.** 표 두 개를 나란히 놓고 사람이 눈으로 찾게 두면,
 * 값이 스무 개일 때 그 일은 하지 않게 된다. 서버가 이미 「입력이 같은데 답이
 * 다르다」 까지 판단해서 보내 주므로, 화면은 그것을 먼저 말하면 된다.
 *
 * **안 바뀐 줄도 지우지 않는다.** 달라진 것만 보여 주면 「나머지는 정말 같았나」
 * 를 확인할 방법이 없다. 대신 흐리게 두어 눈이 바뀐 줄로 먼저 가게 한다.
 *
 * 견주는 규칙은 전부 서버에 있다. 화면이 다시 판단하면 두 벌이 되고, 그때
 * 이력 화면과 이 화면이 같은 변경을 다르게 말하게 된다.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import styled from 'styled-components'

import { apiFetch } from '../../shared/api/client'
import AppHeader, { BarButton } from '../../shared/components/AppHeader'
import { fmt } from '../../shared/utils/goalSeek'
import {
  Body, Empty, ErrorBox, Page, Panel, PanelTitle, Table, Td, Th,
} from './recordStyles'

/**
 * 맨 위의 판정.
 *
 * 색이 뜻을 갖는다 — 노랑은 「설명되지 않았다」, 회색은 「설명된다」. 셋 다
 * 같은 색으로 두면 훑을 때 구분이 안 되고, 그러면 맨 위에 둔 값이 없다.
 */
const Verdict = styled.div`
  border-radius: var(--radius);
  border: 1px solid ${p => (p.$warn ? 'hsl(var(--warn-border))' : 'hsl(var(--border))')};
  background: ${p => (p.$warn ? 'hsl(var(--warn-soft))' : 'hsl(var(--surface))')};
  color: ${p => (p.$warn ? 'hsl(var(--warn))' : 'hsl(var(--fg-muted))')};
  padding: 14px 16px;
  margin-bottom: 16px;
  font-size: 0.9rem;
  line-height: 1.65;
`

const VerdictHead = styled.b`
  display: block;
  font-size: 1rem;
  margin-bottom: 4px;
  color: ${p => (p.$warn ? 'hsl(var(--warn))' : 'hsl(var(--fg))')};
`

const Pair = styled.div`
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
`

const Side = styled.div`
  background: hsl(var(--surface));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  padding: 12px 14px;
  min-width: 0;
`

const SideTag = styled.div`
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: hsl(var(--fg-subtle));
  margin-bottom: 3px;
`

const SideTitle = styled.div`
  font-weight: 700;
  color: hsl(var(--fg));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const SideSub = styled.div`
  font-size: 0.78rem;
  color: hsl(var(--fg-subtle));
  margin-top: 2px;
`

const Arrow = styled.div`
  color: hsl(var(--fg-subtle));
  font-size: 1.2rem;
`

/** 안 바뀐 줄. 지우지 않고 흐리게 둔다. */
const Quiet = styled.tr`
  opacity: 0.45;
`

const Moved = styled.tr`
  background: hsl(var(--accent-soft) / 0.4);
`

const Num = styled.span`
  font-variant-numeric: tabular-nums;
`

const Delta = styled.span`
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: ${p => (p.$up ? 'hsl(var(--danger))' : 'hsl(var(--info))')};
`

const Gone = styled.span`
  color: hsl(var(--fg-subtle));
`

const Bad = styled.span`
  color: hsl(var(--danger));
  font-size: 0.82rem;
`

const Change = styled.div`
  font-size: 0.86rem;
  line-height: 1.6;
  color: hsl(var(--fg-muted));
  padding: 3px 0 3px 12px;
  border-left: 3px solid hsl(var(--warn));
  margin-bottom: 4px;
  word-break: break-word;
`

const NodeCell = styled.span`
  color: hsl(var(--fg-subtle));
  margin-right: 6px;
`

function show(value, error) {
  if (error) return <Bad>계산 실패</Bad>
  if (value === null || value === undefined || value === '') return <Gone>—</Gone>
  if (typeof value === 'number') return <Num>{fmt(value)}</Num>
  return <Num>{String(value)}</Num>
}

/** 얼마나 움직였나. 비율은 서버가 줄 때만 — 0 에서 출발하면 안 준다. */
function movement(row) {
  if (row.delta === undefined || row.delta === null) return null
  const sign = row.delta > 0 ? '+' : ''
  const percent = row.ratio === undefined || row.ratio === null
    ? '' : ` (${sign}${(row.ratio * 100).toFixed(1)}%)`
  return (
    <Delta $up={row.delta > 0}>{sign}{fmt(row.delta)}{percent}</Delta>
  )
}

function Rows({ rows, withNode }) {
  return rows.map((row, i) => {
    const Line = row.changed ? Moved : Quiet
    return (
      <Line key={`${row.node_id || ''}:${row.key}:${i}`}>
        <Td>
          {withNode && <NodeCell>{row.node}</NodeCell>}
          {row.label}
        </Td>
        <Td>{show(row.a, row.a_error)}</Td>
        <Td>{show(row.b, row.b_error)}</Td>
        <Td>{row.changed ? movement(row) : null}</Td>
      </Line>
    )
  })
}

export default function RecordComparePage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const a = params.get('a')
  const b = params.get('b')

  const [body, setBody] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await apiFetch(`/records/compare?a=${a}&b=${b}`)
    if (!res.ok) {
      const failed = await res.json().catch(() => ({}))
      setError(failed.error || '견주지 못했습니다.')
      setBody(null)
    } else {
      setBody(await res.json())
      setError('')
    }
    setLoading(false)
  }, [a, b])

  useEffect(() => { load() }, [load])

  const shell = (inner) => (
    <Page>
      <AppHeader
        title="기록 비교"
        onHome={() => navigate('/')}
        right={<BarButton onClick={() => navigate('/records')}>기록 목록</BarButton>}
      />
      <Body>{inner}</Body>
    </Page>
  )

  if (loading) return shell(<Empty>불러오는 중…</Empty>)
  if (error) return shell(<ErrorBox>{error}</ErrorBox>)
  if (!body) return shell(<Empty>견줄 것이 없습니다.</Empty>)

  const { summary } = body
  const withNode = body.a.kind === 'workflow'

  return shell(
    <>
      <Pair>
        <Side>
          <SideTag>이전</SideTag>
          <SideTitle>{body.a.title}</SideTitle>
          <SideSub>{body.a.source_name} · {body.a.created_by_name || '—'}</SideSub>
        </Side>
        <Arrow>→</Arrow>
        <Side>
          <SideTag>이후</SideTag>
          <SideTitle>{body.b.title}</SideTitle>
          <SideSub>{body.b.source_name} · {body.b.created_by_name || '—'}</SideSub>
        </Side>
      </Pair>

      {!body.comparable ? (
        <Verdict $warn>
          <VerdictHead $warn>이 둘은 나란히 세울 수 없습니다</VerdictHead>
          카드 하나의 계산과 워크플로 전체의 계산은 값이 놓인 모양부터 다릅니다.
          억지로 견주면 전부 「달라짐」 으로 나와 아무것도 말해 주지 못합니다.
        </Verdict>
      ) : summary.unexplained ? (
        // **이 화면이 존재하는 이유.** 입력을 아무리 다시 봐도 답이 안 나오는
        // 경우라, 그 헛수고를 여기서 끊어 준다.
        <Verdict $warn>
          <VerdictHead $warn>입력은 같은데 결과가 다릅니다</VerdictHead>
          두 계산 사이에 <b>계산 자체가 바뀌었습니다</b>. 카드는 살아 있는
          참조라, 누군가 수식이나 변수를 고치면 같은 입력에서도 다른 답이
          나옵니다. 아래 <b>정의 차이</b>를 보세요.
        </Verdict>
      ) : summary.results_changed === 0 && summary.inputs_changed === 0 ? (
        <Verdict>
          <VerdictHead>다른 점이 없습니다</VerdictHead>
          입력도 결과도 정의도 같습니다.
        </Verdict>
      ) : (
        <Verdict>
          <VerdictHead>
            입력 {summary.inputs_changed}개가 달라져 결과 {summary.results_changed}개가
            움직였습니다
          </VerdictHead>
          {summary.definition_changed > 0 && (
            <>계산 정의도 {summary.definition_changed}군데 바뀌었습니다 — 결과 차이가
            입력 때문만은 아닐 수 있습니다.</>
          )}
        </Verdict>
      )}

      {!body.same_source && body.comparable && (
        <Verdict>
          <VerdictHead>서로 다른 것을 잰 기록입니다</VerdictHead>
          「{body.a.source_name}」 과 「{body.b.source_name}」 의 계산입니다.
          견줄 수는 있지만, 같은 이름의 칸이라도 같은 뜻이 아닐 수 있습니다.
        </Verdict>
      )}

      {/* 정의 차이를 **먼저** 놓는다 — 설명되지 않은 차이의 답이 여기 있다. */}
      {body.definition.length > 0 && (
        <Panel>
          <PanelTitle>정의 차이 · 계산이 그새 바뀐 곳</PanelTitle>
          {body.definition.map((change, i) => (
            <Change key={i}>{change.text}</Change>
          ))}
        </Panel>
      )}

      {body.comparable && (
        <>
          <Panel>
            <PanelTitle>입력</PanelTitle>
            {body.inputs.length === 0 ? (
              <Empty>견줄 입력이 없습니다.</Empty>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>값</Th>
                    <Th>{body.a.title}</Th>
                    <Th>{body.b.title}</Th>
                    <Th>차이</Th>
                  </tr>
                </thead>
                <tbody><Rows rows={body.inputs} withNode={withNode} /></tbody>
              </Table>
            )}
          </Panel>

          <Panel>
            <PanelTitle>결과</PanelTitle>
            {body.results.length === 0 ? (
              <Empty>견줄 결과가 없습니다.</Empty>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>값</Th>
                    <Th>{body.a.title}</Th>
                    <Th>{body.b.title}</Th>
                    <Th>차이</Th>
                  </tr>
                </thead>
                <tbody><Rows rows={body.results} withNode={withNode} /></tbody>
              </Table>
            )}
          </Panel>
        </>
      )}
    </>,
  )
}
