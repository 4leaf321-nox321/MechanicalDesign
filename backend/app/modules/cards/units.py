"""단위 — 조용히 1000배 틀리는 오류를 잡는다.

`unit` 은 지금까지 그냥 글자표였다. 화면에 "MPa" 라고 적혀 있어도 서버는 그것을
읽지 않으므로, mm 와 m 을 섞거나 N/mm² 를 Pa 라고 적어 놓아도 **계산은 멀쩡히
돌고 답만 1000배 틀린다.** 오류가 나지 않으니 검증도 AI 도 잡지 못했다.

여기서 하는 일은 두 가지다.

    차원 검사   `F / A` 의 차원이 선언한 단위의 차원과 같은가
    배율 검사   차원은 같은데 **배율**이 다른가 (N/mm² 를 Pa 라고 적은 경우)

두 번째가 이 모듈을 만든 이유다. 차원이 다른 실수는 대개 계산이 이상해서 금방
드러나지만, 배율만 어긋난 값은 그럴듯해서 그대로 설계에 들어간다.

**확신이 없으면 침묵한다.**

이것이 가장 중요한 규칙이다. 틀린 경고는 없는 경고보다 나쁘다 — 한 번 헛짚으면
사람은 그다음부터 전부 무시하고, 그러면 진짜 경고도 함께 묻힌다. 그래서
모르는 단위, 단위를 안 적은 변수, 해석 못 한 함수는 전부 **모름**이 되고,
모름은 위로 전파되어 그 수식에 대해서는 아무 말도 하지 않는다.

숫자 상수도 마찬가지다. `F / A / 1000` 처럼 사람이 손으로 환산해 둔 수식이
흔한데, 그 1000 을 모르면 배율을 판단할 수 없다. 그래서 1 이 아닌 상수가
곱셈·나눗셈에 끼면 **배율 검사만** 끈다 — 차원 검사는 그대로 산다.
"""

import math
import re
from fractions import Fraction

#: 기본 차원. 기계설계에 필요한 것만 둔다.
#: 각도는 무차원으로 다룬다(rad 는 m/m 이다) — 다만 deg 는 배율이 다르므로
#: 배율 검사에서 걸린다.
_BASE = ('M', 'L', 'T', 'K')


def _dims(**kw):
    return {k: Fraction(v) for k, v in kw.items() if v}


#: 단위 이름 → (차원, SI 기준 배율).
#:
#: 배율은 "이 단위 1 이 SI 기본 단위로 몇인가" 다. mm 은 1e-3, MPa 은 1e6.
UNITS = {
    # 무차원
    '': ({}, 1.0), '-': ({}, 1.0), 'ea': ({}, 1.0), 'EA': ({}, 1.0), '개': ({}, 1.0),
    '%': ({}, 0.01),
    '1': ({}, 1.0),
    'rad': ({}, 1.0), 'deg': ({}, math.pi / 180), '°': ({}, math.pi / 180),

    # 길이
    'm': (_dims(L=1), 1.0), 'km': (_dims(L=1), 1e3), 'cm': (_dims(L=1), 1e-2),
    'mm': (_dims(L=1), 1e-3), 'um': (_dims(L=1), 1e-6), 'μm': (_dims(L=1), 1e-6),
    'in': (_dims(L=1), 0.0254), 'ft': (_dims(L=1), 0.3048),

    # 질량
    'kg': (_dims(M=1), 1.0), 'g': (_dims(M=1), 1e-3), 't': (_dims(M=1), 1e3),
    'ton': (_dims(M=1), 1e3),

    # 시간
    's': (_dims(T=1), 1.0), 'sec': (_dims(T=1), 1.0), 'ms': (_dims(T=1), 1e-3),
    'min': (_dims(T=1), 60.0), 'h': (_dims(T=1), 3600.0), 'hr': (_dims(T=1), 3600.0),

    # 온도 — **차이만 맞다.**
    # degC 와 K 는 눈금 간격은 같고 원점이 다르다. 여기서는 원점을 다루지 않으므로
    # "20 degC 를 K 로" 같은 환산에는 쓸 수 없다. 차원·배율 검사에는 충분하다.
    'K': (_dims(K=1), 1.0), 'degC': (_dims(K=1), 1.0), '℃': (_dims(K=1), 1.0),

    # 힘
    'N': (_dims(M=1, L=1, T=-2), 1.0), 'kN': (_dims(M=1, L=1, T=-2), 1e3),
    'MN': (_dims(M=1, L=1, T=-2), 1e6), 'kgf': (_dims(M=1, L=1, T=-2), 9.80665),
    'lbf': (_dims(M=1, L=1, T=-2), 4.4482216152605),

    # 응력·압력
    'Pa': (_dims(M=1, L=-1, T=-2), 1.0), 'kPa': (_dims(M=1, L=-1, T=-2), 1e3),
    'MPa': (_dims(M=1, L=-1, T=-2), 1e6), 'GPa': (_dims(M=1, L=-1, T=-2), 1e9),
    'bar': (_dims(M=1, L=-1, T=-2), 1e5), 'psi': (_dims(M=1, L=-1, T=-2), 6894.757293168),

    # 에너지·모멘트
    'J': (_dims(M=1, L=2, T=-2), 1.0), 'kJ': (_dims(M=1, L=2, T=-2), 1e3),

    # 일률
    'W': (_dims(M=1, L=2, T=-3), 1.0), 'kW': (_dims(M=1, L=2, T=-3), 1e3),

    # 회전
    'Hz': (_dims(T=-1), 1.0), 'rpm': (_dims(T=-1), 1.0 / 60),
}

