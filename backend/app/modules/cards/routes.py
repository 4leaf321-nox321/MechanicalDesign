import os
import re
import json
import uuid
from datetime import datetime

from flask import Blueprint, g, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
from app.extensions import db
from app.shared.auth import current_user
from . import expressions, revisions, tables, validation
from .models import (Card, CardRevision, Container, Variable, Image,
                     VariableTemplate, WidgetPlacement)


def _propagate_symbol_rename(card_id, exclude_var_id, old_symbol, new_symbol):
    """기호를 바꾸면 그 기호를 쓰던 다른 변수의 수식도 함께 고친다.

    어느 자리에 수식이 들어 있는지는 `expressions` 모듈이 안다. 여기서 타입별로
    분기하지 않는 이유는, 예전에 그렇게 했다가 테이블 정의 모양이 바뀔 때 한쪽만
    고쳐 조회 키가 조용히 옛 기호를 붙들고 있던 사고가 있었기 때문이다.
    """
    if not old_symbol or not new_symbol or old_symbol == new_symbol:
        return
    others = Variable.query.filter(
        Variable.card_id == card_id,
        Variable.id != exclude_var_id,
        Variable.var_type.in_(expressions.EXPRESSION_TYPES),
    ).all()
    for other in others:
        expressions.rename_symbol(other, old_symbol, new_symbol)


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


def _reference_users(tpl_id):
    """이 표를 참조하는 변수 목록. 참조는 table 타입 변수만 건다."""
    users = []
    for variable in Variable.query.filter_by(var_type='table').all():
        if tables.referenced_template_id(variable.table_data) == tpl_id:
            card = db.session.get(Card, variable.card_id)
            users.append({
                'variable_id': variable.id,
                'variable_name': variable.name,
                'card_id': variable.card_id,
                'card_name': card.name if card else None,
            })
    return users


@templates_bp.route('/<int:tpl_id>/usage', methods=['GET'])
def template_usage(tpl_id):
    """이 표를 몇 개 변수가 참조하는가.

    원본을 고치기 전에 "이 수정이 어디까지 퍼지는지" 를 보여 주는 데 쓴다.
    참조를 걸어 두면 한 곳을 고쳐 여러 곳이 바뀌는데, 그게 장점이자 사고의
    원인이기도 하다.
    """
    VariableTemplate.query.get_or_404(tpl_id)
    return jsonify({'users': _reference_users(tpl_id)})


@templates_bp.route('/<int:tpl_id>', methods=['PUT'])
def update_template(tpl_id):
    """표 원본 수정 — 참조하는 변수 전부에 반영된다."""
    tpl = VariableTemplate.query.get_or_404(tpl_id)
    data = request.get_json() or {}

    if 'name' in data:
        name = (data.get('name') or '').strip()
        if not name:
            return jsonify({'error': '템플릿 이름을 입력해주세요.'}), 400
        duplicate = VariableTemplate.query.filter(
            VariableTemplate.id != tpl_id,
            VariableTemplate.name == name,
            VariableTemplate.var_type == tpl.var_type,
        ).first()
        if duplicate:
            return jsonify({'error': f'같은 이름의 템플릿이 이미 있습니다: {name}'}), 409
        tpl.name = name

    if 'data' in data:
        body = data.get('data', '')
        if not isinstance(body, str):
            body = json.dumps(body)
        tpl.data = body

    db.session.commit()
    return jsonify(tpl.to_dict())


@templates_bp.route('/<int:tpl_id>', methods=['DELETE'])
def delete_template(tpl_id):
    tpl = VariableTemplate.query.get_or_404(tpl_id)

    # **참조 중이면 지우지 않는다.** 지우면 그 변수들은 열도 행도 없는 상태가
    # 되어 계산이 멈추는데, 화면에는 "표가 비었다" 로만 보여 원인을 찾기 어렵다.
    # 정말 지우려면 각 변수에서 참조를 먼저 풀어야 한다(복사본으로 전환).
    users = _reference_users(tpl_id)
    if users:
        where = ', '.join(f"{u['card_name']}/{u['variable_name']}" for u in users[:5])
        more = f" 외 {len(users) - 5}개" if len(users) > 5 else ''
        return jsonify({
            'error': f'이 표를 참조하는 변수가 {len(users)}개 있어 삭제할 수 없습니다: {where}{more}',
            'code': 'MD-TEMPLATES-0001',
            'users': users,
        }), 409

    db.session.delete(tpl)
    db.session.commit()
    return jsonify({'message': '삭제되었습니다.'}), 200

