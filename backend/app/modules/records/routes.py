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


def _workflow_snapshot(workflow):
    """워크플로의 배선 + 노드가 쓰는 카드의 변수 정의 전부.

    카드가 살아 있는 참조라, 이것을 안 담으면 나중에 기록을 열었을 때 **그때
    무엇을 계산한 것인지** 알 수 없다. 카드 기록이 정의 스냅샷을 뜨는 것과 같은
    이유이고, 여기서는 카드가 여럿일 뿐이다.
    """
    cards = {}
    for node in workflow.nodes:
        key = str(node.card_id)
        if key in cards:
            continue
        rows = (Variable.query.filter_by(card_id=node.card_id)
                .order_by(Variable.sort_order).all())
        cards[key] = [v.to_dict() for v in rows]

    return {
        'nodes': [n.to_dict() for n in workflow.nodes],
        'links': [l.to_dict() for l in workflow.links],
        'cards': cards,
    }


def _run_meta(raw):
    """어떻게 돌렸는지. 없으면 없는 대로 둔다.

    **모양을 강요하지 않는다.** 여기 담기는 것은 계산기가 아는 것이고, 계산
    방식이 늘 때마다 서버가 따라 바뀌면 두 벌이 된다. 객체인지만 본다.
    """
    if not isinstance(raw, dict) or not raw:
        return None
    return json.dumps(raw, ensure_ascii=False)


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
    actor = current_user()

    # 카드 하나의 계산이거나, 워크플로 전체의 계산이거나. 둘 다 아니면 무엇을
    # 기록하는지 알 수 없다.
    workflow_id = data.get('workflow_id')
    card_id = data.get('card_id')

    card = None
    workflow = None
    if workflow_id is not None:
        from app.modules.workflows.models import Workflow

        workflow = db.session.get(Workflow, workflow_id)
        if workflow is None or not workflow.is_visible_to(actor):
            return jsonify({'error': '워크플로를 찾을 수 없습니다.'}), 404
    else:
        card = Card.query.get(card_id) if card_id is not None else None
        if card is None:
            return jsonify({'error': '카드를 찾을 수 없습니다.'}), 404
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

    if workflow is not None:
        # 워크플로 스냅샷은 **배선과 그때의 카드 정의를 통째로** 뜬다. 노드가
        # 가리키는 카드는 나중에 바뀌므로(살아 있는 참조), 그것까지 담지 않으면
        # 기록을 열었을 때 그때 무엇을 계산한 것인지 알 수 없다.
        snapshot = _workflow_snapshot(workflow)
        if not snapshot.get('nodes'):
            return jsonify({'error': '노드가 없는 워크플로는 기록할 것이 없습니다.'}), 400
    else:
        snapshot = _snapshot(card.id)
        if not snapshot:
            return jsonify({'error': '변수가 없는 카드는 기록할 것이 없습니다.'}), 400

    row = CalculationRecord(
        kind='workflow' if workflow is not None else 'card',
        card_id=card.id if card is not None else None,
        card_name=card.name if card is not None else None,
        workflow_id=workflow.id if workflow is not None else None,
        workflow_name=workflow.name if workflow is not None else None,
        title=title,
        note=(data.get('note') or '').strip() or None,
        inputs=json.dumps(inputs, ensure_ascii=False),
        results=json.dumps(results, ensure_ascii=False),
        definition_snapshot=json.dumps(snapshot, ensure_ascii=False),
        run_meta=_run_meta(data.get('run_meta')),
        created_by_id=actor.id,
    )
    db.session.add(row)
    db.session.commit()
    return jsonify(row.to_dict()), 201


@records_bp.route('', methods=['GET'])
def list_records():
    """기록 목록. 최신순, 페이지로 나눠서.

    질의:
      card_id=3      그 카드의 기록만
      workflow_id=5  그 워크플로의 기록만
      mine=1         내 기록만
      q=볼트         이름표·카드/워크플로 이름에서 찾기
      page=2         1부터
      per_page=20    최대 100

    ## 왜 SQL 로 자르지 않는가

    가시성(초안 카드로 계산한 기록은 남에게 안 보인다)이 **파이썬에서** 결정된다.
    카드·워크플로의 초안 여부를 봐야 하는데 그건 조인이 필요하다.

    그러면 `LIMIT/OFFSET` 을 SQL 에 맡길 수 없다 — 20개를 떠서 3개를 걸러 내면
    17개짜리 페이지가 되고, 총 개수도 알 수 없다. **페이지가 들쭉날쭉하고 마지막
    페이지가 비는 것**이 이 화면에서 가장 나쁜 실패라, 거른 뒤에 자른다.

    대신 두 관계를 미리 함께 읽어(joinedload) 줄마다 다시 묻지 않게 한다.
    """
    actor = current_user()
    query = CalculationRecord.query.options(
        db.joinedload(CalculationRecord.card),
        db.joinedload(CalculationRecord.workflow),
    )

    card_id = request.args.get('card_id', type=int)
    if card_id is not None:
        query = query.filter(CalculationRecord.card_id == card_id)

    workflow_id = request.args.get('workflow_id', type=int)
    if workflow_id is not None:
        query = query.filter(CalculationRecord.workflow_id == workflow_id)

    if request.args.get('mine') in ('1', 'true'):
        query = query.filter(CalculationRecord.created_by_id == actor.id)

    keyword = (request.args.get('q') or '').strip()
    if keyword:
        like = f'%{keyword}%'
        query = query.filter(db.or_(CalculationRecord.title.ilike(like),
                                    CalculationRecord.card_name.ilike(like),
                                    CalculationRecord.workflow_name.ilike(like)))

    rows = query.order_by(CalculationRecord.created_at.desc(),
                          CalculationRecord.id.desc()).all()
    visible = [r for r in rows if r.is_visible_to(actor)]

    per_page = max(1, min(request.args.get('per_page', type=int) or PAGE_SIZE, 100))
    pages = max(1, -(-len(visible) // per_page))
    # 페이지 번호를 있는 범위 안으로 당긴다. 3페이지를 보다가 검색어를 넣어
    # 결과가 한 페이지로 줄면, 그대로 두면 빈 화면이 나온다.
    page = min(max(1, request.args.get('page', type=int) or 1), pages)

    start = (page - 1) * per_page
    return jsonify({
        'items': [r.to_dict() for r in visible[start:start + per_page]],
        'total': len(visible),
        'page': page,
        'per_page': per_page,
        'pages': pages,
    })


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
