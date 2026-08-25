"""워크플로 API.

카드와 같은 규칙을 **재사용**한다 — 초안·휴지통·조직 게시가 전부 카드에서
쓰던 것과 같은 뜻이다. 규칙을 새로 쓰지 않는 것이 중요하다. 두 벌이 되면 한쪽만
고치는 날이 오고, 그때 새는 쪽은 아무 오류도 내지 않는다.
"""

from datetime import datetime

from flask import Blueprint, g, jsonify, request

from app.extensions import db
from app.modules.orgs import services as org_services
from app.modules.orgs.models import Organization
from app.shared.auth import current_user
from app.shared.errors import AppError

from . import services
from .models import Workflow, WorkflowMount, WorkflowNode

workflows_bp = Blueprint('workflows', __name__)


def _acting_via_token():
    return bool(getattr(g, 'via_token', False))


# --- 목록과 하나 ------------------------------------------------------------------

@workflows_bp.route('', methods=['GET'])
def list_workflows():
    """`?org=` 는 카드 목록과 같은 뜻이다. 없으면 게시된 것만."""
    actor = current_user()
    query = Workflow.query.filter(Workflow.deleted_at.is_(None))

    keyword = (request.args.get('q') or '').strip()
    if keyword:
        # **검색은 자리를 가리지 않는다** — 카드와 같은 판단이다. 검색이 카드와
        # 워크플로로 갈라지면, 어느 쪽에 있는지 모르는 사람이 두 번 찾게 된다.
        like = f'%{keyword}%'
        rows = (query.filter(db.or_(Workflow.status != 'draft',
                                    Workflow.created_by_id == actor.id))
                .filter(db.or_(Workflow.name.ilike(like),
                               Workflow.description.ilike(like)))
                .order_by(Workflow.sort_order, Workflow.created_at)
                .limit(200).all())
        lowered = keyword.lower()
        out = []
        for wf in rows:
            body = wf.to_dict()
            why = []
            if lowered in (wf.name or '').lower():
                why.append('이름')
            if lowered in (wf.description or '').lower():
                why.append('설명')
            body['match'] = why
            out.append(body)
        return jsonify(out)

    org_slug = (request.args.get('org') or '').strip()
    if org_slug:
        org = db.session.get(Organization, org_slug)
        if org is None:
            raise AppError('MD-ORG-0104', f"조직 '{org_slug}' 을 찾을 수 없습니다.",
                           status=404)
        if org.kind == 'personal':
            if org.owner_user_id != actor.id and not actor.is_admin:
                raise AppError('MD-ORG-0109', '다른 사람의 개인 공간은 볼 수 없습니다.',
                               status=403)
            query = query.filter(Workflow.home_org_slug == org_slug)
        else:
            slugs = org_services.descendant_slugs(org_slug)
            query = (query.join(WorkflowMount, WorkflowMount.workflow_id == Workflow.id)
                          .filter(WorkflowMount.org_slug.in_(slugs)).distinct())
    else:
        query = query.filter(Workflow.status != 'draft')

    rows = query.order_by(Workflow.sort_order, Workflow.created_at).all()
    return jsonify([w.to_dict() for w in rows])


@workflows_bp.route('/trash', methods=['GET'])
def list_trash():
    actor = current_user()
    query = Workflow.query.filter(Workflow.deleted_at.isnot(None))
    if not actor.is_admin:
        query = query.filter(Workflow.created_by_id == actor.id)
    rows = query.order_by(Workflow.deleted_at.desc()).all()
    return jsonify([w.to_dict() for w in rows])


@workflows_bp.route('/lookup', methods=['GET'])
def lookup_workflow():
    """주소로 워크플로 하나. 카드의 `/cards/lookup` 과 같은 이유로 있다 —
    목록에 보일 것과 열 수 있는 것은 다른 질문이다."""
    route = (request.args.get('route') or '').strip()
    if not route:
        raise AppError('MD-WF-0140', 'route 를 지정해 주세요.')

    wf = Workflow.query.filter_by(route=route).first()
    if wf is None or not wf.is_visible_to(current_user()):
        raise AppError('MD-WF-0101', '워크플로를 찾을 수 없습니다.', status=404)

    return jsonify(wf.to_dict(full=True))


