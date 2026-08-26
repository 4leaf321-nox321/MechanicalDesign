/**
 * 도해가 쓰는 기하 — 좌표는 **SVG 방식(y 가 아래로)** 이고 단위는 mm 다.
 *
 * 도해는 「이 계산이 어떤 형상에 대한 것인가」 를 보여 준다. 실물 도면이 아니라
 * 유형을 말하는 그림이라, 값이 바뀌면 **비율이 따라 바뀌어야** 뜻이 있다.
 *
 * ## 비율을 속이지 않는다
 *
 * 값이 극단이면 그림이 읽기 어려워진다 — 축 지름 500 에 키 폭 4 면 키가 실선
 * 하나로 보인다. 그때 비율을 슬쩍 부풀려 「보기 좋게」 만들고 싶어지는데, 그러면
 * 그림이 거짓말을 한다. 묻힘키 검토에서 사람이 확인하려는 것이 정확히 그 비율이라
 * 부풀린 그림은 검토를 무력하게 만든다.
 *
 * 그래서 **언제나 실제 비율로 그린다.** 대신 값이 없거나 말이 안 될 때는 그리지
 * 않고 그 사실을 말한다.
 *
 * ## 글자 크기
 *
 * viewBox 로 확대·축소되므로 글자와 화살표도 함께 커진다. 그래서 크기를 도면
 * 전체 크기에 비례해 정한다 — 축 지름이 20 이든 2000 이든 화면에서 같아 보인다.
 */

/** 그림 요소의 뜻. 색은 그리는 쪽이 정한다 — 도해는 색을 모른다. */
export const ROLE = {
  body: 'body',        // 재료의 겉선
  cut: 'cut',          // 잘린 면 (해칭)
  center: 'center',    // 중심선
  hidden: 'hidden',    // 숨은선 — 이 뒤에 있어 안 보이는 모서리
  front: 'front',      // 앞에 있어 뒤를 가린다 (단면을 안 치는 체결물 등)
  ghost: 'ghost',      // 참고선 (연장선 등)
}

/**
 * 원 하나. `inner` 를 주면 **도넛**이 된다 — 속 빈 축의 단면.
 *
 * 속이 찼는지 비었는지는 계산식을 통째로 바꾸는 구분이라, 그림이 반드시 말해야
 * 한다. 해칭이 안쪽을 비켜 가는 것으로 말한다.
 */
export const circle = (cx, cy, r, role = ROLE.body, inner = 0) => ({
  type: 'circle', cx, cy, r, role, inner,
})
/**
 * 사각형 하나.
 *
 * `flip` 은 해칭을 반대 기울기로 친다. **맞붙은 다른 부재**를 뜻하는 제도 관례라,
 * 겹치기 이음처럼 같은 두께의 판 둘이 맞닿을 때 이것 하나로 경계가 읽힌다.
 */
export const rect = (x, y, w, h, role = ROLE.body, flip = false) => ({
  type: 'rect', x, y, w, h, role, flip,
})
export const line = (x1, y1, x2, y2, role = ROLE.body) => ({ type: 'line', x1, y1, x2, y2, role })
export const path = (d, role = ROLE.body) => ({ type: 'path', d, role })

/**
 * 치수 하나.
 *
 * `value` 를 따로 받는 이유: 이름표는 `Ø{}` 처럼 꾸며지지만 **정렬과 자릿수는
 * 숫자로** 정해야 한다. 이름표 문자열에서 숫자를 도로 뽑아 쓰면 형식이 바뀔
 * 때마다 어긋난다.
 */
/**
 * `along` 은 이름표를 치수선의 어느 자리에 둘까(0~1, 기본은 한가운데).
 *
 * 세로 치수를 여러 겹 쌓으면 — 베어링의 안지름·바깥지름처럼 — 이름표가 서로
 * 부딪힌다. 치수선 사이를 글자가 들어갈 만큼 벌리면 그림이 옆으로 늘어지므로,
 * 도면에서는 **높이를 어긋나게** 두어 푼다.
 */
export function dim(from, to,
                    { offset = 0, label, value, unit, symbol, along = 0.5,
                      kind = 'linear' } = {}) {
  return { type: 'dim', kind, from, to, offset, label, value, unit, symbol, along }
}

/**
 * 흐름·하중처럼 **형상이 아닌 것**을 가리키는 화살표.
 *
 * 치수와 따로 둔다. 치수는 「이만큼이다」 이고 이것은 「이쪽으로 간다」 라, 같은
 * 것으로 그리면 유량 화살표가 길이 치수처럼 읽힌다.
 */
export const flow = (x1, y1, x2, y2, label) => ({
  type: 'flow', x1, y1, x2, y2, label,
})

/**
 * 비트는 힘 — 축 둘레를 도는 화살표.
 *
 * 흐름 화살표와 마찬가지로 **형상이 아니다.** 축 그림만 보면 그냥 봉이라, 무엇이
 * 이 축을 비틀고 있는지는 그림이 따로 말해야 한다.
 *
 * `sweep` 이 도는 각도(라디안). 한 바퀴를 다 돌면 시작과 끝이 겹쳐 화살표가
 * 어디서 끝나는지 안 보이므로 늘 조금 열어 둔다.
 */
