"""워크플로 — 카드를 이어 붙여 값이 흐르게 한다.

카드 하나는 섬이다. 하중을 구한 뒤 그 값을 볼트 카드에 **손으로 옮겨 적어야**
하고, 옮겨 적는 순간 두 계산이 어긋나기 시작한다. 워크플로는 그 배선을 표로
들고 있어서, 앞 카드를 다시 계산하면 뒤 카드가 따라 바뀐다.

    워크플로 (workflow)      감속기 출력축 검토
     ├─ 노드 (node)          카드가 놓이는 **자리**. 카드 참조 + 그 자리의 입력값
     └─ 연결 (link)          노드A.출력변수 → 노드B.입력변수

**노드가 카드 참조가 아니라 자리인 이유**: 같은 '볼트 강도' 카드를 한 워크플로
안에서 두 번 쓰는 일이 흔하다(상부 볼트, 하부 볼트). 카드를 직접 가리키면 그 둘의
입력값을 둘 데가 없다.

**카드는 살아 있는 참조다.** 카드를 고치면 워크플로에 그대로 반영된다 — 조직
게시와 같은 판단이다. 대신 카드에서 변수를 지우면 그 변수를 쓰던 연결이 끊기므로,
**검증이 1급 기능**이 된다. 끊긴 채로 조용히 도는 것이 이 구조에서 가장 나쁜
실패이기 때문에, 연결은 끊겨도 **행이 남아** 무엇을 가리키던 것인지 말해 준다.
"""

import json
from datetime import datetime

from app.extensions import db


