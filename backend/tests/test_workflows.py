"""워크플로 — 카드를 이어 값이 흐르게 한다.

카드 하나는 섬이다. 하중을 구한 뒤 그 값을 볼트 카드에 손으로 옮겨 적어야 하고,
옮겨 적는 순간 두 계산이 어긋나기 시작한다.

**여기서 지키는 것은 배선의 불변식**이다. 전부 오류 없이 틀린 답이 나오는 종류다.

    한 입력에 연결 하나        둘이면 어느 값이 이기는지 알 수 없다
    입력에만 꽂을 수 있다      계산되는 칸에 밀어 넣으면 그 수식이 조용히 무시된다
    결과만 내보낼 수 있다      입력을 입력에 잇는 것은 값을 두 번 적는 것일 뿐
    쓰이는 카드는 못 지운다    지우면 그 자리가 뜻을 잃고 워크플로가 반쪽이 된다

**순환은 이제 막지 않는다.** 서로 물고 있는 모델은 기계 설계에 실제로 있고
(축 지름 → 자중 → 하중 → 축 지름), 그런 고리는 돌려서 수렴시킨다. 영영 도는
실행이 무서워 막았던 것인데 이제 반복 한도가 그 일을 한다. 어디가 고리이고
어디에 초기 추정값이 필요한지는 **계산하는 쪽**이 안다 — 서버가 같은 것을 다시
구현하면 두 벌이 되고, 두 벌은 반드시 어긋난다.
"""

import pytest

from app.extensions import db
from app.modules.accounts.models import User
from app.modules.auth import security, tokens
from app.modules.cards.models import Card, Variable
from app.modules.orgs import services as org_services
from app.modules.workflows.models import (
    Workflow, WorkflowGroup, WorkflowLink, WorkflowNode,
)


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


def _card(app, owner_id, name, variables):
    """variables: [(이름, 기호, 구분, 수식)]"""
    with app.app_context():
        card = Card(name=name, description='', route='/' + name, sort_order=0,
                    created_by_id=owner_id,
                    home_org_slug=org_services.personal_slug(owner_id),
                    status='published')
        db.session.add(card)
        db.session.commit()
        ids = {}
        for i, (vname, symbol, category, formula) in enumerate(variables):
            v = Variable(card_id=card.id, name=vname, symbol=symbol,
                         category=category, formula=formula or '',
                         var_type='formula' if formula else 'text', sort_order=i)
            db.session.add(v)
            db.session.commit()
            ids[symbol] = v.id
        return card.id, ids


@pytest.fixture
def chain(app, client):
    """하중 카드 → 응력 카드. 실제로 이어 볼 두 장."""
    uid = _user(app, 'kim@x.com')
    head = _login(client, 'kim@x.com')
    load_id, load_vars = _card(app, uid, '하중계산', [
        ('무게', 'm', 'input', None),
        ('하중', 'F', 'output', 'm * 9.81'),
    ])
    stress_id, stress_vars = _card(app, uid, '응력검토', [
        ('입력하중', 'Fin', 'input', None),
        ('단면적', 'A', 'input', None),
        ('응력', 'sig', 'output', 'Fin / A'),
    ])
    wf = client.post('/api/workflows', json={'name': '브래킷 검토'},
                     headers=head).get_json()
    return {
        'uid': uid, 'head': head, 'wf': wf,
        'load_id': load_id, 'load_vars': load_vars,
        'stress_id': stress_id, 'stress_vars': stress_vars,
    }


def _node(client, head, wf_id, card_id, alias=''):
    r = client.post(f'/api/workflows/{wf_id}/nodes',
                    json={'card_id': card_id, 'alias': alias}, headers=head)
    assert r.status_code == 201, r.get_json()
    return r.get_json()


def _link(client, head, wf_id, src, from_var, dst, to_var):
    return client.post(f'/api/workflows/{wf_id}/links', headers=head, json={
        'from_node_id': src['id'], 'from_variable_id': from_var,
        'to_node_id': dst['id'], 'to_variable_id': to_var,
    })


# --- 만들기 ----------------------------------------------------------------------

def test_a_new_workflow_is_a_draft_in_my_space(app, client, chain):
    wf = chain['wf']
    assert wf['status'] == 'draft'
    assert wf['home_org_slug'] == f"personal-{chain['uid']}"
    assert wf['node_count'] == 0


def test_nodes_and_links_hold_the_wiring(app, client, chain):
    head, wf = chain['head'], chain['wf']
    load = _node(client, head, wf['id'], chain['load_id'])
    stress = _node(client, head, wf['id'], chain['stress_id'])

    r = _link(client, head, wf['id'], load, chain['load_vars']['F'],
              stress, chain['stress_vars']['Fin'])
    assert r.status_code == 201
    body = r.get_json()
    # 무엇을 이었는지 이름으로 남는다 — 변수가 사라져도 말해 줄 수 있어야 한다.
    assert body['from_label'] == '하중 (F)'
    assert body['to_label'] == '입력하중 (Fin)'

    full = client.get(f"/api/workflows/{wf['id']}", headers=head).get_json()
    assert len(full['nodes']) == 2
    assert len(full['links']) == 1


