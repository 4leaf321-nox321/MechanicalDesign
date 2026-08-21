"""AI 흔적 — 게시하고 나면 사람이 짠 카드와 구별되지 않는다.

나중에 "이 카드 계산이 이상하다" 는 얘기가 나왔을 때, 사람이 처음부터 손으로
짠 것인지 AI 가 초안을 잡은 것인지는 **어디를 먼저 볼지**를 바꾼다. 그런데 게시된
카드는 둘 다 똑같이 생겼다.

두 칸으로 나눠 기록한다.

    origin          누가 시작했는가. 한 번 정해지면 안 바뀐다
    ai_touched_at   기계가 마지막으로 쓴 시각. 채워지기만 한다

`origin` 만 두면 **거짓말이 된다** — 사람이 만든 카드를 AI 가 나중에 전부 고쳐도
계속 'human' 이다. 반대로 `ai_touched_at` 만 두면 "처음부터 AI 가 만든 것" 과
"사람이 만든 걸 AI 가 조금 고친 것" 이 구별되지 않는다.
"""

from datetime import datetime, timedelta

import pytest

from app.extensions import db
from app.modules.accounts.models import User
from app.modules.auth import security, tokens
from app.modules.cards.models import Card, Variable


@pytest.fixture
def client(app):
    return app.test_client()


def _user(app, email='eng@example.com'):
    with app.app_context():
        row = User(email=email, display_name=email.split('@')[0], status='active',
                   password_hash=security.hash_password('pw-32167'))
        db.session.add(row)
        db.session.commit()
        return row.id


def _human(client, email='eng@example.com'):
    body = client.post('/api/auth/login',
                       json={'email': email, 'password': 'pw-32167'}).get_json()
    return {'Authorization': f"Bearer {body['access_token']}"}


def _machine(app, user_id):
    with app.app_context():
        _, raw = tokens.create(db.session.get(User, user_id), 'mcp')
        return {'Authorization': f'Bearer {raw}'}


def _touched(app, card_id):
    with app.app_context():
        return db.session.get(Card, card_id).ai_touched_at


# --- origin -------------------------------------------------------------------


def test_machine_created_card_is_marked_mcp(app, client):
    user_id = _user(app)
    body = client.post('/api/cards', headers=_machine(app, user_id),
                       json={'name': 'AI 카드'}).get_json()
    assert body['origin'] == 'mcp'
    assert body['ai_touched_at'] is not None


def test_human_created_card_is_marked_human(app, client):
    _user(app)
    body = client.post('/api/cards', headers=_human(client),
                       json={'name': '사람 카드'}).get_json()
    assert body['origin'] == 'human'
    assert body['ai_touched_at'] is None


# --- ai_touched_at ------------------------------------------------------------


def test_machine_editing_a_human_card_leaves_a_trace(app, client):
    """**origin 만으로는 부족한 이유.**

    사람이 만든 카드를 AI 가 고쳐도 origin 은 계속 'human' 이다. 그 칸만 보면
    사람이 처음부터 끝까지 짠 카드로 보인다.
    """
    user_id = _user(app)
    card = client.post('/api/cards', headers=_human(client),
                       json={'name': '사람 카드'}).get_json()
    assert _touched(app, card['id']) is None

    r = client.post(f"/api/cards/{card['id']}/variables", headers=_machine(app, user_id),
                    json={'name': '하중', 'symbol': 'F',
                          'category': 'input', 'var_type': 'text'})
    assert r.status_code == 201

    with app.app_context():
        row = db.session.get(Card, card['id'])
        assert row.origin == 'human'      # 시작한 것은 여전히 사람이다
        assert row.ai_touched_at is not None


def test_reading_leaves_no_trace(app, client):
    """읽기까지 흔적으로 남기면 "AI 가 손댄 카드" 가 곧 "AI 가 열어 본 카드" 가 된다."""
    user_id = _user(app)
    card = client.post('/api/cards', headers=_human(client),
                       json={'name': '사람 카드'}).get_json()

    machine = _machine(app, user_id)
    for path in ('variables', 'containers', 'images'):
        client.get(f"/api/cards/{card['id']}/{path}", headers=machine)

    assert _touched(app, card['id']) is None


