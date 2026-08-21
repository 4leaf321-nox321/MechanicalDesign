"""표 참조 — 미리 만들어 둔 표를 여러 변수가 함께 쓴다.

가장 중요한 검사는 **열 순서가 바뀌어도 따라가는가** 다. 참조 이전에는 표가 변수
안에 통째로 들어 있어서 열을 번호로 가리켜도 됐다. 참조가 생기면 원본에서 열
하나를 지우거나 옮기는 순간 뒤 열의 번호가 밀리고, 그 표를 쓰는 모든 변수가
**조용히 엉뚱한 열을 읽게 된다.** 그래서 이름으로 가리키고, 내보낼 때만 번호로
바꾼다.
"""

import json

import pytest

from app.extensions import db
from app.modules.cards import tables
from app.modules.cards.models import Variable, VariableTemplate


def _template(name='재료표', columns=None, rows=None):
    columns = columns or ['재료명', '항복강도', '인장강도']
    rows = rows or [
        ['SS400', '245', '400'],
        ['SM45C', '343', '569'],
    ]
    tpl = VariableTemplate(name=name, var_type='table',
                           data=json.dumps({'columns': columns, 'rows': rows}))
    db.session.add(tpl)
    db.session.commit()
    return tpl


def _reference(tpl_id, result_column='항복강도', key_column='재료명', expression='mat'):
    return json.dumps({
        'source_template_id': tpl_id,
        'result_column': result_column,
        'keys': [{'column': key_column, 'expression': expression, 'match_mode': 'exact'}],
    })


def _resolve(raw):
    return json.loads(tables.resolve(raw, lambda i: db.session.get(VariableTemplate, i)))


# --- 저장 모양 ----------------------------------------------------------------


def test_to_storage_drops_the_copied_data(app):
    """참조는 데이터를 들고 있지 않는다.

    떼지 않고 저장하면 원본을 고쳐도 변수 안의 낡은 사본이 계속 쓰인다 —
    참조를 건 의미가 사라지고, 화면상 원인도 보이지 않는다.
    """
    with app.app_context():
        sent = json.dumps({
            'source_template_id': 7,
            'columns': ['재료명', '항복강도'],
            'rows': [['SS400', '245']],
            'result_column_index': 1,
            'keys': [{'column_index': 0, 'expression': 'mat', 'match_mode': 'exact'}],
        })
        stored = json.loads(tables.to_storage(sent))

        assert 'columns' not in stored
        assert 'rows' not in stored
        assert stored['source_template_id'] == 7
        # 번호로 보냈어도 이름으로 바꿔 저장한다.
        assert stored['result_column'] == '항복강도'
        assert stored['keys'] == [{'column': '재료명', 'expression': 'mat', 'match_mode': 'exact'}]


def test_to_storage_leaves_embedded_tables_alone(app):
    with app.app_context():
        embedded = json.dumps({'columns': ['a'], 'rows': [['1']], 'result_column_index': 0})
        assert json.loads(tables.to_storage(embedded)) == json.loads(embedded)


@pytest.mark.parametrize('raw', ['', None, '{깨진 JSON'])
def test_to_storage_passes_through_unparseable(app, raw):
    with app.app_context():
        assert tables.to_storage(raw) == raw


# --- 해석 --------------------------------------------------------------------


def test_resolve_fills_data_from_the_source(app):
    with app.app_context():
        tpl = _template()
        out = _resolve(_reference(tpl.id))

        assert out['columns'] == ['재료명', '항복강도', '인장강도']
        assert out['rows'][0] == ['SS400', '245', '400']
        assert out['source_name'] == '재료표'
        assert out['result_column_index'] == 1
        assert out['keys'][0]['column_index'] == 0
        assert 'source_error' not in out


def test_resolve_follows_the_column_by_name_when_order_changes(app):
    """원본에서 열을 앞에 끼워 넣어도 같은 열을 읽는다.

    번호로 가리켰다면 여기서 '항복강도'(1) 가 '재료명'(1로 밀린 것) 을 가리키게
    되어 값이 조용히 바뀐다.
    """
    with app.app_context():
        tpl = _template()
        stored = _reference(tpl.id)

        before = _resolve(stored)
        assert before['result_column_index'] == 1

        # 맨 앞에 열을 하나 추가 — 뒤 열이 전부 한 칸씩 밀린다.
        tpl.data = json.dumps({
            'columns': ['규격', '재료명', '항복강도', '인장강도'],
            'rows': [['KS', 'SS400', '245', '400']],
        })
        db.session.commit()

        after = _resolve(stored)
        assert after['result_column_index'] == 2, '항복강도를 계속 가리켜야 한다'
        assert after['keys'][0]['column_index'] == 1, '재료명을 계속 가리켜야 한다'
        assert 'source_error' not in after


