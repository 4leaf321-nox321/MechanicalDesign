"""워크플로의 규칙 — 무엇이 허용되고 무엇이 막히는가.

라우트가 아니라 여기 두는 이유는 카드 삭제 쪽에서도 이 판단이 필요하기 때문이다.
워크플로가 쓰고 있는 카드는 완전 삭제할 수 없어야 하는데, 그 확인은 카드 모듈이
한다 — 규칙이 라우트 안에 있으면 카드 라우트가 워크플로 라우트를 부르게 된다.
"""

import json
import re

from app.extensions import db
from app.modules.cards.models import Card, Variable
from app.shared.errors import AppError

from .models import (
    Workflow, WorkflowGroup, WorkflowLink, WorkflowNode,
)


# --- 이름과 주소 -----------------------------------------------------------------

def make_route(name):
    route = (name or '').strip().lower()
    route = re.sub(r'[^\w\s-]', '', route)
    route = re.sub(r'\s+', '-', route)
    return f'/wf/{route or "workflow"}'


def free_route(name):
    """주소는 유일해야 한다(DB 제약). 겹치면 번호를 붙인다."""
    base = make_route(name)
    taken = {r for (r,) in db.session.query(Workflow.route).all()}
    candidate = base
    n = 2
    while candidate in taken:
        candidate = f'{base}-{n}'
        n += 1
    return candidate


# --- 워크플로 --------------------------------------------------------------------

def create_workflow(name, actor, home_org_slug, description=''):
    name = (name or '').strip()
    if not name:
        raise AppError('MD-WF-0100', '워크플로 이름을 입력해 주세요.')

    wf = Workflow(
        name=name,
        description=(description or '').strip(),
        route=free_route(name),
        sort_order=(db.session.query(db.func.max(Workflow.sort_order)).scalar() or 0) + 1,
        created_by_id=actor.id,
        home_org_slug=home_org_slug,
        # 카드와 같다 — 만든 직후에는 아무도 보지 않았다.
        status='draft',
    )
    db.session.add(wf)
    db.session.commit()
    return wf


def get_visible(workflow_id, actor):
    wf = db.session.get(Workflow, workflow_id)
    if wf is None or not wf.is_visible_to(actor):
        # 있다는 사실 자체를 알려 주지 않는다.
        raise AppError('MD-WF-0101', '워크플로를 찾을 수 없습니다.', status=404)
    return wf


def assert_can_edit(wf, actor):
    if not (actor.is_admin or wf.created_by_id == actor.id):
        raise AppError('MD-WF-0102',
                       '이 워크플로를 만든 사람이나 관리자만 고칠 수 있습니다.',
                       status=403)


# --- 노드 -----------------------------------------------------------------------

def add_node(wf, card_id=None, alias='', layout_x=0, layout_y=0,
             sub_workflow_id=None):
    """한 자리 — **카드 한 장이거나, 워크플로 하나**. 둘 중 하나만.

    둘 다 주면 어느 쪽이 이기는지 알 수 없다. 둘 다 안 주면 빈 자리가 된다.
    조용히 하나를 고르지 않고 막는다.
    """
    if bool(card_id) == bool(sub_workflow_id):
        raise AppError('MD-WF-0114',
                       '카드 하나 또는 워크플로 하나를 지정해 주세요.')

    if sub_workflow_id:
        return _add_sub_workflow(wf, sub_workflow_id, alias, layout_x, layout_y)

    card = db.session.get(Card, card_id)
    if card is None:
        raise AppError('MD-WF-0110', f'카드 {card_id} 를 찾을 수 없습니다.', status=404)
    if card.deleted_at is not None:
        raise AppError('MD-WF-0111',
                       '휴지통에 있는 카드는 넣을 수 없습니다. 먼저 되살려 주세요.',
                       status=409)

    node = WorkflowNode(
        workflow_id=wf.id,
        card_id=card.id,
        # 별칭을 안 주면 카드 이름을 쓴다. 같은 카드를 두 번 넣으면 화면에서
        # 구분이 안 되므로, 두 번째부터는 번호를 붙여 준다.
        alias=(alias or '').strip() or _free_alias(wf, card.name),
        layout_x=int(layout_x or 0),
        layout_y=int(layout_y or 0),
        sort_order=(max([n.sort_order for n in wf.nodes], default=0) + 1),
    )
    db.session.add(node)
    db.session.commit()
    return node


