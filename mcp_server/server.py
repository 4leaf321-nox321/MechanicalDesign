"""Mechanical Design MCP 서버 — 밖의 AI 가 계산 카드를 읽고 만들게 하는 도구.

**별도 프로세스·별도 venv 로 돈다.** mcp 패키지는 starlette/pydantic 을 끌고
오는데 백엔드는 Flask 다. 한 venv 에 섞으면 서로의 의존성을 밟고, 그 충돌은
배포하는 날에야 드러난다. 여기서는 앱을 import 하지 않고 **REST API 로만**
말한다 — 그래서 이 서버가 죽어도 앱은 멀쩡하고, 앱을 고쳐도 여기는 그대로다.

**만능 토큰을 쓰지 않는다.** 들어온 요청의 `Authorization` 헤더를 그대로 백엔드에
넘긴다. 즉 이 MCP 는 **토큰 주인의 권한**으로만 동작한다. 서버가 자기 자격 증명을
들고 있으면 누가 붙어도 무엇이든 할 수 있게 되고, "누가 만든 카드인지" 도 전부
그 하나로 뭉개진다.

실행:
    MD_API_BASE=http://127.0.0.1:5176 python server.py
    # streamable-http, 기본 127.0.0.1:3010/mcp

Claude Code 등록:
    claude mcp add --transport http mechanicaldesign http://<host>:3010/mcp \
      --header "Authorization: Bearer mdt_..."
"""

import json
import os
from pathlib import Path

import httpx
from mcp.server.mcpserver import Context, MCPServer

API_BASE = os.environ.get('MD_API_BASE', 'http://127.0.0.1:5176').rstrip('/')

# 기본은 SSE 스트림 응답. 그런데 중간에 SSE 를 버퍼링하는 프록시·보안장비가 끼면
# initialize 응답의 첫 바이트가 클라이언트까지 닿지 못해 "무응답 → 타임아웃" 이
# 난다(스트림이 안 끝나니 프록시가 붙잡고 안 흘려보낸다). 사내망 배포에서 흔한
# 실패라 빠져나갈 구멍을 둔다 — 1 이면 단발 JSON 으로 돌려준다. 이 서버는
# 진행률 스트리밍을 쓰지 않으므로 잃는 것이 없다.
_JSON_RESPONSE = os.environ.get('MCP_JSON_RESPONSE') == '1'

GUIDE_DIR = Path(__file__).parent / 'guide'

mcp = MCPServer('mechanicaldesign')


# --- 백엔드와의 통신 ------------------------------------------------------------


def _headers(ctx):
    """들어온 요청의 인증 헤더를 그대로 백엔드로 넘긴다.

    `X-Client: mcp` 를 함께 붙인다. 토큰만으로는 사람이 웹에서 한 일과 AI 가
    MCP 로 한 일을 구분할 수 없는데, 나중에 "이 카드는 AI 가 만들었다" 를
    표시하려면 그 구분이 로그에 남아 있어야 한다. **권한 경계가 아니다** —
    권한은 어디까지나 토큰 주인의 것이다.
    """
    headers = {'X-Client': 'mcp'}
    # stdio 로 붙으면 HTTP 헤더가 없다(None). 그때는 인증 없이 나가고 백엔드가
    # 401 로 답한다 — 여기서 조용히 통과시킬 수 있는 길은 없어야 한다.
    incoming = ctx.headers or {}
    value = incoming.get('authorization') or incoming.get('Authorization')
    if value:
        headers['Authorization'] = value
    return headers


def _unwrap(response):
    """백엔드 응답 → 파이썬 값. 실패는 예외 대신 `{"error": ...}` 로 돌려준다.

    모델에게는 예외보다 읽을 수 있는 오류가 낫다. 무엇이 잘못됐는지 글자로
    받아야 다음 수를 고칠 수 있고, 스택 트레이스는 그 판단에 아무 도움이 안 된다.
    """
    try:
        body = response.json()
    except ValueError:
        return {'error': f'HTTP {response.status_code} — 응답이 JSON 이 아닙니다.'}

    if response.status_code >= 400:
        out = {'error': body.get('error') or f'HTTP {response.status_code}'}
        if body.get('code'):
            out['code'] = body['code']
        if response.status_code == 401:
            out['hint'] = ('토큰이 없거나 유효하지 않습니다. 앱의 "내 액세스 토큰" 화면에서 '
                           '새로 발급해 MCP 등록의 Authorization 헤더에 넣으세요.')
        return out
    return body


