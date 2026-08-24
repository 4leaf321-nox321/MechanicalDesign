"""카드 복제 — 무엇을 가져오고 무엇을 두고 오는가.

'M10 볼트 검토' 로 'M12' 를 만드는 일이 가장 흔한 작업인데, 그때마다 변수
스무 개를 손으로 다시 만들 수는 없다.

**두고 오는 것들의 공통점은 "검토를 거쳤다" 는 흔적**이다. 게시·변경 이력·
계산 기록이 따라오면 사본이 검토된 카드처럼 보이는데, 그 상태를 막는 것이
이 시스템의 초안 규칙 전부다.

여기서 **조용히 깨지는 것**은 배치의 id 다. 새 id 로 갈아 끼우지 않으면 사본의
화면이 원본의 변수를 가리켜, 원본을 고칠 때 사본이 함께 바뀐다 — 오류는 나지
않고 두 카드가 슬그머니 한 몸이 된다.
"""

import pytest

from app.extensions import db
from app.modules.accounts.models import User
from app.modules.auth import security, tokens
from app.modules.cards.models import Card, Container, Variable, WidgetPlacement
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


def _rich_card(app, owner_id, name='볼트 강도'):
    """변수·컨테이너·배치가 다 있는 카드. 복제가 옮겨야 할 것들이다."""
    with app.app_context():
        card = Card(name=name, description='M10', route='/' + name, color='#e74c3c',
                    sort_order=0, created_by_id=owner_id,
                    home_org_slug=org_services.personal_slug(owner_id),
                    status='published')
        db.session.add(card)
        db.session.commit()

        ctn = Container(card_id=card.id, name='입력', container_type='input',
                        column_count=2, sort_order=1, layout_y=3)
        db.session.add(ctn)
        db.session.commit()

        f = Variable(card_id=card.id, name='하중', symbol='F', category='input',
                     var_type='slider', unit='N', min_value=0, max_value=1000,
                     sort_order=1)
        a = Variable(card_id=card.id, name='단면적', symbol='A', category='input',
                     var_type='text', unit='mm2', sort_order=2)
        sig = Variable(card_id=card.id, name='응력', symbol='sig', category='output',
                       var_type='formula', formula='F / A', unit='N/mm2',
                       sort_order=3)
        db.session.add_all([f, a, sig])
        db.session.commit()

        db.session.add(WidgetPlacement(card_id=card.id, container_id=ctn.id,
                                       variable_id=f.id, sort_order=1))
        db.session.commit()
        return card.id


def _dup(client, head, card_id):
    r = client.post('/api/cards/' + str(card_id) + '/duplicate', headers=head)
    assert r.status_code == 201, r.get_json()
    return r.get_json()['card']


# --- 가져오는 것 -------------------------------------------------------------------

def test_variables_and_containers_come_along(app, client):
    uid = _user(app, 'kim@x.com')
    head = _login(client, 'kim@x.com')
    src = _rich_card(app, uid)

    copy = _dup(client, head, src)

    vars_ = client.get('/api/cards/%d/variables' % copy['id'], headers=head).get_json()
    assert [(v['name'], v['symbol']) for v in vars_] == [
        ('하중', 'F'), ('단면적', 'A'), ('응력', 'sig')]
    # 기호는 그대로 둔다 — 수식이 기호로 서로를 부르므로 바꾸면 전부 깨진다.
    assert next(v for v in vars_ if v['symbol'] == 'sig')['formula'] == 'F / A'

    ctns = client.get('/api/cards/%d/containers' % copy['id'], headers=head).get_json()
    assert [(c['name'], c['column_count']) for c in ctns] == [('입력', 2)]


def test_the_copy_calculates_on_its_own(app, client):
    """옮겨 온 정의로 실제 계산이 도는지 본다. 이것이 복제의 목적이다."""
    uid = _user(app, 'kim@x.com')
    head = _login(client, 'kim@x.com')
    copy = _dup(client, head, _rich_card(app, uid))

    vars_ = client.get('/api/cards/%d/variables' % copy['id'], headers=head).get_json()
    ids = {v['symbol']: v['id'] for v in vars_}
    r = client.post('/api/cards/%d/validate' % copy['id'],
                    json={'values': {str(ids['F']): 600, str(ids['A']): 30}},
                    headers=head)
    body = r.get_json()
    sig = next(x for x in body['results'] if x['symbol'] == 'sig')
    assert sig['value'] == 20


