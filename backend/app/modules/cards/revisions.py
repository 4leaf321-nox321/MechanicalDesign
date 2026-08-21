"""변경 이력 — 이 카드가 언제 누구에 의해 어떻게 바뀌었나.

**"게시 후 AI 수정됨" 이 절반만 일하고 있었다.** 뭔가 바뀌었다고는 말하는데
뭐가 바뀌었는지는 못 말한다. 그 표시를 본 사람이 할 수 있는 일은 카드를 열어
수식을 눈으로 훑는 것뿐이고, 수식이 스무 개면 그건 하지 않게 된다.

**정의를 통째로 뜬다.** 필드 단위 감사 로그가 아니라 그때의 변수 정의 전부를
남긴다. 로그만 있으면 "그 시점의 카드가 어떤 모습이었나" 를 되짚으려고 변경을
거꾸로 적용해야 하는데, 그 재구성은 한 번만 어긋나도 조용히 틀린 답을 준다.
스냅샷은 그냥 열어 보면 된다. 계산 기록이 쓰는 것과 같은 판단이다.

**변수만 뜬다.** 컨테이너 배치나 이미지 위치는 계산을 바꾸지 않는다. 그것까지
이력에 넣으면 드래그 몇 번에 이력이 묻히고, 정작 수식이 바뀐 한 줄을 못 찾는다.

**변수가 그대로면 이력을 만들지 않는다.** 어떤 요청이 정의를 바꾸는지 목록으로
관리하지 않는다는 뜻이다 — 새 엔드포인트가 생겨도 비교가 알아서 판단한다.
목록은 언젠가 빠뜨리고, 빠뜨린 자리는 아무 오류도 내지 않는다.
"""

import json
from datetime import datetime, timedelta

from app.extensions import db

#: 같은 사람이 이어서 고치는 동안은 한 이력으로 묶는다.
#:
#: 변수 저장은 변수 하나씩 나가므로, 설정 화면에서 스무 개를 손보면 요청도 스무
#: 번이다. 그걸 그대로 스무 줄로 쌓으면 이력을 사람이 읽을 수 없다 — 읽을 수
#: 없는 이력은 없는 것과 같다.
COALESCE_WINDOW = timedelta(minutes=5)

#: 비교할 필드. `sort_order` 는 뺀다 — 순서를 바꾼 것은 계산을 바꾼 것이 아니다.
DIFF_FIELDS = (
    ('name', '이름'),
    ('symbol', '기호'),
    ('category', '구분'),
    ('var_type', '타입'),
    ('formula', '수식'),
    ('unit', '단위'),
    ('min_value', '최소값'),
    ('max_value', '최대값'),
    ('options_data', '드롭다운 옵션'),
    ('table_data', '테이블 정의'),
    ('conditional_data', '조건부 정의'),
    ('interp_data', '보간 테이블 정의'),
)

#: 값을 그대로 보여 주기엔 너무 긴 필드. 바뀌었다는 사실만 알린다.
_BULKY = {'options_data', 'table_data', 'conditional_data', 'interp_data'}

_MAX_SHOWN = 120


def snapshot_of(card_id):
    """지금 이 카드의 변수 정의 전부."""
    from .models import Variable

    rows = (Variable.query.filter_by(card_id=card_id)
            .order_by(Variable.sort_order, Variable.id).all())
    return [v.to_dict() for v in rows]


def _label(variable):
    symbol = (variable.get('symbol') or '').strip()
    name = variable.get('name') or ''
    return f'{name}({symbol})' if symbol else name


def _shorten(value):
    if value is None or value == '':
        return '(없음)'
    text = str(value)
    return text if len(text) <= _MAX_SHOWN else text[:_MAX_SHOWN] + '…'


def diff(before, after):
    """두 스냅샷 사이에 무엇이 달라졌나. 사람이 읽을 목록으로.

    변수 id 로 짝지어 본다. 이름이나 기호로 맞추면 **이름을 바꾼 것**과
    **지우고 새로 만든 것**을 구별할 수 없다.
    """
    old = {v['id']: v for v in (before or [])}
    new = {v['id']: v for v in (after or [])}
    changes = []

    for var_id, variable in new.items():
        if var_id not in old:
            changes.append({
                'kind': 'added',
                'variable_id': var_id,
                'label': _label(variable),
                'text': f'변수 추가: {_label(variable)}',
            })

    for var_id, variable in old.items():
        if var_id not in new:
            changes.append({
                'kind': 'removed',
                'variable_id': var_id,
                'label': _label(variable),
                # 지운 변수의 기호를 쓰던 수식은 고쳐지지 않고 깨진다.
                'text': f'변수 삭제: {_label(variable)}',
            })

    for var_id, variable in new.items():
        if var_id not in old:
            continue
        previous = old[var_id]
        for field, field_label in DIFF_FIELDS:
            was, now = previous.get(field), variable.get(field)
            if was == now:
                continue
            if field in _BULKY:
                text = f'{_label(variable)} — {field_label} 바뀜'
            else:
                text = (f'{_label(variable)} — {field_label}: '
                        f'{_shorten(was)} → {_shorten(now)}')
            changes.append({
                'kind': 'changed',
                'variable_id': var_id,
                'label': _label(variable),
                'field': field,
                'text': text,
            })

    return changes


def record(card_id, actor_id, via_token):
    """정의가 바뀌었으면 이력을 남긴다. 안 바뀌었으면 아무것도 하지 않는다.

    돌려주는 것: 남긴 이력 행, 또는 바뀐 것이 없으면 None.
    """
    from .models import CardRevision

    current = snapshot_of(card_id)
    current_json = json.dumps(current, ensure_ascii=False, sort_keys=True)

    latest = (CardRevision.query.filter_by(card_id=card_id)
              .order_by(CardRevision.id.desc()).first())

    if latest is not None and latest.snapshot == current_json:
        # 컨테이너를 드래그했거나, 저장 버튼을 두 번 눌렀거나. 계산은 그대로다.
        return None

    now = datetime.utcnow()

    # 바로 앞 이력 — 묶을 때 무엇과 비교할지 정한다.
    def _previous_of(revision):
        if revision is None:
            return []
        row = (CardRevision.query.filter_by(card_id=card_id)
               .filter(CardRevision.id < revision.id)
               .order_by(CardRevision.id.desc()).first())
        return json.loads(row.snapshot) if row else []

    coalesce = (
        latest is not None
        and latest.changed_by_id == actor_id
        and bool(latest.via_token) == bool(via_token)
        and (now - (latest.updated_at or latest.created_at)) <= COALESCE_WINDOW
    )

    if coalesce:
        # 앞 이력을 갱신한다. 비교 대상은 **그 앞의 앞** 이다 — 방금 묶인 것과
        # 비교하면 "바뀐 것 없음" 이 되어 이력이 내용을 잃는다.
        base = _previous_of(latest)
        latest.snapshot = current_json
        latest.summary = json.dumps(diff(base, current), ensure_ascii=False)
        latest.updated_at = now
        db.session.commit()
        return latest

    base = json.loads(latest.snapshot) if latest is not None else []
    row = CardRevision(
        card_id=card_id,
        snapshot=current_json,
        summary=json.dumps(diff(base, current), ensure_ascii=False),
        changed_by_id=actor_id,
        via_token=bool(via_token),
        created_at=now,
        updated_at=now,
    )
    db.session.add(row)
    db.session.commit()
    return row
