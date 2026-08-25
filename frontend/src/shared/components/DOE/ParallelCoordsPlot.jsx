import React, { useEffect, useRef, useState, useMemo } from 'react'
import styled from 'styled-components'
import Plotly from 'plotly.js-dist-min'
import { useChartColors } from '../../theme/chartColors'

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
`

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 0.82rem;
  color: hsl(var(--fg-muted));
`

const Select = styled.select`
  padding: 4px 8px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-sm);
  font-size: 0.82rem;
  background: hsl(var(--surface));
  outline: none;
  &:focus { border-color: hsl(var(--primary)); }
`

const PlotHost = styled.div`
  flex: 1;
  min-height: 0;
`

const Hint = styled.div`
  font-size: 0.75rem;
  color: hsl(var(--fg-subtle));
`

function ParallelCoordsPlot({ rows, keys, labels }) {
  const chart = useChartColors()
  const plotRef = useRef(null)

  const numericKeys = useMemo(() => (
    keys.filter(k => rows.some(r => typeof r[k] === 'number'))
  ), [rows, keys])

  const [colorBy, setColorBy] = useState(numericKeys[numericKeys.length - 1] || '')

  useEffect(() => {
    if (!numericKeys.includes(colorBy)) {
      setColorBy(numericKeys[numericKeys.length - 1] || '')
    }
  }, [numericKeys, colorBy])

  useEffect(() => {
    if (!plotRef.current || rows.length === 0 || numericKeys.length < 2) {
      if (plotRef.current) Plotly.purge(plotRef.current)
      return
    }

    const dimensions = numericKeys.map(k => {
      const vals = rows.map(r => (typeof r[k] === 'number' ? r[k] : Number(r[k]) || 0))
      const min = Math.min(...vals)
      const max = Math.max(...vals)
      return {
        label: labels[k] || k,
        values: vals,
        range: [min, max],
      }
    })

    const colorVals = colorBy
      ? rows.map(r => (typeof r[colorBy] === 'number' ? r[colorBy] : Number(r[colorBy]) || 0))
      : rows.map((_, i) => i)

    const traces = [{
      type: 'parcoords',
      line: {
        color: colorVals,
        colorscale: [
          ...chart.scale,
        ],
        showscale: !!colorBy,
        colorbar: colorBy ? { title: labels[colorBy] || colorBy, thickness: 12, len: 0.9 } : undefined,
      },
      dimensions,
    }]

    const layout = {
      margin: { l: 60, r: 60, t: 40, b: 40 },
      paper_bgcolor: chart.paper,
      plot_bgcolor: chart.plot,
      autosize: true,
    }

    Plotly.newPlot(plotRef.current, traces, layout, {
      responsive: true,
      displaylogo: false,
      modeBarButtonsToRemove: ['sendDataToCloud'],
    })

    return () => {
      if (plotRef.current) Plotly.purge(plotRef.current)
    }
  }, [rows, numericKeys, colorBy, labels])

  if (rows.length === 0) return <Hint>데이터 없음</Hint>
  if (numericKeys.length < 2) return <Hint>숫자 변수 2개 이상 필요</Hint>

  return (
    <Wrapper>
      <Toolbar>
        <span>색상 축:</span>
        <Select value={colorBy} onChange={(e) => setColorBy(e.target.value)}>
          <option value="">(단색)</option>
          {numericKeys.map(k => <option key={k} value={k}>{labels[k] || k}</option>)}
        </Select>
        <span style={{ color: 'hsl(var(--fg-subtle))', fontSize: '0.75rem' }}>
          💡 축 라벨 드래그로 순서 변경, 축 위 드래그로 범위 필터
        </span>
      </Toolbar>
      <PlotHost ref={plotRef} />
    </Wrapper>
  )
}

export default ParallelCoordsPlot