async def _call(ctx, method, path, *, params=None, json_body=None):
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.request(
            method, f'{API_BASE}{path}',
            headers=_headers(ctx), params=params, json=json_body,
        )
    return _unwrap(response)


# --- 사용 안내 ------------------------------------------------------------------


@mcp.tool()
def get_guide(topic: str = '') -> str:
    """**작업을 시작하기 전에 먼저 부르세요.** 이 시스템의 개념과 절차를 알려 줍니다.

    카드·컨테이너·변수·수식이 서로 어떻게 얽히는지, 변수를 어떤 순서로 만들어야
    하는지, 수식에서 쓸 수 있는 함수가 무엇인지가 여기 있습니다. 짐작으로 만들면
    거의 반드시 틀립니다.

    topic 을 비우면 전체 안내를 돌려줍니다.
    """
    # **안내 본문을 서버가 쥔다.** 클라이언트 쪽 스킬 파일에 두면, 안내를 고쳐도
    # 각자 다시 복사해 간 사람에게만 전달된다. 여기 두면 고치는 즉시 모두에게
    # 반영되고, 서버를 다시 띄울 필요도 없다(호출할 때마다 읽는다).
    name = (topic or 'GUIDE').strip().upper().replace('/', '').replace('\\', '')
    path = GUIDE_DIR / f'{name}.md'
    if not path.exists():
        available = sorted(p.stem for p in GUIDE_DIR.glob('*.md'))
        return f"'{topic}' 안내가 없습니다. 있는 것: {', '.join(available)}"
    return path.read_text(encoding='utf-8')


@mcp.tool()
async def whoami(ctx: Context) -> dict:
    """이 토큰이 누구인지 확인합니다. 붙자마자 한 번 불러 보면 인증 문제를 먼저 걸러 냅니다."""
    return await _call(ctx, 'GET', '/api/auth/me')


# --- 읽기 ------------------------------------------------------------------------


@mcp.tool()
async def list_cards(ctx: Context) -> list:
    """계산 카드 목록. 각 카드는 하나의 설계 계산(예: 볼트 강도, 베어링 수명)입니다."""
    return await _call(ctx, 'GET', '/api/cards')


@mcp.tool()
async def get_card(ctx: Context, card_id: int) -> dict:
    """카드 하나의 **전체 정의** — 컨테이너·변수·이미지를 한 번에.

    따로따로 부르게 두지 않는 이유: 이 셋은 서로를 참조해서(변수가 컨테이너에
    놓이고, 수식이 다른 변수의 기호를 부른다) 하나만 보고는 판단할 수 없습니다.
    세 번 부르게 하면 그중 하나를 빠뜨린 채 수정하는 일이 생깁니다.
    """
    card = None
    for row in (await _call(ctx, 'GET', '/api/cards')) or []:
        if isinstance(row, dict) and row.get('id') == card_id:
            card = row
            break
    if card is None:
        return {'error': f'카드 {card_id} 를 찾을 수 없습니다.'}

    return {
        'card': card,
        'containers': await _call(ctx, 'GET', f'/api/cards/{card_id}/containers'),
        'variables': await _call(ctx, 'GET', f'/api/cards/{card_id}/variables'),
        'images': await _call(ctx, 'GET', f'/api/cards/{card_id}/images'),
    }


@mcp.tool()
async def list_table_templates(ctx: Context, var_type: str = '') -> list:
    """미리 정의된 표(재질 물성표 등). 변수가 이것을 **참조**하면 원본이 바뀔 때 함께 바뀝니다.

    같은 표를 카드마다 베껴 넣으면, 값이 하나 바뀌었을 때 어느 카드가 옛 값을
    쓰고 있는지 알 수 없게 됩니다. 표를 쓸 일이 있으면 먼저 여기를 보세요.
    """
    params = {'var_type': var_type} if var_type else None
    return await _call(ctx, 'GET', '/api/templates', params=params)


# --- 쓰기 ------------------------------------------------------------------------