def test_the_same_card_can_sit_in_two_places(app, client, chain):
    """상부 볼트·하부 볼트처럼 같은 카드를 두 번 쓰는 일이 흔하다."""
    head, wf = chain['head'], chain['wf']
    a = _node(client, head, wf['id'], chain['stress_id'])
    b = _node(client, head, wf['id'], chain['stress_id'])

    assert a['id'] != b['id']
    # 자리 이름이 겹치면 화면에서 구분이 안 된다.
    assert a['alias'] != b['alias']


def test_each_node_keeps_its_own_inputs(app, client, chain):
    """워크플로가 곧 하나의 설계안이 되도록 값을 저장한다."""
    head, wf = chain['head'], chain['wf']
    node = _node(client, head, wf['id'], chain['stress_id'])
    area = chain['stress_vars']['A']

    r = client.put(f"/api/workflows/{wf['id']}/nodes/{node['id']}",
                   json={'inputs': {str(area): 30}}, headers=head)
    assert r.status_code == 200

    full = client.get(f"/api/workflows/{wf['id']}", headers=head).get_json()
    assert full['nodes'][0]['inputs'] == {str(area): 30}


# --- 배선의 불변식 ---------------------------------------------------------------

def test_one_input_takes_only_one_link(app, client, chain):
    """둘이 들어오면 어느 값이 이기는지 알 수 없다."""
    head, wf = chain['head'], chain['wf']
    load_a = _node(client, head, wf['id'], chain['load_id'])
    load_b = _node(client, head, wf['id'], chain['load_id'])
    stress = _node(client, head, wf['id'], chain['stress_id'])
    fin = chain['stress_vars']['Fin']

    assert _link(client, head, wf['id'], load_a, chain['load_vars']['F'],
                 stress, fin).status_code == 201
    r = _link(client, head, wf['id'], load_b, chain['load_vars']['F'], stress, fin)
    assert r.status_code == 409
    assert r.get_json()['code'] == 'MD-WF-0123'


def test_you_cannot_feed_a_calculated_variable(app, client, chain):
    """계산되는 칸에 값을 밀어 넣으면 그 수식이 조용히 무시된다."""
    head, wf = chain['head'], chain['wf']
    load = _node(client, head, wf['id'], chain['load_id'])
    stress = _node(client, head, wf['id'], chain['stress_id'])

    r = _link(client, head, wf['id'], load, chain['load_vars']['F'],
              stress, chain['stress_vars']['sig'])
    assert r.status_code == 400
    assert r.get_json()['code'] == 'MD-WF-0122'


def test_you_cannot_send_an_input_onward(app, client, chain):
    """입력을 입력에 잇는 것은 값을 옮기는 게 아니라 두 번 적는 것이다."""
    head, wf = chain['head'], chain['wf']
    load = _node(client, head, wf['id'], chain['load_id'])
    stress = _node(client, head, wf['id'], chain['stress_id'])

    r = _link(client, head, wf['id'], load, chain['load_vars']['m'],
              stress, chain['stress_vars']['Fin'])
    assert r.status_code == 400
    assert r.get_json()['code'] == 'MD-WF-0121'


def test_a_node_may_feed_itself(app, client, chain):
    """자기 결과를 자기 입력으로 — 가장 단순한 반복이다.

    축 지름이 자중을 낳고 자중이 다시 축 지름을 바꾸는 모양을 카드 한 장으로
    적으면 이렇게 된다. 막을 이유가 없다.
    """
    head, wf = chain['head'], chain['wf']
    stress = _node(client, head, wf['id'], chain['stress_id'])

    r = _link(client, head, wf['id'], stress, chain['stress_vars']['sig'],
              stress, chain['stress_vars']['Fin'])
    assert r.status_code == 201


def test_cycles_are_allowed(app, client, chain):
    """서로 물고 있어도 이을 수 있다 — 반복 블록이 된다."""
    head, wf = chain['head'], chain['wf']
    # A(응력검토) → B(응력검토) → A
    a = _node(client, head, wf['id'], chain['stress_id'])
    b = _node(client, head, wf['id'], chain['stress_id'])
    sig, fin, area = (chain['stress_vars']['sig'], chain['stress_vars']['Fin'],
                      chain['stress_vars']['A'])

    assert _link(client, head, wf['id'], a, sig, b, fin).status_code == 201
    assert _link(client, head, wf['id'], b, sig, a, area).status_code == 201

    full = client.get(f"/api/workflows/{wf['id']}", headers=head).get_json()
    assert len(full['links']) == 2

    # 다른 규칙은 그대로 산다 — 한 입력에는 여전히 하나만.
    again = _link(client, head, wf['id'], a, sig, b, fin)
    assert again.status_code == 409


