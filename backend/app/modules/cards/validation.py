"""카드 정의 검증 — 저장된 것이 실제로 계산되는가.

**왜 필요한가.** 지금까지 수식이 말이 되는지 확인하는 유일한 방법은 사람이 카드를
열어 계산 버튼을 누르는 것이었다. 서버는 수식을 글자로 저장만 하고 아무것도 보지
않는다. 사람이 화면에서 만들 때는 그래도 됐다 — 만든 사람이 바로 눌러 보니까.

밖에서 API 로 카드를 만들기 시작하면 얘기가 달라진다. 특히 **AI 가 만든 정의는
그럴듯하게 틀린다** — 없는 기호를 참조하거나, 오타가 있거나, 서로를 참조해 영영
풀리지 않는다. 그런 것이 조용히 저장되면 나중에 그 카드로 설계 판단을 하게 된다.

검사는 두 층이다.

    정적 검사   기호 참조·순환 참조·정의 완결성. 파이썬만으로 판단할 수 있다.
    시험 계산   실제로 값을 넣어 돌려 본다. 계산기가 자바스크립트라 node 로 부른다.

**계산기를 파이썬으로 옮겨 적지 않았다.** 두 벌이 되면 어긋나고, 그 어긋남은
"화면에서는 맞는데 검증은 실패하는" 형태라 원인을 찾기 어렵다. 프론트가 쓰는 바로
그 파일을 node 로 실행한다(evaluator/run.mjs).
"""

import json
import os
import re
import shutil
import subprocess

from . import units
from .expressions import EXPRESSION_TYPES, iter_expressions

#: 수식에서 쓸 수 있는 내장 함수. **프론트의 MATH_FUNCS 와 같아야 한다.**
#: 여기서는 "이 이름이 변수 기호가 아니어도 괜찮은가" 만 판단하므로, 목록이
#: 조금 뒤처지면 없는 기호로 잘못 신고할 뿐 계산을 막지는 않는다.
#: 시험 계산이 진짜 판정이고, 이것은 사람이 읽을 사유를 먼저 주기 위한 것이다.
BUILTIN_FUNCTIONS = {
    'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
    'radians', 'degrees', 'pi', 'abs', 'sqrt', 'log', 'log10', 'exp', 'pow',
    'min', 'max', 'average', 'sum', 'count', 'size',
    'add', 'sub', 'mul', 'div', 'range', 'at',
    'prob',
}

_IDENT = re.compile(r'[A-Za-z_][A-Za-z0-9_]*')
_STRING = re.compile(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'')

EVALUATOR_SCRIPT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
    'evaluator', 'run.mjs',
)


def _identifiers(expression):
    """수식에 등장하는 이름들. 따옴표 문자열 안은 값이므로 뺀다."""
    return set(_IDENT.findall(_STRING.sub('', expression or '')))


def _issue(level, variable, message, source='static'):
    """`source` 는 이 문제를 **어느 층이 찾았는가**다.

    static  정의 자체가 어긋났다. 입력값이 무엇이든 틀렸다
    trial   그 입력값으로 계산해 보니 안 됐다
    units   단위가 서로 안 맞는다. **경고일 뿐 아무것도 막지 않는다**

    둘을 섞으면 부르는 쪽이 판단을 못 한다. 입력값을 안 준 채 검증하면
    입력 변수마다 '값 없음' 이 나는데, 그건 **정의의 결함이 아니라 그냥 빈
    입력**이다. 그것까지 게시를 막는 근거로 쓰면 어떤 카드도 올릴 수 없다.
    """
    return {
        'level': level,
        'source': source,
        'variable_id': variable.id if variable is not None else None,
        'variable_name': variable.name if variable is not None else None,
        'symbol': (variable.symbol or '') if variable is not None else '',
        'message': message,
    }


