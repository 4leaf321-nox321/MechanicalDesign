/**
 * 검증 — 이 카드가 실제로 계산되는가, 단위는 서로 맞는가.
 *
 * **지금까지 이 검사는 사람이 볼 수 없었다.** 서버에는 있었지만 AI(MCP)와
 * 게시 절차만 불렀다. 그래서 단위가 1000배 어긋난 카드를 만든 사람은 그 사실을
 * 알 방법이 없었다 — 게시할 때가 되어서야, 그것도 오류가 아니라 경고라서
 * 지나쳤을 수도 있다.
 *
 * 오류와 경고를 갈라 놓는다.
 *
 *   오류   계산이 안 된다. 게시도 막힌다
 *   경고   계산은 되는데 단위가 안 맞는다. **막지 않는다** — 하지만 이쪽이
 *          더 위험하다. 오류는 화면이 비어서 금방 알지만, 단위가 틀린 값은
 *          그럴듯한 숫자로 나와 그대로 설계에 들어간다
 */

import React, { useCallback, useEffect, useState } from 'react'
import styled from 'styled-components'

import { api } from '../api/client'

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  justify-content: flex-end;
  z-index: 1000;
`

const Panel = styled.div`
  width: min(560px, 100%);
  height: 100%;
  background: #f7f8fa;
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.18);
`

const Head = styled.div`
  background: #1a1a2e;
  color: white;
  padding: 20px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const HeadTitle = styled.h2`
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
`

const HeadSub = styled.p`
  margin: 4px 0 0 0;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.6);
`

const CloseBtn = styled.button`
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.35);
  color: white;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 0.85rem;
  cursor: pointer;

  &:hover { background: rgba(255, 255, 255, 0.12); }
`

const Body = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 18px 20px;
`

const Verdict = styled.div`
  border-radius: 8px;
  padding: 14px 16px;
  margin-bottom: 16px;
  font-size: 0.92rem;
  font-weight: 700;
  line-height: 1.5;
  background: ${p => (p.$ok ? '#eef7ee' : '#fdecea')};
  border: 1px solid ${p => (p.$ok ? '#cbe5cb' : '#f5c6cb')};
  color: ${p => (p.$ok ? '#2f6b34' : '#a4343a')};
`

const Section = styled.div`
  margin-bottom: 18px;
`

const SectionTitle = styled.h3`
  font-size: 0.85rem;
  font-weight: 700;
  color: #666;
  margin: 0 0 8px 0;
`

const Item = styled.div`
  background: white;
  border: 1px solid #e8e8ee;
  border-left: 4px solid ${p => p.$color};
  border-radius: 6px;
  padding: 11px 13px;
  margin-bottom: 8px;
  font-size: 0.86rem;
  line-height: 1.6;
  color: #333;
  word-break: break-word;
`

const Where = styled.span`
  display: block;
  font-weight: 700;
  color: #1a1a2e;
  margin-bottom: 2px;
`

const Skipped = styled.div`
  background: #fff8e1;
  border: 1px solid #f0d98c;
  color: #8a6d1a;
  border-radius: 6px;
  padding: 11px 13px;
  font-size: 0.85rem;
  line-height: 1.55;
  margin-bottom: 16px;
`

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  background: white;
  border: 1px solid #e8e8ee;
  border-radius: 6px;
  overflow: hidden;
`

const Th = styled.th`
  text-align: left;
  padding: 8px 11px;
  background: #f4f5f8;
  color: #666;
  font-size: 0.78rem;
  font-weight: 600;
`

const Td = styled.td`
  padding: 9px 11px;
  border-top: 1px solid #f2f2f2;
  color: #333;
`

const Failed = styled.span`
  color: #a4343a;
`

const Empty = styled.p`
  color: #999;
  font-size: 0.88rem;
  text-align: center;
  margin-top: 40px;
`

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.length ? value.join(', ') : '(빈 배열)'
  return String(value)
}

export default function ValidationPanel({ cardId, cardName, values, onClose }) {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const run = useCallback(async () => {
    setLoading(true)
    try {
      // 지금 화면에 넣어 둔 입력값으로 돌린다. 값이 없으면 서버가 기본값을
      // 쓰는데, 그러면 "값 없음" 이 잔뜩 나오지만 그건 정의의 결함이 아니다.
      setReport(await api.post(`/cards/${cardId}/validate`, { values: values || {} }))
      setError('')
    } catch (err) {
      setError(err.message || '검증하지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [cardId, values])

  useEffect(() => { run() }, [run])

  const errors = (report?.issues || []).filter(i => i.level === 'error')
  const warnings = (report?.issues || []).filter(i => i.level !== 'error')

  return (
    <Overlay onClick={onClose}>
      <Panel onClick={(e) => e.stopPropagation()}>
        <Head>
          <div>
            <HeadTitle>검증</HeadTitle>
            <HeadSub>{cardName}</HeadSub>
          </div>
          <CloseBtn onClick={onClose}>닫기</CloseBtn>
        </Head>

        <Body>
          {loading && <Empty>검증하는 중…</Empty>}
          {error && <Verdict $ok={false}>{error}</Verdict>}

          {report && !loading && (
            <>
              <Verdict $ok={errors.length === 0}>
                {errors.length === 0
                  ? '계산에 문제가 없습니다.'
                  : `계산을 막는 문제가 ${errors.length} 건 있습니다.`}
                {warnings.length > 0 && ` 확인할 것이 ${warnings.length} 건 더 있습니다.`}
              </Verdict>

              {report.trial_skipped && (
                <Skipped>
                  실제로 계산해 보지는 못했습니다 — {report.trial_skipped}
                  {' '}지금 통과는 정의를 훑어본 결과일 뿐입니다.
                </Skipped>
              )}

              {errors.length > 0 && (
                <Section>
                  <SectionTitle>계산을 막는 문제</SectionTitle>
                  {errors.map((issue, i) => (
                    <Item key={i} $color="#a4343a">
                      {issue.variable_name && (
                        <Where>{issue.variable_name}{issue.symbol ? ` (${issue.symbol})` : ''}</Where>
                      )}
                      {issue.message}
                    </Item>
                  ))}
                </Section>
              )}

              {warnings.length > 0 && (
                <Section>
                  {/* 단위 경고는 막지 않는다. 그래서 오히려 눈에 띄어야 한다 —
                      계산이 도는 채로 값만 틀리는 것이 가장 위험하다. */}
                  <SectionTitle>확인할 것 (계산은 됩니다)</SectionTitle>
                  {warnings.map((issue, i) => (
                    <Item key={i} $color="#b8860b">
                      {issue.variable_name && (
                        <Where>{issue.variable_name}{issue.symbol ? ` (${issue.symbol})` : ''}</Where>
                      )}
                      {issue.message}
                    </Item>
                  ))}
                </Section>
              )}

              {report.results?.length > 0 && (
                <Section>
                  <SectionTitle>지금 입력값으로 계산한 결과</SectionTitle>
                  <Table>
                    <thead>
                      <tr>
                        <Th>변수</Th>
                        <Th>기호</Th>
                        <Th>값</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.results.map((row) => (
                        <tr key={row.variable_id}>
                          <Td>{row.variable_name}</Td>
                          <Td>{row.symbol || '—'}</Td>
                          <Td>
                            {row.error
                              ? <Failed>{row.error}</Failed>
                              : formatValue(row.value)}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Section>
              )}
            </>
          )}
        </Body>
      </Panel>
    </Overlay>
  )
}
