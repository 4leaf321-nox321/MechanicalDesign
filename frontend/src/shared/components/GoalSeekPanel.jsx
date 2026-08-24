/**
 * 역계산 — 목표 결과값이 나오는 입력값을 찾는다.
 *
 * 카드는 입력 → 출력 방향으로만 돈다. "허용응력 200MPa 를 만족하는 최대 두께" 는
 * 그 반대 방향이라, 지금까지는 숫자를 바꿔 가며 손으로 맞춰야 했다.
 *
 * **푸는 변수 말고 다른 입력은 지금 화면 값으로 고정된다.** 그것이 이 기능이
 * 쓸모 있는 이유다 — 재질·안전율은 그대로 두고 치수 하나만 역으로 구하는 것이
 * 실제로 하는 일이다.
 */

import React, { useMemo, useState } from 'react'
import styled from 'styled-components'
import { fixedInputs, fmt, goalSeek } from '../utils/goalSeek'
import { tradeoffCurve } from '../utils/tradeoff'
import TradeoffPlot from './TradeoffPlot'

const Wrap = styled.div`
  background: white;
  border-radius: 10px;
  padding: 22px 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
`

const Modes = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
`

const ModeBtn = styled.button`
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 0.84rem;
  cursor: pointer;
  border: 1px solid ${p => (p.$on ? '#1a1a2e' : '#d5dae2')};
  background: ${p => (p.$on ? '#1a1a2e' : 'white')};
  color: ${p => (p.$on ? 'white' : '#4b5563')};

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`

const Intro = styled.p`
  margin: 0 0 18px;
  font-size: 0.87rem;
  color: #6b7280;
  line-height: 1.6;
`

const Form = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 14px;
  align-items: end;
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
`

const Input = styled.input`
  padding: 9px 10px;
  border: 1px solid #d5dae2;
  border-radius: 6px;
  font-size: 0.88rem;
  font-weight: 400;
`

const Fixed = styled.div`
  margin-top: 18px;
  padding: 12px 14px;
  background: #f8f9fb;
  border: 1px solid #e6e9ef;
  border-radius: 8px;
`

const FixedLabel = styled.div`
  font-size: 0.75rem;
  font-weight: 700;
  color: #6b7280;
  margin-bottom: 8px;
`

const FixedList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`

const FixedItem = styled.span`
  font-size: 0.78rem;
  padding: 3px 9px;
  border-radius: 999px;
  background: ${p => (p.$blank ? '#fdecea' : '#eef2f7')};
  color: ${p => (p.$blank ? '#a4343a' : '#4b5563')};
  border: 1px solid ${p => (p.$blank ? '#f5c6cb' : '#dfe3ea')};
`

const FixedWarn = styled.div`
  margin-top: 8px;
  font-size: 0.78rem;
  color: #a4343a;
`

const RunRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 18px;
  flex-wrap: wrap;
`

const RunBtn = styled.button`
  padding: 10px 22px;
  border: none;
  border-radius: 6px;
  background: #1a1a2e;
  color: white;
  font-size: 0.9rem;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
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

const Answers = styled.div`
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
`

const Answer = styled.div`
  border: 1px solid #cfe3f7;
  border-radius: 8px;
  padding: 14px 16px;
  background: #f8fbff;
`

const AnswerValue = styled.div`
  font-size: 1.3rem;
  font-weight: 700;
  color: #1a1a2e;
  margin-bottom: 4px;
`

const AnswerMeta = styled.div`
  font-size: 0.78rem;
  color: #6b7280;
  line-height: 1.5;
`

const ApplyBtn = styled.button`
  margin-top: 10px;
  padding: 6px 12px;
  border: 1px solid #cfe3f7;
  border-radius: 6px;
  background: white;
  color: #34618c;
  font-size: 0.78rem;
  cursor: pointer;

  &:hover {
    border-color: #3498db;
    color: #3498db;
  }
`

const Note = styled.div`
  margin-top: 14px;
  font-size: 0.78rem;
  color: #98a2b3;
  line-height: 1.6;
