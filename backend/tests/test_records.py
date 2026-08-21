"""계산 기록 — 시간이 지나도 거짓말하지 않아야 한다.

기록의 값어치는 **그때 무엇을 어떻게 계산했는지**에 있다. 입력과 결과만 남기면
그 값어치가 조용히 사라진다.

    카드 수식이 바뀐다   → 기록은 예전 숫자, 카드를 열면 다른 계산. 어긋남이
                          아무 오류도 안 내서, 기록을 믿고 판단한 뒤에야 드러난다
    카드가 지워진다      → "20" 이라고 적힌 영수증만 남는다

그래서 계산 당시의 변수 정의를 통째로 함께 저장한다. 아래 시험의 절반이 그
스냅샷이 실제로 그 일을 하는지 확인하는 것이다.
"""

import json

import pytest

from app.extensions import db
from app.modules.accounts.models import User
from app.modules.auth import security, tokens
from app.modules.cards.models import Card, Variable
from app.modules.records.models import CalculationRecord


@pytest.fixture
def client(app):
    return app.test_client()


def _user(app, email='eng@example.com', admin=False):
    with app.app_context():
        row = User(email=email, display_name=email.split('@')[0], status='active',
                   is_admin=admin, password_hash=security.hash_password('pw-32167'))
        db.session.add(row)
        db.session.commit()
        return row.id


def _login(client, email='eng@example.com'):
    body = client.post('/api/auth/login',
                       json={'email': email, 'password': 'pw-32167'}).get_json()
    return {'Authorization': f"Bearer {body['access_token']}"}


def _machine(app, user_id):
    with app.app_context():
        _, raw = tokens.create(db.session.get(User, user_id), 'mcp')
        return {'Authorization': f'Bearer {raw}'}


def _card(app, user_id, name='볼트 강도', status='published'):
    """계산되는 카드 하나. (card_id, {기호: 변수id})"""
    with app.app_context():
        card = Card(name=name, route=name.replace(' ', '-'), created_by_id=user_id,
                    status=status)
        db.session.add(card)
        db.session.commit()
        rows = [
            Variable(card_id=card.id, name='하중', symbol='F', unit='N',
                     category='input', var_type='text'),
            Variable(card_id=card.id, name='응력', symbol='sig', unit='MPa',
                     category='output', var_type='formula', formula='F * 2'),
        ]
        db.session.add_all(rows)
        db.session.commit()
        return card.id, {r.symbol: r.id for r in rows}


def _save(client, headers, card_id, ids, title='Model X 브래킷 볼트', **kw):
    return client.post('/api/records', headers=headers, json={
        'card_id': card_id,
        'title': title,
        'inputs': {str(ids['F']): 1000},
        'results': {str(ids['sig']): {'value': 2000, 'error': None}},
        **kw,
    })


# --- 저장 ---------------------------------------------------------------------


def test_a_record_keeps_the_numbers(app, client):
    user_id = _user(app)
    card_id, ids = _card(app, user_id)

    r = _save(client, _login(client), card_id, ids, note='1차 검토')
    assert r.status_code == 201
    body = r.get_json()
    assert body['title'] == 'Model X 브래킷 볼트'
    assert body['card_name'] == '볼트 강도'
    assert body['created_by_name'] == 'eng'


def test_the_definition_is_snapshotted(app, client):
    """**이 기능의 핵심.** 정의를 함께 남기지 않으면 기록은 영수증일 뿐이다."""
    user_id = _user(app)
    card_id, ids = _card(app, user_id)
    headers = _login(client)
    record_id = _save(client, headers, card_id, ids).get_json()['id']

    body = client.get(f'/api/records/{record_id}', headers=headers).get_json()
    snapshot = {v['symbol']: v for v in body['definition_snapshot']}
    assert snapshot['sig']['formula'] == 'F * 2'
    assert snapshot['F']['unit'] == 'N'


def test_the_snapshot_does_not_follow_later_edits(app, client):
    """수식을 바꿔도 기록은 그때 정의를 들고 있어야 한다.

    따라 바뀌면 "그때 이렇게 계산했다" 가 거짓이 되고, 그 거짓은 아무 오류도
    내지 않는다.
    """
    user_id = _user(app)
    card_id, ids = _card(app, user_id)
    headers = _login(client)
    record_id = _save(client, headers, card_id, ids).get_json()['id']

    client.put(f"/api/cards/{card_id}/variables/{ids['sig']}", headers=headers,
               json={'name': '응력', 'symbol': 'sig', 'category': 'output',
                     'var_type': 'formula', 'formula': 'F * 999'})

    body = client.get(f'/api/records/{record_id}', headers=headers).get_json()
    snapshot = {v['symbol']: v for v in body['definition_snapshot']}
    assert snapshot['sig']['formula'] == 'F * 2'
    assert body['results'][str(ids['sig'])]['value'] == 2000