def test_a_variable_from_another_card_is_refused(app, client, chain):
    """노드의 카드에 없는 변수를 이으면 무엇을 가리키는지 알 수 없다."""
    head, wf = chain['head'], chain['wf']
    load = _node(client, head, wf['id'], chain['load_id'])
    stress = _node(client, head, wf['id'], chain['stress_id'])

    # 하중 카드의 F 를, 하중 노드가 아니라 **응력 노드에서** 내보내려 한다.
    r = _link(client, head, wf['id'], stress, chain['load_vars']['F'],
              load, chain['load_vars']['m'])
    assert r.status_code == 404
    assert r.get_json()['code'] == 'MD-WF-0125'


# --- 지우기 ----------------------------------------------------------------------

def test_removing_a_node_takes_its_links_and_says_so(app, client, chain):
    """연결만 남으면 없는 자리를 가리키게 되고, 고칠 방법이 화면에 없다."""
    head, wf = chain['head'], chain['wf']
    load = _node(client, head, wf['id'], chain['load_id'])
    stress = _node(client, head, wf['id'], chain['stress_id'])
    _link(client, head, wf['id'], load, chain['load_vars']['F'],
          stress, chain['stress_vars']['Fin'])

    r = client.delete(f"/api/workflows/{wf['id']}/nodes/{load['id']}", headers=head)
    assert r.status_code == 200
    assert r.get_json()['dropped_links'] == 1

    with app.app_context():
        assert WorkflowLink.query.filter_by(workflow_id=wf['id']).count() == 0


def test_a_card_in_use_cannot_be_purged(app, client, chain):
    """지우면 그 자리가 뜻을 잃고 워크플로가 조용히 반쪽이 된다."""
    head, wf = chain['head'], chain['wf']
    _node(client, head, wf['id'], chain['load_id'])

    client.delete(f"/api/cards/{chain['load_id']}", headers=head)
    r = client.delete(f"/api/cards/{chain['load_id']}/permanent", headers=head)

    assert r.status_code == 409
    assert r.get_json()['code'] == 'MD-CARDS-0123'
    assert '브래킷 검토' in r.get_json()['error']


def test_a_trashed_workflow_still_protects_its_cards(app, client, chain):
    """휴지통 워크플로는 **되살릴 수 있다.**

    빼놓고 카드를 지우면, 되살린 순간 없는 카드를 가리키는 워크플로가 된다 —
    그때는 무엇이 있었는지 알 방법이 없다. 대신 어느 것이 휴지통에 있는지
    말해 주어, 무엇을 먼저 비워야 하는지 알게 한다.
    """
    head, wf = chain['head'], chain['wf']
    _node(client, head, wf['id'], chain['load_id'])
    client.delete(f"/api/workflows/{wf['id']}", headers=head)

    client.delete(f"/api/cards/{chain['load_id']}", headers=head)
    r = client.delete(f"/api/cards/{chain['load_id']}/permanent", headers=head)
    assert r.status_code == 409
    assert '휴지통' in r.get_json()['error']

    # 워크플로를 완전히 비우면 그때는 지울 수 있다.
    client.delete(f"/api/workflows/{wf['id']}/permanent", headers=head)
    assert client.delete(f"/api/cards/{chain['load_id']}/permanent",
                         headers=head).status_code == 200


def test_trashed_cards_cannot_be_added(app, client, chain):
    head, wf = chain['head'], chain['wf']
    client.delete(f"/api/cards/{chain['load_id']}", headers=head)

    r = client.post(f"/api/workflows/{wf['id']}/nodes",
                    json={'card_id': chain['load_id']}, headers=head)
    assert r.status_code == 409
    assert r.get_json()['code'] == 'MD-WF-0111'


def test_workflow_trash_round_trip(app, client, chain):
    head, wf = chain['head'], chain['wf']
    _node(client, head, wf['id'], chain['load_id'])

    assert client.delete(f"/api/workflows/{wf['id']}", headers=head).status_code == 200
    assert [w['name'] for w in
            client.get('/api/workflows/trash', headers=head).get_json()] == ['브래킷 검토']

    assert client.post(f"/api/workflows/{wf['id']}/restore",
                       headers=head).status_code == 200
    assert client.get('/api/workflows/trash', headers=head).get_json() == []


# --- 보이기와 게시 ---------------------------------------------------------------

def test_others_cannot_see_my_draft(app, client, chain):
    _user(app, 'lee@x.com')
    r = client.get(f"/api/workflows/{chain['wf']['id']}",
                   headers=_login(client, 'lee@x.com'))
    assert r.status_code == 404


def test_the_plain_list_shows_published_only(app, client, chain):
    head, wf = chain['head'], chain['wf']
    assert client.get('/api/workflows', headers=head).get_json() == []

    _node(client, head, wf['id'], chain['load_id'])
    assert client.post(f"/api/workflows/{wf['id']}/publish",
                       headers=head).status_code == 200
    assert [w['name'] for w in
            client.get('/api/workflows', headers=head).get_json()] == ['브래킷 검토']


