/**
 * 워크플로 순서도 — 노드를 놓고 화살표로 잇고, **그 자리에서 계산한다.**
 *
 * 표는 무엇이 무엇에 이어졌는지는 말해 주지만 전체가 어떤 모양인지는 못 보여
 * 준다. 연결이 셋만 넘어가도 "토크가 어디로 갔더라" 를 되짚어야 한다.
 *
 * 그림이 지도에서 그치면 값을 고칠 때마다 아래 표로 눈을 옮기게 된다. 그래서
 * 상자 안에 **입력칸과 결과를 함께** 둔다. 값을 바꾸고 → 선을 따라 → 결론이
 * 바뀌는 것이 한 화면에서 보여야 순서도를 그린 값이 나온다.
 *
 * 이 파일이 지키는 규칙 셋:
 *
 * 1. **연결된 입력은 못 고친다.** 고칠 수 있는데 앞 노드 값에 덮여 무시되는
 *    것이 이 화면 최악의 실패다. 값이 어디서 오는지만 적는다.
 * 2. **막힌 노드는 결과를 그리지 않는다.** 빈 칸이 0 으로 보이면 사람은 그것을
 *    답으로 읽는다. 왜 막혔는지를 대신 적는다.
 * 3. **좌표는 노드에 저장한다.** 옮겨 놓은 그림이 다음에 열었을 때 그대로
 *    있어야 그림이 그 워크플로의 일부가 된다.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import ReactFlow, {
  Background, Controls, Handle, MarkerType, MiniMap, Panel, Position,
  useEdgesState, useNodesState,
} from 'reactflow'
import 'reactflow/dist/style.css'
import styled from 'styled-components'
import { STATUS, slot, terminalNodes } from '../../shared/utils/workflowEngine'
import { workflowInterface } from '../../shared/utils/workflowInterface'
import { handleAt, nestedIds, parseSlot } from '../../shared/utils/slots'
import { executionBlocks } from '../../shared/utils/scc'
import { fmt } from '../../shared/utils/goalSeek'
import { edgeFlow } from './edgeFlow'
import { groupBoxes, toAbsolute, toLocal } from './groupBoxes'
import { useTokens } from '../../shared/theme/chartColors'
import { autoLayout, needsLayout } from './workflowLayout'

/** 고른 것은 지울 수 있는 것이다. 그래서 지움 색으로 알린다. */
const PICKED = 'hsl(var(--danger))'

/**
 * 되먹임은 **다른 색**이어야 한다.
 *
 * 되돌아가는 선을 나머지와 같게 그리면, 그림만 보고는 이 워크플로가 한 번
 * 흐르는 것인지 돌고 있는 것인지 알 수 없다. 그 차이가 결과를 읽는 방법을
 * 통째로 바꾼다 — 돌고 있다면 그 값들은 수렴한 값이지 한 번 계산한 값이 아니다.
 */
const LOOP = 'hsl(var(--warn))'

/** 카드 자리는 얼굴이 없다. 밖에 두어야 그릴 때마다 새 객체가 안 생긴다. */
const EMPTY_FACE = { inputs: [], outputs: [] }

/** SVG 속성으로 넘길 색들. 이름을 밖에 두어야 훅이 매번 새로 안 만든다. */
const PAINTED = ['border', 'accent', 'fg-subtle', 'warn']

/** 상태마다 띠 색. 글자로만 쓰면 그림을 훑을 때 안 보인다. */
const TONE = {
  [STATUS.ok]: 'hsl(var(--accent))',
  [STATUS.blocked]: 'hsl(var(--fg-subtle))',
  [STATUS.failed]: 'hsl(var(--warn))',
}

/** 묶음 상자. 색은 뜻이 아니라 **구분**이라 사람이 고른 것을 그대로 쓴다. */
const Box2 = styled.div`
  width: 100%;
  height: 100%;
  border: 1.5px dashed ${p => p.$color};
  border-radius: var(--radius-lg);
  background: ${p => p.$color}14;
  /* 상자를 눌러도 노드를 고를 수 있어야 한다. 이름표만 잡힌다. */
  pointer-events: none;
`

const GroupName = styled.div`
  position: absolute;
  top: 8px;
  left: 12px;
  padding: 2px 9px;
  border-radius: var(--radius-sm);
  background: ${p => p.$color};
  color: hsl(var(--solid-fg));
  font-size: 0.75rem;
  font-weight: 700;
  white-space: nowrap;
  pointer-events: all;
  cursor: grab;
`