class Workflow(db.Model):
    __tablename__ = 'workflows'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, default='')
    route = db.Column(db.String(200), nullable=False, unique=True)
    color = db.Column(db.String(7), default='#6c5ce7')
    sort_order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'),
                              nullable=True)
    created_by = db.relationship('User', foreign_keys=[created_by_id])

    #: 태어난 개인 공간. 카드와 같은 규칙이다.
    home_org_slug = db.Column(db.String(64),
                              db.ForeignKey('organizations.slug', ondelete='SET NULL'),
                              nullable=True, index=True)
    home_org = db.relationship('Organization', foreign_keys=[home_org_slug])

    #: 'draft' | 'published'. 카드와 같은 뜻 — 사람이 이 계산을 봤는가.
    status = db.Column(db.String(20), nullable=False, default='draft',
                       server_default='draft')
    published_at = db.Column(db.DateTime, nullable=True)
    published_by_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'),
                                nullable=True)
    published_by = db.relationship('User', foreign_keys=[published_by_id])

    deleted_at = db.Column(db.DateTime, nullable=True, index=True)
    deleted_by_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'),
                              nullable=True)
    deleted_by = db.relationship('User', foreign_keys=[deleted_by_id])

    # --- 반복 설정 ---------------------------------------------------------
    # 서로 물고 있는 노드는 돌려서 수렴시킨다. 사람이 정하는 것은 **기준**
    # 이지 판정이 아니다 — 언제 멈출지를 손으로 쓰게 두면, 그 식을 잘못
    # 쓴 워크플로가 수렴하지 않은 숫자를 답으로 내놓고 오류도 안 낸다.
    #
    # 블록마다 두지 않고 워크플로 하나에 둔다. 블록은 배선 따라 생겼다
    # 없어지므로, 블록에 매달아 두면 선 하나 끊는 순간 설정이 사라진다.
    iter_tolerance = db.Column(db.Float, nullable=False, default=1e-6,
                               server_default='0.000001')
    iter_max = db.Column(db.Integer, nullable=False, default=200,
                         server_default='200')
    #: 완화계수 ω. 낮추면 보폭이 줄어 튀는 고리가 잡힌다. 1 이 아닌 이유는
    #: `iterate.js` 에 적어 두었다 — 모두에게 최선인 값이 없어서, 가장 빠른 값이
    #: 아니라 **가장 덜 실패하는** 값을 골랐다.
    iter_relaxation = db.Column(db.Float, nullable=False, default=0.7,
                                server_default='0.7')

    #: 이 워크플로에 놓인 자리들.
    #:
    #: `foreign_keys` 를 밝혀야 한다 — 노드가 `workflows` 를 **두 번** 가리키기
    #: 때문이다(자기가 속한 워크플로, 그리고 자기가 품은 하위 워크플로).
    #: 안 밝히면 어느 쪽으로 이을지 정할 수 없어 조인 자체가 안 된다.
    nodes = db.relationship('WorkflowNode', cascade='all, delete-orphan',
                            back_populates='workflow', lazy='selectin',
                            foreign_keys='WorkflowNode.workflow_id',
                            order_by='WorkflowNode.sort_order')
    links = db.relationship('WorkflowLink', cascade='all, delete-orphan',
                            back_populates='workflow', lazy='selectin')
    groups = db.relationship('WorkflowGroup', cascade='all, delete-orphan',
                             back_populates='workflow', lazy='selectin',
                             order_by='WorkflowGroup.sort_order')
    mounts = db.relationship('WorkflowMount', cascade='all, delete-orphan',
                             backref='workflow', lazy='selectin')

    @property
    def is_draft(self):
        return (self.status or 'draft') == 'draft'

    @property
    def is_deleted(self):
        return self.deleted_at is not None

    def is_visible_to(self, user):
        """카드와 **같은 규칙**이다.

        규칙을 따로 쓰지 않는 것이 중요하다. 두 벌이 되면 한쪽만 고치는 날이
        오고, 그때 새는 쪽은 아무 오류도 내지 않는다.
        """
        if self.is_deleted:
            return self.can_manage_trash(user)
        if not self.is_draft:
            return True
        if user is None:
            return False
        return user.is_admin or self.created_by_id == user.id

    def can_manage_trash(self, user):
        if user is None:
            return False
        return user.is_admin or self.created_by_id == user.id

    def to_dict(self, full=False):
        body = {
            'id': self.id,
            'name': self.name,
            'description': self.description or '',
            'route': self.route,
            'color': self.color,
            'sort_order': self.sort_order,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'created_by_id': self.created_by_id,
            'created_by_name': self.created_by.display_name if self.created_by else None,
            'status': self.status or 'draft',
            'published_at': self.published_at.isoformat() if self.published_at else None,
            'home_org_slug': self.home_org_slug,
            'mounted_orgs': [{'slug': m.org_slug,
                              'name': m.org.name if m.org else m.org_slug}
                             for m in self.mounts],
            'deleted_at': self.deleted_at.isoformat() if self.deleted_at else None,
            'deleted_by_name': (self.deleted_by.display_name
                                if self.deleted_by else None),
            'node_count': len(self.nodes),
            'link_count': len(self.links),
            'iter_tolerance': self.iter_tolerance,
            'iter_max': self.iter_max,
            'iter_relaxation': self.iter_relaxation,
        }
        if full:
            body['nodes'] = [n.to_dict() for n in self.nodes]
            body['links'] = [l.to_dict() for l in self.links]
            body['groups'] = [g.to_dict() for g in self.groups]
        return body


class WorkflowGroup(db.Model):
    """노드 묶음 — 순서도에서 한 상자로 두르는 것.

    **계산에는 아무 영향이 없다.** 실행 순서는 배선이 정하고(강결합요소), 묶음은
    사람이 보기 좋으라고 두는 것이다. 둘을 섞으면 그림을 바꿨을 뿐인데 답이
    달라지는 일이 생기고, 그것이 이 기능에서 가장 나쁜 실패다.

    그래서 여기에는 이름과 색만 있다. 무엇이 이 묶음에 드는지는 노드 쪽
    `group_id` 가 안다 — 한 노드는 한 묶음에만 든다. 겹치는 묶음을 허용하면
    상자가 서로를 가로질러 그려져서, 그림이 오히려 안 읽힌다.
    """

    __tablename__ = 'workflow_groups'

    id = db.Column(db.Integer, primary_key=True)
    workflow_id = db.Column(db.Integer, db.ForeignKey('workflows.id', ondelete='CASCADE'),
                            nullable=False, index=True)
    workflow = db.relationship('Workflow', back_populates='groups')

    name = db.Column(db.String(100), nullable=False, default='')
    #: 상자 색. 뜻이 아니라 **구분**이라 사람이 고른다 — 계열이 셋이면 셋이 서로
    #: 달라야 하고, 무엇이 위험한지는 노드가 따로 말한다.
    color = db.Column(db.String(7), nullable=False, default='#6c5ce7')
    sort_order = db.Column(db.Integer, nullable=False, default=0, server_default='0')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    nodes = db.relationship('WorkflowNode', backref='group', lazy='selectin')

    def to_dict(self):
        return {
            'id': self.id,
            'workflow_id': self.workflow_id,
            'name': self.name or '',
            'color': self.color,
            'sort_order': self.sort_order,
            'node_ids': [n.id for n in self.nodes],
        }