def test_an_empty_workflow_cannot_be_published(app, client, chain):
    head, wf = chain['head'], chain['wf']
    r = client.post(f"/api/workflows/{wf['id']}/publish", headers=head)
    assert r.status_code == 400
    assert r.get_json()['code'] == 'MD-WF-0132'


def test_a_token_cannot_publish(app, client, chain):
    head, wf = chain['head'], chain['wf']
    _node(client, head, wf['id'], chain['load_id'])
    with app.app_context():
        _, raw = tokens.create(db.session.get(User, chain['uid']), 'mcp')

    r = client.post(f"/api/workflows/{wf['id']}/publish",
                    headers={'Authorization': f'Bearer {raw}'})
    assert r.status_code == 403
    assert r.get_json()['code'] == 'MD-WF-0130'


def test_org_posting_reuses_the_card_rules(app, client, chain):
    head, wf = chain['head'], chain['wf']
    _user(app, 'admin@x.com', admin=True)
    with app.app_context():
        team = org_services.create_org('설계1팀').slug

    _node(client, head, wf['id'], chain['load_id'])
    # 초안은 조직에 올릴 수 없다 — 카드와 같은 규칙이다.
    r = client.post(f"/api/workflows/{wf['id']}/mounts",
                    json={'org_slug': team}, headers=head)
    assert r.status_code == 409

    client.post(f"/api/workflows/{wf['id']}/publish", headers=head)
    assert client.post(f"/api/workflows/{wf['id']}/mounts",
                       json={'org_slug': team}, headers=head).status_code == 201
    assert [w['name'] for w in
            client.get(f'/api/workflows?org={team}', headers=head).get_json()] \
        == ['브래킷 검토']


# --- 실행 순서 -------------------------------------------------------------------

def test_the_server_hands_over_what_the_order_needs(app, client, chain):
    """**실행 순서는 서버가 정하지 않는다.**

    순환을 허용한 뒤로 순서는 「서로 물린 것끼리 묶고, 묶음 안에서는 수렴할
    때까지 돌린다」 는 규칙이 되었다. 그 규칙은 계산기가 안다 — 서버가 같은
    것을 다른 말로 한 번 더 구현하면 두 벌이 되고, 두 벌은 반드시 어긋난다.
    그때 새는 쪽은 아무 오류도 내지 않는다.

    서버가 지는 책임은 **순서를 정할 재료를 빠짐없이 넘기는 것**이다.
    """
    head, wf = chain['head'], chain['wf']
    # 일부러 응력 노드를 먼저 만든다 — 만든 차례와 배선은 다르다.
    stress = _node(client, head, wf['id'], chain['stress_id'])
    load = _node(client, head, wf['id'], chain['load_id'])
    _link(client, head, wf['id'], load, chain['load_vars']['F'],
          stress, chain['stress_vars']['Fin'])

    full = client.get(f"/api/workflows/{wf['id']}", headers=head).get_json()
    assert 'order' not in full
    assert {n['id'] for n in full['nodes']} == {load['id'], stress['id']}

    link = full['links'][0]
    assert link['from_node_id'] == load['id']
    assert link['to_node_id'] == stress['id']


def test_iteration_settings_round_trip(app, client, chain):
    """반복 기준은 워크플로에 저장된다."""
    head, wf = chain['head'], chain['wf']

    body = client.get(f"/api/workflows/{wf['id']}", headers=head).get_json()
    assert body['iter_max'] == 200
    assert body['iter_relaxation'] == 0.7

    r = client.put(f"/api/workflows/{wf['id']}", headers=head,
                   json={'iter_max': 200, 'iter_relaxation': 0.3,
                         'iter_tolerance': 1e-4})
    assert r.status_code == 200

    body = client.get(f"/api/workflows/{wf['id']}", headers=head).get_json()
    assert body['iter_max'] == 200
    assert body['iter_relaxation'] == 0.3
    assert body['iter_tolerance'] == 1e-4


def test_iteration_settings_are_bounded(app, client, chain):
    """오타 하나로 화면이 멎으면 안 된다.

    계산은 브라우저에서 돈다. 반복 한도에 100000 이 들어가면 그 워크플로를 연
    사람의 화면이 통째로 멈춘다.
    """
    head, wf = chain['head'], chain['wf']

    r = client.put(f"/api/workflows/{wf['id']}", headers=head,
                   json={'iter_max': 100000})
    assert r.status_code == 400
    assert r.get_json()['code'] == 'MD-WF-0131'

    # 완화계수 0 은 값이 영영 안 움직여 「수렴」 처럼 보인다 — 더 나쁜 쪽이다.
    assert client.put(f"/api/workflows/{wf['id']}", headers=head,
                      json={'iter_relaxation': 0}).status_code == 400

    assert client.put(f"/api/workflows/{wf['id']}", headers=head,
                      json={'iter_tolerance': 'abc'}).status_code == 400

    # 막힌 뒤에도 원래 값 그대로.
    body = client.get(f"/api/workflows/{wf['id']}", headers=head).get_json()
    assert body['iter_max'] == 200


