"""조직 — 카드가 어디에 놓이고 어디에서 보이는가.

카드는 **개인 공간에서 태어나** 조직에 게시된다. 두 축이 따로 있다.

    status (draft/published)   사람이 이 계산을 봤는가
    card_mounts                어디에서 보이는가

둘을 겹치면 검토를 건너뛴 카드가 팀 게시판에 걸린다. 그래서 초안은 조직에 올릴
수 없고, 게시를 전부 내려도 카드는 만든 사람의 공간에 남는다.

여기서 지키는 것 중 **조용히 깨지는 것**이 셋이다.

    남의 개인 공간            열리면 아직 보여 줄 생각이 없는 초안이 새어 나간다
    하위 조직 포함 조회       빠지면 본부장이 팀을 하나씩 눌러 보게 된다
    순환 참조 (A 를 A 아래로) 막지 않으면 그 가지가 트리에서 통째로 사라진다
"""

import pytest

from app.extensions import db
from app.modules.accounts.models import User
from app.modules.auth import security, tokens
from app.modules.cards.models import Card
from app.modules.orgs import services as org_services
from app.modules.orgs.models import CardMount, Organization


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


def _machine(app, user_id):
    with app.app_context():
        _, raw = tokens.create(db.session.get(User, user_id), 'mcp')
        return {'Authorization': f'Bearer {raw}'}


def _org(app, name, parent=None):
    with app.app_context():
        return org_services.create_org(name, parent_slug=parent).slug


def _card(app, owner_id, name, published=True):
    with app.app_context():
        card = Card(name=name, description='', route=f'/{name}', sort_order=0,
                    created_by_id=owner_id,
                    home_org_slug=org_services.personal_slug(owner_id),
                    status='published' if published else 'draft')
        db.session.add(card)
        db.session.commit()
        return card.id


# --- 개인 공간 -------------------------------------------------------------------

def test_card_is_born_in_the_creators_personal_space(app, client):
    _user(app, 'kim@x.com')
    head = _login(client, 'kim@x.com')

    card = client.post('/api/cards', json={'name': '볼트 강도'}, headers=head).get_json()

    assert card['home_org_slug'].startswith('personal-')
    # 만들자마자 어느 조직에도 걸리지 않는다. 올릴지는 그다음 결정이다.
    assert card['mounted_orgs'] == []


def test_tree_call_creates_the_personal_space_if_missing(app, client):
    """조직 기능이 붙기 전에 가입한 사람도 자기 공간을 갖게 된다.

    없으면 카드를 만들려는 순간 막히는데, 그때 고칠 방법이 화면에 없다.
    """
    uid = _user(app, 'old@x.com')
    with app.app_context():
        db.session.delete(db.session.get(Organization, f'personal-{uid}'))
        db.session.commit()

    body = client.get('/api/orgs/tree', headers=_login(client, 'old@x.com')).get_json()
    assert body['personal']['slug'] == f'personal-{uid}'


def test_other_peoples_personal_space_is_closed(app, client):
    """카드가 다 보이는 것과 **남의 서랍이 열리는 것**은 다른 얘기다."""
    a = _user(app, 'a@x.com')
    _user(app, 'b@x.com')
    _card(app, a, '내-초안', published=False)

    r = client.get(f'/api/cards?org=personal-{a}', headers=_login(client, 'b@x.com'))
    assert r.status_code == 403

    # 관리자는 볼 수 있다 — 초안 검토가 관리자의 일이기 때문이다.
    _user(app, 'admin@x.com', admin=True)
    r = client.get(f'/api/cards?org=personal-{a}', headers=_login(client, 'admin@x.com'))
    assert r.status_code == 200


# --- 게시 ------------------------------------------------------------------------

def test_mount_makes_the_card_show_in_that_org(app, client):
    uid = _user(app, 'kim@x.com')
    head = _login(client, 'kim@x.com')
    _user(app, 'admin@x.com', admin=True)
    team = _org(app, '설계1팀')
    card_id = _card(app, uid, '볼트')

    assert client.get(f'/api/cards?org={team}', headers=head).get_json() == []

    r = client.post(f'/api/cards/{card_id}/mounts', json={'org_slug': team}, headers=head)
    assert r.status_code == 201

    names = [c['name'] for c in client.get(f'/api/cards?org={team}', headers=head).get_json()]
    assert names == ['볼트']


