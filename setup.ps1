# Mechanical Design - First-time Setup (Windows)
#
# Usage:
#   .\setup.ps1
#
# 사전 조건:
#   - Python 3.11+ (PATH 등록)
#   - Node.js 18+ (PATH 등록)
#   - PostgreSQL 16+ (psql이 PATH에 있거나 -PgBinDir 인자로 경로 지정)
#   - backend\.env 파일 작성 완료 (없으면 .env.example 복사 후 편집)

[CmdletBinding()]
param(
    [string]$PgBinDir = "",
    [switch]$SkipDbCreate
)

$ErrorActionPreference = "Stop"
$RepoRoot = $PSScriptRoot
$Backend  = Join-Path $RepoRoot "backend"
$Frontend = Join-Path $RepoRoot "frontend"

function Write-Step($msg) {
    Write-Host ""
    Write-Host "==== $msg ====" -ForegroundColor Cyan
}

function Require-Command($name) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "필수 명령어 '$name'을 찾을 수 없습니다. 설치 후 PATH에 추가하세요."
    }
}

# psql을 PATH에서 못 찾으면 -PgBinDir 인자나 표준 경로 시도
function Resolve-Psql {
    if ($PgBinDir -and (Test-Path (Join-Path $PgBinDir "psql.exe"))) {
        return (Join-Path $PgBinDir "psql.exe")
    }
    if (Get-Command psql -ErrorAction SilentlyContinue) {
        return "psql"
    }
    $candidates = @(
        "C:\Program Files\PostgreSQL\17\bin\psql.exe",
        "C:\Program Files\PostgreSQL\16\bin\psql.exe",
        "C:\Program Files\PostgreSQL\15\bin\psql.exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { return $c }
    }
    throw "psql.exe를 찾을 수 없습니다. -PgBinDir 인자로 경로를 지정하거나 PATH에 추가하세요."
}

# === 0. 사전 검증 ===
Write-Step "사전 검증"
Require-Command python
Require-Command node
Require-Command npm

if (-not (Test-Path (Join-Path $Backend ".env"))) {
    throw "backend\.env 파일이 없습니다. 'copy backend\.env.example backend\.env' 후 값을 채우고 다시 실행하세요."
}

# === 1. PostgreSQL 데이터베이스 생성 ===
if (-not $SkipDbCreate) {
    Write-Step "PostgreSQL 데이터베이스 확인/생성"
    $psql = Resolve-Psql
    Write-Host "psql 경로: $psql"

    # DB 이름은 backend\.env의 DATABASE_URL에서 마지막 / 뒤 추출
    $envFile = Get-Content (Join-Path $Backend ".env")
    $dbUrlLine = $envFile | Where-Object { $_ -match "^\s*DATABASE_URL\s*=" } | Select-Object -First 1
    if (-not $dbUrlLine) {
        throw "backend\.env에 DATABASE_URL 항목이 없습니다."
    }
    $dbUrl = ($dbUrlLine -split "=", 2)[1].Trim()
    $dbName = ($dbUrl -split "/")[-1] -replace "\?.*$", ""

    Write-Host "대상 DB: $dbName"
    Write-Host "PostgreSQL 관리자(postgres) 비밀번호를 입력하라는 메시지가 뜨면 입력하세요."

    # 존재 확인 (없으면 생성)
    $exists = & $psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$dbName';"
    if ($exists -ne "1") {
        Write-Host "데이터베이스 '$dbName'을 생성합니다."
        & $psql -U postgres -c "CREATE DATABASE $dbName;"
        if ($LASTEXITCODE -ne 0) { throw "CREATE DATABASE 실패" }
    } else {
        Write-Host "데이터베이스 '$dbName'이(가) 이미 존재합니다. 건너뜁니다."
    }
} else {
    Write-Step "DB 생성 단계 건너뜀 (-SkipDbCreate)"
}

# === 2. 백엔드: venv + 의존성 ===
Write-Step "백엔드 venv 및 의존성 설치"
Push-Location $Backend
try {
    if (-not (Test-Path "venv")) {
        python -m venv venv
        if ($LASTEXITCODE -ne 0) { throw "venv 생성 실패" }
    } else {
        Write-Host "venv 이미 존재 → 재사용"
    }

    $pip = Join-Path $Backend "venv\Scripts\pip.exe"
    & $pip install --upgrade pip
    & $pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) { throw "pip install 실패" }
} finally {
    Pop-Location
}

# === 3. 백엔드: 마이그레이션 ===
Write-Step "DB 스키마 마이그레이션 (flask db upgrade)"
Push-Location $Backend
try {
    $flask = Join-Path $Backend "venv\Scripts\flask.exe"
    $env:FLASK_APP = "run.py"
    & $flask db upgrade
    if ($LASTEXITCODE -ne 0) { throw "flask db upgrade 실패" }
} finally {
    Pop-Location
}

# === 4. 프론트엔드: 의존성 + 빌드 ===
Write-Step "프론트엔드 의존성 설치 및 빌드"
Push-Location $Frontend
try {
    if (Test-Path "package-lock.json") {
        npm ci
    } else {
        npm install
    }
    if ($LASTEXITCODE -ne 0) { throw "npm install 실패" }

    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build 실패" }
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Setup 완료" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "실행:" -ForegroundColor Yellow
Write-Host "  cd backend"
Write-Host "  venv\Scripts\Activate.ps1"
Write-Host "  python run.py"
Write-Host ""
Write-Host "서비스로 등록하려면:" -ForegroundColor Yellow
Write-Host "  .\install-service.ps1"
Write-Host ""
