/**
 * 워크플로 편집기의 생김새.
 *
 * 컴포넌트에서 떼어 둔 이유는 편집기 본문이 **무엇을 막고 무엇을 허용하는지**로
 * 이미 길기 때문이다. 스타일까지 섞이면 그 판단들이 묻힌다.
 */

import styled from 'styled-components'

/**
 * 화면 전체를 딱 채우고 **페이지는 스크롤하지 않는다.**
 *
 * 순서도는 전체를 한눈에 보라고 그리는 것이라, 그림을 보려고 스크롤을 내리는
 * 순간 그린 이유가 없어진다. 넘치는 것은 안쪽(옆 칸, 표)에서만 스크롤한다.
 */
export const Page = styled.div`
  /* 껍데기가 이미 화면 높이를 잡았다. 여기서 또 100vh 를 쓰면
     사이드바 높이만큼 아래로 넘친다. */
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: hsl(var(--bg));
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
`

/** 머리띠 아래 남는 자리 전부. `100vh` 로 두면 머리띠만큼 아래가 밀린다. */
export const Wrap = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 16px 24px 18px;
  overflow: hidden;
`

/** 순서도 7 : 곁판 3. 그림이 주인공이고 검증·결과는 곁에서 거든다. */
export const Split = styled.div`
  flex: 1;
  display: grid;
  grid-template-columns: 7fr 3fr;
  gap: 14px;
  /* 이것이 없으면 격자 칸이 내용만큼 커져서 바깥이 넘친다. */
  min-height: 0;
`

export const Main = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 0;
`

export const Side = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
`

/** 표 보기의 속. 여기서만 스크롤한다. */
export const Scroll = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
`

/** 순서도 위에 얹는 단추 자리. 그림 밖에 두면 그림이 그만큼 작아진다. */
export const Tools = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
`

/** 카드가 하나도 없을 때. 빈 캔버스를 그리느니 할 일을 가운데 놓는다. */
export const Empty = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: hsl(var(--surface-2));
  border: 1px dashed hsl(var(--border-strong));
  border-radius: var(--radius);
  color: hsl(var(--fg-subtle));
  font-size: 0.88rem;
`

export const ToolButton = styled.button`
  border: 1px solid hsl(var(--border-strong));
  background: hsl(var(--surface));
  border-radius: var(--radius);
  padding: 7px 13px;
  font-size: 0.82rem;
  color: hsl(var(--fg));
  cursor: pointer;
  border: 1px solid hsl(var(--border));
  white-space: nowrap;

  &:hover:not(:disabled) {
    border-color: hsl(var(--accent));
    color: hsl(var(--accent));
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`

/** 보기 전환 한 줄. 이름과 단추는 머리띠가 맡고 여기는 그것만 남았다. */
export const Head = styled.header`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
`

export const DraftTag = styled.span`
  font-size: 0.7rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: hsl(var(--warn-soft));
  color: hsl(var(--warn));
  border: 1px solid hsl(var(--warn-border));
`

export const SectionTitle = styled.h2`
  margin: 22px 0 10px;
  font-size: 1rem;
  color: hsl(var(--fg));
`

export const Panel = styled.section`
  background: hsl(var(--surface));
  border-radius: var(--radius);
  padding: 16px 18px;
  border: 1px solid hsl(var(--border));
`

export const PanelHead = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  color: hsl(var(--fg));
`

const Pill = styled.span`
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
`

export const Bad = styled(Pill)`
  background: hsl(var(--danger-soft));
  color: hsl(var(--danger));
  border: 1px solid hsl(var(--danger-border));
`

export const Warn = styled(Pill)`
  background: hsl(var(--warn-soft));
  color: hsl(var(--warn));
  border: 1px solid hsl(var(--warn-border));
`

export const Good = styled(Pill)`
  background: hsl(var(--ok-soft));
  color: hsl(var(--ok));
  border: 1px solid hsl(var(--ok-border));
