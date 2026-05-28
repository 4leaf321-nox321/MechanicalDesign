import os
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from .config import Config
from .extensions import db, migrate, jwt, bcrypt

# 빌드된 프론트엔드 정적 파일 경로 (backend의 상위의 frontend/dist)
FRONTEND_DIST_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), '..', '..', 'frontend', 'dist')
)


def create_app(config_class=Config):
    # static_folder=None으로 Flask 내장 /<path:filename> 라우트를 비활성화.
    # 프론트엔드 서빙은 아래 serve_index/serve_static에서 전담 → SPA fallback이 정상 동작.
    app = Flask(__name__, static_folder=None)
    app.config.from_object(config_class)

    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    bcrypt.init_app(app)

    # CORS
    cors_origins = app.config.get('CORS_ORIGINS', '*')
    if isinstance(cors_origins, str):
        cors_origins = [o.strip() for o in cors_origins.split(',')]
    CORS(app, resources={r"/api/*": {"origins": cors_origins}},
         supports_credentials=True,
         allow_headers=["Content-Type", "Authorization"],
         methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])

    # Register blueprints
    from .modules.main.routes import main_bp
    app.register_blueprint(main_bp, url_prefix='/api')

    from .modules.cards.routes import cards_bp, templates_bp
    app.register_blueprint(cards_bp, url_prefix='/api/cards')
    app.register_blueprint(templates_bp, url_prefix='/api/templates')

    # Import models for migration detection
    from .modules.cards import models  # noqa: F401

    # Health check
    @app.route('/api/health')
    def health():
        return jsonify({"status": "ok"})

    # --- SPA 서빙 (API가 아닌 모든 경로를 프론트엔드로 폴백) ---
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