def _add_sub_workflow(wf, sub_id, alias, layout_x, layout_y):
    sub = db.session.get(Workflow, sub_id)
    if sub is None:
        raise AppError('MD-WF-0115',
                       f'워크플로 {sub_id} 를 찾을 수 없습니다.', status=404)
    if sub.deleted_at is not None:
        raise AppError('MD-WF-0116',
                       '휴지통에 있는 워크플로는 넣을 수 없습니다. 먼저 되살려 주세요.',
                       status=409)
    if sub.id == wf.id:
        raise AppError('MD-WF-0117', '자기 자신을 넣을 수 없습니다.')
    if contains(sub, wf.id):
        raise AppError('MD-WF-0118',
                       f"'{sub.name}' 안에 이 워크플로가 이미 들어 있습니다. "
                       '서로를 품으면 펼치는 것부터 끝나지 않습니다.')

    node = WorkflowNode(
        workflow_id=wf.id,
        sub_workflow_id=sub.id,
        alias=(alias or '').strip() or _free_alias(wf, sub.name),
        layout_x=int(layout_x or 0),
        layout_y=int(layout_y or 0),
        sort_order=(max([n.sort_order for n in wf.nodes], default=0) + 1),
    )
    db.session.add(node)
    db.session.commit()
    return node


def contains(wf, target_id, seen=None):
    """이 워크플로 안에 그 워크플로가 (몇 겹이든) 들어 있는가.

    **층을 넘는 순환은 같은 층의 순환과 다르다.** 같은 층은 돌려서 수렴시킬
    수 있지만, 이건 정의가 자기를 부르는 것이라 펼치는 것부터 끝나지 않는다.
    수렴이라는 개념 자체가 없다.

    `seen` 은 자료가 이미 망가진 경우를 위한 것이다 — 막아 두지만 DB 를 손으로
    고친 뒤에도 영영 돌면 안 된다.
    """
    seen = seen if seen is not None else set()
    for node in wf.nodes:
        sub = node.sub_workflow
        if sub is None:
            continue
        if sub.id == target_id:
            return True
        if sub.id in seen:
            continue
        seen.add(sub.id)
        if contains(sub, target_id, seen):
            return True
    return False


#: 펼칠 수 있는 깊이. 순환은 막지만, 깊이 자체가 실수일 수 있다 — 서른 겹
#: 워크플로는 사람이 읽을 수 있는 물건이 아니다.
MAX_DEPTH = 12


def expand(wf, depth=0):
    """하위 워크플로를 노드 안에 통째로 실어 내려보낸다.

    화면이 층마다 따로 부르게 두면, 그중 하나가 늦게 와서 그림이 반쯤 그려진
    상태가 생긴다. 한 번에 다 준다.
    """
    body = wf.to_dict(full=True)
    if depth >= MAX_DEPTH:
        # 여기서 멈춘 자리는 화면이 「너무 깊습니다」 로 말한다.
        body['too_deep'] = True
        return body
    for node, row in zip(wf.nodes, body['nodes']):
        if node.sub_workflow is not None:
            row['sub_workflow'] = expand(node.sub_workflow, depth + 1)
    return body


def _free_alias(wf, base):
    taken = {n.alias for n in wf.nodes}
    if base not in taken:
        return base
    n = 2
    while f'{base} {n}' in taken:
        n += 1
    return f'{base} {n}'


def remove_node(wf, node_id):
    """노드를 뺀다. **그 노드에 닿은 연결도 함께 사라진다.**

    연결만 남으면 없는 자리를 가리키게 되고, 그것은 고칠 방법이 화면에 없는
    상태다. 몇 개가 함께 사라지는지 돌려주어 화면이 말할 수 있게 한다.
    """
    node = db.session.get(WorkflowNode, node_id)
    if node is None or node.workflow_id != wf.id:
        raise AppError('MD-WF-0112', '그 노드를 찾을 수 없습니다.', status=404)

    dropped = (WorkflowLink.query
               .filter(WorkflowLink.workflow_id == wf.id,
                       db.or_(WorkflowLink.from_node_id == node_id,
                              WorkflowLink.to_node_id == node_id))
               .count())
    db.session.delete(node)
    db.session.commit()
    return dropped


