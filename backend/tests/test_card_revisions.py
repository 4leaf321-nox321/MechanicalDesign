"""변경 이력 — 무엇이 바뀌었는지 말할 수 있어야 한다.

"게시 후 AI 수정됨" 은 뭔가 바뀌었다고만 말했다. 그 표시를 본 사람이 할 수 있는
일은 카드를 열어 수식을 눈으로 훑는 것뿐이고, 수식이 스무 개면 하지 않게 된다.

이력이 쓸모 있으려면 세 가지가 맞아야 한다.

    바뀐 것만 남는다      드래그·재저장까지 쌓이면 정작 수식 한 줄을 못 찾는다
    무엇이 바뀌었나 남는다  "수정됨" 만으로는 앞의 문제가 그대로다
    되돌릴 수 있다        볼 수만 있고 되돌릴 수 없으면 절반이다
"""

import json

import pytest

from app.extensions import db
from app.modules.accounts.models import User
from app.modules.auth import security, tokens
from app.modules.cards import revisions
from app.modules.cards.models import Card, CardRevision, Variable


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


def _card(client, headers, name='볼트 강도'):
    return client.post('/api/cards', headers=headers, json={'name': name}).get_json()['id']


def _add(client, headers, card_id, **spec):
    body = {'name': '하중', 'symbol': 'F', 'category': 'input', 'var_type': 'text'}
    body.update(spec)
    return client.post(f'/api/cards/{card_id}/variables', headers=headers,
                       json=body).get_json()


def _put(client, headers, card_id, var_id, **spec):
    body = {'name': '하중', 'symbol': 'F', 'category': 'input', 'var_type': 'text'}
    body.update(spec)
    return client.put(f'/api/cards/{card_id}/variables/{var_id}', headers=headers,
                      json=body)


def _history(client, headers, card_id):
    return client.get(f'/api/cards/{card_id}/revisions', headers=headers).get_json()


def _texts(revision):
    return [c['text'] for c in revision['changes']]


# --- 무엇이 남는가 --------------------------------------------------------------


def test_adding_a_variable_is_recorded(app, client):
    headers = _login(client) if _user(app) else None
    card_id = _card(client, headers)
    _add(client, headers, card_id)

    history = _history(client, headers, card_id)
    assert len(history) == 1
    assert '변수 추가: 하중(F)' in _texts(history[0])
    assert history[0]['changed_by_name'] == 'eng'
    assert history[0]['via_token'] is False


def test_a_formula_change_says_what_it_was(app, client):
    """**이 기능의 핵심.** '수정됨' 만으로는 아무것도 해결되지 않는다."""
    user_id = _user(app)
    headers = _login(client)
    card_id = _card(client, headers)
    var = _add(client, headers, card_id, name='응력', symbol='sig',
               category='output', var_type='formula', formula='F * 2')

    # 묶임 창을 벗어나게 앞 이력을 과거로 민다.
    _age_last_revision(app, card_id)

    _put(client, headers, card_id, var['id'], name='응력', symbol='sig',
         category='output', var_type='formula', formula='F * 3')

    history = _history(client, headers, card_id)
    assert any('수식: F * 2 → F * 3' in t for t in _texts(history[0])), _texts(history[0])


def _age_last_revision(app, card_id, minutes=30):
    from datetime import timedelta
    with app.app_context():
        row = (CardRevision.query.filter_by(card_id=card_id)
               .order_by(CardRevision.id.desc()).first())
        row.created_at = row.created_at - timedelta(minutes=minutes)
        row.updated_at = row.updated_at - timedelta(minutes=minutes)
        db.session.commit()


def test_renaming_a_symbol_shows_both_sides(app, client):
    user_id = _user(app)
    headers = _login(client)
    card_id = _card(client, headers)
    var = _add(client, headers, card_id)
    _age_last_revision(app, card_id)

    _put(client, headers, card_id, var['id'], symbol='Force')

    texts = _texts(_history(client, headers, card_id)[0])
    assert any('기호: F → Force' in t for t in texts), texts


