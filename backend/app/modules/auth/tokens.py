"""개인 액세스 토큰 — 발급·검증·폐기.

MCP 서버나 스크립트가 `Authorization: Bearer mdt_...` 로 쓴다. 인증 경로
(`app.shared.auth`)가 **접두사로** JWT 와 구분해 여기의 `resolve()` 를 부른다.

접두사로 나누는 이유: 두 종류가 같은 헤더로 오는데, 형태를 보고 짐작하면
("점이 두 개면 JWT") 언젠가 틀린다. 접두사는 우리가 만들 때 붙이는 것이라
틀릴 여지가 없고, 로그에 찍힌 앞자리만 보고도 어느 쪽인지 알 수 있다.

**만능 토큰이 아니다.** 토큰은 언제나 어떤 사람에게 매여 있고, 그 사람의
권한으로만 동작한다. MCP 가 무엇을 할 수 있는지는 그 사람이 무엇을 할 수
있는지와 같다 — 관리자 토큰을 하나 만들어 모두가 돌려 쓰면 "누가 만든
카드인지" 가 통째로 사라진다.
"""

import hashlib
import secrets
from datetime import datetime, timedelta

from app.extensions import db
from app.modules.accounts.models import User
from app.modules.auth.models import PersonalAccessToken
from app.shared.errors import AppError, NotFound

#: JWT 와 구분되는 접두사. MechanicalDesign Token.
TOKEN_PREFIX = 'mdt_'

DEFAULT_EXPIRES_DAYS = 90
MAX_EXPIRES_DAYS = 365
MAX_TOKENS_PER_USER = 20

#: `last_used_at` 갱신 간격. 인증 경로에서 매 요청 쓰기를 하면 읽기만 하는
#: 호출까지 전부 쓰기 트랜잭션이 된다. "언제쯤 마지막으로 썼나" 를 아는 데
#: 분 단위 정확도는 필요 없다.
_TOUCH_INTERVAL = timedelta(minutes=10)


def _hash(raw):
    """난수라 사전 공격이 성립하지 않으므로 sha256 이면 충분하다.

    비밀번호(bcrypt)와 다른 판단인데, 이유는 입력의 성질이 다르기 때문이다.
    사람이 고른 비밀번호는 추측 가능한 공간이 좁아 느린 해시가 필요하지만,
    256비트 난수는 그렇지 않다. 인증 경로에서 bcrypt 를 돌리면 MCP 호출마다
    수백 밀리초를 버린다.
    """
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()


def looks_like_pat(raw):
    return bool(raw) and raw.startswith(TOKEN_PREFIX)


def list_for(user):
    """내 토큰 목록. 폐기한 것은 빼고 최신순."""
    return (PersonalAccessToken.query
            .filter_by(user_id=user.id)
            .filter(PersonalAccessToken.revoked_at.is_(None))
            .order_by(PersonalAccessToken.id.desc())
            .all())


def create(user, name, expires_days=DEFAULT_EXPIRES_DAYS):
    """(행, 원문). **원문은 호출부가 한 번만 사용자에게 보여 주고 버린다.**"""
    label = (name or '').strip()
    if not label:
        raise AppError('MD-AUTH-0110', '토큰 이름을 적어 주세요. 어디에 쓰는 토큰인지 나중에 알 수 없습니다.')
    label = label[:100]

    if expires_days is None:
        # 만료 없는 토큰을 만들 수 있게 두지 않는다. 한 번 새면 영영 유효한
        # 자격 증명이 되고, 그런 것이 있다는 사실 자체를 잊게 된다.
        raise AppError('MD-AUTH-0111', '만료 없는 토큰은 만들 수 없습니다.')
    try:
        days = int(expires_days)
    except (TypeError, ValueError):
        raise AppError('MD-AUTH-0111', '만료 일수는 숫자여야 합니다.')
    if not 1 <= days <= MAX_EXPIRES_DAYS:
        raise AppError('MD-AUTH-0111', f'만료 일수는 1~{MAX_EXPIRES_DAYS} 사이여야 합니다.')

    # 발급 자체는 위험하지 않지만, 상한이 없으면 잘못 짠 스크립트가 호출할
    # 때마다 토큰을 만들어 목록을 못 쓰게 만든다.
    if len(list_for(user)) >= MAX_TOKENS_PER_USER:
        raise AppError(
            'MD-AUTH-0112',
            f'토큰은 최대 {MAX_TOKENS_PER_USER} 개까지입니다. 안 쓰는 것을 지워 주세요.')

    raw = TOKEN_PREFIX + secrets.token_urlsafe(32)
    now = datetime.utcnow()
    row = PersonalAccessToken(
        user_id=user.id,
        name=label,
        token_prefix=raw[:12],
        token_hash=_hash(raw),
        created_at=now,
        expires_at=now + timedelta(days=days),
    )
    db.session.add(row)
    db.session.commit()
    return row, raw


def revoke(user, token_id):
    """즉시 무효화. 남의 토큰은 못 지운다."""
    row = db.session.get(PersonalAccessToken, token_id)
    if row is None or row.user_id != user.id or row.revoked_at is not None:
        # 남의 토큰이 존재한다는 사실도 알려 주지 않는다 — 없는 것과 같이 답한다.
        raise NotFound('MD-AUTH-0113', '토큰을 찾을 수 없습니다.')
    row.revoked_at = datetime.utcnow()
    db.session.commit()
    return row


def resolve(raw):
    """원문 → 사용자. 폐기·만료·없는 토큰이면 None.

    계정 상태(정지·삭제)는 여기서 보지 않는다 — 부르는 쪽이 사람 로그인과
    **같은 함수**(`ensure_can_sign_in`)로 판정한다. 두 경로가 각자 조건을
    들고 있으면 상태가 하나 늘 때 한쪽을 빠뜨리고, 빠뜨린 쪽이 이쪽이면
    정지된 사람의 토큰이 계속 살아 있게 된다.
    """
    if not looks_like_pat(raw):
        return None

    row = PersonalAccessToken.query.filter_by(token_hash=_hash(raw)).first()
    if row is None or row.revoked_at is not None:
        return None

    now = datetime.utcnow()
    if row.expires_at is not None and row.expires_at <= now:
        return None

    user = db.session.get(User, row.user_id)
    if user is None:
        return None

    if row.last_used_at is None or (now - row.last_used_at) > _TOUCH_INTERVAL:
        row.last_used_at = now
        db.session.commit()
    return user
