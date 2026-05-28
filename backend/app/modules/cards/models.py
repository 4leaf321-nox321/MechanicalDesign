from app.extensions import db
from datetime import datetime


class Card(db.Model):
    __tablename__ = 'cards'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.String(500), default='')
    route = db.Column(db.String(200), nullable=False, unique=True)
    color = db.Column(db.String(7), default='#3498db')
    sort_order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

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
        }


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

    variables = db.relationship('Variable', backref='container', lazy='dynamic')

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
    container_id = db.Column(db.Integer, db.ForeignKey('containers.id'), nullable=True)
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

    def to_dict(self):
        result = {
            'id': self.id,
            'card_id': self.card_id,
            'container_id': self.container_id,
            'name': self.name,
            'symbol': self.symbol or '',
            'category': self.category,
            'var_type': self.var_type,
            'unit': self.unit or '',
            'sort_order': self.sort_order,
        }
        if self.category == 'input' and self.var_type == 'slider':
            result['min_value'] = self.min_value
            result['max_value'] = self.max_value
        if self.var_type == 'formula':
            result['formula'] = self.formula or ''
        if self.var_type == 'table':
            result['table_data'] = self.table_data or ''
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
    container_id = db.Column(db.Integer, db.ForeignKey('containers.id'), nullable=True)
    filename = db.Column(db.String(255), nullable=False)         # 원본 파일명
    stored_name = db.Column(db.String(255), nullable=False)      # 서버 저장 파일명 (uuid.ext)
    mime_type = db.Column(db.String(50), default='image/png')
    sort_order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'card_id': self.card_id,
            'container_id': self.container_id,
            'filename': self.filename,
            'mime_type': self.mime_type,
            'url': f'/api/cards/{self.card_id}/images/{self.id}/file',
            'sort_order': self.sort_order,
        }