_SUPERSCRIPT = str.maketrans('⁰¹²³⁴⁵⁶⁷⁸⁹⁻', '0123456789-')

#: 단위 토큰: 이름 + 선택적 지수. `mm2` `mm^2` `mm**2` `s^-1` 을 모두 읽는다.
#: 앞의 '1' 은 역수 단위(`1/s`)를 적는 흔한 방식이다.
_UNIT_TOKEN = re.compile(r'^(1|[A-Za-zμ°℃%\-개]+)(?:\^|\*\*)?(-?\d+)?$')


class Quantity:
    """수식 한 조각의 단위 정보.

    `dims` 가 None 이면 **모름**이다. 모름은 위로 전파되고, 모름이 끼면 그
    수식에 대해서는 아무 말도 하지 않는다.
    """

    __slots__ = ('dims', 'factor', 'scale_certain', 'is_text')

    def __init__(self, dims=None, factor=1.0, scale_certain=True, is_text=False):
        self.dims = dims
        self.factor = factor
        self.scale_certain = scale_certain
        self.is_text = is_text

    @property
    def known(self):
        return self.dims is not None and not self.is_text

    def __repr__(self):
        return f'Quantity({self.dims}, {self.factor}, certain={self.scale_certain})'


UNKNOWN = Quantity(None)
TEXT = Quantity(None, is_text=True)


def _combine(a, b, sign):
    """곱(sign=+1)·나눗셈(sign=-1). 차원은 더하고 배율은 곱한다."""
    dims = dict(a.dims)
    for key, value in b.dims.items():
        dims[key] = dims.get(key, Fraction(0)) + sign * value
    dims = {k: v for k, v in dims.items() if v}
    factor = a.factor * (b.factor ** sign)
    return Quantity(dims, factor, a.scale_certain and b.scale_certain)


def parse_unit(text):
    """단위 문자열 → Quantity. 못 읽으면 None.

    읽는 형태: `mm` `mm2` `mm^2` `N/mm2` `kg*m/s2` `kg·m/s^2`

    `*` `·` `/` 를 **왼쪽부터 차례로** 적용한다. `a/b*c` 는 (a/b)*c 다. 괄호는
    받지 않는다 — 기계설계에서 쓰는 단위는 이 형태로 충분하고, 못 읽는 것은
    조용히 모름이 되므로 잘못 읽는 것보다 낫다.
    """
    if text is None:
        return None
    raw = text.strip().translate(_SUPERSCRIPT)
    if raw == '':
        return Quantity({}, 1.0)

    tokens = [t for t in re.split(r'([*·/])', raw) if t.strip() != '']
    if not tokens:
        return None

    result = None
    sign = 1
    expect_operand = True

    for token in tokens:
        token = token.strip()
        if token in ('*', '·', '/'):
            if expect_operand:
                return None
            sign = -1 if token == '/' else 1
            expect_operand = True
            continue

        match = _UNIT_TOKEN.match(token)
        if not match:
            return None
        name, exponent = match.group(1), match.group(2)
        if name not in UNITS:
            return None
        dims, factor = UNITS[name]
        power = int(exponent) if exponent else 1
        piece = Quantity({k: v * power for k, v in dims.items()}, factor ** power)

        result = piece if result is None else _combine(result, piece, sign)
        expect_operand = False

    if expect_operand:
        return None
    return result


