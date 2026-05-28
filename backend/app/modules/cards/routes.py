import os
import re
import json
import uuid
from flask import Blueprint, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
from app.extensions import db
from .models import Card, Container, Variable, Image, VariableTemplate


def _rename_symbol_in_expr(expr, old, new):
    """수식 안에서 식별자(=변수 기호)만 바꾼다. 큰/작은따옴표 문자열 리터럴 안의 텍스트는 건드리지 않는다."""
    if not expr or not old or old == new:
        return expr
    out = []
    i = 0
    n = len(expr)
    in_str = False
    str_ch = None
    while i < n:
        ch = expr[i]
        if in_str:
            out.append(ch)
            if ch == '\\' and i + 1 < n:
                out.append(expr[i + 1])
                i += 2
                continue
            if ch == str_ch:
                in_str = False
                str_ch = None
            i += 1
            continue
        if ch == '"' or ch == "'":
            in_str = True
            str_ch = ch
            out.append(ch)
            i += 1
            continue
        if ch.isalpha() or ch == '_':
            j = i
            while j < n and (expr[j].isalnum() or expr[j] == '_'):
                j += 1
            ident = expr[i:j]
            out.append(new if ident == old else ident)
            i = j
            continue
        out.append(ch)
        i += 1
    return ''.join(out)


def _propagate_symbol_rename(card_id, exclude_var_id, old_symbol, new_symbol):
    """카드 내 다른 intermediate/output 변수의 수식/테이블/조건부 표현식에서 old_symbol → new_symbol 치환."""
    if not old_symbol or not new_symbol or old_symbol == new_symbol:
        return
    others = Variable.query.filter(
        Variable.card_id == card_id,
        Variable.id != exclude_var_id,
        Variable.category.in_(('intermediate', 'output')),
    ).all()
    for other in others:
        if other.var_type == 'formula':
            other.formula = _rename_symbol_in_expr(other.formula or '', old_symbol, new_symbol)
        elif other.var_type == 'table' and other.table_data:
            try:
                td = json.loads(other.table_data)
            except (ValueError, TypeError):
                continue
            if isinstance(td, dict) and td.get('key_expression'):
                td['key_expression'] = _rename_symbol_in_expr(td['key_expression'], old_symbol, new_symbol)
                other.table_data = json.dumps(td)
        elif other.var_type == 'conditional' and other.conditional_data:
            try:
                cd = json.loads(other.conditional_data)
            except (ValueError, TypeError):
                continue
            if not isinstance(cd, dict):
                continue
            for b in cd.get('branches', []) or []:
                if isinstance(b, dict):
                    if b.get('condition'):
                        b['condition'] = _rename_symbol_in_expr(b['condition'], old_symbol, new_symbol)
                    if b.get('formula'):
                        b['formula'] = _rename_symbol_in_expr(b['formula'], old_symbol, new_symbol)
            if cd.get('default_formula'):
                cd['default_formula'] = _rename_symbol_in_expr(cd['default_formula'], old_symbol, new_symbol)
            other.conditional_data = json.dumps(cd)
        elif other.var_type == 'interp_table' and other.interp_data:
            try:
                idata = json.loads(other.interp_data)
            except (ValueError, TypeError):
                continue
            if isinstance(idata, dict) and idata.get('x_expression'):
                idata['x_expression'] = _rename_symbol_in_expr(idata['x_expression'], old_symbol, new_symbol)
                other.interp_data = json.dumps(idata)

cards_bp = Blueprint('cards', __name__)
templates_bp = Blueprint('templates', __name__)


# ========================
# Variable Templates (수식 / 테이블 / 조건부 정의 본문을 이름으로 저장·재사용)
# ========================

_TEMPLATE_TYPES = ('formula', 'table', 'conditional', 'interp_table')


@templates_bp.route('', methods=['GET'])
def list_templates():
    var_type = request.args.get('var_type', '').strip()
    q = VariableTemplate.query
    if var_type:
        if var_type not in _TEMPLATE_TYPES:
            return jsonify({'error': '템플릿 타입은 formula, table, conditional 중 하나여야 합니다.'}), 400
        q = q.filter_by(var_type=var_type)
    templates = q.order_by(VariableTemplate.var_type, VariableTemplate.name).all()
    return jsonify([t.to_dict() for t in templates])


