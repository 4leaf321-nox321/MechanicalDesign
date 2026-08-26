"""기록 비교 — 「왜 이번엔 답이 다르지」 에 답한다.

여기서 지키는 것 중 하나가 나머지보다 훨씬 중요하다:

    **입력이 같은데 답이 다르면, 그 사실을 먼저 말한다.**

카드는 살아 있는 참조라 어제와 오늘 사이에 누가 수식을 고쳤을 수 있다. 그때
사람은 자기 입력을 몇 번이고 다시 들여다보게 되는데, 입력에는 아무 문제가 없다.
이 화면이 그 헛수고를 없애야 한다.
"""

import json

import pytest

from app.extensions import db
from app.modules.cards.models import Variable
from tests.test_workflows import (          # noqa: F401  (픽스처를 가져온다)
    _card, _link, _login, _node, _user, chain, client,
)


def _record(client, head, card_id, title, inputs, results):
    r = client.post('/api/records', headers=head, json={
        'card_id': card_id, 'title': title,
        'inputs': inputs, 'results': results,
    })
    assert r.status_code == 201, r.get_json()
    return r.get_json()


@pytest.fixture
def two(app, client, chain):
    """같은 카드로 남긴 기록 둘. 입력 하나가 다르다."""
    head = chain['head']
    card, v = chain['stress_id'], chain['stress_vars']
    a = _record(client, head, card, '1차', {str(v['Fin']): 100, str(v['A']): 25},
                {str(v['sig']): {'value': 4.0, 'error': None}})
    b = _record(client, head, card, '2차', {str(v['Fin']): 100, str(v['A']): 20},
                {str(v['sig']): {'value': 5.0, 'error': None}})
    return head, a, b, v


def _compare(client, head, a, b):
    r = client.get(f"/api/records/compare?a={a['id']}&b={b['id']}", headers=head)
    assert r.status_code == 200, r.get_json()
    return r.get_json()


def test_it_says_which_input_moved_and_by_how_much(app, client, two):
    head, a, b, v = two
    body = _compare(client, head, a, b)

    changed = [r for r in body['inputs'] if r['changed']]
    assert len(changed) == 1
    row = changed[0]
    assert row['key'] == str(v['A'])
    # 이름표가 없으면 「12번 칸이 달라졌다」 밖에 못 말한다.
    assert '단면적' in row['label']
    assert (row['a'], row['b']) == (25, 20)
    assert row['delta'] == -5
    assert row['ratio'] == pytest.approx(-0.2)


def test_unchanged_rows_are_still_listed(app, client, two):
    """달라진 것만 주면 「나머지는 정말 같았나」 를 확인할 방법이 없다."""
    head, a, b, v = two
    body = _compare(client, head, a, b)
    keys = {r['key'] for r in body['inputs']}
    assert str(v['Fin']) in keys
    assert next(r for r in body['inputs'] if r['key'] == str(v['Fin']))['changed'] is False


def test_results_carry_the_movement_too(app, client, two):
    head, a, b, v = two
    body = _compare(client, head, a, b)
    row = next(r for r in body['results'] if r['key'] == str(v['sig']))
    assert row['changed'] is True
    assert row['delta'] == pytest.approx(1.0)


def test_the_same_numbers_are_not_called_a_difference(app, client, chain):
    """부동소수 찌꺼기를 차이로 부르면 화면이 늑대소년이 된다."""
    head = chain['head']
    card, v = chain['stress_id'], chain['stress_vars']
    a = _record(client, head, card, '가', {str(v['A']): 0.1},
                {str(v['sig']): {'value': 0.30000000000000004, 'error': None}})
    b = _record(client, head, card, '나', {str(v['A']): 0.1},
                {str(v['sig']): {'value': 0.3, 'error': None}})

    body = _compare(client, head, a, b)
    assert body['summary']['results_changed'] == 0


def test_the_same_input_with_a_different_answer_is_flagged(app, client, chain):
    """**이 기능이 존재하는 이유.**

    입력이 같은데 답이 다르면 계산 자체가 그새 바뀐 것이다. 사람이 자기 입력을
    몇 번이고 다시 보게 두면 안 된다.
    """
    head = chain['head']
    card, v = chain['stress_id'], chain['stress_vars']
    a = _record(client, head, card, '어제', {str(v['Fin']): 100, str(v['A']): 25},
                {str(v['sig']): {'value': 4.0, 'error': None}})

    # 그 사이에 누가 수식을 고쳤다.
    with app.app_context():
        row = Variable.query.filter_by(card_id=card, symbol='sig').first()
        row.formula = 'Fin / A * 2'
        db.session.commit()

    b = _record(client, head, card, '오늘', {str(v['Fin']): 100, str(v['A']): 25},
                {str(v['sig']): {'value': 8.0, 'error': None}})

    body = _compare(client, head, a, b)
    assert body['summary']['inputs_changed'] == 0
    assert body['summary']['results_changed'] == 1
    assert body['summary']['unexplained'] is True

    # 그리고 무엇이 바뀌었는지까지 말해야 한다.
    text = ' '.join(c['text'] for c in body['definition'])
    assert '수식' in text
    assert 'Fin / A * 2' in text


