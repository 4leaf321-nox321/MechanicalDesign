import styled from 'styled-components'

/**
 * 설정 탭의 뼈대 — 툴바는 **스크롤 밖**, 목록만 스크롤한다.
 *
 * 전에는 ModalBody 하나가 통째로 스크롤하고 툴바를 `position: sticky` 로 붙여
 * 뒀는데, sticky 는 여전히 스크롤 영역 **안**에 있는 것이라 스크롤 위치에 따라
 * 위쪽 여백이 먼저 밀려 올라가는 등 미세하게 흔들린다. 아예 스크롤 컨테이너
 * 바깥으로 빼면 그런 보정이 필요 없다.
 *
 *   <TabPane>                      ModalBody 를 세로로 꽉 채운다
 *     <TabToolbar>...</TabToolbar> 고정. 추가·업로드 줄이 여기 들어간다
 *     <TabScroll>...</TabScroll>   여기만 스크롤한다
 *   </TabPane>
 *
 * `min-height: 0` 이 빠지면 안 된다. flex 자식의 기본 `min-height: auto` 는
 * 내용보다 작아지기를 거부하므로, 목록이 길어지면 TabScroll 이 스크롤되는 대신
 * TabPane 을 밀어 늘려 버린다 — 스크롤바가 아예 안 생긴다.
 */
export const TabPane = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
`

export const TabToolbar = styled.div`
  flex-shrink: 0;
  padding-bottom: 12px;
`

export const TabScroll = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  /* 스크롤바와 내용이 붙지 않게. 아래쪽은 ModalBody 가 padding 을 갖지 않으므로
     마지막 항목이 모달 바닥에 닿지 않도록 여기서 준다. */
  padding-right: 4px;
  padding-bottom: 24px;
`