const Frame = styled.div`
  /* 다시 계산하는 동안 보이는 숫자는 이전 것이다. 흐리게 두면 "지금 값의
     결과가 아니다" 가 곁판을 안 보고도 읽힌다. */
  transition: opacity 120ms;
  opacity: ${p => (p.$stale ? 0.55 : 1)};
  /* 남은 자리를 다 쓴다. 높이를 못 박으면 화면이 큰 곳에서는 아래가 비고
     작은 곳에서는 넘친다. */
  flex: 1;
  min-height: 0;
  background: hsl(var(--surface-2));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  overflow: hidden;

  /* 커스텀 노드가 자기 테두리를 그리므로 기본 상자는 지운다. */
  .react-flow__node {
    background: transparent;
    border: none;
    padding: 0;
  }

  /* 마우스를 얹으면 굵어진다 — 선을 고를 수 있다는 것을 알리는 유일한 단서다.
     선 색을 인라인으로 칠하고 있어서 !important 가 없으면 묻힌다. */
  .react-flow__edge:hover .react-flow__edge-path {
    stroke-width: 3 !important;
  }

  /* reactflow 가 들고 오는 기본 CSS 는 밝은 판만 안다. 어두운 판에서 확대·축소
     단추만 하얗게 남으면 그림 위에 흰 딱지가 붙은 것처럼 보인다. */
  .react-flow__controls-button {
    background: hsl(var(--surface));
    border-bottom: 1px solid hsl(var(--border));
    fill: hsl(var(--fg-muted));

    &:hover {
      background: hsl(var(--surface-2));
    }
  }

  .react-flow__attribution {
    display: none;
  }
`

const Box = styled.div`
  width: 262px;
  background: hsl(var(--surface));
  border: 1px solid ${p => (p.$tone === TONE[STATUS.ok] ? 'hsl(var(--accent) / 0.35)' : p.$tone)};
  border-left: 4px solid ${p => p.$tone};
  border-radius: var(--radius);
  /* 고른 카드는 테두리를 두르고 살짝 띄운다. 색만 바꾸면 흰 바탕에서 잘 안 보인다. */
  box-shadow: ${p => (p.$picked
    ? '0 0 0 3px hsl(var(--accent) / 0.35), 0 4px 14px rgba(0, 0, 0, 0.14)'
    : '0 2px 8px rgba(0, 0, 0, 0.08)')};
  font-size: 0.78rem;
  /* 막힌 노드는 흐리게. 앞이 안 풀렸다는 것이 그림에서 바로 읽혀야 한다. */
  opacity: ${p => (p.$dim ? 0.72 : 1)};
`

const BoxHead = styled.div`
  padding: 9px 12px 7px;
  display: flex;
  align-items: baseline;
  gap: 6px;
`

const Alias = styled.div`
  font-weight: 700;
  color: hsl(var(--fg));
  font-size: 0.85rem;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

/**
 * 카드를 빼는 단추.
 *
 * Delete 키에 맡기지 않는다. 카드를 빼면 **연결까지 함께 끊기는데**,
 * reactflow 는 노드를 지울 때 닿은 선도 같이 지운 것으로 쳐서 선 끊기
 * 요청을 따로 또 보낸다 — 서버는 이미 사라진 선을 다시 지우라는 말을
 * 듣게 된다. 확인 창을 거치는 단추 하나가 그 얽힘을 통째로 없앤다.
 */
const Drop = styled.button`
  border: none;
  background: none;
  padding: 0 2px;
  font-size: 0.9rem;
  line-height: 1;
  color: hsl(var(--border-strong));
  cursor: pointer;

  &:hover {
    color: hsl(var(--danger));
  }
`

const Tag = styled.span`
  font-size: 0.63rem;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 999px;
  background: ${p => (p.$loop ? 'hsl(var(--warn-soft))' : 'hsl(var(--info-soft))')};
  color: ${p => (p.$loop ? 'hsl(var(--warn))' : 'hsl(var(--info))')};
  border: 1px solid ${p => (p.$loop ? 'hsl(var(--warn-border))' : 'hsl(var(--info-border))')};
  white-space: nowrap;
`

/** 초기 추정값 표시. 그냥 입력칸과 똑같이 두면 왜 고칠 수 있는지 알 수 없다. */
const Seed = styled.span`
  font-size: 0.63rem;
  font-weight: 700;
  color: hsl(var(--warn));
  background: hsl(var(--warn-soft));
  border: 1px solid hsl(var(--warn-border));
  border-radius: var(--radius-sm);
  padding: 2px 5px;
  white-space: nowrap;
`

const CardName = styled.div`
  color: hsl(var(--fg-subtle));
  font-size: 0.72rem;
  padding: 0 12px 8px;
  border-bottom: 1px solid hsl(var(--border));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

