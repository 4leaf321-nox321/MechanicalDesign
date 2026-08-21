"""초안 — 사람이 보기 전에는 게시되지 않는다.

카드는 사람이 **설계 판단에 쓰는 것**이다. AI 가 만든 정의는 저장도 되고 계산도
되지만 공학적으로는 틀릴 수 있다 — 단위가 어긋났거나, 계수를 잘못 골랐거나,
안전율을 빠뜨려도 숫자는 멀쩡히 나온다. 그래서 만드는 것과 올리는 것 사이에
사람 한 명을 세운다.

지켜야 할 것이 세 가지다.

    토큰으로 만든 카드는 초안이다        요청 본문이 아니라 **인증 방식**으로 판정
    토큰으로는 게시할 수 없다            열어 주면 AI 가 스스로 올려 단계가 사라진다
    남의 초안은 보이지 않는다            보이면 누군가 열어 계산하고 그 숫자를 믿는다

세 번째가 특히 조용하다. 목록에서만 걸러도 하위 자원(변수·컨테이너)은 그대로
열려 있어서, 카드 id 하나만 알면 정의가 통째로 새어 나간다.
"""

import pytest

from app.extensions import db
from app.modules.accounts.models import User
from app.modules.auth import security, tokens
from app.modules.cards.models import Card, Variable


@pytest.fixture
def client(app):
    return app.test_client()


def _user(app, email, admin=False):
    with app.app_context():
        row = User(email=email, display_name=email.split('@')[0], status='active',
                   is_admin=admin, password_hash=security.hash_password('pw-32167'))
        db.session.add(row)
        db.session.commit()
        return row.id


def _human(client, email):
    body = client.post('/api/auth/login',
                       json={'email': email, 'password': 'pw-32167'}).get_json()
    return {'Authorization': f"Bearer {body['access_token']}"}


def _machine(app, user_id):
    """MCP 가 쓰는 것과 같은 자격 증명."""
    with app.app_context():
        _, raw = tokens.create(db.session.get(User, user_id), 'mcp')
        return {'Authorization': f'Bearer {raw}'}


def _working_card(app, card_id):
    """실제로 계산되는 변수 몇 개. 게시는 검증을 통과해야 하므로 필요하다."""
    with app.app_context():
        rows = [
            Variable(card_id=card_id, name='하중', symbol='F',
                     category='input', var_type='text'),
            Variable(card_id=card_id, name='응력', symbol='sig',
                     category='output', var_type='formula', formula='F * 2'),
        ]
        db.session.add_all(rows)
        db.session.commit()


# --- 만들기 --------------------------------------------------------------------


def test_machine_created_card_is_a_draft(app, client):
    """**이 흐름의 출발점.** MCP 로 만든 카드가 바로 모두에게 보이면 안 된다."""
    user_id = _user(app, 'eng@example.com')
    body = client.post('/api/cards', headers=_machine(app, user_id),
                       json={'name': '토큰이 만든 카드'}).get_json()
    assert body['status'] == 'draft'
    assert body['published_at'] is None


def test_machine_cannot_ask_to_be_published(app, client):
    """판정을 요청 본문이 아니라 인증 방식으로 하는 이유.

    본문 값을 믿으면 AI 가 `draft: false` 라고 적어 보내는 순간 검토 단계가
    통째로 사라진다. 지키는 쪽이 정하지 않는 규칙은 규칙이 아니다.
    """
    user_id = _user(app, 'eng@example.com')
    body = client.post('/api/cards', headers=_machine(app, user_id),
                       json={'name': '우회 시도', 'draft': False,
                             'status': 'published'}).get_json()
    assert body['status'] == 'draft'


def test_human_created_card_is_published_as_before(app, client):
    """사람이 웹에서 만들 때는 예전 그대로. 만든 사람이 화면 앞에 있다."""
    _user(app, 'eng@example.com')
    body = client.post('/api/cards', headers=_human(client, 'eng@example.com'),
                       json={'name': '사람이 만든 카드'}).get_json()
    assert body['status'] == 'published'
    assert body['published_by_name'] == 'eng'


def test_human_can_choose_to_start_as_a_draft(app, client):
    _user(app, 'eng@example.com')
    body = client.post('/api/cards', headers=_human(client, 'eng@example.com'),
                       json={'name': '다듬는 중', 'draft': True}).get_json()
    assert body['status'] == 'draft'


# --- 보이기 --------------------------------------------------------------------


def test_someone_elses_draft_is_not_in_the_list(app, client):
    owner_id = _user(app, 'owner@example.com')
    _user(app, 'other@example.com')
    client.post('/api/cards', headers=_machine(app, owner_id), json={'name': '초안'})

    listed = client.get('/api/cards', headers=_human(client, 'other@example.com')).get_json()
    assert listed == []


def test_i_see_my_own_draft(app, client):
    owner_id = _user(app, 'owner@example.com')
    client.post('/api/cards', headers=_machine(app, owner_id), json={'name': '내 초안'})

    listed = client.get('/api/cards', headers=_human(client, 'owner@example.com')).get_json()
    assert [c['name'] for c in listed] == ['내 초안']


