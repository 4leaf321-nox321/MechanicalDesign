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
import { fixedInputs, fmt } from '../utils/goalSeek'

const Wrap = styled.div`
  background: hsl(var(--surface));
  border-radius: var(--radius);
  padding: 22px 24px;
  border: 1px solid hsl(var(--border));
`

const Intro = styled.p`
  margin: 0 0 18px;
  font-size: 0.87rem;
  color: hsl(var(--fg-muted));
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
  color: hsl(var(--fg-muted));
  font-weight: 600;
`

const Select = styled.select`
  padding: 9px 10px;
  border: 1px solid hsl(var(--border-strong));
  border-radius: var(--radius);
  font-size: 0.88rem;
  font-weight: 400;
  background: hsl(var(--surface));
  min-width: 200px;
`

const Num = styled.input`
  width: 90px;
  padding: 9px 10px;
  border: 1px solid hsl(var(--border-strong));
  border-radius: var(--radius);
  font-size: 0.88rem;
  font-weight: 400;
`

const Held = styled.div`
  margin-top: 18px;
  padding: 12px 14px;
  background: hsl(var(--surface-2));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
`

const HeldLabel = styled.div`
  font-size: 0.75rem;
  font-weight: 700;
  color: hsl(var(--fg-muted));
  margin-bottom: 8px;
`

const HeldList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`

const HeldItem = styled.span`
  font-size: 0.78rem;
  padding: 3px 9px;
  border-radius: 999px;
  background: ${p => (p.$blank ? 'hsl(var(--danger-soft))' : 'hsl(var(--info-soft))')};
  color: ${p => (p.$blank ? 'hsl(var(--danger))' : 'hsl(var(--fg-muted))')};
  border: 1px solid ${p => (p.$blank ? 'hsl(var(--danger-border))' : 'hsl(var(--border))')};
`

const Msg = styled.div`
  margin-top: 18px;
  padding: 12px 14px;
  border-radius: var(--radius);
  font-size: 0.86rem;
  line-height: 1.6;
  background: ${p => (p.$bad ? 'hsl(var(--danger-soft))' : 'hsl(var(--info-soft))')};
  border: 1px solid ${p => (p.$bad ? 'hsl(var(--danger-border))' : 'hsl(var(--info-border))')};
  color: ${p => (p.$bad ? 'hsl(var(--danger))' : 'hsl(var(--info))')};
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
  color: hsl(var(--fg));
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

/** 가운데(=지금 값)를 기준으로 좌우로 뻗는 막대. */
const Track = styled.div`
  position: relative;
  height: 20px;
  background: hsl(var(--surface-2));
  border-radius: var(--radius-sm);

  /* 지금 값 자리. 막대가 어느 쪽으로 갔는지 이 선이 없으면 알 수 없다. */
  &::after {
    content: '';
    position: absolute;
    left: 50%;
    top: -3px;
    bottom: -3px;
    width: 1px;
    background: hsl(var(--border-strong));
  }
`

const Bar = styled.div`
  position: absolute;
  top: 3px;
  bottom: 3px;
  background: ${p => (p.$down ? 'hsl(var(--warn))' : 'hsl(var(--primary))')};
  border-radius: var(--radius-sm);
`

const Delta = styled.div`
  font-size: 0.76rem;
  color: hsl(var(--fg-muted));
  font-variant-numeric: tabular-nums;
`

const Skipped = styled.div`
  margin-top: 16px;
  font-size: 0.78rem;
  color: hsl(var(--fg-subtle));
  line-height: 1.6;
`

const Note = styled.div`
  margin-top: 14px;
  font-size: 0.78rem;
  color: hsl(var(--fg-subtle));
  line-height: 1.6;
`

function SensitivityPanel({ variables, values }) {
  const targets = useMemo(
    () => variables.filter(v => v.category === 'output' || v.category === 'intermediate'),
    [variables],
  )
  const [outputId, setOutputId] = useState(() => targets[0]?.id ?? '')
  const [percent, setPercent] = useState(DEFAULT_PERCENT)

  // **어느 설계점을 보고 있는지 보여 준다.** 흔드는 변수 말고는 전부 이 값으로
  // 고정되므로, 이 값이 무엇인지 모르면 결과가 어느 설계에 대한 것인지 알 수
  // 없다. 비어 있어 기본값으로 떨어진 칸은 특히 안 보인다.
  //
  // solvedId 를 비워 넘긴다 — 민감도는 **모든** 입력을 차례로 흔들므로
  // '고정에서 빠지는 하나' 가 없다.
  const held = useMemo(() => fixedInputs(variables, values, null), [variables, values])

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

      {held.length > 0 && (
        <Held>
          <HeldLabel>이 설계점을 기준으로 흔듭니다 (단일 계산 탭의 값)</HeldLabel>
          <HeldList>
            {held.map(f => (
              <HeldItem key={f.variable.id} $blank={f.isBlank}>
                {f.variable.symbol || f.variable.name}
                {' = '}
                {f.isBlank
                  ? '(비어 있음)'
                  : Array.isArray(f.value) ? `[${f.value.length}개]` : String(f.value)}
                {f.variable.unit && !f.isBlank ? ` ${f.variable.unit}` : ''}
                {f.usedDefault && !f.isBlank ? ' (기본값)' : ''}
              </HeldItem>
            ))}
          </HeldList>
        </Held>
      )}

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