`

function GoalSeekPanel({ variables, values, onApply }) {
  // 푸는 변수는 **숫자 입력**만 된다. 드롭다운·배열은 사이값이 없어서 좁혀
  // 들어갈 수가 없다.
  const solvable = useMemo(
    () => variables.filter(v => v.category === 'input'
      && (v.var_type === 'slider' || v.var_type === 'text')),
    [variables],
  )
  const targets = useMemo(
    () => variables.filter(v => v.category === 'output' || v.category === 'intermediate'),
    [variables],
  )

  const [inputId, setInputId] = useState(() => solvable[0]?.id ?? '')
  const [outputId, setOutputId] = useState(() => targets[0]?.id ?? '')
  const [target, setTarget] = useState('')
  const [min, setMin] = useState(() => solvable[0]?.min_value ?? '')
  const [max, setMax] = useState(() => solvable[0]?.max_value ?? '')
  const [result, setResult] = useState(null)

  // 미지수 하나면 답이 **점**, 둘이면 **선**이다. 같은 화면에 두 결과를
  // 섞으면 무엇을 보고 있는지 흐려져, 모드로 나눈다.
  const [unknowns, setUnknowns] = useState(1)
  const [sweepId, setSweepId] = useState(() => solvable[1]?.id ?? solvable[0]?.id ?? '')
  const [sweepMin, setSweepMin] = useState(() => solvable[1]?.min_value ?? '')
  const [sweepMax, setSweepMax] = useState(() => solvable[1]?.max_value ?? '')
  const [curve, setCurve] = useState(null)
  const [busy, setBusy] = useState(false)

  // **무엇이 고정되는지 그대로 보여 준다.** 말로만 '화면 값으로 고정' 이라고
  // 하면 그 값이 무엇인지 확인할 방법이 없고, 비어 있어 기본값으로 떨어진
  // 칸은 더더욱 안 보인다.
  const fixed = useMemo(
    () => fixedInputs(variables, values, inputId)
      // 2개 모드에서는 훑는 변수도 고정이 아니다 — 그것이 x 축이다.
      .filter(f => unknowns === 1 || String(f.variable.id) !== String(sweepId)),
    [variables, values, inputId, unknowns, sweepId],
  )

  const chosenInput = solvable.find(v => String(v.id) === String(inputId))
  const chosenOutput = targets.find(v => String(v.id) === String(outputId))
  const chosenSweep = solvable.find(v => String(v.id) === String(sweepId))
  const label = (v) => (v ? (v.symbol || v.name) + (v.unit ? ` [${v.unit}]` : '') : '')

  const pickInput = (id) => {
    setInputId(id)
    setResult(null)
    // 슬라이더는 범위를 이미 갖고 있다. 사람이 다시 적을 이유가 없다.
    const v = solvable.find(x => String(x.id) === String(id))
    if (v && v.var_type === 'slider') {
      setMin(v.min_value ?? '')
      setMax(v.max_value ?? '')
    }
  }

  const run = () => {
    setCurve(null)
    setResult(goalSeek(variables, values, {
      inputId: chosenInput?.id, outputId: chosenOutput?.id, target, min, max,
    }))
  }

  /**
   * 미지수 둘 — 한 변수를 훑으며 나머지를 매번 역계산한다.
   *
   * 40개 지점 × 역계산 한 번이라 계산이 수천 번이다. 버튼을 눌러도 아무
   * 반응이 없는 순간이 생기지 않게 상태를 먼저 바꾼다.
   */
  const runCurve = () => {
    setResult(null)
    setBusy(true)
    setCurve(null)
    setTimeout(() => {
      setCurve(tradeoffCurve(variables, values, {
        sweepId: chosenSweep?.id, sweepMin, sweepMax,
        solveId: chosenInput?.id, solveMin: min, solveMax: max,
        outputId: chosenOutput?.id, target,
      }))
      setBusy(false)
    }, 0)
  }

  if (solvable.length === 0 || targets.length === 0) {
    return (
      <Wrap>
        <Intro>
          역계산을 하려면 <b>숫자 입력 변수</b>와 <b>계산 결과 변수</b>가 하나씩은
          있어야 합니다. 드롭다운·배열 입력은 사이값이 없어 좁혀 들어갈 수 없습니다.
        </Intro>
      </Wrap>
    )
  }

  return (
    <Wrap>
      <Modes>
        <ModeBtn $on={unknowns === 1}
                 onClick={() => { setUnknowns(1); setCurve(null) }}>
          미지수 1개 — 값 찾기
        </ModeBtn>
        <ModeBtn $on={unknowns === 2}
                 onClick={() => { setUnknowns(2); setResult(null) }}
                 disabled={solvable.length < 2}
                 title={solvable.length < 2 ? '숫자 입력 변수가 둘 이상 필요합니다' : ''}>
          미지수 2개 — 트레이드오프 곡선
        </ModeBtn>
      </Modes>

      <Intro>
        {unknowns === 2
          ? <>두 변수의 <b>가능한 조합을 선으로</b> 그립니다. 미지수가 둘이면 답이 하나로 정해지지 않습니다 — 두께를 키우면 폭을 줄일 수 있고, 그 맞바꿈이 이 곡선입니다. 설계 최적점은 대개 이 선 위에 있습니다.</>
          : <>목표 결과값이 나오는 입력값을 찾습니다.
        {' '}<b>푸는 변수 말고 다른 입력은 지금 화면에 있는 값으로 고정</b>됩니다 —
        재질·안전율은 그대로 두고 치수 하나만 역으로 구하는 식입니다.</>}
      </Intro>

      <Form>
        <Field>
          무엇을 구할까요
          <Select value={inputId} onChange={(e) => pickInput(e.target.value)}>
            {solvable.map(v => (
              <option key={v.id} value={v.id}>
                {v.name}{v.symbol ? ` (${v.symbol})` : ''}{v.unit ? ` [${v.unit}]` : ''}
              </option>
            ))}
          </Select>
        </Field>

        {unknowns === 2 && (
          <>
            <Field>
              무엇에 대해 (가로축)
              <Select value={sweepId} onChange={(e) => {
                setSweepId(e.target.value); setCurve(null)
                const v = solvable.find(x => String(x.id) === String(e.target.value))
                if (v && v.var_type === 'slider') {
                  setSweepMin(v.min_value ?? ''); setSweepMax(v.max_value ?? '')
                }
              }}>
                {solvable.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.name}{v.symbol ? ` (${v.symbol})` : ''}{v.unit ? ` [${v.unit}]` : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              가로축 범위 — 시작
              <Input value={sweepMin} onChange={(e) => { setSweepMin(e.target.value); setCurve(null) }} />
            </Field>
            <Field>
              가로축 범위 — 끝
              <Input value={sweepMax} onChange={(e) => { setSweepMax(e.target.value); setCurve(null) }} />
            </Field>
          </>
        )}

        <Field>
          어느 결과를
          <Select value={outputId} onChange={(e) => { setOutputId(e.target.value); setResult(null) }}>
            {targets.map(v => (
              <option key={v.id} value={v.id}>
                {v.name}{v.symbol ? ` (${v.symbol})` : ''}{v.unit ? ` [${v.unit}]` : ''}
              </option>
            ))}
          </Select>
        </Field>

        <Field>
          목표값{chosenOutput?.unit ? ` [${chosenOutput.unit}]` : ''}
          <Input value={target} onChange={(e) => { setTarget(e.target.value); setResult(null) }}
                 placeholder="예: 200" />
        </Field>

        <Field>
          찾을 범위 — 시작{chosenInput?.unit ? ` [${chosenInput.unit}]` : ''}
          <Input value={min} onChange={(e) => { setMin(e.target.value); setResult(null) }} />
        </Field>

        <Field>
          찾을 범위 — 끝
          <Input value={max} onChange={(e) => { setMax(e.target.value); setResult(null) }} />
        </Field>
      </Form>

      {fixed.length > 0 && (
        <Fixed>
          <FixedLabel>이 값들로 고정한 채 찾습니다</FixedLabel>
          <FixedList>
            {fixed.map(f => (
              <FixedItem key={f.variable.id} $blank={f.isBlank}>
                {f.variable.symbol || f.variable.name}
                {' = '}
                {f.isBlank
                  ? '(비어 있음)'
                  : Array.isArray(f.value) ? `[${f.value.length}개]` : String(f.value)}
                {f.variable.unit && !f.isBlank ? ` ${f.variable.unit}` : ''}
                {f.usedDefault && !f.isBlank ? ' (기본값)' : ''}
              </FixedItem>
            ))}
          </FixedList>
          {fixed.some(f => f.isBlank) && (
            <FixedWarn>
              비어 있는 입력이 있으면 계산이 되지 않습니다. 단일 계산 탭에서 채운 뒤
              다시 오세요.
            </FixedWarn>
          )}
        </Fixed>
      )}

      <RunRow>
        {unknowns === 1
          ? <RunBtn onClick={run}>역계산</RunBtn>
          : <RunBtn onClick={runCurve} disabled={busy}>
              {busy ? '계산 중…' : '곡선 그리기'}
            </RunBtn>}
      </RunRow>

      {curve && !curve.ok && <Msg $bad>{curve.message}</Msg>}

      {curve?.ok && (
        <>
          <Msg>
            {curve.branches.length > 1
              ? `가로축 지점마다 답이 여러 개입니다 — 갈래 ${curve.branches.length}개로 나눠 그렸습니다.`
              : '선 위의 어느 점을 골라도 목표를 만족합니다.'}
            {curve.partial && ` 훑은 ${curve.total}개 지점 중 ${curve.solvedCount}개에서만 답이 있어, 나머지 구간은 비워 두었습니다.`}
          </Msg>
          <TradeoffPlot
            result={curve}
            xLabel={label(chosenSweep)}
            yLabel={label(chosenInput)}
            title={`${label(chosenOutput)} = ${target} 을(를) 만족하는 조합`}
          />
        </>
      )}

      {result && !result.ok && <Msg $bad>{result.message}</Msg>}

      {result?.ok && (
        <>
          <Msg>
            {result.solutions.length === 1
              ? '답을 하나 찾았습니다.'
              : `이 범위에서 답이 ${result.solutions.length}개입니다. 설계 조건에 맞는 것을 고르세요.`}
          </Msg>
          <Answers>
            {result.solutions.map((s, i) => (
              <Answer key={i}>
                <AnswerValue>
                  {chosenInput?.symbol || chosenInput?.name} = {fmt(s.input)}
                  {chosenInput?.unit ? ` ${chosenInput.unit}` : ''}
                </AnswerValue>
                <AnswerMeta>
                  이때 {chosenOutput?.symbol || chosenOutput?.name} = {fmt(s.output)}
                  {chosenOutput?.unit ? ` ${chosenOutput.unit}` : ''}
                </AnswerMeta>
                <ApplyBtn onClick={() => onApply(chosenInput.id, s.input)}>
                  이 값으로 입력 채우기
                </ApplyBtn>
              </Answer>
            ))}
          </Answers>
        </>
      )}

      {result?.partial && (
        <Note>
          범위 안에 계산이 되지 않는 지점이 있었습니다(0으로 나누기 등). 그 부근의
          답은 놓쳤을 수 있습니다.
        </Note>
      )}

      {unknowns === 2 && (
        <Note>
          가로축을 <b>40등분</b>하고 각 지점마다 세로축 변수를 역계산합니다.
          답이 없는 지점은 <b>이어 그리지 않고 비워</b> 둡니다 — 이으면 그 구간도
          가능한 것처럼 보입니다.
        </Note>
      )}

      <Note>
        범위를 <b>200등분해 훑은 뒤</b> 부호가 바뀌는 구간마다 좁혀 들어갑니다.
        그래서 답이 여러 개여도 모두 찾지만, 훑는 간격보다 좁게 붙어 있는 두 답은
        하나로 보입니다.
      </Note>
    </Wrap>
  )
}

export default GoalSeekPanel
