"""개인 액세스 토큰 — 기계가 붙는 문.

**여기가 뚫리면 로그인 화면 전체가 무의미해진다.** 사람의 세션은 15분 만에
만료되고 쿠키는 자바스크립트가 못 읽지만, 이 토큰은 90일을 살고 헤더 하나로
쓰인다. 그만큼 조건이 정확해야 한다 — 폐기·만료·정지된 계정이 각각 확실히
막히는지, 그리고 남의 토큰을 건드릴 수 없는지.

특히 **조용히 통과하는** 실패가 무섭다. 만료 검사가 빠져도 아무 오류가 나지
않고, 폐기한 토큰이 계속 먹혀도 폐기한 사람은 성공 메시지를 이미 봤다.
"""

from datetime import datetime, timedelta

import pytest

from app.extensions import db
from app.modules.accounts.models import User
from app.modules.auth import security, tokens
from app.modules.auth.models import PersonalAccessToken


@pytest.fixture
def client(app):
    return app.test_client()


def _user(app, email='mcp@example.com', **kw):
    with app.app_context():
        row = User(email=email, display_name=kw.pop('display_name', '사용자'),
                   status=kw.pop('status', 'active'),
                   password_hash=security.hash_password('pw-32167'), **kw)
        db.session.add(row)
        db.session.commit()
        return row.id


def _login(client, email='mcp@example.com', password='pw-32167'):
    body = client.post('/api/auth/login',
                       json={'email': email, 'password': password}).get_json()
    return {'Authorization': f"Bearer {body['access_token']}"}


def _issue(app, user_id, name='MCP', days=90):
    with app.app_context():
        user = db.session.get(User, user_id)
        row, raw = tokens.create(user, name, expires_days=days)
        return row.id, raw


# --- 발급 ---------------------------------------------------------------------


def test_raw_token_is_returned_once_and_never_stored(app):
    """원문이 DB 에 남으면, DB 가 새는 순간 남의 자격 증명이 그대로 새어 나간다."""
    user_id = _user(app)
    token_id, raw = _issue(app, user_id)

    assert raw.startswith(tokens.TOKEN_PREFIX)
    with app.app_context():
        row = db.session.get(PersonalAccessToken, token_id)
        assert raw not in row.token_hash
        assert row.token_hash != raw
        # 앞자리만 표시용으로 남는다 — 목록에서 어느 것인지 알아보기 위한 것.
        assert row.token_prefix == raw[:12]
        assert 'token' not in row.to_dict() or row.to_dict().get('token') is None


def test_two_tokens_are_never_the_same(app):
    user_id = _user(app)
    _, first = _issue(app, user_id, 'A')
    _, second = _issue(app, user_id, 'B')
    assert first != second


def test_name_is_required(app):
    user_id = _user(app)
    with app.app_context():
        user = db.session.get(User, user_id)
        with pytest.raises(Exception) as exc:
            tokens.create(user, '   ')
        assert '이름' in str(exc.value)


def test_endless_tokens_are_refused(app):
    """만료 없는 토큰은 한 번 새면 영영 유효하고, 있다는 사실조차 잊힌다."""
    user_id = _user(app)
    with app.app_context():
        user = db.session.get(User, user_id)
        with pytest.raises(Exception):
            tokens.create(user, 'MCP', expires_days=None)
        with pytest.raises(Exception):
            tokens.create(user, 'MCP', expires_days=tokens.MAX_EXPIRES_DAYS + 1)


# --- 인증 ---------------------------------------------------------------------


def test_token_authenticates_a_request(app, client):
    user_id = _user(app)
    _, raw = _issue(app, user_id)

    r = client.get('/api/auth/me', headers={'Authorization': f'Bearer {raw}'})
    assert r.status_code == 200
    assert r.get_json()['email'] == 'mcp@example.com'


