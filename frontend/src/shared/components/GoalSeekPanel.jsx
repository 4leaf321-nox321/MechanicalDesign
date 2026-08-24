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

  // **무엇이 고정되는지 그대로 보여 준다.** 말로만 '화면 값으로 고정' 이라고
  // 하면 그 값이 무엇인지 확인할 방법이 없고, 비어 있어 기본값으로 떨어진
  // 칸은 더더욱 안 보인다.
  const fixed = useMemo(
    () => fixedInputs(variables, values, inputId),
    [variables, values, inputId],
  )

  const chosenInput = solvable.find(v => String(v.id) === String(inputId))
  const chosenOutput = targets.find(v => String(v.id) === String(outputId))

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
    setResult(goalSeek(variables, values, {
      inputId: chosenInput?.id, outputId: chosenOutput?.id, target, min, max,
    }))
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
      <Intro>
        목표 결과값이 나오는 입력값을 찾습니다.
        {' '}<b>푸는 변수 말고 다른 입력은 지금 화면에 있는 값으로 고정</b>됩니다 —
        재질·안전율은 그대로 두고 치수 하나만 역으로 구하는 식입니다.
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
        <RunBtn onClick={run}>역계산</RunBtn>
      </RunRow>

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

      <Note>
        범위를 <b>200등분해 훑은 뒤</b> 부호가 바뀌는 구간마다 좁혀 들어갑니다.
        그래서 답이 여러 개여도 모두 찾지만, 훑는 간격보다 좁게 붙어 있는 두 답은
        하나로 보입니다.
      </Note>
    </Wrap>
  )
}

export default GoalSeekPanel
