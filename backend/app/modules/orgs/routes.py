"""조직 API — 트리 읽기는 모두에게, 트리 고치기는 관리자에게.

읽기를 막지 않는 이유: 조직 트리는 **화면의 뼈대**다. 왼쪽에 항상 떠 있어야
하는데, 그것을 권한으로 가리면 사람마다 다른 모양의 화면을 보게 되고 "그 카드
어느 팀에 있어요" 라는 대화가 성립하지 않는다. 카드가 누구에게 보이는지는
게시(`CardMount`)가 정하고, 트리는 그 자리를 가리키는 이름표일 뿐이다.
"""

from flask import Blueprint, g, jsonify, request

from app.extensions import db
from app.shared.auth import admin_required
from app.shared.errors import AppError

from . import services
from .models import CardMount, Organization

orgs_bp = Blueprint('orgs', __name__)


@orgs_bp.route('/tree', methods=['GET'])
def get_tree():
    """조직 트리 + 내 개인 공간.

    한 번에 내려보낸다. 화면이 왼쪽 패널을 그리는 데 이 둘이 다 필요한데, 따로
    부르면 둘 중 하나만 도착한 순간이 생겨 트리가 한 번 깜빡인다.
    """
    me = g.current_user
    personal = services.ensure_personal_org(me, commit=True)
    # 개인 공간은 **게시가 아니라 집**으로 센다. 카드가 개인 공간에 mount 되는
    # 일은 없으므로, 게시 수를 세면 언제나 0 이 나온다.
    from app.modules.cards.models import Card

    personal_count = (db.session.query(db.func.count(Card.id))
                      .filter(Card.home_org_slug == personal.slug,
                              Card.deleted_at.is_(None)).scalar())

    from app.modules.workflows.models import Workflow

    personal_wf = (db.session.query(db.func.count(Workflow.id))
                   .filter(Workflow.home_org_slug == personal.slug,
                           Workflow.deleted_at.is_(None)).scalar())
    return jsonify({
        'tree': services.org_tree(),
        'personal': {**personal.to_dict(card_count=personal_count),
                     'workflow_count': personal_wf},
    })


@orgs_bp.route('', methods=['GET'])
def list_orgs():
    """평면 목록. 게시 대화상자가 "어디에 올릴까" 를 고르는 데 쓴다."""
    rows = (Organization.query.filter_by(kind='org')
            .order_by(Organization.sort_order, Organization.name).all())
    return jsonify([r.to_dict() for r in rows])


@orgs_bp.route('', methods=['POST'])
@admin_required
def create_org():
    data = request.get_json() or {}
    org = services.create_org(
        name=data.get('name'),
        parent_slug=data.get('parent_slug'),
        description=data.get('description', ''),
        color=data.get('color'),
    )
    return jsonify(org.to_dict()), 201


@orgs_bp.route('/<path:slug>', methods=['PUT'])
@admin_required
def update_org(slug):
    org = db.session.get(Organization, slug)
    if org is None or org.kind != 'org':
        raise AppError('MD-ORG-0104', f"조직 '{slug}' 을 찾을 수 없습니다.", status=404)

    data = request.get_json() or {}

    if 'name' in data:
        name = (data.get('name') or '').strip()
        if not name:
            raise AppError('MD-ORG-0100', '조직 이름을 입력해 주세요.')
        org.name = name
    if 'description' in data:
        org.description = (data.get('description') or '').strip()
    if 'color' in data:
        org.color = data.get('color') or '#64748b'
    if 'sort_order' in data:
        org.sort_order = int(data.get('sort_order') or 0)

    # **이름과 slug 는 따로 간다.** 이름을 고쳤다고 주소를 바꾸면 저장해 둔
    # 링크가 전부 죽는다. slug 는 만들 때 한 번 정해지고 그대로 남는다.
    if 'parent_slug' in data:
        new_parent = data.get('parent_slug') or None
        if new_parent:
            parent = db.session.get(Organization, new_parent)
            if parent is None or parent.kind != 'org':
                raise AppError('MD-ORG-0101',
                               f"상위 조직 '{new_parent}' 을 찾을 수 없습니다.")
        services.assert_no_cycle(slug, new_parent)
        org.parent_slug = new_parent

    db.session.commit()
    return jsonify(org.to_dict())


@orgs_bp.route('/<path:slug>/move', methods=['PUT'])
@admin_required
def move_org(slug):
    """드래그로 옮긴 결과를 반영한다. 부모와 형제 순서를 한 번에 정한다."""
    data = request.get_json() or {}
    org = services.move_org(slug, data.get('parent_slug'), data.get('position'))
    return jsonify(org.to_dict())


@orgs_bp.route('/<path:slug>', methods=['DELETE'])
@admin_required
def delete_org(slug):
    services.delete_org(slug)
    return jsonify({'message': '삭제되었습니다.'}), 200
