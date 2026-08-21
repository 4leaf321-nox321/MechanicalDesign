"""계산 기록 API.

저장은 **카드 밑**(`POST /api/cards/<id>/records`)이 아니라 여기 있다. 조회가
카드를 가로질러야 하기 때문이다 — 사람이 찾는 것은 "이 카드의 기록" 보다
"내가 지난주에 한 그 계산" 인 경우가 많고, 카드가 지워진 기록도 찾을 수 있어야
한다.
"""

import json

from flask import Blueprint, jsonify, request

from app.extensions import db
from app.modules.cards.models import Card, Variable
from app.shared.auth import current_user

from .models import CalculationRecord

records_bp = Blueprint('records', __name__)

MAX_TITLE = 200
PAGE_SIZE = 50


def _snapshot(card_id):
    """계산 당시의 변수 정의를 통째로 뜬다.

    **클라이언트가 보낸 정의를 믿지 않는다.** 기록의 값어치는 "그때 정말 이
    정의였다" 는 데 있는데, 그것을 브라우저가 적어 보내면 그냥 주장일 뿐이다.
    서버가 자기 DB 에서 뜬다.
    """
    variables = (Variable.query.filter_by(card_id=card_id)
                 .order_by(Variable.sort_order).all())
    return [v.to_dict() for v in variables]


@records_bp.route('', methods=['POST'])
def create_record():
    """계산 결과를 남긴다.

    요청:
      {"card_id": 3, "title": "Model X 브래킷 볼트", "note": "...",
       "inputs": {"<변수id>": 값}, "results": {"<변수id>": {"value":…, "error":…}}}

    결과는 브라우저가 계산한 것을 그대로 받는다. 화면이 보여 준 숫자와 기록에
    남는 숫자가 **반드시 같아야** 하기 때문이다 — 서버가 다시 계산해 넣으면,
    둘이 어긋나는 날 사람은 어느 쪽을 믿어야 할지 알 수 없게 된다. 대신 정의
    스냅샷을 서버가 뜨므로 나중에 다시 돌려 확인할 수 있다.
    """
    data = request.get_json(silent=True) or {}

    card_id = data.get('card_id')
    card = Card.query.get(card_id) if card_id is not None else None
    if card is None:
        return jsonify({'error': '카드를 찾을 수 없습니다.'}), 404

    actor = current_user()
    if not card.is_visible_to(actor):
        # 있다는 사실 자체를 알려 주지 않는다 — 카드 쪽 규칙과 같다.
        return jsonify({'error': '카드를 찾을 수 없습니다.'}), 404

    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({
            'error': '기록 이름을 적어 주세요. 나중에 이것으로 찾게 됩니다.',
        }), 400
    title = title[:MAX_TITLE]

    inputs = data.get('inputs')
    results = data.get('results')
    if not isinstance(inputs, dict) or not isinstance(results, dict):
        return jsonify({'error': 'inputs 와 results 는 객체여야 합니다.'}), 400

    snapshot = _snapshot(card.id)
    if not snapshot:
        return jsonify({'error': '변수가 없는 카드는 기록할 것이 없습니다.'}), 400

    row = CalculationRecord(
        card_id=card.id,
        card_name=card.name,
        title=title,
        note=(data.get('note') or '').strip() or None,
        inputs=json.dumps(inputs, ensure_ascii=False),
        results=json.dumps(results, ensure_ascii=False),
        definition_snapshot=json.dumps(snapshot, ensure_ascii=False),
        created_by_id=actor.id,
    )
    db.session.add(row)
    db.session.commit()
    return jsonify(row.to_dict()), 201


@records_bp.route('', methods=['GET'])
def list_records():
    """기록 목록. 최신순.

    질의:
      card_id=3   그 카드의 기록만
      mine=1      내 기록만
      q=볼트      이름표·카드 이름에서 찾기
    """
    actor = current_user()
    query = CalculationRecord.query

    card_id = request.args.get('card_id', type=int)
    if card_id is not None:
        query = query.filter(CalculationRecord.card_id == card_id)

    if request.args.get('mine') in ('1', 'true'):
        query = query.filter(CalculationRecord.created_by_id == actor.id)

    keyword = (request.args.get('q') or '').strip()
    if keyword:
        like = f'%{keyword}%'
        query = query.filter(db.or_(CalculationRecord.title.ilike(like),
                                    CalculationRecord.card_name.ilike(like)))

    rows = (query.order_by(CalculationRecord.created_at.desc(),
                           CalculationRecord.id.desc())
            .limit(PAGE_SIZE * 4).all())

    # 가시성은 파이썬에서 거른다. 초안 여부는 카드 쪽 상태라 SQL 로 표현하려면
    # 조인이 필요한데, 기록 수가 그 복잡도를 정당화할 만큼 많지 않다.
    visible = [r for r in rows if r.is_visible_to(actor)][:PAGE_SIZE]
    return jsonify([r.to_dict() for r in visible])


@records_bp.route('/<int:record_id>', methods=['GET'])
def get_record(record_id):
    """기록 하나 — 정의 스냅샷까지.

    이것만 있으면 카드가 바뀌었든 지워졌든 그때 무엇을 어떻게 계산했는지 알 수
    있다.
    """
    row = CalculationRecord.query.get_or_404(record_id)
    if not row.is_visible_to(current_user()):
        return jsonify({'error': '기록을 찾을 수 없습니다.'}), 404
    return jsonify(row.to_dict(full=True))


@records_bp.route('/<int:record_id>', methods=['DELETE'])
def delete_record(record_id):
    row = CalculationRecord.query.get_or_404(record_id)
    actor = current_user()
    if not row.is_visible_to(actor):
        return jsonify({'error': '기록을 찾을 수 없습니다.'}), 404
    if not (actor.is_admin or row.created_by_id == actor.id):
        return jsonify({'error': '내가 남긴 기록만 지울 수 있습니다.'}), 403
    db.session.delete(row)
    db.session.commit()
    return jsonify({'message': '삭제되었습니다.'})
