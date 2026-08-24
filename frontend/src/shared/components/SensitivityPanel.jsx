/**
 * 민감도 — 지금 설계에서 무엇을 건드리면 결과가 가장 빨리 움직이는가.
 *
 * 막대는 **가로로 눕히고 큰 것부터 위에 쌓는다**(토네이도). 위가 넓고 아래가
 * 좁은 모양 자체가 "위쪽 셋만 신경 쓰면 된다" 를 말해 준다.
 *
 * 가운데 세로선이 지금 값이고, 막대가 그 좌우로 뻗는다. **어느 쪽으로 뻗는지가
 * 방향**이다 — 오른쪽으로 가면 그 입력을 키웠을 때 결과가 커진다는 뜻이다.
 * 길이만 보여 주면 "무엇을 키워야 하는지" 를 답하지 못한다.
 */

import React, { useMemo, useState } from 'react'
import styled from 'styled-components'
import { DEFAULT_PERCENT, sensitivity } from '../utils/sensitivity'
import { fmt } from '../utils/goalSeek'

const Wrap = styled.div`
  background: white;
  border-radius: 10px;
  padding: 22px 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
`

const Intro = styled.p`
  margin: 0 0 18px;
  font-size: 0.87rem;
  color: #6b7280;
  line-height: 1.6;
`

const Form = styled.div`
  display: flex;
  gap: 14px;
  align-items: end;
  flex-wrap: wrap;
`

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 0.78rem;
  color: #4b5563;
  font-weight: 600;
`

const Select = styled.select`
  padding: 9px 10px;
  border: 1px solid #d5dae2;
  border-radius: 6px;
  font-size: 0.88rem;
  font-weight: 400;
  background: white;
  min-width: 200px;
`

const Num = styled.input`
  width: 90px;
  padding: 9px 10px;
  border: 1px solid #d5dae2;
  border-radius: 6px;
  font-size: 0.88rem;
  font-weight: 400;
`

const Msg = styled.div`
  margin-top: 18px;
  padding: 12px 14px;
  border-radius: 8px;
  font-size: 0.86rem;
  line-height: 1.6;
  background: ${p => (p.$bad ? '#fdf3f2' : '#f1f7fd')};
  border: 1px solid ${p => (p.$bad ? '#f5d9d6' : '#cfe3f7')};
  color: ${p => (p.$bad ? '#a33a2c' : '#34618c')};
`

const Chart = styled.div`
  margin-top: 20px;
`

const RowLine = styled.div`
  display: grid;
  grid-template-columns: minmax(110px, 180px) 1fr minmax(150px, auto);
  gap: 12px;
  align-items: center;
  padding: 7px 0;
`

const Name = styled.div`
  font-size: 0.84rem;
  color: #1a1a2e;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

/** 가운데(=지금 값)를 기준으로 좌우로 뻗는 막대. */
const Track = styled.div`
  position: relative;
  height: 20px;
  background: #f6f7f9;
  border-radius: 4px;

  /* 지금 값 자리. 막대가 어느 쪽으로 갔는지 이 선이 없으면 알 수 없다. */
  &::after {
    content: '';
    position: absolute;
    left: 50%;
    top: -3px;
    bottom: -3px;
    width: 1px;
    background: #cbd2dc;
  }
`

const Bar = styled.div`
  position: absolute;
  top: 3px;
  bottom: 3px;
  background: ${p => (p.$down ? '#e08b6a' : '#5b9bd5')};
  border-radius: 2px;
`

const Delta = styled.div`
  font-size: 0.76rem;
  color: #6b7280;
  font-variant-numeric: tabular-nums;
`

const Skipped = styled.div`
  margin-top: 16px;
  font-size: 0.78rem;
  color: #98a2b3;
  line-height: 1.6;
`

const Note = styled.div`
  margin-top: 14px;
  font-size: 0.78rem;
  color: #98a2b3;
  line-height: 1.6;
`

