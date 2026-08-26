"""개정 이력 — 이 워크플로가 언제 누구에 의해 어떻게 바뀌었나.

카드에는 이미 있고 워크플로에는 없었다. 중첩·묶음·반복 기준까지 생긴 지금
워크플로는 카드 못지않게 큰 물건인데, 「누가 언제 이 배선을 바꿨나」 를 물을
방법이 없었다. 답이 어제와 다른데 아무도 손댄 기억이 없을 때 되짚을 자리가
없다는 뜻이다.

카드 쪽 `cards/revisions.py` 와 **같은 판단들**을 그대로 따른다. 두 이력이 서로
다른 규칙으로 움직이면, 화면에서 나란히 보이는 두 목록이 서로 다른 것을 뜻하게
된다.

**정의를 통째로 뜬다.** 변경 로그가 아니라 그때의 배선 전부를 남긴다. 로그만
있으면 그 시점의 모습을 되짚으려고 변경을 거꾸로 적용해야 하는데, 그 재구성은
한 번만 어긋나도 조용히 틀린 답을 준다.

**답을 바꿀 수 있는 것만 뜬다.** 좌표와 묶음은 뺀다 — 노드를 끌어 옮기거나
상자를 두른 것은 계산을 바꾸지 않는다. 그것까지 이력에 넣으면 드래그 몇 번에
이력이 묻히고, 정작 수식이 흐르는 길이 바뀐 한 줄을 못 찾는다. 이름과 설명도
뺀다. 같은 이유다.

**입력값은 뜬다.** 카드에서는 값이 계산 기록에 살지만, 워크플로에서는 값이
워크플로에 저장된다 — 워크플로 하나가 곧 하나의 설계안이다. 그래서 「누가 두께를
32로 바꿨나」 가 여기서 답해져야 한다.

**되돌리기는 없다.** 카드에는 있지만 여기서는 안 된다. 되돌리려면 노드를 지우고
다시 만들어야 하는데 그러면 노드 id 가 바뀌고, 이 워크플로를 품고 있는 바깥
워크플로의 배선은 **안쪽 노드 id 를 가리킨다**. 되돌리는 순간 그 배선들이 없는
자리를 가리키게 되고, 그것은 아무 오류도 내지 않는다. 되돌리기를 만들려면 id 를
지키며 제자리에서 고치는 길을 따로 내야 한다.
"""

import json
from datetime import datetime, timedelta

from app.extensions import db

#: 같은 사람이 이어서 고치는 동안은 한 이력으로 묶는다.
#:
#: 순서도에서 값 하나 고칠 때마다 요청이 한 번 나간다. 그대로 쌓으면 「값 30 →
#: 31 → 32」 가 세 줄이 되고, 이력을 사람이 읽을 수 없다 — 읽을 수 없는 이력은
#: 없는 것과 같다. 카드와 같은 창을 쓴다.
COALESCE_WINDOW = timedelta(minutes=5)

#: 되먹임 반복의 기준. 값이 아니라 **계산 방법**이라 따로 견준다.
ITERATION_FIELDS = (
    ('tolerance', '허용오차'),
    ('max', '최대 반복'),
    ('relaxation', '완화계수'),
)

#: 하위 워크플로를 몇 겹까지 파고들어 이름을 모을까. 실행기와 같은 한도.
MAX_DEPTH = 12

_MAX_SHOWN = 80


def _variable_label(variable):
    symbol = (variable.symbol or '').strip()
    return f'{variable.name} ({symbol})' if symbol else variable.name


def _labels_for(node, depth=0):
    """이 노드의 입력 칸 이름표 — `{자리이름: '무게 (m)'}`.

    스냅샷에 **이름을 베껴 둔다.** 값만 남기면 나중에 이력을 열었을 때
    「191번 칸: 50 → 60」 밖에 못 말한다. 카드가 지워졌거나 변수 이름이 바뀐
    뒤라면 더더욱 되짚을 방법이 없다. 배선이 `from_label` 을 베껴 두는 것과
    똑같은 이유다.
    """
    from app.modules.cards.models import Variable

    if node.sub_workflow_id is not None:
        if depth >= MAX_DEPTH or node.sub_workflow is None:
            return {}
        out = {}
        for inner in node.sub_workflow.nodes:
            for key, label in _labels_for(inner, depth + 1).items():
                # 안쪽 자리는 `안쪽노드:변수id` 로 적힌다. 한 겹 더 들어가면
                # 맨 안쪽 노드를 그대로 쓴다 — 실행기와 같은 규칙이다.
                out[key if ':' in key else f'{inner.id}:{key}'] = label
        return out

    rows = Variable.query.filter_by(card_id=node.card_id).all()
    return {str(v.id): _variable_label(v) for v in rows}


