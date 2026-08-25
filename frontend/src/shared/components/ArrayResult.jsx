/**
 * 배열 결과 보기 — 그래프와 표.
 *
 * 배열을 `[10, 20, 30, …]` 한 줄로 찍으면 값이 몇 개인지, 어디가 크고 작은지
 * 읽을 수가 없다. 원소가 조금만 늘어도 칸을 넘겨 잘린다.
 *
 * 그래서 둘 다 준다. **그래프**는 분포와 최대·최소가 어디인지 한눈에 보이고,
 * **표**는 정확한 값을 읽어야 할 때 쓴다. 설계 계산에서는 둘 다 필요하다 —
 * 경향을 보다가 결국 특정 지점의 수치를 적어야 하기 때문이다.
 *
 * 기본은 그래프다. 원소가 서너 개뿐이면 그래프가 오히려 답답해서 표로 시작한다.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import Plotly from 'plotly.js-dist-min'
import styled from 'styled-components'
import { useChartColors } from '../theme/chartColors'

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  min-width: 0;
`

const Bar = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: flex-end;
`

const Summary = styled.span`
  font-size: 0.75rem;
  color: hsl(var(--fg-subtle));
  margin-right: auto;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const ViewBtn = styled.button`
  padding: 3px 9px;
  font-size: 0.72rem;
  border: 1px solid ${p => (p.$active ? 'hsl(var(--primary))' : 'hsl(var(--border))')};
  background: ${p => (p.$active ? 'hsl(var(--primary-soft))' : 'white')};
  color: ${p => (p.$active ? 'hsl(var(--primary))' : 'hsl(var(--fg-subtle))')};
  border-radius: var(--radius-sm);
  cursor: pointer;
  flex-shrink: 0;
  &:hover { border-color: hsl(var(--primary)); }
`

const PlotBox = styled.div`
  width: 100%;
  height: 150px;
`

const TableWrap = styled.div`
  max-height: 180px;
  overflow: auto;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-sm);
  background: hsl(var(--surface));
`

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;

  th, td {
    padding: 4px 9px;
    text-align: right;
    border-bottom: 1px solid hsl(var(--surface-2));
    white-space: nowrap;
  }
  th {
    background: hsl(var(--surface-2));
    color: hsl(var(--fg-subtle));
    font-weight: 600;
    font-size: 0.72rem;
    position: sticky;
    top: 0;
  }
  th:first-child, td:first-child {
    text-align: left;
    color: hsl(var(--fg-subtle));
    width: 44px;
  }
  tr:last-child td { border-bottom: none; }
`

const Empty = styled.div`
  font-size: 0.8rem;
  color: hsl(var(--border-strong));
  padding: 8px 0;
`

/** 그래프로 그릴 수 있는가 — 숫자 원소가 둘 이상이어야 선이 그려진다. */
function numericPoints(list) {
  return list.map(v => Number(v)).filter(n => Number.isFinite(n))
}

function formatCell(value) {
  if (value === null || value === undefined || value === '') return ''
  const num = Number(value)
  if (!Number.isFinite(num)) return String(value)
  return Number.isInteger(num) ? String(num) : num.toFixed(4)
}

function ArrayResult({ values, unit, name }) {
  const chart = useChartColors()
  // 값을 memo 로 고정한다. 매 렌더마다 새 배열이 만들어지면 아래 effect 가
  // 계속 다시 돌아 Plotly 가 그래프를 처음부터 다시 그린다.
  const list = useMemo(() => (Array.isArray(values) ? values : []), [values])
  const numbers = useMemo(() => numericPoints(list), [list])
  const canPlot = numbers.length >= 2 && numbers.length === list.length

  // 원소가 적으면 그래프가 답답하다. 값 몇 개는 표로 읽는 편이 빠르다.
  const [view, setView] = useState(() => (canPlot && list.length > 4 ? 'chart' : 'table'))
  const plotRef = useRef(null)

  useEffect(() => {
    const node = plotRef.current
    if (view !== 'chart' || !node || !canPlot) {
      if (node) Plotly.purge(node)
      return undefined
    }
    Plotly.newPlot(
      node,
      [{
        x: list.map((_, i) => i + 1),
        y: numbers,
        type: 'scatter',
        mode: list.length <= 40 ? 'lines+markers' : 'lines',
        line: { color: chart.primary, width: 2 },
        marker: { size: 5, color: chart.primary },
        hovertemplate: `%{x}번째: %{y}${unit ? ' ' + unit : ''}<extra></extra>`,
      }],
      {
        margin: { l: 44, r: 10, t: 8, b: 28 },
        height: 150,
        xaxis: { title: '', tickfont: { size: 10 }, dtick: list.length <= 12 ? 1 : undefined },
        yaxis: { title: '', tickfont: { size: 10 } },
        showlegend: false,
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
      },
      { responsive: true, displaylogo: false, displayModeBar: false },
    )
    return () => { if (node) Plotly.purge(node) }
  }, [view, canPlot, list, numbers, unit])

  if (list.length === 0) return <Empty>(빈 배열)</Empty>

  const summary = numbers.length > 0
    ? `${list.length}개 · 최소 ${formatCell(Math.min(...numbers))} · 최대 ${formatCell(Math.max(...numbers))}`
    : `${list.length}개`

  return (
    <Wrap>
      <Bar>
        <Summary title={name}>{summary}{unit ? ` ${unit}` : ''}</Summary>
        {canPlot && (
          <ViewBtn type="button" $active={view === 'chart'} onClick={() => setView('chart')}>그래프</ViewBtn>
        )}
        <ViewBtn type="button" $active={view === 'table'} onClick={() => setView('table')}>표</ViewBtn>
      </Bar>

      {view === 'chart' && canPlot ? (
        <PlotBox ref={plotRef} />
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <th>#</th>
                <th>값{unit ? ` (${unit})` : ''}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((value, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{formatCell(value)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </Wrap>
  )
}

export default ArrayResult
