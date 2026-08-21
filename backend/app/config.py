import os
from dotenv import load_dotenv

load_dotenv()


def _int_env(name, default):
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def _bool_env(name, default=False):
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ('1', 'true', 'yes', 'on')


class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-key')
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL',
        'postgresql+psycopg://postgres:32167@localhost:5432/mechanicaldesign')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JSON_AS_ASCII = False

    # === 인증 ===
    # access 는 JWT(폐기하지 않음), refresh 는 DB 행(즉시 폐기 가능).
    # flask_jwt_extended 를 쓰지 않는 이유는 그쪽 refresh 도 stateless JWT 라
    # 폐기가 안 되기 때문이다 — modules/auth/models.py 주석 참조.
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'jwt-secret-key')

    ACCESS_TOKEN_MINUTES = _int_env('ACCESS_TOKEN_MINUTES', 720)   # 12시간
    REFRESH_TOKEN_DAYS = _int_env('REFRESH_TOKEN_DAYS', 30)

    REFRESH_COOKIE_NAME = os.environ.get('REFRESH_COOKIE_NAME', 'md_refresh')
    # **사내망 http 배포에서는 false 여야 한다.** true 면 브라우저가 쿠키를 버려
    # 로그인이 유지되지 않는다. https 로 서비스할 때만 켠다.
    REFRESH_COOKIE_SECURE = _bool_env('REFRESH_COOKIE_SECURE', False)

    # CORS
    CORS_ORIGINS = os.environ.get('CORS_ORIGINS', 'http://localhost:5175')

    # === MCP ===
    # 밖의 AI 가 붙는 주소. 토큰 화면이 "이대로 붙여 넣으세요" 라고 보여 줄
    # 명령을 만들 때 쓴다.
    #
    # **평소에는 비워 둔다.** 비어 있으면 사용자가 지금 접속한 그 주소에서
    # 호스트를 떼어 MCP 포트를 붙인다 — 기본 설치에서는 그게 정확하고,
    # 주소를 어딘가에 적어 두면 서버를 옮길 때 같이 고쳐야 할 자리가 는다.
    #
    # install-mcp.ps1 에서 -Port 를 바꿨다면 MCP_PORT 를 맞춰 적고,
    # 리버스 프록시 뒤에 두었다면 MCP_URL 로 통째로 지정한다.
    MCP_URL = os.environ.get('MCP_URL', '')
    MCP_PORT = _int_env('MCP_PORT', 3010)

    # Upload
    MAX_CONTENT_LENGTH = 1024 * 1024 * 1024  # 1GB


class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = os.environ.get('TEST_DATABASE_URL',
        'postgresql+psycopg://postgres:32167@localhost:5432/mechanicaldesign_test')
