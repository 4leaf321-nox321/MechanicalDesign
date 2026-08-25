/**
 * 워크플로 편집기의 생김새.
 *
 * 컴포넌트에서 떼어 둔 이유는 편집기 본문이 **무엇을 막고 무엇을 허용하는지**로
 * 이미 길기 때문이다. 스타일까지 섞이면 그 판단들이 묻힌다.
 */

import styled from 'styled-components'

export const Wrap = styled.div`
  min-height: 100vh;
  background: #f0f2f5;
  padding: 28px 40px 60px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
`

export const Head = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 20px;
`

export const Back = styled.button`
  border: none;
  background: none;
  color: #6b7280;
  font-size: 0.83rem;
  cursor: pointer;
  padding: 0 0 8px;

  &:hover {
    color: #3498db;
  }
`

export const Title = styled.h1`
  margin: 0 0 4px;
  font-size: 1.5rem;
  color: #1a1a2e;
  display: flex;
  align-items: center;
  gap: 10px;
`

export const Sub = styled.p`
  margin: 0;
  font-size: 0.85rem;
  color: #98a2b3;
`

export const DraftTag = styled.span`
  font-size: 0.7rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
  background: #fff4d6;
  color: #8a6d1a;
  border: 1px solid #f0d98c;
`

export const SectionTitle = styled.h2`
  margin: 30px 0 12px;
  font-size: 1rem;
  color: #1a1a2e;
`

export const Panel = styled.section`
  background: white;
  border-radius: 10px;
  padding: 16px 18px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
`

export const PanelHead = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  color: #1a1a2e;
`

const Pill = styled.span`
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
`

export const Bad = styled(Pill)`
  background: #fdecea;
  color: #a4343a;
  border: 1px solid #f5c6cb;
`

export const Warn = styled(Pill)`
  background: #fff4d6;
  color: #8a6d1a;
  border: 1px solid #f0d98c;
`

export const Good = styled(Pill)`
  background: #eaf6ee;
  color: #2f6b3f;
  border: 1px solid #cbe6d5;
`

export const Issue = styled.div`
  margin-top: 10px;
  padding: 9px 12px;
  border-radius: 6px;
  font-size: 0.84rem;
  line-height: 1.55;
  background: ${p => (p.$bad ? '#fdf3f2' : '#fffdf3')};
  border: 1px solid ${p => (p.$bad ? '#f5d9d6' : '#f0e2b6')};
  color: ${p => (p.$bad ? '#a33a2c' : '#7a6320')};
`

export const Node = styled.section`
  background: white;
  border-radius: 10px;
  padding: 16px 18px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  border-left: 4px solid ${p => (p.$bad ? '#e08b6a' : '#6c5ce7')};
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
  color: #1a1a2e;
`

export const NodeCard = styled.span`
  font-size: 0.78rem;
  color: #98a2b3;
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
  color: #4b5563;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

export const Unit = styled.span`
  color: #98a2b3;
  margin-left: 5px;
  font-size: 0.76rem;
`

export const Value = styled.input`
  width: 110px;
  padding: 6px 9px;
  border: 1px solid #d5dae2;
  border-radius: 6px;
  font-size: 0.85rem;
`

/** 연결로 들어오는 칸. 입력칸처럼 보이면 사람이 고치려 든다. */
export const Linked = styled.span`
  width: 160px;
  font-size: 0.76rem;
  color: #5b4bb5;
  background: #efeaff;
  border: 1px solid #ddd5f7;
  border-radius: 6px;
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
  background: white;
  border-radius: 8px;
  padding: 11px 16px;
  margin-bottom: 8px;
  font-size: 0.86rem;
  color: #4b5563;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
`

export const LinkForm = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  background: white;
  border-radius: 8px;
  padding: 12px 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
`