def test_the_record_survives_the_card(app, client):
    """카드를 지워도 기록은 남는다 — 기록이 남는 것이 이 표의 존재 이유다."""
    user_id = _user(app)
    card_id, ids = _card(app, user_id)
    headers = _login(client)
    record_id = _save(client, headers, card_id, ids).get_json()['id']

    assert client.delete(f'/api/cards/{card_id}', headers=headers).status_code == 200

    body = client.get(f'/api/records/{record_id}', headers=headers).get_json()
    assert body['card_exists'] is False
    # 카드 이름과 정의가 남아 있어야 그 기록이 무슨 계산이었는지 알 수 있다.
    assert body['card_name'] == '볼트 강도'
    assert len(body['definition_snapshot']) == 2


def test_client_supplied_definition_is_ignored(app, client):
    """정의는 **서버가 자기 DB 에서 뜬다.**

    브라우저가 적어 보낸 것을 그대로 믿으면, '그때 정말 이 정의였다' 가 아니라
    그냥 주장이 된다.
    """
    user_id = _user(app)
    card_id, ids = _card(app, user_id)
    headers = _login(client)
    r = client.post('/api/records', headers=headers, json={
        'card_id': card_id, 'title': '위조 시도',
        'inputs': {}, 'results': {},
        'definition_snapshot': [{'symbol': 'sig', 'formula': '거짓말'}],
    })
    record_id = r.get_json()['id']

    body = client.get(f'/api/records/{record_id}', headers=headers).get_json()
    assert all(v.get('formula') != '거짓말' for v in body['definition_snapshot'])


def test_title_is_required(app, client):
    user_id = _user(app)
    card_id, ids = _card(app, user_id)
    r = _save(client, _login(client), card_id, ids, title='   ')
    assert r.status_code == 400
    assert '이름' in r.get_json()['error']


def test_unknown_card_is_refused(app, client):
    _user(app)
    r = client.post('/api/records', headers=_login(client),
                    json={'card_id': 99999, 'title': 'x', 'inputs': {}, 'results': {}})
    assert r.status_code == 404


def test_saving_needs_login(app, client):
    assert client.post('/api/records', json={'title': 'x'}).status_code == 401


# --- 조회 ---------------------------------------------------------------------


def test_list_is_newest_first(app, client):
    user_id = _user(app)
    card_id, ids = _card(app, user_id)
    headers = _login(client)
    for title in ('첫째', '둘째', '셋째'):
        _save(client, headers, card_id, ids, title=title)

    listed = client.get('/api/records', headers=headers).get_json()
    assert [r['title'] for r in listed] == ['셋째', '둘째', '첫째']


def test_list_omits_the_snapshot(app, client):
    """스냅샷은 변수 수십 개 분량이다. 목록에 실으면 응답이 금방 커진다."""
    user_id = _user(app)
    card_id, ids = _card(app, user_id)
    headers = _login(client)
    _save(client, headers, card_id, ids)

    listed = client.get('/api/records', headers=headers).get_json()
    assert 'definition_snapshot' not in listed[0]


def test_filter_by_card(app, client):
    user_id = _user(app)
    first, ids_a = _card(app, user_id, '볼트 강도')
    second, ids_b = _card(app, user_id, '베어링 수명')
    headers = _login(client)
    _save(client, headers, first, ids_a, title='볼트 기록')
    _save(client, headers, second, ids_b, title='베어링 기록')

    listed = client.get(f'/api/records?card_id={second}', headers=headers).get_json()
    assert [r['title'] for r in listed] == ['베어링 기록']


def test_filter_mine(app, client):
    owner = _user(app, 'owner@example.com')
    _user(app, 'other@example.com')
    card_id, ids = _card(app, owner)
    _save(client, _login(client, 'owner@example.com'), card_id, ids, title='주인 기록')
    _save(client, _login(client, 'other@example.com'), card_id, ids, title='남 기록')

    headers = _login(client, 'other@example.com')
    assert len(client.get('/api/records', headers=headers).get_json()) == 2
    mine = client.get('/api/records?mine=1', headers=headers).get_json()
    assert [r['title'] for r in mine] == ['남 기록']


def test_search_by_title_or_card_name(app, client):
    user_id = _user(app)
    card_id, ids = _card(app, user_id, '볼트 강도')
    headers = _login(client)
    _save(client, headers, card_id, ids, title='Model X 브래킷')
    _save(client, headers, card_id, ids, title='Model Y 하우징')

    found = client.get('/api/records?q=브래킷', headers=headers).get_json()
    assert [r['title'] for r in found] == ['Model X 브래킷']
    # 카드 이름으로도 찾힌다 — 사람은 둘 중 기억나는 쪽으로 찾는다.
    assert len(client.get('/api/records?q=볼트', headers=headers).get_json()) == 2


