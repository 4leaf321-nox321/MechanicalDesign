"""휴지통 — 지운 카드는 두 번 확인해야 사라진다.

카드 하나에 변수·컨테이너·이미지·변경 이력이 딸려 있고, 그 카드로 계산한 기록도
남아 있다. 한 번의 실수로 그것이 전부 사라지면 회복되지 않는다.

여기서 지키는 것 중 **조용히 깨지는 것**이 둘이다.

    지운 카드의 하위 자원   목록에서만 거르면 카드 id 하나로 변수가 그대로 열린다
    조직 옆 숫자            게시를 남겨 두므로, 카드를 함께 보지 않으면 계속 잡힌다
"""

import pytest

from app.extensions import db
from app.modules.accounts.models import User
from app.modules.auth import security
from app.modules.cards.models import Card, Variable
from app.modules.orgs import services as org_services


@pytest.fixture
def client(app):
    return app.test_client()


def _user(app, email, admin=False):
    with app.app_context():
        row = User(email=email, display_name=email.split('@')[0], status='active',
                   is_admin=admin, password_hash=security.hash_password('pw-32167'))
        db.session.add(row)
        db.session.commit()
        org_services.ensure_personal_org(row, commit=True)
        return row.id


def _login(client, email):
    body = client.post('/api/auth/login',
                       json={'email': email, 'password': 'pw-32167'}).get_json()
    return {'Authorization': f"Bearer {body['access_token']}"}


def _card(app, owner_id, name):
    with app.app_context():
        card = Card(name=name, description='', route=f'/{name}', sort_order=0,
                    created_by_id=owner_id,
                    home_org_slug=org_services.personal_slug(owner_id),
                    status='published')
        db.session.add(card)
        db.session.commit()
        db.session.add(Variable(card_id=card.id, name='폭', symbol='W',
                                category='input', var_type='text'))
        db.session.commit()
        return card.id


def test_delete_moves_to_trash_and_keeps_the_row(app, client):
    uid = _user(app, 'kim@x.com')
    head = _login(client, 'kim@x.com')
    card_id = _card(app, uid, '볼트')

    r = client.delete(f'/api/cards/{card_id}', headers=head)
    assert r.status_code == 200
    assert r.get_json()['card']['deleted_at']

    with app.app_context():
        assert db.session.get(Card, card_id) is not None

    assert client.get('/api/cards', headers=head).get_json() == []
    assert [c['name'] for c in client.get('/api/cards/trash', headers=head).get_json()] == ['볼트']


def test_deleted_cards_subresources_are_closed(app, client):
    """목록에서만 거르면 카드 id 하나로 변수 정의가 그대로 새어 나간다."""
    uid = _user(app, 'kim@x.com')
    head = _login(client, 'kim@x.com')
    _user(app, 'other@x.com')
    card_id = _card(app, uid, '볼트')
    client.delete(f'/api/cards/{card_id}', headers=head)

    other = _login(client, 'other@x.com')
    assert client.get(f'/api/cards/{card_id}/variables', headers=other).status_code == 404
    # 만든 사람은 휴지통에서 되살리기 전에 내용을 확인할 수 있어야 한다.
    assert client.get(f'/api/cards/{card_id}/variables', headers=head).status_code == 200


def test_restore_brings_it_back_to_its_orgs(app, client):
    """게시를 남겨 두는 이유 — 되살리면 원래 걸려 있던 조직으로 돌아간다."""
    uid = _user(app, 'kim@x.com')
    _user(app, 'admin@x.com', admin=True)
    head = _login(client, 'kim@x.com')
    with app.app_context():
        team = org_services.create_org('설계1팀').slug
    card_id = _card(app, uid, '볼트')
    client.post(f'/api/cards/{card_id}/mounts', json={'org_slug': team}, headers=head)

    client.delete(f'/api/cards/{card_id}', headers=head)
    assert client.get(f'/api/cards?org={team}', headers=head).get_json() == []

    r = client.post(f'/api/cards/{card_id}/restore', headers=head)
    assert r.status_code == 200
    names = [c['name'] for c in client.get(f'/api/cards?org={team}', headers=head).get_json()]
    assert names == ['볼트']
    assert client.get('/api/cards/trash', headers=head).get_json() == []