def test_node_and_link_counts_are_in_the_list(app, client, chain):
    head, wf = chain['head'], chain['wf']
    load = _node(client, head, wf['id'], chain['load_id'])
    stress = _node(client, head, wf['id'], chain['stress_id'])
    _link(client, head, wf['id'], load, chain['load_vars']['F'],
          stress, chain['stress_vars']['Fin'])
    client.post(f"/api/workflows/{wf['id']}/publish", headers=head)

    row = client.get('/api/workflows', headers=head).get_json()[0]
    assert (row['node_count'], row['link_count']) == (2, 1)


def test_only_the_owner_or_an_admin_can_edit(app, client, chain):
    _user(app, 'lee@x.com')
    head, wf = chain['head'], chain['wf']
    _node(client, head, wf['id'], chain['load_id'])
    client.post(f"/api/workflows/{wf['id']}/publish", headers=head)

    r = client.post(f"/api/workflows/{wf['id']}/nodes",
                    json={'card_id': chain['stress_id']},
                    headers=_login(client, 'lee@x.com'))
    assert r.status_code == 403


def test_the_workflow_row_survives_a_deleted_variable(app, client, chain):
    """변수를 지워도 연결 행은 남아, 무엇을 가리키던 것인지 말할 수 있어야 한다."""
    head, wf = chain['head'], chain['wf']
    load = _node(client, head, wf['id'], chain['load_id'])
    stress = _node(client, head, wf['id'], chain['stress_id'])
    _link(client, head, wf['id'], load, chain['load_vars']['F'],
          stress, chain['stress_vars']['Fin'])

    client.delete(f"/api/cards/{chain['load_id']}/variables/{chain['load_vars']['F']}",
                  headers=head)

    full = client.get(f"/api/workflows/{wf['id']}", headers=head).get_json()
    assert len(full['links']) == 1
    assert full['links'][0]['from_label'] == '하중 (F)'


def test_workflows_live_in_their_own_namespace(app, client, chain):
    """주소가 카드와 겹치면 안 된다."""
    with app.app_context():
        wf = db.session.get(Workflow, chain['wf']['id'])
        assert wf.route.startswith('/wf/')
        assert WorkflowNode.query.filter_by(workflow_id=wf.id).count() == 0


# --- 목록 화면이 쓰는 것들 -----------------------------------------------------

def test_the_tree_counts_cards_and_workflows_separately(app, client, chain):
    """워크플로만 있는 조직이 '0' 으로 보이면 아무도 안 눌러 본다."""
    head, wf = chain['head'], chain['wf']
    _user(app, 'admin@x.com', admin=True)
    with app.app_context():
        team = org_services.create_org('설계1팀').slug

    _node(client, head, wf['id'], chain['load_id'])
    client.post(f"/api/workflows/{wf['id']}/publish", headers=head)
    client.post(f"/api/workflows/{wf['id']}/mounts",
                json={'org_slug': team}, headers=head)
    client.post(f"/api/cards/{chain['stress_id']}/mounts",
                json={'org_slug': team}, headers=head)

    node = next(n for n in client.get('/api/orgs/tree', headers=head).get_json()['tree']
                if n['slug'] == team)
    assert (node['card_count'], node['workflow_count']) == (1, 1)


def test_my_space_counts_both(app, client, chain):
    head = chain['head']
    body = client.get('/api/orgs/tree', headers=head).get_json()
    # 카드 2장(하중·응력)과 워크플로 1개가 개인 공간에 있다.
    assert body['personal']['card_count'] == 2
    assert body['personal']['workflow_count'] == 1


def test_search_finds_workflows_too(app, client, chain):
    """검색이 카드와 워크플로로 갈라지면 어느 쪽인지 모르는 사람이 두 번 찾는다."""
    head, wf = chain['head'], chain['wf']
    _node(client, head, wf['id'], chain['load_id'])
    client.post(f"/api/workflows/{wf['id']}/publish", headers=head)

    rows = client.get('/api/workflows', query_string={'q': '브래킷'},
                      headers=head).get_json()
    assert [w['name'] for w in rows] == ['브래킷 검토']
    assert rows[0]['match'] == ['이름']


def test_search_finds_my_draft_workflow_but_not_someone_elses(app, client, chain):
    head = chain['head']
    _user(app, 'lee@x.com')

    # 초안이어도 내 것은 찾힌다 — 목록에는 안 나오지만.
    assert len(client.get('/api/workflows', query_string={'q': '브래킷'},
                          headers=head).get_json()) == 1
    assert client.get('/api/workflows', query_string={'q': '브래킷'},
                      headers=_login(client, 'lee@x.com')).get_json() == []


