"""단위 — 조용히 1000배 틀리는 오류.

`sig = F / A` 에서 F 가 N, A 가 mm² 면 결과는 MPa 다. 그런데 단위 칸에 Pa 라고
적어 두면 **계산은 멀쩡히 돌고 답만 100만 배 틀린다.** 아무 오류도 나지 않으니
그대로 설계에 들어간다. 이 검사가 존재하는 이유가 그것 하나다.

**이 파일의 절반은 "말하지 않아야 하는 경우" 다.**

틀린 경고는 없는 경고보다 나쁘다. 한 번 헛짚으면 사람은 그다음부터 전부 무시하고,
그러면 진짜 경고도 함께 묻힌다. 그래서 모르는 단위·안 적은 단위·해석 못 한
함수·손으로 환산해 둔 상수는 전부 침묵으로 이어져야 한다.
"""

import pytest

from app.modules.cards import units, validation


class _Var:
    """검사에 필요한 것만 갖춘 가짜 변수."""

    def __init__(self, symbol, unit='', formula='', var_type='formula',
                 name=None, category='output'):
        self.id = abs(hash((symbol, formula, unit))) % 100000
        self.symbol = symbol
        self.unit = unit
        self.formula = formula
        self.var_type = var_type
        self.name = name or symbol
        self.category = category


def _messages(variables):
    return [i['message'] for i in validation.check_units(variables)]


# --- 단위 문자열 읽기 ------------------------------------------------------------


@pytest.mark.parametrize('text, expected_dims', [
    ('mm', {'L': 1}),
    ('mm2', {'L': 2}),
    ('mm^2', {'L': 2}),
    ('mm²', {'L': 2}),
    ('N', {'M': 1, 'L': 1, 'T': -2}),
    ('N/mm2', {'M': 1, 'L': -1, 'T': -2}),
    ('kg*m/s2', {'M': 1, 'L': 1, 'T': -2}),
    ('kg·m/s^2', {'M': 1, 'L': 1, 'T': -2}),
    ('1/s', {'T': -1}),
    ('%', {}),
    ('', {}),
    ('-', {}),
])
def test_reads_common_units(text, expected_dims):
    quantity = units.parse_unit(text)
    assert quantity is not None, text
    assert {k: int(v) for k, v in quantity.dims.items()} == expected_dims


def test_n_per_mm2_is_exactly_mpa():
    """**이 검사 전체가 이 한 줄에 기대고 있다.**

    N/mm² 와 MPa 이 같은 것으로 나와야, 제대로 만든 카드에 헛경고가 안 뜬다.
    """
    a = units.parse_unit('N/mm2')
    b = units.parse_unit('MPa')
    assert a.dims == b.dims
    assert units._close(a.factor, b.factor)


@pytest.mark.parametrize('text', ['Mpa', 'newton', '뉴턴', 'N/', '/mm', 'mm**', 'zz'])
def test_unreadable_units_return_none(text):
    """못 읽으면 None 이다. **짐작해서 뭔가 돌려주면 그 짐작이 헛경고가 된다.**"""
    assert units.parse_unit(text) is None


# --- 잡아야 하는 것 --------------------------------------------------------------


def test_scale_mismatch_is_reported():
    """N/mm² 를 Pa 라고 적었다. 차원은 맞아서 계산은 돌고, 값만 100만 배 틀린다."""
    variables = [
        _Var('F', 'N', category='input', var_type='text'),
        _Var('A', 'mm2', category='input', var_type='text'),
        _Var('sig', 'Pa', 'F / A'),
    ]
    messages = _messages(variables)
    assert any('1e+06 배' in m or '1000000 배' in m for m in messages), messages


def test_correct_card_says_nothing():
    """같은 카드에 MPa 라고 제대로 적으면 아무 말도 없어야 한다."""
    variables = [
        _Var('F', 'N', category='input', var_type='text'),
        _Var('A', 'mm2', category='input', var_type='text'),
        _Var('sig', 'MPa', 'F / A'),
    ]
    assert _messages(variables) == []


def test_dimension_mismatch_is_reported():
    """면적이어야 할 자리에 길이를 넣었다."""
    variables = [
        _Var('F', 'N', category='input', var_type='text'),
        _Var('L', 'mm', category='input', var_type='text'),
        _Var('sig', 'MPa', 'F / L'),
    ]
    assert any('냅니다' in m for m in _messages(variables))


def test_adding_different_dimensions_is_reported():
    """길이에 힘을 더했다. 계산은 숫자를 내지만 뜻이 없다."""
    variables = [
        _Var('F', 'N', category='input', var_type='text'),
        _Var('L', 'mm', category='input', var_type='text'),
        _Var('x', 'mm', 'L + F'),
    ]
    assert any('더하거나 뺐습니다' in m for m in _messages(variables))