/**
 * 워크플로가 놓인 자리.
 *
 * 뒤에 한 겹 깔린 그림자로 「이 안에 또 있다」 를 말한다. 태그 글자로만 구분하면
 * 그림을 멀리서 훑을 때 카드와 똑같이 보인다.
 */
const Nest = styled(Box)`
  box-shadow: ${p => (p.$picked
    ? '0 0 0 3px hsl(var(--accent) / 0.35), 0 4px 14px rgba(0, 0, 0, 0.14)'
    : `5px 5px 0 -1px hsl(var(--surface)), 6px 6px 0 -1px ${p.$tone},`
      + ' 0 2px 8px rgba(0, 0, 0, 0.08)')};
`

const SubName = styled.button`
  display: block;
  width: 100%;
  padding: 0 12px 8px;
  border: none;
  border-bottom: 1px solid hsl(var(--border));
  background: none;
  text-align: left;
  color: hsl(var(--accent));
  font: inherit;
  font-size: 0.72rem;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &:hover {
    text-decoration: underline;
  }
`

/** 안쪽 어느 카드의 칸인가. 이름이 겹칠 때 이것이 유일한 구분이다. */
const Where = styled.span`
  color: hsl(var(--fg-subtle));
  font-size: 0.66rem;
  margin-right: 4px;

  &::after {
    content: '·';
    margin-left: 4px;
  }
`

const Group = styled.div`
  padding: 6px 0;

  & + & {
    border-top: 1px dashed hsl(var(--border));
  }
`

const GroupLabel = styled.div`
  padding: 0 12px 3px;
  font-size: 0.66rem;
  font-weight: 700;
  color: hsl(var(--fg-subtle));
  letter-spacing: 0.03em;
`

/** 변수 한 줄. 손잡이가 이 줄의 세로 가운데에 붙는다. */
const Row = styled.div`
  position: relative;
  padding: 3px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: ${p => (p.$linked ? 'hsl(var(--accent))' : 'hsl(var(--fg-muted))')};

  .react-flow__handle {
    width: 9px;
    height: 9px;
    background: ${p => (p.$linked ? 'hsl(var(--accent))' : 'hsl(var(--border-strong))')};
    border: 2px solid hsl(var(--surface));
  }
`

const Name = styled.span`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Unit = styled.span`
  color: hsl(var(--fg-subtle));
  font-size: 0.68rem;
  margin-left: 4px;
`

const Field = styled.input`
  width: 80px;
  padding: 3px 6px;
  border: 1px solid hsl(var(--border-strong));
  border-radius: var(--radius-sm);
  font-size: 0.76rem;
  text-align: right;
  font-variant-numeric: tabular-nums;

  &:focus {
    outline: none;
    border-color: hsl(var(--accent));
  }
`

/** 연결로 들어오는 칸. 입력칸처럼 보이면 사람이 고치려 든다. */
const FromLink = styled.span`
  max-width: 118px;
  font-size: 0.7rem;
  color: hsl(var(--accent));
  background: hsl(var(--accent-soft));
  border: 1px solid hsl(var(--accent) / 0.35);
  border-radius: var(--radius-sm);
  padding: 3px 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Out = styled.b`
  font-size: 0.82rem;
  color: ${p => (p.$bad ? 'hsl(var(--danger))' : 'hsl(var(--fg))')};
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
`

const Why = styled.div`
  padding: 4px 12px 2px;
  font-size: 0.72rem;
  line-height: 1.5;
  color: hsl(var(--warn));
`

const Empty = styled.div`
  padding: 3px 12px;
  color: hsl(var(--border-strong));
  font-size: 0.7rem;
`

/**
 * 입력칸 하나.
 *
 * 제어 컴포넌트로 두고 저장된 값이 바뀌면 맞춘다. `defaultValue` 로 두면 저장한
 * 뒤 서버가 값을 다듬었을 때 화면만 옛 글자로 남는다 — 화면과 저장값이 다른 것이
 * 이 화면에서 가장 알아채기 어려운 고장이다.
 */
function ValueField({ value, onCommit }) {
  const [text, setText] = useState(value ?? '')
  useEffect(() => { setText(value ?? '') }, [value])

  return (
    <Field
      // 칸을 끌 때 노드가 따라 움직이지 않도록. reactflow 가 보는 표시다.
      className="nodrag"
      value={text}
      placeholder="값"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { if (text !== String(value ?? '')) onCommit(text) }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
    />
  )
}

