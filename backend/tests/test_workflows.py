"""워크플로 — 카드를 이어 값이 흐르게 한다.

카드 하나는 섬이다. 하중을 구한 뒤 그 값을 볼트 카드에 손으로 옮겨 적어야 하고,
옮겨 적는 순간 두 계산이 어긋나기 시작한다.

**여기서 지키는 것은 배선의 불변식**이다. 전부 오류 없이 틀린 답이 나오는 종류다.

    한 입력에 연결 하나        둘이면 어느 값이 이기는지 알 수 없다
    입력에만 꽂을 수 있다      계산되는 칸에 밀어 넣으면 그 수식이 조용히 무시된다
    결과만 내보낼 수 있다      입력을 입력에 잇는 것은 값을 두 번 적는 것일 뿐
    순환 금지                 실행 순서를 정할 수 없다
    쓰이는 카드는 못 지운다    지우면 그 자리가 뜻을 잃고 워크플로가 반쪽이 된다
"""

import pytest

from app.extensions import db
from app.modules.accounts.models import User
from app.modules.auth import security, tokens
from app.modules.cards.models import Card, Variable
from app.modules.orgs import services as org_services
from app.modules.workflows.models import Workflow, WorkflowLink, WorkflowNode


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
    assert full['order'] == [load['id'], stress['id']]


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


def test_a_node_cannot_feed_itself(app, client, chain):
    head, wf = chain['head'], chain['wf']
    stress = _node(client, head, wf['id'], chain['stress_id'])

    r = _link(client, head, wf['id'], stress, chain['stress_vars']['sig'],
              stress, chain['stress_vars']['Fin'])
    assert r.status_code == 400
    assert r.get_json()['code'] == 'MD-WF-0120'


def test_cycles_are_refused(app, client, chain):
    """막지 않으면 실행 순서를 정할 수 없다."""
    head, wf = chain['head'], chain['wf']
    # A(응력검토) → B(응력검토) → A 를 만들어 본다.
    a = _node(client, head, wf['id'], chain['stress_id'])
    b = _node(client, head, wf['id'], chain['stress_id'])
    sig, fin, area = (chain['stress_vars']['sig'], chain['stress_vars']['Fin'],
                      chain['stress_vars']['A'])

    assert _link(client, head, wf['id'], a, sig, b, fin).status_code == 201
    r = _link(client, head, wf['id'], b, sig, a, area)
    assert r.status_code == 400
    assert r.get_json()['code'] == 'MD-WF-0126'

    # 실패한 연결은 아무것도 바꾸지 않는다.
    full = client.get(f"/api/workflows/{wf['id']}", headers=head).get_json()
    assert len(full['links']) == 1
    assert full['order'] is not None


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

def test_execution_order_follows_the_wiring(app, client, chain):
    head, wf = chain['head'], chain['wf']
    # 일부러 응력 노드를 먼저 만든다 — 순서는 만든 차례가 아니라 배선이 정한다.
    stress = _node(client, head, wf['id'], chain['stress_id'])
    load = _node(client, head, wf['id'], chain['load_id'])
    _link(client, head, wf['id'], load, chain['load_vars']['F'],
          stress, chain['stress_vars']['Fin'])

    full = client.get(f"/api/workflows/{wf['id']}", headers=head).get_json()
    assert full['order'] == [load['id'], stress['id']]


def test_unconnected_nodes_still_get_an_order(app, client, chain):
    head, wf = chain['head'], chain['wf']
    a = _node(client, head, wf['id'], chain['load_id'])
    b = _node(client, head, wf['id'], chain['stress_id'])

    full = client.get(f"/api/workflows/{wf['id']}", headers=head).get_json()
    assert sorted(full['order']) == sorted([a['id'], b['id']])


def test_order_is_none_when_the_graph_has_a_cycle(app, client, chain):
    """저장할 때 막지만, DB 를 직접 고친 경우에도 영영 도는 실행보다는 오류가 낫다."""
    head, wf = chain['head'], chain['wf']
    a = _node(client, head, wf['id'], chain['stress_id'])
    b = _node(client, head, wf['id'], chain['stress_id'])
    _link(client, head, wf['id'], a, chain['stress_vars']['sig'],
          b, chain['stress_vars']['Fin'])

    with app.app_context():
        db.session.add(WorkflowLink(
            workflow_id=wf['id'],
            from_node_id=b['id'], from_variable_id=chain['stress_vars']['sig'],
            to_node_id=a['id'], to_variable_id=chain['stress_vars']['A'],
        ))
        db.session.commit()

    full = client.get(f"/api/workflows/{wf['id']}", headers=head).get_json()
    assert full['order'] is None


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
