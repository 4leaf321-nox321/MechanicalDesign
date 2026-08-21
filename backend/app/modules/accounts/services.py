"""계정 생애 — 신청·승인·생성·정지·삭제·비밀번호 재설정.

부서나 팀 개념이 없으므로 역할은 `is_admin` 둘뿐이다. 나중에 더 잘게 나눌 일이
생기면 그때 축을 추가한다 — 쓰지 않는 역할을 미리 만들어 두면 화면과 판정만
복잡해진다.
"""

from datetime import datetime, timezone

from app.extensions import db
from app.modules.accounts.models import USER_STATUSES, User
from app.modules.auth import security, services as auth_services
from app.shared.errors import AppError, Conflict, Forbidden, NotFound

MAX_EMAIL_LENGTH = 254
MIN_EMAIL_LENGTH = 3
MAX_NAME_LENGTH = 100


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def normalize_email(value):
    """**이메일 형식을 검사하지 않는다.**

    형식 검증 라이브러리는 `.local` 처럼 특수 용도로 예약된 도메인을 문법
    단계에서 거부한다. 그런데 폐쇄망 사내 계정은 `admin@mechanicaldesign.local`
    같은 주소를 흔히 쓴다 — 설치 스크립트가 만드는 초기 관리자가 정확히 그렇다.
    형식을 강하게 검사해서 얻는 것보다 로그인 자체가 성립하지 않는 손해가 크다.
    길이만 본다.
    """
    email = (value or '').strip().lower()
    if len(email) < MIN_EMAIL_LENGTH:
        raise AppError('MD-ACCOUNTS-0010', '아이디(이메일)를 입력해주세요.')
    if len(email) > MAX_EMAIL_LENGTH:
        raise AppError('MD-ACCOUNTS-0011', '아이디가 너무 깁니다.')
    return email


def normalize_name(value):
    name = (value or '').strip()
    if not name:
        raise AppError('MD-ACCOUNTS-0012', '이름을 입력해주세요.')
    return name[:MAX_NAME_LENGTH]


def get_account(user_id):
    user = db.session.get(User, user_id)
    if user is None:
        raise NotFound('MD-ACCOUNTS-0001', '계정을 찾을 수 없습니다.')
    return user


def _ensure_email_free(email):
    if User.query.filter_by(email=email).first() is not None:
        raise Conflict('MD-ACCOUNTS-0002', '이미 사용 중인 아이디입니다.')


def _other_active_admin_exists(user):
    """이 사람 말고 로그인 가능한 관리자가 또 있는가.

    마지막 관리자를 정지·삭제·강등하면 **아무도 계정을 관리할 수 없는 상태**가
    된다. DB 를 직접 고치는 것 말고는 빠져나올 방법이 없으므로 그 자리에서 막는다.
    """
    return User.query.filter(
        User.id != user.id,
        User.is_admin.is_(True),
        User.status == 'active',
        User.deleted_at.is_(None),
    ).first() is not None


# --- 셀프 가입 ------------------------------------------------------------------


def signup(email, password, display_name):
    """가입 신청. 승인 전까지는 로그인할 수 없다(status=pending)."""
    email = normalize_email(email)
    name = normalize_name(display_name)
    auth_services.validate_password(password)
    _ensure_email_free(email)

    user = User(
        email=email,
        password_hash=security.hash_password(password),
        display_name=name,
        status='pending',
        is_admin=False,
        # 본인이 정한 비밀번호이므로 변경을 강제할 이유가 없다.
        must_change_password=False,
    )
    db.session.add(user)
    db.session.commit()
    return user


# --- 관리자 조작 ----------------------------------------------------------------


def list_accounts(status=None, limit=200, offset=0):
    query = User.query
    if status:
        if status not in USER_STATUSES:
            raise AppError('MD-ACCOUNTS-0013',
                           f"상태는 {', '.join(USER_STATUSES)} 중 하나여야 합니다.")
        query = query.filter(User.status == status)
    return (query.order_by(User.status.desc(), User.created_at.desc())
                 .limit(limit).offset(offset).all())


def create_account(email, display_name, is_admin, actor):
    """(계정, 임시 비밀번호).

    임시 비밀번호는 호출부가 **한 번만** 화면에 보여 주고 구두로 전달한다.
    메일을 보낼 수단이 없어서 그렇게 할 수밖에 없고, 그래서 첫 로그인 시
    변경을 강제한다.
    """
    email = normalize_email(email)
    name = normalize_name(display_name)
    _ensure_email_free(email)

    temporary = security.new_temporary_password()
    user = User(
        email=email,
        password_hash=security.hash_password(temporary),
        display_name=name,
        status='active',          # 관리자가 만든 계정은 승인 절차가 필요 없다
        is_admin=bool(is_admin),
        must_change_password=True,
        decided_at=_now(),
        decided_by_id=actor.id,
    )
    db.session.add(user)
    db.session.commit()
    return user, temporary


