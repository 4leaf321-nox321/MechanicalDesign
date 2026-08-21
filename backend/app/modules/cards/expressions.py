"""변수 정의 안에서 **수식이 들어 있는 자리**를 한 곳에 모아 둔다.

이 파일이 있는 이유 — 실제로 겪은 사고:

    테이블 변수가 조회 키를 여러 개 가질 수 있게 되면서 정의 모양이
    `key_expression` 하나에서 `keys: [{expression: ...}]` 로 바뀌었다. 평가하는
    쪽(프론트 evaluators.js)은 두 모양을 다 읽도록 고쳤는데, 기호를 바꿀 때
    수식을 따라 고치는 쪽은 옛 필드만 보도록 남았다.

    그 결과 기호를 바꿔도 테이블 조회 키만 옛 기호를 붙들고 있었고, **아무
    오류도 나지 않았다.** 나중에 계산할 때 "알 수 없는 식별자" 로 터지는데,
    기호를 바꾼 일과 연결짓기 어려운 형태다.

문제의 뿌리는 "어디에 수식이 있는가" 를 여러 곳이 각자 알고 있었다는 것이다.
여기서는 그 지식을 `_visit` 한 곳에만 둔다. 변수 타입이나 필드가 늘어나면
**이 파일만** 고치면 되고, 읽기(iter_expressions)와 고쳐쓰기(rewrite_expressions)가
같은 순회를 쓰므로 둘이 어긋날 수 없다.
"""

import json


def rename_symbol_in_expr(expr, old, new):
    """수식 안에서 식별자(=변수 기호)만 바꾼다.

    따옴표 문자열 리터럴 안의 텍스트는 건드리지 않는다 — 조건식에서
    `구분 == "A"` 처럼 쓰는 값이 기호와 같은 글자일 수 있다.
    """
    if not expr or not old or old == new:
        return expr
    out = []
    i = 0
    n = len(expr)
    in_str = False
    str_ch = None
    while i < n:
        ch = expr[i]
        if in_str:
            out.append(ch)
            if ch == '\\' and i + 1 < n:
                out.append(expr[i + 1])
                i += 2
                continue
            if ch == str_ch:
                in_str = False
                str_ch = None
            i += 1
            continue
        if ch == '"' or ch == "'":
            in_str = True
            str_ch = ch
            out.append(ch)
            i += 1
            continue
        if ch.isalpha() or ch == '_':
            j = i
            while j < n and (expr[j].isalnum() or expr[j] == '_'):
                j += 1
            ident = expr[i:j]
            out.append(new if ident == old else ident)
            i = j
            continue
        out.append(ch)
        i += 1
    return ''.join(out)


# --- 타입별 수식 자리 ----------------------------------------------------------
#
# 각 함수는 파싱된 정의(dict)를 받아 수식 자리마다 fn 을 적용한다.
# fn 은 "수식 문자열 → 수식 문자열".


def _visit_table(data, fn):
    # 지금 편집기가 만드는 모양 — 조회 키 여러 개.
    for key in data.get('keys') or []:
        if isinstance(key, dict) and key.get('expression'):
            key['expression'] = fn(key['expression'])
    # 옛 모양 — 단일 조회 키. 평가기(normalizeTableKeys)가 아직 읽으므로
    # 여기서도 계속 다뤄야 한다. 예전에 저장된 카드가 남아 있다.
    if data.get('key_expression'):
        data['key_expression'] = fn(data['key_expression'])
    # 표의 셀 값은 수식이 아니다 — 평가기가 리터럴로만 비교한다(evaluateTable).


def _visit_conditional(data, fn):
    for branch in data.get('branches') or []:
        if not isinstance(branch, dict):
            continue
        if branch.get('condition'):
            branch['condition'] = fn(branch['condition'])
        if branch.get('formula'):
            branch['formula'] = fn(branch['formula'])
    if data.get('default_formula'):
        data['default_formula'] = fn(data['default_formula'])


def _visit_interp(data, fn):
    if data.get('x_expression'):
        data['x_expression'] = fn(data['x_expression'])
    # x/y 열의 값은 수식이 아니다(evaluateInterpTable 가 Number 로만 읽는다).


#: var_type -> (정의를 담은 컬럼, 그 안을 도는 함수)
JSON_SLOTS = {
    'table': ('table_data', _visit_table),
    'conditional': ('conditional_data', _visit_conditional),
    'interp_table': ('interp_data', _visit_interp),
}

#: 수식을 가질 수 있는 변수 타입. 입력 변수(slider·text·dropdown)는 값만 갖는다.
EXPRESSION_TYPES = ('formula',) + tuple(JSON_SLOTS)


def _visit(variable, fn, write):
    """이 변수의 모든 수식 자리에 fn 을 적용한다.

    `write` 가 False 면 결과를 되돌려 쓰지 않는다 — 읽기 전용 순회.
    수식이 있는 자리를 아는 곳은 여기 하나뿐이다.
    """
    if variable.var_type == 'formula':
        current = variable.formula or ''
        if not current:
            return
        result = fn(current)
        if write:
            variable.formula = result
        return

    slot = JSON_SLOTS.get(variable.var_type)
    if slot is None:
        return
    field, visit = slot

    raw = getattr(variable, field, None) or ''
    if not raw:
        return
    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        # 깨진 정의는 건드리지 않는다. 여기서 고치려 들면 원본을 잃는다.
        return
    if not isinstance(data, dict):
        return

    visit(data, fn)
    if write:
        setattr(variable, field, json.dumps(data))


def rewrite_expressions(variable, fn):
    """이 변수의 수식을 전부 `fn` 으로 바꿔 쓴다."""
    _visit(variable, fn, write=True)


def iter_expressions(variable):
    """이 변수가 들고 있는 수식 문자열 목록. 검사·테스트용(정의를 바꾸지 않는다).

    고쳐쓰기와 **같은 순회**를 쓴다. 새 수식 자리를 `_visit` 에 더하면 여기에도
    자동으로 잡히므로, 테스트가 빠뜨린 자리를 스스로 찾아낸다.
    """
    found = []

    def collect(expr):
        found.append(expr)
        return expr

    _visit(variable, collect, write=False)
    return found


def rename_symbol(variable, old_symbol, new_symbol):
    """이 변수의 수식에서 기호 하나를 바꾼다."""
    if not old_symbol or not new_symbol or old_symbol == new_symbol:
        return
    rewrite_expressions(variable, lambda expr: rename_symbol_in_expr(expr, old_symbol, new_symbol))