# 업로드 루트.
#
# 기본값은 backend/uploads/ 지만, 운영 배포는 UPLOAD_DIR 로 앱 폴더 **바깥**을
# 가리킨다. 배포는 <AppPath> 를 통째로 교체하므로 업로드가 앱 폴더 안에 있으면
# 새 버전을 올릴 때마다 사용자가 올린 이미지가 함께 사라진다.
UPLOAD_ROOT = os.environ.get('UPLOAD_DIR') or os.path.join(
    os.path.dirname(__file__), '..', '..', '..', 'uploads')
UPLOAD_ROOT = os.path.abspath(UPLOAD_ROOT)
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

# ========================
# 초안 가시성 — 한 곳에서만 막는다
# ========================

def _acting_via_token():
    """이 요청이 사람의 브라우저가 아니라 **기계**(MCP·스크립트)에서 왔는가.

    `app.shared.auth` 가 개인 액세스 토큰으로 인증했을 때 표시해 둔다. 권한
    경계가 아니라 **누가 눌렀는가**의 문제다 — 토큰은 어차피 그 사람 권한으로
    돌지만, 그 사람이 화면을 보고 눌렀는지는 전혀 다른 얘기다.
    """
    return bool(getattr(g, 'via_token', False))


def guard_draft_visibility():
    """초안은 만든 사람과 관리자에게만 보인다. 블루프린트 전체에 건다.

    **라우트마다 확인하지 않는다.** 카드 하위 자원이 열 몇 개(변수·컨테이너·
    이미지·배치·검증)라, 새 엔드포인트를 하나 추가하면서 확인 한 줄을 빠뜨리면
    그 자리로 초안이 조용히 새어 나간다. 아무 오류도 나지 않아 눈으로만 찾을 수
    있는 종류의 구멍이다.

    `card_id` 를 URL 에 가진 **모든** 요청이 여기를 지나므로 빠뜨릴 자리가 없다.

    **여기서 `@cards_bp.before_request` 를 쓰지 않는다.** Flask 는 등록된
    순서대로 부르는데, 이 모듈이 import 될 때 데코레이터가 먼저 걸리면 인증보다
    앞서 돌게 된다. 그러면 `current_user()` 가 아직 없는 사용자를 찾다가 인증이
    내야 할 오류를 대신 내고, 순서가 왜 그런지는 코드 어디에도 안 보인다.
    등록은 보호를 거는 곳(app/__init__.py)에서 인증 다음에 명시적으로 한다.
    """
    if request.method == 'OPTIONS':
        return None
    card_id = (request.view_args or {}).get('card_id')
    if card_id is None:
        return None
    card = db.session.get(Card, card_id)
    if card is None:
        return None  # 없는 카드는 각 라우트의 404 가 처리한다
    if not card.is_visible_to(current_user()):
        # 있다는 사실 자체를 알려 주지 않는다 — 없는 것과 같이 답한다.
        return jsonify({'error': '카드를 찾을 수 없습니다.'}), 404
    return None


#: 자료를 바꾸는 메서드. 읽기만 하는 호출까지 흔적으로 남기면 "AI 가 손댄 카드"
#: 라는 표시가 곧 "AI 가 열어 본 적 있는 카드" 가 되어 아무 뜻도 없어진다.
_WRITE_METHODS = ('POST', 'PUT', 'PATCH', 'DELETE')