class WorkflowMount(db.Model):
    """조직 게시. `card_mounts` 와 같은 꼴이라 화면도 같은 것을 쓴다."""

    __tablename__ = 'workflow_mounts'

    workflow_id = db.Column(db.Integer, db.ForeignKey('workflows.id', ondelete='CASCADE'),
                            primary_key=True)
    org_slug = db.Column(db.String(64),
                         db.ForeignKey('organizations.slug', ondelete='CASCADE'),
                         primary_key=True, index=True)
    mounted_by_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'),
                              nullable=True)
    mounted_at = db.Column(db.DateTime, default=datetime.utcnow)
    org = db.relationship('Organization')


class WorkflowNode(db.Model):
    """한 자리 — **카드 한 장이거나, 워크플로 하나**.

    둘 중 하나만 가리킨다. 워크플로를 가리키면 그 안의 계산이 통째로 이
    자리에 들어온다 — 「관로 계열」 을 한 번 짜 두고 여러 검토에서 다시 쓰는
    일이 실제로 있다.

    **하위 워크플로도 살아 있는 참조다.** 안쪽을 고치면 그것을 쓰는 모든
    바깥이 따라 바뀐다. 카드가 그런 것과 같은 규칙이고, 그래서 완전 삭제도
    같은 방식으로 막는다(RESTRICT).
    """

    __tablename__ = 'workflow_nodes'

    id = db.Column(db.Integer, primary_key=True)
    workflow_id = db.Column(db.Integer, db.ForeignKey('workflows.id', ondelete='CASCADE'),
                            nullable=False, index=True)
    workflow = db.relationship('Workflow', back_populates='nodes',
                               foreign_keys=[workflow_id])

    #: **완전 삭제를 막는다(RESTRICT).** 카드가 사라지면 이 자리가 통째로 뜻을
    #: 잃는데, CASCADE 로 지워 버리면 워크플로가 조용히 반쪽이 된다. 앱이 먼저
    #: 친절한 메시지로 막고, 이 제약은 그 뒤의 마지막 방어선이다.
    card_id = db.Column(db.Integer, db.ForeignKey('cards.id', ondelete='RESTRICT'),
                        nullable=True, index=True)
    card = db.relationship('Card')

    #: 카드 대신 워크플로를 놓은 자리. **둘 중 하나만** 채워진다.
    #:
    #: 카드와 같은 `RESTRICT` 다 — 쓰이고 있는 워크플로가 사라지면 이 자리가
    #: 통째로 뜻을 잃는다.
    sub_workflow_id = db.Column(
        db.Integer, db.ForeignKey('workflows.id', ondelete='RESTRICT'),
        nullable=True, index=True)
    sub_workflow = db.relationship('Workflow', foreign_keys=[sub_workflow_id])

    #: 이 자리의 이름. '상부 볼트' 처럼 같은 카드를 두 번 쓸 때 구분한다.
    alias = db.Column(db.String(100), nullable=False, default='')

    #: 어느 묶음에 드는가. **`SET NULL` 이다** — 묶음을 지우는 것은 「이렇게
    #: 보지 않겠다」 는 뜻이지 노드를 버리겠다는 뜻이 아니다. `CASCADE` 로
    #: 두면 상자를 지웠을 뿐인데 계산이 사라진다.
    group_id = db.Column(db.Integer,
                         db.ForeignKey('workflow_groups.id', ondelete='SET NULL'),
                         nullable=True, index=True)

    #: 순서도 GUI 의 좌표. 지금은 표로 편집하지만 자리를 미리 만들어 둔다 —
    #: 나중에 캔버스를 얹을 때 **데이터 모델을 안 바꾸려는** 것이다.
    layout_x = db.Column(db.Integer, nullable=False, default=0, server_default='0')
    layout_y = db.Column(db.Integer, nullable=False, default=0, server_default='0')

    #: 이 자리의 입력값 `{변수id: 값}`. 워크플로가 곧 하나의 설계안이 되도록
    #: 저장한다 — 열면 지난번 값이 그대로 있어 바로 다시 돌릴 수 있다.
    inputs = db.Column(db.Text, nullable=False, default='{}', server_default='{}')

    sort_order = db.Column(db.Integer, nullable=False, default=0, server_default='0')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def input_values(self):
        try:
            value = json.loads(self.inputs or '{}')
            return value if isinstance(value, dict) else {}
        except ValueError:
            # 저장된 JSON 이 깨졌다면 그 노드만 빈 입력으로 볼 일이지, 워크플로
            # 전체가 500 이 되어서는 안 된다.
            return {}

    def to_dict(self):
        return {
            'id': self.id,
            'workflow_id': self.workflow_id,
            'card_id': self.card_id,
            'card_name': self.card.name if self.card else None,
            'card_route': self.card.route if self.card else None,
            # 카드가 휴지통에 있으면 이 노드는 돌지 않는다. 검증이 읽는다.
            'card_deleted': bool(self.card and self.card.deleted_at),
            'sub_workflow_id': self.sub_workflow_id,
            'sub_workflow_name': (self.sub_workflow.name
                                  if self.sub_workflow else None),
            'sub_workflow_route': (self.sub_workflow.route
                                   if self.sub_workflow else None),
            'sub_workflow_deleted': bool(self.sub_workflow
                                         and self.sub_workflow.deleted_at),
            'alias': self.alias or '',
            'group_id': self.group_id,
            'layout_x': self.layout_x,
            'layout_y': self.layout_y,
            'inputs': self.input_values(),
            'sort_order': self.sort_order,
        }


