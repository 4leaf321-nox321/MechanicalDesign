/**
 * 도해를 그린다 — 카드의 값으로.
 *
 * 도해 모듈은 기하만 내놓고 색을 모른다. 색을 여기서만 정해야 넷을 나란히 놓아도
 * 같아 보이고, 판(테마)이 바뀔 때 한 곳만 고치면 된다.
 *
 * **못 그릴 때 빈 자리로 두지 않는다.** 값이 없어서인지, 도해를 모르는 것인지,
 * 형상이 성립하지 않는 것인지를 말한다 — 빈 상자는 셋을 구분해 주지 못하고,
 * 「그림이 안 나온다」 는 물음에 아무도 답할 수 없게 된다.
 */

import React, { useMemo } from 'react'
import styled from 'styled-components'

import { figureOf, valuesFor } from '../figures'
import { ROLE } from '../figures/geometry'
import { arrow, dimParts, hatch, metrics, viewBox } from '../figures/render'

const Box = styled.figure`
  margin: 0;
  padding: 10px 8px 6px;
  background: hsl(var(--surface));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);

  svg {
    display: block;
    width: 100%;
    height: auto;
  }
`

const Caption = styled.figcaption`
  margin-top: 6px;
  font-size: 0.78rem;
  color: hsl(var(--fg-subtle));
  text-align: center;
`

/** 못 그린 이유. 조용히 비우면 「그림이 왜 안 나오지」 에 아무도 답할 수 없다. */
const Why = styled.div`
  padding: 18px 14px;
  text-align: center;
  font-size: 0.85rem;
  line-height: 1.6;
  /* 이유를 제목과 설명 두 줄로 적는다. 안 나누면 「아직 그릴 수 없습니다 키
     폭(b), 키 길이(L) 의 값이 필요합니다」 가 한 줄로 붙어 읽기 나쁘다. */
  white-space: pre-line;
  color: hsl(var(--fg-subtle));
  background: hsl(var(--surface-2));
  border: 1px dashed hsl(var(--border-strong));
  border-radius: var(--radius);
`

const Note = styled.p`
  margin: 4px 0 0;
  font-size: 0.75rem;
  /* 「예시 형상」 은 눈에 띄어야 한다 — 못 보고 지나치면 보기 비율을 자기
     설계의 비율로 읽는다. 나머지 알림은 조용해도 된다. */
  color: ${p => (p.$warn ? 'hsl(var(--warn))' : 'hsl(var(--fg-subtle))')};
  font-weight: ${p => (p.$warn ? 600 : 400)};
  text-align: center;
`

/**
 * 색은 뜻이다.
 *
 *   겉선   재료의 경계
 *   중심선 대칭축 — 파선이라 겉선과 안 헷갈린다
 *   치수   형상이 아니라 **잰 값**. 형상과 같은 색이면 어느 선이 물건인지 모른다
 */
const PAINT = {
  [ROLE.body]: 'hsl(var(--fg))',
  [ROLE.cut]: 'hsl(var(--fg))',
  [ROLE.center]: 'hsl(var(--info))',
  [ROLE.hidden]: 'hsl(var(--fg-subtle))',
  [ROLE.front]: 'hsl(var(--fg))',
  [ROLE.ghost]: 'hsl(var(--fg-subtle))',
  dim: 'hsl(var(--accent))',
  flow: 'hsl(var(--info))',
  fill: 'hsl(var(--surface-2))',
  surface: 'hsl(var(--surface))',
}

/**
 * 어떤 역할이 속을 채우나.
 *
 * 모양별로 따로 판단하면 `front` 가 사각형에서만 뒤를 가리고
 * 곡선에서는 비치는 일이 생긴다 — 같은 역할이 모양에 따라 다른 뜻이 되면
 * 그림이 거짓말을 하게 된다. 한 군데서 정한다.
 */
function fillFor(role) {
  if (role === ROLE.cut) return PAINT.fill      // 잘린 면 — 재료가 드러난 자리
  if (role === ROLE.front) return PAINT.surface // 앞에 놓인 것 — 해칭 없이 가리기만
  return 'none'
}

