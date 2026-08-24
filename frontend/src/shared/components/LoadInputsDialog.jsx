/**
 * 이전 계산의 입력값을 다시 불러온다.
 *
 * 카드를 열면 늘 빈칸에서 시작한다. 그런데 같은 카드로 하는 계산은 대개 **비슷한
 * 조건의 반복**이다 — 재질과 안전율은 그대로 두고 치수 하나만 바꿔 보는 식이다.
 * 그때마다 열 개 남짓한 입력을 처음부터 다시 치는 것이 이 도구를 안 쓰게 되는
 * 가장 흔한 이유다.
 *
 * 기록(`records`)에는 **그때의 입력값이 이미 통째로 저장돼 있다.** 새 표를 만들
 * 필요 없이 그것을 되불러오면 된다.
 *
 * **id 로 맞추고, 없으면 기호로 맞춘다.**
 *
 * 기록의 입력값은 변수 id 로 키잉돼 있다. 그런데 카드는 그 뒤로 바뀐다 — 변수를
 * 지웠다 다시 만들면 기호는 같아도 id 가 달라진다. id 만 보면 그런 변수가 조용히
 * 빠진 채 "불러왔습니다" 가 뜨고, 사람은 빈칸을 못 보고 계산한다.
 *
 * 그래서 못 맞춘 것이 있으면 **몇 개가 빠졌는지 말해 준다.** 조용한 실패보다
 * 시끄러운 성공이 낫다.
 */

import React, { useEffect, useState } from 'react'
import styled from 'styled-components'
import { apiFetch } from '../api/client'

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`

const Box = styled.div`
  background: white;
  border-radius: 10px;
  width: min(520px, 92vw);
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
`

const Head = styled.div`
  padding: 20px 24px 12px;
  border-bottom: 1px solid #eef0f4;
`

const Title = styled.h3`
  margin: 0 0 4px;
  font-size: 1.05rem;
  color: #1a1a2e;
`

const Sub = styled.p`
  margin: 0;
  font-size: 0.82rem;
  color: #6b7280;
  line-height: 1.5;
`

const List = styled.div`
  padding: 6px 0;
  overflow-y: auto;
  flex: 1;
`

const Item = styled.button`
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: none;
  padding: 11px 24px;
  cursor: pointer;
  border-bottom: 1px solid #f4f5f7;

  &:hover {
    background: #f6f9fd;
  }
`

const ItemTitle = styled.div`
  font-size: 0.9rem;
  color: #1a1a2e;
  font-weight: 600;
  margin-bottom: 3px;
`

const ItemMeta = styled.div`
  font-size: 0.75rem;
  color: #98a2b3;
`

const Empty = styled.div`
  padding: 28px 24px;
  text-align: center;
  color: #98a2b3;
  font-size: 0.85rem;
  line-height: 1.7;
`

const Foot = styled.div`
  padding: 12px 24px 18px;
  border-top: 1px solid #eef0f4;
  display: flex;
  justify-content: flex-end;
`

const CloseBtn = styled.button`
  padding: 8px 18px;
  border: none;
  border-radius: 6px;
  background: #1a1a2e;
  color: white;
  cursor: pointer;
  font-size: 0.85rem;
`

/**
 * 기록의 입력값을 지금 카드의 변수에 맞춘다.
 *
 * `{ values, matched, missing }` 를 돌려준다. `missing` 은 기록에는 있었지만
 * 지금 카드에서 자리를 못 찾은 입력의 이름들이다.
 */
export function mapRecordInputs(record, variables) {
  const inputs = record.inputs || {}
  const snapshot = record.definition_snapshot || []

  const byId = new Map(variables.map((v) => [String(v.id), v]))
  // 기호는 카드 안에서 유일하다. 겹친 기호가 있으면 먼저 만든 쪽을 쓴다 —
  // 어느 쪽이든 틀릴 수 있지만, 그건 카드가 이미 경고를 받고 있는 상태다.
  const bySymbol = new Map()
  for (const v of variables) {
    if (v.symbol && !bySymbol.has(v.symbol)) bySymbol.set(v.symbol, v)
  }
  const snapById = new Map(snapshot.map((v) => [String(v.id), v]))

  const values = {}
  const missing = []
  let matched = 0

  for (const [recVarId, value] of Object.entries(inputs)) {
    let target = byId.get(recVarId)
    if (!target) {
      // id 가 안 맞으면 그때의 기호로 다시 찾는다. 변수를 지웠다 다시 만들면
      // 기호는 같고 id 만 달라진다.
      const snap = snapById.get(recVarId)
      if (snap?.symbol) target = bySymbol.get(snap.symbol)
      if (!target && snap?.name) {
        target = variables.find((v) => v.name === snap.name)
      }
      if (!target) {
        missing.push(snap?.name || snap?.symbol || `변수 ${recVarId}`)
        continue
      }
    }
    values[target.id] = value
    matched += 1
  }

  return { values, matched, missing }
}

function LoadInputsDialog({ card, variables, onLoad, onClose }) {
  const [records, setRecords] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    apiFetch(`/records?card_id=${card.id}`)
      .then((r) => r.json())
      .then((rows) => setRecords(Array.isArray(rows) ? rows : []))
      .catch(() => setError('기록을 불러오지 못했습니다.'))
  }, [card.id])

  const pick = async (row) => {
    setError('')
    try {
      // 목록에는 입력값이 실려 오지 않는다(스냅샷이 커서 상세에만 있다).
      const res = await apiFetch(`/records/${row.id}`)
      const full = await res.json()
      if (!res.ok) {
        setError(full.error || '기록을 불러오지 못했습니다.')
        return
      }
      onLoad(mapRecordInputs(full, variables), full)
    } catch {
      setError('서버에 연결하지 못했습니다.')
    }
  }

  return (
    <Backdrop onClick={onClose}>
      <Box onClick={(e) => e.stopPropagation()}>
        <Head>
          <Title>이전 입력 불러오기</Title>
          <Sub>
            고른 기록의 <b>입력값만</b> 지금 화면에 채웁니다. 결과는 다시 계산해야
            나오고, 기록 자체는 바뀌지 않습니다.
          </Sub>
        </Head>

        <List>
          {error && <Empty>{error}</Empty>}
          {!error && records === null && <Empty>불러오는 중…</Empty>}
          {!error && records?.length === 0 && (
            <Empty>
              이 카드로 저장한 기록이 없습니다.
              <br />
              계산한 뒤 아래 저장 바에서 이름을 붙여 남기면 여기에 쌓입니다.
            </Empty>
          )}
          {records?.map((row) => (
            <Item key={row.id} onClick={() => pick(row)}>
              <ItemTitle>{row.title}</ItemTitle>
              <ItemMeta>
                {new Date(row.created_at).toLocaleString('ko-KR')}
                {row.created_by_name ? ` · ${row.created_by_name}` : ''}
              </ItemMeta>
            </Item>
          ))}
        </List>

        <Foot>
          <CloseBtn onClick={onClose}>닫기</CloseBtn>
        </Foot>
      </Box>
    </Backdrop>
  )
}

export default LoadInputsDialog
