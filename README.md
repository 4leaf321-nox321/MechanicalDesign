# Mechanical Design

기계 설계 카드/변수/DOE(실험계획법)를 관리하는 웹 애플리케이션. Flask 백엔드가 API와 빌드된 프론트엔드를 한 프로세스로 서빙합니다.

## Tech Stack

- **Backend**: Python 3.11+, Flask 3, SQLAlchemy 2, Flask-Migrate (Alembic), Waitress, PostgreSQL 16+
- **Frontend**: React 18, Vite 4, React Router, react-grid-layout, Plotly.js, styled-components
- **Auth**: Flask-JWT-Extended, Flask-Bcrypt

## Project Structure

```
.
├── backend/
│   ├── app/
│   │   ├── __init__.py            # create_app() — 블루프린트 등록 + SPA 폴백
│   │   ├── config.py
│   │   ├── extensions.py          # db, migrate, jwt, bcrypt
│   │   └── modules/
│   │       ├── main/              # /api 공통 라우트
│   │       └── cards/             # /api/cards, /api/templates
│   ├── migrations/                # Alembic 마이그레이션
│   ├── requirements.txt
│   └── run.py                     # 진입점 (dev: Flask, prod: Waitress)
├── frontend/
│   ├── src/
│   │   ├── pages/                 # MainPage
│   │   └── shared/
│   │       ├── components/        # DOE 플롯, Settings, InputVariables 등
│   │       └── utils/             # doeEngine, evaluators
│   ├── package.json
│   └── vite.config.js
└── 배포방법.md                    # 신규 서버 배포 전체 가이드
```

## Quick Start (개발)

### 1. PostgreSQL 데이터베이스 준비

```bash
psql -U postgres -c "CREATE DATABASE mechanicaldesign;"
```

### 2. 백엔드

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\Activate.ps1
# Linux/Mac
source venv/bin/activate

pip install -r requirements.txt
```

`backend/.env` 작성:

```env
FLASK_ENV=development
FLASK_HOST=0.0.0.0
FLASK_PORT=5174
SECRET_KEY=dev-secret-change-me
JWT_SECRET_KEY=dev-jwt-secret-change-me
DATABASE_URL=postgresql+psycopg://postgres:YOUR_PASSWORD@localhost:5432/mechanicaldesign
```

스키마 생성 후 실행:

```bash
flask db upgrade
python run.py
```

### 3. 프론트엔드 빌드

```bash
cd frontend
npm install
npm run build
```

빌드 결과는 `frontend/dist/` 에 생성되며 Flask가 자동으로 서빙합니다.

브라우저에서 <http://localhost:5174> 접속.

### 개발 모드 (HMR)

프론트엔드를 별도로 띄우고 싶으면:

```bash
cd frontend
npm run dev    # 보통 http://localhost:5173, vite.config.js의 proxy 설정 따름
```

## Production 배포

신규 서버 배포 절차는 [배포방법.md](배포방법.md) 참고 (PostgreSQL 설치, systemd/NSSM 등록, 방화벽, HTTPS 등 포함).

## API

- `GET /api/health` — `{"status": "ok"}`
- `GET /api/cards`, `POST /api/cards`, ... — 카드 CRUD
- `GET /api/templates`, ... — 변수 템플릿

## License

Private.
