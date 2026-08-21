import json
from datetime import datetime

from app.extensions import db

from . import tables, units


def _lookup_template(template_id):
    """참조된 표 원본. 같은 세션에서 여러 번 불러도 SQLAlchemy 가 캐시한다."""
    return db.session.get(VariableTemplate, template_id)


class Card(db.Model):
    __tablename__ = 'cards'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.String(500), default='')
    route = db.Column(db.String(200), nullable=False, unique=True)
    color = db.Column(db.String(7), default='#3498db')
    sort_order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # 만든 사람. 계정을 지워도 행은 남으므로(소프트 삭제) 참조가 끊기지 않는다.
    # 인증이 붙기 전에 만들어진 카드는 NULL 이다 — 그때는 만든 사람을 알 방법이
    # 없었으므로 값을 지어내지 않는다.
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'),
                              nullable=True)
    created_by = db.relationship('User', foreign_keys=[created_by_id])

    #: 'draft' | 'published'.
    #:
    #: **초안은 사람이 아직 보지 않은 카드다.** 밖에서 API 로(MCP·스크립트)
    #: 만든 카드가 여기로 들어온다. 저장이 됐다는 것과 그 계산이 공학적으로
    #: 맞다는 것은 전혀 다른 얘긴데, 카드는 사람이 설계 판단에 쓰는 것이라
    #: 그 사이에 사람 한 명이 반드시 있어야 한다.
    #:
    #: 기본값을 published 로 두는 것은 **이미 있는 카드들 때문이다.** 초안이
    #: 없던 시절에 만들어진 카드가 갑자기 목록에서 사라지면 안 된다.
    status = db.Column(db.String(20), nullable=False, default='published',
                       server_default='published')

    published_at = db.Column(db.DateTime, nullable=True)
    published_by_id = db.Column(db.Integer,
                                db.ForeignKey('users.id', ondelete='SET NULL'),
                                nullable=True)
    published_by = db.relationship('User', foreign_keys=[published_by_id])
    """누가 게시했는지. **누가 만들었는지와 다른 질문이다** — AI 가 만들고
    사람이 게시하는 것이 이 흐름의 전부이므로, 둘을 한 칸에 담을 수 없다."""

    #: 'human' | 'mcp' — 이 카드를 **누가 시작했는가**.
    #:
    #: 나중에 이 카드의 계산이 이상하다는 얘기가 나왔을 때, 사람이 처음부터
    #: 손으로 짠 것인지 AI 가 초안을 잡은 것인지는 어디를 먼저 볼지를 바꾼다.
    #: 게시하고 나면 둘 다 똑같이 생긴 카드라 구분할 단서가 남지 않는다.
    origin = db.Column(db.String(20), nullable=False, default='human',
                       server_default='human')

    ai_touched_at = db.Column(db.DateTime, nullable=True)
    """**기계가 이 카드에 마지막으로 쓴 시각.**

    `origin` 만으로는 부족하다. 사람이 만든 카드를 AI 가 나중에 전부 고쳐도
    origin 은 계속 'human' 이고, 그러면 그 칸이 거짓말을 하게 된다.

    이 값은 채워지기만 하고 지워지지 않는다. `published_at` 보다 나중이면
    **사람이 확인한 뒤에 기계가 또 손댔다**는 뜻이라, 그때의 검토는 지금
    화면에 있는 것과 다른 카드를 본 것이다."""

    containers = db.relationship('Container', backref='card', cascade='all, delete-orphan', order_by='Container.sort_order')
    variables = db.relationship('Variable', backref='card', cascade='all, delete-orphan', order_by='Variable.sort_order')
    images = db.relationship('Image', backref='card', cascade='all, delete-orphan', order_by='Image.sort_order')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'route': self.route,
            'color': self.color,
            'sort_order': self.sort_order,
            'created_at': self.created_at.isoformat(),
            'created_by_id': self.created_by_id,
            # 이름을 함께 실어 준다. 프론트가 카드 목록마다 계정을 따로 조회하면
            # 카드 수만큼 요청이 늘고, 일반 사용자는 계정 API 를 부를 수도 없다.
            'created_by_name': self.created_by.display_name if self.created_by else None,
            'status': self.status or 'published',
            'published_at': self.published_at.isoformat() if self.published_at else None,
            'published_by_name': (self.published_by.display_name
                                  if self.published_by else None),
            'origin': self.origin or 'human',
            'ai_touched_at': (self.ai_touched_at.isoformat()
                              if self.ai_touched_at else None),
            # 화면이 직접 두 시각을 비교하게 두지 않는다. 비교 방향을 한 번만
            # 틀려도 "괜찮다" 고 표시되고, 그 오류는 아무도 못 찾는다.
            'ai_edited_after_publish': self.ai_edited_after_publish,
        }

    @property
    def is_draft(self):
        return (self.status or 'published') == 'draft'

    @property
    def ai_edited_after_publish(self):
        """사람이 게시한 뒤에 기계가 또 손댔는가.

        그렇다면 그 사람이 검토한 것은 **지금 화면에 있는 카드가 아니다.**
        게시 기록(`published_by`)은 그대로 남아 있어서, 이 사실을 따로
        말해 주지 않으면 검토를 거친 카드처럼 보인다.
        """
        if self.ai_touched_at is None or self.published_at is None:
            return False
        return self.ai_touched_at > self.published_at

    def is_visible_to(self, user):
        """게시된 카드는 모두에게, 초안은 만든 사람과 관리자에게만.

        초안을 모두에게 보이면 검토를 거치게 한 의미가 없다 — 누군가는 그것을
        열어 계산하고 그 숫자를 믿는다.
        """
        if not self.is_draft:
            return True
        if user is None:
            return False
        return user.is_admin or self.created_by_id == user.id