def set_node_inputs(wf, node_id, values):
    """이 자리의 입력값을 저장한다. 워크플로가 곧 하나의 설계안이 되도록."""
    node = db.session.get(WorkflowNode, node_id)
    if node is None or node.workflow_id != wf.id:
        raise AppError('MD-WF-0112', '그 노드를 찾을 수 없습니다.', status=404)
    if not isinstance(values, dict):
        raise AppError('MD-WF-0113', '입력값은 {변수id: 값} 형태여야 합니다.')

    node.inputs = json.dumps(values, ensure_ascii=False)
    db.session.commit()
    return node



# --- 묶음 -----------------------------------------------------------------------

def _group_of(wf, group_id):
    group = db.session.get(WorkflowGroup, group_id)
    if group is None or group.workflow_id != wf.id:
        raise AppError('MD-WF-0130', '그 묶음을 찾을 수 없습니다.', status=404)
    return group


def _assign(wf, group, node_ids):
    """이 묶음에 들 노드를 정한다.

    **한 노드는 한 묶음에만 든다.** 다른 묶음에 있던 노드를 넣으면 그쪽에서
    빠진다 — 겹치는 묶음을 허용하면 상자가 서로를 가로질러 그려져서 그림이
    오히려 안 읽힌다.

    남의 워크플로 노드를 끌어오려는 요청은 조용히 무시하지 않고 막는다. 무시하면
    「묶었는데 안 들어갔다」 가 되고, 사람은 화면을 새로 고쳐 봐야 그것을 안다.
    """
    if node_ids is None:
        return
    if not isinstance(node_ids, (list, tuple)):
        raise AppError('MD-WF-0131', 'node_ids 는 목록이어야 합니다.')

    wanted = {int(n) for n in node_ids}
    mine = {n.id for n in wf.nodes}
    stray = wanted - mine
    if stray:
        raise AppError('MD-WF-0132',
                       f'이 워크플로에 없는 노드가 있습니다: {sorted(stray)}')

    for node in wf.nodes:
        if node.id in wanted:
            node.group_id = group.id
        elif node.group_id == group.id:
            # 이번 목록에 없으면 이 묶음에서 뺀다.
            node.group_id = None


def create_group(wf, name, color=None, node_ids=None):
    group = WorkflowGroup(
        workflow_id=wf.id,
        name=(name or '').strip() or '묶음',
        color=(color or '#6c5ce7'),
        sort_order=(max([g.sort_order for g in wf.groups], default=0) + 1),
    )
    db.session.add(group)
    db.session.flush()          # group.id 가 있어야 노드를 붙일 수 있다
    _assign(wf, group, node_ids or [])
    db.session.commit()
    return group


def update_group(wf, group_id, data):
    group = _group_of(wf, group_id)
    if 'name' in data:
        group.name = (data.get('name') or '').strip() or group.name
    if 'color' in data:
        group.color = data.get('color') or group.color
    if 'node_ids' in data:
        _assign(wf, group, data.get('node_ids'))
    db.session.commit()
    return group


def remove_group(wf, group_id):
    """묶음을 푼다. **노드는 남는다.**

    상자를 지우는 것은 「이렇게 보지 않겠다」 는 뜻이다. 노드까지 사라지면
    화면을 정리하려다 계산을 잃는다.
    """
    group = _group_of(wf, group_id)
    for node in wf.nodes:
        if node.group_id == group.id:
            node.group_id = None
    db.session.delete(group)
    db.session.commit()


# --- 연결 -----------------------------------------------------------------------

