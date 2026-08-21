# Mechanical Design

기계 설계 카드/변수/DOE(실험계획법)를 관리하는 웹 애플리케이션. Flask 백엔드가 API와 빌드된 프론트엔드를 한 프로세스로 서빙합니다.

## Tech Stack

- **Backend**: Python 3.13, Flask 3, SQLAlchemy 2, Flask-Migrate (Alembic), Waitress, PostgreSQL 16+
- **Frontend**: React 18, Vite 4, React Router, react-grid-layout, Plotly.js, styled-components
- **Auth**: 자체 계정 — access 는 PyJWT(12시간, 메모리), refresh 는 DB 행 + httpOnly 쿠키(30일, 회전·폐기 가능), 비밀번호는 bcrypt(sha256 전처리)

## Project Structure

```
.
├── backend/
│   ├── app/
│   │   ├── __init__.py            # create_app() — 블루프린트 등록 + SPA 폴백
│   │   ├── config.py
│   │   ├── extensions.py          # db, migrate, jwt, bcrypt
│   │   ├── shared/
│   │   │   ├── auth.py            # 인증 진입점 — 블루프린트 단위 보호
│   │   │   └── errors.py          # 오류 코드 규약 (MD-AUTH-0001 …)
│   │   └── modules/
│   │       ├── auth/              # /api/auth — 로그인·세션·가입·비밀번호
│   │       ├── accounts/          # /api/accounts — 승인·정지·발급 (관리자)
│   │       ├── main/              # /api 공통 라우트
│   │       └── cards/             # /api/cards, /api/templates
│   ├── evaluator/                 # 카드 검증의 시험 계산기 (node 로 실행)
│   ├── migrations/                # Alembic 마이그레이션
│   ├── scripts/seed_install.py    # 초기 관리자 계정 (멱등)
│   ├── requirements.txt
│   └── run.py                     # 진입점 (dev: Flask, prod: Waitress)
├── frontend/
│   ├── src/
│   │   ├── pages/                 # MainPage
│   │   ├── modules/
│   │   │   ├── auth/              # 로그인·가입·비밀번호·액세스 토큰 화면
│   │   │   └── accounts/          # 계정 관리 화면 (관리자)
│   │   └── shared/
│   │       ├── api/client.js      # 토큰 부착 + 401 자동 갱신
│   │       ├── auth/              # AuthContext, ProtectedRoute
│   │       ├── components/        # DOE 플롯, Settings, InputVariables 등
│   │       └── utils/             # doeEngine, evaluators
│   ├── package.json
│   └── vite.config.js
├── mcp_server/                    # 밖의 AI 가 붙는 MCP 서버 (선택, 별도 venv)
│   ├── server.py
│   └── guide/GUIDE.md             # 사용 안내 — 서버가 쥐고 get_guide() 로 내려준다
├── scripts/
│   ├── ci/
│   │   ├── package_deploy.ps1     # 릴리스 패키지(deploy_package.zip) 생성
│   │   └── run_server_template.ps1
│   └── deploy/                    # 서버에서 도는 것들 (패키지에 동봉된다)
│       ├── precheck.ps1           # 설치 전 환경 점검
│       ├── install.ps1            # Day 0 신규 설치
│       ├── deploy.ps1             # 갱신 배포 (staging → 원자적 교체)
│       ├── rollback.ps1           # 직전 버전으로 되돌리기
│       ├── backup.ps1             # DB + 업로드 동시 백업
│       ├── restore.ps1            # 복원 — 기본은 리허설(운영 안 건드림)
│       ├── venv_sync.ps1          # 동봉 wheel 로 가상환경 맞추기
│       ├── install-service.ps1    # NSSM Windows 서비스 등록
│       └── install-mcp.ps1        # MCP 서버 설치 (선택)
├── .github/workflows/
│   ├── ci.yml                     # 빌드·마이그레이션·패키징 검증
│   ├── auto-tag.yml               # package.json version 올리면 태그 + 릴리스
│   └── release-windows.yml        # windows 러너에서 패키지 만들어 릴리스 발행
├── setup.ps1                      # 개발 PC 셋업
├── dev.ps1                        # 개발 모드 (백엔드 + Vite dev server 동시 기동)
└── 배포방법.md                    # 운영 배포 전체 가이드
```

## Quick Start (개발 PC, Windows)

