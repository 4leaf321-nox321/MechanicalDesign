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
├── setup.ps1                      # 최초 설치 자동화
├── update.ps1                     # 운영 서버 업데이트 자동화
├── install-service.ps1            # NSSM Windows 서비스 등록
└── 배포방법.md                    # 신규 서버 배포 전체 가이드
```

## Quick Start (Windows)

PowerShell에서 한 줄씩 실행:

```powershell
# 1) clone
git clone https://github.com/4leaf321-nox321/MechanicalDesign.git
cd MechanicalDesign

# 2) .env 작성 — 템플릿 복사 후 비밀값 채우기
copy backend\.env.example backend\.env
notepad backend\.env
# SECRET_KEY, JWT_SECRET_KEY, DATABASE_URL의 비밀번호를 채워 저장.
# 랜덤 키 생성: python -c "import secrets; print(secrets.token_urlsafe(32))"

# 3) 자동 셋업 (venv, pip, DB, 마이그레이션, npm install, build)
.\setup.ps1

# 4) 실행
cd backend
venv\Scripts\Activate.ps1
python run.py
```

→ 브라우저에서 <http://localhost:5174> 접속.

> psql이 PATH에 없으면 `.\setup.ps1 -PgBinDir "C:\Program Files\PostgreSQL\16\bin"` 처럼 경로 지정.

## 운영 서버 배포 (Windows)

처음 한 번:

```powershell
git clone https://github.com/4leaf321-nox321/MechanicalDesign.git
cd MechanicalDesign
copy backend\.env.example backend\.env
notepad backend\.env                 # FLASK_ENV=production 으로 설정
.\setup.ps1
.\install-service.ps1                # 관리자 PowerShell에서 — NSSM 서비스 등록
```

이후 업데이트할 때마다:

```powershell
cd MechanicalDesign
.\update.ps1
# → git pull, 의존성 갱신, 마이그레이션, 프론트 리빌드, 서비스 재시작 자동
```

`update.ps1` 옵션:
- `-ServiceName "다른이름"` — 서비스 이름이 기본값과 다를 때
- `-NoRestart` — 수동 실행 중이라 자동 재시작 원치 않을 때

상세 가이드(PostgreSQL 설치, 방화벽, HTTPS 등)는 [배포방법.md](배포방법.md) 참고.

### 개발 모드 (HMR)

프론트엔드를 별도 dev 서버로 띄우려면:

```powershell
cd frontend
npm run dev    # http://localhost:5173, Vite proxy로 백엔드 호출
```

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