def test_admin_sees_every_draft(app, client):
    owner_id = _user(app, 'owner@example.com')
    _user(app, 'boss@example.com', admin=True)
    client.post('/api/cards', headers=_machine(app, owner_id), json={'name': '남의 초안'})

    listed = client.get('/api/cards', headers=_human(client, 'boss@example.com')).get_json()
    assert [c['name'] for c in listed] == ['남의 초안']


@pytest.mark.parametrize('path', [
    '/api/cards/{id}/variables',
    '/api/cards/{id}/containers',
    '/api/cards/{id}/images',
])
def test_draft_sub_resources_are_closed_too(app, client, path):
    """**목록에서만 거르면 소용없다.**

    카드 id 하나만 알면 변수와 컨테이너를 그대로 읽을 수 있고, 그게 카드 정의의
    전부다. 목록을 거른 사람은 막았다고 생각하고 있다.
    """
    owner_id = _user(app, 'owner@example.com')
    _user(app, 'other@example.com')
    card = client.post('/api/cards', headers=_machine(app, owner_id),
                       json={'name': '초안'}).get_json()

    r = client.get(path.format(id=card['id']),
                   headers=_human(client, 'other@example.com'))
    assert r.status_code == 404


def test_draft_cannot_be_edited_by_others(app, client):
    owner_id = _user(app, 'owner@example.com')
    _user(app, 'other@example.com')
    card = client.post('/api/cards', headers=_machine(app, owner_id),
                       json={'name': '초안'}).get_json()

    r = client.post(f"/api/cards/{card['id']}/variables",
                    headers=_human(client, 'other@example.com'),
                    json={'name': '몰래', 'category': 'input', 'var_type': 'text'})
    assert r.status_code == 404


def test_published_card_is_visible_to_everyone(app, client):
    _user(app, 'owner@example.com')
    _user(app, 'other@example.com')
    client.post('/api/cards', headers=_human(client, 'owner@example.com'),
                json={'name': '공개된 카드'})

    listed = client.get('/api/cards', headers=_human(client, 'other@example.com')).get_json()
    assert [c['name'] for c in listed] == ['공개된 카드']


# --- 게시 ---------------------------------------------------------------------


def test_a_person_publishes_the_draft(app, client):
    user_id = _user(app, 'eng@example.com')
    card = client.post('/api/cards', headers=_machine(app, user_id),
                       json={'name': 'AI 가 만든 카드'}).get_json()
    _working_card(app, card['id'])

    r = client.post(f"/api/cards/{card['id']}/publish",
                    headers=_human(client, 'eng@example.com'), json={})
    assert r.status_code == 200, r.get_json()
    body = r.get_json()
    assert body['card']['status'] == 'published'
    assert body['card']['published_by_name'] == 'eng'
    # 누가 만들었는지와 누가 게시했는지는 다른 질문이다. 둘 다 남아야 한다.
    assert body['card']['created_by_name'] == 'eng'


def test_a_token_cannot_publish(app, client):
    """**검토 단계가 이름만 남지 않게 하는 자리.**

    토큰은 그 사람 권한으로 돌지만, 그 사람이 숫자를 보고 눌렀는지는 전혀 다른
    얘기다. 여기를 열면 AI 가 만들고 곧바로 스스로 게시할 수 있다.
    """
    user_id = _user(app, 'eng@example.com')
    machine = _machine(app, user_id)
    card = client.post('/api/cards', headers=machine, json={'name': 'AI 카드'}).get_json()
    _working_card(app, card['id'])

    r = client.post(f"/api/cards/{card['id']}/publish", headers=machine, json={})
    assert r.status_code == 403
    assert '사람이 웹에서' in r.get_json()['error']

    # 정말로 안 올라갔는지 본다. 403 을 받고도 상태가 바뀌었으면 최악이다.
    with app.app_context():
        assert db.session.get(Card, card['id']).status == 'draft'


def test_broken_card_cannot_be_published(app, client):
    """계산이 안 되는 카드를 올리면, 그것을 연 사람은 빈 화면에서 원인을 못 찾는다."""
    user_id = _user(app, 'eng@example.com')
    card = client.post('/api/cards', headers=_machine(app, user_id),
                       json={'name': '깨진 카드'}).get_json()
    with app.app_context():
        db.session.add(Variable(card_id=card['id'], name='응력', symbol='sig',
                                category='output', var_type='formula',
                                formula='F / Nope'))
        db.session.commit()

    r = client.post(f"/api/cards/{card['id']}/publish",
                    headers=_human(client, 'eng@example.com'), json={})
    assert r.status_code == 400
    body = r.get_json()
    # 무엇이 틀렸는지 함께 준다 — '검증 실패' 만으로는 고칠 수 없다.
    assert any('Nope' in i['message'] for i in body['validation']['issues'])