def record_card_change(response):
    """기계가 카드를 고쳤으면 그 시각을 남긴다.

    **성공한 요청만 남긴다.** 400 으로 거절된 시도까지 흔적이 되면, 아무것도
    바뀌지 않은 카드에 "AI 가 수정함" 이 붙는다.

    `before_request` 가 아니라 여기인 이유가 그것이다 — 요청 전에는 그 쓰기가
    성공할지 알 수 없다.

    라우트마다 부르지 않는 이유는 가시성 가드와 같다. 카드 하위 자원이 열 몇
    개라, 새 엔드포인트에서 이 한 줄을 빠뜨리면 그 경로로만 흔적이 안 남는다.
    그러면 표시가 있는 것보다 나쁘다 — 없는 것을 보고 사람이 안심한다.
    """
    if request.method not in _WRITE_METHODS:
        return response
    if response.status_code >= 400:
        return response

    card_id = (request.view_args or {}).get('card_id')
    if card_id is None:
        # 카드 자체를 만드는 POST /api/cards 는 view_args 에 card_id 가 없다.
        # 그쪽은 만드는 자리에서 직접 찍는다.
        return response

    card = db.session.get(Card, card_id)
    if card is None:
        return response  # 방금 지운 카드. 남길 곳이 없다.

    via_token = _acting_via_token()
    if via_token:
        card.ai_touched_at = datetime.utcnow()
        db.session.commit()

    # **변경 이력은 사람이 고쳤든 기계가 고쳤든 남긴다.**
    #
    # 정의가 실제로 달라졌을 때만 행이 생긴다(revisions.record 가 앞 스냅샷과
    # 비교한다). 그래서 컨테이너를 드래그하거나 이미지를 옮기는 요청은 여기를
    # 지나가도 이력을 만들지 않는다 — 어떤 요청이 정의를 바꾸는지 목록으로
    # 관리하지 않아도 되는 이유다. 목록은 언젠가 빠뜨리고, 빠뜨린 자리는
    # 아무 오류도 내지 않는다.
    actor = getattr(g, 'current_user', None)
    revisions.record(card_id, actor.id if actor else None, via_token)
    return response


@cards_bp.route('', methods=['GET'])
def get_cards():
    """게시된 카드 + 내 초안. 관리자는 모든 초안을 본다."""
    actor = current_user()
    query = Card.query
    if not actor.is_admin:
        # 남의 초안은 목록에 아예 넣지 않는다. 화면에서 거르면 응답에는
        # 이미 실려 나간 뒤라, 개발자도구만 열면 그대로 보인다.
        query = query.filter(db.or_(Card.status != 'draft',
                                    Card.created_by_id == actor.id))
    cards = query.order_by(Card.sort_order, Card.created_at).all()
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

    # **밖에서 만든 카드는 초안이다.**
    #
    # 판정을 요청 본문이 아니라 **어떻게 인증했는가**로 한다. 본문의
    # 값을 믿으면 AI 가 published 라고 적어 보내는 순간 검토 단계가
    # 사라진다 — 지키는 쪽이 정하지 않는 규칙은 규칙이 아니다.
    #
    # 사람이 웹에서 만들 때는 예전 그대로 바로 게시된다. 만든 사람이
    # 화면 앞에 있고, 이상하면 그 자리에서 고친다.
    via_token = _acting_via_token()
    if via_token:
        status = 'draft'
    else:
        status = 'draft' if data.get('draft') else 'published'

    card = Card(
        name=name,
        description=description,
        route=route,
        sort_order=max_order + 1,
        created_by_id=current_user().id,
        status=status,
        origin='mcp' if via_token else 'human',
    )
    if via_token:
        # 만드는 것도 쓰기다. after_request 훅은 card_id 가 URL 에 있는
        # 요청만 보므로 여기서 직접 찍는다.
        card.ai_touched_at = datetime.utcnow()
    if status == 'published':
        card.published_at = datetime.utcnow()
        card.published_by_id = card.created_by_id
    db.session.add(card)
    db.session.commit()

    return jsonify(card.to_dict()), 201


@cards_bp.route('/<int:card_id>/revisions', methods=['GET'])
def list_revisions(card_id):
    """이 카드가 언제 누구에 의해 어떻게 바뀌었나. 최신순.

    스냅샷은 싣지 않는다 — 이력이 스무 개면 응답이 변수 정의 스무 벌이 된다.
    목록은 "무엇이 바뀌었나" 만 답하면 되고, 그건 `changes` 에 미리 계산돼 있다.
    """
    Card.query.get_or_404(card_id)
    rows = (CardRevision.query.filter_by(card_id=card_id)
            .order_by(CardRevision.id.desc()).limit(100).all())
    return jsonify([r.to_dict() for r in rows])


@cards_bp.route('/<int:card_id>/revisions/<int:revision_id>', methods=['GET'])
def get_revision(card_id, revision_id):
    """그 시점의 정의 전부."""
    Card.query.get_or_404(card_id)
    row = CardRevision.query.filter_by(id=revision_id, card_id=card_id).first_or_404()
    return jsonify(row.to_dict(full=True))


