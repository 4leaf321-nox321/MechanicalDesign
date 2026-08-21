/**
 * 계산서 한 장.
 *
 * **설계 문서에 첨부할 수 있어야 한다.** 그래서 화면이 아니라 종이를 기준으로
 * 짰다 — 인쇄하면 머리띠와 버튼이 사라지고 표만 남는다(recordStyles 의 @media
 * print). 브라우저의 "PDF 로 저장" 이 곧 계산서 파일이 된다.
 *
 * 수식까지 함께 싣는 것이 중요하다. 숫자만 있는 종이는 검토하는 사람이 검증할
 * 수 없고, 검증할 수 없는 계산서는 첨부해 봐야 소용이 없다. 여기 실리는 수식은
 * 카드의 **지금** 수식이 아니라 계산 당시의 스냅샷이다 — 카드가 그 뒤에
 * 바뀌었어도 이 종이는 그때를 말한다.
 */

import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import styled from 'styled-components'

import { api } from '../../shared/api/client'
import {
  Body, Empty, ErrorBox, GhostBtn, Header, HeaderSub, HeaderTitle,
  Mono, Page, Panel, PanelTitle, Table, Td, Th,
} from './recordStyles'

/** 인쇄에서만 보이는 제목. 화면에서는 남색 머리띠가 그 일을 한다. */
const PrintTitle = styled.div`
  display: none;

  @media print {
    display: block;
    margin-bottom: 14px;

    h1 {
      font-size: 1.3rem;
      margin: 0 0 4px 0;
    }

    p {
      margin: 0;
      font-size: 0.82rem;
      color: #555;
    }
  }
`

const Meta = styled.dl`
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 6px 18px;
  margin: 0;
  font-size: 0.88rem;

  dt {
    color: #888;
    font-weight: 600;
  }

  dd {
    margin: 0;
    color: #333;
  }
`

const Note = styled.p`
  margin: 14px 0 0 0;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
  font-size: 0.88rem;
  color: #555;
  line-height: 1.6;
  white-space: pre-line;
`

const Value = styled.span`
  font-weight: 700;
  color: #1a1a2e;
`

const Failed = styled.span`
  color: #a4343a;
  font-size: 0.85rem;
`

const GoneNotice = styled.div`
  background: #fff8e1;
  border: 1px solid #f0d98c;
  color: #8a6d1a;
  border-radius: 6px;
  padding: 11px 13px;
  font-size: 0.85rem;
  line-height: 1.55;
  margin-bottom: 18px;
`

const CATEGORY = [
  { key: 'input', label: '입력값' },
  { key: 'intermediate', label: '중간값' },
  { key: 'output', label: '결과' },
]

/** 정의를 사람이 읽을 한 줄로. 수식이 아닌 타입은 무엇으로 계산했는지만 밝힌다. */
function describeDefinition(v) {
  if (v.var_type === 'formula') return v.formula || ''
  if (v.var_type === 'table') return '표 조회'
  if (v.var_type === 'conditional') return '조건부'
  if (v.var_type === 'interp_table') return '보간 표'
  return ''
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) {
    return value.length === 0 ? '(빈 배열)' : value.join(', ')
  }
  return String(value)
}

function formatWhen(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} `
    + `${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function RecordDetailPage() {
  const { recordId } = useParams()
  const navigate = useNavigate()

  const [record, setRecord] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    api.get(`/records/${recordId}`)
      .then((body) => { if (!cancelled) setRecord(body) })
      .catch((err) => {
        if (!cancelled) setError(err.message || '기록을 불러오지 못했습니다.')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [recordId])

  const rowsFor = (category) => {
    if (!record) return []
    return record.definition_snapshot
      .filter(v => v.category === category)
      .map(v => {
        const key = String(v.id)
        const outcome = record.results[key]
        // 입력값은 results 에 없다 — 계산된 것이 아니라 넣은 것이다.
        const value = category === 'input' ? record.inputs[key] : outcome?.value
        return { v, value, error: outcome?.error }
      })
  }

  return (
    <Page>
      <Header>
        <div>
          <HeaderTitle>{record?.title || '계산 기록'}</HeaderTitle>
          <HeaderSub>{record?.card_name}</HeaderSub>
        </div>
        <div>
          <GhostBtn onClick={() => window.print()}>인쇄 · PDF</GhostBtn>
          <GhostBtn onClick={() => navigate('/records')}>← 목록</GhostBtn>
        </div>
      </Header>

      <Body>
        {error && <ErrorBox>{error}</ErrorBox>}
        {loading && <Empty>불러오는 중…</Empty>}

        {record && (
          <>
            <PrintTitle>
              <h1>{record.title}</h1>
              <p>{record.card_name} · {record.created_by_name || '—'} · {formatWhen(record.created_at)}</p>
            </PrintTitle>

            {!record.card_exists && (
              <GoneNotice>
                이 계산에 쓰인 카드는 지워졌습니다. 아래 값과 수식은 계산할 당시의
                것을 그대로 남겨 둔 것이라 그때 무엇을 어떻게 계산했는지는 알 수
                있지만, 같은 카드로 다시 계산할 수는 없습니다.
              </GoneNotice>
            )}

            <Panel>
              <Meta>
                <dt>카드</dt>
                <dd>{record.card_name}</dd>
                <dt>계산한 사람</dt>
                <dd>{record.created_by_name || '—'}</dd>
                <dt>계산한 때</dt>
                <dd>{formatWhen(record.created_at)}</dd>
              </Meta>
              {record.note && <Note>{record.note}</Note>}
            </Panel>

            {CATEGORY.map(({ key, label }) => {
              const rows = rowsFor(key)
              if (rows.length === 0) return null
              return (
                <Panel key={key}>
                  <PanelTitle>{label}</PanelTitle>
                  <Table>
                    <thead>
                      <tr>
                        <Th>이름</Th>
                        <Th>기호</Th>
                        <Th>값</Th>
                        <Th>단위</Th>
                        {/* 수식이 없으면 검토하는 사람이 이 종이를 검증할 수 없다. */}
                        {key !== 'input' && <Th>계산식</Th>}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ v, value, error: rowError }) => (
                        <tr key={v.id}>
                          <Td>{v.name}</Td>
                          <Td><Mono>{v.symbol || '—'}</Mono></Td>
                          <Td>
                            {rowError
                              ? <Failed>계산 실패: {rowError}</Failed>
                              : <Value>{formatValue(value)}</Value>}
                          </Td>
                          <Td>{v.unit || ''}</Td>
                          {key !== 'input' && (
                            <Td><Mono>{describeDefinition(v)}</Mono></Td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Panel>
              )
            })}
          </>
        )}
      </Body>
    </Page>
  )
}
