"""계산 기록 — 그때 그 숫자가 무엇이었는지.

지금까지 이 도구는 **숫자를 보여 주고 잊어버렸다.** 계산은 브라우저에서 돌고
창을 닫으면 사라진다. 그래서 "지난주 브래킷 볼트 계산, 하중을 몇으로 넣었더라"
에 답할 방법이 없고, 다시 계산해도 그게 그때 그 계산이라는 보장이 없다.

**기록은 스스로 완결되어야 한다.**

입력값과 결과만 남기면 안 된다. 카드의 수식은 나중에 바뀌고, 카드 자체가
지워지기도 한다. 그러면 기록은 "20" 이라고 적힌 영수증이 되는데, 무엇이 그
숫자를 만들었는지 알 방법이 없다. 더 나쁜 것은 조용히 뜻이 달라지는 경우다 —
수식이 바뀐 뒤에도 기록은 예전 숫자를 그대로 들고 있으면서, 카드를 열어 보면
다른 계산이 나온다.

그래서 계산할 때의 **변수 정의를 통째로 함께 저장한다**(`definition_snapshot`).
카드가 바뀌어도 지워져도, 이 기록 하나만 보면 무엇을 어떻게 계산했는지 알 수
있다. 저장 공간을 조금 더 쓰는 대신, 기록이 시간이 지나도 거짓말을 하지 않는다.
"""

import json
from datetime import datetime

from app.extensions import db