/**
 * 노드 하나. 입력은 왼쪽 손잡이(target), 결과는 오른쪽 손잡이(source).
 *
 * 손잡이 id 를 **변수 id 로** 둔다 — 연결이 만들어질 때 그 id 가 그대로 서버로
 * 가므로, 화면이 따로 무엇을 골랐는지 기억할 필요가 없다.
 */
function CardNode({ data, selected }) {
  const {
    alias, cardName, cardDeleted, inputs, outputs, links,
    stored, result, isTerminal, inLoop, onInput, onRemove,
  } = data

  const status = result?.status || STATUS.ok
  const blocked = status === STATUS.blocked
  const tone = cardDeleted ? TONE[STATUS.failed] : TONE[status]

  return (
    <Box $tone={tone} $picked={selected} $dim={blocked}>
      <BoxHead>
        <Alias>{alias}</Alias>
        {inLoop && (
          <Tag $loop title={result?.loop?.converged
            ? `${result.loop.iterations}번 돌려 수렴했습니다`
            : '수렴할 때까지 돌립니다'}>
            ↺ {result?.loop?.converged ? `${result.loop.iterations}회` : '반복'}
          </Tag>
        )}
        {isTerminal && <Tag>결론</Tag>}
        <Drop className="nodrag" title="이 카드를 뺍니다"
              onClick={onRemove}>✕</Drop>
      </BoxHead>
      <CardName>{cardDeleted ? '카드가 휴지통에 있습니다' : cardName}</CardName>

      <Group>
        <GroupLabel>입력</GroupLabel>
        {inputs.length === 0 && <Empty>없음</Empty>}
        {inputs.map(v => {
          const link = links.get(String(v.id))
          return (
            <Row key={v.id} $linked={!!link}>
              <Handle type="target" position={Position.Left} id={String(v.id)} />
              <Name>
                {v.symbol || v.name}
                {v.unit && <Unit>{v.unit}</Unit>}
              </Name>
              {/* **되먹임 입력만은 고칠 수 있다.** 다른 연결된 칸은 앞 노드
                  값에 덮여 무시되지만, 여기 적힌 숫자는 고리가 **출발하는**
                  값이라 사람이 정해 주어야 한다. 그래서 규칙이 뒤집힌다. */}
              {link && !link.feedback ? (
                <FromLink title={`${link.fromAlias}.${link.from_label}`}>
                  ← {link.fromAlias}
                </FromLink>
              ) : (
                <>
                  {link?.feedback && (
                    <Seed title={`'${link.fromAlias}' 에서 되돌아오는 값입니다.`
                      + ' 여기 적는 숫자는 고리를 시작할 추정값입니다.'}>↺ 초기값</Seed>
                  )}
                  <ValueField
                    value={stored[String(v.id)]}
                    onCommit={(next) => onInput(v.id, next)}
                  />
                </>
              )}
            </Row>
          )
        })}
      </Group>

      <Group>
        <GroupLabel>결과</GroupLabel>
        {outputs.length === 0 && <Empty>없음</Empty>}
        {/* 막힌 노드는 **결과를 그리지 않는다.** 빈 칸이 0 으로 보이면 사람은
            그것을 답으로 읽는다. 대신 왜 막혔는지를 적는다. */}
        {blocked && <Why>{result?.message}</Why>}
        {!blocked && outputs.map(v => {
          const cell = result?.results?.[v.id]
          return (
            <Row key={v.id}>
              <Name>
                {v.symbol || v.name}
                {v.unit && <Unit>{v.unit}</Unit>}
              </Name>
              <Out $bad={!!cell?.error} title={cell?.error || ''}>
                {cell?.error ? '계산 실패' : cell ? fmt(cell.value) : '—'}
              </Out>
              <Handle type="source" position={Position.Right} id={String(v.id)} />
            </Row>
          )
        })}
      </Group>
    </Box>
  )
}

/**
 * 묶음 상자.
 *
 * 뒤에 깔리고 클릭을 받지 않는다 — 상자를 눌러 노드를 못 고르면 답답하다.
 * 잡을 곳은 이름표뿐이라, 상자째 옮기려면 이름을 끈다.
 */
function GroupBox({ data }) {
  return (
    <Box2 $color={data.color}>
      <GroupName className="group-grab" $color={data.color}>
        {data.name}
      </GroupName>
    </Box2>
  )
}

/**
 * 자리에 놓인 워크플로.
 *
 * 카드와 **다르게 생겨야 한다.** 같게 그리면 그림만 보고 이 자리가 카드 한 장인지
 * 워크플로 통째인지 알 수 없고, 그 차이가 「고치러 어디를 열어야 하는가」 를
 * 통째로 바꾼다.
 *
 * 손잡이는 **얼굴**이다 — 안쪽의 빈 입력과 결론 결과. 안쪽 중간값은 손잡이가
 * 아예 없어서 이으려야 이을 수가 없다.
 */