def test_one_card_can_live_in_several_orgs(app, client):
    """같은 계산을 두 팀이 함께 쓰는 일이 흔하다. 사본을 만들면 한쪽만 고쳐진다."""
    uid = _user(app, 'kim@x.com')
    head = _login(client, 'kim@x.com')
    design, quality = _org(app, '설계1팀'), _org(app, '품질팀')
    card_id = _card(app, uid, '볼트')

    for slug in (design, quality):
        client.post(f'/api/cards/{card_id}/mounts', json={'org_slug': slug}, headers=head)

    # 카드 하나만 주는 라우트는 없다 — 화면도 목록에서 읽는다.
    rows = client.get('/api/cards', headers=head).get_json()
    card = next(c for c in rows if c['id'] == card_id)
    assert {o['slug'] for o in card['mounted_orgs']} == {design, quality}


def test_mounting_twice_is_not_an_error_and_does_not_duplicate(app, client):
    uid = _user(app, 'kim@x.com')
    head = _login(client, 'kim@x.com')
    team = _org(app, '설계1팀')
    card_id = _card(app, uid, '볼트')

    client.post(f'/api/cards/{card_id}/mounts', json={'org_slug': team}, headers=head)
    r = client.post(f'/api/cards/{card_id}/mounts', json={'org_slug': team}, headers=head)
    assert r.status_code == 200

    rows = client.get(f'/api/cards?org={team}', headers=head).get_json()
    assert len(rows) == 1


def test_draft_cannot_be_mounted(app, client):
    """검토를 건너뛴 카드가 팀 게시판에 걸리면 두 단계를 나눈 의미가 없다."""
    uid = _user(app, 'kim@x.com')
    head = _login(client, 'kim@x.com')
    team = _org(app, '설계1팀')
    card_id = _card(app, uid, '초안', published=False)

    r = client.post(f'/api/cards/{card_id}/mounts', json={'org_slug': team}, headers=head)
    assert r.status_code == 409
    assert r.get_json()['code'] == 'MD-CARDS-0110'


def test_token_cannot_mount(app, client):
    """AI 가 만들고 스스로 팀 게시판에 거는 길을 열지 않는다."""
    uid = _user(app, 'kim@x.com')
    team = _org(app, '설계1팀')
    card_id = _card(app, uid, '볼트')

    r = client.post(f'/api/cards/{card_id}/mounts', json={'org_slug': team},
                    headers=_machine(app, uid))
    assert r.status_code == 403
    assert r.get_json()['code'] == 'MD-CARDS-0101'


def test_unmount_leaves_the_card_in_the_personal_space(app, client):
    """조직에서 내려도 카드는 지워지지 않는다."""
    uid = _user(app, 'kim@x.com')
    head = _login(client, 'kim@x.com')
    team = _org(app, '설계1팀')
    card_id = _card(app, uid, '볼트')
    client.post(f'/api/cards/{card_id}/mounts', json={'org_slug': team}, headers=head)

    r = client.delete(f'/api/cards/{card_id}/mounts/{team}', headers=head)
    assert r.status_code == 200

    assert client.get(f'/api/cards?org={team}', headers=head).get_json() == []
    mine = client.get(f'/api/cards?org=personal-{uid}', headers=head).get_json()
    assert [c['name'] for c in mine] == ['볼트']


# --- 트리 ------------------------------------------------------------------------

def test_parent_shows_cards_mounted_on_its_children(app, client):
    """팀에만 올린 카드를 본부에서 못 보면 본부장은 팀을 하나씩 눌러 보게 된다."""
    uid = _user(app, 'kim@x.com')
    head = _login(client, 'kim@x.com')
    div = _org(app, '설계본부')
    team = _org(app, '설계1팀', parent=div)
    card_id = _card(app, uid, '볼트')
    client.post(f'/api/cards/{card_id}/mounts', json={'org_slug': team}, headers=head)

    names = [c['name'] for c in client.get(f'/api/cards?org={div}', headers=head).get_json()]
    assert names == ['볼트']