export const Select = styled.select`
  padding: 7px 9px;
  border: 1px solid #d5dae2;
  border-radius: 6px;
  font-size: 0.83rem;
  background: white;
  max-width: 220px;

  &:disabled {
    background: #f6f7f9;
    color: #b0b6c0;
  }
`

export const Add = styled.button`
  border: 1px dashed #cbd2dc;
  background: none;
  border-radius: 8px;
  padding: 10px 16px;
  font-size: 0.85rem;
  color: #6b7280;
  cursor: pointer;

  &:hover {
    border-color: #6c5ce7;
    color: #6c5ce7;
  }
`

export const Primary = styled.button`
  padding: 8px 18px;
  border: none;
  border-radius: 6px;
  background: #1a1a2e;
  color: white;
  font-size: 0.85rem;
  cursor: pointer;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`

export const Small = styled.button`
  border: 1px solid #d5dae2;
  background: white;
  border-radius: 6px;
  padding: 5px 11px;
  font-size: 0.78rem;
  color: #6b7280;
  cursor: pointer;

  &:hover {
    border-color: #c0392b;
    color: #c0392b;
  }
`

export const Picker = styled.div`
  background: white;
  border-radius: 10px;
  padding: 14px 16px;
  margin-top: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  max-height: 320px;
  overflow-y: auto;
`

export const PickerHead = styled.div`
  font-size: 0.82rem;
  font-weight: 700;
  color: #6b7280;
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
  color: #1a1a2e;
  cursor: pointer;
  border-bottom: 1px solid #f4f5f7;

  &:hover {
    background: #f6f9fd;
  }
`

export const Muted = styled.div`
  font-size: 0.85rem;
  color: #98a2b3;
  line-height: 1.6;
  padding: 6px 0 10px;
`

export const Error = styled.div`
  margin-bottom: 14px;
  padding: 11px 14px;
  border-radius: 8px;
  background: #fdf3f2;
  border: 1px solid #f5d9d6;
  color: #a33a2c;
  font-size: 0.85rem;
`

export const Notice = styled.div`
  margin-bottom: 14px;
  padding: 11px 14px;
  border-radius: 8px;
  background: #eef6fd;
  border: 1px solid #cfe4f7;
  color: #35618a;
  font-size: 0.85rem;
  cursor: pointer;
`

export const SubTitle = styled.div`
  margin: 16px 0 8px;
  font-size: 0.8rem;
  font-weight: 700;
  color: #6b7280;
`

export const Finals = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
`

export const Final = styled.div`
  border: 1px solid ${p => (p.$bad ? '#f0e2b6' : '#cfe3f7')};
  background: ${p => (p.$bad ? '#fffdf3' : '#f8fbff')};
  border-radius: 8px;
  padding: 14px 16px;
`

export const FinalName = styled.div`
  font-size: 0.78rem;
  color: #6b7280;
  margin-bottom: 8px;
`

export const FinalRow = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  font-size: 0.85rem;
  color: #4b5563;
  padding: 3px 0;

  b {
    font-size: 1.05rem;
    color: #1a1a2e;
    font-variant-numeric: tabular-nums;
  }
`

/** 노드별 한 줄. 상태를 왼쪽 색띠로 — 글자로만 쓰면 훑을 때 안 보인다. */
export const RunRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 7px 12px;
  border-left: 3px solid ${p => (p.$status === 'ok' ? '#5b9bd5'
    : p.$status === 'failed' ? '#e08b6a' : '#cbd2dc')};
  background: #fbfcfd;
  border-radius: 0 6px 6px 0;
  margin-bottom: 5px;
  font-size: 0.83rem;
`

export const RunName = styled.span`
  font-weight: 600;
  color: #1a1a2e;
  min-width: 120px;
`

export const RunVals = styled.span`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  color: #4b5563;
  font-variant-numeric: tabular-nums;
`

export const RunWhy = styled.span`
  color: #8a6d1a;
`

export const SaveBar = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid #eef0f4;
`
