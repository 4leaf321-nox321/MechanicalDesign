import os
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from .config import Config
from .extensions import db, migrate

# 빌드된 프론트엔드 정적 파일 경로 (backend의 상위의 frontend/dist)
FRONTEND_DIST_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), '..', '..', 'frontend', 'dist')
)


def create_app(config_class=Config):
    # static_folder=None으로 Flask 내장 /<path:filename> 라우트를 비활성화.
    # 프론트엔드 서빙은 아래 serve_index/serve_static에서 전담 → SPA fallback이 정상 동작.
    app = Flask(__name__, static_folder=None)
    app.config.from_object(config_class)

    # 운영에서 기본 비밀키가 그대로 남으면 누구나 세션과 토큰을 위조할 수 있다.
    # 조용히 도는 것보다 기동을 거부하는 편이 낫다 — 설치 스크립트가 난수를
    # 채워 주므로 정상 배포에서는 걸리지 않는다.
    if os.environ.get('FLASK_ENV') == 'production':
        for key, default in (('SECRET_KEY', 'dev-secret-key'),
                             ('JWT_SECRET_KEY', 'jwt-secret-key')):
            value = app.config.get(key) or ''
            hint = ('backend/.env 에 임의의 값을 넣으세요: '
                    'python -c "import secrets; print(secrets.token_urlsafe(32))"')
            if value == default:
                raise RuntimeError(f'{key} 가 기본값입니다. {hint}')
            # HMAC-SHA256 의 키가 해시 출력(32바이트)보다 짧으면 강도가 키 길이로
            # 내려앉는다. PyJWT 도 이 경우 경고를 내지만, 경고는 로그에 묻힌다.
            if len(value) < 32:
                raise RuntimeError(
                    f'{key} 가 {len(value)}자로 너무 짧습니다(32자 이상). {hint}'
                )

    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)

    # CORS
    cors_origins = app.config.get('CORS_ORIGINS', '*')
    if isinstance(cors_origins, str):
        cors_origins = [o.strip() for o in cors_origins.split(',')]
    CORS(app, resources={r"/api/*": {"origins": cors_origins}},
         supports_credentials=True,
         allow_headers=["Content-Type", "Authorization"],
         methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])

    # 오류 규약 — AppError 를 규약대로 된 응답 + 로그로 바꾼다.
    from .shared.errors import register_error_handlers
    register_error_handlers(app)

    from .shared.auth import protect_blueprint

    # --- 인증 (로그인·가입·세션) — 인증 밖에 있는 유일한 블루프린트 ---
    from .modules.auth.routes import auth_bp
    app.register_blueprint(auth_bp, url_prefix='/api/auth')

    # --- 계정 관리 — 라우트마다 @admin_required ---
    from .modules.accounts.routes import accounts_bp
    app.register_blueprint(accounts_bp, url_prefix='/api/accounts')

    # --- 자료 API — 읽기까지 전부 로그인이 필요하다 ---
    #
    # 라우트마다 데코레이터를 붙이지 않고 블루프린트 단위로 막는다. 새
    # 엔드포인트를 추가하는 사람이 한 줄을 빠뜨려도 열리지 않아야 한다 —
    # 그 구멍은 아무 오류도 내지 않아 눈으로만 발견된다.
    from .modules.main.routes import main_bp
    protect_blueprint(main_bp)
    app.register_blueprint(main_bp, url_prefix='/api')

    from .modules.cards.routes import (
        cards_bp, guard_draft_visibility, record_card_change, templates_bp,
    )
    protect_blueprint(cards_bp)
    protect_blueprint(templates_bp)

    # 초안 가시성. **인증 다음에** 건다 — 누가 요청했는지 알아야 그 사람에게
    # 보일 카드인지 판단할 수 있다. Flask 는 등록 순서대로 부르므로 이 두 줄의
    # 순서가 곧 실행 순서다.
    cards_bp.before_request(guard_draft_visibility)

    # 카드가 바뀌면 변경 이력을 남기고, 기계가 고친 것이면 그 흔적도 남긴다.
    # **성공한 뒤**라야 하므로 after_request 다 — 거절된 시도까지 기록되면,
    # 아무것도 바뀌지 않은 카드에 "AI 가 수정함" 이 붙고 이력에 빈 줄이 쌓인다.
    cards_bp.after_request(record_card_change)
    app.register_blueprint(cards_bp, url_prefix='/api/cards')
    app.register_blueprint(templates_bp, url_prefix='/api/templates')

    from .modules.records.routes import records_bp
    protect_blueprint(records_bp)
    app.register_blueprint(records_bp, url_prefix='/api/records')

    # --- 조직 — 카드가 놓이는 자리 ---
    #
    # 트리 읽기는 로그인한 사람 모두에게 열려 있다. 카드가 누구에게 보이는지는
    # 게시(card_mounts)가 정하고, 트리는 그 자리를 가리키는 이름표일 뿐이다.
    # 고치는 것은 라우트마다 @admin_required 가 막는다.
    from .modules.orgs.routes import orgs_bp
    protect_blueprint(orgs_bp)
    app.register_blueprint(orgs_bp, url_prefix='/api/orgs')

    # Import models for migration detection
    from .modules.cards import models  # noqa: F401
    from .modules.records import models as record_models  # noqa: F401
    from .modules.accounts import models as account_models  # noqa: F401
    from .modules.auth import models as auth_models  # noqa: F401
    from .modules.orgs import models as org_models  # noqa: F401

    # Health check — 인증 없이 열어 둔다.
    # 배포 스크립트와 모니터링이 "서버가 떴는가" 를 물어보는 자리다. 여기에
    # 로그인을 요구하면 자격 증명 없이는 기동 확인을 할 수 없다. 돌려주는 것은
    # 상태 한 글자뿐이라 새는 정보가 없다.
    @app.route('/api/health')
    def health():
        return jsonify({"status": "ok"})

    # --- SPA 서빙 (API가 아닌 모든 경로를 프론트엔드로 폴백) ---
    #
    # 정적 파일에는 인증을 걸지 않는다. 로그인 화면 자체가 이 번들 안에 있어서
    # 막으면 로그인할 방법이 없어진다. 자료는 전부 /api/* 뒤에 있다.
    @app.route('/')
    def serve_index():
        return send_from_directory(FRONTEND_DIST_PATH, 'index.html')

    @app.route('/<path:path>')
    def serve_static(path):
        # /api/* 경로가 여기까지 오면 매칭된 API 라우트가 없다는 뜻
        if path.startswith('api/'):
            return jsonify({'error': f'API endpoint not found: /{path}'}), 404
        # 실제 파일이 있으면 그대로 서빙
        full = os.path.join(FRONTEND_DIST_PATH, path)
        if os.path.exists(full) and os.path.isfile(full):
            return send_from_directory(FRONTEND_DIST_PATH, path)
        # 그 외엔 React Router fallback
        return send_from_directory(FRONTEND_DIST_PATH, 'index.html')

    return app
