"""비밀번호 해시와 토큰 발급 — 암호 관련 원시 연산만 모은다.

**bcrypt 앞에 sha256 을 한 번 건다.** bcrypt 는 입력을 72바이트에서 자르는데,
한글 비밀번호는 글자당 3바이트라 **24자를 넘으면 뒤가 조용히 무시된다.** 긴
비밀번호를 쓴 사람일수록 손해를 보는 셈인데, 아무 오류도 나지 않아 알아챌 수가
없다. sha256 으로 길이를 고정한 뒤 bcrypt 에 넣으면 그 한계가 사라진다
(passlib 의 bcrypt_sha256 과 같은 방식).

flask_bcrypt 를 쓰지 않고 bcrypt 를 직접 부른다 — 감싸는 층이 하나 늘어도
sha256 전처리는 어차피 여기서 해야 하고, 확장 초기화에 묶이지 않는 편이 스크립트
(seed_install.py)에서 쓰기 쉽다.
"""

import base64
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from flask import current_app


def _prepared(password):
    """bcrypt 에 넣기 전 길이를 고정한다. 결과는 항상 44바이트."""
    return base64.b64encode(hashlib.sha256(password.encode('utf-8')).digest())


def hash_password(password):
    return bcrypt.hashpw(_prepared(password), bcrypt.gensalt()).decode('ascii')


def verify_password(password, password_hash):
    try:
        return bcrypt.checkpw(_prepared(password), password_hash.encode('ascii'))
    except (ValueError, TypeError):
        # 저장된 해시가 손상된 경우. 인증 실패로 처리한다.
        return False


def hash_token(raw):
    """불투명 토큰(refresh)의 저장용 해시.

    원문은 어디에도 남기지 않는다 — DB 가 새어도 남의 세션을 탈취할 수 없어야
    한다. 난수라서 사전 공격이 성립하지 않으므로 sha256 이면 충분하다.
    """
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()


def new_opaque_token():
    return secrets.token_urlsafe(48)


def new_temporary_password():
    """관리자가 구두로 전달할 임시 비밀번호. 읽어 주기 어렵지 않은 길이로."""
    return secrets.token_urlsafe(12)


def now():
    return datetime.now(timezone.utc)


def create_access_token(user_id):
    """(JWT, 만료까지 초).

    access 는 짧게 살고 폐기하지 않는다 — 폐기는 refresh 의 몫이다. 여기에
    폐기 목록을 붙이면 매 요청마다 DB 를 한 번 더 읽게 되고, 그러면 JWT 를 쓸
    이유가 없어진다.
    """
    ttl = timedelta(minutes=current_app.config['ACCESS_TOKEN_MINUTES'])
    issued = now()
    payload = {
        'sub': str(user_id),
        'iat': int(issued.timestamp()),
        'exp': int((issued + ttl).timestamp()),
        'typ': 'access',
        # **매번 다른 토큰이 나오게 한다.** iat 는 초 단위라, 로그인과 곧이은
        # 갱신이 같은 초에 일어나면 본문이 완전히 같아져 **글자까지 똑같은
        # 토큰**이 나온다(실측). 그러면 로그만 보고 두 발급을 구분할 수 없고,
        # 나중에 개별 토큰을 추적하거나 막으려 할 때 붙일 자리도 없다.
        'jti': secrets.token_urlsafe(8),
    }
    token = jwt.encode(payload, current_app.config['JWT_SECRET_KEY'], algorithm='HS256')
    return token, int(ttl.total_seconds())


def decode_access_token(token):
    """검증에 실패하면 None.

    실패 사유(만료·서명 불일치)를 호출자에게 넘기지 않는다 — 응답으로 새면
    공격자에게 힌트가 된다. 사유가 필요하면 호출부에서 로그로 남긴다.
    """
    try:
        payload = jwt.decode(
            token, current_app.config['JWT_SECRET_KEY'], algorithms=['HS256']
        )
    except jwt.PyJWTError:
        return None
    return payload if payload.get('typ') == 'access' else None
