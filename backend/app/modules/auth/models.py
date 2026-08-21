"""토큰 — refresh 폐기 목록과 개인 액세스 토큰.

**refresh 토큰을 JWT 로 만들지 않는다.** JWT 는 서버가 상태를 갖지 않으므로
발급한 뒤에는 되돌릴 수 없다. 퇴사자의 세션을 끊으려 해도, 유출을 알아채도,
만료까지 30일을 기다리는 것 말고 할 수 있는 일이 없다.

refresh 를 여기 한 행으로 두면 `revoked_at` 을 채우는 것만으로 즉시 무효가 된다.
원문은 저장하지 않고 sha256 해시만 둔다.

flask_jwt_extended 의 refresh 토큰 기능을 쓰지 않는 이유가 바로 이것이다 —
그쪽도 stateless JWT 라 같은 함정이다.
"""

from datetime import datetime

from app.extensions import db


class RefreshToken(db.Model):
    __tablename__ = 'refresh_tokens'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer,
                        db.ForeignKey('users.id', ondelete='CASCADE'),
                        nullable=False, index=True)
    token_hash = db.Column(db.String(64), nullable=False, unique=True, index=True)

    issued_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime, nullable=False)
    revoked_at = db.Column(db.DateTime, nullable=True)

    replaced_by_id = db.Column(db.Integer,
                               db.ForeignKey('refresh_tokens.id', ondelete='SET NULL'),
                               nullable=True)
    """회전(rotation) 이력. 폐기된 토큰이 다시 쓰이면 탈취 신호로 볼 수 있다."""

    user_agent = db.Column(db.String(300), nullable=True)
    """어느 브라우저의 세션인지. 나중에 '내 세션 목록' 화면을 만들 때 쓴다."""


class PersonalAccessToken(db.Model):
    """사람이 아닌 것이 쓰는 자격 증명 — MCP 서버, 스크립트, 외부 AI.

    **사람의 세션 방식을 그대로 쓸 수 없다.** 로그인은 refresh 를 httpOnly
    쿠키로 주고 access 를 15분마다 갱신하는 구조인데, 그 흐름에는 브라우저와
    사람이 전제로 깔려 있다. 헤더 하나만 들고 붙는 MCP 클라이언트에게는
    쿠키를 둘 자리도, 갱신을 돌릴 자리도 없다.

    그래서 **오래 살고 스스로 만료되며 언제든 지울 수 있는** 토큰을 따로 둔다.
    비밀번호를 그대로 주는 것과 다른 점이 여기 있다 — 새면 이 행 하나만
    지우면 되고, 사람의 로그인은 멀쩡하다. 누가 언제 마지막으로 썼는지도
    남는다.

    원문은 발급 순간에 한 번만 보여 주고 저장하지 않는다. 해시만 남으므로
    DB 가 새어도 남의 토큰으로 붙을 수 없다.
    """

    __tablename__ = 'personal_access_tokens'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer,
                        db.ForeignKey('users.id', ondelete='CASCADE'),
                        nullable=False, index=True)

    name = db.Column(db.String(100), nullable=False)
    """어디에 쓰는 토큰인지 사람이 적는다. 여러 개를 만들면 이것만이 구분 수단이다."""

    token_prefix = db.Column(db.String(16), nullable=False)
    """표시용 앞자리(`mdt_` + 8자). 목록에서 어느 것이 어느 것인지 알아보게 한다."""

    token_hash = db.Column(db.String(64), nullable=False, unique=True, index=True)

    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime, nullable=True)
    revoked_at = db.Column(db.DateTime, nullable=True)

    last_used_at = db.Column(db.DateTime, nullable=True)
    """**안 쓰는 토큰을 찾아내는 유일한 단서.** 없으면 만들어 둔 것을 아무도
    회수하지 않아 계속 쌓인다. 인증 경로라 매 요청 쓰지 않고 가끔만 갱신한다."""

    def to_dict(self):
        """원문은 절대 담기지 않는다 — 애초에 저장하지 않는다."""
        now = datetime.utcnow()
        if self.revoked_at is not None:
            state = 'revoked'
        elif self.expires_at is not None and self.expires_at <= now:
            state = 'expired'
        else:
            state = 'active'
        return {
            'id': self.id,
            'name': self.name,
            'token_prefix': self.token_prefix,
            'state': state,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'last_used_at': self.last_used_at.isoformat() if self.last_used_at else None,
        }
