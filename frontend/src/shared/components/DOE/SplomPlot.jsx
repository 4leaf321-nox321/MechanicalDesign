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

const SelectorArea = styled.div`
  padding: 8px 10px;
  background: hsl(var(--surface-2));
  border: 1px solid hsl(var(--surface-2));
  border-radius: var(--radius);
  font-size: 0.82rem;
`

const TopRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  color: hsl(var(--fg-muted));
`

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`

const Chip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px 2px 8px;
  background: hsl(var(--primary-soft));
  color: hsl(var(--primary));
  border-radius: var(--radius-lg);
  font-size: 0.78rem;
`

const ChipClose = styled.button`
  background: transparent;
  border: none;
  color: hsl(var(--primary));
  cursor: pointer;
  width: 16px;
  height: 16px;
  padding: 0;
  border-radius: 50%;
  font-size: 0.9rem;
  line-height: 1;
  &:hover { background: #bbdefb; color: #0d47a1; }
`

const SearchBox = styled.div`
  position: relative;
  margin-top: 6px;
`

const SearchInput = styled.input`
  width: 100%;
  padding: 6px 10px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-sm);
  font-size: 0.82rem;
  outline: none;
  box-sizing: border-box;
  &:focus { border-color: hsl(var(--primary)); }
  &:disabled { background: hsl(var(--bg)); color: hsl(var(--fg-subtle)); cursor: not-allowed; }
`

const Dropdown = styled.div`
  position: absolute;
  top: calc(100% + 2px);
  left: 0;
  right: 0;
  max-height: 220px;
  overflow-y: auto;
  background: hsl(var(--surface));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-sm);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  z-index: 10;
`

const DropdownItem = styled.button`
  display: block;
  width: 100%;
  text-align: left;
  padding: 6px 10px;
  background: transparent;
  border: none;
  font-size: 0.82rem;
  cursor: pointer;
  color: hsl(var(--fg));
  &:hover { background: #eef5fb; color: hsl(var(--primary)); }
  &:disabled { color: hsl(var(--border-strong)); cursor: not-allowed; background: transparent; }
`

const NoMatch = styled.div`
  padding: 8px 10px;
  color: hsl(var(--fg-subtle));
  font-size: 0.8rem;
`

const PlotHost = styled.div`
  flex: 1;
  min-height: 0;
`

const Hint = styled.div`
  font-size: 0.75rem;
  color: hsl(var(--fg-subtle));
`

const MAX_SELECTION = 6

function SplomPlot({ rows, keys, labels }) {
  const chart = useChartColors()
  const plotRef = useRef(null)
  const wrapperRef = useRef(null)

  const numericKeys = useMemo(() => (
    keys.filter(k => rows.some(r => typeof r[k] === 'number'))
  ), [rows, keys])

  const [selected, setSelected] = useState(() => numericKeys.slice(0, Math.min(MAX_SELECTION, 4)))
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)

  // 변수 목록이 바뀌면 선택 상태 재조정
  useEffect(() => {
    setSelected(prev => {
      const filtered = prev.filter(k => numericKeys.includes(k))
      if (filtered.length === 0) return numericKeys.slice(0, Math.min(MAX_SELECTION, 4))
      return filtered
    })
  }, [numericKeys])

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const availableOptions = useMemo(() => {
    const q = search.trim().toLowerCase()
    return numericKeys
      .filter(k => !selected.includes(k))
      .filter(k => {
        if (!q) return true
        const label = (labels[k] || k).toLowerCase()
        return label.includes(q) || k.toLowerCase().includes(q)
      })
      .slice(0, 100)
  }, [numericKeys, selected, search, labels])

  const addVar = (k) => {
    if (selected.length >= MAX_SELECTION) return
    if (selected.includes(k)) return
    setSelected([...selected, k])
    setSearch('')
  }

  const removeVar = (k) => {
    setSelected(selected.filter(x => x !== k))
  }

  useEffect(() => {
    if (!plotRef.current || rows.length === 0 || selected.length < 2) {
      if (plotRef.current) Plotly.purge(plotRef.current)
      return
    }
    const dimensions = selected.map(k => ({
      label: labels[k] || k,
      values: rows.map(r => {
        const v = r[k]
        return typeof v === 'number' ? v : Number(v) || 0
      }),
    }))

    const traces = [{
      type: 'splom',
      dimensions,
      showupperhalf: false,
      diagonal: { visible: false },
      marker: {
        size: 4,
        color: chart.primary,
        opacity: 0.7,
        line: { color: 'white', width: 0.3 },
      },
    }]

    const layout = {
      dragmode: 'select',
      hovermode: 'closest',
      plot_bgcolor: chart.plot,
      paper_bgcolor: chart.paper,
      margin: { l: 60, r: 20, t: 20, b: 40 },
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
  }, [rows, selected, labels])

  if (rows.length === 0) return <Hint>데이터 없음</Hint>

  const full = selected.length >= MAX_SELECTION

  return (
    <Wrapper>
      <SelectorArea ref={wrapperRef}>
        <TopRow>
          <span style={{ fontWeight: 500 }}>선택된 변수</span>
          <span style={{ color: 'hsl(var(--fg-subtle))', fontSize: '0.76rem' }}>
            ({selected.length}/{MAX_SELECTION})
          </span>
        </TopRow>
        <Chips>
          {selected.length === 0 && (
            <span style={{ color: 'hsl(var(--fg-subtle))', fontSize: '0.78rem' }}>(아래 검색으로 변수 추가)</span>
          )}
          {selected.map(k => (
            <Chip key={k}>
              {labels[k] || k}
              <ChipClose onClick={() => removeVar(k)} title="제거">×</ChipClose>
            </Chip>
          ))}
        </Chips>
        <SearchBox>
          <SearchInput
            placeholder={full ? '최대 개수 도달 — 제거 후 추가' : '변수명 검색해서 추가... (예: 길이, thickness)'}
            value={search}
            disabled={full}
            onChange={(e) => { setSearch(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
          />
          {open && !full && (
            <Dropdown>
              {availableOptions.length === 0 ? (
                <NoMatch>
                  {numericKeys.length === selected.length
                    ? '선택 가능한 변수가 없습니다.'
                    : '일치하는 변수 없음'}
                </NoMatch>
              ) : (
                availableOptions.map(k => (
                  <DropdownItem key={k} onClick={() => addVar(k)}>
                    {labels[k] || k}
                  </DropdownItem>
                ))
              )}
            </Dropdown>
          )}
        </SearchBox>
      </SelectorArea>
      {selected.length < 2 ? (
        <Hint>최소 2개 이상의 변수를 선택해주세요.</Hint>
      ) : (
        <PlotHost ref={plotRef} />
      )}
    </Wrapper>
  )
}

export default SplomPlot
