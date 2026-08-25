/**
 * 트레이드오프 곡선 그림.
 *
 * DOE 그래프들과 같은 Plotly 를 쓴다. 새 라이브러리를 얹지 않는 것이 이유의
 * 전부는 아니다 — 같은 도구로 그려야 축·색·조작감이 화면마다 달라지지 않는다.
 *
 * **끊긴 자리는 이어 그리지 않는다.** `null` 을 넣어 두면 Plotly 가 그 구간을
 * 비운다. 이어 버리면 답이 없는 구간이 있다는 사실이 그림에서 사라진다.
 */

import React, { useEffect, useRef } from 'react'
import Plotly from 'plotly.js-dist-min'
import styled from 'styled-components'
import { useChartColors } from '../theme/chartColors'

const Box = styled.div`
  width: 100%;
  height: 420px;
  margin-top: 18px;
`

// 계열을 가르는 색은 판마다 다르다 — `chartColors` 가 준다.

function TradeoffPlot({ result, xLabel, yLabel, title }) {
  const chart = useChartColors()
  const ref = useRef(null)

  useEffect(() => {
    if (!ref.current || !result?.ok) return undefined

    const traces = result.branches.map((b, i) => ({
      x: b.xs,
      y: b.ys,
      type: 'scatter',
      mode: 'lines+markers',
      name: result.branches.length > 1 ? `해 ${i + 1}` : '조합',
      line: { color: chart.series[i % chart.series.length], width: 2 },
      marker: { size: 5 },
      // 곡선 위 점 하나하나가 "이 조합이면 목표가 나온다" 는 뜻이다.
      hovertemplate: `${xLabel} = %{x}<br>${yLabel} = %{y}<extra></extra>`,
      connectgaps: false,
    }))

    Plotly.newPlot(ref.current, traces, {
      title: { text: title, font: { size: 13 } },
      margin: { l: 60, r: 20, t: 40, b: 50 },
      xaxis: { title: { text: xLabel }, zeroline: false },
      yaxis: { title: { text: yLabel }, zeroline: false },
      showlegend: result.branches.length > 1,
      font: { family: 'inherit', size: 11 },
      plot_bgcolor: chart.plot,
      paper_bgcolor: chart.paper,
    }, { displayModeBar: false, responsive: true })

    const el = ref.current
    return () => { Plotly.purge(el) }
  }, [result, xLabel, yLabel, title])

  if (!result?.ok) return null
  return <Box ref={ref} />
}

export default TradeoffPlot
