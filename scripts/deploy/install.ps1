<#
Day 0 — 신규 서버 설치.

폴더 배치 — 운영 데이터는 앱 폴더 **바깥**에 둔다.

    <AppPath>                코드. 배포마다 통째로 교체된다
    <AppPath>_prev           직전 버전 (롤백용)
    <AppPath>_venvs\         가상환경
    <AppPath>_data\uploads   업로드 이미지  ← 배포와 무관하게 살아남는다
    <AppPath>_data\logs      서비스 로그

전 방식(setup.ps1)은 저장소를 클론한 자리에서 그대로 돌렸다. 업로드가
backend\uploads 안에 있어 코드와 데이터가 같은 폴더에 섞였고, 그래서 "코드를
통째로 갈아 끼우는" 배포를 할 수가 없었다. 바깥에 두면 교체가 데이터를 건드리지
않는다.

각 단계는 멱등하다. 중간에 끊겨 다시 실행해도 같은 결과가 나오고, 이미 있는
.env 를 덮어쓰지 않는다.

스크립트는 `C:\Server\tools\MechanicalDesign\` 처럼 **프로젝트별 하위 폴더**에
둔다. `C:\Server\tools` 바로 아래에 두면 같은 서버의 다른 앱과 파일명이 겹쳐
서로를 덮어쓴다.

사용:
  .\install.ps1 -AppPath 'C:\Server\MechanicalDesign' -DbPassword '...'
  .\install.ps1 -AppPath 'C:\Server\MechanicalDesign' -ZipPath 'C:\tmp\deploy_package.zip' `
                -DbHost localhost -DbUser postgres -DbPassword '...'
#>

param(
    [Parameter(Mandatory = $true)][string]$AppPath,
    [string]$ZipPath,
    [string]$Repo = '4leaf321-nox321/MechanicalDesign',
    [string]$Tag,
    [string]$DbHost = 'localhost',
    [int]$DbPort = 5432,
    [string]$DbName = 'mechanicaldesign',
    [string]$DbUser = 'postgres',
    [Parameter(Mandatory = $true)][string]$DbPassword,
    [int]$Port = 5176,
    [string]$AdminEmail = 'admin',
    [string]$AdminPassword = '32167',
    [string]$PythonExe,
    [string]$ServiceName = 'MechanicalDesign',
    [switch]$NoService,
    [switch]$SkipPrecheck
)

$ErrorActionPreference = 'Stop'

<#
매개변수를 값으로 받아 버리는 것을 막는다 — **대시는 하나다.**
자세한 이유는 deploy.ps1 의 같은 함수 주석 참조.
#>
function Assert-NotFlag([string]$value, [string]$name) {
    if ($value -and $value.StartsWith('-')) {
        throw @"
-$name 값이 '$value' 입니다 — 대시를 두 번 쓰신 것 같습니다.

PowerShell 매개변수는 대시가 하나입니다:  -$name '<값>'
'--$name' 처럼 쓰면 그 글자 자체가 값이 되고, 뒤에 적은 진짜 값은 다른
매개변수로 밀려 들어갑니다. 아무것도 실행하지 않았습니다.
"@
    }
}