def test_an_org_with_a_posted_workflow_is_not_deleted_silently(app, client, chain):
    """카드만 보고 지우면 워크플로 게시가 CASCADE 로 조용히 사라진다."""
    head, wf = chain['head'], chain['wf']
    _user(app, 'admin@x.com', admin=True)
    admin = _login(client, 'admin@x.com')
    with app.app_context():
        team = org_services.create_org('설계1팀').slug

    _node(client, head, wf['id'], chain['load_id'])
    client.post(f"/api/workflows/{wf['id']}/publish", headers=head)
    client.post(f"/api/workflows/{wf['id']}/mounts",
                json={'org_slug': team}, headers=head)

    r = client.delete(f'/api/orgs/{team}', headers=admin)
    assert r.status_code == 400
    assert r.get_json()['code'] == 'MD-ORG-0110'

    # 내리고 나면 지울 수 있다.
    client.delete(f"/api/workflows/{wf['id']}/mounts/{team}", headers=head)
    assert client.delete(f'/api/orgs/{team}', headers=admin).status_code == 200


# --- 편집기가 쓰는 것들 ---------------------------------------------------------

def test_lookup_opens_a_workflow_by_its_route(app, client, chain):
    """편집기는 주소로 연다. 목록에 보일 것과 열 수 있는 것은 다른 질문이다."""
    head, wf = chain['head'], chain['wf']
    r = client.get('/api/workflows/lookup', query_string={'route': wf['route']},
                   headers=head)
    assert r.status_code == 200
    body = r.get_json()
    assert body['name'] == '브래킷 검토'
    # 편집기가 한 번에 다 그릴 수 있어야 한다.
    assert 'nodes' in body and 'links' in body


def test_lookup_hides_someone_elses_draft(app, client, chain):
    _user(app, 'lee@x.com')
    r = client.get('/api/workflows/lookup',
                   query_string={'route': chain['wf']['route']},
                   headers=_login(client, 'lee@x.com'))
    assert r.status_code == 404


def test_bulk_variables_serve_the_editor(app, client, chain):
    """노드마다 따로 부르면 그중 하나가 늦어 화면이 반쯤 그려진다."""
    head = chain['head']
    r = client.get('/api/cards/variables',
                   query_string={'ids': f"{chain['load_id']},{chain['stress_id']}"},
                   headers=head)
    assert r.status_code == 200
    body = r.get_json()
    assert sorted(body.keys()) == sorted([str(chain['load_id']), str(chain['stress_id'])])
    assert len(body[str(chain['stress_id'])]) == 3
    # 편집기가 단위 검사를 하려면 unit_info 가 실려 와야 한다.
    assert 'unit_info' in body[str(chain['load_id'])][0]


def test_bulk_variables_skip_cards_you_cannot_see(app, client, chain):
    """오류로 만들면 남의 초안이 섞인 순간 화면 전체가 안 뜨고, 있다는 사실도 샌다."""
    uid = chain['uid']
    other = _user(app, 'lee@x.com')
    hidden, _ = _card(app, uid, '남의 초안 카드', [('x', 'x', 'input', None)])
    with app.app_context():
        db.session.get(Card, hidden).status = 'draft'
        db.session.commit()

    r = client.get('/api/cards/variables',
                   query_string={'ids': f"{hidden},{chain['stress_id']}"},
                   headers=_login(client, 'lee@x.com'))
    assert r.status_code == 200
    assert str(hidden) not in r.get_json()
    assert other  # 사용자는 만들어졌다


def test_bulk_variables_ignore_junk_ids(app, client, chain):
    r = client.get('/api/cards/variables', query_string={'ids': 'abc,,7x'},
                   headers=chain['head'])
    assert r.status_code == 200
    assert r.get_json() == {}


# --- 워크플로 기록 -------------------------------------------------------------

def _wired(client, head, chain):
    """하중 → 응력 이 이어진 워크플로."""
    wf = chain['wf']
    n1 = _node(client, head, wf['id'], chain['load_id'])
    n2 = _node(client, head, wf['id'], chain['stress_id'])
    _link(client, head, wf['id'], n1, chain['load_vars']['F'],
          n2, chain['stress_vars']['Fin'])
    return wf, n1, n2


# --- 묶음 -----------------------------------------------------------------------

def _group(client, head, wf_id, name, node_ids, color=None):
    return client.post(f'/api/workflows/{wf_id}/groups', headers=head,
                       json={'name': name, 'node_ids': node_ids,
                             **({'color': color} if color else {})})


def test_a_group_boxes_nodes_without_touching_the_wiring(app, client, chain):
    """**묶음은 계산에 아무 영향이 없다.**

    실행 순서는 배선이 정하고 묶음은 사람이 보기 좋으라고 두는 것이다. 둘을
    섞으면 그림을 바꿨을 뿐인데 답이 달라지는 일이 생긴다.
    """
    head = chain['head']
    wf, n1, n2 = _wired(client, head, chain)

    r = _group(client, head, wf['id'], '앞단', [n1['id']])
    assert r.status_code == 201
    assert r.get_json()['node_ids'] == [n1['id']]

    full = client.get(f"/api/workflows/{wf['id']}", headers=head).get_json()
    assert len(full['links']) == 1              # 배선은 그대로
    assert len(full['groups']) == 1
    grouped = next(n for n in full['nodes'] if n['id'] == n1['id'])
    loose = next(n for n in full['nodes'] if n['id'] == n2['id'])
    assert grouped['group_id'] == r.get_json()['id']
    assert loose['group_id'] is None


