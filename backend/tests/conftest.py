"""테스트 공용 설정.

**개발 DB 를 쓰지 않는다.** `TestConfig` 가 가리키는 별도 DB(기본
`mechanicaldesign_test`)에 스키마를 만들고 끝나면 지운다. 테스트가 실수로
운영·개발 데이터를 지우는 것이 가장 나쁜 실패다.

DB 가 없으면 여기서 만든다. 사람이 미리 `createdb` 를 해 둬야 테스트가 도는
구조면, 새로 받은 사람은 원인을 알 수 없는 접속 오류부터 만난다.
"""

import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from app import create_app  # noqa: E402
from app.config import TestConfig  # noqa: E402
from app.extensions import db  # noqa: E402


def _ensure_database(dsn):
    """대상 DB 가 없으면 만든다. 이미 있으면 아무것도 하지 않는다."""
    import psycopg

    url = urlsplit(dsn.replace('postgresql+psycopg://', 'postgresql://'))
    name = url.path.lstrip('/').split('?')[0]
    conn_args = {
        'host': url.hostname or 'localhost',
        'port': url.port or 5432,
        'user': unquote(url.username or 'postgres'),
        'password': unquote(url.password or ''),
        'dbname': 'postgres',
        'autocommit': True,
    }
    with psycopg.connect(**conn_args) as conn:
        exists = conn.execute(
            'SELECT 1 FROM pg_database WHERE datname = %s', (name,)
        ).fetchone()
        if not exists:
            conn.execute(f'CREATE DATABASE "{name}" ENCODING \'UTF8\'')


@pytest.fixture(scope='session')
def app():
    """앱 하나를 세션 내내 쓴다. **다만 앱 컨텍스트를 켠 채로 두지 않는다.**

    Flask 는 요청을 처리할 때 이미 켜진 앱 컨텍스트가 있으면 그것을 **재사용**
    한다. 그러니 여기서 컨텍스트를 켠 채 yield 하면, 테스트 클라이언트의 모든
    요청이 그 하나의 SQLAlchemy 세션을 공유하게 된다.

    그러면 테스트가 조용히 거짓말을 한다. 세션의 identity map 은 한 번 읽은
    행을 그대로 돌려주므로, 테스트가 다른 컨텍스트에서 그 행을 바꿔도 요청 쪽은
    **옛 값을 계속 본다.** 실제로 "폐기한 토큰이 계속 인증되는" 결과가 나왔는데,
    앱에는 아무 문제가 없고 그 테스트를 혼자 돌리면 통과한다 — 앞선 테스트가
    같은 세션에 그 행을 캐시해 두었을 때만 깨지는, 순서에 따라 갈리는 실패다.

    운영에서는 요청마다 새 앱 컨텍스트(=새 세션)가 생기므로 이런 일이 없다.
    테스트도 같은 조건에서 돌아야 한다.
    """
    _ensure_database(TestConfig.SQLALCHEMY_DATABASE_URI)
    application = create_app(TestConfig)
    with application.app_context():
        # 지난 실행이 중간에 끊겨 남은 표가 있으면 먼저 치운다.
        db.drop_all()
        db.create_all()

    yield application

    with application.app_context():
        db.session.remove()
        db.drop_all()


@pytest.fixture(autouse=True)
def clean_tables(app):
    """테스트마다 빈 상태에서 시작한다.

    표를 지웠다 만드는 대신 행만 지운다 — 훨씬 빠르고, 마이그레이션이 만든
    제약을 그대로 둔 채 검사할 수 있다.
    """
    yield
    with app.app_context():
        for table in reversed(db.metadata.sorted_tables):
            db.session.execute(table.delete())
        db.session.commit()


@pytest.fixture
def card(app):
    """변수를 담을 카드 하나."""
    from app.modules.cards.models import Card

    with app.app_context():
        row = Card(name='테스트 카드', route='test-card')
        db.session.add(row)
        db.session.commit()
        return row.id
