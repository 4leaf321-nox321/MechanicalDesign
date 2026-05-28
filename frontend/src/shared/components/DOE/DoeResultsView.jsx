import React, { useMemo, useState } from 'react'
import styled from 'styled-components'
import Scatter3DPlot from './Scatter3DPlot'
import SplomPlot from './SplomPlot'
import ParallelCoordsPlot from './ParallelCoordsPlot'
import CorrelationHeatmap from './CorrelationHeatmap'
import { toCsv } from '../../utils/doeEngine'

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  background: white;
  padding: 12px 16px;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
`

const Info = styled.div`
  font-size: 0.9rem;
  color: #444;
`

const Button = styled.button`
  padding: 8px 14px;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  &:hover { background: #2980b9; }
  &:disabled { background: #b0d4f1; cursor: not-allowed; }
`

const CarouselArea = styled.div`
  display: flex;
  align-items: stretch;
  gap: 12px;
  background: white;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  padding: 14px;
  /* 상단 스택(약 280px) + 하단 dot/여백(약 60px) + 여유 마진(약 40px) 제외 */
  height: max(420px, calc(100vh - 380px));
`

const ArrowBtn = styled.button`
  width: 44px;
  flex-shrink: 0;
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  color: #555;
  font-size: 1.6rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  &:hover { background: #e9ecef; color: #333; }
`

const Page = styled.div`
  flex: 1;
  display: grid;
  grid-template-columns: ${p => p.$cols === 1 ? '1fr' : '1fr 1fr'};
  gap: 12px;
  min-width: 0;
`

const VizPanel = styled.div`
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
  border: 1px solid #eef0f2;
  border-radius: 8px;
  background: #fafbfc;
  min-width: 0;
`

const VizHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #eef0f2;
`

const VizTitle = styled.h3`
  font-size: 0.92rem;
  font-weight: 600;
  color: #333;
  margin: 0;
`

const VizSub = styled.span`
  font-size: 0.72rem;
  color: #999;
`

const VizBody = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
`

const Dots = styled.div`
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-top: 6px;
`

const Dot = styled.button`
  width: 10px;
  height: 10px;
  padding: 0;
  border-radius: 50%;
  border: none;
  background: ${p => p.$active ? '#3498db' : '#cfd4d9'};
  cursor: pointer;
  &:hover { background: ${p => p.$active ? '#3498db' : '#a0a6ac'}; }
`

const TablePanel = styled.div`
  background: white;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  padding: 16px 18px;
`

const PanelTitle = styled.h3`
  font-size: 0.95rem;
  font-weight: 600;
  color: #333;
  margin: 0 0 10px 0;
`

const TableWrap = styled.div`
  overflow: auto;
  max-height: 600px;
  border: 1px solid #eee;
  border-radius: 6px;
`

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  table-layout: auto;
`

const Th = styled.th`
  position: sticky;
  top: 0;
  background: #f1f3f5;
  color: #333;
  font-weight: 600;
  padding: 8px 12px;
  border-bottom: 1px solid #ddd;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
  text-align: left;
  &:hover { background: #e9ecef; }
`

const SpacerTh = styled.th`
  position: sticky;
  top: 0;
  background: #f1f3f5;
  border-bottom: 1px solid #ddd;
  width: 100%;
`

const Td = styled.td`
  padding: 6px 12px;
  border-bottom: 1px solid #f3f4f5;
  white-space: nowrap;
  color: ${p => p.$error ? '#e74c3c' : '#333'};
`

const SpacerTd = styled.td`
  border-bottom: 1px solid #f3f4f5;
  width: 100%;
`

const EmptyMsg = styled.div`
  padding: 40px 20px;
  text-align: center;
  color: #aaa;
  font-size: 0.9rem;
`

function formatCell(val, error) {
  if (error) return error
  if (val === null || val === undefined) return ''
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return String(val)
    return val.toFixed(4)
  }
  return String(val)
}

function DoeResultsView({ result, variables }) {
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const [pageIdx, setPageIdx] = useState(0)

  const allKeys = useMemo(() => {
    if (!result) return []
    return [...result.inputKeys, ...result.intermediateKeys, ...result.outputKeys]
  }, [result])

  const labels = useMemo(() => {
    const m = {}
    variables.forEach(v => {
      const key = v.symbol || v.name
      m[key] = v.unit ? `${v.name} [${v.unit}]` : v.name
    })
    return m
  }, [variables])

  const sortedRows = useMemo(() => {
    if (!result) return []
    if (!sortKey) return result.rows
    const dir = sortDir === 'asc' ? 1 : -1
    return [...result.rows].sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey]
      if (av === null || av === undefined) return 1
      if (bv === null || bv === undefined) return -1
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv)) * dir
    })
  }, [result, sortKey, sortDir])

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const handleExportCsv = () => {
    const csv = toCsv(allKeys, result.rows)
    const BOM = '﻿'
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `doe_results_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (!result) return <EmptyMsg>DOE를 실행하면 결과가 여기에 표시됩니다.</EmptyMsg>

  // 페이지 정의: 페이지마다 1개 또는 2개 시각화
  const pages = [
    {
      vizs: [
        { id: '3d',    title: '3D Scatter Plot',      sub: 'X/Y/Z/색상 선택' },
        { id: 'splom', title: 'Scatter Plot Matrix',  sub: '검색해서 변수 추가 (최대 6)' },
      ],
    },
    {
      vizs: [
        { id: 'parallel', title: 'Parallel Coordinates', sub: '축 드래그로 순서·필터' },
      ],
    },
    {
      vizs: [
        { id: 'heatmap', title: 'Correlation Heatmap', sub: 'Pearson 상관계수 r' },
      ],
    },
  ]

  const renderViz = (id) => {
    switch (id) {
      case '3d':       return <Scatter3DPlot rows={result.rows} keys={allKeys} labels={labels} />
      case 'splom':    return <SplomPlot rows={result.rows} keys={allKeys} labels={labels} />
      case 'parallel': return <ParallelCoordsPlot rows={result.rows} keys={allKeys} labels={labels} />
      case 'heatmap':  return <CorrelationHeatmap rows={result.rows} keys={allKeys} labels={labels} />
      default: return null
    }
  }

  const current = pages[pageIdx]
  const prev = () => setPageIdx(i => (i - 1 + pages.length) % pages.length)
  const next = () => setPageIdx(i => (i + 1) % pages.length)

  return (
    <Wrapper>
      <Toolbar>
        <Info>
          <strong>{result.rows.length}</strong>개 조합 ·
          입력 {result.inputKeys.length}개 · 결과 {result.outputKeys.length}개
          {result.intermediateKeys.length > 0 && ` · 중간값 ${result.intermediateKeys.length}개`}
        </Info>
        <Button onClick={handleExportCsv}>CSV 다운로드</Button>
      </Toolbar>

      <div>
        <CarouselArea>
          <ArrowBtn onClick={prev} title="이전">‹</ArrowBtn>
          <Page $cols={current.vizs.length}>
            {current.vizs.map(v => (
              <VizPanel key={v.id}>
                <VizHeader>
                  <VizTitle>{v.title}</VizTitle>
                  <VizSub>{v.sub}</VizSub>
                </VizHeader>
                <VizBody>{renderViz(v.id)}</VizBody>
              </VizPanel>
            ))}
          </Page>
          <ArrowBtn onClick={next} title="다음">›</ArrowBtn>
        </CarouselArea>
        <Dots>
          {pages.map((_, i) => (
            <Dot key={i} $active={i === pageIdx} onClick={() => setPageIdx(i)} title={`페이지 ${i + 1}`} />
          ))}
        </Dots>
      </div>

      <TablePanel>
        <PanelTitle>결과 테이블</PanelTitle>
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th style={{ width: 1 }}>#</Th>
                {allKeys.map(k => (
                  <Th key={k} onClick={() => handleSort(k)} style={{ width: 1 }}>
                    {labels[k] || k}
                    {sortKey === k && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                  </Th>
                ))}
                <SpacerTh />
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, i) => (
                <tr key={i}>
                  <Td style={{ width: 1 }}>{i + 1}</Td>
                  {allKeys.map(k => (
                    <Td key={k} $error={!!row.__errors?.[k]} style={{ width: 1 }}>
                      {formatCell(row[k], row.__errors?.[k])}
                    </Td>
                  ))}
                  <SpacerTd />
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </TablePanel>
    </Wrapper>
  )
}

export default DoeResultsView