def test_trash_does_not_count_toward_the_org_badge(app, client):
    """게시가 남아 있으므로, 카드를 함께 보지 않으면 숫자만 남고 목록은 빈다."""
    uid = _user(app, 'kim@x.com')
    _user(app, 'admin@x.com', admin=True)
    head = _login(client, 'kim@x.com')
    with app.app_context():
        team = org_services.create_org('설계1팀').slug
    card_id = _card(app, uid, '볼트')
    client.post(f'/api/cards/{card_id}/mounts', json={'org_slug': team}, headers=head)

    def badge():
        tree = client.get('/api/orgs/tree', headers=head).get_json()['tree']
        return next(n['card_count'] for n in tree if n['slug'] == team)

    assert badge() == 1
    client.delete(f'/api/cards/{card_id}', headers=head)
    assert badge() == 0


def test_personal_badge_counts_cards_that_live_there(app, client):
    """개인 공간은 게시가 아니라 **집**으로 센다 — 게시 수를 세면 늘 0 이다."""
    uid = _user(app, 'kim@x.com')
    head = _login(client, 'kim@x.com')
    _card(app, uid, '볼트')

    body = client.get('/api/orgs/tree', headers=head).get_json()
    assert body['personal']['card_count'] == 1


def test_permanent_delete_requires_the_trash_first(app, client):
    """휴지통을 건너뛰는 길을 두면 두 번 묻는 의미가 없어진다."""
    uid = _user(app, 'kim@x.com')
    head = _login(client, 'kim@x.com')
    card_id = _card(app, uid, '볼트')

    r = client.delete(f'/api/cards/{card_id}/permanent', headers=head)
    assert r.status_code == 409
    assert r.get_json()['code'] == 'MD-CARDS-0122'

    client.delete(f'/api/cards/{card_id}', headers=head)
    r = client.delete(f'/api/cards/{card_id}/permanent', headers=head)
    assert r.status_code == 200
    with app.app_context():
        assert db.session.get(Card, card_id) is None
        assert Variable.query.filter_by(card_id=card_id).count() == 0


def test_other_people_cannot_see_or_purge_your_trash(app, client):
    """완전 삭제는 되돌릴 수 없다. 남이 남의 휴지통을 비우게 두지 않는다."""
    uid = _user(app, 'kim@x.com')
    _user(app, 'other@x.com')
    head = _login(client, 'kim@x.com')
    card_id = _card(app, uid, '볼트')
    client.delete(f'/api/cards/{card_id}', headers=head)

    other = _login(client, 'other@x.com')
    assert client.get('/api/cards/trash', headers=other).get_json() == []
    assert client.delete(f'/api/cards/{card_id}/permanent', headers=other).status_code == 404
    assert client.post(f'/api/cards/{card_id}/restore', headers=other).status_code == 404


def test_admin_sees_every_trash(app, client):
    uid = _user(app, 'kim@x.com')
    _user(app, 'admin@x.com', admin=True)
    card_id = _card(app, uid, '볼트')
    client.delete(f'/api/cards/{card_id}', headers=_login(client, 'kim@x.com'))

    rows = client.get('/api/cards/trash', headers=_login(client, 'admin@x.com')).get_json()
    assert [c['name'] for c in rows] == ['볼트']


def test_deleting_twice_is_not_an_error(app, client):
    uid = _user(app, 'kim@x.com')
    head = _login(client, 'kim@x.com')
    card_id = _card(app, uid, '볼트')

    client.delete(f'/api/cards/{card_id}', headers=head)
    assert client.delete(f'/api/cards/{card_id}', headers=head).status_code == 200