def snapshot_of(workflow):
    """지금 이 워크플로의 배선과 값 전부."""
    return {
        'iteration': {
            'tolerance': workflow.iter_tolerance,
            'max': workflow.iter_max,
            'relaxation': workflow.iter_relaxation,
        },
        'nodes': [{
            'id': n.id,
            'alias': n.alias or '',
            'card_id': n.card_id,
            'card_name': n.card.name if n.card else None,
            'sub_workflow_id': n.sub_workflow_id,
            'sub_workflow_name': n.sub_workflow.name if n.sub_workflow else None,
            # `inputs` 칼럼은 JSON **문자열**이다. 그대로 담으면 견줄 때 글자
            # 하나씩 비교하게 된다.
            'inputs': n.input_values(),
            'labels': _labels_for(n),
        } for n in sorted(workflow.nodes, key=lambda n: n.id)],
        'links': [{
            'id': l.id,
            'from_node_id': l.from_node_id,
            'from_inner_node_id': l.from_inner_node_id,
            'from_variable_id': l.from_variable_id,
            'from_label': l.from_label,
            'to_node_id': l.to_node_id,
            'to_inner_node_id': l.to_inner_node_id,
            'to_variable_id': l.to_variable_id,
            'to_label': l.to_label,
        } for l in sorted(workflow.links, key=lambda l: l.id)],
    }


def _shorten(value):
    if value is None or value == '':
        return '(없음)'
    text = str(value)
    return text if len(text) <= _MAX_SHOWN else text[:_MAX_SHOWN] + '…'


def _node_name(node):
    alias = (node.get('alias') or '').strip()
    if alias:
        return alias
    return node.get('card_name') or node.get('sub_workflow_name') or f"노드 {node.get('id')}"


def _wire(link):
    return (f"{link.get('from_label') or '값'} → {link.get('to_label') or '입력'}")


def _points_at(node):
    """이 자리가 무엇을 가리키나 — 카드 한 장인가, 워크플로 통째인가."""
    if node.get('sub_workflow_id') is not None:
        return f"워크플로 '{node.get('sub_workflow_name') or node['sub_workflow_id']}'"
    return f"카드 '{node.get('card_name') or node.get('card_id')}'"