def approve(user_id, actor):
    user = get_account(user_id)
    if user.deleted_at is not None:
        raise AppError('MD-ACCOUNTS-0003', '삭제된 계정입니다.')
    if user.status == 'active':
        # 멱등하게 둔다. 두 관리자가 같은 신청을 동시에 눌러도 사고가 아니다.
        return user
    if user.status != 'pending':
        raise AppError('MD-ACCOUNTS-0004', '승인 대기 상태의 계정만 승인할 수 있습니다.')

    user.status = 'active'
    user.decided_at = _now()
    user.decided_by_id = actor.id
    user.decision_note = None
    db.session.commit()
    return user


def reject(user_id, actor, note):
    """거절 = 정지 상태로 둔다.

    행을 지우지 않는 이유: 같은 사람이 다시 신청하면 아이디가 중복이라 막히는데,
    기록이 없으면 관리자가 **왜 막히는지 알 수 없다.** 사유를 남겨 두면 화면에서
    그대로 보여 줄 수 있다.
    """
    user = get_account(user_id)
    if user.status != 'pending':
        raise AppError('MD-ACCOUNTS-0005', '승인 대기 상태의 계정만 거절할 수 있습니다.')
    reason = (note or '').strip()
    if not reason:
        raise AppError('MD-ACCOUNTS-0006', '거절 사유를 입력해주세요.')

    user.status = 'suspended'
    user.decided_at = _now()
    user.decided_by_id = actor.id
    user.decision_note = reason[:500]
    db.session.commit()
    return user


def set_status(user_id, status, actor):
    if status not in USER_STATUSES:
        raise AppError('MD-ACCOUNTS-0013',
                       f"상태는 {', '.join(USER_STATUSES)} 중 하나여야 합니다.")
    user = get_account(user_id)
    if user.deleted_at is not None:
        raise AppError('MD-ACCOUNTS-0003', '삭제된 계정입니다.')

    if status != 'active':
        # 자기 자신을 잠그면 되돌릴 방법이 화면에 없다.
        if user.id == actor.id:
            raise Forbidden('MD-ACCOUNTS-0007', '자기 계정은 정지할 수 없습니다.')
        if user.is_admin and not _other_active_admin_exists(user):
            raise Forbidden('MD-ACCOUNTS-0008',
                            '마지막 관리자입니다. 다른 관리자를 먼저 지정하세요.')

    user.status = status
    user.decided_at = _now()
    user.decided_by_id = actor.id
    db.session.commit()

    # 정지는 즉시 효력이 있어야 한다. 세션을 끊지 않으면 이미 받아 둔 refresh 로
    # 계속 새 access 를 받아 간다.
    if status != 'active':
        auth_services.revoke_all_for_user(user.id)
    return user


def set_admin(user_id, is_admin, actor):
    user = get_account(user_id)
    if user.deleted_at is not None:
        raise AppError('MD-ACCOUNTS-0003', '삭제된 계정입니다.')
    if not is_admin:
        if user.id == actor.id:
            raise Forbidden('MD-ACCOUNTS-0009', '자기 관리자 권한은 내릴 수 없습니다.')
        if user.is_admin and not _other_active_admin_exists(user):
            raise Forbidden('MD-ACCOUNTS-0008',
                            '마지막 관리자입니다. 다른 관리자를 먼저 지정하세요.')

    user.is_admin = bool(is_admin)
    db.session.commit()
    return user


def reset_password(user_id):
    """관리자 중개 재설정. 메일을 보낼 수단이 없어 화면에 1회 표시하고 구두로 전달한다."""
    user = get_account(user_id)
    if user.deleted_at is not None:
        raise AppError('MD-ACCOUNTS-0003', '삭제된 계정입니다.')

    temporary = security.new_temporary_password()
    user.password_hash = security.hash_password(temporary)
    user.must_change_password = True
    db.session.commit()

    # 재설정의 이유가 유출일 수 있다. 예전 세션이 살아 있으면 재설정이 무의미하다.
    auth_services.revoke_all_for_user(user.id)
    return user, temporary


def delete_account(user_id, actor):
    """계정을 지운다 — 행을 없애지 않고 `deleted_at` 을 찍는다.

    행을 지우면 그 사람이 만든 카드의 `created_by` 가 NULL 이 되어 "누가
    만들었는지" 가 통째로 사라진다. 접근만 끊고 참조는 남긴다.
    """
    user = get_account(user_id)
    if user.id == actor.id:
        raise Forbidden('MD-ACCOUNTS-0007', '자기 계정은 삭제할 수 없습니다.')
    if user.is_admin and not _other_active_admin_exists(user):
        raise Forbidden('MD-ACCOUNTS-0008',
                        '마지막 관리자입니다. 다른 관리자를 먼저 지정하세요.')
    if user.deleted_at is not None:
        return user

    user.deleted_at = _now()
    user.status = 'suspended'
    user.decided_at = _now()
    user.decided_by_id = actor.id
    db.session.commit()

    auth_services.revoke_all_for_user(user.id)
    return user
