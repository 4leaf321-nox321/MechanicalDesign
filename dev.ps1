# Mechanical Design - Dev Mode Launcher (Windows)
#
# 두 개의 PowerShell 창을 띄워 백엔드 + Vite dev server를 동시에 실행합니다.
# 브라우저는 http://localhost:5173 으로 접속하세요 (Vite proxy가 /api/* 를 5174로 포워딩).
#
# Usage:
#   .\dev.ps1                # 백엔드 + 프론트 dev server 실행
#   .\dev.ps1 -OpenBrowser   # 추가로 브라우저 자동 열기
#   .\dev.ps1 -StopService   # 운영 서비스가 켜져 있으면 자동 중지
#   .\dev.ps1 -BackendOnly   # 백엔드만
#   .\dev.ps1 -FrontendOnly  # 프론트 dev server만

[CmdletBinding()]
param(
    [switch]$OpenBrowser,
    [switch]$StopService,
    [switch]$BackendOnly,
    [switch]$FrontendOnly,
    [string]$ServiceName = "MechanicalDesign"
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

if (-not $FrontendOnly) {
    if (-not (Test-Path (Join-Path $Backend "venv\Scripts\python.exe"))) {
        throw "backend\venv 가 없습니다. 먼저 .\setup.ps1 을 실행하세요."
    }
    if (-not (Test-Path (Join-Path $Backend ".env"))) {
        throw "backend\.env 가 없습니다. 'copy backend\.env.example backend\.env' 후 값을 채우세요."
    }

    # FLASK_ENV 가 development 인지 확인 (production 이면 경고)
    $envLine = Get-Content (Join-Path $Backend ".env") | Where-Object { $_ -match "^\s*FLASK_ENV\s*=" } | Select-Object -First 1
    if ($envLine -and (($envLine -split "=", 2)[1].Trim() -ne "development")) {
        Write-Host "[경고] backend\.env 의 FLASK_ENV 가 'development' 가 아닙니다." -ForegroundColor Yellow
        Write-Host "       Waitress(운영용)로 기동되어 자동 reload·디버그 traceback이 비활성화됩니다." -ForegroundColor Yellow
    }
}

if (-not $BackendOnly) {
    if (-not (Test-Path (Join-Path $Frontend "node_modules"))) {
        Write-Host "frontend\node_modules 가 없습니다. npm install 을 먼저 실행합니다..." -ForegroundColor Yellow
        Push-Location $Frontend
        try {
            if (Test-Path "package-lock.json") { npm ci } else { npm install }
            if ($LASTEXITCODE -ne 0) { throw "npm install 실패" }
        } finally { Pop-Location }
    }
}

# === 1. 운영 서비스 충돌 체크 ===
if (-not $FrontendOnly) {
    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($null -ne $svc -and $svc.Status -eq "Running") {
        if ($StopService) {
            Write-Step "운영 서비스 '$ServiceName' 중지 (-StopService)"
            Stop-Service -Name $ServiceName -Force
            Write-Host "중지 완료. 개발 종료 후에는 Start-Service $ServiceName 로 다시 켜세요." -ForegroundColor Yellow
        } else {
            Write-Host ""
            Write-Host "[경고] Windows 서비스 '$ServiceName' 가 Running 상태입니다." -ForegroundColor Red
            Write-Host "       포트 5174 가 점유되어 백엔드 dev 기동이 실패합니다." -ForegroundColor Red
            Write-Host "       해결:" -ForegroundColor Yellow
            Write-Host "         Stop-Service $ServiceName" -ForegroundColor Yellow
            Write-Host "       또는 이 스크립트를 -StopService 옵션으로 재실행." -ForegroundColor Yellow
            throw "서비스 충돌 — 중단합니다."
        }
    }
}

# === 2. 백엔드 창 띄우기 ===
if (-not $FrontendOnly) {
    Write-Step "백엔드 창 띄우기 (포트 5174)"
    $backendCmd = @"
`$Host.UI.RawUI.WindowTitle = 'MechD Backend (5174)'
Set-Location '$Backend'
& '$Backend\venv\Scripts\Activate.ps1'
Write-Host '--- Backend (Flask dev server) ---' -ForegroundColor Cyan
Write-Host '종료: Ctrl+C, 코드 변경 시 수동 재시작 필요' -ForegroundColor Yellow
Write-Host ''
python run.py
Write-Host ''
Write-Host '백엔드 종료됨. 창을 닫으려면 아무 키나 누르세요.' -ForegroundColor Yellow
[void][System.Console]::ReadKey(`$true)
"@
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd
    Write-Host "  → 새 창에서 백엔드 기동 중"
}

# === 3. 프론트 dev server 창 띄우기 ===
if (-not $BackendOnly) {
    Write-Step "프론트엔드 dev server 창 띄우기 (포트 5173)"
    $frontendCmd = @"
`$Host.UI.RawUI.WindowTitle = 'MechD Frontend (5173, Vite)'
Set-Location '$Frontend'
Write-Host '--- Vite Dev Server (HMR) ---' -ForegroundColor Cyan
Write-Host '종료: Ctrl+C, /api/* 는 자동으로 5174 로 프록시됨' -ForegroundColor Yellow
Write-Host ''
npm run dev
Write-Host ''
Write-Host '프론트 dev server 종료됨. 창을 닫으려면 아무 키나 누르세요.' -ForegroundColor Yellow
[void][System.Console]::ReadKey(`$true)
"@
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd
    Write-Host "  → 새 창에서 Vite dev server 기동 중"
}

# === 4. 브라우저 열기 (선택) ===
if ($OpenBrowser -and -not $BackendOnly) {
    Write-Step "브라우저 열기"
    Start-Sleep -Seconds 3   # Vite dev server 부팅 대기
    Start-Process "http://localhost:5173"
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Dev 모드 실행됨" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "접속:" -ForegroundColor Yellow
Write-Host "  http://localhost:5173    ← 여기로 (Vite, HMR 동작)"
Write-Host "  http://localhost:5174    ← 백엔드 직접 접근용 (dist 비어있을 수 있음)"
Write-Host ""
Write-Host "팁:" -ForegroundColor Yellow
Write-Host "  - .jsx/.css 변경 → 즉시 HMR 반영"
Write-Host "  - .py 변경 → 백엔드 창에서 Ctrl+C 후 python run.py 재실행"
Write-Host "  - 종료: 각 창에서 Ctrl+C → 창 닫기"
Write-Host ""