def test_a_broken_cell_is_a_difference_even_with_no_number(app, client, chain):
    """오류였던 칸이 이번엔 나왔다면, 그것이 가장 알고 싶은 차이다."""
    head = chain['head']
    card, v = chain['stress_id'], chain['stress_vars']
    a = _record(client, head, card, '실패', {str(v['A']): 0},
                {str(v['sig']): {'value': None, 'error': '0 으로 나눌 수 없습니다'}})
    b = _record(client, head, card, '성공', {str(v['A']): 5},
                {str(v['sig']): {'value': 20.0, 'error': None}})

    body = _compare(client, head, a, b)
    row = next(r for r in body['results'] if r['key'] == str(v['sig']))
    assert row['changed'] is True
    assert row['a_error'] and not row['b_error']


def test_zero_does_not_produce_an_infinite_ratio(app, client, chain):
    """무한대를 적어 두면 화면이 그것을 숫자로 읽고 정렬하면 맨 위에 온다."""
    head = chain['head']
    card, v = chain['stress_id'], chain['stress_vars']
    a = _record(client, head, card, '가', {str(v['A']): 0},
                {str(v['sig']): {'value': 0, 'error': None}})
    b = _record(client, head, card, '나', {str(v['A']): 5},
                {str(v['sig']): {'value': 20.0, 'error': None}})

    row = next(r for r in _compare(client, head, a, b)['results']
               if r['key'] == str(v['sig']))
    assert row['delta'] == 20
    assert 'ratio' not in row


def test_records_of_different_cards_can_still_be_compared(app, client, chain):
    """막으면 「비슷한 두 검토가 왜 다른가」 를 못 묻게 된다. 대신 알린다."""
    head = chain['head']
    a = _record(client, head, chain['stress_id'], '응력',
                {str(chain['stress_vars']['A']): 25}, {})
    b = _record(client, head, chain['load_id'], '하중',
                {str(chain['load_vars']['m']): 50}, {})

    body = _compare(client, head, a, b)
    assert body['same_source'] is False
    assert body['comparable'] is True


def test_a_card_record_and_a_workflow_record_are_not_forced_side_by_side(
        app, client, chain):
    """값이 놓인 모양부터 다르다. 억지로 세우면 전부 「달라짐」 이 된다."""
    head, wf = chain['head'], chain['wf']
    n1 = _node(client, head, wf['id'], chain['load_id'])
    r = client.post('/api/records', headers=head, json={
        'workflow_id': wf['id'], 'title': '워크플로',
        'inputs': {str(n1['id']): {str(chain['load_vars']['m']): 50}},
        'results': {str(n1['id']): {str(chain['load_vars']['F']): {'value': 490.5}}},
    })
    assert r.status_code == 201
    b = r.get_json()
    a = _record(client, head, chain['load_id'], '카드',
                {str(chain['load_vars']['m']): 50}, {})

    body = _compare(client, head, a, b)
    assert body['comparable'] is False
    assert body['inputs'] == []


def test_workflow_records_compare_box_by_box(app, client, chain):
    head, wf = chain['head'], chain['wf']
    n1 = _node(client, head, wf['id'], chain['load_id'], alias='하중계산')
    m, F = chain['load_vars']['m'], chain['load_vars']['F']

    def save(title, weight, force):
        r = client.post('/api/records', headers=head, json={
            'workflow_id': wf['id'], 'title': title,
            'inputs': {str(n1['id']): {str(m): weight}},
            'results': {str(n1['id']): {str(F): {'value': force, 'error': None}}},
        })
        assert r.status_code == 201, r.get_json()
        return r.get_json()

    a, b = save('가', 50, 490.5), save('나', 60, 588.6)
    body = _compare(client, head, a, b)

    row = next(r for r in body['inputs'] if r['changed'])
    # 어느 **자리**의 어느 칸인지 함께 말해야 한다 — 같은 카드가 두 자리에
    # 놓이면 변수 이름만으로는 구분이 안 된다.
    assert row['node'] == '하중계산'
    assert '무게' in row['label']
    assert (row['a'], row['b']) == (50, 60)


def test_you_cannot_compare_a_record_you_cannot_see(app, client, chain):
    """초안 카드로 계산한 기록이 남에게 보이면 초안을 감춘 의미가 없다.

    **비교도 같은 문을 지나야 한다.** 기록 하나는 못 열면서 둘을 견주는 것은
    되면, 감춘 정의가 옆문으로 새어 나간다.
    """
    from app.modules.cards.models import Card

    head = chain['head']
    card, v = chain['stress_id'], chain['stress_vars']
    a = _record(client, head, card, '가', {str(v['A']): 25}, {})
    b = _record(client, head, card, '나', {str(v['A']): 30}, {})

    with app.app_context():
        db.session.get(Card, card).status = 'draft'
        db.session.commit()

    _user(app, 'park@x.com')
    other = _login(client, 'park@x.com')
    # 하나를 여는 것도, 둘을 견주는 것도 똑같이 막혀야 한다.
    assert client.get(f"/api/records/{a['id']}", headers=other).status_code == 404
    r = client.get(f"/api/records/compare?a={a['id']}&b={b['id']}", headers=other)
    assert r.status_code == 404


def test_comparing_a_record_with_itself_is_refused(app, client, two):
    head, a, _b, _v = two
    r = client.get(f"/api/records/compare?a={a['id']}&b={a['id']}", headers=head)
    assert r.status_code == 400


def test_compare_does_not_shadow_a_record_id(app, client, two):
    """`/compare` 가 기록 id 로 읽히면 이 기능 전체가 404 가 된다."""
    head, a, _b, _v = two
    r = client.get(f"/api/records/{a['id']}", headers=head)
    assert r.status_code == 200
    r = client.get('/api/records/compare', headers=head)
    assert r.status_code == 400          # 404 가 아니라, 고를 것을 안 줬다는 뜻