@templates_bp.route('', methods=['POST'])
def create_template():
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    var_type = (data.get('var_type') or '').strip()
    body = data.get('data', '')

    if not name:
        return jsonify({'error': '템플릿 이름을 입력해주세요.'}), 400
    if var_type not in _TEMPLATE_TYPES:
        return jsonify({'error': '템플릿 타입은 formula, table, conditional 중 하나여야 합니다.'}), 400
    if not isinstance(body, str):
        body = json.dumps(body)

    existing = VariableTemplate.query.filter_by(name=name, var_type=var_type).first()
    if existing:
        # 같은 이름·타입이면 덮어쓰기
        existing.data = body
        db.session.commit()
        return jsonify(existing.to_dict()), 200

    tpl = VariableTemplate(name=name, var_type=var_type, data=body)
    db.session.add(tpl)
    db.session.commit()
    return jsonify(tpl.to_dict()), 201


@templates_bp.route('/<int:tpl_id>', methods=['DELETE'])
def delete_template(tpl_id):
    tpl = VariableTemplate.query.get_or_404(tpl_id)
    db.session.delete(tpl)
    db.session.commit()
    return jsonify({'message': '삭제되었습니다.'}), 200

# 업로드 루트: backend/uploads/
UPLOAD_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'uploads'))
os.makedirs(UPLOAD_ROOT, exist_ok=True)
ALLOWED_IMAGE_EXTS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'}


def _get_ext(filename):
    return filename.rsplit('.', 1)[1].lower() if '.' in filename else ''


def _make_route(name):
    """카드 이름을 URL-safe 라우트로 변환"""
    route = name.strip().lower()
    route = re.sub(r'[^\w\s-]', '', route)
    route = re.sub(r'[\s]+', '-', route)
    return f'/{route}'


# ========================
# Cards
# ========================

@cards_bp.route('', methods=['GET'])
def get_cards():
    cards = Card.query.order_by(Card.sort_order, Card.created_at).all()
    return jsonify([c.to_dict() for c in cards])


@cards_bp.route('', methods=['POST'])
def create_card():
    data = request.get_json()
    name = data.get('name', '').strip()
    description = data.get('description', '').strip()

    if not name:
        return jsonify({'error': '카드 이름을 입력해주세요.'}), 400

    route = _make_route(name)

    if Card.query.filter_by(route=route).first():
        return jsonify({'error': '같은 이름의 카드가 이미 존재합니다.'}), 409

    max_order = db.session.query(db.func.max(Card.sort_order)).scalar() or 0

    card = Card(
        name=name,
        description=description,
        route=route,
        sort_order=max_order + 1,
    )
    db.session.add(card)
    db.session.commit()

    return jsonify(card.to_dict()), 201


@cards_bp.route('/<int:card_id>', methods=['DELETE'])
def delete_card(card_id):
    card = Card.query.get_or_404(card_id)
    db.session.delete(card)
    db.session.commit()
    return jsonify({'message': '삭제되었습니다.'}), 200


# ========================
# Containers
# ========================

@cards_bp.route('/<int:card_id>/containers', methods=['GET'])
def get_containers(card_id):
    Card.query.get_or_404(card_id)
    containers = Container.query.filter_by(card_id=card_id).order_by(Container.sort_order).all()
    return jsonify([c.to_dict() for c in containers])


@cards_bp.route('/<int:card_id>/containers', methods=['POST'])
def create_container(card_id):
    Card.query.get_or_404(card_id)
    data = request.get_json()
    name = data.get('name', '').strip()

    if not name:
        return jsonify({'error': '컨테이너 이름을 입력해주세요.'}), 400

    max_order = db.session.query(db.func.max(Container.sort_order)).filter(
        Container.card_id == card_id
    ).scalar() or 0

    container_type = data.get('container_type', 'default')
    if container_type not in ('default', 'input', 'output', 'hidden'):
        container_type = 'default'

    column_count = data.get('column_count', 1)
    if column_count not in (1, 2, 3, 4, 5, 6):
        column_count = 1

    # 새 컨테이너를 기존 컨테이너 아래에 배치
    existing = Container.query.filter_by(card_id=card_id).all()
    max_bottom = 0
    for c in existing:
        bottom = (c.layout_y or 0) + (c.layout_h or 4)
        if bottom > max_bottom:
            max_bottom = bottom

    container = Container(
        card_id=card_id, name=name, container_type=container_type,
        layout_x=0, layout_y=max_bottom, layout_w=12, layout_h=4,
        column_count=column_count,
        sort_order=max_order + 1,
    )
    db.session.add(container)
    db.session.commit()

    return jsonify(container.to_dict()), 201