def format_dims(dims):
    """차원을 사람이 읽을 형태로. 비교 결과를 설명할 때 쓴다."""
    if not dims:
        return '무차원'
    parts = []
    for base in _BASE:
        power = dims.get(base)
        if not power:
            continue
        label = {'M': '질량', 'L': '길이', 'T': '시간', 'K': '온도'}[base]
        parts.append(label if power == 1 else f'{label}^{power}')
    return '·'.join(parts) if parts else '무차원'


#: 입력칸에서 골라 쓸 수 있게 **내놓는** 단위들.
#:
#: 등록된 단위(UNITS)를 그대로 내놓지 않는 이유가 둘이다. 하나는 별칭이 섞여
#: 있다는 것(`sec` `hr` `ton` `EA`…) — 목록에 같은 뜻이 두 번 뜨면 고르는 사람이
#: 헷갈린다. 다른 하나는 **면적·부피처럼 자주 쓰는 것이 등록표에 이름으로 없다는
#: 것**이다. `mm2` 는 mm 의 제곱으로 읽힐 뿐 이름이 아니다.
#:
#: 그래서 "내놓을 표기" 를 따로 적고, 그것을 같은 파서로 읽어 차원별로 묶는다.
#: 파서가 하나이므로 여기 적은 것이 실제로 읽히는지는 자동으로 보장된다.
_CANDIDATES = (
    # 길이·면적·부피
    'km', 'm', 'cm', 'mm', 'um', 'in', 'ft',
    'm2', 'cm2', 'mm2', 'in2', 'ft2',
    'm3', 'cm3', 'mm3',
    # 질량
    't', 'kg', 'g',
    # 시간
    'h', 'min', 's', 'ms',
    # 온도
    'K', 'degC',
    # 힘
    'MN', 'kN', 'N', 'kgf', 'lbf',
    # 응력·압력
    'GPa', 'MPa', 'kPa', 'Pa', 'N/mm2', 'N/m2', 'kgf/cm2', 'bar', 'psi',
    # 에너지·모멘트
    'kJ', 'J', 'N*m', 'kN*m', 'kgf*m',
    # 일률
    'kW', 'W',
    # 회전·주기
    'Hz', 'rpm', '1/s', '1/min',
    # 무차원
    '-', '%', 'rad', 'deg',
)


def _candidate_table():
    """차원 → [(표기, 배율)]. 배율 오름차순.

    모듈을 불러올 때 한 번만 만든다. 변수마다 다시 계산하면 카드를 열 때마다
    후보 수십 개를 파싱하게 된다.
    """
    table = {}
    for text in _CANDIDATES:
        quantity = parse_unit(text)
        if quantity is None:
            # _CANDIDATES 에 파서가 못 읽는 표기를 적어 두면 조용히 빠진다.
            # 그건 표기 실수이므로 여기서 드러나야 한다.
            raise ValueError(f'내놓을 단위 표기를 파서가 읽지 못합니다: {text!r}')
        key = _dims_key(quantity.dims)
        table.setdefault(key, []).append((text, quantity.factor))
    for key in table:
        table[key].sort(key=lambda item: item[1])
    return table


def _dims_key(dims):
    return tuple(sorted((k, str(v)) for k, v in (dims or {}).items()))


_BY_DIMENSION = _candidate_table()


#: 무차원끼리는 **차원이 같아도 뜻이 다르다.** `%` 와 `deg` 와 `개` 는 모두
#: 무차원이지만, 0.5 % 를 0.5 deg 로 바꿔 주는 것은 도움이 아니라 사고다.
#: 그래서 무차원은 자동으로 묶지 않고, 서로 바꿔도 되는 것만 여기 적는다.
_DIMENSIONLESS_GROUPS = (('rad', 'deg'),)


