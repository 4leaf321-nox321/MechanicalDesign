import React, { useEffect, useRef, useMemo } from 'react'
import styled from 'styled-components'
import Plotly from 'plotly.js-dist-min'

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
`

const Hint = styled.div`
  font-size: 0.75rem;
  color: #999;
`

const PlotHost = styled.div`
  flex: 1;
  min-height: 0;
`

function pearson(xs, ys) {
  const n = xs.length
  if (n < 2) return 0
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0
  for (let i = 0; i < n; i++) {
    const x = xs[i], y = ys[i]
    sumX += x; sumY += y
    sumXY += x * y
    sumX2 += x * x
    sumY2 += y * y
  }
  const num = n * sumXY - sumX * sumY
  const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY))
  if (den === 0) return 0
  return num / den
}

function CorrelationHeatmap({ rows, keys, labels }) {
  const plotRef = useRef(null)

  const numericKeys = useMemo(() => (
    keys.filter(k => rows.some(r => typeof r[k] === 'number'))
  ), [rows, keys])

  const { matrix, tickLabels } = useMemo(() => {
    const valid = numericKeys
    const cols = valid.map(k => rows.map(r => (typeof r[k] === 'number' ? r[k] : Number(r[k]) || 0)))
    const mat = valid.map((_, i) => valid.map((__, j) => {
      if (i === j) return 1
      return pearson(cols[i], cols[j])
    }))
    return {
      matrix: mat,
      tickLabels: valid.map(k => labels[k] || k),
    }
  }, [rows, numericKeys, labels])

  useEffect(() => {
    if (!plotRef.current || matrix.length < 2) {
      if (plotRef.current) Plotly.purge(plotRef.current)
      return
    }

    // 셀 안에 상관계수 텍스트
    const text = matrix.map(row => row.map(v => v.toFixed(2)))

    const traces = [{
      type: 'heatmap',
      z: matrix,
      x: tickLabels,
      y: tickLabels,
      colorscale: [
        [0, '#d32f2f'],     // 강한 음의 상관 (빨강)
        [0.25, '#ef9a9a'],
        [0.5, '#ffffff'],   // 0 (흰색)
        [0.75, '#90caf9'],
        [1, '#1976d2'],     // 강한 양의 상관 (파랑)
      ],
      zmin: -1,
      zmax: 1,
      showscale: true,
      colorbar: { title: 'r', thickness: 12, len: 0.9 },
      hovertemplate: '<b>%{y}</b> vs <b>%{x}</b><br>r = %{z:.3f}<extra></extra>',
    }]

    const annotations = []
    for (let i = 0; i < matrix.length; i++) {
      for (let j = 0; j < matrix[i].length; j++) {
        annotations.push({
          x: tickLabels[j],
          y: tickLabels[i],
          text: text[i][j],
          showarrow: false,
          font: {
            size: 11,
            color: Math.abs(matrix[i][j]) > 0.6 ? 'white' : '#333',
          },
        })
      }
    }

    const layout = {
      margin: { l: 120, r: 40, t: 20, b: 120 },
      paper_bgcolor: '#ffffff',
      plot_bgcolor: '#ffffff',
      xaxis: { side: 'bottom', tickangle: -35 },
      yaxis: { autorange: 'reversed' },
      annotations,
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
  }, [matrix, tickLabels])

  if (rows.length === 0) return <Hint>데이터 없음</Hint>
  if (numericKeys.length < 2) return <Hint>숫자 변수 2개 이상 필요</Hint>

  return (
    <Wrapper>
      <PlotHost ref={plotRef} />
    </Wrapper>
  )
}

export default CorrelationHeatmap