운영 서버 설치는 아래 [운영 서버 배포](#운영-서버-배포-windows) 를 쓴다. 여기는 개발 PC 용이다.

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

# 3) 자동 셋업 (venv, pip, DB, 마이그레이션, 관리자 계정, npm install, build)
.\setup.ps1

# 4) 실행
cd backend
venv\Scripts\Activate.ps1
python run.py
```

→ 브라우저에서 <http://localhost:5176> 접속.

로그인 화면이 뜬다. `setup.ps1` 이 만든 개발용 계정으로 들어간다:

```
admin  /  32167
```

> 아이디에 이메일 형식을 강제하지 않는다 — 사내 계정은 `admin` 처럼 짧은 아이디가
> 편하고, 폐쇄망은 `.local` 같은 도메인을 써서 형식 검사에 걸리기 때문이다.
>
> `setup.ps1` 의 `-AdminEmail` / `-AdminPassword` 로 바꿀 수 있다. 운영 설치도 같은
> 기본값을 쓰며(`scripts/deploy/install.ps1`), `-AdminPassword` 를 빈 값으로 주면
> 난수를 만들어 한 번만 출력하고 첫 로그인에서 변경을 강제한다.

> psql이 PATH에 없으면 `.\setup.ps1 -PgBinDir "C:\Program Files\PostgreSQL\16\bin"` 처럼 경로 지정.

## 운영 서버 배포 (Windows)

**서버는 릴리스 자산 `deploy_package.zip` 하나만 받는다.** 코드·빌드된 화면·
파이썬 의존성(wheel)·배포 스크립트가 모두 그 안에 있어서 서버에 git·인터넷이
필요 없다. Node.js 는 선택 — 카드 정의 검증의 시험 계산에만 쓴다
(없으면 정적 검사까지만 돌고 응답의 `trial_skipped` 에 사유가 남는다).

```powershell
# 스크립트 꺼내기 (한 번만)
gh release download --repo 4leaf321-nox321/MechanicalDesign `
  --pattern deploy_package.zip --dir .
Expand-Archive .\deploy_package.zip -DestinationPath .\pkg -Force
Copy-Item .\pkg\*.ps1 . -Force

# 신규 설치 (관리자 PowerShell)
.\install.ps1 -AppPath 'C:\Server\MechanicalDesign' -DbPassword 'PostgreSQL비밀번호'

# 이후 갱신
.\backup.ps1 -AppPath 'C:\Server\MechanicalDesign' -BackupRoot 'D:\backup\mechanicaldesign'

# 백업이 정말 되살아나는지 확인한다 (운영은 건드리지 않는다)
.\restore.ps1 -AppPath 'C:\Server\MechanicalDesign' `
              -BackupDir 'D:\backup\mechanicaldesign\20260822-031500'
.\deploy.ps1 -AppPath 'C:\Server\MechanicalDesign'

# 문제가 생기면
.\rollback.ps1 -AppPath 'C:\Server\MechanicalDesign'
```

배포는 검사를 모두 통과한 뒤에야 폴더를 원자적으로 바꾼다. 중간에 실패하면
운영 폴더는 손대지 않은 상태 그대로이고, 직전 버전은 `<AppPath>_prev` 에 남아
있다. 업로드·로그는 `<AppPath>_data\` 에 있어 배포가 건드리지 않는다.

절차·폴더 배치·문제 해결은 [배포방법.md](배포방법.md) 에 있다.

### 릴리스 만들기

`frontend/package.json` 의 `version` 을 올려 `main` 에 푸시하면 끝이다.
`auto-tag.yml` 이 태그를 만들고, 같은 실행 안에서 `release-windows.yml` 이
windows 러너에서 패키지를 만들어 릴리스에 붙인다. 버전을 올리지 않은 커밋은
릴리스를 만들지 않으므로 배포 시점을 따로 정할 수 있다.

### 개발 모드 (HMR)

`dev.ps1` 한 번으로 백엔드(5176) + Vite dev server(5175) 두 창이 동시에 띄워집니다:

```powershell
.\dev.ps1                    # 두 창 띄우기
.\dev.ps1 -OpenBrowser       # 브라우저까지 자동
.\dev.ps1 -StopService       # 운영 서비스가 켜져있으면 자동 중지
```

브라우저는 **<http://localhost:5175>** 으로 접속 (5176 아님). Vite 가 `/api/*` 를 자동으로 백엔드(5176)로 프록시합니다.

- `.jsx`/`.css` 변경 → **즉시 HMR 반영** (새로고침 불필요)
- `.py` 변경 → **백엔드 자동 재시작** (`FLASK_RELOAD=0` 으로 끌 수 있음)

> `backend\.env` 의 `FLASK_ENV` 가 `development` 여야 Flask 개발 서버로 뜹니다.

## API

**로그인이 필요하다.** `/api/health` 와 `/api/auth/{login,signup,refresh,logout}`
만 인증 밖에 있다.

- `GET /api/health` — `{"status": "ok"}` (인증 없음)
- `POST /api/auth/login` / `refresh` / `logout` / `signup`
- `GET|PATCH /api/auth/me`, `POST /api/auth/change-password`
- `GET|POST /api/auth/me/tokens`, `DELETE .../{id}` — 개인 액세스 토큰(MCP·스크립트용)
- `GET|POST /api/accounts`, `.../approve|reject|suspend|activate|reset-password` — 관리자 전용
- `GET /api/cards`, `POST /api/cards`, ... — 카드 CRUD
- `GET /api/templates`, ... — 변수 템플릿
- `GET|POST /api/records`, `GET|DELETE /api/records/{id}` — 계산 기록
- `POST /api/cards/{id}/validate` — 카드 정의가 **실제로 계산되는지** 확인
- `POST /api/cards/{id}/publish|unpublish` — 초안 게시/내리기 (**사람만**, 토큰 불가)
- `GET /api/cards/{id}/revisions`, `.../{rev}`, `.../{rev}/restore` — 변경 이력·되돌리기

## 단위 검사

`unit` 은 글자표가 아니라 **실제 단위**로 읽힙니다. 카드 화면의 **검증** 버튼에서
봅니다.

가장 중요한 것은 **배율 어긋남**입니다. `F[N] / A[mm2]` 는 MPa 인데 단위를 Pa 라고
적어 두면 값이 100만 배 틀립니다. 차원은 맞아서 계산은 멀쩡히 돌고 숫자도
그럴듯해서, 아무 오류 없이 그대로 설계에 들어갑니다.

```
단위는 'Pa' 인데 수식이 내는 값은 그보다 1e+06 배입니다.
차원은 맞으니 계산은 돌지만 값이 그만큼 어긋납니다.
```

**확신이 없으면 아무 말도 하지 않습니다.** 틀린 경고는 없는 경고보다 나쁩니다 —
한 번 헛짚으면 사람은 그다음부터 전부 무시하고, 그러면 진짜 경고도 묻힙니다.
그래서 이런 경우는 조용히 넘어갑니다.

- 단위를 안 적은 변수 (빈 칸은 "무차원" 이 아니라 "안 적었다" 입니다)
- 못 읽는 단위 — 다만 오타일 수 있으니 그 사실만은 알려 줍니다
- 표 조회·조건부·보간에서 나온 값
- `F / A / 1000` 처럼 사람이 손으로 환산해 둔 수식 (차원 검사는 그대로 살아 있습니다)

적는 법: `mm` `mm2` `N/mm2` `kg*m/s2` `1/s` `deg` `%`. 무차원은 `-`.

### 넣을 때 단위를 고를 수 있습니다

변수가 `N` 으로 선언돼 있어도 값은 kN 으로 넣을 수 있습니다. 입력칸 옆의
단위를 고르면 계산에는 **선언 단위로 환산해서** 들어갑니다. 저장되는 값도,
계산 기록에 남는 값도 언제나 선언 단위입니다 — 고른 단위는 넣는 방식일 뿐입니다.

이것이 검증으로는 못 잡는 실수를 막습니다. 정의가 맞는지는 검증이 보지만,
**넣은 숫자가 어느 단위인지는 사람 머릿속에만** 있었습니다.

환산표는 서버가 변수와 함께 내려보냅니다(`unit_info`). 화면이 단위 문자열을
스스로 해석하면 단위 규칙이 두 벌이 되고, 두 벌은 반드시 어긋납니다 — 그
어긋남은 "화면에서는 환산했는데 검증은 다르게 보는" 형태라 원인을 찾기
어렵습니다. 화면이 하는 일은 배율 하나를 곱하는 것뿐입니다.

고를 것이 하나뿐이면(무차원, 단위 미기재) 예전처럼 글자로만 보입니다.

**아무것도 막지 않습니다.** 이미 있는 카드들이 단위를 글자표로만 써 왔고,
갑자기 게시가 막히면 쓰던 사람이 손을 놓기 때문입니다.

## 변경 이력

카드의 변수 정의가 바뀌면 그 시점의 정의가 통째로 남습니다. 카드 화면의
**변경 이력** 버튼에서 봅니다.

- 무엇이 바뀌었는지 목록에 바로 적힙니다 — `응력(sig) — 수식: F / A → F / A * 1.5`
- 이어진 수정은 한 줄로 묶입니다. 변수 저장은 변수 하나씩 나가므로, 설정 화면에서
  스무 개를 손보면 요청도 스무 번입니다. 그대로 쌓으면 읽을 수 없고, 읽을 수 없는
  이력은 없는 것과 같습니다
- **컨테이너를 옮기는 것은 이력이 되지 않습니다.** 어떤 요청이 정의를 바꾸는지
  목록으로 관리하지 않고, 앞 스냅샷과 비교해서 판단하기 때문입니다 — 목록은
  언젠가 빠뜨리고, 빠뜨린 자리는 아무 오류도 내지 않습니다
- 되돌리기는 **사람만** 할 수 있습니다(게시와 같은 이유). 되돌린 것도 이력에
  남으므로 다시 앞으로 돌아올 수 있습니다

이것이 "게시 후 AI 수정됨" 을 마무리합니다. 그 표시는 뭔가 바뀌었다고만 말했고,
그것을 본 사람이 할 수 있는 일은 수식을 눈으로 훑는 것뿐이었습니다.

## 계산 기록

계산은 브라우저에서 돌고 창을 닫으면 사라집니다. 그래서 "지난주 그 계산에 하중을
몇으로 넣었더라" 에 답할 수 없었습니다. 카드에서 계산한 뒤 **기록 저장** 을 누르면
입력값·결과와 함께 **그때의 변수 정의 전부**가 남습니다.

정의를 함께 남기는 것이 핵심입니다. 입력과 결과만 두면 카드 수식이 바뀐 뒤에도
기록은 예전 숫자를 들고 있는데 카드를 열면 다른 계산이 나옵니다. 그 어긋남은 아무
오류도 내지 않아서, 기록을 믿고 설계 판단을 한 뒤에야 드러납니다.

- 상단 **계산 기록** — 이름표·카드 이름으로 찾기, 내 기록만 보기
- 기록을 열면 **계산서 한 장**. 수식까지 실려 있어 검토하는 사람이 검증할 수 있고,
  인쇄하면 머리띠와 버튼이 빠져 그대로 설계 문서에 붙일 수 있습니다
- 카드를 지워도 기록은 남습니다

## MCP — 밖의 AI 가 카드를 만들게 하기 (선택)

Claude 같은 AI 가 계산 카드를 읽고 만들 수 있게 하는 통로입니다. 앱과 **별개의
프로세스·별개의 가상환경**으로 돕니다 — `mcp` 가 끌고 오는 starlette/pydantic 이
백엔드의 Flask 의존성과 부딪히기 때문입니다. 안 깔아도 앱은 그대로 돕니다.

**만능 토큰이 없습니다.** 들어온 `Authorization` 헤더를 그대로 백엔드에 넘기므로,
MCP 는 토큰 주인의 권한으로만 동작하고 만든 카드도 그 사람 것으로 남습니다.
토큰은 웹의 **토큰** 화면(`/tokens`)에서 각자 발급받습니다 — 원문은 그 자리에서
한 번만 보입니다.

**MCP 로 만든 카드는 초안입니다.** 만든 사람과 관리자에게만 보이고, 사람이
웹에서 열어 **게시하기** 를 눌러야 공개됩니다. 토큰으로는 게시할 수 없습니다 —
검증이 보는 것은 "계산이 도는가" 이지 "공학적으로 맞는가" 가 아니기 때문입니다.

카드에는 **누가 시작했고**(`origin`) **기계가 언제 손댔는지**(`ai_touched_at`)가
남습니다. 게시한 뒤에 AI 가 또 고치면 화면에 "게시 후 AI 수정됨" 이 뜹니다 —
게시한 사람이 확인한 것은 지금 내용과 다른 카드이기 때문입니다.

```powershell
# 개발 PC 에서 띄워 보기
cd mcp_server
py -3.13 -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
$env:MD_API_BASE = 'http://127.0.0.1:5176'
.\venv\Scripts\python.exe server.py     # http://127.0.0.1:3010/mcp
```

웹의 **토큰** 화면에서 토큰을 만들면 **주소와 토큰이 다 채워진 명령**이 함께
뜹니다. 그대로 복사해 실행하면 됩니다.

```bash
claude mcp add --transport http mechanicaldesign http://<서버>:3010/mcp --header "Authorization: Bearer mdt_..."
```

자세한 것은 [mcp_server/README.md](mcp_server/README.md), 서버 설치는
[배포방법.md](배포방법.md) 8장.

## License

Private.
