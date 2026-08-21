from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate

db = SQLAlchemy()
migrate = Migrate()

# JWTManager·Bcrypt 확장을 두지 않는다.
#
# 인증은 modules/auth 가 직접 처리한다 — access 는 PyJWT, 비밀번호는 bcrypt 를
# 직접 부른다(security.py). 확장을 함께 초기화해 두면 `@jwt_required()` 로도
# 라우트를 막을 수 있게 되는데, 그 경로는 계정 상태(정지·삭제·승인대기)를 보지
# 않는다. **판정 지점이 둘로 갈리는 것이 문제다** — 정지된 계정이 한쪽으로는
# 막히고 다른 쪽으로는 통과한다.
