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
 *
 * ## 카드 한 장과 워크플로
 *
 * 스냅샷의 모양이 다르다. 카드는 변수 배열이고, 워크플로는
 * `{nodes, links, cards}` 다. 그래서 표를 만드는 곳에서 한 번만 갈라 두고,
 * 그 뒤는 **같은 표**를 쓴다 — 워크플로는 노드마다 그 표가 한 벌씩 놓일 뿐이다.
 *
 * 배선도 함께 싣는다. 어느 값이 어느 카드에서 왔는지가 빠지면, 노드별 표가
 * 그냥 따로 계산한 종이 여러 장이 되어 워크플로 계산서인 뜻이 없어진다.
 */

import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import styled from 'styled-components'
import AppHeader, { BarButton } from '../../shared/components/AppHeader'

import { api } from '../../shared/api/client'
import {
  Body, Empty, ErrorBox, Mono, Page, Panel, PanelTitle, Table, Td, Th,
} from './recordStyles'

/** 반복을 판정한 기준. 숫자 옆에 없으면 그 숫자를 읽을 수 없다. */
const Basis = styled.p`
  margin: 8px 0 0;
  font-size: 0.78rem;
  color: hsl(var(--fg-muted));
`

/** 노드 하나의 시작. 표가 여러 벌 이어지므로 경계가 보여야 한다. */
const NodeTitle = styled.h2`
  margin: 26px 0 8px;
  font-size: 1rem;
  color: hsl(var(--fg));
  border-left: 4px solid hsl(var(--accent));
  padding-left: 10px;

  small {
    margin-left: 8px;
    font-size: 0.78rem;
    font-weight: 400;
    color: hsl(var(--fg-subtle));
  }

  @media print {
    break-after: avoid;
  }
`

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
      color: hsl(var(--fg-muted));
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
    color: hsl(var(--fg-subtle));
    font-weight: 600;
  }

  dd {
    margin: 0;
    color: hsl(var(--fg));
  }
`

const Note = styled.p`
  margin: 14px 0 0 0;
  padding-top: 12px;
  border-top: 1px solid hsl(var(--bg));
  font-size: 0.88rem;
  color: hsl(var(--fg-muted));
  line-height: 1.6;
  white-space: pre-line;
`

const Value = styled.span`
  font-weight: 700;
  color: hsl(var(--fg));
`

const Failed = styled.span`
  color: hsl(var(--danger));
  font-size: 0.85rem;
`

const GoneNotice = styled.div`
  background: hsl(var(--warn-soft));
  border: 1px solid hsl(var(--warn-border));
  color: hsl(var(--warn));
  border-radius: var(--radius);
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

/** 잔차처럼 아주 작은 수는 지수로. 0.0000000062 는 자릿수를 세게 만든다. */
function tiny(n) {
  return Number.isFinite(n) ? Number(n).toExponential(1) : '—'
}

/** 워크플로 기록인가. 스냅샷 모양이 갈리는 유일한 자리다. */
function isWorkflow(record) {
  return record?.kind === 'workflow'
}

/**
 * 종류에 상관없이 「표 한 벌」들의 목록으로 바꾼다.
 *
 * 카드는 한 벌, 워크플로는 노드 수만큼. 이 함수 뒤로는 둘을 구분하지 않는다.
 */
