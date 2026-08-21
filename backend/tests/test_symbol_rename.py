"""기호를 바꾸면 그 기호를 쓰던 수식이 전부 따라오는지.

**이 검사가 필요한 이유**: 기호 치환은 실패해도 그 자리에서는 아무 일도 일어나지
않는다. 옛 기호를 붙든 수식은 한참 뒤 계산할 때 "알 수 없는 식별자" 로 터지고,
그때는 기호를 바꾼 일과 연결짓기 어렵다. 실제로 테이블 조회 키가 이렇게 몇 달을
새고 있었다 — 조회 키가 여러 개가 되면서 정의 모양이 바뀌었는데 치환하는 쪽만
옛 필드를 보고 있었다.

`test_all_expression_slots_are_renamed` 는 **수식 자리를 스스로 세어 본다.**
`expressions._visit` 에 새 자리를 더하면 그 자리도 자동으로 검사 대상이 되므로,
다음에 정의 모양이 바뀔 때 여기가 먼저 실패한다.
"""

import json

import pytest

from app.extensions import db
from app.modules.cards import expressions
from app.modules.cards.models import Variable
from app.modules.cards.routes import _propagate_symbol_rename


def _make(card_id, **kwargs):
    kwargs.setdefault('category', 'output')
    row = Variable(card_id=card_id, **kwargs)
    db.session.add(row)
    db.session.commit()
    return row.id


# --- 수식 치환 자체 -----------------------------------------------------------


@pytest.mark.parametrize('expr, expected', [
    ('A * 2', 'B * 2'),
    ('A+A', 'B+B'),
    ('sqrt(A) + AB', 'sqrt(B) + AB'),          # 더 긴 식별자를 건드리지 않는다
    ('A_1 * A', 'A_1 * B'),                    # 접미사가 붙은 것도 다른 기호다
    ('"A" + A', '"B"'.replace('B', 'A') + ' + B'),  # 문자열 리터럴은 그대로
    ('구분 == "A" ? A : 0', '구분 == "A" ? B : 0'),
    ('', ''),
])
def test_rename_symbol_in_expr(expr, expected):
    assert expressions.rename_symbol_in_expr(expr, 'A', 'B') == expected


def test_rename_is_noop_when_symbol_unchanged():
    assert expressions.rename_symbol_in_expr('A * 2', 'A', 'A') == 'A * 2'
    assert expressions.rename_symbol_in_expr('A * 2', '', 'B') == 'A * 2'


# --- 타입별로 수식 자리가 전부 바뀌는가 -----------------------------------------


def _definitions():
    """(라벨, 변수 필드, 그 정의가 담고 있어야 할 수식 개수)."""
    return [
        (
            '수식',
            dict(name='수식', symbol='F1', var_type='formula', formula='A * 2 + sqrt(A)'),
            1,
        ),
        (
            '테이블(조회 키 여러 개)',
            dict(name='테이블', symbol='T1', var_type='table', table_data=json.dumps({
                'columns': ['a', 'b'], 'rows': [['1', '2']], 'result_column_index': 1,
                'keys': [
                    {'column_index': 0, 'expression': 'A + 1', 'match_mode': 'exact'},
                    {'column_index': 1, 'expression': 'A * 2', 'match_mode': 'nearest'},
                ],
            })),
            2,
        ),
        (
            '테이블(옛 단일 키)',
            dict(name='옛테이블', symbol='T2', var_type='table', table_data=json.dumps({
                'columns': ['a', 'b'], 'rows': [['1', '2']], 'result_column_index': 1,
                'key_column_index': 0, 'key_expression': 'A + 1', 'match_mode': 'exact',
            })),
            1,
        ),
        (
            '조건부',
            dict(name='조건', symbol='C1', var_type='conditional',
                 conditional_data=json.dumps({
                     'branches': [
                         {'condition': 'A > 10', 'formula': 'A * 3'},
                         {'condition': 'A > 5', 'formula': 'A * 2'},
                     ],
                     'default_formula': 'A - 1',
                 })),
            5,
        ),
        (
            '보간',
            dict(name='보간', symbol='I1', var_type='interp_table', interp_data=json.dumps({
                'columns': ['x', 'y'], 'rows': [['1', '10']],
                'x_column_index': 0, 'y_column_index': 1, 'x_expression': 'A / 2',
            })),
            1,
        ),
    ]


