/**
 * 조직 추가·이름 변경·삭제 모달.
 *
 * `window.prompt` 를 쓰지 않는다. 브라우저 기본 대화상자는 **무엇을 하는 중인지**
 * 를 담을 자리가 없다 — 어느 조직 아래에 만드는지, 지우면 무엇을 잃는지가
 * 한 줄짜리 질문에는 들어가지 않는다. 삭제에서 특히 문제가 되는데, 그때 필요한
 * 정보가 정확히 "이 조직에 무엇이 걸려 있는가" 이기 때문이다.
 */

import React, { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
`

const Box = styled.div`
  background: white;
  border-radius: 10px;
  width: min(420px, 92vw);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
  padding: 24px;
`

const Title = styled.h3`
  margin: 0 0 6px;
  font-size: 1.05rem;
  color: #1a1a2e;
`

const Sub = styled.p`
  margin: 0 0 18px;
  font-size: 0.83rem;
  color: #6b7280;
  line-height: 1.55;
`

const Label = styled.label`
  display: block;
  font-size: 0.78rem;
  color: #4b5563;
  margin-bottom: 5px;
  font-weight: 600;
`

const Input = styled.input`
  width: 100%;
  padding: 9px 11px;
  border: 1px solid #d5dae2;
  border-radius: 6px;
  font-size: 0.9rem;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: #3498db;
  }
`

const Field = styled.div`
  margin-bottom: 14px;
`

const Note = styled.div`
  background: #f8f9fb;
  border: 1px solid #eceef2;
  border-radius: 6px;
  padding: 12px 14px;
  font-size: 0.83rem;
  color: #4b5563;
  line-height: 1.6;
  margin-bottom: 16px;

  b {
    color: #1a1a2e;
  }
`

const Blocked = styled(Note)`
  background: #fdf3f2;
  border-color: #f5d9d6;
  color: #a33a2c;

  b {
    color: #8f2f23;
  }
`

const Err = styled.div`
  color: #c0392b;
  font-size: 0.82rem;
  margin-bottom: 12px;
`

const Row = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
`

const Btn = styled.button`
  padding: 8px 18px;
  border-radius: 6px;
  font-size: 0.86rem;
  cursor: pointer;
  border: 1px solid #d5dae2;
  background: white;
  color: #4b5563;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

const Primary = styled(Btn)`
  border-color: transparent;
  background: ${(p) => (p.$danger ? '#c0392b' : '#1a1a2e')};
  color: white;
`

/** 배경 클릭·ESC 로 닫기. 모달 하나마다 다시 적지 않는다. */
function Shell({ onClose, children }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <Backdrop onClick={onClose}>
      <Box onClick={(e) => e.stopPropagation()}>{children}</Box>
    </Backdrop>
  )
}

/**
 * 조직 추가 / 이름 변경.
 *
 * `parentName` 이 있으면 그 아래에 만드는 중이라는 뜻이다. 어디에 만드는지를
 * 안 보여 주면, 최상위에 만들려다 팀 아래에 만들어 놓고도 모른다.
 */
export function OrgFormModal({ mode, parentName, initialName = '', onSubmit, onClose }) {
  const [name, setName] = useState(initialName)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  const editing = mode === 'rename'

  const submit = async (e) => {
    e.preventDefault()
    const value = name.trim()
    if (!value) {
      setError('조직 이름을 입력해 주세요.')
      return
    }
    setBusy(true)
    setError('')
    const message = await onSubmit(value)
    setBusy(false)
    if (message) setError(message)
    else onClose()
  }

  return (
    <Shell onClose={onClose}>
      <Title>{editing ? '조직 이름 변경' : '조직 추가'}</Title>
      <Sub>
        {editing
          ? '이름만 바뀝니다. 주소는 그대로 두므로 저장해 둔 링크가 계속 동작합니다.'
          : parentName
            ? `'${parentName}' 아래에 만듭니다.`
            : '최상위 조직으로 만듭니다.'}
      </Sub>

      <form onSubmit={submit}>
        <Field>
          <Label>조직 이름</Label>
          <Input
            ref={ref}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 설계1팀"
            maxLength={128}
          />
        </Field>

        {error && <Err>{error}</Err>}

        <Row>
          <Btn type="button" onClick={onClose}>
            취소
          </Btn>
          <Primary type="submit" disabled={busy}>
            {busy ? '처리 중…' : editing ? '변경' : '추가'}
          </Primary>
        </Row>
      </form>
    </Shell>
  )
}

/**
 * 조직 삭제.
 *
 * **막힐 것을 미리 말해 준다.** 하위 조직이나 게시된 카드가 있으면 서버가
 * 거절하는데, 눌러 보고 나서야 알면 무엇을 먼저 치워야 하는지 알 수 없다.
 * 서버가 여전히 최종 판정을 한다 — 여기 숫자는 화면이 마지막으로 받은 것이라
 * 그 사이에 누가 카드를 올렸을 수 있다.
 */
export function OrgDeleteModal({ org, childCount, onConfirm, onClose }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const cards = org.card_count || 0
  const blocked = childCount > 0 || cards > 0

  const confirm = async () => {
    setBusy(true)
    setError('')
    const message = await onConfirm()
    setBusy(false)
    if (message) setError(message)
    else onClose()
  }

  return (
    <Shell onClose={onClose}>
      <Title>조직 삭제</Title>
      <Sub>
        <b>{org.name}</b> 을(를) 삭제합니다.
      </Sub>

      {blocked ? (
        <Blocked>
          먼저 치워야 할 것이 있습니다.
          <br />
          {childCount > 0 && (
            <>
              · 하위 조직 <b>{childCount}개</b> — 다른 곳으로 옮기거나 지우세요
              <br />
            </>
          )}
          {cards > 0 && (
            <>
              · 게시된 카드 <b>{cards}장</b> — 카드에서 게시를 내리세요
            </>
          )}
        </Blocked>
      ) : (
        <Note>
          하위 조직도 게시된 카드도 없습니다. 지워도 <b>카드는 사라지지 않습니다</b> —
          카드는 만든 사람의 개인 공간에 그대로 남습니다.
        </Note>
      )}

      {error && <Err>{error}</Err>}

      <Row>
        <Btn type="button" onClick={onClose}>
          취소
        </Btn>
        <Primary $danger type="button" onClick={confirm} disabled={busy || blocked}>
          {busy ? '삭제 중…' : '삭제'}
        </Primary>
      </Row>
    </Shell>
  )
}