@workflows_bp.route('/<int:workflow_id>', methods=['GET'])
def get_workflow(workflow_id):
    """노드와 연결까지 한 번에.

    따로 부르게 두지 않는 이유는 셋이 서로를 참조하기 때문이다 — 연결은 노드를
    가리키고 노드는 카드를 가리킨다. 세 번 부르게 하면 그중 하나가 낡은 채로
    화면이 그려지는 순간이 생긴다.
    """
    # **실행 순서는 여기서 정하지 않는다.** 순환을 허용한 뒤로 순서는
    # 「블록으로 묶고 그 안에서 반복」 이라는 규칙이 되었고, 그 규칙은
    # 계산기가 안다. 서버가 같은 것을 다른 말로 한 번 더 구현하면 두 벌이
    # 되고, 두 벌은 반드시 어긋난다 — 그때 새는 쪽은 오류를 내지 않는다.
    wf = services.get_visible(workflow_id, current_user())
    return jsonify(wf.to_dict(full=True))


@workflows_bp.route('', methods=['POST'])
def create_workflow():
    actor = current_user()
    data = request.get_json() or {}
    home = org_services.ensure_personal_org(actor)
    wf = services.create_workflow(data.get('name'), actor, home.slug,
                                  data.get('description', ''))
    return jsonify(wf.to_dict()), 201


@workflows_bp.route('/<int:workflow_id>', methods=['PUT'])
def update_workflow(workflow_id):
    actor = current_user()
    wf = services.get_visible(workflow_id, actor)
    services.assert_can_edit(wf, actor)

    data = request.get_json() or {}
    if 'name' in data:
        name = (data.get('name') or '').strip()
        if not name:
            raise AppError('MD-WF-0100', '워크플로 이름을 입력해 주세요.')
        wf.name = name
    if 'description' in data:
        wf.description = (data.get('description') or '').strip()
    if 'color' in data:
        wf.color = data.get('color') or '#6c5ce7'
    services.set_iteration(wf, data)

    # 이름을 고쳐도 주소는 그대로 둔다 — 바꾸면 저장해 둔 링크가 죽는다.
    db.session.commit()
    return jsonify(wf.to_dict())


@workflows_bp.route('/<int:workflow_id>', methods=['DELETE'])
def delete_workflow(workflow_id):
    """휴지통으로. 카드와 같다."""
    actor = current_user()
    wf = services.get_visible(workflow_id, actor)
    if not wf.can_manage_trash(actor):
        raise AppError('MD-WF-0102', '만든 사람이나 관리자만 지울 수 있습니다.',
                       status=403)
    if wf.is_deleted:
        return jsonify({'message': '이미 휴지통에 있습니다.'}), 200

    wf.deleted_at = datetime.utcnow()
    wf.deleted_by_id = actor.id
    db.session.commit()
    return jsonify({'workflow': wf.to_dict(), 'message': '휴지통으로 옮겼습니다.'})


@workflows_bp.route('/<int:workflow_id>/restore', methods=['POST'])
def restore_workflow(workflow_id):
    actor = current_user()
    wf = services.get_visible(workflow_id, actor)
    if not wf.can_manage_trash(actor):
        raise AppError('MD-WF-0102', '만든 사람이나 관리자만 되살릴 수 있습니다.',
                       status=403)
    if not wf.is_deleted:
        raise AppError('MD-WF-0103', '휴지통에 있는 워크플로가 아닙니다.', status=409)

    wf.deleted_at = None
    wf.deleted_by_id = None
    db.session.commit()
    return jsonify({'workflow': wf.to_dict(), 'message': '되살렸습니다.'})


