/**
 * 도해 정의 — 이 계산이 **어떤 형상**에 대한 것인지 고른다.
 *
 * 올리는 그림이 아니라 앱이 그리는 그림이라, 여기서 하는 일은 둘뿐이다:
 * **어느 도해인가**, 그리고 **도해의 어느 치수가 카드의 어느 변수인가**.
 *
 * ## 기호가 같으면 저절로 물린다
 *
 * 도해가 쓰는 이름(`d`·`b`·`L`)은 교과서에서 쓰는 글자 그대로다. 카드 변수도
 * 대개 같은 글자를 쓰므로 **대부분 저절로 맞는다.** 미리 채워 두고 고칠 수 있게
 * 두는 것이 요점이다 — 자동으로 맞춘 것을 못 고치게 하면 어쩌다 틀렸을 때
 * 빠져나갈 길이 없다.
 *
 * 배치(어느 컨테이너에 보일지)는 여기서 안 정한다. 「위젯 배치」 탭이 전담한다 —
 * 들어오는 문이 둘이면 어긋난다.
 */

import React, { useState } from 'react'
import styled from 'styled-components'

import { apiFetch } from '../../api/client'
import { useDialog } from '../Dialog'
import FigureView from '../FigureView'
import { FIGURES, autoWire, figureOf, unwired } from '../../figures'

const Wrap = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 320px);
  gap: 18px;
  align-items: start;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
`

const Select = styled.select`
  padding: 6px 10px;
  border: 1px solid hsl(var(--border-strong));
  border-radius: var(--radius);
  background: hsl(var(--surface));
  color: hsl(var(--fg));
  font-size: 0.87rem;
  min-width: 150px;
`

const Text = styled.input`
  flex: 1;
  min-width: 140px;
  padding: 6px 10px;
  border: 1px solid hsl(var(--border-strong));
  border-radius: var(--radius);
  background: hsl(var(--surface));
  color: hsl(var(--fg));
  font-size: 0.87rem;
`

const Primary = styled.button`
  padding: 6px 14px;
  border: none;
  border-radius: var(--radius);
  background: hsl(var(--accent));
  color: hsl(var(--solid-fg));
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;

  &:disabled { opacity: 0.5; cursor: not-allowed; }
`

const Small = styled.button`
  padding: 4px 10px;
  border: 1px solid hsl(var(--border-strong));
  border-radius: var(--radius);
  background: none;
  color: hsl(var(--fg-muted));
  font-size: 0.8rem;
  cursor: pointer;
`

const Card = styled.div`
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  padding: 12px 14px;
  margin-bottom: 12px;
  background: hsl(var(--surface));
`

const Head = styled.div`
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;
`

const Name = styled.b`
  color: hsl(var(--fg));
`

const Hint = styled.p`
  margin: 0 0 10px;
  font-size: 0.8rem;
  color: hsl(var(--fg-subtle));
  line-height: 1.6;
`

const SlotRow = styled.div`
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 0.85rem;
`

const SlotName = styled.span`
  color: hsl(var(--fg-muted));
`

const Need = styled.span`
  color: hsl(var(--warn));
  font-size: 0.75rem;
  font-weight: 700;
  margin-left: 4px;
`

const Empty = styled.p`
  color: hsl(var(--fg-subtle));
  font-size: 0.88rem;
  line-height: 1.7;
`

const ErrorBox = styled.div`
  background: hsl(var(--danger-soft));
  border: 1px solid hsl(var(--danger-border));
  color: hsl(var(--danger));
  border-radius: var(--radius);
  padding: 10px 12px;
  font-size: 0.85rem;
  margin-bottom: 12px;
