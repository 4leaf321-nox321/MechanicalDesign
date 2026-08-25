/**
 * 선 하나가 지금 어떤 상태인가.
 *
 * 캔버스에서 떼어 둔 이유는 이 판단이 **한 번 틀려서 화면을 통째로 죽였기**
 * 때문이다. 「값이 있는가」와 「죽은 선인가」를 한 조건으로 묶었더니, 아직
 * 계산하기 전(`ran === false`)이 "값이 흐른다" 쪽으로 떨어져 없는 값을 읽었다.
 *
 * 두 물음은 서로 다르다:
 *
 *     flowing  이 선으로 값이 흘렀는가   → 선 위에 숫자를 적을 수 있는가
 *     dead     돌렸는데 못 흘렀는가      → 회색 점선으로 죽여야 하는가
 *
 * 아직 안 돌렸으면 둘 다 아니다 — 숫자도 없고, 죽은 것도 아니다.
 */

/**
 * @param cell 보내는 쪽 결과 칸. `{ value }` 또는 `{ error }`, 없을 수도 있다.
 * @param ran  계산이 실제로 돌았는가. 검증 오류가 있으면 돌지 않는다.
 */
export function edgeFlow(cell, ran) {
  const flowing = !!cell && !cell.error
  return { flowing, dead: !!ran && !flowing }
}

export default edgeFlow