def test_a_card_on_two_child_teams_is_listed_once_at_the_parent(app, client):
    uid = _user(app, 'kim@x.com')
    head = _login(client, 'kim@x.com')
    div = _org(app, '설계본부')
    t1 = _org(app, '설계1팀', parent=div)
    t2 = _org(app, '설계2팀', parent=div)
    card_id = _card(app, uid, '볼트')
    for slug in (t1, t2):
        client.post(f'/api/cards/{card_id}/mounts', json={'org_slug': slug}, headers=head)

    rows = client.get(f'/api/cards?org={div}', headers=head).get_json()
    assert len(rows) == 1


def test_personal_spaces_are_not_in_the_org_tree(app, client):
    """사람이 늘 때마다 조직도 아래가 사람 목록으로 길어지면 부서를 찾을 수 없다."""
    _user(app, 'kim@x.com')
    _org(app, '설계본부')

    body = client.get('/api/orgs/tree', headers=_login(client, 'kim@x.com')).get_json()
    kinds = {n['kind'] for n in body['tree']}
    assert kinds == {'org'}


def test_only_admin_can_change_the_tree(app, client):
    _user(app, 'kim@x.com')
    _user(app, 'admin@x.com', admin=True)

    r = client.post('/api/orgs', json={'name': '설계본부'}, headers=_login(client, 'kim@x.com'))
    assert r.status_code == 403

    r = client.post('/api/orgs', json={'name': '설계본부'},
                    headers=_login(client, 'admin@x.com'))
    assert r.status_code == 201
    # 한글 이름을 음차하지 않는다 — 주소와 화면의 이름이 따로 놀면 안 된다.
    assert r.get_json()['slug'] == '설계본부'


def test_moving_an_org_under_itself_is_refused(app, client):
    """막지 않으면 그 가지가 트리에서 통째로 사라진다. 오류도 나지 않는다."""
    _user(app, 'admin@x.com', admin=True)
    head = _login(client, 'admin@x.com')
    div = _org(app, '설계본부')
    team = _org(app, '설계1팀', parent=div)

    r = client.put(f'/api/orgs/{div}', json={'parent_slug': team}, headers=head)
    assert r.status_code == 400
    assert r.get_json()['code'] == 'MD-ORG-0103'

    r = client.put(f'/api/orgs/{div}', json={'parent_slug': div}, headers=head)
    assert r.get_json()['code'] == 'MD-ORG-0102'


def test_org_with_children_or_cards_is_not_deleted_silently(app, client):
    uid = _user(app, 'kim@x.com')
    _user(app, 'admin@x.com', admin=True)
    admin_head = _login(client, 'admin@x.com')
    div = _org(app, '설계본부')
    team = _org(app, '설계1팀', parent=div)

    r = client.delete(f'/api/orgs/{div}', headers=admin_head)
    assert r.status_code == 400 and r.get_json()['code'] == 'MD-ORG-0107'

    card_id = _card(app, uid, '볼트')
    client.post(f'/api/cards/{card_id}/mounts', json={'org_slug': team},
                headers=_login(client, 'kim@x.com'))
    r = client.delete(f'/api/orgs/{team}', headers=admin_head)
    assert r.status_code == 400 and r.get_json()['code'] == 'MD-ORG-0108'


def test_same_name_orgs_get_distinct_slugs(app, client):
    """본부마다 '1팀' 이 있는 회사가 흔하다. 겹치면 뒤엣것이 앞엣것을 덮어쓴다."""
    _user(app, 'admin@x.com', admin=True)
    head = _login(client, 'admin@x.com')

    a = client.post('/api/orgs', json={'name': '1팀'}, headers=head).get_json()
    b = client.post('/api/orgs', json={'name': '1팀'}, headers=head).get_json()
    assert a['slug'] != b['slug']


