import React, { useEffect, useRef, useState, useMemo } from 'react'
import styled from 'styled-components'
import Plotly from 'plotly.js-dist-min'
import { useChartColors } from '../../theme/chartColors'

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
`

const Toolbar = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  font-size: 0.78rem;
`

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: hsl(var(--fg-muted));
`

const Select = styled.select`
  padding: 5px 7px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
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

// rows: [{col: val, ...}]
// keys: [col1, col2, ...] — 선택 가능한 모든 열
// labels: { col: displayLabel }
function Scatter3DPlot({ rows, keys, labels = {} }) {
  const chart = useChartColors()
  const plotRef = useRef(null)

  const defaults = useMemo(() => {
    const k = keys || []
    return {
      x: k[0] || '',
      y: k[1] || k[0] || '',
      z: k[2] || k[0] || '',
      color: k[3] || k[0] || '',
    }
  }, [keys])

  const [axes, setAxes] = useState(defaults)

  useEffect(() => {
    // 기존 축 중에 존재하지 않는 키가 있으면 defaults로 재설정
    setAxes(prev => {
      const pick = (v, fallback) => keys.includes(v) ? v : fallback
      return {
        x: pick(prev.x, defaults.x),
        y: pick(prev.y, defaults.y),
        z: pick(prev.z, defaults.z),
        color: pick(prev.color, defaults.color),
      }
    })
  }, [keys, defaults])

  useEffect(() => {
    if (!plotRef.current || !rows || rows.length === 0 || !axes?.x || !axes?.y || !axes?.z) {
      if (plotRef.current) Plotly.purge(plotRef.current)
      return
    }

    const isStringColumn = (col) => {
      if (!col) return false
      const sample = rows.find(r => r[col] !== undefined && r[col] !== null)?.[col]
      if (sample === undefined) return false
      return typeof sample === 'string' && !Number.isFinite(Number(sample))
    }

    const getLabel = (col) => labels[col] || col

    const stringMap = {}
    ;[axes.x, axes.y, axes.z, axes.color].forEach(col => {
      if (col && isStringColumn(col)) {
        const uniq = Array.from(new Set(rows.map(r => String(r[col]))))
        stringMap[col] = { labels: uniq, index: Object.fromEntries(uniq.map((l, i) => [l, i])) }
      }
    })

    const toNum = (col, raw) => {
      if (raw === null || raw === undefined) return 0
      if (stringMap[col]) return stringMap[col].index[String(raw)] ?? 0
      const n = Number(raw)
      return Number.isFinite(n) ? n : 0
    }

    const xData = rows.map(r => toNum(axes.x, r[axes.x]))
    const yData = rows.map(r => toNum(axes.y, r[axes.y]))
    const zData = rows.map(r => toNum(axes.z, r[axes.z]))

    const colorCol = axes.color
    const colorStringMode = colorCol && isStringColumn(colorCol)

    const defaultScale = [
      ...chart.scale,
    ]

    const palette = (n) => {
      const base = chart.series
      const out = []
      for (let i = 0; i < n; i++) out.push(base[i % base.length])
      return out
    }

    const hoverText = rows.map((r, i) => {
      const lines = [`<b>Run ${i + 1}</b>`]
      ;[axes.x, axes.y, axes.z, colorCol].filter(Boolean).forEach(col => {
        const raw = r[col]
        const disp = typeof raw === 'number' ? raw.toFixed(4) : String(raw ?? 'N/A')
        lines.push(`<b>${getLabel(col)}:</b> ${disp}`)
      })
      const shown = new Set([axes.x, axes.y, axes.z, colorCol])
      Object.keys(r).filter(k => !shown.has(k) && k !== '__errors').slice(0, 5).forEach(col => {
        const raw = r[col]
        const disp = typeof raw === 'number' ? raw.toFixed(4) : String(raw ?? 'N/A')
        lines.push(`<b>${getLabel(col)}:</b> ${disp}`)
      })
      return lines.join('<br>')
    })

    let traces
    if (colorStringMode && stringMap[colorCol]) {
      const catLabels = stringMap[colorCol].labels
      const colors = palette(catLabels.length)
      traces = catLabels.map((lbl, idx) => {
        const indices = rows
          .map((r, i) => String(r[colorCol]) === lbl ? i : -1)
          .filter(i => i !== -1)
        return {
          type: 'scatter3d',
          mode: 'markers',
          name: `${getLabel(colorCol)}: ${lbl}`,
          x: indices.map(i => xData[i]),
          y: indices.map(i => yData[i]),
          z: indices.map(i => zData[i]),
          marker: { size: 5, color: colors[idx], opacity: 0.85, line: { color: chart.fg, width: 0.5 } },
          text: indices.map(i => hoverText[i]),
          hovertemplate: '%{text}<extra></extra>',
        }
      })
    } else {
      const colorVals = colorCol ? rows.map(r => toNum(colorCol, r[colorCol])) : xData
      traces = [{
        type: 'scatter3d',
        mode: 'markers',
        x: xData,
        y: yData,
        z: zData,
        marker: {
          size: 5,
          color: colorVals,
          colorscale: defaultScale,
          showscale: !!colorCol,
          colorbar: colorCol ? { title: getLabel(colorCol), thickness: 12, len: 0.7, x: 1.02 } : undefined,
          opacity: 0.85,
          line: { color: chart.fg, width: 0.5 },
        },
        text: hoverText,
        hovertemplate: '%{text}<extra></extra>',
      }]
    }

    const axisConfig = (col) => {
      const cfg = {
        title: { text: getLabel(col), font: { size: 12, color: chart.muted } },
        gridcolor: chart.grid,
        showgrid: true,
        zerolinecolor: chart.grid,
      }
      if (stringMap[col]) {
        cfg.tickmode = 'array'
        cfg.tickvals = stringMap[col].labels.map((_, i) => i)
        cfg.ticktext = stringMap[col].labels
      }
      return cfg
    }

    const layout = {
      scene: {
        xaxis: axisConfig(axes.x),
        yaxis: axisConfig(axes.y),
        zaxis: axisConfig(axes.z),
        bgcolor: chart.plot,
        camera: { eye: { x: 1.5, y: 1.5, z: 1.2 } },
      },
      margin: { l: 0, r: colorStringMode ? 150 : 50, t: 10, b: 0 },
      paper_bgcolor: chart.paper,
      plot_bgcolor: chart.plot,
      showlegend: colorStringMode,
      legend: colorStringMode ? {
        x: 1.02, y: 1, xanchor: 'left', yanchor: 'top',
        bgcolor: chart.paper, bordercolor: chart.grid, borderwidth: 1,
        font: { size: 11 },
      } : undefined,
      autosize: true,
    }

    const config = {
      responsive: true,
      displaylogo: false,
      modeBarButtonsToRemove: ['sendDataToCloud'],
    }

    Plotly.newPlot(plotRef.current, traces, layout, config)

    return () => {
      if (plotRef.current) Plotly.purge(plotRef.current)
    }
  }, [rows, axes, labels])

  if (!rows || rows.length === 0) {
    return <Hint>데이터 없음</Hint>
  }

  const setAxis = (k, v) => setAxes(a => ({ ...a, [k]: v }))

  return (
    <Wrapper>
      <Toolbar>
        {['x', 'y', 'z', 'color'].map(k => (
          <Field key={k}>
            {k.toUpperCase()}{k === 'color' ? ' (색)' : ''}
            <Select value={axes[k] ?? ''} onChange={(e) => setAxis(k, e.target.value)}>
              {k === 'color' && <option value="">(없음)</option>}
              {keys.map(col => <option key={col} value={col}>{labels[col] || col}</option>)}
            </Select>
          </Field>
        ))}
      </Toolbar>
      <PlotHost ref={plotRef} />
    </Wrapper>
  )
}

export default Scatter3DPlot
