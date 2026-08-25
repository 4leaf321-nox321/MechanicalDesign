import { describe, expect, it } from 'vitest'
import { edgeFlow } from './edgeFlow'

describe('edgeFlow', () => {
  it('아직 안 돌렸으면 값도 없고 죽은 것도 아니다', () => {
    // 이 자리를 틀려서 화면이 통째로 죽었었다 — "값이 흐른다" 로 떨어지면
    // 없는 칸에서 value 를 읽는다.
    expect(edgeFlow(undefined, false)).toEqual({ flowing: false, dead: false })
  })

  it('돌렸는데 값이 없으면 죽은 선이다', () => {
    expect(edgeFlow(undefined, true)).toEqual({ flowing: false, dead: true })
  })

  it('계산이 실패한 칸은 흐른 것이 아니다', () => {
    // 값 자리에 뭐가 들어 있어도 error 가 있으면 못 믿는다.
    expect(edgeFlow({ value: 0, error: '0 으로 나눌 수 없습니다' }, true))
      .toEqual({ flowing: false, dead: true })
  })

  it('값이 있으면 흐른 것이다', () => {
    expect(edgeFlow({ value: 180000 }, true)).toEqual({ flowing: true, dead: false })
  })

  it('0 도 값이다', () => {
    // 0 을 "값이 없다" 로 보면 멀쩡한 선이 죽은 선으로 그려진다.
    expect(edgeFlow({ value: 0 }, true)).toEqual({ flowing: true, dead: false })
  })
})