@cards_bp.route('/<int:card_id>/revisions/<int:revision_id>/restore', methods=['POST'])
def restore_revision(card_id, revision_id):
    """그 시점의 정의로 되돌린다 — **사람만 할 수 있다.**

    게시와 같은 이유다. 되돌리기는 지금 화면에서 쓰이고 있는 계산을 통째로
    바꾸는 일이고, 어느 시점으로 되돌릴지는 사람이 내용을 보고 판단해야 한다.
    기계가 스스로 되돌릴 수 있으면 그 판단이 사라진다.

    **되돌리기 자체도 이력에 남는다.** 남지 않으면 "어제 값이 달랐는데" 를
    되짚을 때 그 자리가 구멍이 된다.
    """
    Card.query.get_or_404(card_id)
    row = CardRevision.query.filter_by(id=revision_id, card_id=card_id).first_or_404()

    if _acting_via_token():
        return jsonify({
            'error': ('되돌리기는 사람이 웹에서 해야 합니다. 어느 시점으로 되돌릴지는 '
                      '내용을 보고 판단하는 일이기 때문입니다.'),
            'code': 'MD-CARDS-0101',
        }), 403

    actor = current_user()
    if not (actor.is_admin or Card.query.get(card_id).created_by_id == actor.id):
        return jsonify({
            'error': '이 카드를 만든 사람이나 관리자만 되돌릴 수 있습니다.',
            'code': 'MD-CARDS-0102',
        }), 403

    target = row.to_dict(full=True)['snapshot']
    if not target:
        return jsonify({
            'error': '이 시점에는 변수가 없었습니다. 되돌리면 카드가 비게 됩니다.',
            'code': 'MD-CARDS-0106',
        }), 400

    # **지우고 다시 넣는다.** 지금 변수와 하나씩 맞춰 고치는 방식은, 그 뒤에
    # 추가된 변수를 어떻게 할지 매번 판단해야 하고 그 판단이 곧 버그가 된다.
    # id 를 그대로 살려 넣으므로 위젯 배치와 계산 기록의 참조가 유지된다.
    Variable.query.filter_by(card_id=card_id).delete()
    db.session.flush()

    for item in target:
        db.session.add(Variable(
            id=item.get('id'),
            card_id=card_id,
            name=item.get('name') or '',
            symbol=item.get('symbol') or '',
            category=item.get('category') or 'input',
            var_type=item.get('var_type') or 'text',
            formula=item.get('formula') or '',
            table_data=item.get('table_data') or '',
            options_data=item.get('options_data') or '',
            conditional_data=item.get('conditional_data') or '',
            interp_data=item.get('interp_data') or '',
            unit=item.get('unit') or '',
            min_value=item.get('min_value'),
            max_value=item.get('max_value'),
            sort_order=item.get('sort_order') or 0,
        ))
    db.session.commit()

    # id 를 직접 넣었으므로 시퀀스가 뒤처져 있다. 그대로 두면 **다음에 만드는
    # 변수가 이미 있는 id 를 받아** 저장이 실패한다.
    db.session.execute(db.text(
        "SELECT setval(pg_get_serial_sequence('variables', 'id'), "
        "COALESCE((SELECT MAX(id) FROM variables), 1))"
    ))
    db.session.commit()

    saved = revisions.record(card_id, actor.id, via_token=False)
    return jsonify({
        'message': '되돌렸습니다.',
        'revision': saved.to_dict() if saved is not None else None,
        'restored_from': row.to_dict(),
    })