def test_resolve_reports_a_missing_column(app):
    """열이 사라지면 계산을 멈춘다. 조용히 다른 열을 읽는 것보다 낫다."""
    with app.app_context():
        tpl = _template()
        stored = _reference(tpl.id, result_column='항복강도')

        tpl.data = json.dumps({'columns': ['재료명', '인장강도'], 'rows': [['SS400', '400']]})
        db.session.commit()

        out = _resolve(stored)
        assert out['result_column_index'] is None
        assert '항복강도' in out['source_error']


def test_resolve_reports_a_deleted_source(app):
    with app.app_context():
        out = _resolve(_reference(999999))
        assert out['columns'] == []
        assert out['result_column_index'] is None
        assert '찾을 수 없습니다' in out['source_error']


def test_resolve_leaves_embedded_tables_alone(app):
    with app.app_context():
        embedded = json.dumps({'columns': ['a'], 'rows': [['1']], 'result_column_index': 0})
        assert tables.resolve(embedded, lambda i: None) == embedded


# --- API ----------------------------------------------------------------------


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


def test_variable_round_trip_keeps_the_reference(app, client, auth, card):
    with app.app_context():
        tpl_id = _template().id

    created = client.post(f'/api/cards/{card}/variables', headers=auth, json={
        'name': '항복강도', 'symbol': 'Sy', 'category': 'output', 'var_type': 'table',
        'table_data': _reference(tpl_id),
    }).get_json()

    # 응답은 해석된 모양 — 편집기와 평가기가 아는 그대로.
    served = json.loads(created['table_data'])
    assert served['columns'] == ['재료명', '항복강도', '인장강도']
    assert served['result_column_index'] == 1

    # 저장은 참조 모양 — 사본이 없다.
    with app.app_context():
        stored = json.loads(db.session.get(Variable, created['id']).table_data)
        assert 'rows' not in stored
        assert stored['result_column'] == '항복강도'


def test_editing_the_source_reaches_every_referencing_variable(app, client, auth, card):
    with app.app_context():
        tpl_id = _template().id

    ids = [
        client.post(f'/api/cards/{card}/variables', headers=auth, json={
            'name': f'변수{i}', 'symbol': f'S{i}', 'category': 'output', 'var_type': 'table',
            'table_data': _reference(tpl_id),
        }).get_json()['id']
        for i in range(3)
    ]

    # 원본의 값 하나를 고친다.
    client.put(f'/api/templates/{tpl_id}', headers=auth, json={'data': json.dumps({
        'columns': ['재료명', '항복강도', '인장강도'],
        'rows': [['SS400', '999', '400']],
    })})

    served = {v['id']: v for v in client.get(f'/api/cards/{card}/variables',
                                             headers=auth).get_json()}
    for var_id in ids:
        rows = json.loads(served[var_id]['table_data'])['rows']
        assert rows[0][1] == '999', '원본 수정이 참조 변수에 반영되어야 한다'


def test_referenced_template_cannot_be_deleted(app, client, auth, card):
    with app.app_context():
        tpl_id = _template().id

    client.post(f'/api/cards/{card}/variables', headers=auth, json={
        'name': '쓰는변수', 'symbol': 'U1', 'category': 'output', 'var_type': 'table',
        'table_data': _reference(tpl_id),
    })

    r = client.delete(f'/api/templates/{tpl_id}', headers=auth)
    assert r.status_code == 409
    body = r.get_json()
    assert body['code'] == 'MD-TEMPLATES-0001'
    assert body['users'][0]['variable_name'] == '쓰는변수'

    with app.app_context():
        assert db.session.get(VariableTemplate, tpl_id) is not None


def test_unreferenced_template_deletes_normally(app, client, auth):
    with app.app_context():
        tpl_id = _template(name='아무도 안 씀').id
    assert client.delete(f'/api/templates/{tpl_id}', headers=auth).status_code == 200


def test_usage_lists_the_variables(app, client, auth, card):
    with app.app_context():
        tpl_id = _template().id
    client.post(f'/api/cards/{card}/variables', headers=auth, json={
        'name': '쓰는변수', 'symbol': 'U1', 'category': 'output', 'var_type': 'table',
        'table_data': _reference(tpl_id),
    })
    body = client.get(f'/api/templates/{tpl_id}/usage', headers=auth).get_json()
    assert len(body['users']) == 1
    assert body['users'][0]['card_name'] == '테스트 카드'


# --- 조회 방식 (행 / 열 / 행열) ------------------------------------------------


def _matrix_template():
    """행렬표 — 행 머리글은 재료, 열 머리글은 두께."""
    tpl = VariableTemplate(name='행렬표', var_type='table', data=json.dumps({
        'columns': ['재료', '10', '20', '30'],
        'rows': [
            ['SS400', '245', '240', '235'],
            ['SM45C', '343', '338', '330'],
        ],
    }))
    db.session.add(tpl)
    db.session.commit()
    return tpl