def test_deleting_a_variable_is_recorded(app, client):
    _user(app)
    headers = _login(client)
    card_id = _card(client, headers)
    var = _add(client, headers, card_id)
    _age_last_revision(app, card_id)

    client.delete(f"/api/cards/{card_id}/variables/{var['id']}", headers=headers)

    assert '변수 삭제: 하중(F)' in _texts(_history(client, headers, card_id)[0])


def test_bulky_definitions_are_not_dumped_into_the_summary(app, client):
    """테이블 정의를 통째로 실으면 목록이 JSON 벽이 되어 못 읽는다."""
    _user(app)
    headers = _login(client)
    card_id = _card(client, headers)
    table = json.dumps({'columns': ['a', 'b'], 'rows': [['1', '2']],
                        'result_column_index': 1, 'keys': []})
    var = _add(client, headers, card_id, name='조회', symbol='T',
               category='output', var_type='table', table_data=table)
    _age_last_revision(app, card_id)

    bigger = json.dumps({'columns': ['a', 'b'], 'rows': [['1', '9']],
                         'result_column_index': 1, 'keys': []})
    _put(client, headers, card_id, var['id'], name='조회', symbol='T',
         category='output', var_type='table', table_data=bigger)

    texts = _texts(_history(client, headers, card_id)[0])
    assert any('테이블 정의 바뀜' in t for t in texts), texts
    assert not any('result_column_index' in t for t in texts)


def test_a_machine_edit_is_marked(app, client):
    user_id = _user(app)
    card_id = _card(client, _login(client))
    _add(client, _machine(app, user_id), card_id)

    history = _history(client, _login(client), card_id)
    assert history[0]['via_token'] is True


# --- 무엇이 남지 않는가 ----------------------------------------------------------


def test_layout_changes_do_not_create_revisions(app, client):
    """**드래그가 이력을 묻으면 안 된다.**

    컨테이너를 옮기는 것은 계산을 바꾸지 않는다. 그런데 그 요청도 카드 쓰기라
    같은 훅을 지나간다 — 경로 목록으로 거르지 않고 **정의를 비교해서** 판단하는
    이유가 이것이다. 목록은 언젠가 빠뜨린다.
    """
    _user(app)
    headers = _login(client)
    card_id = _card(client, headers)
    _add(client, headers, card_id)
    before = len(_history(client, headers, card_id))

    container = client.post(f'/api/cards/{card_id}/containers', headers=headers,
                            json={'name': '입력'}).get_json()
    client.put(f'/api/cards/{card_id}/containers/layout', headers=headers,
               json={'layouts': [{'id': container['id'], 'x': 3, 'y': 4}]})

    assert len(_history(client, headers, card_id)) == before


def test_saving_the_same_thing_twice_adds_nothing(app, client):
    _user(app)
    headers = _login(client)
    card_id = _card(client, headers)
    var = _add(client, headers, card_id)
    _age_last_revision(app, card_id)

    _put(client, headers, card_id, var['id'], formula='')
    count = len(_history(client, headers, card_id))
    _put(client, headers, card_id, var['id'], formula='')
    assert len(_history(client, headers, card_id)) == count


def test_a_refused_write_adds_nothing(app, client):
    _user(app)
    headers = _login(client)
    card_id = _card(client, headers)
    _add(client, headers, card_id)
    before = len(_history(client, headers, card_id))

    r = client.post(f'/api/cards/{card_id}/variables', headers=headers,
                    json={'name': '', 'category': 'input', 'var_type': 'text'})
    assert r.status_code == 400
    assert len(_history(client, headers, card_id)) == before


# --- 묶기 ---------------------------------------------------------------------


def test_consecutive_edits_are_one_entry(app, client):
    """설정 화면에서 변수 스무 개를 손보면 요청도 스무 번이다.

    그걸 스무 줄로 쌓으면 이력을 사람이 읽을 수 없고, 읽을 수 없는 이력은
    없는 것과 같다.
    """
    _user(app)
    headers = _login(client)
    card_id = _card(client, headers)
    for symbol in ('A', 'B', 'C'):
        _add(client, headers, card_id, name=symbol, symbol=symbol)

    history = _history(client, headers, card_id)
    assert len(history) == 1
    # 묶여도 내용은 잃지 않는다 — 세 개가 다 들어 있어야 한다.
    assert len(history[0]['changes']) == 3


