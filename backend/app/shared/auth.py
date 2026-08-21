"""인증 진입점 — 모든 모듈이 쓰는 `current_user`.

여기가 `app/modules/auth` 가 아니라 `shared` 에 있는 이유: 모든 모듈이 현재
사용자를 필요로 하는데, 그때마다 auth 모듈을 직접 import 하면 모든 모듈이 auth
에 묶인다. 인증은 횡단 관심사이므로 shared 가 맞다. 방향은 shared → auth 한
쪽이며 그 반대는 없다.

**보호는 블루프린트 단위로 건다.** 라우트마다 데코레이터를 붙이는 방식은 새
엔드포인트를 추가하는 사람이 한 줄을 빠뜨리는 순간 조용히 열린다. 그 구멍은
아무 오류도 내지 않아서 눈으로 찾아야만 발견된다. `protect_blueprint(bp)` 는
그 블루프린트의 **모든** 요청을 막으므로 빠뜨릴 자리가 없다.
"""

import logging

from flask import g, request

from app.extensions import db
from app.modules.accounts.models import User
from app.modules.auth import security, services, tokens
from app.shared.errors import Forbidden, Unauthorized

logger = logging.getLogger(__name__)

_UNAUTHENTICATED = '로그인이 필요합니다.'


def _bearer():
    header = request.headers.get('Authorization')
    if not header or not header.lower().startswith('bearer '):
        return None
    return header[7:].strip() or None


def authenticate_request():
    """Bearer 토큰으로 사용자를 찾아 `g.current_user` 에 둔다.

    두 종류가 같은 헤더로 온다.

        access JWT   사람의 브라우저 세션. 15분 살고 refresh 로 갱신된다
        mdt_...      개인 액세스 토큰. MCP·스크립트가 쓴다(app.modules.auth.tokens)

    **접두사로 가른다.** 형태로 짐작하면("점이 두 개면 JWT") 언젠가 틀리고,
    그 실수는 "인증은 되는데 엉뚱한 사유로 401" 형태라 원인을 찾기 어렵다.

    갈라지는 것은 **누구인지 알아내는 방법**뿐이다. 알아낸 뒤의 계정 상태
    판정(정지·삭제)은 아래에서 하나로 합쳐진다 — 두 경로가 각자 조건을 들면
    상태가 늘 때 한쪽을 빠뜨리고, 빠뜨린 쪽이 토큰이면 정지된 사람의 MCP 가
    계속 돈다.

    실패하면 AppError 를 던진다 — 에러 핸들러가 규약대로 응답을 만든다.
    """
    token = _bearer()
    if token is None:
        raise Unauthorized('MD-AUTH-0100', _UNAUTHENTICATED)

    if tokens.looks_like_pat(token):
        user = tokens.resolve(token)
        if user is None:
            # 사유(없음·폐기·만료)를 나누지 않는다. 나누면 남의 토큰을
            # 찍어 보며 존재 여부를 알아낼 수 있다.
            raise Unauthorized('MD-AUTH-0104',
                               '토큰이 유효하지 않거나 폐기·만료되었습니다.')
        # PAT 는 사람이 아니라 **기계**가 부른 것이다. 카드를 누가 만들었는지
        # 같은 표시에 쓴다(권한 경계가 아니다 — 권한은 어디까지나 그 사람 것이다).
        g.via_token = True
        return _finish(user)

    payload = security.decode_access_token(token)
    if payload is None:
        # 사유(만료·서명 불일치)는 응답에 싣지 않는다 — 공격자에게 힌트가 된다.
        # 프론트는 이 코드를 보고 조용히 갱신을 시도한다.
        raise Unauthorized('MD-AUTH-0102', '세션이 만료되었습니다.')

    try:
        user_id = int(payload['sub'])
    except (KeyError, TypeError, ValueError):
        raise Unauthorized('MD-AUTH-0102', '세션이 만료되었습니다.')

    user = db.session.get(User, user_id)
    if user is None:
        raise Forbidden('MD-AUTH-0002', '삭제된 계정입니다. 관리자에게 문의하세요.')

    return _finish(user)


def _finish(user):
    """어느 토큰으로 왔든 여기를 지난다 — 계정 상태 판정은 한 곳에서만."""
    # 상태 판정은 로그인과 같은 함수를 쓴다. 정지된 계정이 이미 받아 둔 access
    # 나 발급해 둔 토큰으로 계속 API 를 부르는 것을 막는 자리가 여기다.
    services.ensure_can_sign_in(user)
    g.current_user = user
    return user


def current_user():
    """현재 요청의 사용자. 보호된 경로 안에서만 부른다."""
    user = getattr(g, 'current_user', None)
    if user is None:
        raise Unauthorized('MD-AUTH-0100', _UNAUTHENTICATED)
    return user


def _before_request():
    # CORS 사전 요청(OPTIONS)에는 Authorization 헤더가 실리지 않는다. 여기서
    # 막으면 브라우저가 본 요청을 보내기도 전에 실패한다.
    if request.method == 'OPTIONS':
        return None
    authenticate_request()
    return None


def protect_blueprint(blueprint):
    """이 블루프린트의 모든 요청에 로그인을 요구한다."""
    blueprint.before_request(_before_request)
    return blueprint


def login_required(view):
    """개별 라우트용. 블루프린트 전체가 아니라 일부만 막을 때 쓴다."""
    from functools import wraps

    @wraps(view)
    def wrapper(*args, **kwargs):
        if getattr(g, 'current_user', None) is None:
            authenticate_request()
        return view(*args, **kwargs)

    return wrapper


def admin_required(view):
    """관리자 전용 라우트.

    로그인 여부까지 여기서 함께 본다 — `@login_required` 와 짝지어 쓰는 것을
    잊는 실수를 없애기 위해서다.
    """
    from functools import wraps

    @wraps(view)
    def wrapper(*args, **kwargs):
        if getattr(g, 'current_user', None) is None:
            authenticate_request()
        if not g.current_user.is_admin:
            raise Forbidden('MD-AUTH-0103', '관리자만 할 수 있습니다.')
        return view(*args, **kwargs)

    return wrapper