@cards_bp.route('/<int:card_id>/publish', methods=['POST'])
def publish_card(card_id):
    """초안을 게시한다 — **사람만 할 수 있다.**

    이 흐름의 전부가 여기 있다. AI 는 카드를 만들 수 있지만 게시할 수 없고,
    사람은 게시하기 전에 화면에서 계산을 돌려 볼 수 있다. 그 사이에 사람 한
    명을 세우는 것이 목적이다.

    개인 액세스 토큰으로는 막는다. 토큰은 그 사람 권한으로 돌지만, **그 사람이
    숫자를 보고 눌렀는지**는 전혀 다른 얘기다. 토큰에게도 열어 주면 AI 가
    만들고 곧바로 스스로 게시할 수 있게 되어 검토 단계가 이름만 남는다.

    검증을 통과해야 한다 — 계산이 안 되는 카드를 게시하면 그것을 연 사람은
    빈 화면을 보고 무엇이 잘못됐는지 알 수 없다.
    """
    card = Card.query.get_or_404(card_id)

    if _acting_via_token():
        return jsonify({
            'error': ('게시는 사람이 웹에서 해야 합니다. 토큰(MCP·스크립트)으로는 게시할 수 '
                      '없습니다 — 사람이 숫자를 보고 판단하는 단계이기 때문입니다.'),
            'code': 'MD-CARDS-0101',
        }), 403

    actor = current_user()
    if not (actor.is_admin or card.created_by_id == actor.id):
        return jsonify({
            'error': '이 초안을 만든 사람이나 관리자만 게시할 수 있습니다.',
            'code': 'MD-CARDS-0102',
        }), 403

    if not card.is_draft:
        return jsonify({'error': '이미 게시된 카드입니다.', 'code': 'MD-CARDS-0103'}), 409

    variables = Variable.query.filter_by(card_id=card_id).order_by(Variable.sort_order).all()
    if not variables:
        return jsonify({
            'error': '변수가 없는 카드는 게시할 수 없습니다.',
            'code': 'MD-CARDS-0104',
        }), 400

    raw_values = (request.get_json(silent=True) or {}).get('values') or {}
    values = {}
    for key, value in raw_values.items():
        try:
            values[int(key)] = value
        except (TypeError, ValueError):
            return jsonify({'error': f'값의 키는 변수 id 여야 합니다: {key}'}), 400

    report = validation.validate_card(variables, values)
    errors = [i for i in report['issues'] if i['level'] == 'error']

    # **정의가 어긋난 것만 막는다.**
    #
    # 입력값을 안 주면 입력 변수마다 '값 없음' 이 나고 그것을 쓰는 수식이
    # 줄줄이 실패한다. 그건 정의의 결함이 아니라 그냥 빈 입력이다 — 그것까지
    # 막으면 게시하려는 사람이 매번 대표 입력값을 손으로 채워야 하고, 결국
    # 아무 숫자나 넣어 통과시키는 요식이 된다.
    #
    # 대신 **값을 준 경우에는 계산 실패도 막는다.** 그 값으로 계산해 보라고
    # 한 것이므로, 안 되면 그건 진짜 신호다.
    blocking = [i for i in errors if i.get('source') != 'trial' or values]
    if blocking:
        return jsonify({
            'error': '검증을 통과하지 못해 게시할 수 없습니다.',
            'code': 'MD-CARDS-0105',
            'validation': report,
        }), 400

    # **시험 계산이 못 돈 것은 막지 않는다.**
    #
    # 서버에 Node.js 가 없으면 정적 검사까지만 돈다. 여기서 게시를 막으면 선택
    # 기능 하나가 없다는 이유로 카드를 아무도 못 올리게 된다. 대신 그 사실을
    # 응답에 실어 보내 화면이 사람에게 알린다 — 검사가 덜 됐다는 것을 숨기지
    # 않으면서 일은 진행되게 한다.
    card.status = 'published'
    card.published_at = datetime.utcnow()
    card.published_by_id = actor.id
    db.session.commit()

    return jsonify({
        'card': card.to_dict(),
        'validation': report,
        'message': '게시되었습니다.',
    })