def test_adding_mm_and_m_is_reported():
    """차원은 같고 배율만 다르다 — 1000배 틀린 답이 조용히 나온다."""
    variables = [
        _Var('a', 'mm', category='input', var_type='text'),
        _Var('b', 'm', category='input', var_type='text'),
        _Var('total', 'mm', 'a + b'),
    ]
    assert any('배율이 1000 배' in m for m in _messages(variables))


def test_unreadable_unit_is_pointed_out():
    """오타를 조용히 넘기면 그 변수가 낀 수식이 전부 검사에서 빠진다."""
    variables = [_Var('sig', 'Mpa', '1', category='input', var_type='text')]
    assert any('읽지 못했습니다' in m for m in _messages(variables))


def test_mixing_units_inside_min_is_reported():
    variables = [
        _Var('a', 'mm', category='input', var_type='text'),
        _Var('F', 'N', category='input', var_type='text'),
        _Var('x', 'mm', 'min(a, F)'),
    ]
    assert any('함께 넣었습니다' in m for m in _messages(variables))


# --- 말하지 않아야 하는 것 -------------------------------------------------------


def test_says_nothing_when_units_are_blank():
    """단위를 안 적은 카드가 대부분이다. 그것까지 떠들면 아무도 안 읽는다."""
    variables = [
        _Var('F', '', category='input', var_type='text'),
        _Var('A', '', category='input', var_type='text'),
        _Var('sig', '', 'F / A'),
    ]
    assert _messages(variables) == []


def test_says_nothing_when_only_the_result_has_a_unit():
    variables = [
        _Var('F', '', category='input', var_type='text'),
        _Var('A', '', category='input', var_type='text'),
        _Var('sig', 'MPa', 'F / A'),
    ]
    assert _messages(variables) == []


def test_hand_written_conversion_does_not_warn():
    """**가장 흔한 헛경고 후보.**

    `F / A / 1000` 처럼 사람이 손으로 환산해 둔 수식이 흔하다. 그 1000 을
    배율로 세면 멀쩡한 카드에 경고가 뜬다. 차원 검사는 그대로 살리고 배율
    검사만 끈다.
    """
    variables = [
        _Var('F', 'N', category='input', var_type='text'),
        _Var('A', 'mm2', category='input', var_type='text'),
        _Var('sig', 'Pa', 'F / A / 1000000'),
    ]
    assert _messages(variables) == []


def test_multiplying_by_a_constant_keeps_dimension_check():
    """상수가 껴도 차원이 어긋난 것은 여전히 잡아야 한다."""
    variables = [
        _Var('F', 'N', category='input', var_type='text'),
        _Var('L', 'mm', category='input', var_type='text'),
        _Var('sig', 'MPa', 'F / L * 1.5'),
    ]
    assert any('냅니다' in m for m in _messages(variables))


def test_says_nothing_about_unknown_functions():
    """range·at·prob 같은 함수의 단위는 알 길이 없다. 모르면 넘어간다."""
    variables = [
        _Var('L', 'mm', category='input', var_type='array'),
        _Var('x', 'MPa', 'at(L, 1)'),
        _Var('y', 'N', 'prob(L, 1, 2)'),
    ]
    assert _messages(variables) == []


def test_says_nothing_about_table_or_conditional_results():
    """표 조회에서 나온 값의 단위는 알 수 없다."""
    variables = [
        _Var('F', 'N', category='input', var_type='text'),
        _Var('T', 'MPa', '', var_type='table'),
        _Var('C', 'mm', '', var_type='conditional'),
    ]
    assert _messages(variables) == []


def test_string_concatenation_is_not_a_unit_error():
    """`"응력 " + sig` 는 글자를 잇는 것이지 더하기가 아니다."""
    variables = [
        _Var('sig', 'MPa', '1', category='input', var_type='text'),
        _Var('label', '', '"응력 " + sig'),
    ]
    assert _messages(variables) == []


def test_says_nothing_when_a_symbol_is_unknown():
    """없는 기호는 정적 검사가 따로 잡는다. 여기서 또 떠들 일이 아니다."""
    variables = [_Var('sig', 'MPa', 'Nope / 2')]
    assert _messages(variables) == []


def test_unparseable_formula_is_silent():
    variables = [
        _Var('F', 'N', category='input', var_type='text'),
        _Var('sig', 'MPa', 'F / @@ 3'),
    ]
    assert _messages(variables) == []


def test_empty_formula_is_silent():
    assert _messages([_Var('sig', 'MPa', '')]) == []


# --- 수식 유추 세부 --------------------------------------------------------------


def _q(text):
    return units.parse_unit(text)