class Container(db.Model):
    __tablename__ = 'containers'

    id = db.Column(db.Integer, primary_key=True)
    card_id = db.Column(db.Integer, db.ForeignKey('cards.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    container_type = db.Column(db.String(20), default='default')  # 'default', 'input', 'output', 'hidden'
    layout_x = db.Column(db.Integer, default=0)
    layout_y = db.Column(db.Integer, default=0)
    layout_w = db.Column(db.Integer, default=12)
    layout_h = db.Column(db.Integer, default=4)
    column_count = db.Column(db.Integer, default=1)               # 내부 변수 배치 열 수 (1~6)
    sort_order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # 컨테이너 → 변수 직접 관계는 없앴다. 배치가 widget_placements 로 옮겨졌고,
    # 한 변수가 여러 컨테이너에 놓일 수 있으므로 단순 1:N 이 성립하지 않는다.
    placements = db.relationship(
        'WidgetPlacement',
        backref='container',
        cascade='all, delete-orphan',
        lazy='selectin',
        order_by='WidgetPlacement.sort_order',
    )

    def to_dict(self):
        return {
            'id': self.id,
            'card_id': self.card_id,
            'name': self.name,
            'container_type': self.container_type or 'default',
            'layout_x': self.layout_x if self.layout_x is not None else 0,
            'layout_y': self.layout_y if self.layout_y is not None else 0,
            'layout_w': self.layout_w if self.layout_w is not None else 12,
            'layout_h': self.layout_h if self.layout_h is not None else 4,
            'column_count': self.column_count if self.column_count in (1, 2, 3, 4, 5, 6) else 1,
            'sort_order': self.sort_order,
        }


class Variable(db.Model):
    __tablename__ = 'variables'

    id = db.Column(db.Integer, primary_key=True)
    card_id = db.Column(db.Integer, db.ForeignKey('cards.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    category = db.Column(db.String(20), nullable=False)   # 'input', 'intermediate', 'output'
    var_type = db.Column(db.String(20), nullable=False)    # 'slider', 'text', 'dropdown', 'formula', 'table', 'conditional', 'interp_table'
    symbol = db.Column(db.String(50), default='')          # 변수 기호 (예: A, B, F_a)
    formula = db.Column(db.String(500), default='')        # 수식 (예: A + B * 2)
    table_data = db.Column(db.Text, default='')            # 테이블 룩업 정의 (JSON)
    options_data = db.Column(db.Text, default='')          # 드롭다운 옵션 리스트 (JSON)
    conditional_data = db.Column(db.Text, default='')      # 조건부 수식 정의 (JSON)
    interp_data = db.Column(db.Text, default='')           # 보간 테이블 정의 (JSON) — 선형 내삽·외삽
    unit = db.Column(db.String(50), default='')
    min_value = db.Column(db.Float, nullable=True)
    max_value = db.Column(db.Float, nullable=True)
    sort_order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # 어느 컨테이너에 보이는가. 여러 개일 수 있다 — 같은 값을 두 군데서 보는 경우.
    #
    # lazy='selectin' 이어야 한다. 기본 'select' 면 카드의 변수 수만큼 쿼리가
    # 따로 나간다(N+1). selectin 은 부모를 한 번에 읽은 뒤 배치를 한 방에 가져온다.
    placements = db.relationship(
        'WidgetPlacement',
        primaryjoin='Variable.id == WidgetPlacement.variable_id',
        cascade='all, delete-orphan',
        lazy='selectin',
        order_by='WidgetPlacement.sort_order',
    )

    def to_dict(self):
        result = {
            'id': self.id,
            'card_id': self.card_id,
            # 배치는 위젯 배치 탭이 전담한다(PUT /widgets/layout).
            'placements': [p.to_dict() for p in self.placements],
            'name': self.name,
            'symbol': self.symbol or '',
            'category': self.category,
            'var_type': self.var_type,
            'unit': self.unit or '',
            # 이 단위를 다른 표기로 넣을 수 있게 환산표를 함께 내려보낸다.
            #
            # **화면이 단위 문자열을 스스로 해석하지 않게 하려는 것이다.**
            # 프론트가 해석하기 시작하면 단위 규칙이 두 벌이 되고, 두 벌은
            # 반드시 어긋난다 — 그 어긋남은 "화면에서는 환산했는데 검증은
            # 다르게 보는" 형태라 원인을 찾기가 아주 어렵다. 화면이 하는
            # 일은 배율 하나를 곱하는 것뿐이다.
            #
            # 단위를 안 적었거나 못 읽으면 None — 그때는 고를 것이 없다.
            'unit_info': units.describe(self.unit),
            'sort_order': self.sort_order,
        }
        if self.category == 'input' and self.var_type == 'slider':
            result['min_value'] = self.min_value
            result['max_value'] = self.max_value
        if self.var_type == 'formula':
            result['formula'] = self.formula or ''
        if self.var_type == 'table':
            # 표를 참조하는 정의라면 여기서 원본의 열·행을 채워 내보낸다.
            # 평가기·편집기는 표가 통째로 든 모양만 알면 되고, 참조인지 아닌지는
            # 신경 쓰지 않아도 된다.
            result['table_data'] = tables.resolve(self.table_data or '', _lookup_template)
        if self.var_type == 'dropdown':
            result['options_data'] = self.options_data or ''
        if self.var_type == 'conditional':
            result['conditional_data'] = self.conditional_data or ''
        if self.var_type == 'interp_table':
            result['interp_data'] = self.interp_data or ''
        return result


class VariableTemplate(db.Model):
    __tablename__ = 'variable_templates'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    var_type = db.Column(db.String(20), nullable=False)  # 'formula', 'table', 'conditional'
    data = db.Column(db.Text, nullable=False, default='')  # 타입별 정의 본문 (formula는 raw string, table·conditional은 JSON 문자열)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('name', 'var_type', name='uq_template_name_per_type'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'var_type': self.var_type,
            'data': self.data or '',
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class Image(db.Model):
    __tablename__ = 'images'

    id = db.Column(db.Integer, primary_key=True)
    card_id = db.Column(db.Integer, db.ForeignKey('cards.id'), nullable=False)
    filename = db.Column(db.String(255), nullable=False)         # 원본 파일명
    stored_name = db.Column(db.String(255), nullable=False)      # 서버 저장 파일명 (uuid.ext)
    mime_type = db.Column(db.String(50), default='image/png')
    sort_order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    placements = db.relationship(
        'WidgetPlacement',
        primaryjoin='Image.id == WidgetPlacement.image_id',
        cascade='all, delete-orphan',
        lazy='selectin',
        order_by='WidgetPlacement.sort_order',
    )

    def to_dict(self):
        return {
            'id': self.id,
            'card_id': self.card_id,
            'placements': [p.to_dict() for p in self.placements],
            'filename': self.filename,
            'mime_type': self.mime_type,
            'url': f'/api/cards/{self.card_id}/images/{self.id}/file',
            'sort_order': self.sort_order,
        }


class WidgetPlacement(db.Model):
    """위젯(변수·이미지)이 어느 컨테이너에 보이는가.

    **한 위젯이 여러 컨테이너에 놓일 수 있다.** 값은 하나뿐이고 보이는 자리만
    여럿이다 — 컨테이너는 화면 묶음일 뿐 계산에 관여하지 않으므로, 같은 변수를
    두 곳에 두면 같은 값이 두 군데 보이고 한쪽을 고치면 다른 쪽도 함께 바뀐다.

    전에는 `variables.container_id` / `images.container_id` 단일 FK 였다. 그 컬럼은
    이 표로 옮기고 **없앴다** — 둘 다 남겨 두면 "어느 쪽이 진짜 배치냐" 가 갈려서
    한쪽만 고치는 버그가 반드시 생긴다.

    배치 행이 없으면 미배치다. 미배치를 NULL 컨테이너 행으로 표현하지 않는 이유:
    그러면 "행이 있는데 아무 데도 안 보이는" 상태가 생겨 정리 대상이 늘어난다.
    """

    __tablename__ = 'widget_placements'

    id = db.Column(db.Integer, primary_key=True)
    # card_id 를 함께 들고 있는다. 카드 단위로 배치를 통째로 갈아 끼우는
    # PUT /widgets/layout 이 조인 없이 자기 카드 것만 지울 수 있어야 한다.
    card_id = db.Column(db.Integer, db.ForeignKey('cards.id', ondelete='CASCADE'),
                        nullable=False, index=True)
    container_id = db.Column(db.Integer, db.ForeignKey('containers.id', ondelete='CASCADE'),
                             nullable=False, index=True)

    # 둘 중 정확히 하나만 채워진다. 다형성 FK 대신 컬럼 두 개를 쓰는 이유는
    # 진짜 외래키 제약을 걸어 컨테이너·변수 삭제가 DB 에서 정리되게 하기 위해서다.
    variable_id = db.Column(db.Integer, db.ForeignKey('variables.id', ondelete='CASCADE'),
                            nullable=True, index=True)
    image_id = db.Column(db.Integer, db.ForeignKey('images.id', ondelete='CASCADE'),
                         nullable=True, index=True)

    sort_order = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('container_id', 'variable_id', name='uq_placement_container_variable'),
        db.UniqueConstraint('container_id', 'image_id', name='uq_placement_container_image'),
        db.CheckConstraint(
            '(variable_id IS NOT NULL AND image_id IS NULL)'
            ' OR (variable_id IS NULL AND image_id IS NOT NULL)',
            name='ck_placement_exactly_one_target',
        ),
    )

    @property
    def kind(self):
        return 'variable' if self.variable_id is not None else 'image'

    @property
    def widget_id(self):
        return self.variable_id if self.variable_id is not None else self.image_id

    def to_dict(self):
        return {
            'container_id': self.container_id,
            'sort_order': self.sort_order,
        }


class CardRevision(db.Model):
    """카드 정의가 바뀐 시점 하나.

    카드를 지우면 이력도 함께 사라진다(CASCADE). 없는 카드의 이력은 되짚을
    대상이 없다 — 그때의 계산이 필요하면 계산 기록이 자기 스냅샷을 들고 있다.
    """

    __tablename__ = 'card_revisions'

    id = db.Column(db.Integer, primary_key=True)
    card_id = db.Column(db.Integer, db.ForeignKey('cards.id', ondelete='CASCADE'),
                        nullable=False, index=True)

    snapshot = db.Column(db.Text, nullable=False)
    """그때의 변수 정의 전부. 되짚을 때 이것만 열면 된다."""

    summary = db.Column(db.Text, nullable=False, default='[]')
    """앞 이력과 견준 변경 목록. 미리 계산해 둔다 — 목록 화면이 이력 수만큼
    스냅샷을 열어 비교하면, 이력이 쌓일수록 화면이 느려진다."""

    changed_by_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'),
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
            'card_id': self.card_id,
            'changed_by_id': self.changed_by_id,
            'changed_by_name': self.changed_by.display_name if self.changed_by else None,
            'via_token': bool(self.via_token),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'changes': self._load(self.summary, []),
        }
        if full:
            body['snapshot'] = self._load(self.snapshot, [])
        return body

    @staticmethod
    def _load(raw, fallback):
        try:
            return json.loads(raw) if raw else fallback
        except ValueError:
            # 한 행이 깨졌다고 이력 화면 전체가 500 이 되어서는 안 된다.
            return fallback
