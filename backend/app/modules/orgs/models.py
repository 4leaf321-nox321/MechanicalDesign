"""조직 — 카드가 놓이는 자리.

두 가지가 한 표에 들어 있다. 트리를 이루는 **조직**(전사 > 본부 > 팀)과, 사람마다
하나씩 있는 **개인 공간**이다. 나누지 않은 이유는 카드가 놓이는 자리라는 점에서
둘이 똑같기 때문이다 — 나누면 "카드가 어디 있나" 를 물을 때마다 두 표를 합쳐야
하고, 합치는 규칙이 카드 목록·검색·이동에 각각 흩어진다.

    kind='org'       조직도. `parent_slug` 로 트리를 이룬다
    kind='personal'  개인 공간. 사람마다 하나, `owner_user_id` 가 그 사람

**slug 가 기본키다.** 숫자 id 가 아니라 사람이 읽는 문자열을 쓰는 것은 주소에
그대로 나오기 때문이다(`/org/design-1`). 숫자면 주소만 보고는 어느 조직인지 알
수 없고, 조직을 옮겨 담을 때 번호가 흔들리면 저장해 둔 링크가 다른 곳을 가리킨다.

카드는 **개인 공간에서 태어나** 조직에 게시된다(`CardMount`). 게시는 복사가
아니라 **살아 있는 참조**다 — 원본을 고치면 게시된 모든 조직에 그대로 반영된다.
복사였다면 "그 팀 게시판의 것만 옛날 계수" 같은 상태가 조용히 생긴다.
"""

from datetime import datetime

from app.extensions import db


class Organization(db.Model):
    __tablename__ = 'organizations'

    slug = db.Column(db.String(64), primary_key=True)
    name = db.Column(db.String(128), nullable=False)
    description = db.Column(db.String(255), nullable=False, default='', server_default='')

    #: 상위 조직. 최상위는 NULL.
    #:
    #: `ondelete='RESTRICT'` 다. 상위를 지우면 하위가 통째로 사라지는데, 그때
    #: 사라지는 것은 조직 한 줄이 아니라 **그 아래 게시된 카드 전부의 자리**다.
    #: 지우려면 먼저 하위를 옮기게 한다.
    parent_slug = db.Column(db.String(64),
                            db.ForeignKey('organizations.slug', ondelete='RESTRICT'),
                            nullable=True, index=True)

    color = db.Column(db.String(7), nullable=False, default='#64748b',
                      server_default='#64748b')

    #: 'org' | 'personal'
    kind = db.Column(db.String(16), nullable=False, default='org', server_default='org')

    #: kind='personal' 일 때만 채워진다. 사람마다 개인 공간은 하나뿐이라 unique.
    owner_user_id = db.Column(db.Integer,
                              db.ForeignKey('users.id', ondelete='CASCADE'),
                              nullable=True, unique=True, index=True)
    owner = db.relationship('User', foreign_keys=[owner_user_id])

    #: 같은 부모 아래에서의 순서. 조직도는 가나다순이 아니라 **회사가 정한
    #: 순서**로 보여야 한다.
    sort_order = db.Column(db.Integer, nullable=False, default=0, server_default='0')

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    children = db.relationship(
        'Organization',
        backref=db.backref('parent', remote_side=[slug]),
        order_by='Organization.sort_order, Organization.name',
    )

    def to_dict(self, card_count=None):
        result = {
            'slug': self.slug,
            'name': self.name,
            'description': self.description or '',
            'parent_slug': self.parent_slug,
            'color': self.color,
            'kind': self.kind,
            'owner_user_id': self.owner_user_id,
            'sort_order': self.sort_order,
        }
        # 트리에 개수를 함께 내려보낸다. 화면이 노드마다 따로 물으면 조직이
        # 스무 개일 때 요청이 스무 번 나간다.
        if card_count is not None:
            result['card_count'] = card_count
        return result


class CardMount(db.Model):
    """게시 — 이 카드를 이 조직에서 보이게 한다.

    **복합 기본키다.** 같은 카드가 같은 조직에 두 번 걸리지 않는다. 두 번 걸리면
    목록에 두 번 나오는데, 그것을 화면에서 걸러 내기 시작하면 "왜 하나만 지워도
    안 사라지나" 를 설명할 수 없게 된다.

    카드 하나가 **여러 조직에 동시에** 걸릴 수 있다. 같은 계산을 설계1팀과
    품질팀이 함께 쓰는 일이 흔하고, 그때 사본을 두 개 만들면 한쪽만 고쳐진다.
    """

    __tablename__ = 'card_mounts'

    card_id = db.Column(db.Integer, db.ForeignKey('cards.id', ondelete='CASCADE'),
                        primary_key=True)
    org_slug = db.Column(db.String(64),
                         db.ForeignKey('organizations.slug', ondelete='CASCADE'),
                         primary_key=True, index=True)

    #: 누가 게시했는가. 만든 사람과 다른 질문이다 — AI 가 초안을 잡고 사람이
    #: 게시하는 흐름에서, 그 조직에 이 카드를 들인 책임은 게시한 사람에게 있다.
    mounted_by_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'),
                              nullable=True)
    mounted_by = db.relationship('User', foreign_keys=[mounted_by_id])
    mounted_at = db.Column(db.DateTime, default=datetime.utcnow)

    org = db.relationship('Organization')

    def to_dict(self):
        return {
            'card_id': self.card_id,
            'org_slug': self.org_slug,
            'org_name': self.org.name if self.org else None,
            'mounted_by_name': self.mounted_by.display_name if self.mounted_by else None,
            'mounted_at': self.mounted_at.isoformat() if self.mounted_at else None,
        }