function NestedNode({ data, selected }) {
  const {
    alias, subName, subDeleted, face, links,
    stored, result, isTerminal, inLoop, onInput, onRemove, onOpen,
  } = data

  const status = result?.status || STATUS.ok
  const blocked = status === STATUS.blocked
  const tone = subDeleted ? TONE[STATUS.failed] : TONE[status]

  return (
    <Nest $tone={tone} $picked={selected} $dim={blocked}>
      <BoxHead>
        <Alias>{alias}</Alias>
        {inLoop && (
          <Tag $loop title={result?.loop?.converged
            ? `${result.loop.iterations}번 돌려 수렴했습니다`
            : '수렴할 때까지 돌립니다'}>
            ↺ {result?.loop?.converged ? `${result.loop.iterations}회` : '반복'}
          </Tag>
        )}
        {isTerminal && <Tag>결론</Tag>}
        <Drop className="nodrag" title="이 워크플로를 뺍니다"
              onClick={onRemove}>✕</Drop>
      </BoxHead>
      {/* 안은 여기서 못 고친다. 그 워크플로를 열어야 한다는 것을, 이름이
          눌린다는 것으로 알린다. */}
      <SubName className="nodrag" onClick={onOpen}
               title="이 워크플로를 열어 안을 고칩니다">
        ▣ {subDeleted ? '워크플로가 휴지통에 있습니다' : subName}
      </SubName>

      <Group>
        <GroupLabel>입력</GroupLabel>
        {face.inputs.length === 0 && <Empty>없음</Empty>}
        {face.inputs.map(v => {
          const key = slot(v.nodeId, v.variableId)
          const link = links.get(key)
          return (
            <Row key={key} $linked={!!link}>
              <Handle type="target" position={Position.Left} id={key} />
              {/* 어느 카드의 칸인지까지 적어 준다. 「하중 (F)」 만 있으면
                  안에 같은 이름이 셋일 때 어느 것인지 알 수 없다. */}
              <Name title={[...v.path, v.label].join(' / ')}>
                <Where>{v.path[v.path.length - 1]}</Where>
                {v.label}
                {v.unit && <Unit>{v.unit}</Unit>}
              </Name>
              {link && !link.feedback ? (
                <FromLink title={`${link.fromAlias}.${link.from_label}`}>
                  ← {link.fromAlias}
                </FromLink>
              ) : (
                <>
                  {link?.feedback && (
                    <Seed title={`'${link.fromAlias}' 에서 되돌아오는 값입니다.`
                      + ' 여기 적는 숫자는 고리를 시작할 추정값입니다.'}>↺ 초기값</Seed>
                  )}
                  <ValueField value={stored[key]}
                              onCommit={(next) => onInput(key, next)} />
                </>
              )}
            </Row>
          )
        })}
      </Group>

      <Group>
        <GroupLabel>결과</GroupLabel>
        {face.outputs.length === 0 && <Empty>없음</Empty>}
        {blocked && <Why>{result?.message}</Why>}
        {!blocked && face.outputs.map(v => {
          const key = slot(v.nodeId, v.variableId)
          const cell = result?.results?.[key]
          return (
            <Row key={key}>
              <Name title={[...v.path, v.label].join(' / ')}>
                <Where>{v.path[v.path.length - 1]}</Where>
                {v.label}
                {v.unit && <Unit>{v.unit}</Unit>}
              </Name>
              <Out $bad={!!cell?.error} title={cell?.error || ''}>
                {cell?.error ? '계산 실패' : cell ? fmt(cell.value) : '—'}
              </Out>
              <Handle type="source" position={Position.Right} id={key} />
            </Row>
          )
        })}
      </Group>

      {/* 안에서 무엇이 왜 막혔는지. 「하위 워크플로 실패」 만 띄우면 어느 카드를
          열어야 하는지 알 수가 없다. */}
      {status === STATUS.failed && result?.message && <Why>{result.message}</Why>}
    </Nest>
  )
}

const nodeTypes = { card: CardNode, groupBox: GroupBox, nested: NestedNode }

/** 선 위에는 기호만. "전달토크 (T)" 를 통째로 얹으면 선이 글자에 묻힌다. */
function shortLabel(label) {
  const m = /\(([^)]+)\)\s*$/.exec(label || '')
  return m ? m[1] : (label || '')
}

