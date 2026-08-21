"""인증 라우터.

**refresh 토큰은 httpOnly 쿠키로만 오간다.** 자바스크립트가 읽을 수 없으므로
XSS 로 새지 않는다. 배포는 백엔드 한 프로세스가 SPA 까지 서빙하므로 동일
출처이고, 개발 중에도 Vite 프록시를 거치므로 브라우저 입장에서는 같은 출처다.
access 토큰은 응답 본문으로만 주고 프론트는 **메모리에** 둔다 — localStorage 에
두면 XSS 한 번에 탈취된다.

쿠키 path 를 `/api/auth` 로 제한해 일반 API 호출에는 실려 나가지 않는다.
"""

from flask import Blueprint, current_app, g, jsonify, request

from app.modules.accounts import services as accounts
from app.modules.auth import services, tokens
from app.shared.auth import login_required
from app.shared.errors import Forbidden, Unauthorized

auth_bp = Blueprint('auth', __name__)

COOKIE_PATH = '/api/auth'


def _set_refresh_cookie(response, raw):
    response.set_cookie(
        current_app.config['REFRESH_COOKIE_NAME'],
        raw,
        max_age=current_app.config['REFRESH_TOKEN_DAYS'] * 24 * 3600,
        httponly=True,
        samesite='Lax',
        # 사내망 http 배포에서 secure=True 면 브라우저가 쿠키를 **버린다.**
        # 로그인은 되는데 새로고침하면 풀리는, 원인 찾기 어려운 형태로 실패한다.
        secure=current_app.config['REFRESH_COOKIE_SECURE'],
        path=COOKIE_PATH,
    )
    return response


def _clear_refresh_cookie(response):
    response.delete_cookie(current_app.config['REFRESH_COOKIE_NAME'], path=COOKIE_PATH)
    return response


def _session_response(user, access, expires_in):
    return jsonify({
        'access_token': access,
        # 초 단위. 프론트가 만료 전에 갱신을 걸 수 있게 한다.
        'expires_in': expires_in,
        'user': user.to_dict(),
    })


@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json(silent=True) or {}
    user = services.authenticate(data.get('email'), data.get('password'))
    access, expires_in, refresh_raw = services.issue_session(
        user, request.headers.get('User-Agent')
    )
    response = _session_response(user, access, expires_in)
    return _set_refresh_cookie(response, refresh_raw)


@auth_bp.route('/refresh', methods=['POST'])
def refresh():
    raw = request.cookies.get(current_app.config['REFRESH_COOKIE_NAME'])
    if not raw:
        raise Unauthorized('MD-AUTH-0003', '세션이 없습니다. 로그인해 주세요.')

    user, access, expires_in, new_raw = services.rotate_refresh(
        raw, request.headers.get('User-Agent')
    )
    response = _session_response(user, access, expires_in)
    return _set_refresh_cookie(response, new_raw)


@auth_bp.route('/logout', methods=['POST'])
def logout():
    raw = request.cookies.get(current_app.config['REFRESH_COOKIE_NAME'])
    if raw:
        services.revoke_refresh(raw)
    # 인증을 요구하지 않는다. access 가 이미 만료된 상태에서도 로그아웃은
    # 성립해야 하고, 쿠키를 지우는 일에 access 가 필요하지도 않다.
    return _clear_refresh_cookie(jsonify({'message': '로그아웃되었습니다.'}))


@auth_bp.route('/signup', methods=['POST'])
def signup():
    """가입 신청. 승인 전까지는 로그인할 수 없다.

    인증 없이 열려 있는 유일한 쓰기 엔드포인트다. 만들어지는 것은 로그인도 안
    되는 pending 행 하나뿐이라 악용해도 얻을 것이 없다.
    """
    data = request.get_json(silent=True) or {}
    user = accounts.signup(
        email=data.get('email'),
        password=data.get('password'),
        display_name=data.get('display_name'),
    )
    return jsonify({
        'message': '가입 신청이 접수되었습니다. 관리자 승인 후 로그인할 수 있습니다.',
        'account': user.to_dict(),
    }), 201


@auth_bp.route('/me', methods=['GET'])
@login_required
def me():
    return jsonify(g.current_user.to_dict())


@auth_bp.route('/me', methods=['PATCH'])
@login_required
def update_me():
    """자기 표시 이름을 바꾼다.

    아이디는 여기서 못 바꾼다 — 로그인 식별자라 본인이 바꾸면 기록이 가리키는
    대상이 흔들린다. 그것은 관리자의 일이다.
    """
    from app.extensions import db

    data = request.get_json(silent=True) or {}
    g.current_user.display_name = accounts.normalize_name(data.get('display_name'))
    db.session.commit()
    return jsonify(g.current_user.to_dict())


@auth_bp.route('/change-password', methods=['POST'])
@login_required
def change_password():
    data = request.get_json(silent=True) or {}
    services.change_password(
        g.current_user, data.get('current_password'), data.get('new_password')
    )
    # 모든 세션을 끊었으므로 이 브라우저의 쿠키도 함께 버린다. 프론트는 응답을
    # 받은 뒤 다시 로그인시킨다.
    return _clear_refresh_cookie(jsonify({'message': '비밀번호가 변경되었습니다.'}))


# --- 개인 액세스 토큰 (MCP·스크립트용) ----------------------------------------
#
# 사람이 직접 쓰는 화면이 아니라, **사람이 기계에게 줄 자격 증명**을 만드는
# 자리다. 그래서 관리자 전용이 아니다 — 자기 권한으로 도는 토큰이므로 누구나
# 자기 것을 만들 수 있어야 하고, 그래야 "누가 만든 카드인지" 가 사람 단위로
# 남는다. 관리자 토큰 하나를 모두가 돌려 쓰면 그 기록이 통째로 사라진다.


@auth_bp.route('/me/tokens', methods=['GET'])
@login_required
def list_my_tokens():
    return jsonify([t.to_dict() for t in tokens.list_for(g.current_user)])


@auth_bp.route('/me/tokens', methods=['POST'])
@login_required
def create_my_token():
    """새 토큰 발급. **원문은 이 응답에서 한 번만 나간다.**"""
    # 임시 비밀번호를 아직 안 바꾼 사람은 토큰을 못 만든다. 토큰은 만료 전까지
    # 비밀번호와 무관하게 살아 있어서, 여기를 열어 두면 임시 비밀번호를 영영
    # 안 바꾸고도 API 를 계속 쓸 수 있는 우회로가 된다.
    if g.current_user.must_change_password:
        raise Forbidden('MD-AUTH-0114',
                        '비밀번호를 먼저 변경해 주세요. 그 전에는 토큰을 만들 수 없습니다.')

    data = request.get_json(silent=True) or {}
    row, raw = tokens.create(
        g.current_user,
        data.get('name'),
        expires_days=data.get('expires_days', tokens.DEFAULT_EXPIRES_DAYS),
    )
    return jsonify({
        'token': raw,
        'info': row.to_dict(),
        'message': '지금 복사해 두세요. 이 값은 다시 볼 수 없습니다.',
    }), 201


@auth_bp.route('/me/tokens/<int:token_id>', methods=['DELETE'])
@login_required
def revoke_my_token(token_id):
    tokens.revoke(g.current_user, token_id)
    return jsonify({'message': '토큰을 폐기했습니다.'})
