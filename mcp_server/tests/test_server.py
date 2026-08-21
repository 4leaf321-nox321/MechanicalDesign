"""MCP 서버 — 자격 증명이 어떻게 흐르는가.

이 서버의 핵심 성질은 **자기 자격 증명을 갖지 않는다**는 것이다. 들어온 토큰을
그대로 백엔드에 넘기고, 그래서 토큰 주인이 할 수 있는 일만 할 수 있다. 그 성질이
깨지는 방향은 두 가지인데 둘 다 조용하다.

    토큰을 안 넘긴다   → 백엔드가 401. 시끄러우니 금방 안다
    토큰 없이도 통과    → **아무도 모른다.** 여기서 막아야 한다

도구 목록도 함께 지킨다. 이름을 하나 바꾸면 등록해 둔 클라이언트들이 그 도구를
못 찾는데, 서버는 멀쩡히 뜨고 오류도 안 난다.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import server  # noqa: E402


class _Ctx:
    """도구가 받는 컨텍스트 흉내. 필요한 것은 헤더뿐이다."""

    def __init__(self, headers=None):
        self.headers = headers


class _Response:
    def __init__(self, status_code, body, json_ok=True):
        self.status_code = status_code
        self._body = body
        self._json_ok = json_ok

    def json(self):
        if not self._json_ok:
            raise ValueError('not json')
        return self._body


# --- 자격 증명 전달 --------------------------------------------------------------


def test_authorization_header_is_forwarded_verbatim():
    """토큰을 손대지 않고 그대로 넘긴다 — 여기서 다시 만들면 그게 만능 토큰이다."""
    headers = server._headers(_Ctx({'authorization': 'Bearer mdt_abc'}))
    assert headers['Authorization'] == 'Bearer mdt_abc'


def test_header_name_case_does_not_matter():
    """HTTP 헤더 이름은 대소문자를 가리지 않는다. 서버·프록시마다 표기가 다르다."""
    assert server._headers(_Ctx({'Authorization': 'Bearer x'}))['Authorization'] == 'Bearer x'


def test_no_credential_of_its_own():
    """헤더가 없으면 **인증 없이** 나간다. 백엔드가 401 로 막는다.

    여기서 서버가 자기 토큰을 끼워 넣으면, 아무나 붙어서 그 토큰의 권한으로
    무엇이든 할 수 있게 된다. 그리고 그 사실이 어디에도 드러나지 않는다.
    """
    assert 'Authorization' not in server._headers(_Ctx(None))
    assert 'Authorization' not in server._headers(_Ctx({}))


def test_marks_the_call_as_coming_from_mcp():
    """사람이 웹에서 한 일과 AI 가 MCP 로 한 일을 나중에 구분할 수 있게."""
    assert server._headers(_Ctx(None))['X-Client'] == 'mcp'


# --- 백엔드 응답 해석 ------------------------------------------------------------


def test_error_body_becomes_readable_error():
    out = server._unwrap(_Response(400, {'error': '수식이 비어 있습니다.', 'code': 'MD-X-1'}))
    assert out['error'] == '수식이 비어 있습니다.'
    assert out['code'] == 'MD-X-1'


def test_401_carries_a_hint_about_the_token():
    """모델이 다음 수를 고를 수 있어야 한다 — '401' 만으로는 무엇을 할지 알 수 없다."""
    out = server._unwrap(_Response(401, {'error': '로그인이 필요합니다.'}))
    assert '토큰' in out['hint']


def test_non_json_response_does_not_crash():
    out = server._unwrap(_Response(502, None, json_ok=False))
    assert 'error' in out


def test_success_body_passes_through():
    assert server._unwrap(_Response(200, {'id': 3})) == {'id': 3}


# --- 사용 안내 ------------------------------------------------------------------


def test_guide_is_served_from_the_server():
    """안내를 클라이언트에 복사해 두면, 고쳐도 복사해 간 사람에게만 전달된다."""
    text = server.get_guide()
    assert 'validate_card' in text
    assert '중간값은 결과값을 참조할 수 없습니다' in text


def test_unknown_topic_lists_what_exists():
    out = server.get_guide('없는주제')
    assert 'GUIDE' in out


def test_guide_cannot_escape_its_directory():
    """topic 은 밖에서 오는 글자다. 경로로 쓰이면 서버의 아무 파일이나 읽힌다."""
    for attempt in ('../server', '..\\server', '/etc/passwd', '../../requirements'):
        out = server.get_guide(attempt)
        assert 'MCPServer' not in out and 'httpx' not in out, attempt


# --- 도구 목록 ------------------------------------------------------------------


EXPECTED_TOOLS = {
    'get_guide', 'whoami',
    'list_cards', 'get_card', 'list_table_templates',
    'create_card', 'create_container',
    'create_variable', 'update_variable', 'delete_variable',
    'set_widget_layout', 'validate_card', 'list_my_drafts',
    'save_record', 'list_records',
}


@pytest.mark.anyio
async def test_all_tools_are_registered():
    """이름이 바뀌면 등록해 둔 클라이언트가 못 찾는데, 서버는 멀쩡히 뜬다."""
    names = {t.name for t in await server.mcp.list_tools()}
    assert names == EXPECTED_TOOLS


@pytest.mark.anyio
async def test_validate_card_tells_the_model_to_call_it():
    """도구 설명은 항상 모델에게 보인다 — 검증을 부르게 만드는 자리가 여기다."""
    tools = {t.name: t for t in await server.mcp.list_tools()}
    assert '반드시' in tools['validate_card'].description
    assert '먼저 부르세요' in tools['get_guide'].description


@pytest.mark.anyio
async def test_create_card_says_it_makes_a_draft():
    """모델이 다 만들고 **사람에게 넘겨야** 한다는 것을 알아야 한다.

    도구 설명이 그 사실을 말하지 않으면, AI 는 카드를 만들어 놓고 "완성했습니다"
    라고 답한다. 사람은 목록에 없는 카드를 찾다가 만다.
    """
    tools = {t.name: t for t in await server.mcp.list_tools()}
    text = tools['create_card'].description
    assert '초안' in text
    assert '사람에게 넘기세요' in text


def test_guide_warns_about_editing_published_cards():
    """이미 쓰이고 있는 카드를 말없이 고치면, 그것으로 계산하던 사람이 어제와
    다른 숫자를 본다. 안내가 그 얘기를 하지 않으면 모델은 그냥 고친다."""
    text = server.get_guide()
    assert '게시 후 AI 수정됨' in text
    assert '먼저 사람에게 말하세요' in text


@pytest.fixture
def anyio_backend():
    return 'asyncio'
