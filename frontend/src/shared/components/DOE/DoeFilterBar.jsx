/**
 * DOE 결과에 설계 조건을 걸어 **쓸 수 있는 조합만** 남긴다.
 *
 * 조합이 몇백 개면 표에서 눈으로 고를 수가 없다. 그리고 실제로 알고 싶은 것은
 * *"허용응력 200 이하이면서 무게 5kg 이하"* 처럼 **부등식**이다.
 *
 * 조건을 걸면 **표뿐 아니라 그래프와 CSV 도 함께 걸러진다.** 표만 걸러 두면
 * 그래프는 전체를 그리고 있는데 사람은 걸러진 것으로 읽어, 조건 밖의 점을 보고
 * 판단하게 된다.
 */

import React from 'react'
import styled from 'styled-components'
import { OPERATORS } from '../../utils/doeFilter'

const Bar = styled.div`
  background: #f8f9fb;
  border: 1px solid #e6e9ef;
  border-radius: 8px;
  padding: 12px 14px;
  margin-bottom: 14px;
`

const Head = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: ${p => (p.$open ? '12px' : '0')};
`

const Title = styled.span`
  font-size: 0.82rem;
  font-weight: 700;
  color: #4b5563;
`

const Summary = styled.span`
  font-size: 0.82rem;
  color: ${p => (p.$none ? '#a33a2c' : '#34618c')};
  margin-left: auto;
`

const Toggle = styled.button`
  border: 1px solid #d5dae2;
  background: white;
  border-radius: 6px;
  padding: 5px 12px;
  font-size: 0.78rem;
  color: #4b5563;
  cursor: pointer;

  &:hover {
    border-color: #3498db;
    color: #3498db;
  }
`

const Row = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
  flex-wrap: wrap;
`

const Select = styled.select`
  padding: 7px 9px;
  border: 1px solid #d5dae2;
  border-radius: 6px;
  font-size: 0.83rem;
  background: white;
`

const Num = styled.input`
  width: 110px;
  padding: 7px 9px;
  border: 1px solid #d5dae2;
  border-radius: 6px;
  font-size: 0.83rem;
`

const Small = styled.button`
  border: none;
  background: none;
  color: #98a2b3;
  cursor: pointer;
  font-size: 0.9rem;
  padding: 2px 6px;

  &:hover {
    color: #c0392b;
  }
`

const AddBtn = styled.button`
  border: 1px dashed #cbd2dc;
  background: none;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 0.8rem;
  color: #6b7280;
  cursor: pointer;

  &:hover {
    border-color: #3498db;
    color: #3498db;
  }
`

const Note = styled.div`
  margin-top: 10px;
  font-size: 0.78rem;
  color: #98a2b3;
  line-height: 1.6;
`

const EMPTY = { key: '', op: 'lte', value: '', value2: '' }

function DoeFilterBar({ keys, labels, conditions, onChange, summary, hint }) {
  const [open, setOpen] = React.useState(false)

  const update = (idx, patch) => {
    const next = conditions.map((c, i) => (i === idx ? { ...c, ...patch } : c))
    onChange(next)
  }

  const add = () => onChange([...conditions, { ...EMPTY, key: keys[0] || '' }])
  const remove = (idx) => onChange(conditions.filter((_, i) => i !== idx))

  const active = summary.matched !== summary.total

  return (
    <Bar>
      <Head $open={open}>
        <Title>설계 조건</Title>
        <Toggle onClick={() => setOpen(v => !v)}>
          {open ? '접기' : conditions.length ? `조건 ${conditions.length}개` : '조건 걸기'}
        </Toggle>
        {active && (
          <Summary $none={summary.matched === 0}>
            {summary.total}개 중 <b>{summary.matched}개</b> 만족
            {summary.skipped > 0 && ` · 판정 불가 ${summary.skipped}개`}
          </Summary>
        )}
      </Head>

      {open && (
        <>
          {conditions.map((c, i) => (
            <Row key={i}>
              <Select value={c.key} onChange={(e) => update(i, { key: e.target.value })}>
                {keys.map(k => (
                  <option key={k} value={k}>{labels[k] || k}</option>
                ))}
              </Select>
              <Select value={c.op} onChange={(e) => update(i, { op: e.target.value })}>
                {OPERATORS.map(o => (
                  <option key={o.op} value={o.op}>{o.label}</option>
                ))}
              </Select>
              <Num value={c.value} onChange={(e) => update(i, { value: e.target.value })}
                   placeholder="값" />
              {c.op === 'between' && (
                <>
                  <span style={{ color: '#98a2b3', fontSize: '0.8rem' }}>~</span>
                  <Num value={c.value2} onChange={(e) => update(i, { value2: e.target.value })}
                       placeholder="값" />
                </>
              )}
              <Small onClick={() => remove(i)} title="이 조건 지우기">✕</Small>
            </Row>
          ))}

          <AddBtn onClick={add}>＋ 조건 추가</AddBtn>

          <Note>
            조건은 <b>모두 만족</b>하는 조합만 남깁니다. 표·그래프·CSV 에 함께
            적용됩니다.
            {hint && <><br />{hint}</>}
          </Note>
        </>
      )}
    </Bar>
  )
}

export default DoeFilterBar
