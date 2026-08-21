<#
백엔드를 Windows 서비스로 등록한다 (NSSM).

부팅 시 자동 시작, 크래시 시 자동 재시작이 설정된다.

**가리키는 것이 배포마다 바뀌지 않아야 한다.** 그래서 실행 파일은 앱 폴더
바깥의 가상환경을 쓴다:

    실행     <AppPath>_venvs\backend\Scripts\python.exe  <AppPath>\backend\run.py
    작업폴더 <AppPath>\backend        (run.py 가 여기서 .env 를 읽는다)
    로그     <AppPath>_data\logs\     (앱 폴더 교체와 무관하게 남는다)

전 방식은 저장소 안의 backend\venv 를 가리켰다. 배포가 앱 폴더를 통째로
교체하는 순간 서비스가 가리키던 python.exe 가 사라져 재등록이 필요했고,
로그도 교체 대상 폴더 안에 있어 배포할 때마다 지워졌다.

사용 (관리자 PowerShell):
  .\install-service.ps1 -AppPath 'C:\Server\MechanicalDesign'
  .\install-service.ps1 -AppPath 'C:\Server\MechanicalDesign' -ServiceName 'MyName'
  .\install-service.ps1 -AppPath 'C:\Server\MechanicalDesign' -Uninstall
#>

