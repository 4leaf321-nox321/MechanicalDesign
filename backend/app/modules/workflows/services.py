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

from .models import Workflow, WorkflowLink, WorkflowNode


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

def add_node(wf, card_id, alias='', layout_x=0, layout_y=0):
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


# --- 연결 -----------------------------------------------------------------------

def add_link(wf, from_node_id, from_variable_id, to_node_id, to_variable_id):
    """배선 하나. 여기서 막는 것이 이 기능의 안전장치 전부다."""
    src = _node_of(wf, from_node_id)
    dst = _node_of(wf, to_node_id)

    if src.id == dst.id:
        raise AppError('MD-WF-0120', '같은 노드끼리는 이을 수 없습니다.')

    from_var = _variable_of(src, from_variable_id)
    to_var = _variable_of(dst, to_variable_id)

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

    existing = WorkflowLink.query.filter_by(to_node_id=dst.id,
                                            to_variable_id=to_var.id).first()
    if existing is not None:
        raise AppError('MD-WF-0123',
                       f"'{to_var.name}' 에는 이미 연결이 있습니다. "
                       '한 입력에는 하나만 이을 수 있습니다 — 먼저 끊어 주세요.',
                       status=409)

    _assert_no_cycle(wf, src.id, dst.id)

    link = WorkflowLink(
        workflow_id=wf.id,
        from_node_id=src.id, from_variable_id=from_var.id,
        from_label=_label(from_var),
        to_node_id=dst.id, to_variable_id=to_var.id,
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


def _assert_no_cycle(wf, from_node_id, to_node_id):
    """A → B 를 이었을 때 되돌아오는 길이 생기는지 본다.

    막지 않으면 실행할 때 **영영 끝나지 않거나** 순서를 정할 수 없다. 조직 트리
    에서 푼 것과 같은 문제이고, 여기서는 값이 흐르는 방향이 화살표다.
    """
    edges = {}
    for link in WorkflowLink.query.filter_by(workflow_id=wf.id).all():
        edges.setdefault(link.from_node_id, set()).add(link.to_node_id)
    edges.setdefault(from_node_id, set()).add(to_node_id)

    # to 에서 출발해 from 으로 돌아올 수 있으면 순환이다.
    seen, stack = set(), [to_node_id]
    while stack:
        cur = stack.pop()
        if cur == from_node_id:
            raise AppError('MD-WF-0126',
                           '순환 연결입니다 — 값이 돌아와 자기 자신을 다시 정하게 됩니다.')
        if cur in seen:
            continue
        seen.add(cur)
        stack.extend(edges.get(cur, ()))


def topological_order(wf):
    """실행 순서. 순환이 있으면 `None`.

    저장할 때 순환을 막지만 여기서도 확인한다 — 사람이 DB 를 직접 고치거나,
    막는 규칙에 구멍이 있었을 때 **영영 끝나지 않는 실행**보다는 오류가 낫다.
    """
    nodes = [n.id for n in wf.nodes]
    incoming = {nid: 0 for nid in nodes}
    edges = {nid: set() for nid in nodes}

    for link in wf.links:
        if link.from_node_id in edges and link.to_node_id in incoming:
            if link.to_node_id not in edges[link.from_node_id]:
                edges[link.from_node_id].add(link.to_node_id)
                incoming[link.to_node_id] += 1

    ready = sorted([nid for nid, n in incoming.items() if n == 0])
    order = []
    while ready:
        cur = ready.pop(0)
        order.append(cur)
        for nxt in sorted(edges[cur]):
            incoming[nxt] -= 1
            if incoming[nxt] == 0:
                ready.append(nxt)

    return order if len(order) == len(nodes) else None


# --- 카드 삭제 보호 ---------------------------------------------------------------

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