def describe(unit_text):
    """입력칸이 쓸 환산 정보. 못 읽거나 안 적은 단위면 None.

    **환산표를 화면 쪽에 복사하지 않으려고 여기서 만든다.** 프론트가 단위
    문자열을 스스로 해석하기 시작하면 그 순간 단위 규칙이 두 벌이 되고, 두 벌은
    반드시 어긋난다 — 그 어긋남은 "화면에서는 환산했는데 검증은 다르게 보는"
    형태라 원인을 찾기 어렵다.

    돌려주는 것:
        {'unit': 'N', 'factor': 1.0,
         'alternatives': [{'unit': 'N', 'factor': 1.0}, {'unit': 'kN', ...}]}

    `factor` 는 SI 기준이다. 화면은 `입력값 × 고른것.factor / 선언한것.factor`
    로 선언 단위의 값을 얻는다 — 곱셈 하나뿐이라 규칙이 옮겨 가지 않는다.
    """
    text = (unit_text or '').strip()
    if not text:
        return None
    quantity = parse_unit(text)
    if quantity is None:
        return None

    if not quantity.dims:
        group = next((g for g in _DIMENSIONLESS_GROUPS if text in g), None)
        if group is None:
            options = [(text, quantity.factor)]
        else:
            options = sorted(((name, UNITS[name][1]) for name in group),
                             key=lambda item: item[1])
    else:
        options = list(_BY_DIMENSION.get(_dims_key(quantity.dims), []))

    # **같은 배율이 두 번 뜨면 안 된다.** MPa 와 N/mm2 는 같은 값이라
    # 목록에 나란히 있으면 '뭐가 다르지' 하고 멈추게 된다. 하나만 남기되,
    # 사람이 적어 둔 표기가 있으면 그것을 남긴다 — 자기가 쓴 말이 보여야 한다.
    deduped = []
    for name, factor in options:
        same = next((i for i, (_, f) in enumerate(deduped) if _close(f, factor)), None)
        if same is None:
            deduped.append((name, factor))
        elif name == text:
            deduped[same] = (name, factor)
    options = deduped

    # 선언한 표기가 후보에 없으면(예: `kg*m/s2`) 직접 넣는다. 자기 단위가
    # 목록에 없으면 고를 수가 없다.
    if not any(name == text for name, _ in options):
        if not any(_close(factor, quantity.factor) for _, factor in options):
            options.append((text, quantity.factor))
            options.sort(key=lambda item: item[1])

    return {
        'unit': text,
        'factor': quantity.factor,
        'alternatives': [{'unit': name, 'factor': factor} for name, factor in options],
    }


# --- 수식에서 단위를 유추한다 ----------------------------------------------------
#
# **평가기를 다시 만드는 것이 아니다.** 값을 구하지 않고 단위만 따진다. 그래서
# 자바스크립트 평가기와 같은 일을 두 벌 하는 것이 아니라, 애초에 다른 일이다.
# 다만 문법은 같아야 하므로 연산자와 함수 이름을 맞춰 둔다.

_TOKEN = re.compile(r'''
    \s*(?:
        (?P<string>"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')
      | (?P<number>\d+\.?\d*(?:[eE][+-]?\d+)?)
      | (?P<name>[A-Za-z_][A-Za-z0-9_]*)
      | (?P<op>\*\*|\^|[+\-*/(),])
    )
''', re.VERBOSE)

#: 무차원을 받아 무차원을 돌려주는 함수들.
_DIMENSIONLESS_FUNCS = {
    'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
    'exp', 'log', 'log10', 'radians', 'degrees',
}
#: 인자의 단위를 그대로 물려주는 함수들.
_PASSTHROUGH_FUNCS = {'abs'}
#: 인자들의 단위가 서로 같아야 하고, 그 단위를 돌려주는 함수들.
_SAME_UNIT_FUNCS = {'min', 'max', 'average', 'sum'}