function WorkflowCanvas({
  workflow, cardVariables, run, tools, stale,
  onConnect, onDisconnect, onMove, onInput, onRemove, onRelayout, onSelect,
}) {
  // 배경 점과 미니맵은 SVG 속성으로 색을 받는다 — var() 가 안 풀린다.
  const paint = useTokens(PAINTED)

  /** 미니맵 칸 색. 상태 토큰을 실제 색으로. */
  const miniColor = useCallback((n) => {
    const status = n.data?.result?.status
    if (status === STATUS.blocked) return paint['fg-subtle']
    if (status === STATUS.failed) return paint.warn
    return paint.accent
  }, [paint])
  /**
   * 어느 선이 고리를 닫는 선인가, 어느 노드가 고리 안에 있는가.
   *
   * 계산기와 **같은 함수**로 답한다. 화면이 따로 판단하면 두 벌이 되고, 그때는
   * 초기값을 넣으라고 표시한 칸과 계산기가 읽는 칸이 서로 다른 곳이 된다.
   */
  const loops = useMemo(() => {
    const feedback = new Set()
    const inside = new Set()
    for (const block of executionBlocks(workflow.nodes, workflow.links)) {
      if (!block.loop) continue
      for (const id of block.ids) inside.add(String(id))
      for (const link of block.feedback) feedback.add(String(link.id))
    }
    return { feedback, inside }
  }, [workflow.nodes, workflow.links])

  /** 하위 워크플로가 놓인 자리들. 손잡이 이름 규칙이 여기서 갈린다. */
  const nested = useMemo(() => nestedIds(workflow), [workflow])
  const handle = useCallback(
    (link, side) => handleAt(link, side, nested), [nested])

  /** 어느 입력이 연결로 채워지는가. 편집을 막는 판단의 근거다. */
  const linksByTarget = useMemo(() => {
    const aliasOf = new Map((workflow.nodes || []).map(n => [String(n.id), n.alias]))
    const byNode = new Map()
    for (const link of workflow.links || []) {
      const key = String(link.to_node_id)
      if (!byNode.has(key)) byNode.set(key, new Map())
      byNode.get(key).set(handle(link, 'to'), {
        ...link,
        fromAlias: aliasOf.get(String(link.from_node_id)) || '',
        feedback: loops.feedback.has(String(link.id)),
      })
    }
    return byNode
  }, [workflow.nodes, workflow.links, loops, handle])

  /** 결론 노드 — 아무 데로도 값을 보내지 않는 노드. 답이 나오는 곳이다. */
  const terminals = useMemo(
    () => new Set(terminalNodes(workflow).map(n => String(n.id))),
    [workflow],
  )

  const laidOut = useMemo(() => {
    // 한 번도 배치된 적이 없으면 배선을 따라 자동으로 놓는다. 전부 (0,0) 에
    // 겹쳐 있으면 그림이 아니라 얼룩이 된다.
    if (!needsLayout(workflow.nodes)) return null
    return autoLayout(workflow.nodes, workflow.links)
  }, [workflow.nodes, workflow.links])

  /**
   * 묶음 상자. 멤버가 차지한 자리에서 계산한다 — 상자 좌표를 따로 저장하면
   * 노드를 옮길 때마다 둘이 어긋나고 어느 쪽이 맞는지 정할 수 없다.
   */
  const boxed = useMemo(
    () => groupBoxes(workflow.groups, workflow.nodes, laidOut || {}),
    [workflow.groups, workflow.nodes, laidOut])

  const toNodes = useCallback(() => {
    // 상자가 **먼저** 와야 한다. reactflow 는 부모를 자식보다 앞에서 찾는다.
    const boxes = boxed.boxes.map(box => ({
      id: `group-${box.id}`,
      type: 'groupBox',
      position: { x: box.x, y: box.y },
      style: { width: box.width, height: box.height },
      data: { name: box.name, color: box.color, nodeIds: box.nodeIds },
      draggable: true,
      selectable: false,
      deletable: false,
      zIndex: 0,
      // 이름표만 잡힌다. 상자 아무 데나 끌리면 노드를 고를 수가 없다.
      dragHandle: '.group-grab',
    }))

    const cards = (workflow.nodes || []).map(node => {
    const vars = cardVariables[node.card_id] || []
    const at = laidOut?.[node.id]
    return {
      id: String(node.id),
      type: node.sub_workflow ? 'nested' : 'card',
      // 묶인 노드는 좌표가 **상자 기준**이 된다. 저장은 절대값이라
      // 그릴 때 빼고 저장할 때 더한다.
      ...(boxed.parentOf[node.id]
        ? { parentNode: boxed.parentOf[node.id], extent: 'parent' }
        : {}),
      zIndex: 1,
      // 노드는 이 화면에서 지우지 않는다 — 카드를 빼는 것은 입력값과 연결이
      // 함께 사라지는 일이라 확인을 거쳐야 한다. 막는 자리는 **노드마다**다.
      // ReactFlow 에 `nodesDeletable` 같은 prop 은 없다.
      deletable: false,
      position: toLocal(at || { x: node.layout_x || 0, y: node.layout_y || 0 },
                        boxed.originOf[node.id]),
      data: {
        alias: node.alias,
        cardName: node.card_name,
        cardDeleted: node.card_deleted,
        inputs: vars.filter(v => v.category === 'input'),
        outputs: vars.filter(v => v.category !== 'input'),
        links: linksByTarget.get(String(node.id)) || new Map(),
        stored: node.inputs || {},
        result: run?.nodes?.[node.id],
        isTerminal: terminals.has(String(node.id)),
        inLoop: loops.inside.has(String(node.id)),
        // 중첩 자리만 읽는 것들. 카드 자리에서는 쓰지 않는다.
        subName: node.sub_workflow_name,
        subDeleted: node.sub_workflow_deleted,
        // 얼굴은 **저장하지 않고 매번 유도한다.** 안쪽 배선을 고치는 순간
        // 손잡이가 따라 바뀌어야 하기 때문이다.
        face: node.sub_workflow
          ? workflowInterface(node.sub_workflow, cardVariables)
          : EMPTY_FACE,
        onOpen: () => node.sub_workflow_route
          && window.open(node.sub_workflow_route, '_blank', 'noopener'),
        onInput: (variableId, value) => onInput(node, variableId, value),
        onRemove: () => onRemove(node),
      },
    }
    })
    return [...boxes, ...cards]
  }, [workflow.nodes, cardVariables, laidOut, linksByTarget, run, terminals,
      loops, boxed, onInput, onRemove])

  const toEdges = useCallback(() => (workflow.links || []).map(link => {
    // 선 위에 **흐르는 값**을 적는다. 순서도가 표를 가장 확실하게 이기는 곳이다 —
    // 어디서 값이 튀는지, 어느 가지가 죽었는지 선만 훑어도 보인다.
    const cell = run?.nodes?.[link.from_node_id]?.results?.[handle(link, 'from')]
    const symbol = shortLabel(link.from_label)
    const back = loops.feedback.has(String(link.id))
    // 돌렸는데 값이 없다 = 이 선으로는 아무것도 흐르지 않았다. 실선으로 두면
    // 멀쩡한 배선처럼 보인다.
    const { flowing, dead } = edgeFlow(cell, !!run)
    return {
      id: String(link.id),
      source: String(link.from_node_id),
      sourceHandle: handle(link, 'from'),
      target: String(link.to_node_id),
      targetHandle: handle(link, 'to'),
      // 되돌아가는 선은 곧게 그으면 노드를 뚫고 지나간다. 계단선으로 돌린다.
      type: back ? 'smoothstep' : 'default',
      label: (back ? '↺ ' : '')
        + (flowing ? `${symbol} = ${fmt(cell.value)}` : symbol),
      labelStyle: {
        fontSize: 11,
        fill: dead ? 'hsl(var(--fg-subtle))' : (back ? LOOP : 'hsl(var(--accent))'),
      },
      labelBgStyle: { fill: dead ? 'hsl(var(--border))' : (back ? 'hsl(var(--warn-soft))' : 'hsl(var(--accent-soft))') },
      labelBgPadding: [4, 2],
      labelBgBorderRadius: 4,
      style: {
        stroke: dead ? 'hsl(var(--border-strong))' : (back ? LOOP : 'hsl(var(--accent))'),
        strokeWidth: 1.8,
        strokeDasharray: dead ? '5 4' : (back ? '7 4' : undefined),
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: dead ? 'hsl(var(--border-strong))' : (back ? LOOP : 'hsl(var(--accent))'),
      },
    }
  }), [workflow.links, run, loops, handle])

  const [nodes, setNodes, onNodesChange] = useNodesState(toNodes())
  const [edges, setEdges, onEdgesChange] = useEdgesState(toEdges())

  /**
   * 고른 선을 다시 칠한다.
   *
   * CSS 로 하지 않는 이유: 화살촉은 `marker` 라 클래스로 색을 못 바꾼다.
   * 선만 빨개지고 촉은 보라로 남으면 고른 것인지 고장난 것인지 알 수 없다.
   * 원본 `edges` 는 그대로 두므로 reactflow 의 선택 관리에는 손대지 않는다.
   */
  const painted = useMemo(() => edges.map(edge => (edge.selected ? {
    ...edge,
    style: { ...edge.style, stroke: PICKED, strokeWidth: 2.8 },
    labelStyle: { ...edge.labelStyle, fill: PICKED, fontWeight: 700 },
    labelBgStyle: { fill: 'hsl(var(--danger-soft))' },
    markerEnd: { type: MarkerType.ArrowClosed, color: PICKED },
  } : edge)), [edges])

  // 서버가 준 것이 진실이다. 편집 결과가 돌아오면 그림을 그것으로 다시 그린다 —
  // 화면이 자기 상태를 따로 들고 있으면 실패한 요청 하나에 둘이 어긋난다.
  useEffect(() => { setNodes(toNodes()) }, [toNodes, setNodes])
  useEffect(() => { setEdges(toEdges()) }, [toEdges, setEdges])

  /** 자동 배치한 좌표는 저장해 둔다. 안 그러면 열 때마다 다시 계산된다. */
  useEffect(() => {
    if (laidOut && onRelayout) onRelayout(laidOut)
  }, [laidOut, onRelayout])

  /**
   * 손잡이 이름이 곧 자리다.
   *
   * 카드면 `변수id`, 워크플로면 `안쪽노드:변수id`. 손잡이에 다 적어 두었기 때문에
   * 화면이 「지금 무엇을 고르는 중인가」 를 따로 기억하지 않아도 된다.
   */
  const handleConnect = useCallback((params) => {
    if (!params.sourceHandle || !params.targetHandle) return
    const from = parseSlot(params.sourceHandle, params.source)
    const to = parseSlot(params.targetHandle, params.target)
    onConnect({
      from_node_id: Number(params.source),
      from_inner_node_id: from.inner,
      from_variable_id: from.variable,
      to_node_id: Number(params.target),
      to_inner_node_id: to.inner,
      to_variable_id: to.variable,
    })
  }, [onConnect])

  return (
    <Frame $stale={stale}>
      <ReactFlow
        nodes={nodes}
        edges={painted}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        // 무엇을 골랐는지 밖에서 알아야 「묶기」 를 띄울 수 있다.
        onSelectionChange={({ nodes: picked }) => onSelect?.(
          (picked || []).filter(n => n.type === 'card').map(n => Number(n.id)))}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        // 옮긴 자리는 손을 뗄 때 한 번만 저장한다. 끄는 동안 매 프레임 보내면
        // 요청이 수백 개가 된다.
        // 묶인 노드는 상자 기준 좌표가 오므로 절대값으로 되돌려 저장한다.
        // 상자를 끌면 자식이 함께 오는데, 자식의 상대 좌표는 그대로이므로
        // **상자에 속한 것들을 모두** 다시 적어야 한다.
        onNodeDragStop={(_, node, dragged) => {
          const moved = dragged?.length ? dragged : [node]
          for (const one of moved) {
            if (one.type === 'groupBox') {
              const was = boxed.boxes.find(b => `group-${b.id}` === one.id)
              if (!was) continue
              const shift = {
                x: one.position.x - was.x,
                y: one.position.y - was.y,
              }
              for (const id of one.data.nodeIds) {
                const src = workflow.nodes.find(n => n.id === id)
                if (!src) continue
                onMove(id, {
                  x: (src.layout_x || 0) + shift.x,
                  y: (src.layout_y || 0) + shift.y,
                })
              }
              continue
            }
            onMove(Number(one.id),
                   toAbsolute(one.position, boxed.originOf[Number(one.id)]))
          }
        }}
        // 선을 골라 Delete 를 누르면 끊는다.
        onEdgesDelete={(removed) => removed.forEach(e => onDisconnect(Number(e.id)))}
        // Windows 는 Delete, Mac 은 Backspace. 하나만 받으면 한쪽 사람은
        // 선이 안 지워진다고 여긴다.
        deleteKeyCode={['Delete', 'Backspace']}
        fitView
        minZoom={0.3}
        proOptions={{ hideAttribution: true }}
      >
        {/* 단추는 그림 위에 얹는다. 그림 밖에 두면 그만큼 그림이 작아진다. */}
        {tools && <Panel position="top-right">{tools}</Panel>}
        <Background gap={18} color={paint.border} />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          maskColor="hsl(0 0% 0% / 0.08)"
          style={{ background: 'hsl(var(--surface-2))' }}
          nodeColor={miniColor}
        />
      </ReactFlow>
    </Frame>
  )
}

export default WorkflowCanvas
