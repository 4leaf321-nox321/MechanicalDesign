/**
 * 지점 기호 — 핀·굴림·고정.
 *
 * 보와 기둥이 **같은 기호**를 쓴다. 두 곳에 따로 그리면 언젠가 한쪽만 손보게
 * 되고, 그때 같은 뜻의 기호가 두 모양이 된다 — 도면에서 기호가 흔들리는 것은
 * 글자가 흔들리는 것과 같다.
 *
 * 방향을 받는 이유: 보는 아래에서 받치고 기둥은 아래위에서 받친다. 모양은 같고
 * 놓이는 쪽만 다르다.
 *
 *     dir = [0, 1]   부재 아래에 받침이 있다 (SVG 는 y 가 아래로)
 *     dir = [0, -1]  부재 위에 있다
 */

import { ROLE, line, path, rect } from './geometry'

/** `dir` 을 단위벡터로. 대충 준 값에도 모양이 안 망가지게. */
function unit([x, y]) {
  const len = Math.hypot(x, y) || 1
  return [x / len, y / len]
}

/**
 * 핀 지점 — 삼각형과 바닥선. **회전은 막고 이동만 막는다**는 뜻이다.
 */
export function pin(x, y, size, dir = [0, 1]) {
  const [dx, dy] = unit(dir)
  const [px, py] = [-dy, dx]                 // 부재를 따라가는 방향
  const bx = x + dx * size * 1.5
  const by = y + dy * size * 1.5
  return [
    path(`M ${x} ${y} L ${bx + px * size} ${by + py * size}`
      + ` L ${bx - px * size} ${by - py * size} Z`),
    line(bx + px * size * 1.5, by + py * size * 1.5,
         bx - px * size * 1.5, by - py * size * 1.5),
  ]
}

/**
 * 굴림 지점 — 핀에 선을 하나 더. 그 한 줄이 **「이쪽은 늘어날 수 있다」** 는
 * 뜻이라, 빼먹으면 양쪽이 다 고정된 다른 구조가 된다.
 */
export function roller(x, y, size, dir = [0, 1]) {
  const [dx, dy] = unit(dir)
  const [px, py] = [-dy, dx]
  const fx = x + dx * size * 2.1
  const fy = y + dy * size * 2.1
  return [
    ...pin(x, y, size, dir),
    line(fx + px * size * 1.5, fy + py * size * 1.5,
         fx - px * size * 1.5, fy - py * size * 1.5),
  ]
}

/**
 * 고정단 — 해칭한 벽. **회전까지 막는다**는 뜻이고, 그 차이가 좌굴하중을 네 배로
 * 바꾼다.
 */
export function fixed(x, y, size, dir = [0, 1]) {
  const [dx, dy] = unit(dir)
  const thick = size * 0.9
  const long = size * 2.4
  // 부재에 수직인 쪽이 길고, 나란한 쪽이 두껍다.
  const w = Math.abs(dx) > Math.abs(dy) ? thick : long * 2
  const h = Math.abs(dx) > Math.abs(dy) ? long * 2 : thick
  return [rect(x - w / 2 + dx * thick / 2, y - h / 2 + dy * thick / 2,
               w, h, ROLE.cut)]
}
