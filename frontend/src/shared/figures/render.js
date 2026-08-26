/**
 * 도해를 SVG 로 그린다 — 모든 도해가 **이 한 곳**을 쓴다.
 *
 * 도해 모듈은 기하만 내놓고 색도 선 굵기도 모른다. 도해마다 자기 스타일을
 * 들고 있으면 넷을 나란히 놓았을 때 넷이 다 달라 보이고, 판(테마)을 바꿀 때
 * 넷을 다 고쳐야 한다.
 *
 * ## 크기를 도면에 비례해 정한다
 *
 * viewBox 로 그리므로 글자와 화살표도 도면과 함께 커진다. 축 지름이 20 이든
 * 2000 이든 화면에서 같아 보이려면 **도면 크기에 비례**해 정해야 한다.
 *
 * ## 왜 문자열을 만들어 내놓는가
 *
 * React 로 바로 그리지 않고 요소 서술을 내놓는다. 그래야 시험이 「Ø40 이 정말
 * 40 자리에 그려졌나」 를 DOM 없이 숫자로 확인할 수 있다 — 그림 기능에서 눈으로만
 * 확인하면 값이 어긋나도 그럴듯해 보인다.
 */

import { ROLE } from './geometry'

/** 도면 크기 대비 비율. 한 곳에 모아 두어야 넷이 같아 보인다. */
export const SCALE = {
  stroke: 1 / 260,
  thin: 1 / 420,
  font: 1 / 26,
  arrow: 1 / 65,
  gap: 1 / 90,        // 치수 보조선이 물체에서 떨어지는 거리
}

export const PAD = 0.12   // viewBox 여백 (도면 크기 대비)

/** 이 도면에서 쓸 크기들. `box` 는 `bounds()` 가 준 것. */
/**
 * 글자를 얼마나 크게 쓸까.
 *
 * 긴 변만 보고 정하면 **길쭉한 그림에서 글자가 형상만 해진다** — 두께 10 을 재는
 * 치수 글자가 10 만 하면 숫자인지 부재인지 구별이 안 간다. 그렇다고 짧은 변만
 * 보면 납작한 그림에서 글자가 보이지도 않게 작아진다.
 *
 * 둘의 기하평균을 쓰되 짧은 쪽을 긴 쪽의 절반까지만 인정한다. 네모난 그림은
 * 예전 그대로이고(짧은 변 = 긴 변), 길쭉할수록만 줄어든다.
 */
function textSpan(box) {
  const span = Math.max(box.w, box.h) || 1
  const short = Math.max(Math.min(box.w, box.h), span / 2)
  return Math.sqrt(span * short)
}

export function metrics(box) {
  const span = Math.max(box.w, box.h) || 1
  return {
    span,
    stroke: span * SCALE.stroke,
    thin: span * SCALE.thin,
    font: textSpan(box) * SCALE.font,
    arrow: span * SCALE.arrow,
    gap: span * SCALE.gap,
  }
}

/**
 * 그림이 들어갈 창.
 *
 * **치수 글자가 차지할 자리를 따로 센다.** `bounds()` 는 선이 지나가는 자리까지만
 * 아는데, 글자는 치수선에서 더 바깥으로 나간다 — 세로 치수는 왼쪽으로, 그것도
 * 글자 수만큼. 안 세면 `Ø0.1 m` 의 앞글자가 잘려 나가고, 잘린 글자는 「값이
 * 이상한가」 로 읽힌다.
 *
 * 글자 폭은 재지 않고 어림한다. 정확히 재려면 그려 본 뒤에야 알 수 있는데, 그
 * 값으로 창을 다시 정하면 창이 또 글자 크기를 바꿔 서로 물린다. 넉넉히 잡는 쪽이
 * 낫다 — 여백이 조금 남는 것은 아무도 안 다친다.
 */
export function viewBox(box, dims = [], tags = []) {
  const span = Math.max(box.w, box.h) || 1
  const font = textSpan(box) * SCALE.font    // metrics 와 같은 자를 써야 한다
  const pad = span * PAD

  let left = 0
  let right = 0
  for (const d of dims) {
    const vertical = Math.abs(d.to[0] - d.from[0]) < Math.abs(d.to[1] - d.from[1])
    if (!vertical) continue
    // 글자 하나가 대략 폰트의 0.62 배. 한글이 섞여도 이 정도면 덮인다.
    const room = labelOf(d).length * font * 0.62
    if (d.offset < 0) left = Math.max(left, room)
    else right = Math.max(right, room)
  }

  // 이름표도 글자 폭만큼 밖으로 나간다. 치수와 달리 **어느 쪽으로 나갈지가
  // 맞춤(anchor)에 달려** 있어, 글자가 실제로 어디까지 가는지 따져 넘친 만큼만
  // 넓힌다. 안 세면 「고정 – 자유」 의 뒷글자가 창 밖으로 잘려 나간다.
  for (const t of tags) {
    const room = String(t.text ?? '').length * font * 0.62
    const from = t.anchor === 'end' ? t.x - room
      : (t.anchor === 'middle' ? t.x - room / 2 : t.x)
    left = Math.max(left, box.x - from)
    right = Math.max(right, (from + room) - (box.x + box.w))
  }

  return {
    x: box.x - pad - left,
    y: box.y - pad,
    w: box.w + pad * 2 + left + right,
    h: box.h + pad * 2,
    toString() {
      return `${this.x} ${this.y} ${this.w} ${this.h}`
    },
  }
}