@mcp.tool()
async def create_card(ctx: Context, name: str, description: str = '') -> dict:
    """새 계산 카드를 만듭니다. **초안으로 만들어집니다.**

    여기서 만든 카드는 당신과 관리자에게만 보이고, 다른 사람의 목록에는
    나타나지 않습니다. 사람이 웹에서 열어 숫자를 확인하고 **게시** 를 눌러야
    모두가 쓸 수 있게 됩니다.

    게시는 도구로 할 수 없습니다 — 일부러 그렇게 두었습니다. 카드는 사람이
    설계 판단에 쓰는 것이고, 계산이 돈다는 것과 공학적으로 맞다는 것은 전혀
    다른 얘기이기 때문입니다. 단위가 어긋났거나 계수를 잘못 골랐어도 숫자는
    멀쩡히 나옵니다.

    그러니 다 만든 뒤에는 **사람에게 넘기세요** — `validate_card()` 로 나온
    실제 숫자를 보여 주고, 웹에서 확인해 게시해 달라고 하세요.
    """
    return await _call(ctx, 'POST', '/api/cards',
                       json_body={'name': name, 'description': description})


@mcp.tool()
async def create_container(ctx: Context, card_id: int, name: str,
                           container_type: str = 'default',
                           column_count: int = 1) -> dict:
    """컨테이너(화면의 구역)를 만듭니다.

    **컨테이너는 계산을 묶지 않습니다 — 보이는 자리를 나눌 뿐입니다.** 계산은
    카드 전체에서 한 번에 돌기 때문에, 어느 컨테이너에 놓였는지는 값에 아무
    영향이 없습니다. 같은 변수를 두 컨테이너에서 함께 보여 줄 수도 있습니다.

    container_type: default / input / output / hidden
    column_count: 1~6
    """
    return await _call(ctx, 'POST', f'/api/cards/{card_id}/containers', json_body={
        'name': name, 'container_type': container_type, 'column_count': column_count,
    })


@mcp.tool()
async def create_variable(
    ctx: Context,
    card_id: int,
    name: str,
    symbol: str,
    category: str,
    var_type: str,
    formula: str = '',
    unit: str = '',
    options: list | None = None,
    min_value: float | None = None,
    max_value: float | None = None,
    table_data: dict | None = None,
    conditional_data: dict | None = None,
    interp_data: dict | None = None,
) -> dict:
    """변수를 만듭니다. **만들기 전에 `get_guide()` 를 읽으세요.**

    category 는 계산 순서를 정합니다 — input → intermediate → output 순으로 돕니다.
    그래서 **중간값은 결과값을 참조할 수 없습니다**(아직 계산되기 전이라 "알 수
    없는 이름" 이 됩니다). 짐작하기 어려운 규칙이라 안내에 따로 적어 두었습니다.

        category=input        var_type: slider / text / dropdown / array
        category=intermediate var_type: formula / table / conditional / interp_table
        category=output       위와 같음

    symbol 은 수식에서 이 변수를 부르는 이름입니다. 비워 두면 다른 수식에서 쓸 수
    없습니다.
    """
    body = {
        'name': name, 'symbol': symbol, 'category': category, 'var_type': var_type,
        'formula': formula, 'unit': unit,
    }
    if options is not None:
        body['options_data'] = json.dumps(options, ensure_ascii=False)
    if min_value is not None:
        body['min_value'] = min_value
    if max_value is not None:
        body['max_value'] = max_value
    for key, value in (('table_data', table_data),
                       ('conditional_data', conditional_data),
                       ('interp_data', interp_data)):
        if value is not None:
            body[key] = json.dumps(value, ensure_ascii=False)
    return await _call(ctx, 'POST', f'/api/cards/{card_id}/variables', json_body=body)