def test_power_multiplies_dimensions():
    table = {'d': _q('mm')}
    derived, findings = units.infer('d ^ 2', table)
    assert {k: int(v) for k, v in derived.dims.items()} == {'L': 2}
    assert findings == []


def test_sqrt_halves_dimensions():
    table = {'a': _q('mm2')}
    derived, _ = units.infer('sqrt(a)', table)
    assert {k: int(v) for k, v in derived.dims.items()} == {'L': 1}


def test_trig_returns_dimensionless():
    table = {'x': _q('deg')}
    derived, _ = units.infer('sin(radians(x))', table)
    assert derived.known and derived.dims == {}


def test_parentheses_group_correctly():
    table = {'F': _q('N'), 'a': _q('mm'), 'b': _q('mm')}
    derived, findings = units.infer('F / (a * b)', table)
    assert findings == []
    assert derived.dims == _q('N/mm2').dims


def test_unknown_poisons_the_whole_expression():
    """모름이 하나라도 끼면 그 수식에 대해서는 아무 말도 하지 않는다."""
    table = {'F': _q('N')}
    derived, findings = units.infer('F / unknown_symbol', table)
    assert not derived.known
    assert findings == []


# --- 통합 ----------------------------------------------------------------------


def test_unit_issues_never_block_publishing(app):
    """**경고이지 오류가 아니다.**

    이미 있는 카드들이 단위를 글자표로만 써 왔다. 갑자기 게시가 막히면 쓰던
    사람이 손을 놓는다.
    """
    variables = [
        _Var('F', 'N', category='input', var_type='text'),
        _Var('A', 'mm2', category='input', var_type='text'),
        _Var('sig', 'Pa', 'F / A'),
    ]
    issues = validation.check_units(variables)
    assert issues, '경고가 나와야 한다'
    assert all(i['level'] == 'warning' for i in issues)
    assert all(i['source'] == 'units' for i in issues)


# --- 입력칸 환산표 --------------------------------------------------------------


def _offered(text):
    info = units.describe(text)
    return [a['unit'] for a in info['alternatives']] if info else None


def test_force_offers_force_units():
    assert set(_offered('N')) == {'N', 'kN', 'MN', 'kgf', 'lbf'}


def test_area_offers_area_units():
    """면적은 등록표에 이름으로 없다 — mm2 는 mm 의 제곱으로 읽힐 뿐이다."""
    assert 'cm2' in _offered('mm2') and 'm2' in _offered('mm2')
    assert 'mm' not in _offered('mm2')


def test_the_declared_notation_survives():
    """N/mm2 라고 적은 사람에게 MPa 만 보이면 자기가 쓴 말이 사라진다."""
    assert 'N/mm2' in _offered('N/mm2')
    assert 'MPa' not in _offered('N/mm2')
    assert 'MPa' in _offered('MPa')


def test_same_factor_is_not_offered_twice():
    """MPa 와 N/mm2 는 같은 값이다. 나란히 있으면 '뭐가 다르지' 하고 멈추게 된다."""
    offered = _offered('MPa')
    assert len(offered) == len(set(offered))
    assert not ('MPa' in offered and 'N/mm2' in offered)


def test_dimensionless_units_are_not_mixed():
    """**차원이 같아도 뜻이 다르다.**

    %, 개, deg 는 모두 무차원이지만 0.5 % 를 0.5 deg 로 바꿔 주는 것은 도움이
    아니라 사고다.
    """
    assert _offered('%') == ['%']
    assert _offered('개') == ['개']
    assert _offered('-') == ['-']


def test_angle_units_are_grouped():
    """rad 와 deg 는 서로 바꿔도 되는 몇 안 되는 무차원 짝이다."""
    assert set(_offered('deg')) == {'deg', 'rad'}


def test_blank_and_unreadable_units_offer_nothing():
    """짐작해서 환산표를 주면 그 짐작이 곧 1000배 오류가 된다."""
    assert units.describe('') is None
    assert units.describe('Mpa') is None
    assert units.describe(None) is None


def test_compound_unit_falls_back_to_its_family():
    """`kg*m/s2` 는 후보 목록에 없지만 힘이다."""
    assert 'N' in _offered('kg*m/s2')


def test_factors_let_the_screen_just_multiply():
    """화면이 하는 일은 곱셈 하나여야 한다 — 단위 규칙이 옮겨 가면 안 된다."""
    info = units.describe('N')
    kilo = next(a for a in info['alternatives'] if a['unit'] == 'kN')
    assert 1.5 * kilo['factor'] / info['factor'] == 1500


def test_offered_units_are_all_readable():
    """내놓는 표기를 파서가 못 읽으면 화면에서 고를 수는 있는데 값이 안 바뀐다."""
    for family in units._BY_DIMENSION.values():
        for name, _ in family:
            assert units.parse_unit(name) is not None, name