class _Parser:
    """단위 유추용 최소 파서. 값은 구하지 않는다."""

    def __init__(self, text, symbol_units):
        # **먼저 채운다.** 아래에서 못 읽고 일찍 돌아가는 길이 있는데,
        # 그때 findings 가 없으면 부르는 쪽이 AttributeError 로 죽는다.
        self.index = 0
        self.symbol_units = symbol_units
        self.findings = []
        self.tokens = []
        pos = 0
        while pos < len(text):
            match = _TOKEN.match(text, pos)
            if not match or match.end() == pos:
                # 못 읽는 글자가 나오면 통째로 포기한다 — 반쯤 읽고 짐작하면
                # 그 짐작이 곧 헛경고가 된다.
                self.tokens = None
                return
            self.tokens.append(match)
            pos = match.end()

    # -- 토큰 --
    def _peek(self):
        if self.index >= len(self.tokens):
            return None, None
        match = self.tokens[self.index]
        for kind in ('string', 'number', 'name', 'op'):
            if match.group(kind) is not None:
                return kind, match.group(kind)
        return None, None

    def _take(self):
        kind, value = self._peek()
        self.index += 1
        return kind, value

    # -- 문법 --
    def parse(self):
        if self.tokens is None:
            return UNKNOWN
        result = self._expr()
        if self.index != len(self.tokens):
            return UNKNOWN     # 남은 토큰이 있으면 우리가 잘못 읽은 것이다
        return result

    def _expr(self):
        left = self._term()
        while True:
            kind, value = self._peek()
            if kind != 'op' or value not in ('+', '-'):
                return left
            self._take()
            right = self._term()

            if left.is_text or right.is_text:
                # 문자열 잇기(`"응력 " + sig`). 단위를 따질 일이 아니다.
                left = TEXT
                continue
            if not left.known or not right.known:
                left = UNKNOWN
                continue
            if left.dims != right.dims:
                self.findings.append(
                    f'{format_dims(left.dims)} 와 {format_dims(right.dims)} 를 '
                    f'{value} 로 더하거나 뺐습니다')
                left = UNKNOWN
                continue
            if left.scale_certain and right.scale_certain and not _close(left.factor, right.factor):
                self.findings.append(
                    f'같은 차원이지만 배율이 {_ratio(left.factor, right.factor)} 배 다른 값을 '
                    f'{value} 로 더하거나 뺐습니다')
            left = Quantity(left.dims, left.factor,
                            left.scale_certain and right.scale_certain)

    def _term(self):
        left = self._factor()
        while True:
            kind, value = self._peek()
            if kind != 'op' or value not in ('*', '/'):
                return left
            self._take()
            right = self._factor()
            if not left.known or not right.known:
                left = UNKNOWN
                continue
            left = _combine(left, right, 1 if value == '*' else -1)

    def _factor(self):
        base = self._unary()
        kind, value = self._peek()
        if kind == 'op' and value in ('^', '**'):
            self._take()
            # 지수는 상수여야 차원을 계산할 수 있다.
            exponent = self._literal_number()
            if exponent is None or not base.known:
                self._unary()      # 지수 자리를 소비한다
                return UNKNOWN
            power = Fraction(exponent).limit_denominator(1000)
            return Quantity({k: v * power for k, v in base.dims.items()},
                            base.factor ** float(power), base.scale_certain)
        return base

    def _literal_number(self):
        kind, value = self._peek()
        if kind == 'op' and value == '-':
            self._take()
            inner = self._literal_number()
            return None if inner is None else -inner
        if kind == 'number':
            self._take()
            return float(value)
        return None

    def _unary(self):
        kind, value = self._peek()
        if kind == 'op' and value in ('+', '-'):
            self._take()
            return self._unary()
        return self._primary()

    def _primary(self):
        kind, value = self._take()
        if kind is None:
            return UNKNOWN
        if kind == 'string':
            return TEXT
        if kind == 'number':
            number = float(value)
            # **1 이 아닌 상수는 배율을 흐린다.** `F / A / 1000` 처럼 손으로
            # 환산해 둔 수식이 흔한데, 그 1000 을 배율로 세면 헛경고가 된다.
            return Quantity({}, 1.0, scale_certain=_close(number, 1.0))
        if kind == 'op' and value == '(':
            inner = self._expr()
            kind2, value2 = self._peek()
            if kind2 == 'op' and value2 == ')':
                self._take()
                return inner
            return UNKNOWN
        if kind == 'name':
            kind2, value2 = self._peek()
            if kind2 == 'op' and value2 == '(':
                return self._call(value)
            return self.symbol_units.get(value, UNKNOWN)
        return UNKNOWN

    def _call(self, name):
        self._take()   # '('
        args = []
        kind, value = self._peek()
        if kind == 'op' and value == ')':
            self._take()
        else:
            while True:
                args.append(self._expr())
                kind, value = self._take()
                if kind == 'op' and value == ')':
                    break
                if not (kind == 'op' and value == ','):
                    return UNKNOWN

        if name == 'pi':
            return Quantity({}, 1.0)
        if name == 'sqrt':
            if not args or not args[0].known:
                return UNKNOWN
            base = args[0]
            return Quantity({k: v / 2 for k, v in base.dims.items()},
                            math.sqrt(base.factor), base.scale_certain)
        if name in _DIMENSIONLESS_FUNCS:
            return Quantity({}, 1.0)
        if name in _PASSTHROUGH_FUNCS:
            return args[0] if args else UNKNOWN
        if name in _SAME_UNIT_FUNCS:
            known = [a for a in args if a.known]
            if len(known) != len(args) or not known:
                return UNKNOWN
            first = known[0]
            for other in known[1:]:
                if other.dims != first.dims:
                    self.findings.append(
                        f'{name}() 에 {format_dims(first.dims)} 와 '
                        f'{format_dims(other.dims)} 를 함께 넣었습니다')
                    return UNKNOWN
            return first
        if name == 'pow' and len(args) == 2:
            return UNKNOWN    # 지수가 상수인지 여기서는 알 수 없다
        # 나머지(range·at·add·mul·prob…)는 모름. 짐작하지 않는다.
        return UNKNOWN