@mcp.tool()
async def update_variable(
    ctx: Context,
    card_id: int,
    variable_id: int,
    name: str,
    symbol: str,
    category: str,
    var_type: str,
    formula: str = '',
    unit: str = '',
    options: list | None = None,
    min_value: float | None = None,
    max_value: float | None = None,
    table_data: dict | None = None,
    conditional_data: dict | None = None,
    interp_data: dict | None = None,
) -> dict:
    """변수를 고칩니다. **모든 항목을 다 보내세요 — 부분 수정이 아닙니다.**

    보내지 않은 항목은 유지되는 것이 아니라 비워집니다. 먼저 `get_card()` 로 현재
    값을 읽고, 바꿀 것만 바꿔서 통째로 보내세요.

    기호를 바꾸면 그 기호를 쓰던 다른 수식들이 **서버에서 함께 바뀝니다.** 손으로
    따라 고치지 마세요 — 두 번 바뀝니다.
    """
    body = {
        'name': name, 'symbol': symbol, 'category': category, 'var_type': var_type,
        'formula': formula, 'unit': unit,
    }
    if options is not None:
        body['options_data'] = json.dumps(options, ensure_ascii=False)
    if min_value is not None:
        body['min_value'] = min_value
    if max_value is not None:
        body['max_value'] = max_value
    for key, value in (('table_data', table_data),
                       ('conditional_data', conditional_data),
                       ('interp_data', interp_data)):
        if value is not None:
            body[key] = json.dumps(value, ensure_ascii=False)
    return await _call(ctx, 'PUT',
                       f'/api/cards/{card_id}/variables/{variable_id}', json_body=body)


@mcp.tool()
async def delete_variable(ctx: Context, card_id: int, variable_id: int) -> dict:
    """변수를 지웁니다. 이 변수의 기호를 쓰던 수식은 **고쳐지지 않고 깨집니다** —
    지운 뒤 `validate_card()` 로 확인하세요."""
    return await _call(ctx, 'DELETE', f'/api/cards/{card_id}/variables/{variable_id}')


@mcp.tool()
async def set_widget_layout(ctx: Context, card_id: int, containers: list) -> dict:
    """어느 변수·이미지를 어느 컨테이너에 보일지 **통째로** 정합니다.

    보내는 것은 "지금 배치가 이렇다" 이지 "이것만 바꿔라" 가 아닙니다. 목록에 없는
    위젯은 미배치가 됩니다(계산은 그대로 되지만 화면에 안 보입니다).

        containers=[{"container_id": 3,
                     "widgets": [{"kind": "variable", "id": 7},
                                 {"kind": "image", "id": 2}]}]

    같은 변수를 여러 컨테이너에 넣어도 됩니다 — 값은 하나이고 보이는 자리만 늘어납니다.
    """
    return await _call(ctx, 'PUT', f'/api/cards/{card_id}/widgets/layout',
                       json_body={'containers': containers})


@mcp.tool()
async def list_my_drafts(ctx: Context) -> list:
    """아직 게시되지 않은 내 카드들.

    만들어 놓고 사람에게 넘기지 않은 것이 쌓이기 쉽습니다. 새 작업을 시작하기
    전에 한 번 보고, 남아 있으면 그 얘기부터 꺼내세요.
    """
    cards = await _call(ctx, 'GET', '/api/cards')
    if not isinstance(cards, list):
        return cards
    return [c for c in cards if isinstance(c, dict) and c.get('status') == 'draft']


# --- 검증 ------------------------------------------------------------------------


@mcp.tool()
async def validate_card(ctx: Context, card_id: int, values: dict | None = None) -> dict:
    """**카드를 고친 뒤에는 반드시 이것을 부르세요.**

    저장이 됐다는 것과 계산이 된다는 것은 다릅니다. 서버는 수식을 글자로 저장할
    뿐이라, 없는 기호를 참조하거나 순환 참조인 정의도 조용히 저장됩니다. 사람이
    화면에서 만들 때는 만든 사람이 바로 계산 버튼을 눌러 보지만, 여기서는 그
    확인이 없습니다.

    두 층으로 봅니다.

        정적 검사   없는 기호, 겹치는 기호, 순환 참조, 단계 역참조, 빈 정의
        시험 계산   실제로 값을 넣어 돌려 봅니다(화면과 **같은 계산기**를 씁니다)

    values 는 시험에 쓸 입력값 `{"<변수id>": 값}`. 없으면 기본값으로 돕니다.

    `ok` 가 true 인 것은 문제가 없고 **계산까지 실제로 돌았을 때뿐입니다.**
    `trial_skipped` 에 사유가 있으면 시험 계산이 안 돈 것이니, 그때의 통과는
    통과가 아닙니다.

    통과했으면 끝이 아니라 **사람에게 넘길 차례**입니다. `results` 의 숫자를
    그대로 보여 주고, 크기가 상식적인지 확인해 웹에서 게시해 달라고 하세요.
    검증이 보는 것은 "계산이 도는가" 이지 "공학적으로 맞는가" 가 아닙니다.
    """
    return await _call(ctx, 'POST', f'/api/cards/{card_id}/validate',
                       json_body={'values': values or {}})


