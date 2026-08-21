<#
직전 버전으로 되돌린다.

**파일만 되돌아간다. 마이그레이션은 취소되지 않는다.** 실패한 배포가 파괴적
마이그레이션(컬럼 삭제·이름 변경)을 적용했다면 데이터베이스는 따로 복구해야
한다 — backup.ps1 로 받아 둔 덤프가 그때 쓰인다.

되돌린 버전의 requirements.txt 가 다르면 가상환경이 새 버전 기준으로 남아 있다.
그때는 `venv_sync.ps1 -Force` 를 한 번 실행한다.

서비스가 돌고 있으면 교체 전에 멈추고 끝나면 다시 켠다 — 윈도우는 실행 중인
파일을 잠근다.

사용:
  .\rollback.ps1 -AppPath 'C:\Server\MechanicalDesign'
#>

param(
    [Parameter(Mandatory = $true)][string]$AppPath,
    [string]$ServiceName = 'MechanicalDesign',
    [switch]$NoRestart
)

$ErrorActionPreference = 'Stop'

function Assert-NotFlag([string]$value, [string]$name) {
    if ($value -and $value.StartsWith('-')) {
        throw "-$name 값이 '$value' 입니다 — PowerShell 매개변수는 대시가 하나입니다: -$name '<값>'"
    }
}
Assert-NotFlag $AppPath 'AppPath'
function Write-Log([string]$m) { Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $m" }

$prevPath = $AppPath + '_prev'
$tempPath = $AppPath + '_rollback_tmp'

if (-not (Test-Path $prevPath)) { throw "직전 버전이 없습니다: $prevPath" }
if (-not (Test-Path $AppPath)) { throw "현재 설치가 없습니다: $AppPath" }

# --- 서비스 중지 --------------------------------------------------------------
$serviceWasRunning = $false
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($null -ne $svc -and $svc.Status -eq 'Running') {
    Write-Log "서비스 '$ServiceName' 중지"
    Stop-Service -Name $ServiceName -Force
    $deadline = (Get-Date).AddSeconds(30)
    while ((Get-Date) -lt $deadline) {
        if ((Get-Service -Name $ServiceName).Status -eq 'Stopped') { break }
        Start-Sleep -Milliseconds 300
    }
    Start-Sleep -Milliseconds 700
    $serviceWasRunning = $true
}

# 잠금 확인은 실제로 할 연산(이름 바꾸기)으로 한다. 루트에 파일을 써 보는 것은
# 하위 폴더(backend)에 머문 프로세스를 잡아내지 못한다 — deploy.ps1 주석 참조.
if (Test-Path $tempPath) { Remove-Item -Recurse -Force $tempPath }
try {
    [System.IO.Directory]::Move($AppPath, $tempPath)
} catch {
    throw "$AppPath 를 옮길 수 없습니다. 실행 중인 앱과 그 폴더(하위 폴더 포함)에 들어가 있는 창을 닫고 다시 시도하세요."
}

# 제3의 이름을 거쳐 교환한다. 중간에 실패해도 두 이름이 같은 내용을 가리키거나
# 운영 경로가 사라지는 상태가 되지 않는다. Directory.Move 는 원자적 이름 변경이라
# 부분 이동이 생기지 않는다.
Write-Log '현재 버전과 직전 버전 교환'
try {
    [System.IO.Directory]::Move($prevPath, $AppPath)
} catch {
    # 되돌린다 — 운영 경로가 비어 있는 상태로 끝나지 않게.
    [System.IO.Directory]::Move($tempPath, $AppPath)
    throw "직전 버전을 옮기지 못했습니다: $_"
}
[System.IO.Directory]::Move($tempPath, $prevPath)

# 되돌린 버전의 requirements 가 다르면 지금 venv 는 새 버전 기준이다.
$restoredReq = Join-Path $AppPath 'backend\requirements.txt'
$syncScript = Join-Path $AppPath 'venv_sync.ps1'
if ((Test-Path $restoredReq) -and (Test-Path $syncScript)) {
    $stamp = Join-Path ($AppPath + '_venvs') 'backend.requirements.sha256'
    $wanted = (Get-FileHash -Algorithm SHA256 $restoredReq).Hash
    $current = if (Test-Path $stamp) { (Get-Content $stamp -Raw).Trim() } else { $null }
    if ($current -ne $wanted) {
        Write-Log '되돌린 버전의 의존성이 다릅니다 — 가상환경을 맞춥니다.'
        & $syncScript -AppPath $AppPath -Force
    }
}

# --- 서비스 재시작 -------------------------------------------------------------
if ($serviceWasRunning -and -not $NoRestart) {
    Write-Log "서비스 '$ServiceName' 시작"
    Start-Service -Name $ServiceName
    Start-Sleep -Seconds 2
    Write-Host "  상태: $((Get-Service -Name $ServiceName).Status)"
}

Write-Log '롤백 완료'
Write-Host ''
Write-Host "되돌린 버전은 이제 $prevPath 에 있습니다."
Write-Host '데이터베이스 마이그레이션은 되돌아가지 않았습니다.'
Write-Host '스키마가 문제라면 backup.ps1 로 받아 둔 덤프에서 복구해야 합니다.'