def test_a_node_belongs_to_one_group_only(app, client, chain):
    """겹치는 묶음을 허용하면 상자가 서로를 가로질러 그림이 안 읽힌다."""
    head = chain['head']
    wf, n1, n2 = _wired(client, head, chain)

    first = _group(client, head, wf['id'], '앞단', [n1['id']]).get_json()
    second = _group(client, head, wf['id'], '뒷단', [n1['id'], n2['id']]).get_json()

    full = client.get(f"/api/workflows/{wf['id']}", headers=head).get_json()
    boxes = {g['id']: g['node_ids'] for g in full['groups']}
    assert boxes[first['id']] == []                       # 먼저 것에서 빠졌다
    assert sorted(boxes[second['id']]) == sorted([n1['id'], n2['id']])


def test_ungrouping_keeps_the_nodes(app, client, chain):
    """상자를 지우는 것은 「이렇게 보지 않겠다」 는 뜻이지 노드를 버리는 게 아니다."""
    head = chain['head']
    wf, n1, n2 = _wired(client, head, chain)
    group = _group(client, head, wf['id'], '앞단', [n1['id'], n2['id']]).get_json()

    r = client.delete(f"/api/workflows/{wf['id']}/groups/{group['id']}",
                      headers=head)
    assert r.status_code == 200

    full = client.get(f"/api/workflows/{wf['id']}", headers=head).get_json()
    assert full['groups'] == []
    assert len(full['nodes']) == 2                        # 노드는 남았다
    assert len(full['links']) == 1                        # 배선도
    assert all(n['group_id'] is None for n in full['nodes'])


def test_a_group_cannot_take_a_node_from_another_workflow(app, client, chain):
    """조용히 무시하면 「묶었는데 안 들어갔다」 가 되고, 화면을 새로 고쳐야 안다."""
    head = chain['head']
    wf, n1, _ = _wired(client, head, chain)
    other = client.post('/api/workflows', json={'name': '다른 것'},
                        headers=head).get_json()
    outsider = _node(client, head, other['id'], chain['load_id'])

    r = _group(client, head, wf['id'], '섞기', [n1['id'], outsider['id']])
    assert r.status_code == 400
    assert r.get_json()['code'] == 'MD-WF-0132'


def test_renaming_a_group_keeps_its_members(app, client, chain):
    head = chain['head']
    wf, n1, n2 = _wired(client, head, chain)
    group = _group(client, head, wf['id'], '앞단', [n1['id']]).get_json()

    r = client.put(f"/api/workflows/{wf['id']}/groups/{group['id']}",
                   headers=head, json={'name': '관로 계열', 'color': '#e74c3c'})
    assert r.status_code == 200
    body = r.get_json()
    assert body['name'] == '관로 계열'
    assert body['color'] == '#e74c3c'
    assert body['node_ids'] == [n1['id']]


def test_deleting_the_workflow_takes_its_groups(app, client, chain):
    head = chain['head']
    wf, n1, _ = _wired(client, head, chain)
    _group(client, head, wf['id'], '앞단', [n1['id']])

    client.delete(f"/api/workflows/{wf['id']}", headers=head)
    client.delete(f"/api/workflows/{wf['id']}/permanent", headers=head)

    with app.app_context():
        assert WorkflowGroup.query.count() == 0


def test_a_workflow_run_can_be_recorded(app, client, chain):
    """돌릴 수는 있는데 남길 수 없으면 반쪽이다."""
    head = chain['head']
    wf, n1, n2 = _wired(client, head, chain)

    r = client.post('/api/records', headers=head, json={
        'workflow_id': wf['id'], 'title': '표준 조건',
        'inputs': {str(n1['id']): {}, str(n2['id']): {}},
        'results': {str(n1['id']): {}, str(n2['id']): {}},
    })
    assert r.status_code == 201
    body = r.get_json()
    assert body['kind'] == 'workflow'
    # 화면이 카드 기록과 한 목록에 늘어놓으므로 이름이 하나로 정해져야 한다.
    assert body['source_name'] == '브래킷 검토'


def test_the_record_snapshots_the_wiring_and_the_card_definitions(app, client, chain):
    """카드는 살아 있는 참조다. 정의를 안 담으면 나중에 무엇을 계산한 것인지 모른다."""
    head = chain['head']
    wf, n1, n2 = _wired(client, head, chain)
    made = client.post('/api/records', headers=head, json={
        'workflow_id': wf['id'], 'title': '표준 조건',
        'inputs': {}, 'results': {},
    }).get_json()

    detail = client.get(f"/api/records/{made['id']}", headers=head).get_json()
    snap = detail['definition_snapshot']
    assert len(snap['nodes']) == 2
    assert len(snap['links']) == 1
    # 노드가 쓰는 카드의 변수까지 통째로.
    assert sorted(int(k) for k in snap['cards']) == sorted(
        [chain['load_id'], chain['stress_id']])
    assert len(snap['cards'][str(chain['stress_id'])]) == 3