export const moment = (cx, cy, r, label, sweep = Math.PI * 1.55) => ({
  type: 'moment', cx, cy, r, label, sweep,
})

/**
 * 자리 표시 — 그 지점이 무엇인지 글자로 짚는다.
 *
 * 치수와 다르다. 치수는 두 점 사이를 재는 것이고 이것은 **한 자리를 가리키는**
 * 것이다. 비스듬한 거리(필릿 용접의 목두께 같은)는 치수선으로 그리면 화살표와
 * 보조선이 도리어 그림을 덮는데, 짚는 것만으로 뜻이 다 전해지는 경우가 있다.
 */
export const tag = (x, y, text, anchor = 'middle') => ({
  type: 'tag', x, y, text, anchor,
})

/**
 * 파단선 — 「이 사이는 줄여 그렸다」.
 *
 * 관처럼 가늘고 긴 것은 실제 비율로 그리면 선 한 줄이 된다. 그렇다고 슬쩍
 * 짧게 그리면 그림이 거짓말을 한다. 실제 도면이 쓰는 방법이 이 기호다 —
 * **줄여 그렸다는 사실 자체를 그림에 적는다.** 치수는 진짜 값을 그대로 적으므로
 * 읽는 사람이 속지 않는다.
 */
export function breakLine(x, halfHeight, kink) {
  const h = halfHeight
  return path(
    `M ${x} ${-h} L ${x + kink} ${-h * 0.5} L ${x - kink} ${0}`
    + ` L ${x + kink} ${h * 0.5} L ${x} ${h}`,
    ROLE.ghost,
  )
}

/** 중심선을 그린다. 지름 치수가 어디서 오는지 눈으로 잇는 선이다. */
export function crosshair(cx, cy, r, over = 1.15) {
  const e = r * over
  return [
    line(cx - e, cy, cx + e, cy, ROLE.center),
    line(cx, cy - e, cx, cy + e, ROLE.center),
  ]
}

/** 그린 것들을 다 담는 사각형. viewBox 를 여기서 만든다. */
export function bounds(shapes) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const see = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }

  for (const s of shapes) {
    if (s.type === 'circle') {
      see(s.cx - s.r, s.cy - s.r)
      see(s.cx + s.r, s.cy + s.r)
    } else if (s.type === 'rect') {
      see(s.x, s.y)
      see(s.x + s.w, s.y + s.h)
    } else if (s.type === 'line' || s.type === 'flow') {
      see(s.x1, s.y1)
      see(s.x2, s.y2)
    } else if (s.type === 'path') {
      // 경로도 **세어야 한다.** 빠뜨리면 경로로만 그린 형상이 상자 밖으로
      // 나가는데, 대개는 치수선이나 중심선이 우연히 자리를 덮어 안 보인다 —
      // 그러다 경로뿐인 자리(휜 판 스프링의 꼭대기)에서 그림이 잘린다.
      //
      // 여기서 쓰는 명령은 M·L·Q·A·Z 뿐이다. M·L·Q 는 숫자가 전부 좌표쌍이고
      // (Q 의 제어점은 곡선 밖일 수 있지만 곡선을 늘 감싸므로 넓어지는 쪽 오차다),
      // A 는 일곱 값 중 마지막 둘만 좌표다 — 반지름·플래그를 좌표로 읽으면
      // 원점 근처가 상자에 끼어든다.
      const re = /([MLQA])([^MLQAZ]*)/g
      let m
      while ((m = re.exec(s.d)) !== null) {
        const nums = (m[2].match(/-?\d*\.?\d+(?:e[+-]?\d+)?/gi) || []).map(Number)
        if (m[1] === 'A') {
          for (let i = 0; i + 6 < nums.length; i += 7) see(nums[i + 5], nums[i + 6])
        } else {
          for (let i = 0; i + 1 < nums.length; i += 2) see(nums[i], nums[i + 1])
        }
      }
    } else if (s.type === 'tag') {
      see(s.x, s.y)
    } else if (s.type === 'moment') {
      see(s.cx - s.r, s.cy - s.r)
      see(s.cx + s.r, s.cy + s.r)
    } else if (s.type === 'dim') {
      // 치수선은 물체 **바깥**으로 나간다. 안 세면 글자가 잘린다.
      const [ax, ay] = s.from
      const [bx, by] = s.to
      const vertical = Math.abs(bx - ax) < Math.abs(by - ay)
      see(ax, ay)
      see(bx, by)
      if (vertical) {
        see(ax + s.offset, ay)
        see(bx + s.offset, by)
      } else {
        see(ax, ay + s.offset)
        see(bx, by + s.offset)
      }
    }
  }

  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 1, h: 1 }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/**
 * 부호가 **뜻을 갖는** 값. 0 도 음수도 그대로 돌려준다.
 *
 * `positive` 와 나눠 둔 이유: 길이나 지름은 음수면 형상이 안 되므로 없는 값으로
 * 보는 게 맞지만, 응력은 음수가 압축이고 0 이 무응력이라 **둘 다 정상**이다.
 * 여기에 `positive` 를 쓰면 압축응력이 조용히 「값 없음」 으로 바뀌어, 도해가
 * 인장만 걸린 것처럼 그린다.
 */
export function finite(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** 값이 도해를 그릴 수 있는 숫자인가. 0 과 음수는 형상이 아니다. */
export function positive(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}