param(
    [Parameter(Mandatory = $true)][string]$AppPath,
    [string]$ServiceName = 'MechanicalDesign',
    [string]$NssmPath,
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

function Assert-NotFlag([string]$value, [string]$name) {
    if ($value -and $value.StartsWith('-')) {
        throw "-$name 값이 '$value' 입니다 — PowerShell 매개변수는 대시가 하나입니다: -$name '<값>'"
    }
}
Assert-NotFlag $AppPath 'AppPath'
Assert-NotFlag $NssmPath 'NssmPath'
function Write-Log([string]$m) { Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $m" }

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
}
if (-not (Test-Admin)) {
    throw '이 스크립트는 관리자 권한 PowerShell 에서 실행해야 합니다.'
}

$dataPath = $AppPath + '_data'
$logDir = Join-Path $dataPath 'logs'
$backend = Join-Path $AppPath 'backend'
$venvPython = Join-Path ($AppPath + '_venvs') 'backend\Scripts\python.exe'
$runScript = Join-Path $backend 'run.py'

# --- nssm 확보 ----------------------------------------------------------------
# nssm.exe 는 앱 폴더 **바깥**(<AppPath>_data)에 둔다. 앱 폴더 안에 두면 배포가
# 지워 버려 다음 서비스 작업 때마다 다시 받아야 한다.
function Resolve-Nssm {
    if ($NssmPath -and (Test-Path $NssmPath)) { return $NssmPath }
    $local = Join-Path $dataPath 'nssm.exe'
    if (Test-Path $local) { return $local }
    if (Get-Command nssm -ErrorAction SilentlyContinue) { return (Get-Command nssm).Source }
    return $null
}

function Install-Nssm {
    Write-Log 'NSSM 다운로드'
    $url = 'https://nssm.cc/release/nssm-2.24.zip'
    $tmpZip = Join-Path $dataPath 'nssm-2.24.zip'
    $tmpDir = Join-Path $dataPath 'nssm-2.24'
    New-Item -ItemType Directory -Force -Path $dataPath | Out-Null

    try {
        Invoke-WebRequest -Uri $url -OutFile $tmpZip -UseBasicParsing
    } catch {
        throw @"
NSSM 을 받지 못했습니다: $($_.Exception.Message)

폐쇄망이면 인터넷이 되는 PC 에서 $url 을 받아
win64\nssm.exe 를 '$dataPath\nssm.exe' 에 두고 이 스크립트를 다시 실행하세요.
(또는 -NssmPath 로 경로를 지정)
"@
    }
    if (Test-Path $tmpDir) { Remove-Item $tmpDir -Recurse -Force }
    Expand-Archive -Path $tmpZip -DestinationPath $dataPath -Force

    $src = Join-Path $tmpDir 'win64\nssm.exe'
    if (-not (Test-Path $src)) { throw "압축을 풀었지만 nssm.exe 가 없습니다: $src" }
    $dst = Join-Path $dataPath 'nssm.exe'
    Copy-Item $src $dst -Force
    Remove-Item $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item $tmpZip -Force -ErrorAction SilentlyContinue
    Write-Log "NSSM 준비: $dst"
    return $dst
}

$nssm = Resolve-Nssm
if (-not $nssm) { $nssm = Install-Nssm }
Write-Log "nssm: $nssm"

# --- 제거 ---------------------------------------------------------------------
if ($Uninstall) {
    Write-Log "서비스 제거: $ServiceName"
    & $nssm stop $ServiceName confirm 2>$null
    & $nssm remove $ServiceName confirm
    Write-Host '제거 완료.' -ForegroundColor Green
    return
}

# --- 사전 검증 ----------------------------------------------------------------
if (-not (Test-Path $venvPython)) {
    throw "가상환경이 없습니다: $venvPython — deploy.ps1 또는 venv_sync.ps1 을 먼저 실행하세요."
}
if (-not (Test-Path $runScript)) { throw "backend\run.py 가 없습니다: $runScript" }
if (-not (Test-Path (Join-Path $backend '.env'))) {
    throw "backend\.env 가 없습니다. install.ps1 로 만들거나 이전 설치에서 복사하세요."
}
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# 이미 등록돼 있으면 제거 후 재등록한다 — 설정을 하나씩 비교해 고치는 것보다
# 결과가 예측 가능하다.
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($null -ne $existing) {
    Write-Log '기존 서비스 발견 → 제거 후 재등록'
    & $nssm stop $ServiceName confirm 2>$null
    & $nssm remove $ServiceName confirm
    Start-Sleep -Seconds 1
}

Write-Log "서비스 등록: $ServiceName"
& $nssm install $ServiceName $venvPython $runScript
if ($LASTEXITCODE -ne 0) { throw "nssm install 실패 (exit $LASTEXITCODE)" }

& $nssm set $ServiceName AppDirectory $backend
& $nssm set $ServiceName DisplayName 'Mechanical Design Server'
& $nssm set $ServiceName Description 'Flask + Waitress backend serving the Mechanical Design web app'
& $nssm set $ServiceName Start SERVICE_AUTO_START
& $nssm set $ServiceName AppStdout (Join-Path $logDir 'service-stdout.log')
& $nssm set $ServiceName AppStderr (Join-Path $logDir 'service-stderr.log')
& $nssm set $ServiceName AppRotateFiles 1
& $nssm set $ServiceName AppRotateBytes 10485760    # 10MB 마다 회전

Write-Log '서비스 시작'
& $nssm start $ServiceName
Start-Sleep -Seconds 3

$svc = Get-Service -Name $ServiceName
Write-Host "서비스 상태: $($svc.Status)"
if ($svc.Status -ne 'Running') {
    Write-Host '서비스가 Running 상태가 아닙니다.' -ForegroundColor Red
    Write-Host "로그: $logDir\service-stderr.log" -ForegroundColor Yellow
    throw '서비스 시작 실패'
}

Write-Host ''
Write-Host '서비스 등록 완료.' -ForegroundColor Green
Write-Host ''
Write-Host '관리:'
Write-Host "  Get-Service     $ServiceName"
Write-Host "  Restart-Service $ServiceName"
Write-Host "  Stop-Service    $ServiceName"
Write-Host ''
Write-Host '로그:'
Write-Host "  $logDir\service-stdout.log"
Write-Host "  $logDir\service-stderr.log"
Write-Host ''
Write-Host '제거:'
Write-Host "  .\install-service.ps1 -AppPath '$AppPath' -Uninstall"
Write-Host ''
