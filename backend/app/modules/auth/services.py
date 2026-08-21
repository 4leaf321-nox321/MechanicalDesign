"""인증 로직 — 로그인, 세션 발급·회전·폐기, 비밀번호 변경."""

from datetime import datetime, timedelta, timezone

from flask import current_app

from app.extensions import db
from app.modules.accounts.models import User
from app.modules.auth import security
from app.modules.auth.models import RefreshToken
from app.shared.errors import AppError, Forbidden, Unauthorized

_INVALID_LOGIN = '이메일 또는 비밀번호가 올바르지 않습니다.'

#: 비밀번호 최소 길이. 관리자 발급 임시 비밀번호도 이 길이를 넘는다.
MIN_PASSWORD_LENGTH = 10
MAX_PASSWORD_LENGTH = 200


def _now():
    """DB 컬럼이 naive UTC(datetime.utcnow) 라 비교 대상도 naive 로 맞춘다.

    한쪽만 tz-aware 면 비교에서 TypeError 가 나는데, 그 자리는 만료 검사라서
    평소에는 안 걸리고 **토큰이 만료될 무렵에만** 터진다.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


def validate_password(password):
    """새 비밀번호가 규칙에 맞는지. 형식은 여기 한 곳에서만 판정한다."""
    if not password or len(password) < MIN_PASSWORD_LENGTH:
        raise AppError('MD-AUTH-0010',
                       f'비밀번호는 {MIN_PASSWORD_LENGTH}자 이상이어야 합니다.')
    if len(password) > MAX_PASSWORD_LENGTH:
        raise AppError('MD-AUTH-0011',
                       f'비밀번호는 {MAX_PASSWORD_LENGTH}자를 넘을 수 없습니다.')


def ensure_can_sign_in(user):
    """로그인을 막아야 하면 사유에 맞는 오류를 던진다.

    "왜 안 되는지" 를 구분해 주는 것이 중요하다. 승인 대기 중인 사람에게
    '정지된 계정' 이라고만 하면 관리자에게 무엇을 요청해야 할지 알 수 없다.
    """
    if user.deleted_at is not None:
        raise Forbidden('MD-AUTH-0002', '삭제된 계정입니다. 관리자에게 문의하세요.')
    if user.status == 'pending':
        raise Forbidden(
            'MD-AUTH-0008',
            '가입 승인 대기 중입니다. 관리자가 승인하면 로그인할 수 있습니다.',
        )
    if user.status != 'active':
        raise Forbidden('MD-AUTH-0009', '정지된 계정입니다. 관리자에게 문의하세요.')


# --- 로그인 -------------------------------------------------------------------


def authenticate(email, password):
    user = User.query.filter_by(email=(email or '').strip().lower()).first()

    # **계정이 없을 때도 해시 비교를 한 번 수행한다.** 없으면 즉시 돌아가는데,
    # bcrypt 비교는 수십 밀리초라 응답 시간 차이로 "그 이메일이 있는지" 가
    # 밖에서 측정된다.
    if user is None:
        security.verify_password(password or '', security.hash_password('dummy'))
        raise Unauthorized('MD-AUTH-0001', _INVALID_LOGIN)

    if not security.verify_password(password or '', user.password_hash):
        raise Unauthorized('MD-AUTH-0001', _INVALID_LOGIN)

    ensure_can_sign_in(user)
    return user


def issue_session(user, user_agent):
    """(access JWT, 만료 초, refresh 평문)."""
    raw = security.new_opaque_token()
    db.session.add(RefreshToken(
        user_id=user.id,
        token_hash=security.hash_token(raw),
        expires_at=_now() + timedelta(days=current_app.config['REFRESH_TOKEN_DAYS']),
        user_agent=(user_agent or '')[:300] or None,
    ))
    db.session.commit()
    access, expires_in = security.create_access_token(user.id)
    return access, expires_in, raw


def rotate_refresh(raw, user_agent):
    """refresh 를 한 번 쓰면 폐기하고 새로 발급한다(회전).

    회전하지 않으면 탈취된 토큰이 만료까지 유효하다. 회전하면 원래 주인이 다음
    갱신을 시도하는 순간 **폐기된 토큰이 쓰인 사실이 드러난다** — 그때 그
    사용자의 세션을 전부 끊는다. 훔친 쪽도 잃지만 주인도 다시 로그인해야 하므로
    사용자 입장에서는 갑작스러운 로그아웃으로 보인다. 그래도 계속 열려 있는
    것보다는 낫다.
    """
    token = RefreshToken.query.filter_by(token_hash=security.hash_token(raw)).first()
    if token is None:
        raise Unauthorized('MD-AUTH-0003', '세션이 만료되었습니다. 다시 로그인해 주세요.')

    if token.revoked_at is not None:
        revoke_all_for_user(token.user_id)
        raise Unauthorized(
            'MD-AUTH-0005',
            '세션이 무효화되었습니다. 다시 로그인해 주세요.',
            details={'reason': 'reuse_of_revoked_token'},
        )

    if token.expires_at <= _now():
        raise Unauthorized('MD-AUTH-0003', '세션이 만료되었습니다. 다시 로그인해 주세요.')

    user = db.session.get(User, token.user_id)
    if user is None:
        raise Forbidden('MD-AUTH-0002', '삭제된 계정입니다. 관리자에게 문의하세요.')
    ensure_can_sign_in(user)

    new_raw = security.new_opaque_token()
    new_token = RefreshToken(
        user_id=user.id,
        token_hash=security.hash_token(new_raw),
        expires_at=_now() + timedelta(days=current_app.config['REFRESH_TOKEN_DAYS']),
        user_agent=(user_agent or '')[:300] or None,
    )
    db.session.add(new_token)
    db.session.flush()

    token.revoked_at = _now()
    token.replaced_by_id = new_token.id
    db.session.commit()

    access, expires_in = security.create_access_token(user.id)
    return user, access, expires_in, new_raw


def revoke_refresh(raw):
    token = RefreshToken.query.filter_by(token_hash=security.hash_token(raw)).first()
    if token is not None and token.revoked_at is None:
        token.revoked_at = _now()
        db.session.commit()


def revoke_all_for_user(user_id):
    tokens = RefreshToken.query.filter(
        RefreshToken.user_id == user_id,
        RefreshToken.revoked_at.is_(None),
    ).all()
    for token in tokens:
        token.revoked_at = _now()
    db.session.commit()


# --- 비밀번호 ------------------------------------------------------------------


def change_password(user, current, new):
    if not security.verify_password(current or '', user.password_hash):
        raise AppError('MD-AUTH-0004', '현재 비밀번호가 올바르지 않습니다.')
    if current == new:
        raise AppError('MD-AUTH-0006', '이전과 다른 비밀번호를 사용하세요.')
    validate_password(new)

    user.password_hash = security.hash_password(new)
    user.must_change_password = False
    db.session.commit()

    # 비밀번호를 바꾼 이유가 유출일 수 있으므로 기존 세션을 전부 끊는다.
    # 이 브라우저의 쿠키도 라우터에서 함께 버린다.
    revoke_all_for_user(user.id)