@cards_bp.route('/<int:card_id>/unpublish', methods=['POST'])
def unpublish_card(card_id):
    """게시를 내려 초안으로 되돌린다 — 지우지 않는다.

    잘못된 카드를 발견했을 때 지우는 것 말고 할 수 있는 일이 있어야 한다.
    지우면 그 카드로 이미 계산해 본 사람의 근거가 통째로 사라지고, 고쳐서 다시
    올릴 수도 없다.
    """
    card = Card.query.get_or_404(card_id)

    if _acting_via_token():
        return jsonify({
            'error': '내리기도 사람이 웹에서 해야 합니다.',
            'code': 'MD-CARDS-0101',
        }), 403

    actor = current_user()
    if not (actor.is_admin or card.created_by_id == actor.id):
        return jsonify({
            'error': '이 카드를 만든 사람이나 관리자만 내릴 수 있습니다.',
            'code': 'MD-CARDS-0102',
        }), 403

    if card.is_draft:
        return jsonify({'error': '이미 초안입니다.', 'code': 'MD-CARDS-0103'}), 409

    card.status = 'draft'
    card.published_at = None
    card.published_by_id = None
    db.session.commit()
    return jsonify({'card': card.to_dict(), 'message': '초안으로 내렸습니다.'})


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
    # 이 컨테이너의 배치 행만 사라진다(cascade). 변수·이미지 자체는 남고,
    # 다른 컨테이너에 함께 놓여 있었다면 그쪽 배치도 그대로다.
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
    # 'array' 는 값을 여러 개 담는 입력이다. 수식에서는 집계(sum·max…)와
    # 원소별 계산(add·mul…) 함수로 다룬다.
    if category == 'input' and var_type not in ('slider', 'text', 'dropdown', 'array'):
        return jsonify({'error': 'Input 변수 타입은 slider, text, dropdown, array 중 하나여야 합니다.'}), 400
    if category in ('intermediate', 'output') and var_type not in ('formula', 'table', 'conditional', 'interp_table'):
        var_type = 'formula'

    # 배치(어느 컨테이너에 보이는가)는 여기서 받지 않는다. 위젯 배치 탭의
    # PUT /widgets/layout 한 곳이 전담한다 — 들어오는 문이 둘이면 어긋난다.
    max_order = db.session.query(db.func.max(Variable.sort_order)).filter(
        Variable.card_id == card_id
    ).scalar() or 0

    variable = Variable(
        card_id=card_id,
        name=name,
        symbol=data.get('symbol', '').strip(),
        category=category,
        var_type=var_type,
        formula=data.get('formula', '').strip() if var_type == 'formula' else '',
        table_data=tables.to_storage(data.get('table_data', '').strip()) if var_type == 'table' else '',
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
    # 'array' 는 값을 여러 개 담는 입력이다. 수식에서는 집계(sum·max…)와
    # 원소별 계산(add·mul…) 함수로 다룬다.
    if category == 'input' and var_type not in ('slider', 'text', 'dropdown', 'array'):
        return jsonify({'error': 'Input 변수 타입은 slider, text, dropdown, array 중 하나여야 합니다.'}), 400
    if category in ('intermediate', 'output') and var_type not in ('formula', 'table', 'conditional', 'interp_table'):
        var_type = 'formula'

    old_symbol = variable.symbol or ''
    new_symbol = data.get('symbol', '').strip()

    variable.name = name
    variable.symbol = new_symbol
    variable.category = category
    variable.var_type = var_type
    variable.formula = data.get('formula', '').strip() if var_type == 'formula' else ''
    variable.table_data = tables.to_storage(data.get('table_data', '').strip()) if var_type == 'table' else ''
    variable.options_data = data.get('options_data', '').strip() if var_type == 'dropdown' else ''
    variable.conditional_data = data.get('conditional_data', '').strip() if var_type == 'conditional' else ''
    variable.interp_data = data.get('interp_data', '').strip() if var_type == 'interp_table' else ''
    variable.unit = data.get('unit', '').strip()
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

    # 배치는 위젯 배치 탭이 전담한다. 올린 직후에는 팔레트에만 있고,
    # 어디에 보일지는 그 탭에서 정한다.
    stored = f'{uuid.uuid4().hex}.{ext}'
    card_dir = os.path.join(UPLOAD_ROOT, str(card_id))
    os.makedirs(card_dir, exist_ok=True)
    file.save(os.path.join(card_dir, stored))

    max_order = db.session.query(db.func.max(Image.sort_order)).filter(
        Image.card_id == card_id
    ).scalar() or 0

    image = Image(
        card_id=card_id,
        filename=secure_filename(file.filename) or f'image.{ext}',
        stored_name=stored,
        mime_type=file.mimetype or f'image/{ext}',
        sort_order=max_order + 1,
    )
    db.session.add(image)
    db.session.commit()
    return jsonify(image.to_dict()), 201


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

@cards_bp.route('/<int:card_id>/validate', methods=['POST'])
def validate_card(card_id):
    """이 카드의 정의가 실제로 계산되는지 확인한다.

    화면에서 사람이 만들 때는 만든 사람이 바로 계산 버튼을 눌러 본다. 밖에서
    API 로 만들 때는 그 확인이 없어서, 없는 기호를 참조하거나 순환 참조인 정의가
    조용히 저장된다. **AI 가 만든 정의는 특히 그럴듯하게 틀린다.**

    요청(모두 선택):
      {"values": {"<변수id>": 값}}   시험 계산에 쓸 입력. 없으면 기본값

    응답:
      {"ok": true|false,
       "issues": [{level, variable_id, variable_name, symbol, message}],
       "results": [{variable_id, variable_name, symbol, value, error}],
       "trial_skipped": null | "사유"}

    `ok` 는 오류가 하나도 없고 **시험 계산까지 실제로 돌았을 때만** true 다.
    계산을 못 돌린 채 통과로 보이면 검증을 붙인 의미가 없다.
    """
    Card.query.get_or_404(card_id)
    data = request.get_json(silent=True) or {}

    raw_values = data.get('values') or {}
    values = {}
    for key, value in raw_values.items():
        try:
            values[int(key)] = value
        except (TypeError, ValueError):
            return jsonify({'error': f'값의 키는 변수 id 여야 합니다: {key}'}), 400

    variables = Variable.query.filter_by(card_id=card_id).order_by(Variable.sort_order).all()
    if not variables:
        return jsonify({
            'ok': False,
            'issues': [{'level': 'error', 'source': 'static', 'variable_id': None,
                        'variable_name': None, 'symbol': '',
                        'message': '이 카드에는 변수가 없습니다.'}],
            'results': [],
            'trial_skipped': None,
        })

    return jsonify(validation.validate_card(variables, values))


@cards_bp.route('/<int:card_id>/widgets/layout', methods=['PUT'])
def update_widget_layout(card_id):
    """위젯 배치 탭에서 호출 — 이 카드의 배치를 **통째로** 갈아 끼운다.

    보내는 것은 "지금 화면이 이런 상태다" 이지 "이것만 바꿔라" 가 아니다.
    부분 갱신이면 클라이언트가 삭제된 배치를 따로 알려 줘야 하는데, 한 위젯이
    여러 컨테이너에 놓일 수 있게 된 뒤로 그 목록을 정확히 만들기가 어렵다.
    전체 상태를 받으면 서버가 지우고 다시 넣기만 하면 된다.

    요청:
      {"containers": [{"container_id": 3,
                       "widgets": [{"kind": "variable", "id": 7},
                                   {"kind": "image", "id": 2}]}]}

    목록에 없는 위젯은 미배치가 된다(팔레트에만 남는다).
    """
    Card.query.get_or_404(card_id)
    data = request.get_json() or {}
    groups = data.get('containers', [])
    if not isinstance(groups, list):
        return jsonify({'error': 'containers 는 배열이어야 합니다.'}), 400

    valid_container_ids = {c.id for c in Container.query.filter_by(card_id=card_id).all()}
    valid_variable_ids = {v.id for v in Variable.query.filter_by(card_id=card_id).all()}
    valid_image_ids = {i.id for i in Image.query.filter_by(card_id=card_id).all()}

    rows = []
    # 같은 컨테이너에 같은 위젯이 두 번 오면 유니크 제약에 걸린다. 그건 클라이언트
    # 버그이지 사용자 의도가 아니므로 조용히 하나로 접는다 — 저장이 통째로
    # 실패하면 사용자는 배치를 전부 잃는다.
    seen = set()

    for group in groups:
        if not isinstance(group, dict):
            continue
        container_id = group.get('container_id')
        if container_id not in valid_container_ids:
            return jsonify({'error': f'이 카드의 컨테이너가 아닙니다: {container_id}'}), 400

        for index, widget in enumerate(group.get('widgets') or []):
            if not isinstance(widget, dict):
                continue
            kind = widget.get('kind')
            wid = widget.get('id')
            if kind == 'variable':
                if wid not in valid_variable_ids:
                    return jsonify({'error': f'이 카드의 변수가 아닙니다: {wid}'}), 400
                key = (container_id, 'v', wid)
                if key in seen:
                    continue
                seen.add(key)
                rows.append(WidgetPlacement(card_id=card_id, container_id=container_id,
                                            variable_id=wid, sort_order=index))
            elif kind == 'image':
                if wid not in valid_image_ids:
                    return jsonify({'error': f'이 카드의 이미지가 아닙니다: {wid}'}), 400
                key = (container_id, 'i', wid)
                if key in seen:
                    continue
                seen.add(key)
                rows.append(WidgetPlacement(card_id=card_id, container_id=container_id,
                                            image_id=wid, sort_order=index))
            else:
                return jsonify({'error': f"kind 는 variable 또는 image 여야 합니다: {kind}"}), 400

    # **검증을 모두 통과한 뒤에 지운다.** 먼저 지우고 넣다가 중간에 400 을 내면
    # 배치가 사라진 채로 끝난다.
    WidgetPlacement.query.filter_by(card_id=card_id).delete(synchronize_session=False)
    db.session.add_all(rows)
    db.session.commit()
    return jsonify({'message': 'ok', 'placements': len(rows)})