function SensitivityPanel({ variables, values }) {
  const targets = useMemo(
    () => variables.filter(v => v.category === 'output' || v.category === 'intermediate'),
    [variables],
  )
  const [outputId, setOutputId] = useState(() => targets[0]?.id ?? '')
  const [percent, setPercent] = useState(DEFAULT_PERCENT)

  const chosen = targets.find(v => String(v.id) === String(outputId))
  const result = useMemo(
    () => (chosen ? sensitivity(variables, values, chosen.id, percent) : null),
    [variables, values, chosen, percent],
  )

  if (targets.length === 0) {
    return (
      <Wrap>
        <Intro>계산 결과 변수가 있어야 민감도를 볼 수 있습니다.</Intro>
      </Wrap>
    )
  }

  // 막대 길이를 재는 기준. 가장 크게 움직인 쪽에 맞춘다.
  const widest = result?.ok
    ? Math.max(...result.rows.map(r => Math.max(Math.abs(r.lowDelta), Math.abs(r.highDelta))), 0)
    : 0

  return (
    <Wrap>
      <Intro>
        입력을 하나씩 흔들어 <b>지금 설계에서</b> 무엇이 결과를 가장 크게 움직이는지
        봅니다. 안전율이 왜 낮은지, 어느 치수를 손봐야 하는지에 답하는 자리입니다.
      </Intro>

      <Form>
        <Field>
          어느 결과를
          <Select value={outputId} onChange={(e) => setOutputId(e.target.value)}>
            {targets.map(v => (
              <option key={v.id} value={v.id}>
                {v.name}{v.symbol ? ` (${v.symbol})` : ''}{v.unit ? ` [${v.unit}]` : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          흔들 폭 (%)
          <Num value={percent} onChange={(e) => setPercent(e.target.value)} />
        </Field>
      </Form>

      {result && !result.ok && <Msg $bad>{result.message}</Msg>}

      {result?.ok && result.rows.length === 0 && (
        <Msg $bad>흔들어 볼 수 있는 숫자 입력이 없습니다.</Msg>
      )}

      {result?.ok && result.rows.length > 0 && (
        <>
          <Msg>
            지금 {chosen.symbol || chosen.name} = <b>{fmt(result.base)}</b>
            {chosen.unit ? ` ${chosen.unit}` : ''}.
            {' '}<b>{result.rows[0].variable.name}</b> 이(가) 가장 크게 흔듭니다.
          </Msg>

          <Chart>
            {result.rows.map(r => {
              const lo = Math.min(r.lowDelta, r.highDelta)
              const hi = Math.max(r.lowDelta, r.highDelta)
              const half = widest || 1
              // 가운데 50% 를 0 으로 두고 좌우로 최대 50% 씩.
              const left = 50 + (lo / half) * 50
              const width = ((hi - lo) / half) * 50
              return (
                <RowLine key={r.variable.id}>
                  <Name title={r.variable.name}>
                    {r.variable.name}
                    {r.variable.symbol ? ` (${r.variable.symbol})` : ''}
                  </Name>
                  <Track>
                    <Bar
                      $down={r.highDelta < 0}
                      style={{ left: `${Math.max(0, left)}%`, width: `${Math.max(1, width)}%` }}
                    />
                  </Track>
                  <Delta>
                    {fmt(r.low)} ~ {fmt(r.high)}
                    {r.oneSided && ' (한쪽만)'}
                  </Delta>
                </RowLine>
              )
            })}
          </Chart>

          {result.skipped.length > 0 && (
            <Skipped>
              흔들지 못한 입력: {result.skipped.map(s =>
                `${s.variable.name} — ${s.why}`).join(', ')}
            </Skipped>
          )}

          <Note>
            각 입력을 <b>따로따로 ±{result.percent}%</b> 씩 움직인 결과입니다.
            기준값이 0 인 입력은 퍼센트로 움직이지 않으므로 슬라이더 범위의
            {' '}{result.percent}% 로 흔듭니다.
            <br />
            <b>변수끼리 얽힌 효과는 보이지 않습니다</b> — 두께와 폭을 함께 키웠을
            때만 생기는 변화 같은 것은 DOE 탐색에서 봐야 합니다.
          </Note>
        </>
      )}
    </Wrap>
  )
}

export default SensitivityPanel