def add_link(wf, from_node_id, from_variable_id, to_node_id, to_variable_id,
             from_inner_node_id=None, to_inner_node_id=None):
    """배선 하나. 여기서 막는 것이 이 기능의 안전장치 전부다.

    하위 워크플로가 양 끝에 오면 **그 안의 어느 자리**인지까지 받는다. 카드
    노드에서는 자기 자신을 적는다 — 비워 두면 유일 제약이 NULL 을 안 세서
    「한 입력에 연결 하나」 가 조용히 뚫린다.
    """
    src = _node_of(wf, from_node_id)
    dst = _node_of(wf, to_node_id)

    from_inner = _inner_node(src, from_inner_node_id)
    to_inner = _inner_node(dst, to_inner_node_id)

    from_var = _variable_of(from_inner, from_variable_id)
    to_var = _variable_of(to_inner, to_variable_id)

    # 나가는 쪽은 계산된 값이어야 한다. 입력을 입력에 잇는 것은 값을 옮기는
    # 것이 아니라 같은 값을 두 번 적는 것이라, 워크플로가 할 일이 아니다.
    if from_var.category == 'input':
        raise AppError('MD-WF-0121',
                       f"'{from_var.name}' 은(는) 입력값입니다. "
                       '계산 결과(중간값·결과값)만 다음 카드로 보낼 수 있습니다.')
    # 들어오는 쪽은 입력이어야 한다. 계산되는 칸에 값을 밀어 넣으면 그 카드의
    # 수식이 무시되는데, 화면에는 수식이 그대로 보여서 아무도 눈치채지 못한다.
    if to_var.category != 'input':
        raise AppError('MD-WF-0122',
                       f"'{to_var.name}' 은(는) 계산되는 값입니다. "
                       '입력값에만 연결할 수 있습니다.')

    existing = WorkflowLink.query.filter_by(
        to_node_id=dst.id, to_inner_node_id=to_inner.id,
        to_variable_id=to_var.id).first()
    if existing is not None:
        raise AppError('MD-WF-0123',
                       f"'{to_var.name}' 에는 이미 연결이 있습니다. "
                       '한 입력에는 하나만 이을 수 있습니다 — 먼저 끊어 주세요.',
                       status=409)

    # **순환을 막지 않는다.** 서로 물고 있는 모델은 기계 설계에 실제로 있고
    # (축 지름 → 자중 → 하중 → 축 지름), 그것을 푸는 것이 반복 블록이다.
    # 영영 도는 실행이 무서워 막았던 것인데, 이제 반복 한도가 그 일을 한다.
    # 어디가 고리인지, 어디에 초기 추정값이 필요한지는 계산하는 쪽이 판단한다.

    link = WorkflowLink(
        workflow_id=wf.id,
        from_node_id=src.id, from_inner_node_id=from_inner.id,
        from_variable_id=from_var.id,
        from_label=_label(from_var),
        to_node_id=dst.id, to_inner_node_id=to_inner.id,
        to_variable_id=to_var.id,
        to_label=_label(to_var),
    )
    db.session.add(link)
    db.session.commit()
    return link


def remove_link(wf, link_id):
    link = db.session.get(WorkflowLink, link_id)
    if link is None or link.workflow_id != wf.id:
        raise AppError('MD-WF-0124', '그 연결을 찾을 수 없습니다.', status=404)
    db.session.delete(link)
    db.session.commit()


def _label(variable):
    return (f'{variable.name} ({variable.symbol})'
            if variable.symbol else variable.name)


def _inner_node(node, inner_id):
    """배선이 실제로 닿는 자리.

    카드 노드면 자기 자신, 하위 워크플로면 그 안의 노드다. 안쪽 노드는 몇 겹
    아래일 수 있어서 깊이를 재귀로 훑는다 — 얼굴이 그렇게 올라오기 때문이다.
    """
    if node.sub_workflow is None:
        if inner_id not in (None, node.id):
            raise AppError('MD-WF-0119',
                           '카드 노드에는 안쪽 자리가 없습니다.')
        return node

    if inner_id is None:
        raise AppError('MD-WF-0127',
                       f"'{node.alias}' 는 워크플로입니다. "
                       '그 안의 어느 자리인지 함께 지정해 주세요.')

    found = _find_within(node.sub_workflow, inner_id)
    if found is None:
        raise AppError('MD-WF-0128',
                       f"'{node.alias}' 안에서 그 자리를 찾을 수 없습니다.",
                       status=404)
    return found


def _find_within(wf, node_id, seen=None):
    seen = seen if seen is not None else set()
    for node in wf.nodes:
        if node.id == node_id:
            return node
        if node.sub_workflow is None or node.sub_workflow.id in seen:
            continue
        seen.add(node.sub_workflow.id)
        found = _find_within(node.sub_workflow, node_id, seen)
        if found is not None:
            return found
    return None