def _close(a, b, tolerance=1e-9):
    if a == 0 or b == 0:
        return a == b
    return abs(a / b - 1.0) < tolerance


def _ratio(a, b):
    if b == 0:
        return '?'
    value = a / b
    if value < 1:
        value = 1 / value
    return f'{value:g}'


def infer(expression, symbol_units):
    """(수식의 단위, 수식 안에서 발견한 것들).

    `symbol_units` 는 기호 → Quantity. 단위를 안 적었거나 못 읽는 변수는
    아예 넣지 말 것 — 그러면 모름이 되어 그 수식은 조용히 넘어간다.
    """
    if not expression or not expression.strip():
        return UNKNOWN, []
    parser = _Parser(expression, symbol_units)
    result = parser.parse()
    return result, parser.findings


def symbol_table(variables):
    """변수 목록 → 기호별 Quantity.

    **단위를 안 적은 변수는 넣지 않는다.** 빈 칸은 "무차원" 이 아니라
    "안 적었다" 이다. 그것을 무차원으로 세면, 단위를 아직 안 채운 카드마다
    "무차원인데 MPa 라고 되어 있다" 는 헛경고가 쏟아진다 — 대부분의 카드가
    그 상태다.

    무차원이라고 **말하고 싶으면** '-' 나 '%' 처럼 적으면 된다.

    못 읽는 단위도 넣지 않는다. 모름으로 남아 그 수식은 조용히 넘어간다.
    """
    table = {}
    for v in variables:
        symbol = (getattr(v, 'symbol', None) or '').strip()
        unit = (getattr(v, 'unit', None) or '').strip()
        if not symbol or not unit:
            continue
        quantity = parse_unit(unit)
        if quantity is not None:
            table[symbol] = quantity
    return table


def unreadable_units(variables):
    """단위를 적었는데 우리가 못 읽은 것들. 사람에게 알려 줄 값어치가 있다.

    오타(`Mpa`)이거나 등록되지 않은 단위다. 못 읽으면 그 변수가 낀 수식은
    전부 검사에서 빠지므로, 조용히 넘어가는 것보다 말해 주는 편이 낫다.
    """
    out = []
    for v in variables:
        unit = (getattr(v, 'unit', None) or '').strip()
        if unit and parse_unit(unit) is None:
            out.append((v, unit))
    return out