def test_cell_mode_reference_round_trip(app):
    """교차 조회 참조는 결과 열을 갖지 않는다 — 두 축이 만나는 칸이 결과다."""
    with app.app_context():
        tpl = _matrix_template()
        sent = json.dumps({
            'source_template_id': tpl.id,
            'lookup_mode': 'cell',
            'columns': ['재료', '10', '20', '30'],
            'rows': [['SS400', '245', '240', '235']],
            'row_header_index': 0,
            'row_lookup': {'expression': 'mat', 'match_mode': 'exact'},
            'column_lookup': {'expression': 't', 'match_mode': 'interpolate'},
        })
        stored = json.loads(tables.to_storage(sent))
        assert 'rows' not in stored
        assert stored['row_header_column'] == '재료'
        assert stored['column_lookup']['match_mode'] == 'interpolate'
        assert 'result_column' not in stored

        out = _resolve(json.dumps(stored))
        assert out['row_header_index'] == 0
        assert out['columns'] == ['재료', '10', '20', '30']
        assert 'source_error' not in out


def test_cell_mode_follows_the_header_column_by_name(app):
    with app.app_context():
        tpl = _matrix_template()
        stored = json.dumps({
            'source_template_id': tpl.id, 'lookup_mode': 'cell',
            'row_header_column': '재료',
            'row_lookup': {'expression': 'mat', 'match_mode': 'exact'},
            'column_lookup': {'expression': 't', 'match_mode': 'nearest'},
        })
        assert _resolve(stored)['row_header_index'] == 0

        # 원본 맨 앞에 열을 끼워 넣는다 — 번호로 저장했다면 여기서 어긋난다.
        tpl.data = json.dumps({
            'columns': ['규격', '재료', '10', '20'],
            'rows': [['KS', 'SS400', '245', '240']],
        })
        db.session.commit()
        assert _resolve(stored)['row_header_index'] == 1


def test_cell_mode_reports_a_missing_header_column(app):
    with app.app_context():
        tpl = _matrix_template()
        stored = json.dumps({
            'source_template_id': tpl.id, 'lookup_mode': 'cell',
            'row_header_column': '재료',
            'row_lookup': {'expression': 'mat', 'match_mode': 'exact'},
            'column_lookup': {'expression': 't', 'match_mode': 'exact'},
        })
        tpl.data = json.dumps({'columns': ['품명', '10'], 'rows': [['SS400', '245']]})
        db.session.commit()
        assert '재료' in _resolve(stored)['source_error']


def test_column_mode_points_rows_by_label(app):
    """누운 표의 조회 행·결과 행은 **항목 이름**으로 가리킨다.

    행에는 이름이 없으므로 번호로 저장하면 원본에 행이 하나만 늘어도 어긋난다.
    """
    with app.app_context():
        tpl = VariableTemplate(name='누운표', var_type='table', data=json.dumps({
            'columns': ['항목', '값1', '값2'],
            'rows': [['재료', 'SS400', 'SM45C'], ['항복강도', '245', '343']],
        }))
        db.session.add(tpl)
        db.session.commit()

        sent = json.dumps({
            'source_template_id': tpl.id,
            'lookup_mode': 'column',
            'columns': ['항목', '값1', '값2'],
            'rows': [['재료', 'SS400', 'SM45C']],
            'label_column_index': 0,
            'result_row_label': '항복강도',
            'keys': [{'row_label': '재료', 'expression': 'mat', 'match_mode': 'exact'}],
        })
        stored = json.loads(tables.to_storage(sent))
        assert stored['label_column'] == '항목'
        assert stored['result_row_label'] == '항복강도'
        assert stored['keys'][0]['row_label'] == '재료'
        assert 'rows' not in stored

        # 원본 맨 위에 행을 하나 끼워 넣어도 이름으로 찾으므로 그대로다.
        tpl.data = json.dumps({
            'columns': ['항목', '값1', '값2'],
            'rows': [['비고', 'a', 'b'], ['재료', 'SS400', 'SM45C'], ['항복강도', '245', '343']],
        })
        db.session.commit()
        out = _resolve(json.dumps(stored))
        assert out['label_column_index'] == 0
        assert out['result_row_label'] == '항복강도'
        assert 'source_error' not in out


def test_row_mode_reference_is_unchanged(app):
    """조회 방식을 안 적으면 예전처럼 행 조회다."""
    with app.app_context():
        tpl = _template()
        out = _resolve(_reference(tpl.id))
        assert out['result_column_index'] == 1
        assert out['keys'][0]['column_index'] == 0
