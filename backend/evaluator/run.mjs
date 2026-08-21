/**
 * 서버가 카드 계산을 돌려 보는 다리.
 *
 * **평가기를 파이썬으로 옮겨 적지 않는다.** 두 벌이 되는 순간 어긋나기 시작하고,
 * 그 어긋남은 "화면에서는 맞는데 검증은 통과 못 하는" 형태로 나타나 원인을
 * 찾기가 아주 어렵다. 그래서 프론트가 쓰는 **바로 그 파일**을 node 로 그대로
 * 실행한다. 계산 규칙을 아는 곳은 끝까지 하나다.
 *
 * 옆의 `lib/` 는 배포 패키지를 만들 때 frontend/src/shared/utils 에서 복사해 온
 * 것이다(scripts/ci/package_deploy.ps1). 개발 중에는 그 원본을 직접 가리킨다.
 *
 * 입출력은 stdin/stdout 의 JSON 한 덩어리다. 인자로 넘기면 카드가 조금만 커져도
 * 명령줄 길이 제한에 걸린다.
 *
 *   입력  { "variables": [...], "values": { "<변수id>": 값 } }
 *   출력  { "ok": true, "results": { "<변수id>": {value, error} }, "symbols": {...} }
 *         { "ok": false, "error": "..." }
 */

import { readFileSync } from 'node:fs'

async function main() {
  let payload
  try {
    // BOM 을 떼고 읽는다. Windows PowerShell 5.1 은 네이티브 명령에 파이프로
    // 넘길 때 BOM 을 붙이는데, JSON.parse 는 그 한 글자에 통째로 실패한다.
    // 파이썬 쪽 호출은 BOM 을 안 붙이므로 이 실패는 **패키징 스크립트에서만**
    // 나타난다 — 부르는 쪽마다 다르게 대응하느니 여기서 한 번 치운다.
    payload = JSON.parse(readFileSync(0, 'utf8').replace(/^\uFEFF/, ''))
  } catch (err) {
    process.stdout.write(JSON.stringify({ ok: false, error: `입력을 읽지 못했습니다: ${err.message}` }))
    return
  }

  let calcEngine
  try {
    // 배포본에는 lib/ 가 함께 들어 있고, 개발 중에는 프론트 원본을 본다.
    calcEngine = await import('./lib/calcEngine.js').catch(
      () => import('../../frontend/src/shared/utils/calcEngine.js'),
    )
  } catch (err) {
    process.stdout.write(JSON.stringify({
      ok: false,
      error: `계산기를 불러오지 못했습니다: ${err.message}`,
    }))
    return
  }

  try {
    const { results, symbols } = calcEngine.calculateCard(
      payload.variables || [],
      payload.values || {},
    )
    process.stdout.write(JSON.stringify({ ok: true, results, symbols }))
  } catch (err) {
    // 계산이 통째로 터지는 것은 정의가 깨졌다는 뜻이다. 변수별 오류는 results 에
    // 담겨 오므로 여기까지 오면 그 바깥의 문제다.
    process.stdout.write(JSON.stringify({ ok: false, error: `계산 실패: ${err.message}` }))
  }
}

main()