def test_missing_inputs_do_not_block_publishing(app, client):
    """입력값을 안 준 것은 정의의 결함이 아니다.

    안 주면 입력 변수마다 '값 없음' 이 나고 그것을 쓰는 수식이 줄줄이 실패한다.
    그것까지 막으면 게시하려는 사람이 매번 아무 숫자나 채워 통과시키는 요식이
    된다.
    """
    user_id = _user(app, 'eng@example.com')
    card = client.post('/api/cards', headers=_machine(app, user_id),
                       json={'name': '멀쩡한 카드'}).get_json()
    _working_card(app, card['id'])

    r = client.post(f"/api/cards/{card['id']}/publish",
                    headers=_human(client, 'eng@example.com'), json={})
    assert r.status_code == 200
    # 다만 계산이 안 됐다는 사실을 숨기지는 않는다 — 화면이 보여 줄 수 있게 싣는다.
    assert r.get_json()['validation']['ok'] is False


def test_supplied_values_that_fail_do_block(app, client):
    """값을 줬다는 것은 '이 숫자로 계산해 보라' 는 뜻이다. 안 되면 진짜 신호다."""
    user_id = _user(app, 'eng@example.com')
    card = client.post('/api/cards', headers=_machine(app, user_id),
                       json={'name': '0으로 나누는 카드'}).get_json()
    with app.app_context():
        f = Variable(card_id=card['id'], name='하중', symbol='F',
                     category='input', var_type='text')
        db.session.add(f)
        db.session.add(Variable(card_id=card['id'], name='몫', symbol='q',
                                category='output', var_type='formula',
                                formula='F / (F - 5)'))
        db.session.commit()
        f_id = f.id

    r = client.post(f"/api/cards/{card['id']}/publish",
                    headers=_human(client, 'eng@example.com'),
                    json={'values': {str(f_id): 5}})
    assert r.status_code == 400
    assert any(i['source'] == 'trial' for i in r.get_json()['validation']['issues'])


def test_empty_card_cannot_be_published(app, client):
    user_id = _user(app, 'eng@example.com')
    card = client.post('/api/cards', headers=_machine(app, user_id),
                       json={'name': '빈 카드'}).get_json()
    r = client.post(f"/api/cards/{card['id']}/publish",
                    headers=_human(client, 'eng@example.com'), json={})
    assert r.status_code == 400
    assert '변수가 없는' in r.get_json()['error']


def test_others_cannot_publish_my_draft(app, client):
    owner_id = _user(app, 'owner@example.com')
    _user(app, 'other@example.com')
    card = client.post('/api/cards', headers=_machine(app, owner_id),
                       json={'name': '초안'}).get_json()
    _working_card(app, card['id'])

    r = client.post(f"/api/cards/{card['id']}/publish",
                    headers=_human(client, 'other@example.com'), json={})
    # 남에게는 이 카드가 존재하지 않는다 — 가시성 가드가 먼저 걸린다.
    assert r.status_code == 404


def test_admin_can_publish_anyones_draft(app, client):
    owner_id = _user(app, 'owner@example.com')
    _user(app, 'boss@example.com', admin=True)
    card = client.post('/api/cards', headers=_machine(app, owner_id),
                       json={'name': '초안'}).get_json()
    _working_card(app, card['id'])

    r = client.post(f"/api/cards/{card['id']}/publish",
                    headers=_human(client, 'boss@example.com'), json={})
    assert r.status_code == 200


def test_publishing_twice_is_refused(app, client):
    user_id = _user(app, 'eng@example.com')
    card = client.post('/api/cards', headers=_machine(app, user_id),
                       json={'name': '카드'}).get_json()
    _working_card(app, card['id'])
    headers = _human(client, 'eng@example.com')

    assert client.post(f"/api/cards/{card['id']}/publish",
                       headers=headers, json={}).status_code == 200
    assert client.post(f"/api/cards/{card['id']}/publish",
                       headers=headers, json={}).status_code == 409


# --- 내리기 --------------------------------------------------------------------


def test_unpublish_puts_it_back_to_draft(app, client):
    """잘못된 카드를 발견했을 때 지우는 것 말고 할 수 있는 일이 있어야 한다."""
    _user(app, 'eng@example.com')
    headers = _human(client, 'eng@example.com')
    card = client.post('/api/cards', headers=headers, json={'name': '카드'}).get_json()
    assert card['status'] == 'published'

    r = client.post(f"/api/cards/{card['id']}/unpublish", headers=headers, json={})
    assert r.status_code == 200
    assert r.get_json()['card']['status'] == 'draft'
    assert r.get_json()['card']['published_at'] is None

    # 자료는 그대로다 — 지운 것이 아니다.
    with app.app_context():
        assert db.session.get(Card, card['id']) is not None


def test_a_token_cannot_unpublish(app, client):
    user_id = _user(app, 'eng@example.com')
    card = client.post('/api/cards', headers=_human(client, 'eng@example.com'),
                       json={'name': '카드'}).get_json()
    r = client.post(f"/api/cards/{card['id']}/unpublish",
                    headers=_machine(app, user_id), json={})
    assert r.status_code == 403