Assert-NotFlag $AppPath 'AppPath'
Assert-NotFlag $ZipPath 'ZipPath'
Assert-NotFlag $Tag 'Tag'
Assert-NotFlag $PythonExe 'PythonExe'
if ($Repo -and $Repo -notmatch '^[^/\:]+/[^/\:]+$') {
    throw "-Repo 는 'owner/name' 형식입니다. 지금 값: '$Repo' — -AppPath 에 쓰려던 경로가 여기로 밀려 들어오지 않았는지 확인하세요."
}
function Write-Log([string]$m) { Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $m" }

<#
네이티브 명령 실행 — stderr 를 오류로 착각하지 않는다.
Windows PowerShell 5.1 은 $ErrorActionPreference='Stop' 에서 네이티브 명령이
stderr 에 한 줄만 써도 종료성 오류로 바꾼다. alembic 은 INFO 로그를 stderr 로
내보내므로 정상 설치가 실패로 뒤집힌다. 성공 여부는 종료 코드로만 판정한다.
#>
function Invoke-Native {
    param([Parameter(Mandatory = $true)][string]$FailureMessage, [Parameter(Mandatory = $true)][scriptblock]$Command)
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $Command
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
    if ($code -ne 0) { throw "$FailureMessage (exit $code)" }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataPath = $AppPath + '_data'

# DSN 에 그대로 끼워 넣으면 비밀번호의 @ 나 / 가 URL 을 쪼갠다. 접속은 되는데
# 호스트가 엉뚱하게 잡히는 형태로 실패하므로 눈으로는 원인을 못 찾는다.
$encodedUser = [uri]::EscapeDataString($DbUser)
$encodedPassword = [uri]::EscapeDataString($DbPassword)
$dsn = "postgresql+psycopg://${encodedUser}:${encodedPassword}@${DbHost}:${DbPort}/${DbName}"

# --- 1. 환경 점검 -------------------------------------------------------------
if (-not $SkipPrecheck) {
    Write-Log '환경 점검'
    & (Join-Path $scriptDir 'precheck.ps1') -AppPath $AppPath -DatabaseUrl $dsn -Port $Port
    if ($LASTEXITCODE -ne 0) { throw '환경 점검에서 문제가 발견됐습니다. 위 목록을 해결하고 다시 실행하세요.' }
}

# --- 2. 코드 배치 — deploy.ps1 을 그대로 쓴다 ----------------------------------
# 첫 설치와 갱신이 같은 경로를 타야 "설치는 되는데 갱신이 안 되는" 상태가 생기지
# 않는다. 마이그레이션은 .env 를 만든 뒤에 돌려야 하므로 여기서는 건너뛴다.
Write-Log '코드 배치'
$deployArgs = @{ AppPath = $AppPath; SkipMigrations = $true; ServiceName = $ServiceName }
if ($ZipPath) { $deployArgs.ZipPath = $ZipPath }
if ($Repo) { $deployArgs.Repo = $Repo }
if ($Tag) { $deployArgs.Tag = $Tag }
if ($PythonExe) { $deployArgs.PythonExe = $PythonExe }
& (Join-Path $scriptDir 'deploy.ps1') @deployArgs
if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) { throw "코드 배치 실패 (exit $LASTEXITCODE)" }

# --- 3. 운영 데이터 폴더 -------------------------------------------------------
foreach ($sub in @('uploads', 'logs')) {
    $dir = Join-Path $dataPath $sub
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
}
Write-Log "운영 데이터 폴더: $dataPath"

# --- 4. .env 생성 (있으면 건드리지 않는다) --------------------------------------
$envFile = Join-Path $AppPath 'backend\.env'
if (Test-Path $envFile) {
    Write-Log '.env 가 이미 있습니다 — 그대로 둡니다.'
} else {
    # 비밀키는 난수로 만든다. config.py 의 기본값('dev-secret-key')이 운영에 남으면
    # 누구나 세션과 JWT 를 위조할 수 있다.
    function New-Secret {
        $bytes = New-Object byte[] 36
        [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
        return [Convert]::ToBase64String($bytes)
    }

    $lines = @(
        '# install.ps1 이 생성했습니다. 비밀키는 난수이며 이 파일에만 있습니다.',
        'FLASK_ENV=production',
        'FLASK_HOST=0.0.0.0',
        "FLASK_PORT=$Port",
        'WAITRESS_THREADS=8',
        '',
        "SECRET_KEY=$(New-Secret)",
        "JWT_SECRET_KEY=$(New-Secret)",
        '',
        "DATABASE_URL=$dsn",
        '',
        "UPLOAD_DIR=$dataPath\uploads",
        '',
        '# https 로 서비스하게 되면 true 로 올린다. http 에서 true 면 브라우저가',
        '# refresh 쿠키를 버려 로그인이 유지되지 않는다.',
        'REFRESH_COOKIE_SECURE=false',
        '',
        '# 프론트와 API 를 같은 오리진에서 서빙하므로 비워 둔다.',
        '# 다른 도메인에서 부르는 경우에만 쉼표로 나열한다.',
        'CORS_ORIGINS='
    )
    # BOM 없이 쓴다. PowerShell 5.1 의 `Set-Content -Encoding utf8` 은 BOM 을 붙이는데,
    # python-dotenv 는 첫 줄 키에 BOM 이 붙으면 그 키를 다른 이름으로 읽는다.
    [System.IO.File]::WriteAllLines($envFile, $lines, (New-Object System.Text.UTF8Encoding $false))
    Write-Log ".env 생성: $envFile"
}

$backendPython = Join-Path ($AppPath + '_venvs') 'backend\Scripts\python.exe'
if (-not (Test-Path $backendPython)) { throw "가상환경을 찾을 수 없습니다: $backendPython" }

# --- 5. 데이터베이스 ----------------------------------------------------------
Write-Log "데이터베이스 확인/생성: $DbName"
$createDb = @'
import sys
import psycopg
host, port, user, password, name = sys.argv[1:6]
with psycopg.connect(host=host, port=int(port), user=user, password=password,
                     dbname="postgres", autocommit=True) as conn:
    if conn.execute("SELECT 1 FROM pg_database WHERE datname = %s", (name,)).fetchone():
        print(f"이미 있음: {name}")
    else:
        conn.execute(f'CREATE DATABASE "{name}" ENCODING \'UTF8\'')
        print(f"생성: {name}")
'@
# **임시 파일을 쓰지 않는다.** 스크립트를 표준입력으로 넘긴다 — 쓰고 지우는
# 자리가 없으면 그 경로 때문에 막힐 일도 없다.
# psql 을 쓰지 않는 이유: 서버에 클라이언트 도구가 깔려 있지 않을 수 있고,
# 비밀번호를 대화형으로 물어 무인 설치가 안 된다. psycopg 는 이미 venv 안에 있다.
Invoke-Native '데이터베이스 생성 실패' {
    $createDb | & $backendPython - $DbHost $DbPort $DbUser $DbPassword $DbName
}

# --- 6. 마이그레이션 ----------------------------------------------------------
Write-Log '마이그레이션 적용 (flask db upgrade)'
Push-Location (Join-Path $AppPath 'backend')
try {
    $env:FLASK_APP = 'run.py'
    Invoke-Native '마이그레이션 실패' { & $backendPython -m flask db upgrade }
} finally {
    Pop-Location
}

# --- 7. 초기 관리자 계정 ---
# 멱등하다. 이미 있으면 비밀번호를 바꾸지 않는다 — 설치가 중간에 끊겨 다시 돌 때
# 운영 계정의 비밀번호가 초기값으로 되돌아가면 사고다.
#
# 비밀번호를 주지 않으면 스크립트가 난수로 만들어 **화면에 한 번만** 출력한다.
# 저장하지 않으므로 그 출력을 놓치면 다시 볼 수 없다.
Write-Log '초기 관리자 계정'
Push-Location (Join-Path $AppPath 'backend')
try {
    $seedArgs = @('scripts\seed_install.py', '--email', $AdminEmail)
    # 비밀번호를 지정하면 그것이 '임시' 가 아니므로 변경을 강제하지 않는다.
    # 비워 두면 시드가 난수를 만들어 한 번만 출력하고 변경을 강제한다.
    if ($AdminPassword) { $seedArgs += @('--password', $AdminPassword, '--no-force-change') }
    Invoke-Native '관리자 계정 생성 실패' { & $backendPython @seedArgs }
} finally {
    Pop-Location
}

# --- 8. 방화벽 ----------------------------------------------------------------
$ruleName = "MechanicalDesign $Port"
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Log "방화벽 규칙이 이미 있습니다: $ruleName"
} else {
    # -ErrorAction Stop 이 필요하다. CIM 계열 cmdlet 은 5.1에서
    # $ErrorActionPreference='Stop' 을 따르지 않고 비종료 오류를 내는 경우가 있어,
    # 그대로 두면 실패했는데도 아래 성공 로그가 찍힌다.
    try {
        New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow `
            -Protocol TCP -LocalPort $Port -ErrorAction Stop | Out-Null
        Write-Log "방화벽 열기: TCP $Port"
    } catch {
        Write-Warning '방화벽 규칙을 만들지 못했습니다(관리자 권한 필요).'
        Write-Warning '관리자 PowerShell 에서 다음을 실행하세요:'
        Write-Warning "  New-NetFirewallRule -DisplayName '$ruleName' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port"
    }
}

# --- 9. 서비스 등록 -----------------------------------------------------------
# 콘솔로 띄우면 창을 닫는 순간 서버가 멈추고 서버를 재부팅하면 아무도 켜 주지
# 않는다. 기본값은 서비스 등록이다.
if ($NoService) {
    Write-Log '-NoService — 서비스 등록을 건너뜁니다.'
} else {
    Write-Log "서비스 등록: $ServiceName"
    & (Join-Path $scriptDir 'install-service.ps1') -AppPath $AppPath -ServiceName $ServiceName
    if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
        Write-Warning "서비스 등록에 실패했습니다. 관리자 PowerShell 에서 다시 실행하세요:"
        Write-Warning "  .\install-service.ps1 -AppPath '$AppPath'"
    }
}

Write-Host ''
$installed = Get-Content (Join-Path $AppPath 'BUILD_INFO.txt') -ErrorAction SilentlyContinue |
    Where-Object { $_ -match '^version=' }
if ($installed) { Write-Log ('배포한 버전: ' + ($installed -replace '^version=', '')) }

Write-Host '설치 완료.'
Write-Host ''
Write-Host "  접속        : http://<서버주소>:$Port/"
if ($AdminPassword) {
    Write-Host "  관리자      : $AdminEmail  /  $AdminPassword"
} else {
    Write-Host "  관리자      : $AdminEmail  (위에 출력된 비밀번호, 첫 로그인 시 변경 강제)"
}
Write-Host "  상태 확인   : Get-Service $ServiceName"
Write-Host "  서비스 없이 : cd '$AppPath' ; .\run_server.ps1"
Write-Host "  운영 데이터 : $dataPath  (백업 대상 — DB와 함께 받아야 복구가 성립한다)"
Write-Host ''