/** 원(또는 도넛)을 path 로. 중공이면 안쪽 원을 반대로 돌려 가운데를 비운다. */
function ring(s) {
  const arc = (r, sweep) => `M ${s.cx - r} ${s.cy}`
    + ` a ${r} ${r} 0 1 ${sweep} ${r * 2} 0`
    + ` a ${r} ${r} 0 1 ${sweep} ${-r * 2} 0 Z`
  return s.inner > 0 ? `${arc(s.r, 1)} ${arc(s.inner, 0)}` : arc(s.r, 1)
}

function Shape({ s, m }) {
  const stroke = PAINT[s.role] || PAINT[ROLE.body]
  const thin = s.role === ROLE.center || s.role === ROLE.ghost
    || s.role === ROLE.hidden
  const width = thin ? m.thin : m.stroke
  // 중심선은 길게-짧게, 숨은선은 고르게. 관례라 다르게 그리면 뜻이 안 읽힌다.
  let dash
  if (s.role === ROLE.center) {
    dash = `${m.span / 28} ${m.span / 90} ${m.span / 220} ${m.span / 90}`
  } else if (s.role === ROLE.hidden) {
    dash = `${m.span / 55} ${m.span / 110}`
  }

  if (s.type === 'circle') {
    const cut = s.role === ROLE.cut
    if (!cut) {
      return <circle cx={s.cx} cy={s.cy} r={s.r} fill="none"
                     stroke={stroke} strokeWidth={width} strokeDasharray={dash} />
    }
    // 잘린 단면은 **해칭한다.** 속이 찼는지 비었는지가 계산식을 통째로 바꾸는데,
    // 테두리만 그리면 속 빈 축의 안쪽 원이 그냥 다른 원으로 보인다.
    //
    // 빗금을 원 모양으로 자르는 것은 clipPath 에 맡긴다. 손으로 잘라 내면 원과
    // 직선의 교점을 매번 풀어야 하고, 중공이면 안쪽까지 빼야 한다.
    const id = `cut-${s.cx}-${s.cy}-${s.r}-${s.inner || 0}`.replace(/\./g, '_')
    const lines = []
    const step = m.span / 42
    for (let t = -s.r * 2; t <= s.r * 2; t += step) {
      lines.push([s.cx + t, s.cy - s.r, s.cx + t + s.r * 2, s.cy + s.r])
    }
    return (
      <g>
        <defs>
          <clipPath id={id}>
            {/* 바깥 원에서 안쪽 원을 뺀다 — evenodd 가 가운데를 비워 준다. */}
            <path fillRule="evenodd" d={ring(s)} />
          </clipPath>
        </defs>
        {/* 잘린 면은 **속이 찬다.** 테두리만 두면 뒤에 있는 선이 재료를 뚫고
            지나가고, 그러면 무엇이 앞이고 무엇이 뒤인지 그림이 못 말한다.
            사각형은 이미 그렇게 하고 있었는데 원만 빠져 있었다. */}
        <path d={ring(s)} fillRule="evenodd" fill={fillFor(s.role)} stroke="none" />
        <g clipPath={`url(#${id})`}>
          {lines.map(([x1, y1, x2, y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={stroke} strokeWidth={m.thin} opacity={0.45} />
          ))}
        </g>
        <circle cx={s.cx} cy={s.cy} r={s.r} fill="none"
                stroke={stroke} strokeWidth={width} />
        {s.inner > 0 && (
          <circle cx={s.cx} cy={s.cy} r={s.inner} fill="none"
                  stroke={stroke} strokeWidth={width} />
        )}
      </g>
    )
  }
  if (s.type === 'line') {
    return <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
                 stroke={stroke} strokeWidth={width} strokeDasharray={dash} />
  }
  if (s.type === 'path') {
    // 잘린 면이면 채운다. 빗금까지 임의 모양에 맞춰 자르는 것은 값에 비해 품이
    // 크고, 평평하게 채우는 것만으로도 「여기가 재료다」 는 읽힌다.
    return <path d={s.d} fill={fillFor(s.role)} stroke={stroke} strokeWidth={width} />
  }
  if (s.type === 'rect') {
    const cut = s.role === ROLE.cut
    // 채움이 **불투명**해야 뒤 선이 안 비친다. 비치면 키를 뚫고 축 외곽선이
    // 지나가는 그림이 되어, 키가 얹힌 건지 묻힌 건지 알 수 없다.
    //
    // `front` 는 잘린 면이 아니라 **앞에 놓인 것**이다 — 해칭은 없이 가리기만
    // 한다. 단면을 안 치는 체결물이 여기 든다.
    const fill = fillFor(s.role)
    return (
      <g>
        <rect x={s.x} y={s.y} width={s.w} height={s.h}
              fill={fill} stroke={stroke} strokeWidth={width} />
        {cut && hatch(s, m, s.flip).map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={stroke} strokeWidth={m.thin} opacity={0.45} />
        ))}
      </g>
    )
  }
  return null
}