def test_a_different_actor_starts_a_new_entry(app, client):
    """묶는 것은 편의지 사실을 뭉개라는 뜻이 아니다. 누가 했는지는 갈라져야 한다."""
    user_id = _user(app, 'owner@example.com')
    _user(app, 'other@example.com')
    headers = _login(client, 'owner@example.com')
    card_id = _card(client, headers)
    _add(client, headers, card_id, name='A', symbol='A')

    _add(client, _login(client, 'other@example.com'), card_id, name='B', symbol='B')

    history = _history(client, headers, card_id)
    assert len(history) == 2
    assert history[0]['changed_by_name'] == 'other'


def test_machine_and_human_edits_do_not_merge(app, client):
    user_id = _user(app)
    headers = _login(client)
    card_id = _card(client, headers)
    _add(client, headers, card_id, name='A', symbol='A')
    _add(client, _machine(app, user_id), card_id, name='B', symbol='B')

    history = _history(client, headers, card_id)
    assert len(history) == 2
    assert history[0]['via_token'] is True
    assert history[1]['via_token'] is False


# --- 되돌리기 -------------------------------------------------------------------


def test_restore_brings_the_old_definition_back(app, client):
    _user(app)
    headers = _login(client)
    card_id = _card(client, headers)
    var = _add(client, headers, card_id, name='응력', symbol='sig',
               category='output', var_type='formula', formula='F * 2')
    _age_last_revision(app, card_id)
    _put(client, headers, card_id, var['id'], name='응력', symbol='sig',
         category='output', var_type='formula', formula='F * 999')

    history = _history(client, headers, card_id)
    old_revision = history[-1]['id']    # 가장 오래된 것 = F * 2 시점

    r = client.post(f'/api/cards/{card_id}/revisions/{old_revision}/restore',
                    headers=headers, json={})
    assert r.status_code == 200, r.get_json()

    with app.app_context():
        assert db.session.get(Variable, var['id']).formula == 'F * 2'


def test_restoring_keeps_variable_ids(app, client):
    """id 가 바뀌면 위젯 배치와 계산 기록이 가리키던 변수가 사라진다."""
    _user(app)
    headers = _login(client)
    card_id = _card(client, headers)
    var = _add(client, headers, card_id, formula='')
    _age_last_revision(app, card_id)
    _put(client, headers, card_id, var['id'], name='바뀐 이름')

    history = _history(client, headers, card_id)
    client.post(f"/api/cards/{card_id}/revisions/{history[-1]['id']}/restore",
                headers=headers, json={})

    with app.app_context():
        row = db.session.get(Variable, var['id'])
        assert row is not None and row.name == '하중'


def test_new_variables_still_save_after_a_restore(app, client):
    """되돌리기는 id 를 직접 넣는다. 시퀀스를 맞추지 않으면 **다음에 만드는 변수가
    이미 있는 id 를 받아** 저장이 통째로 실패한다 — 되돌린 직후에만 터진다."""
    _user(app)
    headers = _login(client)
    card_id = _card(client, headers)
    _add(client, headers, card_id, name='A', symbol='A')
    _age_last_revision(app, card_id)
    _add(client, headers, card_id, name='B', symbol='B')

    history = _history(client, headers, card_id)
    client.post(f"/api/cards/{card_id}/revisions/{history[-1]['id']}/restore",
                headers=headers, json={})

    r = client.post(f'/api/cards/{card_id}/variables', headers=headers,
                    json={'name': 'C', 'symbol': 'C',
                          'category': 'input', 'var_type': 'text'})
    assert r.status_code == 201, r.get_json()


def test_the_restore_itself_is_recorded(app, client):
    """남지 않으면 '어제 값이 달랐는데' 를 되짚을 때 그 자리가 구멍이 된다."""
    _user(app)
    headers = _login(client)
    card_id = _card(client, headers)
    var = _add(client, headers, card_id, formula='')
    _age_last_revision(app, card_id)
    _put(client, headers, card_id, var['id'], name='바뀐 이름')
    _age_last_revision(app, card_id)

    history = _history(client, headers, card_id)
    before = len(history)
    client.post(f"/api/cards/{card_id}/revisions/{history[-1]['id']}/restore",
                headers=headers, json={})

    after = _history(client, headers, card_id)
    assert len(after) == before + 1
    assert any('이름' in t for t in _texts(after[0]))


