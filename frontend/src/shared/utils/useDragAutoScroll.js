/**
 * 드래그하는 동안 목록 가장자리에서 자동으로 스크롤한다.
 *
 * **브라우저는 HTML5 드래그 중에 휠 스크롤을 주지 않는다.** 그래서 항목이 스무
 * 개쯤 되면 아래쪽 변수를 집어 위로 올릴 방법이 없다 — 잡은 채로 화면 밖을
 * 향해도 목록이 따라오지 않아서, 한 번 놓고 스크롤하고 다시 잡기를 반복하게
 * 된다. 그 반복이 순서를 바꾸는 일 자체보다 오래 걸린다.
 *
 * 그래서 포인터가 위아래 가장자리에 들어오면 그쪽으로 밀어 준다. 가까울수록
 * 빠르게 — 가장자리에 딱 붙었을 때만 움직이면 조준이 어렵고, 일정한 속도로
 * 움직이면 한 칸만 올리고 싶을 때 지나쳐 버린다.
 *
 *     const scrollRef = useRef(null)
 *     useDragAutoScroll(scrollRef, draggingId !== null)
 *     ...
 *     <TabScroll ref={scrollRef}>
 *
 * `dragover` 를 **문서 전체**에서 듣는다. 목록 위에서만 들으면 포인터가 목록
 * 바깥으로 조금만 나가도 좌표가 끊겨 스크롤이 멈추는데, 위로 올리려면 대개
 * 위쪽 바깥으로 나가게 된다.
 */

import { useEffect, useRef } from 'react'

/** 가장자리로 인정하는 두께(px). 이보다 안쪽이면 스크롤하지 않는다. */
const EDGE = 56

/** 한 프레임에 움직일 최대 거리(px). 60fps 기준 초당 약 780px. */
const MAX_STEP = 13

export function useDragAutoScroll(scrollRef, active) {
  // 좌표를 state 가 아니라 ref 에 담는다. dragover 는 초당 수십 번 오는데
  // 그때마다 다시 그리면 드래그 중 화면이 눈에 띄게 버벅인다.
  const pointerY = useRef(null)
  const frame = useRef(null)

  useEffect(() => {
    if (!active) return undefined

    const onDragOver = (e) => {
      pointerY.current = e.clientY
    }

    const step = () => {
      const el = scrollRef.current
      const y = pointerY.current
      if (el && y != null) {
        const rect = el.getBoundingClientRect()
        let delta = 0

        if (y < rect.top + EDGE) {
          // 위 가장자리 — 가까울수록 크게. 위로 벗어나 있으면 최대 속도.
          const depth = Math.min(EDGE, rect.top + EDGE - y)
          delta = -Math.ceil((depth / EDGE) * MAX_STEP)
        } else if (y > rect.bottom - EDGE) {
          const depth = Math.min(EDGE, y - (rect.bottom - EDGE))
          delta = Math.ceil((depth / EDGE) * MAX_STEP)
        }

        if (delta !== 0) el.scrollTop += delta
      }
      frame.current = window.requestAnimationFrame(step)
    }

    // passive 로 둘 수 없다 — 좌표만 읽지만, 브라우저가 dragover 기본 동작을
    // 취소하지 않은 리스너를 만나면 드롭이 막히는 경우가 있다.
    document.addEventListener('dragover', onDragOver)
    frame.current = window.requestAnimationFrame(step)

    return () => {
      document.removeEventListener('dragover', onDragOver)
      if (frame.current != null) window.cancelAnimationFrame(frame.current)
      frame.current = null
      // 다음 드래그가 지난번 좌표로 시작하지 않게 지운다. 남겨 두면 잡자마자
      // 목록이 혼자 움직인다.
      pointerY.current = null
    }
  }, [active, scrollRef])
}

export default useDragAutoScroll