class WorkflowLink(db.Model):
    """노드 사이의 배선 — 앞 노드의 결과가 뒤 노드의 입력이 된다.

    **한 입력에는 연결이 하나만.** 둘이 들어오면 어느 값이 이기는지 알 수 없고,
    그건 오류 없이 틀린 답이 나오는 종류다. DB 제약으로 막는다.

    **변수 id 에 외래키를 걸지 않는다.** 걸면 변수를 지울 때 CASCADE 로 연결이
    조용히 사라져, 배선이 하나 없어진 채로 워크플로가 계속 돈다. 행을 남겨 두면
    검증이 "이 연결이 가리키던 변수가 사라졌습니다" 라고 말할 수 있다 — 그러라고
    이름 사본(`from_label`/`to_label`)도 함께 들고 있는다.
    """

    __tablename__ = 'workflow_links'
    #: **안쪽 자리까지 넣어야 한다.** 하위 워크플로 노드 하나에 여러 선이
    #: 들어올 수 있고(안쪽 자리가 서로 다르므로), 그때 `(노드, 변수)` 만으로는
    #: 서로 다른 자리가 같은 값이 된다.
    #:
    #: `to_inner_node_id` 를 **비워 두지 않는** 까닭이 여기 있다. Postgres 는
    #: NULL 끼리 안 부딪힌 것으로 쳐서, 비워 두면 카드 노드의 「한 입력에 연결
    #: 하나」 가 조용히 뚫린다. 카드 노드에서는 자기 자신을 적는다.
    __table_args__ = (
        db.UniqueConstraint('to_node_id', 'to_inner_node_id', 'to_variable_id',
                            name='uq_workflow_link_target'),
    )

    id = db.Column(db.Integer, primary_key=True)
    workflow_id = db.Column(db.Integer, db.ForeignKey('workflows.id', ondelete='CASCADE'),
                            nullable=False, index=True)
    workflow = db.relationship('Workflow', back_populates='links')

    from_node_id = db.Column(db.Integer,
                             db.ForeignKey('workflow_nodes.id', ondelete='CASCADE'),
                             nullable=False, index=True)
    #: 보내는 쪽이 하위 워크플로면, 그 **안쪽 어느 노드**의 결과인가.
    #:
    #: 변수 id 만으로는 못 짚는다 — 같은 카드가 안에서 두 자리에 놓이면
    #: 변수 id 가 똑같기 때문이다. 카드 노드에서는 자기 자신을 적는다.
    from_inner_node_id = db.Column(db.Integer, nullable=False)

    from_variable_id = db.Column(db.Integer, nullable=False)
    from_label = db.Column(db.String(160), nullable=False, default='')

    to_node_id = db.Column(db.Integer,
                           db.ForeignKey('workflow_nodes.id', ondelete='CASCADE'),
                           nullable=False, index=True)
    #: 받는 쪽이 하위 워크플로면, 그 안쪽 어느 노드의 입력인가.
    to_inner_node_id = db.Column(db.Integer, nullable=False)

    to_variable_id = db.Column(db.Integer, nullable=False)
    to_label = db.Column(db.String(160), nullable=False, default='')

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'workflow_id': self.workflow_id,
            'from_node_id': self.from_node_id,
            'from_inner_node_id': self.from_inner_node_id,
            'from_variable_id': self.from_variable_id,
            'from_label': self.from_label or '',
            'to_node_id': self.to_node_id,
            'to_inner_node_id': self.to_inner_node_id,
            'to_variable_id': self.to_variable_id,
            'to_label': self.to_label or '',
        }