/** 숫자를 사람이 읽을 자리수로. 치수는 소수점이 길면 그림을 덮는다. */
export function short(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  if (Math.abs(n) >= 100) return String(Math.round(n))
  if (Math.abs(n) >= 10) return String(Math.round(n * 10) / 10)
  return String(Math.round(n * 100) / 100)
}

/**
 * `Ø{}` + 40 + 'mm' → `Ø40 mm`. 단위가 없으면 숫자만.
 *
 * **값이 없으면 기호를 적는다** — `Ø40 mm` 대신 `Ød`. 값이 아직 없을 때 숫자를
 * 지어내면 그림이 거짓말을 하고, 그렇다고 치수를 통째로 빼면 「어디가 무엇인지」
 * 를 못 말한다. 교과서 그림이 하는 방식이 정확히 이것이다.
 */
export function labelOf(d) {
  if (d.value === null || d.value === undefined) {
    return (d.label || '{}').replace('{}', d.symbol || '?')
  }
  const text = (d.label || '{}').replace('{}', short(d.value))
  return d.unit ? `${text} ${d.unit}` : text
}

/**
 * 치수 하나를 선·화살표·글자로 푼다.
 *
 * 세로/가로는 두 끝점으로 **판단한다** — 도해가 따로 말하지 않아도 되게. 도해마다
 * 방향을 적게 하면 언젠가 하나가 빠지고, 그때 치수선이 물체를 가로지른다.
 */
export function dimParts(d, m) {
  const [ax, ay] = d.from
  const [bx, by] = d.to
  const vertical = Math.abs(bx - ax) < Math.abs(by - ay)

  // 치수선은 물체에서 offset 만큼 떨어진 자리에 긋고, 보조선으로 물체와 잇는다.
  const lx = vertical ? ax + d.offset : ax
  const ly = vertical ? ay : ay + d.offset
  const mx = vertical ? bx + d.offset : bx
  const my = vertical ? by : by + d.offset

  // 보조선은 물체에 딱 붙이지 않는다 — 겹치면 어느 선이 치수인지 안 보인다.
  const away = Math.sign(d.offset || 1) * m.gap
  const ext = vertical
    ? [[ax + away, ay, lx + away * 2, ly], [bx + away, by, mx + away * 2, my]]
    : [[ax, ay + away, lx, ly + away * 2], [bx, by + away, mx, my + away * 2]]

  // 치수 폭이 화살표 둘보다 좁으면 화살표를 **바깥으로** 돌린다. 안 그러면
  // 화살촉 둘이 겹쳐 뭉개진다 — 키 폭처럼 작은 치수에서 늘 일어난다.
  const length = vertical ? Math.abs(my - ly) : Math.abs(mx - lx)
  const outside = length < m.arrow * 2.4

  return {
    vertical,
    line: [lx, ly, mx, my],
    ext,
    outside,
    text: {
      // 기본은 한가운데. 쌓인 치수는 서로 어긋나게 두어 이름표가 안 부딪힌다.
      x: lx + (mx - lx) * (d.along ?? 0.5),
      y: ly + (my - ly) * (d.along ?? 0.5),
      // 세로 치수는 글자를 선 옆에, 가로 치수는 선 위/아래에 둔다.
      dx: vertical ? m.font * 0.45 * Math.sign(d.offset || 1) : 0,
      dy: vertical ? m.font * 0.35 : (d.offset < 0 ? -m.font * 0.45 : m.font * 0.95),
      anchor: vertical ? (d.offset < 0 ? 'end' : 'start') : 'middle',
      value: labelOf(d),
    },
  }
}

/** 화살촉 하나를 삼각형 path 로. `dir` 은 +1/-1. */
export function arrow(x, y, vertical, dir, m) {
  const a = m.arrow
  const w = a * 0.32
  return vertical
    ? `M ${x} ${y} L ${x - w} ${y + a * dir} L ${x + w} ${y + a * dir} Z`
    : `M ${x} ${y} L ${x + a * dir} ${y - w} L ${x + a * dir} ${y + w} Z`
}

/** 잘린 면 해칭. 45° 평행선을 사각형 안에 채운다. */
export function hatch(r, m, flip = false) {
  const step = m.span / 42
  const out = []
  // x + y 가 일정한 선들. 사각형을 가로지르는 구간만 남긴다.
  const from = r.x - r.h
  const to = r.x + r.w
  for (let s = from; s <= to; s += step) {
    const p1 = [Math.max(s, r.x), s < r.x ? r.y + (r.x - s) : r.y]
    const x2 = Math.min(s + r.h, r.x + r.w)
    const p2 = [x2, r.y + (x2 - s)]
    if (p2[1] < r.y || p1[1] > r.y + r.h) continue
    if (p2[0] <= p1[0]) continue
    out.push([p1[0], p1[1], p2[0], p2[1]])
  }
  if (!flip) return out
  // 사각형 안에서 좌우로 되접는다. 같은 자리에 기울기만 반대인 빗금이 된다.
  const mid = r.x * 2 + r.w
  return out.map(([x1, y1, x2, y2]) => [mid - x1, y1, mid - x2, y2])
}

export { ROLE }