def test_placements_point_at_the_copies_not_the_originals(app, client):
    """갈아 끼우지 않으면 두 카드가 슬그머니 한 몸이 된다."""
    uid = _user(app, 'kim@x.com')
    head = _login(client, 'kim@x.com')
    src = _rich_card(app, uid)
    copy = _dup(client, head, src)

    with app.app_context():
        src_var_ids = {v.id for v in Variable.query.filter_by(card_id=src)}
        src_ctn_ids = {c.id for c in Container.query.filter_by(card_id=src)}
        places = WidgetPlacement.query.filter_by(card_id=copy['id']).all()

        assert len(places) == 1
        assert places[0].variable_id not in src_var_ids
        assert places[0].container_id not in src_ctn_ids


# --- 두고 오는 것 ------------------------------------------------------------------

def test_the_copy_is_a_draft_in_my_own_space(app, client):
    """원본이 게시돼 있었어도 사본은 아무도 보지 않았다."""
    uid = _user(app, 'kim@x.com')
    head = _login(client, 'kim@x.com')
    copy = _dup(client, head, _rich_card(app, uid))

    assert copy['status'] == 'draft'
    assert copy['published_at'] is None
    assert copy['home_org_slug'] == 'personal-%d' % uid


def test_org_postings_do_not_follow(app, client):
    """게시가 따라오면 검토 안 된 사본이 팀 게시판에 걸린다."""
    uid = _user(app, 'kim@x.com')
    _user(app, 'admin@x.com', admin=True)
    head = _login(client, 'kim@x.com')
    with app.app_context():
        team = org_services.create_org('설계1팀').slug
    src = _rich_card(app, uid)
    client.post('/api/cards/%d/mounts' % src, json={'org_slug': team}, headers=head)

    copy = _dup(client, head, src)
    assert copy['mounted_orgs'] == []
    rows = client.get('/api/cards?org=' + team, headers=head).get_json()
    assert [c['name'] for c in rows] == ['볼트 강도']


def test_the_original_is_untouched(app, client):
    uid = _user(app, 'kim@x.com')
    head = _login(client, 'kim@x.com')
    src = _rich_card(app, uid)
    _dup(client, head, src)

    with app.app_context():
        original = db.session.get(Card, src)
        assert original.status == 'published'
        assert Variable.query.filter_by(card_id=src).count() == 3


# --- 이름과 주소 -------------------------------------------------------------------

def test_names_and_routes_do_not_collide(app, client):
    """라우트는 유일해야 한다(DB 제약). 두 번 복제해도 걸리지 않아야 한다."""
    uid = _user(app, 'kim@x.com')
    head = _login(client, 'kim@x.com')
    src = _rich_card(app, uid)

    first = _dup(client, head, src)
    second = _dup(client, head, src)

    assert first['name'] == '볼트 강도 사본'
    assert second['name'] == '볼트 강도 사본 2'
    assert first['route'] != second['route']


# --- 권한과 상태 -------------------------------------------------------------------

def test_anyone_who_can_see_it_can_copy_it(app, client):
    """남의 카드를 가져다 내 조건으로 고쳐 쓰는 것이 이 기능의 목적이다."""
    uid = _user(app, 'kim@x.com')
    other = _user(app, 'lee@x.com')
    src = _rich_card(app, uid)

    copy = _dup(client, _login(client, 'lee@x.com'), src)
    assert copy['home_org_slug'] == 'personal-%d' % other
    assert copy['created_by_id'] == other


def test_others_cannot_copy_a_draft_they_cannot_see(app, client):
    uid = _user(app, 'kim@x.com')
    _user(app, 'lee@x.com')
    src = _rich_card(app, uid)
    with app.app_context():
        db.session.get(Card, src).status = 'draft'
        db.session.commit()

    r = client.post('/api/cards/%d/duplicate' % src, headers=_login(client, 'lee@x.com'))
    assert r.status_code == 404


def test_trashed_cards_are_not_copied(app, client):
    uid = _user(app, 'kim@x.com')
    head = _login(client, 'kim@x.com')
    src = _rich_card(app, uid)
    client.delete('/api/cards/%d' % src, headers=head)

    r = client.post('/api/cards/%d/duplicate' % src, headers=head)
    assert r.status_code == 409
    assert r.get_json()['code'] == 'MD-CARDS-0130'


def test_a_copy_made_by_a_token_is_marked_as_ai(app, client):
    """AI 가 복제한 카드도 사람이 만든 것처럼 보이면 안 된다."""
    uid = _user(app, 'kim@x.com')
    src = _rich_card(app, uid)
    with app.app_context():
        _, raw = tokens.create(db.session.get(User, uid), 'mcp')
    head = {'Authorization': 'Bearer ' + raw}

    copy = _dup(client, head, src)
    assert copy['origin'] == 'mcp'
    assert copy['ai_touched_at'] is not None
