"""오류 규약 — 기존 응답 모양을 깨지 않고 코드만 얹는다.

기존 라우트는 `{'error': '<한글 메시지>'}` 를 돌려준다. 그 모양을 그대로 두고
`code` 만 추가한다 — 응답은 `{'error': ..., 'code': 'MD-AUTH-0001'}` 이고,
프론트가 글자를 그대로 보여 주는 경로는 예전과 같다.

**코드가 필요한 이유는 프론트가 분기해야 하는 실패가 있기 때문이다.** 세션
만료(조용히 갱신하고 재시도), 승인 대기(안내 문구가 다름), 비밀번호 강제 변경.
메시지 문자열로 분기하면 문구를 다듬는 순간 조용히 깨진다.

오류를 만드는 경로가 곧 로그를 남기는 경로다. 예외를 삼키고 200을 돌려주는
자리를 만들지 않는다 — 원인이 로그에 남지 않으면 나중에 되짚을 방법이 없다.

코드 형식: MD-<모듈>-<번호>   예) MD-AUTH-0001, MD-ACCOUNTS-0003
"""

import logging

from flask import jsonify

logger = logging.getLogger(__name__)


class AppError(Exception):
    """응답으로 나갈 오류. 만들어지는 순간 로그에 남는다."""

    status = 400

    def __init__(self, code, message, status=None, details=None):
        super().__init__(message)
        self.code = code
        self.message = message
        if status is not None:
            self.status = status
        self.details = details or {}

    def to_response(self):
        body = {'error': self.message, 'code': self.code}
        if self.details:
            body['details'] = self.details
        return jsonify(body), self.status


class Unauthorized(AppError):
    """로그인이 필요하거나 세션이 유효하지 않다."""

    status = 401


class Forbidden(AppError):
    """인증은 됐지만 권한이 없거나 계정 상태가 막고 있다."""

    status = 403


class NotFound(AppError):
    status = 404


class Conflict(AppError):
    status = 409


def register_error_handlers(app):
    @app.errorhandler(AppError)
    def _handle_app_error(error):
        # 401 은 로그인 화면을 띄우기 위한 정상 흐름에서도 나온다(만료된 access
        # 로 요청 → 갱신 → 재시도). 그것까지 warning 으로 쌓으면 진짜 문제가
        # 묻히므로 레벨을 나눈다.
        level = logging.INFO if error.status in (401, 403) else logging.WARNING
        logger.log(
            level,
            '%s %s — %s (%s)',
            error.status,
            error.code,
            error.message,
            error.details or {},
        )
        return error.to_response()

    return app