@pytest.mark.parametrize('label, fields, slot_count',
                         _definitions(), ids=[d[0] for d in _definitions()])
def test_all_expression_slots_are_renamed(app, card, label, fields, slot_count):
    with app.app_context():
        var_id = _make(card, **fields)
        row = db.session.get(Variable, var_id)

        # 이 정의가 들고 있는 수식 자리를 실제로 세어 본다. 정의 모양이 바뀌어
        # 자리가 늘거나 줄면 여기서 먼저 드러난다.
        assert len(expressions.iter_expressions(row)) == slot_count, label

        expressions.rename_symbol(row, 'A', 'LOAD')
        db.session.commit()

        row = db.session.get(Variable, var_id)
        after = expressions.iter_expressions(row)
        assert len(after) == slot_count, label
        for expr in after:
            assert 'LOAD' in expr, f'{label}: 새 기호가 안 들어감 -> {expr}'
            # 옛 기호가 홀로 남아 있으면 안 된다. 'LOAD' 안의 글자와 헷갈리지
            # 않도록 식별자 단위로 다시 훑는다.
            assert expressions.rename_symbol_in_expr(expr, 'A', '###') == expr, \
                f'{label}: 옛 기호가 남음 -> {expr}'


def test_broken_definition_is_left_alone(app, card):
    """깨진 JSON 은 건드리지 않는다. 고치려 들면 원본을 잃는다."""
    with app.app_context():
        var_id = _make(card, name='깨짐', symbol='X', var_type='table',
                       table_data='{이건 JSON 이 아니다')
        row = db.session.get(Variable, var_id)
        expressions.rename_symbol(row, 'A', 'LOAD')
        db.session.commit()
        assert db.session.get(Variable, var_id).table_data == '{이건 JSON 이 아니다'


# --- 라우터가 실제로 전파하는가 --------------------------------------------------


def test_propagate_updates_every_referencing_variable(app, card):
    with app.app_context():
        source = _make(card, name='입력', symbol='A', category='input', var_type='text')
        ids = {label: _make(card, **fields) for label, fields, _ in _definitions()}

        _propagate_symbol_rename(card, source, 'A', 'LOAD')
        db.session.commit()

        for label, var_id in ids.items():
            row = db.session.get(Variable, var_id)
            for expr in expressions.iter_expressions(row):
                assert 'LOAD' in expr, f'{label} 이(가) 따라오지 않음: {expr}'


def test_propagate_skips_the_edited_variable(app, card):
    """자기 자신은 건드리지 않는다 — 방금 사람이 정한 정의를 되돌리면 안 된다."""
    with app.app_context():
        var_id = _make(card, name='자기참조', symbol='A', var_type='formula',
                       formula='A * 2')
        _propagate_symbol_rename(card, var_id, 'A', 'LOAD')
        db.session.commit()
        assert db.session.get(Variable, var_id).formula == 'A * 2'


def test_propagate_does_not_touch_other_cards(app, card):
    from app.modules.cards.models import Card

    with app.app_context():
        other_card = Card(name='다른 카드', route='other-card')
        db.session.add(other_card)
        db.session.commit()

        mine = _make(card, name='내수식', symbol='F1', var_type='formula', formula='A + 1')
        theirs = _make(other_card.id, name='남수식', symbol='F1', var_type='formula',
                       formula='A + 1')

        _propagate_symbol_rename(card, None, 'A', 'LOAD')
        db.session.commit()

        assert db.session.get(Variable, mine).formula == 'LOAD + 1'
        assert db.session.get(Variable, theirs).formula == 'A + 1'


def test_input_variables_have_no_expression_slots(app, card):
    """입력 변수는 값만 갖는다 — 순회 대상이 아니다."""
    with app.app_context():
        for var_type in ('slider', 'text', 'dropdown'):
            var_id = _make(card, name=f'입력{var_type}', symbol=f'S_{var_type}',
                           category='input', var_type=var_type,
                           options_data=json.dumps(['A', 'B']) if var_type == 'dropdown' else '')
            row = db.session.get(Variable, var_id)
            assert expressions.iter_expressions(row) == []