`

export default function FigureTab({ cardId, figures, variables, onRefresh }) {
  const { confirm } = useDialog()
  const [kind, setKind] = useState(FIGURES[0]?.id || '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // 미리보기는 **값 없이** 그린다. 설정 화면에는 입력값이 없어서, 있는 척하면
  // 카드에서 보게 될 그림과 다른 것을 보여 주게 된다.
  const preview = (figure) => (
    <FigureView figure={figure} lookup={(id) => {
      const v = variables.find(x => String(x.id) === String(id))
      return v ? { value: undefined, unit: v.unit || '' } : null
    }} />
  )

  const call = async (path, options) => {
    setBusy(true)
    setError('')
    const res = await apiFetch(path, options)
    setBusy(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error || '처리하지 못했습니다.')
      return false
    }
    await onRefresh()
    return true
  }

  const add = () => call(`/cards/${cardId}/figures`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // 기호가 같은 변수를 미리 물려 둔다. 대부분 이걸로 끝난다.
    body: JSON.stringify({ kind, mapping: autoWire(kind, variables) }),
  })

  const rewire = (figure, slot, variableId) => call(
    `/cards/${cardId}/figures/${figure.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mapping: { ...figure.mapping, [slot]: variableId || null },
      }),
    })

  const caption = (figure, value) => call(`/cards/${cardId}/figures/${figure.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caption: value }),
  })

  const remove = async (figure) => {
    const spec = figureOf(figure.kind)
    const ok = await confirm({
      title: `${spec ? spec.name : figure.kind} 도해를 지웁니다`,
      body: '이 도해가 놓인 자리에서도 함께 사라집니다.\n변수는 그대로 남습니다.',
      confirmLabel: '지우기',
      tone: 'danger',
    })
    if (!ok) return
    await call(`/cards/${cardId}/figures/${figure.id}`, { method: 'DELETE' })
  }

  return (
    <div>
      {error && <ErrorBox>{error}</ErrorBox>}

      <Hint>
        도해는 <b>앱이 그리는 그림</b>입니다. 파일을 올리지 않고, 값이 바뀌면 그림도
        따라 바뀝니다. 어디에 보일지는 <b>위젯 배치</b> 탭에서 정합니다.
      </Hint>

      <Row>
        <Select value={kind} onChange={(e) => setKind(e.target.value)}>
          {FIGURES.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </Select>
        <Primary onClick={add} disabled={busy || !kind}>＋ 도해 넣기</Primary>
      </Row>
      {figureOf(kind) && <Hint>{figureOf(kind).summary}</Hint>}

      {figures.length === 0 ? (
        <Empty>아직 도해가 없습니다. 위에서 하나 골라 넣어 보세요.</Empty>
      ) : figures.map(figure => {
        const spec = figureOf(figure.kind)
        const missing = unwired(figure)
        return (
          <Card key={figure.id}>
            <Head>
              <Name>{spec ? spec.name : figure.kind}</Name>
              {!spec && <Need>그릴 줄 모르는 도해입니다</Need>}
              {missing.length > 0 && <Need>{missing.join(', ')} 를 고르세요</Need>}
              <div style={{ marginLeft: 'auto' }}>
                <Small onClick={() => remove(figure)}>지우기</Small>
              </div>
            </Head>

            <Wrap>
              <div>
                {spec && spec.params.map(p => (
                  <SlotRow key={p.key}>
                    <SlotName>
                      {p.label} ({p.key})
                      {!p.required && <Need style={{ color: 'hsl(var(--fg-subtle))' }}>선택</Need>}
                    </SlotName>
                    <Select
                      value={figure.mapping[p.key] || ''}
                      onChange={(e) => rewire(figure, p.key, Number(e.target.value) || null)}>
                      <option value="">— 안 씀 —</option>
                      {variables.map(v => (
                        <option key={v.id} value={v.id}>
                          {v.symbol ? `${v.symbol} · ` : ''}{v.name}
                        </option>
                      ))}
                    </Select>
                  </SlotRow>
                ))}
                <Row style={{ marginTop: 10 }}>
                  <Text
                    defaultValue={figure.caption}
                    placeholder="그림 아래 설명 (선택)"
                    onBlur={(e) => {
                      if (e.target.value !== figure.caption) caption(figure, e.target.value)
                    }}
                  />
                </Row>
              </div>
              <div>{preview(figure)}</div>
            </Wrap>
          </Card>
        )
      })}
    </div>
  )
}