@cards_bp.route('/<int:card_id>/containers/layout', methods=['PUT'])
def update_containers_layout(card_id):
    """컨테이너 레이아웃 일괄 업데이트 (드래그/리사이즈 완료 시 호출)"""
    Card.query.get_or_404(card_id)
    data = request.get_json()
    layouts = data.get('layouts', [])

    for item in layouts:
        ctn_id = item.get('id')
        if ctn_id is None:
            continue
        container = Container.query.filter_by(id=ctn_id, card_id=card_id).first()
        if not container:
            continue
        if 'x' in item:
            container.layout_x = item['x']
        if 'y' in item:
            container.layout_y = item['y']
        if 'w' in item:
            container.layout_w = item['w']
        if 'h' in item:
            container.layout_h = item['h']

    db.session.commit()
    containers = Container.query.filter_by(card_id=card_id).order_by(Container.sort_order).all()
    return jsonify([c.to_dict() for c in containers])


@cards_bp.route('/<int:card_id>/containers/<int:ctn_id>', methods=['PUT'])
def update_container(card_id, ctn_id):
    container = Container.query.filter_by(id=ctn_id, card_id=card_id).first_or_404()
    data = request.get_json()
    name = data.get('name', '').strip()

    if not name:
        return jsonify({'error': '컨테이너 이름을 입력해주세요.'}), 400

    container_type = data.get('container_type', container.container_type or 'default')
    if container_type not in ('default', 'input', 'output', 'hidden'):
        container_type = 'default'

    column_count = data.get('column_count', container.column_count or 1)
    if column_count not in (1, 2, 3, 4, 5, 6):
        column_count = 1

    container.name = name
    container.container_type = container_type
    container.column_count = column_count
    db.session.commit()
    return jsonify(container.to_dict())


@cards_bp.route('/<int:card_id>/containers/<int:ctn_id>', methods=['DELETE'])
def delete_container(card_id, ctn_id):
    container = Container.query.filter_by(id=ctn_id, card_id=card_id).first_or_404()
    # 해당 컨테이너에 연결된 변수/이미지의 container_id를 null로
    Variable.query.filter_by(container_id=ctn_id).update({'container_id': None})
    Image.query.filter_by(container_id=ctn_id).update({'container_id': None})
    db.session.delete(container)
    db.session.commit()
    return jsonify({'message': '삭제되었습니다.'}), 200


# ========================
# Variables
# ========================

@cards_bp.route('/<int:card_id>/variables', methods=['GET'])
def get_variables(card_id):
    Card.query.get_or_404(card_id)
    variables = Variable.query.filter_by(card_id=card_id).order_by(Variable.sort_order).all()
    return jsonify([v.to_dict() for v in variables])


@cards_bp.route('/<int:card_id>/variables', methods=['POST'])
def create_variable(card_id):
    Card.query.get_or_404(card_id)
    data = request.get_json()

    name = data.get('name', '').strip()
    category = data.get('category', '')
    var_type = data.get('var_type', '')

    if not name:
        return jsonify({'error': '변수 이름을 입력해주세요.'}), 400
    if category not in ('input', 'intermediate', 'output'):
        return jsonify({'error': '변수 구분은 input, intermediate, output 중 하나여야 합니다.'}), 400
    if category == 'input' and var_type not in ('slider', 'text', 'dropdown'):
        return jsonify({'error': 'Input 변수 타입은 slider, text, dropdown 중 하나여야 합니다.'}), 400
    if category in ('intermediate', 'output') and var_type not in ('formula', 'table', 'conditional', 'interp_table'):
        var_type = 'formula'

    container_id = data.get('container_id')
    if container_id is not None:
        Container.query.filter_by(id=container_id, card_id=card_id).first_or_404()

    max_order = db.session.query(db.func.max(Variable.sort_order)).filter(
        Variable.card_id == card_id
    ).scalar() or 0

    variable = Variable(
        card_id=card_id,
        container_id=container_id,
        name=name,
        symbol=data.get('symbol', '').strip(),
        category=category,
        var_type=var_type,
        formula=data.get('formula', '').strip() if var_type == 'formula' else '',
        table_data=data.get('table_data', '').strip() if var_type == 'table' else '',
        options_data=data.get('options_data', '').strip() if var_type == 'dropdown' else '',
        conditional_data=data.get('conditional_data', '').strip() if var_type == 'conditional' else '',
        interp_data=data.get('interp_data', '').strip() if var_type == 'interp_table' else '',
        unit=data.get('unit', '').strip(),
        min_value=data.get('min_value') if var_type == 'slider' else None,
        max_value=data.get('max_value') if var_type == 'slider' else None,
        sort_order=max_order + 1,
    )
    db.session.add(variable)
    db.session.commit()

    return jsonify(variable.to_dict()), 201


