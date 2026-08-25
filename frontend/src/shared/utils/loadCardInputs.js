/**
 * 기록의 입력값을 지금 카드에 맞춘다.
 *
 * **id 로 맞추고, 없으면 기호로 맞춘다.**
 *
 * 기록의 입력값은 변수 id 로 키잉돼 있다. 그런데 카드는 그 뒤로 바뀐다 — 변수를
 * 지웠다 다시 만들면 기호는 같아도 id 가 달라진다. id 만 보면 그런 변수가 조용히
 * 빠진 채 "불러왔습니다" 가 뜨고, 사람은 빈칸을 못 보고 계산한다.
 *
 * 그래서 못 맞춘 것이 있으면 **몇 개가 빠졌는지 말해 준다.** 조용한 실패보다
 * 시끄러운 성공이 낫다.
 *
 * 고르는 창은 `RecordPicker` 가 맡는다. 카드와 워크플로가 같은 창을 쓰고,
 * 값을 맞추는 규칙만 서로 다르다.
 */

/**
 * 기록의 입력값을 지금 카드의 변수에 맞춘다.
 *
 * `{ values, matched, missing }` 를 돌려준다. `missing` 은 기록에는 있었지만
 * 지금 카드에서 자리를 못 찾은 입력의 이름들이다.
 */
export function mapRecordInputs(record, variables) {
  const inputs = record.inputs || {}
  const snapshot = record.definition_snapshot || []

  const byId = new Map(variables.map((v) => [String(v.id), v]))
  // 기호는 카드 안에서 유일하다. 겹친 기호가 있으면 먼저 만든 쪽을 쓴다 —
  // 어느 쪽이든 틀릴 수 있지만, 그건 카드가 이미 경고를 받고 있는 상태다.
  const bySymbol = new Map()
  for (const v of variables) {
    if (v.symbol && !bySymbol.has(v.symbol)) bySymbol.set(v.symbol, v)
  }
  const snapById = new Map(snapshot.map((v) => [String(v.id), v]))

  const values = {}
  const missing = []
  let matched = 0

  for (const [recVarId, value] of Object.entries(inputs)) {
    let target = byId.get(recVarId)
    if (!target) {
      // id 가 안 맞으면 그때의 기호로 다시 찾는다. 변수를 지웠다 다시 만들면
      // 기호는 같고 id 만 달라진다.
      const snap = snapById.get(recVarId)
      if (snap?.symbol) target = bySymbol.get(snap.symbol)
      if (!target && snap?.name) {
        target = variables.find((v) => v.name === snap.name)
      }
      if (!target) {
        missing.push(snap?.name || snap?.symbol || `변수 ${recVarId}`)
        continue
      }
    }
    values[target.id] = value
    matched += 1
  }

  return { values, matched, missing }
}

export default mapRecordInputs
