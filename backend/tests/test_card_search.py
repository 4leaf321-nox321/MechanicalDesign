"""카드 검색 — 이름만으로는 못 찾는 것을 찾는다.

트리는 "어느 조직" 은 답하지만 "볼트" 는 못 찾는다. 그리고 실제로 자주 나오는
질문은 **"이 계수를 쓰는 카드가 어디 있지"** 인데, 이름만 훑어서는 거기에 답할
수 없어 사람이 카드를 하나씩 열어 보게 된다.

여기서 지키는 것 셋.

    자리를 가리지 않는다      찾는다는 것은 자리를 모른다는 뜻이다
    내 초안은 포함한다        방금 복제한 사본을 못 찾으면 쓸모가 없다
    남의 초안은 안 나온다     목록에서 감춘 것이 검색으로 새면 감춘 의미가 없다
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


def _card(app, owner_id, name, description='', variables=(), draft=False):
    with app.app_context():
        card = Card(name=name, description=description, route='/' + name,
                    sort_order=0, created_by_id=owner_id,
                    home_org_slug=org_services.personal_slug(owner_id),
                    status='draft' if draft else 'published')
        db.session.add(card)
        db.session.commit()
        for i, (vname, symbol, formula) in enumerate(variables):
            db.session.add(Variable(
                card_id=card.id, name=vname, symbol=symbol, formula=formula,
                category='output' if formula else 'input',
                var_type='formula' if formula else 'text', sort_order=i))
        db.session.commit()
        return card.id


def _search(client, head, q):
    r = client.get('/api/cards', query_string={'q': q}, headers=head)
    assert r.status_code == 200
    return r.get_json()


def test_finds_by_name_and_description(app, client):
    uid = _user(app, 'kim@x.com')
    head = _login(client, 'kim@x.com')
    _card(app, uid, '볼트 강도', description='M10 체결부')
    _card(app, uid, '용접부 검토', description='필릿')

    assert [c['name'] for c in _search(client, head, '볼트')] == ['볼트 강도']
    assert [c['name'] for c in _search(client, head, '체결')] == ['볼트 강도']


def test_finds_by_symbol_and_formula(app, client):
    """'이 계수를 쓰는 카드가 어디 있지' 에 답하는 자리."""
    uid = _user(app, 'kim@x.com')
    head = _login(client, 'kim@x.com')
    _card(app, uid, '낙하 하중', variables=[('중력가속도', 'g', ''),
                                            ('무게', 'W', 'm * 9.81')])
    _card(app, uid, '단순 인장', variables=[('응력', 'sig', 'F / A')])

    assert [c['name'] for c in _search(client, head, '9.81')] == ['낙하 하중']
    assert [c['name'] for c in _search(client, head, 'sig')] == ['단순 인장']


def test_says_why_it_matched(app, client):
    """이름만 나오면 그 카드의 **어디에** 그 값이 있는지 다시 찾아야 한다."""
    uid = _user(app, 'kim@x.com')
    head = _login(client, 'kim@x.com')
    _card(app, uid, '낙하 하중', variables=[('무게', 'W', 'm * 9.81')])

    hit = _search(client, head, '9.81')[0]
    assert hit['match'] == ['무게 (W)']

    hit = _search(client, head, '낙하')[0]
    assert hit['match'] == ['이름']


def test_search_ignores_the_selected_org(app, client):
    """자리를 모르니까 찾는 것이다. org 가 함께 와도 무시한다."""
    uid = _user(app, 'kim@x.com')
    _user(app, 'admin@x.com', admin=True)
    head = _login(client, 'kim@x.com')
    with app.app_context():
        team = org_services.create_org('설계1팀').slug
    src = _card(app, uid, '볼트 강도')
    client.post(f'/api/cards/{src}/mounts', json={'org_slug': team}, headers=head)
    _card(app, uid, '볼트 좌굴')       # 어느 조직에도 안 걸림

    r = client.get('/api/cards', query_string={'q': '볼트', 'org': team}, headers=head)
    assert sorted(c['name'] for c in r.get_json()) == ['볼트 강도', '볼트 좌굴']


def test_my_own_draft_is_findable(app, client):
    """복제한 사본은 초안이다. 검색으로 못 찾으면 쓸모가 없다."""
    uid = _user(app, 'kim@x.com')
    head = _login(client, 'kim@x.com')
    _card(app, uid, '볼트 강도 사본', draft=True)

    assert [c['name'] for c in _search(client, head, '볼트')] == ['볼트 강도 사본']
    # 목록(전체)에는 여전히 안 나온다 — 훑어보는 자리와 찾아가는 자리는 다르다.
    assert client.get('/api/cards', headers=head).get_json() == []


def test_someone_elses_draft_never_shows(app, client):
    """목록에서 감춘 것이 검색으로 새면 감춘 의미가 없다."""
    uid = _user(app, 'kim@x.com')
    _user(app, 'lee@x.com')
    _card(app, uid, '남의 볼트 초안', draft=True)

    assert _search(client, _login(client, 'lee@x.com'), '볼트') == []


def test_trashed_cards_never_show(app, client):
    uid = _user(app, 'kim@x.com')
    head = _login(client, 'kim@x.com')
    cid = _card(app, uid, '볼트 강도')
    client.delete(f'/api/cards/{cid}', headers=head)

    assert _search(client, head, '볼트') == []


def test_search_is_case_insensitive(app, client):
    uid = _user(app, 'kim@x.com')
    head = _login(client, 'kim@x.com')
    _card(app, uid, 'Bolt Check')

    assert [c['name'] for c in _search(client, head, 'bolt')] == ['Bolt Check']


def test_no_match_is_an_empty_list_not_an_error(app, client):
    uid = _user(app, 'kim@x.com')
    head = _login(client, 'kim@x.com')
    _card(app, uid, '볼트 강도')

    assert _search(client, head, '없는말') == []


def test_blank_q_falls_back_to_the_normal_list(app, client):
    """빈 검색어로 목록이 통째로 사라지면 안 된다."""
    uid = _user(app, 'kim@x.com')
    head = _login(client, 'kim@x.com')
    _card(app, uid, '볼트 강도')

    r = client.get('/api/cards', query_string={'q': '   '}, headers=head)
    assert [c['name'] for c in r.get_json()] == ['볼트 강도']
