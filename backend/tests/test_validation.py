"""카드 검증 — 밖에서 만든 정의가 실제로 계산되는가.

화면에서 사람이 만들 때는 만든 사람이 계산 버튼을 눌러 확인한다. API 로 만들면
그 확인이 없어서, **그럴듯하게 틀린 정의가 조용히 저장된다.** AI 가 만들 때 특히
그렇다 — 없는 기호를 참조하거나, 오타가 있거나, 단계를 거슬러 참조한다.

시험 계산은 node 가 있어야 돈다. 없는 환경에서는 `trial_skipped` 에 사유가 담기고
`ok` 는 false 다 — **검증이 안 돌았는데 통과로 보이면 안 된다.**
"""

import json
import os

import pytest

from app.extensions import db
from app.modules.cards import validation
from app.modules.cards.models import Variable


def _var(card_id, symbol, category='input', var_type='text', **kw):
    row = Variable(card_id=card_id, name=kw.pop('name', symbol), symbol=symbol,
                   category=category, var_type=var_type, **kw)
    db.session.add(row)
    db.session.commit()
    return row


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def auth(app, client):
    from app.modules.accounts.models import User
    from app.modules.auth import security

    with app.app_context():
        if User.query.filter_by(email='admin').first() is None:
            db.session.add(User(email='admin', display_name='관리자', status='active',
                                is_admin=True, password_hash=security.hash_password('32167')))
            db.session.commit()
    body = client.post('/api/auth/login',
                       json={'email': 'admin', 'password': '32167'}).get_json()
    return {'Authorization': f"Bearer {body['access_token']}"}


def _messages(issues):
    return ' / '.join(i['message'] for i in issues)


# --- 정적 검사 (node 없이도 돈다) ------------------------------------------------


def test_unknown_symbol_is_reported(app, card):
    with app.app_context():
        _var(card, 'F')
        _var(card, 'sig', 'output', 'formula', formula='F / Area')
        issues = validation.check_static(Variable.query.filter_by(card_id=card).all())
        assert 'Area' in _messages(issues)


def test_builtin_functions_are_not_reported(app, card):
    """sqrt·sum 같은 내장 함수를 없는 기호로 신고하면 안 된다."""
    with app.app_context():
        _var(card, 'A')
        _var(card, 'R', 'output', 'formula', formula='sqrt(A) + sum(A) + max(A, 1)')
        assert validation.check_static(Variable.query.filter_by(card_id=card).all()) == []


def test_duplicate_symbol(app, card):
    with app.app_context():
        _var(card, 'A', name='첫째')
        _var(card, 'A', name='둘째')
        assert '겹칩니다' in _messages(
            validation.check_static(Variable.query.filter_by(card_id=card).all()))


def test_symbol_shadowing_a_builtin(app, card):
    with app.app_context():
        _var(card, 'sqrt')
        assert '내장 함수' in _messages(
            validation.check_static(Variable.query.filter_by(card_id=card).all()))


def test_missing_symbol(app, card):
    with app.app_context():
        _var(card, '')
        assert '기호가 없습니다' in _messages(
            validation.check_static(Variable.query.filter_by(card_id=card).all()))


def test_circular_reference(app, card):
    """서로를 참조하면 영영 풀리지 않는다. 계산은 멈추지만 화면에는 '값 없음' 으로만 보인다."""
    with app.app_context():
        _var(card, 'X', 'intermediate', 'formula', formula='Y + 1')
        _var(card, 'Y', 'intermediate', 'formula', formula='X + 1')
        assert '순환 참조' in _messages(
            validation.check_static(Variable.query.filter_by(card_id=card).all()))


def test_intermediate_cannot_use_an_output(app, card):
    """단계를 거슬러 참조하면 '알 수 없는 이름' 이 나오는데, 기호는 분명히 있다.

    그 사유만 보면 오타를 찾다가 시간을 버린다. 진짜 이유를 짚어 준다.
    """
    with app.app_context():
        _var(card, 'A')
        _var(card, 'R', 'output', 'formula', formula='A * 2')
        _var(card, 'M', 'intermediate', 'formula', formula='R + 1')
        issues = validation.check_static(Variable.query.filter_by(card_id=card).all())
        assert '결과값이라 중간값에서 쓸 수 없습니다' in _messages(issues)


def test_empty_definition(app, card):
    with app.app_context():
        _var(card, 'R', 'output', 'formula', formula='')
        assert '수식이 비어 있습니다' in _messages(
            validation.check_static(Variable.query.filter_by(card_id=card).all()))


def test_strings_are_not_scanned_for_identifiers(app, card):
    """따옴표 안의 글자는 값이지 기호가 아니다."""
    with app.app_context():
        _var(card, 'A')
        _var(card, 'R', 'output', 'formula', formula='"Area 는 없다" + A')
        assert validation.check_static(Variable.query.filter_by(card_id=card).all()) == []


def test_table_lookup_expressions_are_scanned(app, card):
    """수식 칸만 보면 안 된다 — 표 조회 키에도 기호가 들어간다."""
    with app.app_context():
        _var(card, 'A')
        _var(card, 'T', 'output', 'table', table_data=json.dumps({
            'columns': ['a', 'b'], 'rows': [['1', '2']], 'result_column_index': 1,
            'keys': [{'column_index': 0, 'expression': 'Nope + 1', 'match_mode': 'exact'}],
        }))
        assert 'Nope' in _messages(
            validation.check_static(Variable.query.filter_by(card_id=card).all()))