`

/** 오류·경고·알림. 세 번째가 필요해진 것은 순환이 오류가 아니게 되면서다. */
const TONES = {
  error: ['hsl(var(--danger-soft))', 'hsl(var(--danger-border))', 'hsl(var(--danger))'],
  warning: ['hsl(var(--warn-soft))', 'hsl(var(--warn-border))', 'hsl(var(--warn))'],
  info: ['hsl(var(--info-soft))', 'hsl(var(--info-border))', 'hsl(var(--info))'],
}

export const Issue = styled.div`
  margin-top: 10px;
  padding: 9px 12px;
  border-radius: var(--radius);
  font-size: 0.84rem;
  line-height: 1.55;
  background: ${p => (TONES[p.$level] || TONES.warning)[0]};
  border: 1px solid ${p => (TONES[p.$level] || TONES.warning)[1]};
  color: ${p => (TONES[p.$level] || TONES.warning)[2]};
`

/** 반복 설정 한 줄. 좁은 곁판이라 이름과 칸이 붙어 있어야 한다. */
export const Knob = styled.label`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 0.8rem;
  color: hsl(var(--fg-muted));
  padding: 5px 0;

  input {
    width: 84px;
    padding: 4px 7px;
    border: 1px solid hsl(var(--border-strong));
    border-radius: var(--radius-sm);
    font-size: 0.8rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
`

/** 반복이 몇 번 돌아 어디까지 좁혀졌는지. 결과를 믿을 근거다. */
export const LoopLine = styled.div`
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 0.78rem;
  color: hsl(var(--warn));
  background: hsl(var(--warn-soft));
  border: 1px solid hsl(var(--warn-border));
  border-radius: var(--radius);
  padding: 6px 10px;
  margin-top: 8px;
  font-variant-numeric: tabular-nums;
`

export const Node = styled.section`
  background: hsl(var(--surface));
  border-radius: var(--radius);
  padding: 16px 18px;
  margin-bottom: 12px;
  border: 1px solid hsl(var(--border));
  border-left: 4px solid ${p => (p.$bad ? 'hsl(var(--warn))' : 'hsl(var(--accent))')};
`

export const NodeHead = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
`

export const NodeName = styled.span`
  font-size: 1rem;
  font-weight: 600;
  color: hsl(var(--fg));
`

export const NodeCard = styled.span`
  font-size: 0.78rem;
  color: hsl(var(--fg-subtle));
  margin-right: auto;
`

export const Inputs = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 8px 16px;
`

export const InputRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.85rem;
`

export const VarName = styled.span`
  color: hsl(var(--fg-muted));
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

export const Unit = styled.span`
  color: hsl(var(--fg-subtle));
  margin-left: 5px;
  font-size: 0.76rem;
`

export const Value = styled.input`
  width: 110px;
  padding: 6px 9px;
  border: 1px solid hsl(var(--border-strong));
  border-radius: var(--radius);
  font-size: 0.85rem;
`

/** 연결로 들어오는 칸. 입력칸처럼 보이면 사람이 고치려 든다. */
export const Linked = styled.span`
  width: 160px;
  font-size: 0.76rem;
  color: hsl(var(--accent));
  background: hsl(var(--accent-soft));
  border: 1px solid hsl(var(--accent) / 0.35);
  border-radius: var(--radius);
  padding: 5px 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

export const Link = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: hsl(var(--surface));
  border-radius: var(--radius);
  padding: 11px 16px;
  margin-bottom: 8px;
  font-size: 0.86rem;
  color: hsl(var(--fg-muted));
  border: 1px solid hsl(var(--border));
`

export const LinkForm = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  background: hsl(var(--surface));
  border-radius: var(--radius);
  padding: 12px 16px;
  border: 1px solid hsl(var(--border));
`

export const Select = styled.select`
  padding: 7px 9px;
  border: 1px solid hsl(var(--border-strong));
  border-radius: var(--radius);
  font-size: 0.83rem;
  background: hsl(var(--surface));
  max-width: 220px;

  &:disabled {
    background: hsl(var(--surface-2));
    color: hsl(var(--fg-subtle));
  }
`

export const Add = styled.button`
  border: 1px dashed hsl(var(--border-strong));
  background: none;
  border-radius: var(--radius);
  padding: 10px 16px;
  font-size: 0.85rem;
  color: hsl(var(--fg-muted));
  cursor: pointer;

  &:hover {
    border-color: hsl(var(--accent));
    color: hsl(var(--accent));
  }
`

export const Primary = styled.button`
  padding: 8px 18px;
  border: none;
  border-radius: var(--radius);
  background: hsl(var(--fg));
  color: hsl(var(--solid-fg));
  font-size: 0.85rem;
  cursor: pointer;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`

export const Small = styled.button`
  border: 1px solid hsl(var(--border-strong));
  background: hsl(var(--surface));
  border-radius: var(--radius);
  padding: 5px 11px;
  font-size: 0.78rem;
  color: hsl(var(--fg-muted));
  cursor: pointer;

  &:hover {
    border-color: hsl(var(--danger));
    color: hsl(var(--danger));
  }
`

export const Picker = styled.div`
  background: hsl(var(--surface));
  border-radius: var(--radius);
  padding: 14px 16px;
  margin-top: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  max-height: 320px;
  overflow-y: auto;
`

export const PickerHead = styled.div`
  font-size: 0.82rem;
  font-weight: 700;
  color: hsl(var(--fg-muted));
  margin-bottom: 8px;
`

export const PickItem = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  border: none;
  background: none;
  padding: 8px 6px;
  font-size: 0.88rem;
  color: hsl(var(--fg));
  cursor: pointer;
  border-bottom: 1px solid hsl(var(--surface-2));

  &:hover {
    background: hsl(var(--surface-2));
  }
`

export const Muted = styled.div`
  font-size: 0.85rem;
  color: hsl(var(--fg-subtle));
  line-height: 1.6;
  padding: 6px 0 10px;
`

export const Error = styled.div`
  margin-bottom: 14px;
  padding: 11px 14px;
  border-radius: var(--radius);
  background: hsl(var(--danger-soft));
  border: 1px solid hsl(var(--danger-border));
  color: hsl(var(--danger));
  font-size: 0.85rem;
`

export const Notice = styled.div`
  margin-bottom: 14px;
  padding: 11px 14px;
  border-radius: var(--radius);
  background: hsl(var(--info-soft));
  border: 1px solid hsl(var(--info-border));
  color: hsl(var(--info));
  font-size: 0.85rem;
  cursor: pointer;
`

export const SubTitle = styled.div`
  margin: 16px 0 8px;
  font-size: 0.8rem;
  font-weight: 700;
  color: hsl(var(--fg-muted));
`

export const Finals = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
`

export const Final = styled.div`
  border: 1px solid ${p => (p.$bad ? 'hsl(var(--warn-border))' : 'hsl(var(--info-border))')};
  background: ${p => (p.$bad ? 'hsl(var(--warn-soft))' : 'hsl(var(--info-soft))')};
  border-radius: var(--radius);
  padding: 14px 16px;
`

export const FinalName = styled.div`
  font-size: 0.78rem;
  color: hsl(var(--fg-muted));
  margin-bottom: 8px;
`

export const FinalRow = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  font-size: 0.85rem;
  color: hsl(var(--fg-muted));
  padding: 3px 0;

  b {
    font-size: 1.05rem;
    color: hsl(var(--fg));
    font-variant-numeric: tabular-nums;
  }
`

export const SaveBar = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid hsl(var(--border));
`

export const ViewTabs = styled.div`
  display: inline-flex;
  border: 1px solid hsl(var(--border-strong));
  border-radius: var(--radius);
  overflow: hidden;
  background: hsl(var(--surface));
`

export const ViewTab = styled.button`
  border: none;
  padding: 5px 14px;
  font-size: 0.8rem;
  cursor: pointer;
  background: ${p => (p.$on ? 'hsl(var(--fg))' : 'white')};
  color: ${p => (p.$on ? 'white' : 'hsl(var(--fg-muted))')};

  & + & {
    border-left: 1px solid hsl(var(--border-strong));
  }
`

export const CanvasHint = styled.div`
  margin-top: 7px;
  font-size: 0.78rem;
  color: hsl(var(--fg-subtle));
  line-height: 1.6;

  b {
    color: hsl(var(--fg-muted));
  }
`