def test_soft_delete_keeps_mounts_and_purge_removes_them(app, client):
    """휴지통에 있는 동안 게시는 남는다 — 되살릴 때 원래 조직으로 돌아가야 한다.

    완전 삭제에서는 없어진다. 남으면 조직 목록이 없는 카드를 가리킨다.
    """
    uid = _user(app, 'kim@x.com')
    head = _login(client, 'kim@x.com')
    team = _org(app, '설계1팀')
    card_id = _card(app, uid, '볼트')
    client.post(f'/api/cards/{card_id}/mounts', json={'org_slug': team}, headers=head)

    client.delete(f'/api/cards/{card_id}', headers=head)
    with app.app_context():
        assert CardMount.query.filter_by(org_slug=team).count() == 1

    client.delete(f'/api/cards/{card_id}/permanent', headers=head)
    with app.app_context():
        assert CardMount.query.filter_by(org_slug=team).count() == 0


# --- 드래그로 옮기기 ---------------------------------------------------------------

def _slugs_in_order(client, head, parent=None):
    body = client.get('/api/orgs/tree', headers=head).get_json()

    def find(nodes):
        for n in nodes:
            if n['slug'] == parent:
                return n['children']
            hit = find(n['children'])
            if hit is not None:
                return hit
        return None

    nodes = body['tree'] if parent is None else find(body['tree'])
    return [n['slug'] for n in nodes]


def test_move_reorders_siblings(app, client):
    """드래그로 순서를 바꾼다. 서버가 형제 전부를 0부터 다시 매긴다."""
    _user(app, 'admin@x.com', admin=True)
    head = _login(client, 'admin@x.com')
    a, b, c = _org(app, '가팀'), _org(app, '나팀'), _org(app, '다팀')
    assert _slugs_in_order(client, head) == [a, b, c]

    r = client.put(f'/api/orgs/{c}/move', json={'parent_slug': None, 'position': 0},
                   headers=head)
    assert r.status_code == 200
    assert _slugs_in_order(client, head) == [c, a, b]


def test_move_changes_parent(app, client):
    _user(app, 'admin@x.com', admin=True)
    head = _login(client, 'admin@x.com')
    div = _org(app, '설계본부')
    team = _org(app, '설계1팀')

    client.put(f'/api/orgs/{team}/move', json={'parent_slug': div, 'position': 0},
               headers=head)
    assert _slugs_in_order(client, head) == [div]
    assert _slugs_in_order(client, head, parent=div) == [team]


def test_move_into_own_descendant_is_refused(app, client):
    """드래그는 손이 미끄러지기 쉽다. 막지 않으면 그 가지가 트리에서 사라진다."""
    _user(app, 'admin@x.com', admin=True)
    head = _login(client, 'admin@x.com')
    div = _org(app, '설계본부')
    team = _org(app, '설계1팀', parent=div)

    r = client.put(f'/api/orgs/{div}/move', json={'parent_slug': team, 'position': 0},
                   headers=head)
    assert r.status_code == 400
    assert r.get_json()['code'] == 'MD-ORG-0103'
    # 실패한 이동은 아무것도 바꾸지 않는다.
    assert _slugs_in_order(client, head) == [div]


def test_move_position_out_of_range_lands_at_the_end(app, client):
    """드래그 중 목록이 바뀌었을 때 오류보다 '맨 뒤' 가 기대에 가깝다."""
    _user(app, 'admin@x.com', admin=True)
    head = _login(client, 'admin@x.com')
    a, b = _org(app, '가팀'), _org(app, '나팀')

    client.put(f'/api/orgs/{a}/move', json={'parent_slug': None, 'position': 99},
               headers=head)
    assert _slugs_in_order(client, head) == [b, a]


def test_only_admin_can_move(app, client):
    _user(app, 'kim@x.com')
    _user(app, 'admin@x.com', admin=True)
    a = _org(app, '가팀')

    r = client.put(f'/api/orgs/{a}/move', json={'parent_slug': None, 'position': 0},
                   headers=_login(client, 'kim@x.com'))
    assert r.status_code == 403
