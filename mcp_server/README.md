# Mechanical Design MCP 서버

밖의 AI(Claude Code·Claude Desktop 등)가 계산 카드를 읽고 만들게 하는 MCP 서버.

**별도 프로세스·별도 venv 로 돈다.** `mcp` 패키지는 starlette/pydantic 을 끌고
오는데 백엔드는 Flask 다. 한 venv 에 섞으면 서로의 의존성을 밟고, 그 충돌은
배포하는 날에야 드러난다. 여기서는 앱을 import 하지 않고 **REST API 로만**
말한다 — 이 서버가 죽어도 앱은 멀쩡하고, 앱을 고쳐도 여기는 그대로다.

## 만능 토큰이 없다

들어온 요청의 `Authorization` 헤더를 **그대로** 백엔드에 넘긴다. 즉 이 MCP 는
**토큰 주인의 권한으로만** 동작한다.

서버가 자기 자격 증명을 들고 있으면 누가 붙어도 무엇이든 할 수 있게 되고,
"누가 만든 카드인지" 도 전부 그 하나로 뭉개진다. 그래서 토큰이 없으면 인증
없이 나가고 백엔드가 401 로 막는다 — **조용히 통과하는 길을 두지 않는다.**

## 설치·실행

```powershell
cd mcp_server
py -3.13 -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt

$env:MD_API_BASE = 'http://127.0.0.1:5176'
.\venv\Scripts\python.exe server.py
# → streamable-http, 기본 http://127.0.0.1:3010/mcp
```

서버에 설치할 때는 `scripts\deploy\install-mcp.ps1` 이 venv 생성부터 Windows
서비스 등록까지 한다.

### 환경 변수

| 변수 | 기본값 | 뜻 |
|---|---|---|
| `MD_API_BASE` | `http://127.0.0.1:5176` | 백엔드 주소 |
| `MCP_HOST` | `0.0.0.0` | 바인딩 주소. 이 서버 안에서만 쓰려면 `127.0.0.1` |
| `MCP_PORT` | `3010` | |
| `MCP_JSON_RESPONSE` | (꺼짐) | `1` 이면 SSE 대신 단발 JSON |

`MCP_HOST` 의 기본이 `0.0.0.0` 인 것은 일부러다. 전에는 루프백만 열어 두고
"필요하면 켜라" 였는데, 그러면 등록 명령을 복사해 간 사람이 연결이 안 되는
이유를 한참 찾는다 — 주소도 맞고 서버도 떠 있는데 닿지를 않는다.

열어 두어도 되는 이유는 이 서버가 **자기 자격 증명을 갖지 않기** 때문이다.
들어온 토큰을 백엔드에 넘길 뿐이고, 토큰이 없거나 틀리면 백엔드가 401 로 막는다.
앱 백엔드도 이미 같은 조건으로 열려 있다.

정말 이 서버 안에서만 쓰려면 `MCP_HOST=127.0.0.1` 로 막는다.

`MCP_JSON_RESPONSE=1` 은 **SSE 를 버퍼링하는 프록시·보안장비**를 통과하기 위한
탈출구다. 그런 장비가 끼면 initialize 응답의 첫 바이트가 클라이언트까지 닿지
못해 "붙는데 아무 응답이 없다 → 타임아웃" 이 난다. 이 서버는 진행률 스트리밍을
쓰지 않으므로 켜도 잃는 것이 없다.

## 만든 카드는 초안이다

MCP 로 만든 카드는 **만든 사람과 관리자에게만** 보인다. 사람이 웹에서 열어
**게시하기** 를 눌러야 모두가 쓸 수 있게 된다. 토큰으로는 게시할 수 없다 —
일부러 그렇게 두었다.

검증이 보는 것은 "계산이 도는가" 이지 "공학적으로 맞는가" 가 아니다. 단위가
어긋났거나 계수를 잘못 골랐어도 숫자는 멀쩡히 나오고, 그 카드로 사람이 설계
판단을 한다. 그래서 만드는 것과 올리는 것 사이에 사람 한 명을 세운다.

### 흔적이 남는다

게시하고 나면 사람이 손으로 짠 카드와 AI 가 초안을 잡은 카드가 똑같이 생긴다.
나중에 그 계산이 이상하다는 얘기가 나왔을 때 어디를 먼저 볼지가 달라지므로,
카드에 두 가지를 남긴다.

    origin          누가 시작했는가 ('human' | 'mcp'). 한 번 정해지면 안 바뀐다
    ai_touched_at   기계가 마지막으로 **쓴** 시각. 읽기는 남지 않는다

`origin` 만 두면 거짓말이 된다 — 사람이 만든 카드를 AI 가 전부 고쳐도 계속
'human' 이다. 그래서 둘을 나눴다.

`ai_touched_at` 이 `published_at` 보다 나중이면 **사람이 확인한 뒤에 기계가 또
손댔다**는 뜻이고, 화면에 "게시 후 AI 수정됨" 이 붉게 뜬다. 게시 기록은 지우지
않는다 — 그 사람이 그때 확인한 것은 사실이고, 다만 지금 내용이 다를 뿐이다.