def test_token_works_on_protected_business_endpoints(app, client):
    """`/api/auth/me` 만 되고 정작 카드 API 가 안 되면 MCP 는 아무것도 못 한다."""
    user_id = _user(app)
    _, raw = _issue(app, user_id)
    assert client.get('/api/cards',
                      headers={'Authorization': f'Bearer {raw}'}).status_code == 200


def test_revoked_token_stops_working(app, client):
    user_id = _user(app)
    token_id, raw = _issue(app, user_id)

    with app.app_context():
        user = db.session.get(User, user_id)
        tokens.revoke(user, token_id)

    r = client.get('/api/auth/me', headers={'Authorization': f'Bearer {raw}'})
    assert r.status_code == 401


def test_expired_token_stops_working(app, client):
    user_id = _user(app)
    token_id, raw = _issue(app, user_id)
    with app.app_context():
        row = db.session.get(PersonalAccessToken, token_id)
        row.expires_at = datetime.utcnow() - timedelta(seconds=1)
        db.session.commit()

    assert client.get('/api/auth/me',
                      headers={'Authorization': f'Bearer {raw}'}).status_code == 401


def test_suspended_account_kills_its_tokens(app, client):
    """**계정 상태 판정이 한 곳에 있는지 확인하는 자리.**

    사람 로그인만 막고 토큰 경로를 빠뜨리면, 정지된 사람의 MCP 는 90일 동안
    계속 돈다. 정지시킨 관리자는 막았다고 생각하고 있다.
    """
    user_id = _user(app)
    _, raw = _issue(app, user_id)
    with app.app_context():
        db.session.get(User, user_id).status = 'suspended'
        db.session.commit()

    r = client.get('/api/auth/me', headers={'Authorization': f'Bearer {raw}'})
    assert r.status_code == 403


def test_deleted_account_kills_its_tokens(app, client):
    user_id = _user(app)
    _, raw = _issue(app, user_id)
    with app.app_context():
        db.session.get(User, user_id).deleted_at = datetime.utcnow()
        db.session.commit()

    assert client.get('/api/auth/me',
                      headers={'Authorization': f'Bearer {raw}'}).status_code == 403


def test_garbage_token_is_rejected(app, client):
    _user(app)
    for bad in ('mdt_nope', 'mdt_', 'not-a-token'):
        r = client.get('/api/auth/me', headers={'Authorization': f'Bearer {bad}'})
        assert r.status_code == 401, bad


def test_jwt_still_works_alongside_tokens(app, client):
    """접두사 분기를 넣으면서 사람 로그인을 깨뜨리지 않았는지."""
    _user(app)
    assert client.get('/api/auth/me', headers=_login(client)).status_code == 200


def test_last_used_at_is_recorded(app, client):
    """안 쓰는 토큰을 찾아낼 유일한 단서다. 없으면 아무도 회수하지 않는다."""
    user_id = _user(app)
    token_id, raw = _issue(app, user_id)
    with app.app_context():
        assert db.session.get(PersonalAccessToken, token_id).last_used_at is None

    client.get('/api/auth/me', headers={'Authorization': f'Bearer {raw}'})

    with app.app_context():
        assert db.session.get(PersonalAccessToken, token_id).last_used_at is not None


# --- 소유 경계 ----------------------------------------------------------------


def test_cannot_revoke_someone_elses_token(app):
    owner_id = _user(app, 'owner@example.com')
    other_id = _user(app, 'other@example.com')
    token_id, _ = _issue(app, owner_id)

    with app.app_context():
        other = db.session.get(User, other_id)
        with pytest.raises(Exception) as exc:
            tokens.revoke(other, token_id)
        # 남의 토큰이 있다는 사실도 알려 주지 않는다 — 없는 것과 같이 답한다.
        assert '찾을 수 없습니다' in str(exc.value)

    with app.app_context():
        assert db.session.get(PersonalAccessToken, token_id).revoked_at is None