/**
 * 흐름 화살표 — 형상이 아니라 **무엇이 지나가는가**.
 *
 * 치수와 다른 색을 쓴다. 같으면 유량 화살표가 길이 치수처럼 읽힌다.
 */
function Flow({ f, m }) {
  // 방향은 두 끝점으로 **판단한다.** 가로만 다루면 세로 화살표의 촉이 옆을 보고,
  // 그러면 잡아당기는 그림이 옆을 미는 그림이 된다.
  const dx = f.x2 - f.x1
  const dy = f.y2 - f.y1
  const vertical = Math.abs(dx) < Math.abs(dy)
  const dir = vertical ? Math.sign(dy) || 1 : Math.sign(dx) || 1

  const label = vertical
    ? { x: f.x1 + m.font * 0.5, y: (f.y1 + f.y2) / 2, anchor: 'start' }
    : { x: (f.x1 + f.x2) / 2, y: f.y1 - m.font * 0.5, anchor: 'middle' }

  return (
    <g stroke={PAINT.flow} fill={PAINT.flow}>
      <line x1={f.x1} y1={f.y1} x2={f.x2} y2={f.y2} strokeWidth={m.thin * 1.6} />
      <path d={arrow(f.x2, f.y2, vertical, -dir, m)} stroke="none" />
      {f.label && (
        <text x={label.x} y={label.y} fontSize={m.font}
              textAnchor={label.anchor} stroke="none">{f.label}</text>
      )}
    </g>
  )
}

/** 비트는 힘. 축 둘레를 도는 화살표 하나. */
function Moment({ t, m }) {
  const start = -Math.PI / 2
  const end = start + t.sweep
  const at = (a) => [t.cx + t.r * Math.cos(a), t.cy + t.r * Math.sin(a)]
  const [sx, sy] = at(start)
  const [ex, ey] = at(end)
  const large = t.sweep > Math.PI ? 1 : 0
  // 화살촉은 원의 **접선** 방향을 봐야 한다. 반지름 방향으로 두면 축을 찌르는
  // 모양이 되어 비틀림이 아니라 하중으로 읽힌다.
  const tangent = end + Math.PI / 2
  const head = m.arrow
  const wing = head * 0.34
  const tip = [ex + Math.cos(tangent) * head * 0.4, ey + Math.sin(tangent) * head * 0.4]
  const back = [ex - Math.cos(tangent) * head * 0.6, ey - Math.sin(tangent) * head * 0.6]
  const side = [Math.cos(tangent + Math.PI / 2) * wing, Math.sin(tangent + Math.PI / 2) * wing]

  return (
    <g stroke={PAINT.flow} fill={PAINT.flow}>
      <path d={`M ${sx} ${sy} A ${t.r} ${t.r} 0 ${large} 1 ${ex} ${ey}`}
            fill="none" strokeWidth={m.thin * 1.6} />
      <path stroke="none" d={`M ${tip[0]} ${tip[1]} L ${back[0] + side[0]} ${back[1] + side[1]}`
        + ` L ${back[0] - side[0]} ${back[1] - side[1]} Z`} />
      {t.label && (
        <text x={t.cx} y={t.cy - t.r - m.font * 0.45} fontSize={m.font}
              textAnchor="middle" stroke="none">{t.label}</text>
      )}
    </g>
  )
}