def _node_of(wf, node_id):
    node = db.session.get(WorkflowNode, node_id)
    if node is None or node.workflow_id != wf.id:
        raise AppError('MD-WF-0112', '그 노드를 찾을 수 없습니다.', status=404)
    return node


def _variable_of(node, variable_id):
    variable = db.session.get(Variable, variable_id)
    if variable is None or variable.card_id != node.card_id:
        raise AppError('MD-WF-0125',
                       f"변수 {variable_id} 는 '{node.alias}' 의 카드에 없습니다.",
                       status=404)
    return variable


def set_iteration(wf, data):
    """반복 설정. **범위를 좁게 막는다.**

    계산은 브라우저에서 돌아서, 반복 한도에 100000 이 들어가면 그 워크플로를 연
    사람의 화면이 통째로 멎는다. 오타 하나가 그렇게 된다.

    완화계수는 0 < w <= 2 다. 2 를 넘으면 보폭이 너무 커져 잡히던 고리도 튀고,
    0 이면 값이 영영 안 움직여 「수렴」 처럼 보인다 — 후자가 더 나쁘다.
    """
    def number(key, low, high, whole=False):
        if key not in data:
            return None
        try:
            value = int(data[key]) if whole else float(data[key])
        except (TypeError, ValueError):
            raise AppError('MD-WF-0130', f'{key} 에는 숫자를 넣어 주세요.')
        if not (low <= value <= high):
            raise AppError('MD-WF-0131',
                           f'{key} 는 {low} 이상 {high} 이하여야 합니다.')
        return value

    tolerance = number('iter_tolerance', 1e-12, 0.1)
    if tolerance is not None:
        wf.iter_tolerance = tolerance

    limit = number('iter_max', 1, 500, whole=True)
    if limit is not None:
        wf.iter_max = limit

    relaxation = number('iter_relaxation', 0.01, 2.0)
    if relaxation is not None:
        wf.iter_relaxation = relaxation


# --- 카드 삭제 보호 ---------------------------------------------------------------

def workflows_using_workflow(workflow_id):
    """이 워크플로를 노드로 품고 있는 워크플로 이름들. 휴지통에 있는 것도 센다.

    카드와 **같은 규칙**이다. 규칙을 따로 쓰지 않는 것이 중요하다 — 두 벌이 되면
    한쪽만 고치는 날이 오고, 그때 새는 쪽은 아무 오류도 내지 않는다.

    DB 에도 `RESTRICT` 가 걸려 있지만 그건 마지막 방어선이다. 거기까지 가면
    사람은 「무결성 제약 위반」 이라는 말을 보게 되고, 무엇을 먼저 치워야 하는지
    알 수 없다.
    """
    rows = (db.session.query(Workflow.name, Workflow.deleted_at)
            .join(WorkflowNode, WorkflowNode.workflow_id == Workflow.id)
            .filter(WorkflowNode.sub_workflow_id == workflow_id)
            .distinct().all())
    return [f'{name} (휴지통)' if deleted_at else name
            for name, deleted_at in rows]


def workflows_using_card(card_id):
    """이 카드를 쓰고 있는 워크플로 이름들. 휴지통에 있는 것도 센다.

    카드를 완전 삭제하면 그 자리가 통째로 뜻을 잃는다. 조직을 지울 때와 같은
    판단을 쓴다 — 막고, 무엇을 잃는지 이름으로 말해 주고, 사람이 정하게 한다.

    **휴지통에 있는 워크플로도 세는 이유**: 그것은 되살릴 수 있다. 빼놓고 카드를
    지우면, 되살린 순간 노드가 없는 카드를 가리키는 워크플로가 된다 — 그때는
    무엇이 있었는지 알 방법이 없다. 이름 옆에 '(휴지통)' 을 붙여, 무엇을 먼저
    비워야 하는지 사람이 알게 한다.
    """
    rows = (db.session.query(Workflow.name, Workflow.deleted_at)
            .join(WorkflowNode, WorkflowNode.workflow_id == Workflow.id)
            .filter(WorkflowNode.card_id == card_id)
            .distinct().all())
    return [f'{name} (휴지통)' if deleted_at else name
            for name, deleted_at in rows]