@workflows_bp.route('/<int:workflow_id>/permanent', methods=['DELETE'])
def purge_workflow(workflow_id):
    actor = current_user()
    wf = services.get_visible(workflow_id, actor)
    if not wf.can_manage_trash(actor):
        raise AppError('MD-WF-0102', '만든 사람이나 관리자만 지울 수 있습니다.',
                       status=403)
    if not wf.is_deleted:
        raise AppError('MD-WF-0104',
                       '먼저 휴지통으로 옮긴 뒤에 완전 삭제할 수 있습니다.', status=409)

    db.session.delete(wf)
    db.session.commit()
    return jsonify({'message': '완전히 삭제되었습니다.'}), 200


# --- 게시 ------------------------------------------------------------------------

@workflows_bp.route('/<int:workflow_id>/publish', methods=['POST'])
def publish_workflow(workflow_id):
    """카드 게시와 같은 이유로 **사람만** 할 수 있다."""
    actor = current_user()
    wf = services.get_visible(workflow_id, actor)
    services.assert_can_edit(wf, actor)

    if _acting_via_token():
        raise AppError('MD-WF-0130',
                       '게시는 사람이 웹에서 해야 합니다. 토큰으로는 할 수 없습니다.',
                       status=403)
    if not wf.is_draft:
        raise AppError('MD-WF-0131', '이미 게시된 워크플로입니다.', status=409)
    if not wf.nodes:
        raise AppError('MD-WF-0132', '노드가 없는 워크플로는 게시할 수 없습니다.')

    wf.status = 'published'
    wf.published_at = datetime.utcnow()
    wf.published_by_id = actor.id
    db.session.commit()
    return jsonify({'workflow': wf.to_dict(), 'message': '게시했습니다.'})


@workflows_bp.route('/<int:workflow_id>/mounts', methods=['POST'])
def mount_workflow(workflow_id):
    actor = current_user()
    wf = services.get_visible(workflow_id, actor)
    services.assert_can_edit(wf, actor)

    if _acting_via_token():
        raise AppError('MD-WF-0130',
                       '조직 게시는 사람이 웹에서 해야 합니다.', status=403)
    if wf.is_draft:
        raise AppError('MD-WF-0133',
                       '초안입니다. 먼저 게시한 뒤에 조직에 올릴 수 있습니다.',
                       status=409)

    org_slug = ((request.get_json(silent=True) or {}).get('org_slug') or '').strip()
    org = db.session.get(Organization, org_slug) if org_slug else None
    if org is None or org.kind != 'org':
        raise AppError('MD-ORG-0104', f"조직 '{org_slug}' 을 찾을 수 없습니다.", status=404)

    if db.session.get(WorkflowMount, {'workflow_id': wf.id, 'org_slug': org.slug}):
        return jsonify({'workflow': wf.to_dict(),
                        'message': f"이미 '{org.name}' 에 게시되어 있습니다."}), 200

    db.session.add(WorkflowMount(workflow_id=wf.id, org_slug=org.slug,
                                 mounted_by_id=actor.id))
    db.session.commit()
    return jsonify({'workflow': wf.to_dict(),
                    'message': f"'{org.name}' 에 게시했습니다."}), 201


@workflows_bp.route('/<int:workflow_id>/mounts/<path:org_slug>', methods=['DELETE'])
def unmount_workflow(workflow_id, org_slug):
    actor = current_user()
    wf = services.get_visible(workflow_id, actor)
    services.assert_can_edit(wf, actor)

    mount = db.session.get(WorkflowMount,
                           {'workflow_id': wf.id, 'org_slug': org_slug})
    if mount is None:
        raise AppError('MD-WF-0134', '그 조직에 게시되어 있지 않습니다.', status=404)
    db.session.delete(mount)
    db.session.commit()
    return jsonify({'workflow': wf.to_dict(), 'message': '조직에서 내렸습니다.'})


# --- 노드 -----------------------------------------------------------------------