def test_list_shows_only_my_own(app, client):
    _user(app, 'owner@example.com')
    other_id = _user(app, 'other@example.com')
    _issue(app, other_id, '남의 토큰')

    r = client.get('/api/auth/me/tokens', headers=_login(client, 'owner@example.com'))
    assert r.status_code == 200
    assert r.get_json() == []


# --- API ----------------------------------------------------------------------


def test_create_and_revoke_over_http(app, client):
    _user(app)
    headers = _login(client)

    r = client.post('/api/auth/me/tokens', headers=headers,
                    json={'name': 'MCP 서버', 'expires_days': 30})
    assert r.status_code == 201
    body = r.get_json()
    raw = body['token']
    assert raw.startswith('mdt_')
    assert body['info']['state'] == 'active'

    listed = client.get('/api/auth/me/tokens', headers=headers).get_json()
    assert [t['name'] for t in listed] == ['MCP 서버']
    # 목록에는 원문이 절대 실리지 않는다.
    assert all('token' not in t for t in listed)

    assert client.delete(f"/api/auth/me/tokens/{body['info']['id']}",
                         headers=headers).status_code == 200
    assert client.get('/api/auth/me/tokens', headers=headers).get_json() == []
    assert client.get('/api/auth/me',
                      headers={'Authorization': f'Bearer {raw}'}).status_code == 401


def test_creating_a_token_needs_login(app, client):
    assert client.post('/api/auth/me/tokens', json={'name': 'x'}).status_code == 401


def test_temporary_password_must_be_changed_first(app, client):
    """토큰은 비밀번호와 무관하게 산다 — 여기를 열어 두면 임시 비번을 영영 안 바꾸는 우회로가 된다."""
    _user(app, must_change_password=True)
    r = client.post('/api/auth/me/tokens', headers=_login(client),
                    json={'name': 'MCP'})
    assert r.status_code == 403
    assert '비밀번호를 먼저 변경' in r.get_json()['error']


# --- MCP 주소 ------------------------------------------------------------------


def test_config_gives_the_mcp_address(app, client):
    """토큰 화면이 **그대로 실행할 수 있는 명령**을 만들려면 주소가 필요하다.

    화면이 주소를 스스로 지어내면(3010 을 코드에 박아 두면), 포트를 바꾼 서버에서
    화면만 옛 주소를 들고 있게 된다. 사용자는 그대로 복사해 붙였다가 연결이 안
    되는 이유를 찾게 된다.
    """
    _user(app)
    body = client.get('/api/config', headers=_login(client)).get_json()
    assert body['mcp_url'].endswith('/mcp')


def test_mcp_address_follows_the_address_the_user_reached(app, client):
    """사람이 이 앱에 닿은 주소면 같은 서버의 MCP 에도 닿는다."""
    _user(app)
    body = client.get('/api/config', headers=_login(client),
                      environ_overrides={'HTTP_HOST': 'mech.example:5176'}
                      ).get_json()
    assert body['mcp_url'] == 'http://mech.example:3010/mcp'


def test_mcp_address_honours_a_proxy_header(app, client):
    """리버스 프록시 뒤면 Host 가 아니라 X-Forwarded-Host 가 사용자가 친 주소다."""
    _user(app)
    headers = _login(client)
    headers['X-Forwarded-Host'] = 'mech.company.local'
    body = client.get('/api/config', headers=headers).get_json()
    assert body['mcp_url'] == 'http://mech.company.local:3010/mcp'


def test_mcp_address_can_be_pinned(app, client):
    """프록시 뒤에 두거나 포트를 바꿨으면 통째로 지정한다."""
    _user(app)
    app.config['MCP_URL'] = 'https://mech.example/mcp'
    try:
        body = client.get('/api/config', headers=_login(client)).get_json()
        assert body['mcp_url'] == 'https://mech.example/mcp'
    finally:
        app.config['MCP_URL'] = ''


def test_config_needs_login(app, client):
    assert client.get('/api/config').status_code == 401
