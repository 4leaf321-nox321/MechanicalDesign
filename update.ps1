# Mechanical Design - Update Production (Windows)
#
# 운영 서버에서 새 버전을 받아 적용하는 스크립트.
# git pull → pip 업데이트 → 마이그레이션 → 프론트 리빌드 → (선택) NSSM 서비스 재시작
#
# Usage:
#   .\update.ps1                          # 기본: 서비스 자동 재시작
#   .\update.ps1 -ServiceName "MyName"    # 다른 서비스 이름
#   .\update.ps1 -NoRestart               # 재시작 안 함 (수동 실행 중인 경우)

[CmdletBinding()]
param(
    [string]$ServiceName = "MechanicalDesign",
    [switch]$NoRestart
)

$ErrorActionPreference = "Stop"
$RepoRoot = $PSScriptRoot
$Backend  = Join-Path $RepoRoot "backend"
$Frontend = Join-Path $RepoRoot "frontend"

function Write-Step($msg) {
    Write-Host ""
    Write-Host "==== $msg ====" -ForegroundColor Cyan
}

# === 0. 사전 검증 ===
Write-Step "사전 검증"
if (-not (Test-Path (Join-Path $Backend "venv\Scripts\pip.exe"))) {
    throw "backend\venv가 없습니다. 먼저 .\setup.ps1 을 실행하세요."
}
if (-not (Test-Path (Join-Path $Backend ".env"))) {
    throw "backend\.env 파일이 없습니다."
}

# === 1. 코드 갱신 ===
Write-Step "git pull"
Push-Location $RepoRoot
try {
    git fetch --all
    if ($LASTEXITCODE -ne 0) { throw "git fetch 실패" }

    $before = git rev-parse HEAD
    git pull --ff-only
    if ($LASTEXITCODE -ne 0) { throw "git pull 실패 (충돌 또는 비-fast-forward)" }
    $after  = git rev-parse HEAD

    if ($before -eq $after) {
        Write-Host "변경사항 없음 (이미 최신)" -ForegroundColor Yellow
    } else {
        Write-Host "갱신: $before → $after"
    }
} finally {
    Pop-Location
}

# === 2. 백엔드 의존성 ===
Write-Step "pip install -r requirements.txt"
Push-Location $Backend
try {
    $pip = Join-Path $Backend "venv\Scripts\pip.exe"
    & $pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) { throw "pip install 실패" }
} finally {
    Pop-Location
}

# === 3. 마이그레이션 ===
Write-Step "flask db upgrade"
Push-Location $Backend
try {
    $flask = Join-Path $Backend "venv\Scripts\flask.exe"
    $env:FLASK_APP = "run.py"
    & $flask db upgrade
    if ($LASTEXITCODE -ne 0) { throw "flask db upgrade 실패" }
} finally {
    Pop-Location
}

# === 4. 프론트엔드 리빌드 ===
Write-Step "프론트엔드 리빌드"
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

# === 5. 서비스 재시작 ===
if (-not $NoRestart) {
    Write-Step "서비스 재시작: $ServiceName"
    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($null -eq $svc) {
        Write-Host "서비스 '$ServiceName'이(가) 등록되어 있지 않습니다. 재시작 건너뜀." -ForegroundColor Yellow
        Write-Host "수동 실행 중이라면 백엔드 프로세스를 직접 재시작하세요." -ForegroundColor Yellow
    } else {
        Restart-Service -Name $ServiceName -Force
        Start-Sleep -Seconds 2
        $svc = Get-Service -Name $ServiceName
        Write-Host "서비스 상태: $($svc.Status)"
        if ($svc.Status -ne "Running") {
            throw "서비스가 Running 상태가 아닙니다. 이벤트 뷰어 또는 NSSM 로그를 확인하세요."
        }
    }
} else {
    Write-Step "서비스 재시작 건너뜀 (-NoRestart)"
    Write-Host "필요하면 직접 재시작하세요."
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Update 완료" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