# --- 가시성 --------------------------------------------------------------------


def test_records_of_a_draft_card_are_hidden(app, client):
    """**초안을 감춘 의미가 여기서 무너질 수 있다.**

    스냅샷에 정의가 통째로 들어 있어서, 기록이 보이면 초안 카드의 수식도 함께
    보인다.
    """
    owner = _user(app, 'owner@example.com')
    _user(app, 'other@example.com')
    card_id, ids = _card(app, owner, '초안 카드', status='draft')
    record_id = _save(client, _login(client, 'owner@example.com'),
                      card_id, ids).get_json()['id']

    headers = _login(client, 'other@example.com')
    assert client.get('/api/records', headers=headers).get_json() == []
    assert client.get(f'/api/records/{record_id}', headers=headers).status_code == 404


def test_records_of_a_deleted_card_are_private(app, client):
    """카드가 없으면 남은 그 계산이 무엇을 뜻하는지 확인할 방법조차 없다."""
    owner = _user(app, 'owner@example.com')
    _user(app, 'other@example.com')
    card_id, ids = _card(app, owner)
    owner_headers = _login(client, 'owner@example.com')
    record_id = _save(client, owner_headers, card_id, ids).get_json()['id']
    client.delete(f'/api/cards/{card_id}', headers=owner_headers)

    other = _login(client, 'other@example.com')
    assert client.get(f'/api/records/{record_id}', headers=other).status_code == 404
    # 만든 사람에게는 그대로 보인다.
    assert client.get(f'/api/records/{record_id}', headers=owner_headers).status_code == 200


def test_published_card_records_are_shared(app, client):
    """팀에서 '이거 누가 이미 계산해 봤나' 를 볼 수 있어야 한다."""
    owner = _user(app, 'owner@example.com')
    _user(app, 'other@example.com')
    card_id, ids = _card(app, owner)
    _save(client, _login(client, 'owner@example.com'), card_id, ids, title='공유 기록')

    listed = client.get('/api/records', headers=_login(client, 'other@example.com')).get_json()
    assert [r['title'] for r in listed] == ['공유 기록']


# --- 삭제 ---------------------------------------------------------------------


def test_i_can_delete_my_own(app, client):
    user_id = _user(app)
    card_id, ids = _card(app, user_id)
    headers = _login(client)
    record_id = _save(client, headers, card_id, ids).get_json()['id']

    assert client.delete(f'/api/records/{record_id}', headers=headers).status_code == 200
    with app.app_context():
        assert db.session.get(CalculationRecord, record_id) is None


def test_others_cannot_delete_my_record(app, client):
    owner = _user(app, 'owner@example.com')
    _user(app, 'other@example.com')
    card_id, ids = _card(app, owner)
    record_id = _save(client, _login(client, 'owner@example.com'),
                      card_id, ids).get_json()['id']

    r = client.delete(f'/api/records/{record_id}',
                      headers=_login(client, 'other@example.com'))
    assert r.status_code == 403
    with app.app_context():
        assert db.session.get(CalculationRecord, record_id) is not None


def test_admin_can_delete_any(app, client):
    owner = _user(app, 'owner@example.com')
    _user(app, 'boss@example.com', admin=True)
    card_id, ids = _card(app, owner)
    record_id = _save(client, _login(client, 'owner@example.com'),
                      card_id, ids).get_json()['id']

    assert client.delete(f'/api/records/{record_id}',
                         headers=_login(client, 'boss@example.com')).status_code == 200


# --- 견고함 --------------------------------------------------------------------


def test_broken_json_does_not_break_the_list(app, client):
    """저장된 JSON 이 깨졌으면 그 기록만 못 읽는 것이지, 목록 전체가 500 이면 안 된다."""
    user_id = _user(app)
    card_id, ids = _card(app, user_id)
    headers = _login(client)
    record_id = _save(client, headers, card_id, ids).get_json()['id']

    with app.app_context():
        row = db.session.get(CalculationRecord, record_id)
        row.definition_snapshot = '{깨진 JSON'
        db.session.commit()

    assert client.get('/api/records', headers=headers).status_code == 200
    body = client.get(f'/api/records/{record_id}', headers=headers).get_json()
    assert body['definition_snapshot'] == []


def test_a_machine_can_save_a_record(app, client):
    """MCP 로 검증한 결과를 그대로 남길 수 있어야 한다 — 게시와 달리 여기는 막지 않는다.

    기록은 "이 값으로 계산해 봤다" 는 사실일 뿐, 남에게 쓰라고 내놓는 것이
    아니기 때문이다.
    """
    user_id = _user(app)
    card_id, ids = _card(app, user_id)
    r = _save(client, _machine(app, user_id), card_id, ids, title='AI 시험 계산')
    assert r.status_code == 201
