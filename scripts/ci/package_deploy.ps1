Param(
    # 릴리스 태그(v0.2.0). 없으면 frontend/package.json 의 version 을 쓴다.
    [string]$Tag
)
<#
배포 패키지(deploy_package.zip)를 만든다.

담기는 것:
    backend\             코드 + migrations + requirements.txt
    backend\packages\    wheel 번들 — 서버는 --no-index 로 여기서만 설치한다
    backend\evaluator\   카드 검증의 시험 계산기 (node 가 있을 때만 도는 선택 기능)
    mcp_server\          밖의 AI 가 붙는 MCP 서버 (선택 기능, 별도 venv)
    frontend\dist\       빌드된 SPA. 백엔드가 같은 프로세스에서 서빙한다
    run_server.ps1       콘솔 기동
    run_mcp_server.ps1   MCP 콘솔 기동 (-Setup 이면 가상환경까지 — 관리자 불필요)
    install.ps1 / deploy.ps1 / rollback.ps1 / venv_sync.ps1 / precheck.ps1
    install-mcp.ps1      MCP 서버 설치 (선택)
    backup.ps1 / restore.ps1        백업과 **복원**. 복원은 기본이 리허설이다
    install-service.ps1
    배포방법.md          초기 배포·업데이트 절차
    BUILD_INFO.txt       wheel 을 만든 파이썬 마이너 버전과 패키지 버전

**서버에 git 은 필요 없다.** 프론트는 여기서 빌드해 dist 를 넣고,
의존성은 wheel 로 동봉한다. 전 방식(서버에서 git pull → npm ci → npm run build)
은 서버에 Node·git·인터넷을 모두 요구했고, 빌드가 서버에서 깨지면 그 자리에서
서비스가 멈춘 채 복구할 방법이 없었다.

Node 는 선택이다. 앱 구동에는 안 쓰고, 카드 정의 검증의 시험 계산에만 쓴다
(backend\evaluator). 없으면 검증이 정적 검사까지만 도는데, 그 사실이 응답의
trial_skipped 에 드러난다 — 안 돌았는데 통과로 보이지는 않는다.

배포 스크립트를 패키지에 함께 넣는 이유: 서버가 릴리스만 받는 환경이어도
zip 하나를 손으로 펼쳐 스크립트를 꺼내면 그다음부터는 그 스크립트가 배포를
처리할 수 있다. 없으면 첫 배포에 저장소를 클론하는 수밖에 없다.
#>

Set-StrictMode -Version Latest

# ErrorActionPreference 를 'Stop' 으로 두지 않는다. Windows PowerShell 5.1 은
# 네이티브 명령이 stderr 에 쓰기만 해도 그것을 오류 레코드로 감싸는데, Stop 이면
# npm·pip 의 경고 한 줄에도 패키징이 멈춘다. 대신 native 호출마다
# $LASTEXITCODE 를 직접 확인한다 — 아래 모든 호출이 그렇게 돼 있다.

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location (Join-Path $root '..\..')

Write-Host '배포 패키지 생성 (Windows)'

Remove-Item -Recurse -Force -ErrorAction SilentlyContinue .\deploy
New-Item -ItemType Directory -Path .\deploy | Out-Null

# --- 백엔드 -------------------------------------------------------------------
Write-Host '백엔드 코드 복사'
Copy-Item -Recurse -Force .\backend .\deploy\backend
# 개발 산출물과 운영 데이터는 패키지에서 뺀다. 업로드·로그는 서버의
# <AppPath>_data 에 있으므로 애초에 교체 대상이 아니다.
# tests 도 뺀다 — 서버에는 pytest 가 없어 돌지 않고, 배포물은 운영에서
# 실제로 실행되는 것만 담는 편이 무엇이 도는지 헷갈리지 않는다.
foreach ($junk in @('venv', '.venv', '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache',
                    'uploads', 'logs', '.env', 'tests', 'NVIDIA Corporation')) {
    Get-ChildItem -Path .\deploy\backend -Filter $junk -Recurse -Force -ErrorAction SilentlyContinue |
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
}
# 개발 PC 에 남은 서비스 로그가 딸려 가지 않게 한다.
Get-ChildItem -Path .\deploy\backend -Filter 'service-*.log' -Force -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

