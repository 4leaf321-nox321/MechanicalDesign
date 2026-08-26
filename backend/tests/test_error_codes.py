"""오류 코드가 **하나씩만** 가리키는지.

코드의 값어치는 하나가 하나를 가리키는 것뿐이다. 화면에서 `MD-WF-0130` 을 보고
찾아봤더니 「게시·묶음·반복 기준 중 하나입니다」 가 나오면, 그 코드는 있으나 마나다.

실제로 그렇게 되어 있었다. 일부러 그런 게 아니라 **어느 번호가 이미 쓰이는지 볼
곳이 없었기** 때문이다. 그래서 목록(`codes.py`)을 두고 여기서 소스와 맞춰 본다 —
사람이 기억해서 지켜야 하는 규칙은 언젠가 빠지지만, 시험은 안 빠진다.
"""

import re
from pathlib import Path

from app.modules.workflows.codes import CODES

MODULE = Path(__file__).resolve().parents[1] / 'app' / 'modules' / 'workflows'

#: `AppError('MD-WF-0130', f'...'` 에서 코드와 **첫 문자열 조각**을 뜯어낸다.
RAISE = re.compile(
    r"""AppError\(\s*'(MD-WF-\d+)',\s*f?(['"])(.*?)\2""", re.S)


def _raised():
    """소스에서 실제로 던지는 코드들 → {코드: {메시지 조각, ...}}"""
    found = {}
    for path in sorted(MODULE.glob('*.py')):
        text = path.read_text(encoding='utf-8')
        for match in RAISE.finditer(text):
            found.setdefault(match.group(1), set()).add(match.group(3))
    return found


def test_every_code_thrown_is_written_down():
    """번호를 새로 쓰면서 목록에 안 적으면 여기서 걸린다."""
    missing = sorted(set(_raised()) - set(CODES))
    assert not missing, (
        f'{missing} 을(를) codes.py 에 적어 주세요. '
        '적을 자리를 찾다 보면 이미 쓰이는 번호인지도 함께 보게 됩니다.')


def test_the_list_has_nothing_stale():
    """지운 코드가 목록에 남아 있으면, 목록이 거짓말을 하기 시작한다."""
    stale = sorted(set(CODES) - set(_raised()))
    assert not stale, f'{stale} 은(는) 이제 아무 데서도 안 납니다. 목록에서 빼 주세요.'


def test_one_code_never_means_two_things():
    """**이 시험이 이 파일의 이유다.**

    같은 코드가 여러 자리에서 나는 것은 괜찮다 — 「그 노드를 찾을 수 없습니다」 는
    네 군데서 나지만 뜻은 하나다. 막아야 하는 것은 한 코드가 서로 **다른 뜻**을
    가리키는 경우다.

    뜻이 같은지는 **낱말이 얼마나 겹치는가**로 가늠한다. 앞머리만 보면 안 된다 —
    「만든 사람이나 관리자만 지울 수 있습니다」 와 「이 워크플로를 만든 사람이나
    관리자만 고칠 수 있습니다」 는 같은 뜻인데 앞머리가 다르다.

    실제로 겹치는 정도는 두 무리로 확실히 갈린다:

        같은 뜻, 다른 표현    0.75 이상   (권한 없음의 네 가지 말투)
        서로 다른 뜻          0.15 아래   (묶음 못 찾음 ↔ 게시 권한)

    그 사이가 비어 있어서 0.5 를 문턱으로 둔다. 걸리면 둘 중 하나를 하면 된다 —
    말투를 맞추거나, 번호를 새로 따거나. 어느 쪽이든 결과는 옳다.
    """
    def words(message):
        # f-string 의 `{...}` 는 값이라 뜻이 아니다.
        return set(re.sub(r'\{[^}]*\}', ' ', message).split())

    confused = {}
    for code, messages in _raised().items():
        bags = [words(m) for m in messages if words(m)]
        for i, a in enumerate(bags):
            for b in bags[i + 1:]:
                if len(a & b) / min(len(a), len(b)) < 0.5:
                    confused.setdefault(code, sorted(messages))

    assert not confused, (
        '한 코드가 서로 다른 뜻으로 쓰이고 있습니다 — 코드로 오류를 짚는다는 '
        f'목적 자체가 사라집니다: {confused}')


def test_the_ranges_in_the_doc_are_real():
    """번호 나누기를 적어 두고 안 지키면, 적어 둔 값이 없다."""
    blocks = {
        '워크플로': range(100, 110),
        '자리': range(110, 120),
        '배선': range(120, 129),
        '삭제': range(129, 130),
        '게시': range(130, 135),
        '반복': range(135, 140),
        '조회': range(140, 150),
        '묶음': range(150, 160),
    }
    known = set()
    for values in blocks.values():
        known |= set(values)

    outside = sorted(c for c in CODES if int(c.split('-')[-1]) not in known)
    assert not outside, f'{outside} 는 정해 둔 어느 묶음에도 안 듭니다.'