function sections(record) {
  const snapshot = record?.definition_snapshot
  if (!isWorkflow(record)) {
    return [{
      key: 'card',
      title: '',
      variables: Array.isArray(snapshot) ? snapshot : [],
      inputs: record?.inputs || {},
      results: record?.results || {},
    }]
  }

  const nodes = snapshot?.nodes || []
  const cards = snapshot?.cards || {}
  return nodes.map(node => ({
    key: `node-${node.id}`,
    title: node.alias || node.card_name,
    subtitle: node.card_name,
    variables: cards[String(node.card_id)] || [],
    // 노드마다 따로 담겨 온다. 워크플로 하나가 카드 여럿을 돌린 것이므로.
    inputs: (record?.inputs || {})[String(node.id)] || {},
    results: (record?.results || {})[String(node.id)] || {},
  }))
}

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

  const rowsFor = (section, category) => (section.variables || [])
    .filter(v => v.category === category)
    .map(v => {
      const key = String(v.id)
      const outcome = section.results[key]
      // 입력값은 results 에 없다 — 계산된 것이 아니라 넣은 것이다.
      const value = category === 'input' ? section.inputs[key] : outcome?.value
      return { v, value, error: outcome?.error }
    })

  // 노드 이름. id 만 있는 표는 못 읽는다.
  const aliases = new Map(
    ((isWorkflow(record) && record.definition_snapshot?.nodes) || [])
      .map(n => [String(n.id), n.alias || n.card_name]))
  const nodeAlias = (id) => aliases.get(String(id)) || `노드 ${id}`

  const wiring = (() => {
    if (!isWorkflow(record)) return []
    const snapshot = record.definition_snapshot || {}
    const alias = aliases
    return (snapshot.links || []).map(l => ({
      id: l.id,
      from: alias.get(String(l.from_node_id)) || '—',
      to: alias.get(String(l.to_node_id)) || '—',
      from_label: l.from_label,
      to_label: l.to_label,
    }))
  })()

  return (
    <Page>
      <AppHeader
        title={record?.title || '계산 기록'}
        subtitle={record?.source_name}
        onHome={() => navigate('/')}
        right={(
          <>
            {/* 이름만 보여 주고 못 가게 두면, 이 기록이 어디서 나온
                것인지 확인하려고 목록을 뒤지게 된다. */}
            {record?.source_route && (
              <BarButton onClick={() => navigate(record.source_route)}>
                {isWorkflow(record) ? '워크플로 열기' : '카드 열기'}
              </BarButton>
            )}
            <BarButton onClick={() => window.print()}>인쇄 · PDF</BarButton>
            <BarButton onClick={() => navigate('/records')}>← 목록</BarButton>
          </>
        )}
      />

      <Body>
        {error && <ErrorBox>{error}</ErrorBox>}
        {loading && <Empty>불러오는 중…</Empty>}

        {record && (
          <>
            <PrintTitle>
              <h1>{record.title}</h1>
              <p>
                {record.source_name} · {record.created_by_name || '—'}
                {' · '}{formatWhen(record.created_at)}
              </p>
            </PrintTitle>

            {!record.source_exists && (
              <GoneNotice>
                이 계산에 쓰인 {isWorkflow(record) ? '워크플로' : '카드'}는
                지워졌습니다. 아래 값과 수식은 계산할 당시의 것을 그대로 남겨 둔
                것이라 그때 무엇을 어떻게 계산했는지는 알 수 있지만, 같은 것으로
                다시 계산할 수는 없습니다.
              </GoneNotice>
            )}

            <Panel>
              <Meta>
                <dt>{isWorkflow(record) ? '워크플로' : '카드'}</dt>
                <dd>{record.source_name}</dd>
                <dt>계산한 사람</dt>
                <dd>{record.created_by_name || '—'}</dd>
                <dt>계산한 때</dt>
                <dd>{formatWhen(record.created_at)}</dd>
              </Meta>
              {record.note && <Note>{record.note}</Note>}
            </Panel>

            {/* **이 숫자들이 어떻게 나왔는지.** 서로 물린 값을 돌려서 얻은
                값이면, 그것을 안 밝힌 계산서는 검토하는 사람을 속이는 셈이다
                — 한 번 계산한 값처럼 읽히기 때문이다. 기준을 함께 싣는 것도
                같은 이유다. 「10회」 는 허용오차를 알아야 뜻이 생긴다. */}
            {record.run_meta?.loops?.length > 0 && (
              <Panel>
                <PanelTitle>반복 계산</PanelTitle>
                <Table>
                  <thead>
                    <tr>
                      <Th>서로 물린 카드</Th>
                      <Th>반복</Th>
                      <Th>최종 잔차</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {record.run_meta.loops.map((loop, i) => (
                      <tr key={i}>
                        <Td>{loop.node_ids.map(nodeAlias).join(' ⇄ ')}</Td>
                        <Td>{loop.iterations}회</Td>
                        <Td><Mono>{tiny(loop.residual)}</Mono></Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                {record.run_meta.iteration && (
                  <Basis>
                    허용오차 {tiny(record.run_meta.iteration.tolerance)}
                    {' · '}최대 {record.run_meta.iteration.max}회
                    {' · '}완화계수 {record.run_meta.iteration.relaxation}
                  </Basis>
                )}
              </Panel>
            )}

            {/* 배선이 없으면 노드별 표가 그냥 따로 계산한 종이 여러 장이 된다.
                어느 값이 어디서 왔는지가 워크플로 계산서의 핵심이다. */}
            {isWorkflow(record) && wiring.length > 0 && (
              <Panel>
                <PanelTitle>배선</PanelTitle>
                <Table>
                  <thead>
                    <tr><Th>보내는 쪽</Th><Th>값</Th><Th>받는 쪽</Th><Th>받는 칸</Th></tr>
                  </thead>
                  <tbody>
                    {wiring.map(w => (
                      <tr key={w.id}>
                        <Td>{w.from}</Td>
                        <Td><Mono>{w.from_label}</Mono></Td>
                        <Td>{w.to}</Td>
                        <Td><Mono>{w.to_label}</Mono></Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Panel>
            )}

            {sections(record).map(section => (
              <React.Fragment key={section.key}>
                {section.title && (
                  <NodeTitle>
                    {section.title}
                    {section.subtitle && section.subtitle !== section.title && (
                      <small>{section.subtitle}</small>
                    )}
                  </NodeTitle>
                )}
                {CATEGORY.map(({ key, label }) => {
              const rows = rowsFor(section, key)
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
              </React.Fragment>
            ))}
          </>
        )}
      </Body>
    </Page>
  )
}