# seed_install.py 가 빠지면 설치가 관리자 계정을 못 만들고, 그러면 로그인할
# 방법이 없는 서버가 배포된다.
foreach ($needed in @('run.py', 'requirements.txt', 'migrations\alembic.ini',
                      'migrations\env.py', 'scripts\seed_install.py')) {
    if (-not (Test-Path (Join-Path '.\deploy\backend' $needed))) {
        Write-Error "패키지에 backend\$needed 가 없습니다."
        exit 1
    }
}
# **requirements.txt 는 ASCII 여야 한다.**
#
# pip 은 BOM 이 없는 requirements.txt 를 **로케일 코덱**으로 읽는다. 한국어
# 윈도우 서버에서는 그게 cp949 라, 한글 주석 한 줄이 들어가는 순간 서버의
# `pip install -r` 이 UnicodeDecodeError 로 죽는다(실측). 주석을 쓴 개발 PC
# 에서는 재현되지 않고 **배포 대상에서만** 터지므로 여기서 막는다.
$reqBytes = [System.IO.File]::ReadAllBytes('.\deploy\backend\requirements.txt')
if ($reqBytes | Where-Object { $_ -gt 127 }) {
    Write-Error 'requirements.txt 에 ASCII 가 아닌 문자가 있습니다. 주석에서 한글을 빼세요 — 서버 pip 이 cp949 로 읽다가 죽습니다.'
    exit 1
}

$revisions = Get-ChildItem .\deploy\backend\migrations\versions -Filter '*.py' -ErrorAction SilentlyContinue
if (-not $revisions) {
    Write-Error 'migrations\versions 가 비어 있습니다. 마이그레이션이 패키지에 담기지 않았습니다.'
    exit 1
}
Write-Host "  마이그레이션 리비전 $($revisions.Count) 개"

# --- 프론트엔드 ---------------------------------------------------------------
# 백엔드가 <패키지 루트>\frontend\dist 에서 SPA 를 서빙한다(app\__init__.py 의
# FRONTEND_DIST_PATH). 이게 없으면 배포된 앱이 모든 페이지에 JSON 404 를 돌려준다.
Write-Host '프론트엔드 빌드'
Push-Location .\frontend
$env:NODE_OPTIONS = '--max-old-space-size=4096'
# VITE_API_URL 을 굽지 않는다. 값이 비면 코드가 상대경로 '/api' 를 쓰고, 그래야
# 어느 서버 주소로 접속해도 같은 오리진의 API 를 부른다.
Remove-Item Env:\VITE_API_URL -ErrorAction SilentlyContinue
if (Test-Path 'package-lock.json') { npm ci } else { npm install }
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Error "npm 의존성 설치 실패 (exit $LASTEXITCODE)"; exit 1 }
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Error "npm run build 실패 (exit $LASTEXITCODE)"; exit 1 }
Pop-Location

if (-not (Test-Path .\frontend\dist\index.html)) {
    Write-Error '프론트엔드 빌드에 dist\index.html 이 없습니다.'
    exit 1
}

# 번들에 개발용 주소가 구워졌는지 본다. 구워지면 사용자 브라우저가 **자기 PC의**
# 5176 을 부르게 되고, 화면은 뜨는데 데이터만 안 나오는 형태로 실패한다.
$leaked = Get-ChildItem .\frontend\dist\assets -Filter '*.js' -ErrorAction SilentlyContinue |
    Where-Object {
        (Select-String -Path $_.FullName -Pattern 'localhost:5176' -Quiet -SimpleMatch) -or
        (Select-String -Path $_.FullName -Pattern '127.0.0.1:5176' -Quiet -SimpleMatch)
    }
if ($leaked) {
    Write-Error "번들에 개발 API 주소가 남아 있습니다 ($($leaked[0].Name)). VITE_API_URL 을 비우고 다시 빌드하세요."
    exit 1
}
Write-Host '프론트엔드 API 주소 검사 통과'

New-Item -ItemType Directory -Force -Path .\deploy\frontend | Out-Null
Copy-Item -Recurse -Force .\frontend\dist .\deploy\frontend\dist

# --- 계산기(검증용) -----------------------------------------------------------
# 서버가 카드 정의를 검증할 때 실제로 계산을 한 번 돌려 본다
# (backend\evaluator\run.mjs). 그때 쓰는 계산기는 **프론트가 쓰는 바로 그
# 파일**이다 — 파이썬으로 옮겨 적은 사본이 아니다. 두 벌이 되면 어긋나고,
# 그 어긋남은 "화면에서는 맞는데 검증은 실패하는" 형태라 원인을 찾기 어렵다.
#
# dist 는 번들이라 서버가 모듈로 불러올 수 없다. 원본 소스를 따로 담는다.
Write-Host '계산기 스크립트 복사'
$libDir = '.\deploy\backend\evaluator\lib'
New-Item -ItemType Directory -Force -Path $libDir | Out-Null
foreach ($calc in @('calcEngine.js', 'evaluators.js', 'tableLookup.js')) {
    Copy-Item -Force (Join-Path '.\frontend\src\shared\utils' $calc) $libDir
}

