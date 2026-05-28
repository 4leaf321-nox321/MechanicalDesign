# Mechanical Design - Install as Windows Service (NSSM)
#
# NSSM(Non-Sucking Service Manager)을 이용해 백엔드를 Windows 서비스로 등록합니다.
# 부팅 시 자동 시작, 크래시 시 자동 재시작이 설정됩니다.
#
# 실행 전 setup.ps1 이 성공적으로 완료되어 있어야 합니다.
#
# Usage:
#   관리자 권한 PowerShell에서:
#   .\install-service.ps1
#   .\install-service.ps1 -ServiceName "MyName"
#   .\install-service.ps1 -Uninstall              # 제거

[CmdletBinding()]
param(
    [string]$ServiceName = "MechanicalDesign",
    [string]$NssmPath = "",
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"
$RepoRoot = $PSScriptRoot
$Backend  = Join-Path $RepoRoot "backend"

function Write-Step($msg) {
    Write-Host ""
    Write-Host "==== $msg ====" -ForegroundColor Cyan
}

# 관리자 권한 확인
function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p  = New-Object Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
}

if (-not (Test-Admin)) {
    throw "이 스크립트는 관리자 권한 PowerShell에서 실행해야 합니다."
}

# nssm 경로 찾기
function Resolve-Nssm {
    if ($NssmPath -and (Test-Path $NssmPath)) {
        return $NssmPath
    }
    if (Get-Command nssm -ErrorAction SilentlyContinue) {
        return (Get-Command nssm).Source
    }
    $localNssm = Join-Path $RepoRoot "nssm.exe"
    if (Test-Path $localNssm) {
        return $localNssm
    }
    return $null
}

# nssm 자동 다운로드
function Install-Nssm {
    Write-Step "NSSM 다운로드"
    $url = "https://nssm.cc/release/nssm-2.24.zip"
    $tmpZip = Join-Path $env:TEMP "nssm-2.24.zip"
    $tmpDir = Join-Path $env:TEMP "nssm-2.24"

    Invoke-WebRequest -Uri $url -OutFile $tmpZip -UseBasicParsing
    if (Test-Path $tmpDir) { Remove-Item $tmpDir -Recurse -Force }
    Expand-Archive -Path $tmpZip -DestinationPath $env:TEMP -Force

    # 64-bit nssm.exe 위치
    $src = Join-Path $env:TEMP "nssm-2.24\win64\nssm.exe"
    if (-not (Test-Path $src)) {
        throw "NSSM 다운로드 후 nssm.exe를 찾지 못했습니다: $src"
    }
    $dst = Join-Path $RepoRoot "nssm.exe"
    Copy-Item $src $dst -Force
    Write-Host "NSSM 설치 완료: $dst"
    return $dst
}

# === 메인 로직 ===
$nssm = Resolve-Nssm
if (-not $nssm) {
    $nssm = Install-Nssm
}
Write-Host "nssm: $nssm"

if ($Uninstall) {
    Write-Step "서비스 제거: $ServiceName"
    & $nssm stop $ServiceName confirm
    & $nssm remove $ServiceName confirm
    Write-Host "제거 완료" -ForegroundColor Green
    return
}

# 사전 검증
if (-not (Test-Path (Join-Path $Backend "venv\Scripts\python.exe"))) {
    throw "backend\venv\Scripts\python.exe가 없습니다. 먼저 .\setup.ps1 을 실행하세요."
}
if (-not (Test-Path (Join-Path $Backend ".env"))) {
    throw "backend\.env가 없습니다."
}

# 이미 등록되어 있으면 제거 후 재등록
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($null -ne $existing) {
    Write-Step "기존 서비스 발견 → 제거 후 재등록"
    & $nssm stop $ServiceName confirm 2>$null
    & $nssm remove $ServiceName confirm
}

Write-Step "서비스 등록: $ServiceName"
$pythonExe = Join-Path $Backend "venv\Scripts\python.exe"
$runScript = Join-Path $Backend "run.py"

& $nssm install $ServiceName $pythonExe $runScript
if ($LASTEXITCODE -ne 0) { throw "nssm install 실패" }

& $nssm set $ServiceName AppDirectory $Backend
& $nssm set $ServiceName DisplayName "Mechanical Design Server"
& $nssm set $ServiceName Description "Flask + Waitress backend serving the Mechanical Design web app"
& $nssm set $ServiceName Start SERVICE_AUTO_START
& $nssm set $ServiceName AppStdout (Join-Path $Backend "service-stdout.log")
& $nssm set $ServiceName AppStderr (Join-Path $Backend "service-stderr.log")
& $nssm set $ServiceName AppRotateFiles 1
& $nssm set $ServiceName AppRotateBytes 10485760    # 10 MB 마다 회전

Write-Step "서비스 시작"
& $nssm start $ServiceName
Start-Sleep -Seconds 2

$svc = Get-Service -Name $ServiceName
Write-Host "서비스 상태: $($svc.Status)"

if ($svc.Status -ne "Running") {
    Write-Host "서비스가 Running 상태가 아닙니다." -ForegroundColor Red
    Write-Host "로그 확인:" -ForegroundColor Yellow
    Write-Host "  $Backend\service-stderr.log"
    throw "서비스 시작 실패"
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  서비스 등록 완료" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "관리 명령:" -ForegroundColor Yellow
Write-Host "  Start-Service   $ServiceName"
Write-Host "  Stop-Service    $ServiceName"
Write-Host "  Restart-Service $ServiceName"
Write-Host "  Get-Service     $ServiceName"
Write-Host ""
Write-Host "제거:" -ForegroundColor Yellow
Write-Host "  .\install-service.ps1 -Uninstall"
Write-Host ""
Write-Host "로그:" -ForegroundColor Yellow
Write-Host "  $Backend\service-stdout.log"
Write-Host "  $Backend\service-stderr.log"