def test_a_token_cannot_restore(app, client):
    """어느 시점으로 되돌릴지는 내용을 보고 판단하는 일이다."""
    user_id = _user(app)
    headers = _login(client)
    card_id = _card(client, headers)
    var = _add(client, headers, card_id, formula='')
    _age_last_revision(app, card_id)
    _put(client, headers, card_id, var['id'], name='바뀐 이름')

    history = _history(client, headers, card_id)
    r = client.post(f"/api/cards/{card_id}/revisions/{history[-1]['id']}/restore",
                    headers=_machine(app, user_id), json={})
    assert r.status_code == 403

    with app.app_context():
        assert db.session.get(Variable, var['id']).name == '바뀐 이름'


def test_others_cannot_restore(app, client):
    _user(app, 'owner@example.com')
    _user(app, 'other@example.com')
    headers = _login(client, 'owner@example.com')
    card_id = _card(client, headers)
    var = _add(client, headers, card_id, formula='')
    _age_last_revision(app, card_id)
    _put(client, headers, card_id, var['id'], name='바뀐 이름')

    history = _history(client, headers, card_id)
    r = client.post(f"/api/cards/{card_id}/revisions/{history[-1]['id']}/restore",
                    headers=_login(client, 'other@example.com'), json={})
    assert r.status_code == 403


def test_restoring_to_an_empty_definition_is_refused(app, client):
    """되돌리면 카드가 비는 시점이 있다. 사람이 원한 것일 리 없다."""
    _user(app)
    headers = _login(client)
    card_id = _card(client, headers)
    var = _add(client, headers, card_id)
    _age_last_revision(app, card_id)
    client.delete(f"/api/cards/{card_id}/variables/{var['id']}", headers=headers)

    history = _history(client, headers, card_id)
    empty = history[0]['id']    # 삭제 후 = 변수 없음
    r = client.post(f'/api/cards/{card_id}/revisions/{empty}/restore',
                    headers=headers, json={})
    assert r.status_code == 400
    assert '비게 됩니다' in r.get_json()['error']


# --- 견고함 --------------------------------------------------------------------


def test_history_is_scoped_to_the_card(app, client):
    _user(app)
    headers = _login(client)
    first = _card(client, headers, '카드 하나')
    second = _card(client, headers, '카드 둘')
    _add(client, headers, first, name='A', symbol='A')

    assert len(_history(client, headers, second)) == 0


def test_deleting_a_card_takes_its_history(app, client):
    """**완전 삭제**에서만 사라진다. 휴지통에 있는 동안은 이력도 함께 기다린다 —
    되살렸을 때 이력이 비어 있으면 되살린 것이 아니다."""
    _user(app)
    headers = _login(client)
    card_id = _card(client, headers)
    _add(client, headers, card_id)

    client.delete(f'/api/cards/{card_id}', headers=headers)
    with app.app_context():
        assert CardRevision.query.filter_by(card_id=card_id).count() > 0

    client.delete(f'/api/cards/{card_id}/permanent', headers=headers)
    with app.app_context():
        assert CardRevision.query.filter_by(card_id=card_id).count() == 0


def test_broken_summary_does_not_break_the_list(app, client):
    _user(app)
    headers = _login(client)
    card_id = _card(client, headers)
    _add(client, headers, card_id)

    with app.app_context():
        row = CardRevision.query.filter_by(card_id=card_id).first()
        row.summary = '{깨진 JSON'
        db.session.commit()

    body = _history(client, headers, card_id)
    assert body[0]['changes'] == []


def test_diff_matches_by_id_not_by_name(app, client):
    """이름을 바꾼 것과 지우고 새로 만든 것은 다른 일이다."""
    before = [{'id': 1, 'name': '하중', 'symbol': 'F', 'category': 'input',
               'var_type': 'text'}]
    after = [{'id': 1, 'name': '외력', 'symbol': 'F', 'category': 'input',
              'var_type': 'text'}]
    changes = revisions.diff(before, after)
    assert [c['kind'] for c in changes] == ['changed']