# **복사한 것이 진짜 도는지 여기서 돌려 본다.**
#
# 위의 목록은 손으로 적은 것이라, 누군가 evaluators.js 에 import 를 하나 더
# 추가하면 조용히 빠진다. 그러면 배포는 성공하고 서버에서 검증만 안 도는데,
# 원인은 배포 몇 번 뒤에야 드러난다. run.mjs 를 그대로 불러 계산까지 확인하면
# 이유가 무엇이든 여기서 걸린다.
#
# 배포 폴더에서 돌리는 것이 중요하다 — run.mjs 는 lib 가 없으면 저장소의 프론트
# 원본으로 되돌아가는데, 배포 폴더에는 그 경로가 없어서 사본이 빠지면 그대로 실패한다.
$probe = '{"variables":[{"id":1,"symbol":"A","name":"A","category":"input","var_type":"text"},{"id":2,"symbol":"R","name":"R","category":"output","var_type":"formula","formula":"sqrt(A) * 2"}],"values":{"1":9}}'
$probeOut = $probe | node .\deploy\backend\evaluator\run.mjs
if ($LASTEXITCODE -ne 0 -or $probeOut -notmatch '"value":6') {
    Write-Error "계산기 시험 실행이 실패했습니다. evaluator\lib 에 필요한 파일이 빠졌는지 보세요. 응답: $probeOut"
    exit 1
}
Write-Host '  계산기 시험 실행 통과 (sqrt(9)*2 = 6)'

# --- MCP 서버 (선택 기능) -------------------------------------------------------
# 밖의 AI 가 계산 카드를 읽고 만들게 하는 통로. 앱과 **별개의 프로세스·가상환경**
# 으로 돈다 — mcp 가 끌고 오는 starlette/pydantic 이 백엔드의 Flask 의존성과
# 부딪히기 때문이다.
#
# 코드만 담고 wheel 은 담지 않는다. 선택 기능이라 안 쓰는 서버까지 패키지가
# 무거워질 이유가 없고, 서버에서 install-mcp.ps1 이 PyPI 에서 받는다. 폐쇄망이면
# 그 스크립트의 -PackagesDir 로 미리 받아 둔 wheel 을 쓴다.
Write-Host 'MCP 서버 복사'
Copy-Item -Recurse -Force .\mcp_server .\deploy\mcp_server
foreach ($junk in @('venv', '.venv', '__pycache__', '.pytest_cache', 'tests')) {
    Get-ChildItem -Path .\deploy\mcp_server -Filter $junk -Recurse -Force -ErrorAction SilentlyContinue |
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
}
# 안내 본문이 빠지면 get_guide 가 빈 손으로 답하고, AI 는 짐작으로 카드를 만든다.
foreach ($needed in @('server.py', 'requirements.txt', 'guide\GUIDE.md')) {
    if (-not (Test-Path (Join-Path '.\deploy\mcp_server' $needed))) {
        Write-Error "패키지에 mcp_server\$needed 가 없습니다."
        exit 1
    }
}

# --- wheel 번들 ---------------------------------------------------------------
# 패키지에 설치하는 대신 wheel 을 모아 담는다. 서버가 `pip install --no-index
# --find-links=packages` 로 진짜 가상환경을 만드므로 배포가 네트워크를 쓰지 않는다.
# 사내망에서 pip 이 중간에 끊기는 것을 배포 경로에 끼워 넣지 않기 위해서다.
python -m pip install --upgrade pip

$wheelDir = '.\deploy\backend\packages'
Write-Host 'wheel 번들 생성'
python -m pip wheel -r .\deploy\backend\requirements.txt -w $wheelDir
if ($LASTEXITCODE -ne 0) { Write-Error "pip wheel 실패 (exit $LASTEXITCODE)"; exit 1 }

