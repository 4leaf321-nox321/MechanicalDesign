"""계정.

**계정 상태를 불리언이 아니라 `status` 로 둔다.** 셀프 가입 + 관리자 승인
방식에서는 "승인 대기"가 활성/비활성과 별개의 상태다. `is_active` 하나로 두면
승인 대기와 정지를 구분할 수 없어, 관리자 화면이 "왜 로그인이 안 되는지" 를
설명하지 못한다. 로그인이 막힌 사람도 관리자에게 무엇을 요청해야 할지 알 수
없게 된다.

**지우지 않고 정지하는 것을 기본으로 둔다.** `deleted_at` 이 찍힌 행은 로그인할
수 없지만, 그 사람이 만든 카드의 `created_by` 참조는 살아 있다. 행을 없애면
"누가 만들었는지" 가 통째로 사라진다.
"""

from datetime import datetime

from app.extensions import db

#: 계정 상태.
#:   pending    가입 신청. 로그인 불가. 관리자 승인 대기
#:   active     정상
#:   suspended  관리자가 정지. 자료는 남기고 접근만 막는다
USER_STATUSES = ('pending', 'active', 'suspended')


class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(254), nullable=False, unique=True, index=True)
    password_hash = db.Column(db.String(120), nullable=False)
    display_name = db.Column(db.String(100), nullable=False)

    status = db.Column(db.String(20), nullable=False, default='pending',
                       server_default='pending')
    is_admin = db.Column(db.Boolean, nullable=False, default=False,
                         server_default='false')

    must_change_password = db.Column(db.Boolean, nullable=False, default=False,
                                     server_default='false')
    """초기 관리자와 관리자 발급 계정의 임시 비밀번호가 그대로 남는 사고를 막는다."""

    decided_at = db.Column(db.DateTime, nullable=True)
    decided_by_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'),
                              nullable=True)
    decision_note = db.Column(db.Text, nullable=True)
    """거절 사유. 메일을 보낼 수단이 없어 통보가 앱 안에서만 되므로 반드시 남긴다."""

    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow,
                           onupdate=datetime.utcnow)
    deleted_at = db.Column(db.DateTime, nullable=True)

    @property
    def can_sign_in(self):
        """로그인 가능 여부는 여기 한 곳에서만 판정한다.

        로그인·재발급(refresh)·요청 인가(current_user) 세 군데가 같은 조건을
        각자 들고 있으면, 상태가 하나 늘 때 한 군데를 빠뜨린다. 빠뜨린 쪽이
        인가 경로면 정지된 계정이 계속 API 를 부를 수 있다.
        """
        return self.status == 'active' and self.deleted_at is None

    def to_dict(self):
        """본인·관리자 모두에게 나가는 형태. 비밀번호 해시는 절대 담지 않는다."""
        return {
            'id': self.id,
            'email': self.email,
            'display_name': self.display_name,
            'status': self.status,
            'is_admin': self.is_admin,
            'must_change_password': self.must_change_password,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'decided_at': self.decided_at.isoformat() if self.decided_at else None,
            'decision_note': self.decision_note,
            'deleted_at': self.deleted_at.isoformat() if self.deleted_at else None,
        }