@cards_bp.route('/<int:card_id>/variables/<int:var_id>', methods=['PUT'])
def update_variable(card_id, var_id):
    variable = Variable.query.filter_by(id=var_id, card_id=card_id).first_or_404()
    data = request.get_json()

    name = data.get('name', '').strip()
    category = data.get('category', '')
    var_type = data.get('var_type', '')

    if not name:
        return jsonify({'error': '변수 이름을 입력해주세요.'}), 400
    if category not in ('input', 'intermediate', 'output'):
        return jsonify({'error': '변수 구분은 input, intermediate, output 중 하나여야 합니다.'}), 400
    if category == 'input' and var_type not in ('slider', 'text', 'dropdown'):
        return jsonify({'error': 'Input 변수 타입은 slider, text, dropdown 중 하나여야 합니다.'}), 400
    if category in ('intermediate', 'output') and var_type not in ('formula', 'table', 'conditional', 'interp_table'):
        var_type = 'formula'

    container_id = data.get('container_id')
    if container_id is not None:
        Container.query.filter_by(id=container_id, card_id=card_id).first_or_404()

    old_symbol = variable.symbol or ''
    new_symbol = data.get('symbol', '').strip()

    variable.name = name
    variable.symbol = new_symbol
    variable.category = category
    variable.var_type = var_type
    variable.formula = data.get('formula', '').strip() if var_type == 'formula' else ''
    variable.table_data = data.get('table_data', '').strip() if var_type == 'table' else ''
    variable.options_data = data.get('options_data', '').strip() if var_type == 'dropdown' else ''
    variable.conditional_data = data.get('conditional_data', '').strip() if var_type == 'conditional' else ''
    variable.interp_data = data.get('interp_data', '').strip() if var_type == 'interp_table' else ''
    variable.unit = data.get('unit', '').strip()
    # container_id는 요청에 명시적으로 있을 때만 변경 (위젯 배치 탭에서 별도 관리)
    if 'container_id' in data:
        variable.container_id = container_id
    variable.min_value = data.get('min_value') if var_type == 'slider' else None
    variable.max_value = data.get('max_value') if var_type == 'slider' else None

    _propagate_symbol_rename(card_id, var_id, old_symbol, new_symbol)

    db.session.commit()
    return jsonify(variable.to_dict())


@cards_bp.route('/<int:card_id>/variables/<int:var_id>', methods=['DELETE'])
def delete_variable(card_id, var_id):
    variable = Variable.query.filter_by(id=var_id, card_id=card_id).first_or_404()
    db.session.delete(variable)
    db.session.commit()
    return jsonify({'message': '삭제되었습니다.'}), 200


# ========================
# Images
# ========================

@cards_bp.route('/<int:card_id>/images', methods=['GET'])
def get_images(card_id):
    Card.query.get_or_404(card_id)
    images = Image.query.filter_by(card_id=card_id).order_by(Image.sort_order).all()
    return jsonify([i.to_dict() for i in images])


