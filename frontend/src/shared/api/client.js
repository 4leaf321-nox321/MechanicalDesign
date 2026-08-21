/**
 * API 클라이언트.
 *
 * **access 토큰은 여기 메모리에만 둔다.** localStorage 에 두면 XSS 한 번에
 * 탈취된다. 새로고침하면 사라지지만 refresh 쿠키(httpOnly)로 다시 받아오므로
 * 사용자 눈에는 로그인이 유지되는 것으로 보인다.
 *
 * 절대 주소를 갖지 않는다. 개발에서는 Vite 프록시가, 배포에서는 같은 프로세스가
 * `/api` 를 받는다. 주소를 빌드에 구우면 값이 빠졌을 때 사용자 브라우저가 자기
 * PC 를 부르는 사고가 난다(패키징 스크립트가 그 흔적을 검사한다).
 */

const BASE = import.meta.env.VITE_API_URL || '/api'

let accessToken = null
let onSessionLost = null
let refreshInFlight = null

export const session = {
  setToken(token) {
    accessToken = token
  },
  getToken() {
    return accessToken
  },
  /** 갱신까지 실패했을 때 호출된다 — AuthProvider 가 로그인 화면으로 보낸다. */
  onLost(handler) {
    onSessionLost = handler
  },
}

export class ApiError extends Error {
  constructor(status, body) {
    super((body && body.error) || `요청이 실패했습니다 (HTTP ${status})`)
    this.name = 'ApiError'
    this.status = status
    this.code = (body && body.code) || null
    this.details = (body && body.details) || {}
  }
}

async function parseError(response) {
  let body = null
  try {
    body = await response.json()
  } catch {
    // 오류 응답이 JSON 이 아니면 규약 밖이다 — 그 사실 자체를 드러낸다.
    body = { error: `서버가 예상하지 못한 응답을 보냈습니다 (HTTP ${response.status})` }
  }
  return new ApiError(response.status, body)
}

function send(path, init) {
  // FormData 일 때 Content-Type 을 직접 넣으면 **안 된다.** multipart 는 본문에
  // boundary 문자열이 필요한데, 브라우저가 헤더를 만들 때 그것을 붙여 준다.
  // 우리가 'multipart/form-data' 만 적으면 boundary 가 빠져 서버가 못 읽는다.
  const isForm = init && init.body instanceof FormData
  const headers = { ...((init && init.headers) || {}) }
  if (!isForm && init && init.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`

  return fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'same-origin', // refresh 쿠키
    headers,
  })
}

/**
 * 조용한 갱신. 성공하면 새 access 토큰을 보관한다.
 *
 * 동시에 여러 요청이 401 을 받으면 갱신도 그만큼 시도되는데, refresh 는
 * **회전**하므로 두 번째 갱신은 이미 폐기된 토큰을 쓰게 된다. 서버는 그것을
 * 탈취로 보고 전 세션을 끊는다 — 화면 하나에서 요청 두 개가 동시에 만료됐을
 * 뿐인데 로그아웃되는 것이다. 진행 중인 갱신이 있으면 그것을 함께 기다린다.
 */
export function tryRefresh() {
  if (refreshInFlight) return refreshInFlight

  refreshInFlight = fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'same-origin',
  })
    .then(async (response) => {
      if (!response.ok) return false
      const body = await response.json()
      accessToken = body.access_token
      return true
    })
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null
    })

  return refreshInFlight
}

/**
 * `fetch` 를 그대로 대신한다 — 경로 앞에 `/api` 를 붙이고, 토큰을 싣고,
 * 401 이면 한 번 조용히 갱신한 뒤 재시도한다.
 *
 * 응답 객체를 그대로 돌려주므로 기존 호출부의 `res.ok` · `res.json()` 처리를
 * 바꾸지 않아도 된다.
 */
export async function apiFetch(path, init) {
  let response = await send(path, init)

  // `/auth/*` 는 제외한다 — 갱신 자체가 실패한 상황에서 무한 재귀가 된다.
  if (response.status === 401 && !path.startsWith('/auth/')) {
    if (await tryRefresh()) {
      response = await send(path, init)
    } else if (onSessionLost) {
      onSessionLost()
    }
  }
  return response
}

async function request(path, init) {
  const response = await apiFetch(path, init)
  if (!response.ok) throw await parseError(response)
  if (response.status === 204) return null
  const text = await response.text()
  return text ? JSON.parse(text) : null
}

export const api = {
  get: (path) => request(path),
  post: (path, body) =>
    request(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: (path) => request(path, { method: 'DELETE' }),
}

/**
 * 이미지·파일을 objectURL 로 받아 온다.
 *
 * **`<img src="/api/...">` 로는 안 된다.** access 토큰은 메모리에만 있고 쿠키가
 * 아니므로, 브라우저가 스스로 여는 요청에는 실리지 않는다. 그래서 평범한
 * `<img>` 는 항상 401 이 나는데, 그 실패는 화면에 깨진 이미지로만 보여서
 * "왜 안 보이는지" 를 알 방법이 없다.
 *
 * 다 쓰면 반드시 `URL.revokeObjectURL` 로 돌려줘야 한다 — 안 하면 탭을 닫을
 * 때까지 메모리에 남는다. AuthedImage 가 그 뒷정리를 한다.
 */
export async function fetchBlobUrl(path) {
  const response = await apiFetch(path)
  if (!response.ok) throw await parseError(response)
  return URL.createObjectURL(await response.blob())
}