def diff(before, after):
    """두 스냅샷 사이에 무엇이 달라졌나. 사람이 읽을 목록으로.

    노드도 배선도 **id 로 짝짓는다.** 이름으로 맞추면 별칭을 바꾼 것과 빼고 새로
    넣은 것을 구별할 수 없다 — 카드가 변수 id 로 짝짓는 것과 같다.
    """
    before = before or {}
    after = after or {}
    changes = []

    old_nodes = {n['id']: n for n in before.get('nodes') or []}
    new_nodes = {n['id']: n for n in after.get('nodes') or []}

    for node_id, node in new_nodes.items():
        if node_id not in old_nodes:
            changes.append({
                'kind': 'added', 'node_id': node_id,
                'text': f'자리 추가: {_node_name(node)} — {_points_at(node)}',
            })
            # 놓자마자 값을 채우는 것이 보통이고, 그 둘은 한 이력으로 묶인다.
            # 「자리 추가」 만 적으면 **정작 무엇을 넣었는지**가 빠진다.
            labels = node.get('labels') or {}
            for key, value in sorted((node.get('inputs') or {}).items(), key=str):
                if value in (None, ''):
                    continue
                changes.append({
                    'kind': 'value', 'node_id': node_id, 'key': key,
                    'text': (f'{_node_name(node)} — {labels.get(key, key)}: '
                             f'{_shorten(value)}'),
                })

    for node_id, node in old_nodes.items():
        if node_id not in new_nodes:
            changes.append({
                'kind': 'removed', 'node_id': node_id,
                # 자리를 빼면 거기 닿았던 배선도 함께 사라진다.
                'text': f'자리 삭제: {_node_name(node)} — {_points_at(node)}',
            })

    for node_id, node in new_nodes.items():
        was = old_nodes.get(node_id)
        if was is None:
            continue

        if (was.get('alias') or '') != (node.get('alias') or ''):
            changes.append({
                'kind': 'changed', 'node_id': node_id,
                'text': f"이름: {_shorten(was.get('alias'))} → {_shorten(node.get('alias'))}",
            })

        if (was.get('card_id'), was.get('sub_workflow_id')) != \
           (node.get('card_id'), node.get('sub_workflow_id')):
            changes.append({
                'kind': 'changed', 'node_id': node_id,
                'text': (f'{_node_name(node)} — 가리키는 것이 바뀜: '
                         f'{_points_at(was)} → {_points_at(node)}'),
            })

        # 값. 이름표는 **새 쪽을 먼저** 본다 — 변수 이름이 바뀌었으면 지금 이름으로
        # 말해 주는 편이 찾기 쉽다.
        old_values = was.get('inputs') or {}
        new_values = node.get('inputs') or {}
        labels = {**(was.get('labels') or {}), **(node.get('labels') or {})}
        for key in sorted(set(old_values) | set(new_values), key=str):
            a, b = old_values.get(key), new_values.get(key)
            if a == b:
                continue
            changes.append({
                'kind': 'value', 'node_id': node_id, 'key': key,
                'text': (f'{_node_name(node)} — {labels.get(key, key)}: '
                         f'{_shorten(a)} → {_shorten(b)}'),
            })

    old_links = {l['id']: l for l in before.get('links') or []}
    new_links = {l['id']: l for l in after.get('links') or []}

    for link_id, link in new_links.items():
        if link_id not in old_links:
            changes.append({
                'kind': 'added', 'link_id': link_id,
                'text': f'연결 추가: {_wire(link)}',
            })
    for link_id, link in old_links.items():
        if link_id not in new_links:
            changes.append({
                'kind': 'removed', 'link_id': link_id,
                'text': f'연결 끊김: {_wire(link)}',
            })

    old_iter = before.get('iteration') or {}
    new_iter = after.get('iteration') or {}
    for field, label in ITERATION_FIELDS:
        a, b = old_iter.get(field), new_iter.get(field)
        if a == b or (a is None and not before):
            continue
        changes.append({
            'kind': 'iteration', 'field': field,
            # 반복 기준이 바뀌면 **같은 입력으로도 답이 달라진다.** 값 변경과
            # 나란히 놓아야 「왜 어제와 다르지」 가 한 목록에서 풀린다.
            'text': f'반복 기준 — {label}: {_shorten(a)} → {_shorten(b)}',
        })

    return changes


def record(workflow, actor_id, via_token=False):
    """배선이나 값이 바뀌었으면 이력을 남긴다. 안 바뀌었으면 아무것도 안 한다.

    **어떤 요청이 정의를 바꾸는지 목록으로 관리하지 않는다.** 목록은 언젠가
    빠뜨리고, 빠뜨린 자리는 아무 오류도 내지 않는다. 비교가 알아서 판단한다.
    """
    from .models import WorkflowRevision

    current = snapshot_of(workflow)
    current_json = json.dumps(current, ensure_ascii=False, sort_keys=True)

    latest = (WorkflowRevision.query.filter_by(workflow_id=workflow.id)
              .order_by(WorkflowRevision.id.desc()).first())

    if latest is not None and latest.snapshot == current_json:
        # 노드를 끌어 옮겼거나 상자를 둘렀거나. 계산은 그대로다.
        return None

    now = datetime.utcnow()

    def _previous_of(revision):
        row = (WorkflowRevision.query.filter_by(workflow_id=workflow.id)
               .filter(WorkflowRevision.id < revision.id)
               .order_by(WorkflowRevision.id.desc()).first())
        return json.loads(row.snapshot) if row else {}

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

    base = json.loads(latest.snapshot) if latest is not None else {}
    row = WorkflowRevision(
        workflow_id=workflow.id,
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