def check_static(variables):
    """계산해 보지 않고 알 수 있는 문제들."""
    issues = []
    symbols = {}

    for v in variables:
        symbol = (v.symbol or '').strip()
        if not symbol:
            issues.append(_issue('error', v, '기호가 없습니다. 수식에서 이 변수를 쓸 수 없습니다.'))
            continue
        if symbol in symbols:
            issues.append(_issue(
                'error', v, f"기호 '{symbol}' 가 '{symbols[symbol].name}' 와 겹칩니다."))
            continue
        if symbol in BUILTIN_FUNCTIONS:
            issues.append(_issue(
                'error', v, f"'{symbol}' 는 내장 함수 이름이라 기호로 쓸 수 없습니다."))
            continue
        symbols[symbol] = v

    known = set(symbols) | BUILTIN_FUNCTIONS

    # 어떤 변수가 어떤 기호를 참조하는가 — 순환 참조 판정에 쓴다.
    depends = {}
    for v in variables:
        if v.var_type not in EXPRESSION_TYPES:
            continue
        used = set()
        for expression in iter_expressions(v):
            used |= _identifiers(expression)
        unknown = sorted(used - known)
        for name in unknown:
            issues.append(_issue(
                'error', v, f"'{name}' 를 찾을 수 없습니다. 그런 기호나 함수가 없습니다."))

        # **단계를 거슬러 참조하는 것**을 따로 짚는다.
        #
        # 계산은 입력값 → 중간값 → 결과값 순서로 돈다. 중간값이 결과값을
        # 참조하면 그 결과값은 아직 계산되기 전이라 "알 수 없는 이름" 으로
        # 끝난다. 기호는 분명히 있는데 없다고 나오니, 사유만 보고는 오타를
        # 찾다가 시간을 버린다.
        if v.category == 'intermediate':
            for name in sorted(used & set(symbols)):
                if symbols[name].category == 'output':
                    issues.append(_issue(
                        'error', v,
                        f"'{name}' 는 결과값이라 중간값에서 쓸 수 없습니다. "
                        '계산은 입력값 → 중간값 → 결과값 순서로 돌기 때문입니다.'))

        depends[v.id] = {symbols[s].id for s in (used & set(symbols)) if symbols[s].id != v.id}

    # 순환 참조 — 서로를 기다리느라 영영 풀리지 않는다. 계산은 멈추지만 "값 없음"
    # 으로만 보여서 원인을 알기 어렵다.
    for var_id in list(depends):
        seen, stack = set(), [var_id]
        while stack:
            current = stack.pop()
            for nxt in depends.get(current, ()):
                if nxt == var_id:
                    by_id = {v.id: v for v in variables}
                    issues.append(_issue(
                        'error', by_id.get(var_id), '순환 참조입니다. 서로를 참조해 계산할 수 없습니다.'))
                    stack = []
                    break
                if nxt not in seen:
                    seen.add(nxt)
                    stack.append(nxt)

    # 정의가 비어 있는 계산 변수 — 저장은 되지만 계산은 안 된다.
    for v in variables:
        if v.category not in ('intermediate', 'output'):
            continue
        if v.var_type == 'formula' and not (v.formula or '').strip():
            issues.append(_issue('error', v, '수식이 비어 있습니다.'))
        elif v.var_type == 'table' and not (v.table_data or '').strip():
            issues.append(_issue('error', v, '테이블 정의가 비어 있습니다.'))
        elif v.var_type == 'conditional' and not (v.conditional_data or '').strip():
            issues.append(_issue('error', v, '조건부 정의가 비어 있습니다.'))
        elif v.var_type == 'interp_table' and not (v.interp_data or '').strip():
            issues.append(_issue('error', v, '보간 테이블 정의가 비어 있습니다.'))

    return issues


def check_units(variables):
    """단위가 서로 맞는가. **전부 경고이고, 아무것도 막지 않는다.**

    막지 않는 이유가 둘이다. 하나는 이미 있는 카드들이 단위를 글자표로만 써
    왔다는 것 — 갑자기 게시가 막히면 쓰던 사람이 손을 놓는다. 다른 하나는
    유추가 완벽할 수 없다는 것이다. 표 조회나 조건부에서 나온 값의 단위는 알
    길이 없고, 사람이 손으로 환산해 둔 수식도 흔하다.

    그래서 이 검사의 목표는 "틀린 것을 막는 것" 이 아니라 **"1000배 어긋난 것을
    사람 눈에 띄게 하는 것"** 이다.
    """
    issues = []
    table = units.symbol_table(variables)

    for v, unit in units.unreadable_units(variables):
        issues.append(_issue(
            'warning', v,
            f"단위 '{unit}' 를 읽지 못했습니다. 오타이거나 아직 등록되지 않은 단위입니다 — "
            '이 변수가 낀 수식은 단위 검사에서 빠집니다.',
            source='units'))

    for v in variables:
        if v.var_type != 'formula':
            # 표 조회·조건부·보간에서 나오는 값의 단위는 알 길이 없다.
            # 모르는 것에 대해서는 말하지 않는다.
            continue
        formula = (v.formula or '').strip()
        if not formula:
            continue

        derived, findings = units.infer(formula, table)
        for text in findings:
            issues.append(_issue('warning', v, f'수식 안에서 단위가 어긋납니다: {text}',
                                 source='units'))

        declared_text = (v.unit or '').strip()
        declared = units.parse_unit(declared_text) if declared_text else None
        if declared is None or not derived.known:
            continue

        if declared.dims != derived.dims:
            issues.append(_issue(
                'warning', v,
                f"단위가 '{declared_text}'({units.format_dims(declared.dims)}) 라고 "
                f'되어 있는데 수식은 {units.format_dims(derived.dims)} 를 냅니다.',
                source='units'))
            continue

        # **여기가 이 검사를 만든 이유다.**
        #
        # 차원이 같으면 계산은 멀쩡히 돌고 답만 배율만큼 틀린다. N/mm² 를 Pa 라고
        # 적어 두면 1,000,000 배다. 아무 오류도 나지 않으므로 설계에 그대로 들어간다.
        if derived.scale_certain and not units._close(declared.factor, derived.factor):
            ratio = derived.factor / declared.factor
            issues.append(_issue(
                'warning', v,
                f"단위는 '{declared_text}' 인데 수식이 내는 값은 그보다 "
                f'{ratio:g} 배입니다. 차원은 맞으니 계산은 돌지만 값이 그만큼 어긋납니다.',
                source='units'))

    return issues