def test_a_refused_write_leaves_no_trace(app, client):
    """아무것도 안 바뀐 카드에 "AI 가 수정함" 이 붙으면 안 된다.

    before_request 가 아니라 after_request 로 찍는 이유가 이것이다 — 요청 전에는
    그 쓰기가 성공할지 알 수 없다.
    """
    user_id = _user(app)
    card = client.post('/api/cards', headers=_human(client),
                       json={'name': '사람 카드'}).get_json()

    r = client.post(f"/api/cards/{card['id']}/variables", headers=_machine(app, user_id),
                    json={'name': '', 'category': 'input', 'var_type': 'text'})
    assert r.status_code == 400
    assert _touched(app, card['id']) is None


def test_human_edits_do_not_leave_a_trace(app, client):
    user_id = _user(app)
    card = client.post('/api/cards', headers=_machine(app, user_id),
                       json={'name': 'AI 카드'}).get_json()
    before = _touched(app, card['id'])

    client.post(f"/api/cards/{card['id']}/variables", headers=_human(client),
                json={'name': '하중', 'symbol': 'F',
                      'category': 'input', 'var_type': 'text'})

    assert _touched(app, card['id']) == before


def test_deleting_the_card_does_not_crash_the_hook(app, client):
    """흔적을 남길 카드가 방금 사라진 경우. 훅이 터지면 삭제 응답까지 500 이 된다."""
    user_id = _user(app)
    card = client.post('/api/cards', headers=_machine(app, user_id),
                       json={'name': 'AI 카드'}).get_json()
    r = client.delete(f"/api/cards/{card['id']}", headers=_machine(app, user_id))
    assert r.status_code == 200


# --- 게시 후 수정 ---------------------------------------------------------------


def test_edit_after_publish_is_flagged(app, client):
    """**게시 기록만 보면 검토를 거친 카드처럼 보인다.**

    사람이 확인하고 게시한 뒤에 기계가 또 고치면, 그 사람이 본 것은 지금 화면에
    있는 카드가 아니다. 그런데 `published_by` 는 그대로 남아 있다.
    """
    user_id = _user(app)
    machine = _machine(app, user_id)
    card = client.post('/api/cards', headers=machine, json={'name': 'AI 카드'}).get_json()
    with app.app_context():
        db.session.add_all([
            Variable(card_id=card['id'], name='하중', symbol='F',
                     category='input', var_type='text'),
            Variable(card_id=card['id'], name='응력', symbol='sig',
                     category='output', var_type='formula', formula='F * 2'),
        ])
        db.session.commit()

    published = client.post(f"/api/cards/{card['id']}/publish",
                            headers=_human(client), json={}).get_json()
    assert published['card']['ai_edited_after_publish'] is False

    # 게시된 카드를 기계가 또 고친다.
    r = client.post(f"/api/cards/{card['id']}/variables", headers=machine,
                    json={'name': '추가', 'symbol': 'X',
                          'category': 'input', 'var_type': 'text'})
    assert r.status_code == 201

    listed = client.get('/api/cards', headers=_human(client)).get_json()
    row = next(c for c in listed if c['id'] == card['id'])
    assert row['ai_edited_after_publish'] is True
    # 게시 기록은 지우지 않는다 — 그 사람이 그때 확인한 것은 사실이다.
    assert row['published_by_name'] == 'eng'


def test_unpublished_card_is_not_flagged(app, client):
    """초안은 아직 아무도 검토하지 않았다. 경고할 것이 없다."""
    user_id = _user(app)
    card = client.post('/api/cards', headers=_machine(app, user_id),
                       json={'name': 'AI 카드'}).get_json()
    assert card['ai_edited_after_publish'] is False


def test_editing_before_publish_is_not_flagged(app, client):
    """게시 **전에** 고친 것은 사람이 그 상태를 보고 게시한 것이다."""
    user_id = _user(app)
    with app.app_context():
        row = Card(name='카드', route='card-x', created_by_id=user_id,
                   status='published',
                   published_at=datetime.utcnow(),
                   published_by_id=user_id,
                   ai_touched_at=datetime.utcnow() - timedelta(hours=1))
        db.session.add(row)
        db.session.commit()
        assert row.ai_edited_after_publish is False