def test_an_empty_workflow_has_nothing_to_record(app, client, chain):
    r = client.post('/api/records', headers=chain['head'], json={
        'workflow_id': chain['wf']['id'], 'title': '빈 것',
        'inputs': {}, 'results': {},
    })
    assert r.status_code == 400


def test_workflow_records_are_filtered_and_searched(app, client, chain):
    head = chain['head']
    wf, _, _ = _wired(client, head, chain)
    client.post('/api/records', headers=head, json={
        'workflow_id': wf['id'], 'title': '표준 조건', 'inputs': {}, 'results': {}})

    rows = client.get('/api/records', query_string={'workflow_id': wf['id']},
                      headers=head).get_json()['items']
    assert [r['title'] for r in rows] == ['표준 조건']
    # 워크플로 이름으로도 찾힌다 — 카드 이름으로 찾는 것과 같은 자리다.
    rows = client.get('/api/records', query_string={'q': '브래킷'},
                      headers=head).get_json()['items']
    assert [r['title'] for r in rows] == ['표준 조건']


def test_someone_elses_draft_workflow_record_is_hidden(app, client, chain):
    """초안 워크플로로 돌린 기록이 남에게 보이면 초안을 감춘 의미가 없다."""
    head = chain['head']
    wf, _, _ = _wired(client, head, chain)
    client.post('/api/records', headers=head, json={
        'workflow_id': wf['id'], 'title': '표준 조건', 'inputs': {}, 'results': {}})

    _user(app, 'lee@x.com')
    assert client.get('/api/records',
                      headers=_login(client, 'lee@x.com')).get_json()['items'] == []


def test_a_record_keeps_how_it_was_iterated(app, client, chain):
    """**반복 횟수만으로는 아무 말도 못 한다.**

    10회가 좋은 것인지 나쁜 것인지는 그때의 허용오차와 완화계수를 알아야
    정해진다. 그 값들은 워크플로에 저장되어 있어서 나중에 바뀐다 — 기록을 열었을
    때 지금 설정으로 읽으면 그 계산서는 거짓말을 하게 된다. 그래서 함께 박아 둔다.
    """
    head = chain['head']
    wf, _, _ = _wired(client, head, chain)

    meta = {
        'loops': [{'node_ids': [1, 2], 'iterations': 10, 'residual': 6.2e-09}],
        'iteration': {'tolerance': 1e-06, 'max': 200, 'relaxation': 0.7},
    }
    made = client.post('/api/records', headers=head, json={
        'workflow_id': wf['id'], 'title': '되먹임 검토',
        'inputs': {}, 'results': {}, 'run_meta': meta}).get_json()

    # 기록한 뒤 기준을 바꿔도 기록은 그때를 말한다.
    client.put(f"/api/workflows/{wf['id']}", headers=head,
               json={'iter_relaxation': 0.3, 'iter_max': 20})

    detail = client.get(f"/api/records/{made['id']}", headers=head).get_json()
    assert detail['run_meta'] == meta


def test_a_record_without_iteration_says_nothing(app, client, chain):
    """반복이 없는 계산에 빈 칸을 만들어 두지 않는다. 없는 것과 0 회는 다르다."""
    head = chain['head']
    wf, _, _ = _wired(client, head, chain)

    made = client.post('/api/records', headers=head, json={
        'workflow_id': wf['id'], 'title': '한 번', 'inputs': {}, 'results': {}}).get_json()
    assert made['run_meta'] is None

    # 모양을 강요하지 않는다 — 계산 방식이 늘 때마다 서버가 따라 바뀌면 두 벌이 된다.
    odd = client.post('/api/records', headers=head, json={
        'workflow_id': wf['id'], 'title': '이상한 것', 'inputs': {}, 'results': {},
        'run_meta': 'not-an-object'}).get_json()
    assert odd['run_meta'] is None


def test_a_record_survives_its_workflow(app, client, chain):
    """기록이 남는 것이 이 표의 존재 이유다."""
    head = chain['head']
    wf, _, _ = _wired(client, head, chain)
    made = client.post('/api/records', headers=head, json={
        'workflow_id': wf['id'], 'title': '표준 조건', 'inputs': {}, 'results': {}}).get_json()

    client.delete(f"/api/workflows/{wf['id']}", headers=head)
    client.delete(f"/api/workflows/{wf['id']}/permanent", headers=head)

    detail = client.get(f"/api/records/{made['id']}", headers=head).get_json()
    assert detail['workflow_name'] == '브래킷 검토'
    assert detail['source_exists'] is False
    assert len(detail['definition_snapshot']['nodes']) == 2