class WorkflowRevision(db.Model):
    """워크플로의 배선이나 값이 바뀐 시점 하나.

    카드의 `CardRevision` 과 **같은 모양**이다. 두 이력이 서로 다르게 생기면,
    화면에서 나란히 놓인 두 목록이 서로 다른 것을 뜻하게 된다.

    워크플로를 지우면 이력도 함께 사라진다(CASCADE). 없는 워크플로의 이력은
    되짚을 대상이 없다 — 그때의 계산이 필요하면 계산 기록이 자기 스냅샷을
    들고 있다.
    """

    __tablename__ = 'workflow_revisions'

    id = db.Column(db.Integer, primary_key=True)
    workflow_id = db.Column(db.Integer,
                            db.ForeignKey('workflows.id', ondelete='CASCADE'),
                            nullable=False, index=True)

    snapshot = db.Column(db.Text, nullable=False)
    """그때의 배선과 값 전부. 되짚을 때 이것만 열면 된다."""

    summary = db.Column(db.Text, nullable=False, default='[]')
    """앞 이력과 견준 변경 목록. 미리 계산해 둔다 — 목록 화면이 이력 수만큼
    스냅샷을 열어 비교하면, 이력이 쌓일수록 화면이 느려진다."""

    changed_by_id = db.Column(db.Integer,
                              db.ForeignKey('users.id', ondelete='SET NULL'),
                              nullable=True)
    changed_by = db.relationship('User', foreign_keys=[changed_by_id])

    via_token = db.Column(db.Boolean, nullable=False, default=False,
                          server_default='false')
    """사람이 웹에서 고쳤는지, 기계(MCP·스크립트)가 고쳤는지."""

    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    """이어진 수정을 한 이력으로 묶으므로 시작과 끝이 다를 수 있다."""

    def to_dict(self, full=False):
        body = {
            'id': self.id,
            'workflow_id': self.workflow_id,
            'changed_by_id': self.changed_by_id,
            'changed_by_name': (self.changed_by.display_name
                                if self.changed_by else None),
            'via_token': bool(self.via_token),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'changes': self._load(self.summary, []),
        }
        if full:
            body['snapshot'] = self._load(self.snapshot, {})
        return body

    @staticmethod
    def _load(raw, fallback):
        try:
            return json.loads(raw) if raw else fallback
        except ValueError:
            # 한 행이 깨졌다고 이력 화면 전체가 500 이 되어서는 안 된다.
            return fallback