$wheels = Get-ChildItem -Path $wheelDir -Filter '*.whl' -ErrorAction SilentlyContinue
# 가상환경을 만들 수 없는 번들을 출하하느니 빌드를 실패시킨다.
foreach ($mod in @('flask', 'flask_sqlalchemy', 'flask_migrate', 'flask_cors',
                   'sqlalchemy', 'psycopg', 'waitress', 'python_dotenv',
                   'pyjwt', 'bcrypt')) {
    $needle = ($mod -replace '_', '-')
    if (-not ($wheels | Where-Object { ($_.Name -replace '_', '-') -like "$needle-*" })) {
        Write-Error "packages 에 '$mod' wheel 이 없습니다."
        exit 1
    }
}
# psycopg[binary] 의 바이너리 부분이 빠지면 서버에서 libpq 를 찾지 못해 기동이
# 실패한다. 이름이 psycopg 로 시작해 위 목록 검사만으로는 구분되지 않는다.
if (-not ($wheels | Where-Object { ($_.Name -replace '_', '-') -like 'psycopg-binary-*' })) {
    Write-Error "packages 에 'psycopg-binary' wheel 이 없습니다. windows 러너에서 빌드하고 있는지 확인하세요."
    exit 1
}
Write-Host "  wheel $($wheels.Count) 개, 의존성 검사 통과"

# --- 스크립트와 빌드 정보 ------------------------------------------------------
Write-Host '실행·배포 스크립트 추가'
Copy-Item -Force .\scripts\ci\run_server_template.ps1     .\deploy\run_server.ps1
Copy-Item -Force .\scripts\ci\run_mcp_server_template.ps1 .\deploy\run_mcp_server.ps1
Copy-Item -Force .\scripts\deploy\venv_sync.ps1       .\deploy\venv_sync.ps1
Copy-Item -Force .\scripts\deploy\deploy.ps1          .\deploy\deploy.ps1
Copy-Item -Force .\scripts\deploy\rollback.ps1        .\deploy\rollback.ps1
Copy-Item -Force .\scripts\deploy\install.ps1         .\deploy\install.ps1
Copy-Item -Force .\scripts\deploy\precheck.ps1        .\deploy\precheck.ps1
Copy-Item -Force .\scripts\deploy\backup.ps1          .\deploy\backup.ps1
Copy-Item -Force .\scripts\deploy\restore.ps1         .\deploy\restore.ps1
Copy-Item -Force .\scripts\deploy\install-service.ps1 .\deploy\install-service.ps1
Copy-Item -Force .\scripts\deploy\install-mcp.ps1     .\deploy\install-mcp.ps1

# 배포 문서도 함께 넣는다. 폐쇄망 서버는 zip 하나만 받으므로, 문서가 저장소에만
# 있으면 **정작 설치하는 자리에서 볼 수 없다.**
Copy-Item -Force .\배포방법.md .\deploy\배포방법.md

# 바이너리 wheel 은 ABI 태그(cp313 등)를 달고 있어 다른 마이너 버전에는 설치되지
# 않는다. deploy.ps1 이 이 값을 서버 파이썬과 비교한다.
$buildPython = & python -c "import sys; print('{}.{}'.format(sys.version_info[0], sys.version_info[1]))"
if ($LASTEXITCODE -ne 0) { Write-Error '빌드 파이썬 버전을 확인하지 못했습니다'; exit 1 }
Write-Host "빌드 파이썬 기록: $buildPython"

# **패키지가 자기 버전을 들고 있어야 한다.** 배포한 뒤 "서버에 뭐가 깔렸나" 를
# 물으면 답할 데가 있어야 한다. git pull 방식에서는 커밋 해시를 서버에서 직접
# 조회해야 알 수 있었고, git 이 없는 서버에서는 알 방법이 아예 없었다.
if (-not $Tag) {
    $Tag = 'v' + (node -p "require('./frontend/package.json').version")
    if ($LASTEXITCODE -ne 0) { Write-Error '버전을 읽지 못했습니다'; exit 1 }
}
Write-Host "패키지 버전: $Tag"
Set-Content -Encoding utf8 -Path .\deploy\BUILD_INFO.txt -Value @(
    "python=$buildPython"
    "version=$Tag"
)

# --- zip ---------------------------------------------------------------------
Write-Host 'zip 생성'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$deployDir = (Resolve-Path .\deploy).Path
$zipPath = Join-Path $deployDir 'deploy_package.zip'
# 압축 대상 폴더 안에 직접 만들면 아카이브가 자기 자신을 담으려다 실패한다.
$stagingZip = Join-Path ([System.IO.Path]::GetDirectoryName($deployDir)) 'deploy_package.zip'
Remove-Item -Force -ErrorAction SilentlyContinue $stagingZip
[System.IO.Compression.ZipFile]::CreateFromDirectory($deployDir, $stagingZip)
Move-Item -Force $stagingZip $zipPath

if (Test-Path $zipPath) {
    $sizeMb = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
    Write-Host "패키지 완료: $zipPath (${sizeMb}MB)"
} else {
    Write-Error "패키지 생성 실패: $zipPath"
    exit 1
}
Pop-Location