@workflows_bp.route('/<int:workflow_id>/nodes', methods=['POST'])
def add_node(workflow_id):
    actor = current_user()
    wf = services.get_visible(workflow_id, actor)
    services.assert_can_edit(wf, actor)

    data = request.get_json() or {}
    node = services.add_node(wf, data.get('card_id'), data.get('alias', ''),
                             data.get('layout_x', 0), data.get('layout_y', 0))
    return jsonify(node.to_dict()), 201


@workflows_bp.route('/<int:workflow_id>/nodes/<int:node_id>', methods=['PUT'])
def update_node(workflow_id, node_id):
    actor = current_user()
    wf = services.get_visible(workflow_id, actor)
    services.assert_can_edit(wf, actor)

    data = request.get_json() or {}
    if 'inputs' in data:
        services.set_node_inputs(wf, node_id, data.get('inputs'))

    node = db.session.get(WorkflowNode, node_id)
    if node is None or node.workflow_id != wf.id:
        raise AppError('MD-WF-0112', '그 노드를 찾을 수 없습니다.', status=404)
    if 'alias' in data:
        node.alias = (data.get('alias') or '').strip() or node.alias
    for key in ('layout_x', 'layout_y', 'sort_order'):
        if key in data:
            setattr(node, key, int(data.get(key) or 0))
    db.session.commit()
    return jsonify(node.to_dict())


@workflows_bp.route('/<int:workflow_id>/nodes/<int:node_id>', methods=['DELETE'])
def remove_node(workflow_id, node_id):
    actor = current_user()
    wf = services.get_visible(workflow_id, actor)
    services.assert_can_edit(wf, actor)

    dropped = services.remove_node(wf, node_id)
    return jsonify({
        'message': ('노드를 뺐습니다.' if dropped == 0
                    else f'노드를 빼면서 연결 {dropped}개도 함께 끊었습니다.'),
        'dropped_links': dropped,
    })


# --- 연결 -----------------------------------------------------------------------

# --- 묶음 -----------------------------------------------------------------------

@workflows_bp.route('/<int:workflow_id>/groups', methods=['POST'])
def create_group(workflow_id):
    actor = current_user()
    wf = services.get_visible(workflow_id, actor)
    services.assert_can_edit(wf, actor)

    data = request.get_json() or {}
    group = services.create_group(wf, data.get('name'), data.get('color'),
                                  data.get('node_ids'))
    return jsonify(group.to_dict()), 201


@workflows_bp.route('/<int:workflow_id>/groups/<int:group_id>', methods=['PUT'])
def update_group(workflow_id, group_id):
    actor = current_user()
    wf = services.get_visible(workflow_id, actor)
    services.assert_can_edit(wf, actor)

    group = services.update_group(wf, group_id, request.get_json() or {})
    return jsonify(group.to_dict())


@workflows_bp.route('/<int:workflow_id>/groups/<int:group_id>', methods=['DELETE'])
def remove_group(workflow_id, group_id):
    actor = current_user()
    wf = services.get_visible(workflow_id, actor)
    services.assert_can_edit(wf, actor)

    services.remove_group(wf, group_id)
    return jsonify({'message': '묶음을 풀었습니다. 노드는 그대로 있습니다.'})


@workflows_bp.route('/<int:workflow_id>/links', methods=['POST'])
def add_link(workflow_id):
    actor = current_user()
    wf = services.get_visible(workflow_id, actor)
    services.assert_can_edit(wf, actor)

    data = request.get_json() or {}
    link = services.add_link(wf,
                             data.get('from_node_id'), data.get('from_variable_id'),
                             data.get('to_node_id'), data.get('to_variable_id'))
    return jsonify(link.to_dict()), 201


@workflows_bp.route('/<int:workflow_id>/links/<int:link_id>', methods=['DELETE'])
def remove_link(workflow_id, link_id):
    actor = current_user()
    wf = services.get_visible(workflow_id, actor)
    services.assert_can_edit(wf, actor)

    services.remove_link(wf, link_id)
    return jsonify({'message': '연결을 끊었습니다.'})
