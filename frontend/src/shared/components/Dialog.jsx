/**
 * 묻는 창 — `window.confirm` · `window.prompt` 를 대신한다.
 *
 * 브라우저 기본 대화상자는 **무엇을 하는 중인지 담을 자리가 없다.** 제목도 없고,
 * 줄바꿈은 되지만 강조가 안 되고, 위험한 일과 그냥 확인하는 일이 똑같이 생겼다.
 * 지우는 창과 이름 묻는 창이 구분되지 않으면 사람은 둘 다 대충 누른다.
 *
 * ## 약속(Promise)으로 돌려준다
 *
 * ```
 * if (!await confirm({ ... })) return
 * ```
 *
 * `window.confirm` 과 **같은 모양으로 읽힌다.** 이게 중요하다 — 콜백이나 상태
 * 기계로 만들면 부르는 곳마다 「열기 → 기다리기 → 닫기」 세 조각으로 흩어지고,
 * 그러면 아무도 안 바꾸고 `window.confirm` 이 그대로 남는다.
 *
 * ## 위험한 것은 다르게 생겨야 한다
 *
 * `tone: 'danger'` 면 단추가 지움 색이 되고 **처음 손이 가는 곳이 「취소」다.**
 * 기본 대화상자는 늘 「확인」에 손이 가 있어서, Enter 를 습관적으로 누르면
 * 지워진다. 되돌릴 수 없는 일에서는 그 기본값이 틀렸다.
 *
 * 그리고 단추에 **무엇을 하는지** 적는다. 「확인」 이 아니라 「휴지통으로」다.
 * 창을 안 읽고 단추만 보는 사람에게 마지막으로 말할 기회가 거기뿐이다.
 */

import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react'
import styled from 'styled-components'

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: hsl(var(--overlay) / 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
`

const Box = styled.div`
  background: hsl(var(--surface));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  width: min(440px, 92vw);
  box-shadow: var(--shadow-lg);
  padding: 22px 24px 18px;
`

const Title = styled.h3`
  margin: 0 0 6px;
  font-size: 1.02rem;
  color: hsl(var(--fg));
`

/** 줄바꿈을 살린다. 「무엇이 함께 사라지는가」 가 대개 둘째 줄에 온다. */
const Body = styled.p`
  margin: 0;
  font-size: 0.86rem;
  color: hsl(var(--fg-muted));
  line-height: 1.6;
  white-space: pre-wrap;
`

const Field = styled.input`
  width: 100%;
  margin-top: 14px;
  padding: 9px 11px;
  border: 1px solid hsl(var(--border-strong));
  border-radius: var(--radius-sm);
  background: hsl(var(--surface));
  color: hsl(var(--fg));
  font-size: 0.9rem;
  font-family: inherit;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: hsl(var(--primary));
  }
`

const Row = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
`

const Btn = styled.button`
  height: 34px;
  padding: 0 14px;
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  font-family: inherit;
  cursor: pointer;
  border: 1px solid hsl(var(--border-strong));
  background: hsl(var(--surface));
  color: hsl(var(--fg-muted));

  &:hover {
    background: hsl(var(--surface-2));
    color: hsl(var(--fg));
  }
`

const Go = styled(Btn)`
  border-color: ${p => (p.$danger ? 'hsl(var(--danger))' : 'hsl(var(--primary))')};
  background: ${p => (p.$danger ? 'hsl(var(--danger))' : 'hsl(var(--primary))')};
  color: hsl(var(--solid-fg));

  &:hover {
    opacity: 0.9;
    background: ${p => (p.$danger ? 'hsl(var(--danger))' : 'hsl(var(--primary))')};
    color: hsl(var(--solid-fg));
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`

const DialogContext = createContext(null)

function Ask({ ask, onDone }) {
  const [text, setText] = useState(ask.initial ?? '')
  const field = useRef(null)
  const cancel = useRef(null)

  useEffect(() => {
    // 위험한 일에서는 「취소」에 손을 둔다. Enter 를 습관적으로 누르는 사람이
    // 되돌릴 수 없는 일을 저지르지 않도록.
    if (ask.kind === 'prompt') field.current?.select()
    else if (ask.tone === 'danger') cancel.current?.focus()
  }, [ask])

  const done = (value) => onDone(value)
  const submit = () => done(ask.kind === 'prompt' ? text : true)

  return (
    <Backdrop onClick={() => done(ask.kind === 'prompt' ? null : false)}>
      <Box
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') done(ask.kind === 'prompt' ? null : false)
          // 여러 줄 입력이 아니므로 Enter 는 곧 확인이다.
          if (e.key === 'Enter' && ask.kind === 'prompt') submit()
        }}
      >
        <Title>{ask.title}</Title>
        {ask.body && <Body>{ask.body}</Body>}

        {ask.kind === 'prompt' && (
          <Field
            ref={field}
            autoFocus
            value={text}
            placeholder={ask.placeholder || ''}
            onChange={(e) => setText(e.target.value)}
          />
        )}

        <Row>
          {ask.kind !== 'alert' && (
            <Btn ref={cancel}
                 onClick={() => done(ask.kind === 'prompt' ? null : false)}>
              {ask.cancelLabel || '취소'}
            </Btn>
          )}
          <Go $danger={ask.tone === 'danger'}
              autoFocus={ask.kind === 'confirm' && ask.tone !== 'danger'}
              disabled={ask.kind === 'prompt' && ask.required !== false
                && !text.trim()}
              onClick={submit}>
            {ask.confirmLabel || '확인'}
          </Go>
        </Row>
      </Box>
    </Backdrop>
  )
}

/**
 * 한 번에 하나만 띄운다. 겹쳐 띄우면 어느 창에 답한 것인지 알 수 없고,
 * 뒤엣것이 앞엣것을 가려 무엇을 묻는지도 안 보인다.
 */
export function DialogProvider({ children }) {
  const [ask, setAsk] = useState(null)
  const resolver = useRef(null)

  const open = useCallback((next) => new Promise((resolve) => {
    // 앞의 창이 아직 있으면 그것부터 닫는다 — 답을 기다리던 쪽이 영영 안 깨어나면
    // 그 자리의 코드가 멈춘 채로 남는다.
    resolver.current?.(next.kind === 'prompt' ? null : false)
    resolver.current = resolve
    setAsk(next)
  }), [])

  const done = useCallback((value) => {
    setAsk(null)
    const resolve = resolver.current
    resolver.current = null
    resolve?.(value)
  }, [])

  const api = useMemo(() => ({
    /** `true` / `false`. */
    confirm: (opts) => open({ kind: 'confirm', ...opts }),
    /** 적은 글자, 또는 취소하면 `null`. */
    prompt: (opts) => open({ kind: 'prompt', ...opts }),
    /** 알리기만. 늘 `true`. */
    alert: (opts) => open({ kind: 'alert', ...opts }),
  }), [open])

  return (
    <DialogContext.Provider value={api}>
      {children}
      {ask && <Ask ask={ask} onDone={done} />}
    </DialogContext.Provider>
  )
}

export function useDialog() {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('DialogProvider 안에서만 쓸 수 있습니다.')
  return ctx
}

export default DialogProvider