def node_available():
    return shutil.which('node') is not None


def run_trial(variables, values, timeout=20):
    """실제로 계산해 본다. 계산기는 프론트와 같은 파일(node 로 실행).

    돌려주는 것: (results, error). node 가 없거나 실패하면 results 는 None 이고
    error 에 사유가 담긴다 — **조용히 통과시키지 않는다.** 검증이 안 돌았는데
    통과로 보이면 검증을 붙인 의미가 없다.
    """
    if not node_available():
        return None, ('node 를 찾을 수 없어 시험 계산을 건너뛰었습니다. '
                      '서버에 Node.js 를 설치하면 실제 계산까지 확인합니다.')
    if not os.path.exists(EVALUATOR_SCRIPT):
        return None, f'계산기 스크립트가 없습니다: {EVALUATOR_SCRIPT}'

    payload = json.dumps({
        'variables': [v.to_dict() for v in variables],
        # 키는 문자열로 나간다(JSON). run.mjs 가 변수 id 로 찾을 때 맞춰야 한다.
        'values': {str(k): v for k, v in (values or {}).items()},
    }, ensure_ascii=False)

    try:
        proc = subprocess.run(
            ['node', EVALUATOR_SCRIPT],
            input=payload.encode('utf-8'),
            capture_output=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        # 수식이 서로를 부르거나 range 가 너무 크면 오래 걸릴 수 있다.
        return None, f'시험 계산이 {timeout}초 안에 끝나지 않았습니다.'
    except OSError as exc:
        return None, f'시험 계산을 실행하지 못했습니다: {exc}'

    if proc.returncode != 0:
        detail = proc.stderr.decode('utf-8', 'replace').strip()[:300]
        return None, f'시험 계산이 실패했습니다: {detail or "알 수 없는 오류"}'

    try:
        body = json.loads(proc.stdout.decode('utf-8'))
    except (ValueError, UnicodeDecodeError):
        return None, '시험 계산 결과를 읽지 못했습니다.'

    if not body.get('ok'):
        return None, body.get('error') or '시험 계산이 실패했습니다.'
    return body, None


def validate_card(variables, values=None):
    """정적 검사 + 시험 계산. 밖에서 만든 정의가 실제로 도는지 본다."""
    issues = check_static(variables)
    # 단위 검사는 경고만 낸다. `ok` 는 오류가 없는지를 보므로 여기서
    # 더해도 게시가 막히지 않는다 — 그게 의도다.
    issues += check_units(variables)

    trial, trial_error = run_trial(variables, values or {})
    results = []
    if trial is not None:
        by_id = {v.id: v for v in variables}
        for raw_id, outcome in (trial.get('results') or {}).items():
            v = by_id.get(int(raw_id))
            if v is None:
                continue
            results.append({
                'variable_id': v.id,
                'variable_name': v.name,
                'symbol': v.symbol or '',
                'value': outcome.get('value'),
                'error': outcome.get('error'),
            })
            if outcome.get('error'):
                issues.append(
                    _issue('error', v, f"계산 실패: {outcome['error']}", source='trial'))
        results.sort(key=lambda r: r['variable_id'])

    return {
        'ok': not any(i['level'] == 'error' for i in issues) and trial_error is None,
        'issues': issues,
        'results': results,
        # 시험 계산이 못 돈 경우를 숨기지 않는다.
        'trial_skipped': trial_error,
    }