> 지금은 게시된 카드를 기계가 고치는 것을 **막지 않고 표시만 한다.** 막는 편이
> 나은지는 쓰면서 판단할 문제라 열어 두었다.

## 클라이언트 등록

먼저 앱에 로그인해 **내 액세스 토큰** 화면(`/tokens`)에서 토큰을 발급받는다.
원문은 그 자리에서 한 번만 보인다.

```bash
claude mcp add --transport http mechanicaldesign http://<서버주소>:3010/mcp \
  --header "Authorization: Bearer mdt_..."
```

Gemini CLI 는 명령 한 줄이나 설정 파일, 어느 쪽이든 된다:

```bash
gemini mcp add --transport http mechanicaldesign http://<서버주소>:3010/mcp \
  --header "Authorization: Bearer mdt_..."
```

```jsonc
// ~/.gemini/settings.json (또는 프로젝트의 .gemini/settings.json)
{
  "mcpServers": {
    "mechanicaldesign": {
      "httpUrl": "http://<서버주소>:3010/mcp",
      "headers": { "Authorization": "Bearer mdt_..." }
    }
  }
}
```

`httpUrl` 이어야 한다 — `url` 은 옛 SSE 전송용 키라서 이 서버(streamable-http)와
맞지 않는다. 그대로 복사할 예시가 [gemini-settings.example.json](gemini-settings.example.json) 에 있다.

### 손으로 확인하는 법 — 406 은 고장이 아니다

브라우저나 Postman 으로 찔러 보면 이런 응답이 온다:

    Not Acceptable: Client must accept both application/json and text/event-stream

**규격이 요구하는 동작이다.** streamable-http 서버는 요청마다 응답을 단발
JSON 으로 줄지 SSE 스트림으로 줄지 고를 수 있어서, 클라이언트가 **둘 다 받을
수 있다고 미리 선언해야**(`Accept` 헤더) 대화가 성립한다. MCP 클라이언트는
이 헤더를 알아서 붙이므로, 이 에러가 보였다면 그 요청은 MCP 클라이언트가
아니라 일반 HTTP 도구에서 온 것이다.

살았는지 손으로 확인하려면 규격대로 보내면 된다:

```bash
curl -s -X POST http://<서버주소>:3010/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}'
```

`serverInfo` 가 담긴 200 이 오면 정상이다. `MCP_JSON_RESPONSE=1` 로 띄운
서버는 단발 JSON 으로만 답하므로 `Accept: application/json` 만으로도 받는다.

## 사용 안내는 서버가 준다 — 깔 것이 없다

도구 선택·절차·수식 문법 같은 안내는 **서버가 쥐고**(`guide/GUIDE.md`)
`get_guide()` 도구로 내려준다. 그 도구의 설명 자체가 "작업 전에 먼저 부르라"고
되어 있고, **도구 설명은 항상 모델에게 보이므로** 클라이언트 쪽에 아무것도
설치할 필요가 없다.

안내를 고칠 때는 `guide/GUIDE.md` 만 고치면 된다. 호출할 때마다 읽으므로
**서버를 다시 띄울 필요도 없다.**

## 도구

| 도구 | 하는 일 |
|---|---|
| `get_guide(topic?)` | 사용 안내. **작업 전에 먼저** |
| `whoami()` | 이 토큰이 누구인지 — 인증 문제를 먼저 걸러 낸다 |
| `list_cards()` / `get_card(id)` | 읽기. `get_card` 는 컨테이너·변수·이미지를 한 번에 |
| `list_table_templates(var_type?)` | 미리 정의된 표 |
| `create_card` / `create_container` | 만들기 |
| `create_variable` / `update_variable` / `delete_variable` | 변수 |
| `set_widget_layout` | 화면 배치(통째로 교체) |
| **`validate_card(id, values?)`** | **고친 뒤 반드시** — 실제로 계산되는지 |
| `list_my_drafts()` | 아직 사람에게 넘기지 않은 내 카드 |
| `save_record` / `list_records` | 계산 결과를 기록으로 남기고 찾기 |

### validate_card 가 이 서버의 존재 이유다

서버는 수식을 글자로 저장할 뿐 말이 되는지 보지 않는다. 사람이 화면에서 만들
때는 만든 사람이 바로 계산 버튼을 눌러 확인하지만, API 로 만들면 그 확인이
없다. **AI 가 만든 정의는 특히 그럴듯하게 틀린다** — 없는 기호를 참조하거나,
단계를 거슬러 참조하거나, 서로를 참조해 영영 풀리지 않는다.

`validate_card` 는 정적 검사(기호·순환 참조·정의 완결성)와 시험 계산(화면과
**같은 계산기**로 실제로 돌려 보기)을 함께 한다. `ok: true` 는 문제가 없고
계산까지 실제로 돌았을 때만 나온다. `trial_skipped` 에 사유가 있으면 계산은 안
돌아 본 것이니 그 통과는 통과가 아니다(서버에 Node.js 가 없는 경우다).

## 테스트

```powershell
.\venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\venv\Scripts\python.exe -m pytest tests -q
```

지키는 것은 **자격 증명이 흐르는 방향**이다. 토큰을 안 넘기면 401 이 나서 금방
알지만, 토큰 없이도 통과하게 되면 아무도 모른다.