# --- 시험 계산 (node 필요) ------------------------------------------------------

needs_node = pytest.mark.skipif(
    not validation.node_available(), reason='node 가 없어 시험 계산을 건너뜁니다')


def test_node_is_available_in_ci():
    """CI 에서는 시험 계산이 **반드시** 돌아야 한다.

    아래 세 테스트는 node 가 없으면 조용히 건너뛰어진다. 로컬에서는 그게 맞지만,
    CI 에서까지 그러면 초록불인데 정작 검증은 검사되지 않은 상태가 된다.
    """
    if not os.environ.get('CI'):
        pytest.skip('로컬에서는 node 가 없어도 된다')
    assert validation.node_available(), 'CI 러너에 node 가 없습니다. 워크플로에 setup-node 를 넣으세요.'


@needs_node
def test_trial_runs_the_real_calculator(app, card):
    """계산기는 프론트가 쓰는 바로 그 파일이다 — 옮겨 적은 사본이 아니다."""
    with app.app_context():
        f = _var(card, 'F')
        a = _var(card, 'A')
        _var(card, 'Z', 'intermediate', 'formula', formula='A / 6')
        _var(card, 'sig', 'output', 'formula', formula='F / Z')

        out = validation.validate_card(
            Variable.query.filter_by(card_id=card).all(), {f.id: 1000, a.id: 300})

        assert out['ok'] is True, out['issues']
        assert out['trial_skipped'] is None
        by_symbol = {r['symbol']: r['value'] for r in out['results']}
        assert by_symbol['Z'] == 50
        assert by_symbol['sig'] == 20


@needs_node
def test_trial_reports_calculation_failure(app, card):
    with app.app_context():
        f = _var(card, 'F')
        _var(card, 'z', 'output', 'formula', formula='F / 0')
        out = validation.validate_card(
            Variable.query.filter_by(card_id=card).all(), {f.id: 5})
        assert out['ok'] is False
        assert '계산 실패' in _messages(out['issues'])


@needs_node
def test_trial_handles_arrays_and_strings(app, card):
    """배열·문자열도 프론트와 같은 규칙으로 계산된다."""
    with app.app_context():
        li = _var(card, 'L', 'input', 'array')
        _var(card, 'S', 'output', 'formula', formula='sum(L)')
        _var(card, 'E', 'output', 'formula', formula='mul(L, 2)')
        _var(card, 'T', 'output', 'formula', formula='"합 " + sum(L)')

        out = validation.validate_card(
            Variable.query.filter_by(card_id=card).all(), {li.id: [1, 2, 3]})

        by_symbol = {r['symbol']: r['value'] for r in out['results']}
        assert by_symbol['S'] == 6
        assert by_symbol['E'] == [2, 4, 6]
        assert by_symbol['T'] == '합 6'


@needs_node
def test_bridge_tolerates_a_bom_on_stdin():
    """BOM 이 붙어 와도 읽는다.

    파이썬 호출은 BOM 을 안 붙이지만, 배포 패키징 스크립트가 PowerShell 5.1 의
    파이프로 같은 다리를 부른다 — 5.1 은 네이티브 명령에 넘길 때 BOM 을 붙인다.
    그러면 JSON.parse 가 그 한 글자에 통째로 실패하는데, **파이썬에서는 절대
    재현되지 않아** 패키징이 깨질 때까지 알 수 없다.
    """
    import subprocess

    payload = json.dumps({
        'variables': [
            {'id': 1, 'symbol': 'A', 'name': 'A', 'category': 'input', 'var_type': 'text'},
            {'id': 2, 'symbol': 'R', 'name': 'R', 'category': 'output',
             'var_type': 'formula', 'formula': 'A * 2'},
        ],
        'values': {'1': 4},
    })
    proc = subprocess.run(['node', validation.EVALUATOR_SCRIPT],
                          input=b'\xef\xbb\xbf' + payload.encode('utf-8'),
                          capture_output=True, timeout=20)
    body = json.loads(proc.stdout.decode('utf-8'))
    assert body['ok'] is True, body.get('error')
    assert body['results']['2']['value'] == 8


# --- API ----------------------------------------------------------------------


def test_endpoint_returns_issues_and_results(app, client, auth, card):
    with app.app_context():
        # id 를 안에서 꺼내 둔다. 컨텍스트를 나가면 인스턴스가 세션에서 떨어져
        # 속성을 다시 읽을 수 없다.
        input_id = _var(card, 'F').id
        _var(card, 'R', 'output', 'formula', formula='F * 2')

    r = client.post(f'/api/cards/{card}/validate', headers=auth,
                    json={'values': {str(input_id): 4}})
    assert r.status_code == 200
    body = r.get_json()
    assert 'issues' in body and 'results' in body and 'trial_skipped' in body


def test_endpoint_rejects_non_numeric_value_keys(app, client, auth, card):
    with app.app_context():
        _var(card, 'F')
    r = client.post(f'/api/cards/{card}/validate', headers=auth,
                    json={'values': {'F': 4}})
    assert r.status_code == 400
    assert '변수 id' in r.get_json()['error']


def test_endpoint_needs_login(app, client, card):
    assert client.post(f'/api/cards/{card}/validate', json={}).status_code == 401


def test_empty_card_is_not_ok(app, client, auth, card):
    body = client.post(f'/api/cards/{card}/validate', headers=auth, json={}).get_json()
    assert body['ok'] is False
    assert '변수가 없습니다' in _messages(body['issues'])