/** 한 자리를 글자로 짚는다. 치수선 없이 뜻만 전할 때. */
function Tag({ t, m }) {
  return (
    <text x={t.x} y={t.y} fontSize={m.font} textAnchor={t.anchor}
          fill={PAINT.dim} stroke="none">{t.text}</text>
  )
}

function Dim({ d, m }) {
  const p = dimParts(d, m)
  const [lx, ly, mx, my] = p.line
  const dir = p.outside ? -1 : 1
  return (
    <g stroke={PAINT.dim} fill={PAINT.dim}>
      <line x1={lx} y1={ly} x2={mx} y2={my} strokeWidth={m.thin} />
      {p.ext.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              strokeWidth={m.thin} opacity={0.55} />
      ))}
      <path d={arrow(lx, ly, p.vertical, dir, m)} stroke="none" />
      <path d={arrow(mx, my, p.vertical, -dir, m)} stroke="none" />
      <text x={p.text.x + p.text.dx} y={p.text.y + p.text.dy}
            fontSize={m.font} textAnchor={p.text.anchor} stroke="none">
        {p.text.value}
      </text>
    </g>
  )
}

/**
 * @param figure  `{ kind, mapping, caption }`
 * @param lookup  변수 id → `{ value, unit, name }`
 */
export default function FigureView({ figure, lookup }) {
  const spec = figureOf(figure?.kind)
  const built = useMemo(
    () => (spec ? spec.build(valuesFor(figure, lookup)) : null),
    [spec, figure, lookup],
  )

  if (!spec) {
    return (
      <Why>
        <b>그릴 줄 모르는 도해입니다</b>
        {'\n'}종류: {figure?.kind || '(없음)'}
      </Why>
    )
  }

  if (!built.ok) {
    return <Why><b>이 값으로는 형상이 안 됩니다</b>{'\n'}{built.impossible}</Why>
  }

  // 값이 아직 없으면 **보기 비율**로 그린다. 치수 자리에는 숫자 대신 기호가 들어가
  // 있어(`Ød`·`b`·`L`) 지어낸 값을 사실처럼 말하지 않는다.
  const waiting = built.example ? built.missing.map(key => {
    const p = spec.params.find(x => x.key === key)
    return p ? `${p.label}(${key})` : key
  }) : []

  const m = metrics(built.box)
  return (
    <Box>
      <svg viewBox={String(viewBox(built.box, built.dims, built.tags))} role="img"
           aria-label={figure.caption || spec.name}>
        {built.shapes.map((s, i) => <Shape key={`s${i}`} s={s} m={m} />)}
        {(built.flows || []).map((f, i) => <Flow key={`f${i}`} f={f} m={m} />)}
        {(built.moments || []).map((t, i) => <Moment key={`t${i}`} t={t} m={m} />)}
        {built.dims.map((d, i) => <Dim key={`d${i}`} d={d} m={m} />)}
        {(built.tags || []).map((t, i) => <Tag key={`g${i}`} t={t} m={m} />)}
      </svg>
      {/* 보기 비율이라는 사실을 그림 바로 밑에 적는다. 안 적으면 사람은 이
          비율을 자기 설계의 비율로 읽는다. */}
      {waiting.length > 0 && (
        <Note $warn>
          예시 형상입니다 — {waiting.join(', ')} 을(를) 넣으면 실제 비율로 그립니다.
        </Note>
      )}
      {built.notes.map((n, i) => <Note key={i}>{n}</Note>)}
      {figure.caption && <Caption>{figure.caption}</Caption>}
    </Box>
  )
}