class CalculationRecord(db.Model):
    __tablename__ = 'calculation_records'

    id = db.Column(db.Integer, primary_key=True)

    # 카드가 지워져도 기록은 남는다. 기록이 남는 것이 이 기능의 전부이므로,
    # 카드를 따라 함께 사라지면 안 된다.
    card_id = db.Column(db.Integer, db.ForeignKey('cards.id', ondelete='SET NULL'),
                        nullable=True, index=True)
    card = db.relationship('Card', foreign_keys=[card_id])

    card_name = db.Column(db.String(100), nullable=True)
    """카드 이름을 베껴 둔다. 카드가 지워지면 이것만 남는다 — 그때 '카드 없음'
    이라고만 보이면 그 기록은 아무 쓸모가 없다. 워크플로 기록에는 없다."""

    #: 'card' | 'workflow'.
    #:
    #: 표를 나누지 않는다. 두 종류가 한 표에 있어야 "내가 한 계산" 을 한 목록에서
    #: 볼 수 있다 — 나누면 목록 화면이 매번 둘을 합쳐야 하고 정렬·검색도 두 벌이
    #: 된다.
    kind = db.Column(db.String(20), nullable=False, default='card',
                     server_default='card')

    workflow_id = db.Column(db.Integer,
                            db.ForeignKey('workflows.id', ondelete='SET NULL'),
                            nullable=True, index=True)
    workflow = db.relationship('Workflow', foreign_keys=[workflow_id])

    workflow_name = db.Column(db.String(100), nullable=True)
    """워크플로 이름 사본. 카드 이름과 같은 이유로 베껴 둔다."""

    title = db.Column(db.String(200), nullable=False)
    """무슨 계산인지 사람이 붙이는 이름표. 예: 'Model X 브래킷 볼트'.
    기록이 쌓이면 이것만이 찾는 수단이다."""

    note = db.Column(db.Text, nullable=True)

    inputs = db.Column(db.Text, nullable=False, default='{}')
    """{변수id: 값}. 아래 스냅샷과 짝이라 id 로 키잉해도 흔들리지 않는다."""

    results = db.Column(db.Text, nullable=False, default='{}')
    """{변수id: {value, error}}."""

    definition_snapshot = db.Column(db.Text, nullable=False, default='[]')
    """계산 당시의 변수 정의 전부. **이것이 기록을 기록답게 만든다.**"""

    run_meta = db.Column(db.Text, nullable=True)
    """어떻게 돌려서 나온 값인가.

    지금은 반복 정보다 — 몇 번 돌았고 잔차가 얼마였고 어떤 기준이었는지.
    **반복 횟수만으로는 아무 말도 못 한다.** 10회가 좋은 것인지 나쁜 것인지는
    그때의 허용오차와 완화계수를 알아야 정해지고, 그 값들은 나중에 바뀐다.

    정의 스냅샷과 나누어 두는 이유는 성격이 다르기 때문이다. 스냅샷은
    **무엇을 계산했나**(서버가 뜬다), 이것은 **어떻게 계산했나**(화면이
    보낸다). 뒤에 다른 종류의 계산이 붙어도 여기에 담으면 된다.
    """

    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'),
                              nullable=True)
    created_by = db.relationship('User', foreign_keys=[created_by_id])
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    @staticmethod
    def _load(raw, fallback):
        try:
            return json.loads(raw) if raw else fallback
        except ValueError:
            # 저장된 JSON 이 깨졌다면 그 기록만 못 읽는 것이지, 목록 전체가
            # 500 이 되어서는 안 된다.
            return fallback

    def to_dict(self, full=False):
        """목록에는 요약만, 상세에는 정의까지.

        스냅샷은 변수 수십 개 분량이라 목록에 실으면 응답이 금방 커진다. 목록은
        "무엇을 언제 계산했나" 만 답하면 되고, 정의가 필요한 화면은 상세다.
        """
        body = {
            'id': self.id,
            'card_id': self.card_id,
            'kind': self.kind or 'card',
            'card_name': self.card_name,
            'workflow_id': self.workflow_id,
            'workflow_name': self.workflow_name,
            # 무엇을 계산한 기록인지. 화면이 카드와 워크플로를 한 목록에 늘어놓
            # 으므로, 제목 옆에 붙일 이름이 하나로 정해져 있어야 한다.
            'source_name': (self.workflow_name if (self.kind or 'card') == 'workflow'
                            else self.card_name),
            'title': self.title,
            'note': self.note,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'created_by_id': self.created_by_id,
            'created_by_name': self.created_by.display_name if self.created_by else None,
            'run_meta': self._load(self.run_meta, None),
            # 카드가 지워졌는지 화면이 알아야 한다 — '이 카드로 다시 계산하기'
            # 를 띄울 수 있는지가 여기서 갈린다.
            'card_exists': self.card_id is not None,
            'source_exists': (self.workflow_id is not None
                              if (self.kind or 'card') == 'workflow'
                              else self.card_id is not None),
            # 이름만으로는 못 간다. 같은 이름이 둘일 수 있고, 이름이 바뀌면
            # 못 찾는다. 살아 있을 때만 주소가 있고, 지워졌으면 None 이라
            # 화면이 '갈 수 있는가' 를 따로 묻지 않아도 된다.
            'source_route': self._source_route(),
        }
        if full:
            body['inputs'] = self._load(self.inputs, {})
            body['results'] = self._load(self.results, {})
            body['definition_snapshot'] = self._load(self.definition_snapshot, [])
        return body

    def _source_route(self):
        if (self.kind or 'card') == 'workflow':
            return self.workflow.route if self.workflow else None
        return self.card.route if self.card else None

    def is_visible_to(self, user):
        """카드와 같은 규칙을 따른다.

        초안 카드로 계산한 기록이 남에게 보이면, 초안을 감춘 의미가 없다 —
        스냅샷에 정의가 통째로 들어 있기 때문이다.

        카드가 지워진 기록은 만든 사람과 관리자만 본다. 남은 그 계산이 무엇을
        뜻하는지 확인할 카드조차 없다.
        """
        if user is None:
            return False
        if user.is_admin or self.created_by_id == user.id:
            return True
        # 워크플로 기록도 같다 — 초안 워크플로로 돌린 기록이 남에게 보이면
        # 초안을 감춘 의미가 없다. 스냅샷에 정의가 통째로 들어 있다.
        source = self.workflow if (self.kind or 'card') == 'workflow' else self.card
        if source is None:
            return False
        return source.is_visible_to(user)