@cards_bp.route('/<int:card_id>/images', methods=['POST'])
def upload_image(card_id):
    Card.query.get_or_404(card_id)
    if 'file' not in request.files:
        return jsonify({'error': '파일이 없습니다.'}), 400
    file = request.files['file']
    if not file.filename:
        return jsonify({'error': '파일이 없습니다.'}), 400
    ext = _get_ext(file.filename)
    if ext not in ALLOWED_IMAGE_EXTS:
        return jsonify({'error': f'지원하지 않는 형식입니다. ({", ".join(sorted(ALLOWED_IMAGE_EXTS))})'}), 400

    container_id_raw = request.form.get('container_id')
    container_id = None
    if container_id_raw and container_id_raw != 'null':
        try:
            container_id = int(container_id_raw)
        except ValueError:
            return jsonify({'error': '컨테이너 ID가 잘못되었습니다.'}), 400
        Container.query.filter_by(id=container_id, card_id=card_id).first_or_404()

    stored = f'{uuid.uuid4().hex}.{ext}'
    card_dir = os.path.join(UPLOAD_ROOT, str(card_id))
    os.makedirs(card_dir, exist_ok=True)
    file.save(os.path.join(card_dir, stored))

    max_order = db.session.query(db.func.max(Image.sort_order)).filter(
        Image.card_id == card_id
    ).scalar() or 0

    image = Image(
        card_id=card_id,
        container_id=container_id,
        filename=secure_filename(file.filename) or f'image.{ext}',
        stored_name=stored,
        mime_type=file.mimetype or f'image/{ext}',
        sort_order=max_order + 1,
    )
    db.session.add(image)
    db.session.commit()
    return jsonify(image.to_dict()), 201


@cards_bp.route('/<int:card_id>/images/<int:img_id>', methods=['PUT'])
def update_image(card_id, img_id):
    image = Image.query.filter_by(id=img_id, card_id=card_id).first_or_404()
    data = request.get_json() or {}

    if 'container_id' in data:
        container_id = data.get('container_id')
        if container_id is not None:
            Container.query.filter_by(id=container_id, card_id=card_id).first_or_404()
        image.container_id = container_id

    db.session.commit()
    return jsonify(image.to_dict())


@cards_bp.route('/<int:card_id>/images/<int:img_id>', methods=['DELETE'])
def delete_image(card_id, img_id):
    image = Image.query.filter_by(id=img_id, card_id=card_id).first_or_404()
    path = os.path.join(UPLOAD_ROOT, str(card_id), image.stored_name)
    if os.path.exists(path):
        try:
            os.remove(path)
        except OSError:
            pass
    db.session.delete(image)
    db.session.commit()
    return jsonify({'message': '삭제되었습니다.'}), 200


@cards_bp.route('/<int:card_id>/images/<int:img_id>/file', methods=['GET'])
def serve_image(card_id, img_id):
    image = Image.query.filter_by(id=img_id, card_id=card_id).first_or_404()
    card_dir = os.path.join(UPLOAD_ROOT, str(card_id))
    return send_from_directory(card_dir, image.stored_name, mimetype=image.mime_type)


# ========================
# Widget layout (변수 + 이미지의 컨테이너 배치·순서 일괄 업데이트)
# ========================

@cards_bp.route('/<int:card_id>/widgets/layout', methods=['PUT'])
def update_widget_layout(card_id):
    """위젯 배치 탭에서 호출 — 변수/이미지의 container_id와 sort_order 일괄 설정."""
    Card.query.get_or_404(card_id)
    data = request.get_json() or {}
    var_updates = data.get('variables', [])
    img_updates = data.get('images', [])

    # 유효 컨테이너 ID 세트 (존재 확인용)
    valid_container_ids = {c.id for c in Container.query.filter_by(card_id=card_id).all()}

    def _resolve_container(raw):
        if raw is None:
            return None
        if raw not in valid_container_ids:
            return None
        return raw

    for v in var_updates:
        vid = v.get('id')
        if vid is None:
            continue
        variable = Variable.query.filter_by(id=vid, card_id=card_id).first()
        if not variable:
            continue
        if 'container_id' in v:
            variable.container_id = _resolve_container(v['container_id'])
        if 'sort_order' in v:
            variable.sort_order = int(v['sort_order'])

    for i in img_updates:
        iid = i.get('id')
        if iid is None:
            continue
        image = Image.query.filter_by(id=iid, card_id=card_id).first()
        if not image:
            continue
        if 'container_id' in i:
            image.container_id = _resolve_container(i['container_id'])
        if 'sort_order' in i:
            image.sort_order = int(i['sort_order'])

    db.session.commit()
    return jsonify({'message': 'ok'})