@mcp.tool()
async def save_record(ctx: Context, card_id: int, title: str,
                      values: dict | None = None, note: str = '') -> dict:
    """이 입력값으로 계산한 결과를 **기록으로 남깁니다.**

    사람에게 넘길 때 쓰세요. "만들었습니다" 라고 말로만 하면 그 숫자는 대화가
    끝나는 순간 사라집니다. 기록을 남기면 사람이 나중에 열어 그때 값을 그대로
    다시 볼 수 있고, 계산서로 인쇄해 설계 문서에 붙일 수도 있습니다.

    `title` 은 나중에 이것으로 찾게 되므로 무슨 계산인지 적으세요 —
    "시험" 이 아니라 "대표값 검산 (F=1000N, A=300mm2)" 처럼.

    계산은 서버가 합니다(화면과 같은 계산기). 그래서 이 도구는 계산이 실제로
    도는 카드에서만 성공합니다 — 안 되면 먼저 `validate_card()` 로 무엇이
    문제인지 보세요.
    """
    report = await _call(ctx, 'POST', f'/api/cards/{card_id}/validate',
                         json_body={'values': values or {}})
    if not isinstance(report, dict) or report.get('error'):
        return report
    if report.get('trial_skipped'):
        return {
            'error': '계산을 돌려 보지 못해 기록할 수 없습니다.',
            'detail': report['trial_skipped'],
        }

    results = {}
    for row in report.get('results') or []:
        results[str(row['variable_id'])] = {'value': row.get('value'),
                                            'error': row.get('error')}
    if not results:
        return {'error': '계산된 값이 없어 기록할 것이 없습니다.', 'validation': report}

    saved = await _call(ctx, 'POST', '/api/records', json_body={
        'card_id': card_id,
        'title': title,
        'note': note,
        'inputs': {str(k): v for k, v in (values or {}).items()},
        'results': results,
    })
    if isinstance(saved, dict) and 'id' in saved:
        saved['계산결과'] = {r['symbol'] or r['variable_name']: r.get('value')
                          for r in (report.get('results') or [])}
    return saved


@mcp.tool()
async def list_records(ctx: Context, card_id: int | None = None,
                       q: str = '') -> list:
    """남아 있는 계산 기록. `card_id` 나 검색어로 좁힐 수 있습니다.

    새 카드를 만들기 전에 한 번 보세요 — 같은 계산을 이미 누가 해 두었을 수
    있습니다.
    """
    params = {}
    if card_id is not None:
        params['card_id'] = card_id
    if q:
        params['q'] = q
    return await _call(ctx, 'GET', '/api/records', params=params or None)


if __name__ == '__main__':
    # **모든 주소에서 받는다.**
    #
    # 전에는 루프백만 열어 두고 "필요하면 켜라" 였는데, 그러면 등록 명령을
    # 복사해 간 사람이 연결이 안 되는 이유를 한참 찾는다 — 주소는 맞고
    # 서버도 떠 있는데 닿지를 않는다.
    #
    # 열어 두어도 되는 이유는 **이 서버가 자기 자격 증명을 갖지 않기**
    # 때문이다. 들어온 토큰을 백엔드에 넘길 뿐이고, 토큰이 없거나 틀리면
    # 백엔드가 401 로 막는다. 앱 백엔드도 이미 같은 조건으로 열려 있다.
    #
    # 정말 이 서버 안에서만 쓰려면 MCP_HOST=127.0.0.1 로 막는다.
    mcp.run(
        transport='streamable-http',
        host=os.environ.get('MCP_HOST', '0.0.0.0'),
        port=int(os.environ.get('MCP_PORT', '3010')),
        json_response=_JSON_RESPONSE,
    )
