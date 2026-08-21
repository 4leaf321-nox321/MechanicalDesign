<#
복원 — 받아 둔 백업이 **정말 되살아나는지** 확인하고, 필요하면 되돌린다.

backup.ps1 은 "한 번은 실제로 복구해 보세요" 라고 적어 두고 끝났다. 그런데
복구할 스크립트가 없었다. 복구해 본 적 없는 백업은 백업이 아니다 — 정작
필요한 날, 손으로 pg_restore 를 치면서 처음 해 보게 된다.

**기본 동작은 리허설이다.**

진짜 복원은 되돌릴 수 없다. 반면 평소에 필요한 것은 "이 백업이 쓸 수 있는
것인가" 라는 확인이고, 그건 아무것도 부수지 않고 할 수 있다. 그래서 기본은
**임시 DB 에 되살려 확인하고 지우는** 리허설이고, 운영을 실제로 덮어쓰려면
-Apply 를 명시해야 한다. 안전한 쪽이 기본이라야 사람이 실제로 돌려 본다.

리허설이 보는 것:
    pg_restore 가 이 덤프를 읽을 수 있는가
    표가 몇 개이고 행이 몇 개인가 — 빈 백업을 받아 두고 안심하는 것을 막는다
    **DB의 이미지 레코드와 uploads 의 파일이 맞는가** — backup.ps1 이 경고한
    바로 그 어긋남을 여기서 실제로 세어 본다

사용:
  # 리허설 (아무것도 건드리지 않는다)
  .\restore.ps1 -AppPath 'C:\Server\MechanicalDesign' -BackupDir 'D:\backup\...\20260822-031500'

  # 진짜 복원 (운영 DB 를 덮어쓴다)
  .\restore.ps1 -AppPath '...' -BackupDir '...' -Apply
#>

param(
    [Parameter(Mandatory = $true)][string]$AppPath,
    [Parameter(Mandatory = $true)][string]$BackupDir,
    # 이것을 주지 않으면 리허설이다. 실수로 운영을 덮어쓰는 일이 없어야 한다.
    [switch]$Apply,
    [string]$ServiceName = 'MechanicalDesign',
    [string]$PgBinDir
)

$ErrorActionPreference = 'Stop'

function Assert-NotFlag([string]$value, [string]$name) {
    if ($value -and $value.StartsWith('-')) {
        throw "-$name 값이 '$value' 입니다 — PowerShell 매개변수는 대시가 하나입니다: -$name '<값>'"
    }
}
Assert-NotFlag $AppPath 'AppPath'
Assert-NotFlag $BackupDir 'BackupDir'
Assert-NotFlag $PgBinDir 'PgBinDir'
function Get-KeyValue([string[]]$lines, [string]$key) {
    <#
    설정 파일(.env, BUILD_INFO.txt)에서 값 하나를 읽는다. 없으면 빈 문자열.

    **PowerShell 5.1 에서 `$null -replace ...` 는 빈 배열을 돌려준다.** 그래서
    `((... | Where-Object ...) -replace ...).Trim()` 은 키가 없는 파일에서
    "Object[] 에 Trim 이 없다" 로 죽는다. 없는 키를 다루려고 쓴 코드가 정작
    없는 키에서만 터지는 셈이라, 그 상황이 오기 전까지 드러나지 않는다.
    (실제로 backup.ps1 이 UPLOAD_DIR 없는 .env 에서 이렇게 죽었다.)

    같은 키가 두 번 있으면 뒤엣것을 쓴다 — 셸 환경 파일의 관례다.
    #>
    $hit = @($lines | Where-Object { $_ -match "^\s*$key\s*=" }) | Select-Object -Last 1
    if ($null -eq $hit) { return '' }
    return ([string]$hit -replace "^\s*$key\s*=", '').Trim()
}

function Write-Log([string]$m) { Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $m" }

# --- 백업이 온전한지 먼저 본다 --------------------------------------------------
# 아무것도 시작하기 전에 확인한다. 서비스를 멈춘 뒤에야 덤프가 깨진 것을 알면
# 그때는 멈춘 채로 손쓸 방법을 찾아야 한다.
if (-not (Test-Path $BackupDir)) { throw "백업 폴더가 없습니다: $BackupDir" }
$dumpPath = Join-Path $BackupDir 'db.dump'
if (-not (Test-Path $dumpPath)) {
    throw "db.dump 가 없습니다: $dumpPath — 이 폴더는 백업이 아니거나 받다가 끊긴 것입니다."
}
$dumpBytes = (Get-Item $dumpPath).Length
if ($dumpBytes -lt 1024) {
    throw "db.dump 가 ${dumpBytes} 바이트뿐입니다. 받다가 끊긴 백업입니다."
}
$backupUploads = Join-Path $BackupDir 'uploads'

# --- 접속 정보 -----------------------------------------------------------------
# 목적지는 **지금 앱이 쓰는 DB** 다. 백업 안의 .env 를 쓰면 그때의 주소로
# 복원하게 되는데, 서버를 옮긴 뒤라면 엉뚱한 곳을 덮어쓴다.
$envFile = Join-Path $AppPath 'backend\.env'
if (-not (Test-Path $envFile)) { throw "backend\.env 를 찾을 수 없습니다: $envFile" }
$envLines = Get-Content $envFile -Encoding UTF8
$dsn = Get-KeyValue $envLines 'DATABASE_URL'
if ($dsn -notmatch '://(?<user>[^:@/]+):(?<pw>[^@]*)@(?<host>[^:/]+):(?<port>\d+)/(?<db>[^?]+)') {
    throw 'DATABASE_URL 을 해석하지 못했습니다.'
}
$dbUser = [uri]::UnescapeDataString($Matches['user'])
$dbPw = [uri]::UnescapeDataString($Matches['pw'])
$dbHost = $Matches['host']; $dbPort = $Matches['port']; $dbName = $Matches['db']

$uploadDir = Get-KeyValue $envLines 'UPLOAD_DIR'
if (-not $uploadDir) { $uploadDir = Join-Path $AppPath 'backend\uploads' }

# --- PostgreSQL 도구 -----------------------------------------------------------
function Resolve-PgTool([string]$name) {
    if ($PgBinDir) {
        $p = Join-Path $PgBinDir "$name.exe"
        if (Test-Path $p) { return $p }
    }
    $found = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\$name.exe" -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending | Select-Object -First 1
    if ($found) { return $found.FullName }
    if (Get-Command $name -ErrorAction SilentlyContinue) { return $name }
    throw "$name 을 찾지 못했습니다. -PgBinDir 로 PostgreSQL bin 경로를 지정하세요."
}
$pgRestore = Resolve-PgTool 'pg_restore'
$psql = Resolve-PgTool 'psql'
$pgDump = Resolve-PgTool 'pg_dump'

$env:PGPASSWORD = $dbPw

function Invoke-Psql([string]$database, [string]$sql) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $out = & $psql --host=$dbHost --port=$dbPort --username=$dbUser --dbname=$database `
            --no-align --tuples-only --quiet --command=$sql
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previous }
    if ($code -ne 0) { throw "psql 실패 (exit $code): $sql" }
    return $out
}

function Get-Count([string]$database, [string]$table) {
    # 표가 없을 수도 있다(구버전 백업). 그때는 오류 대신 -1 로 알린다.
    $sql = "SELECT CASE WHEN to_regclass('public.$table') IS NULL THEN -1 " +
           "ELSE (SELECT count(*) FROM $table) END"
    return [int](Invoke-Psql $database $sql).Trim()
}

$COUNTED = @('users', 'cards', 'variables', 'containers', 'images',
             'calculation_records', 'variable_templates')

try {

# ==============================================================================
# 리허설 — 임시 DB 에 되살려 보고 지운다
# ==============================================================================
# 리허설에서 발견한 것의 수. **경고를 내고도 초록불로 끝내면 안 된다** —
# 훑어보는 사람은 초록만 보고 넘어가고, 야간 자동 점검이라면 아무도 안 본다.
$findings = 0

$probeDb = "${dbName}_restorecheck_$(Get-Date -Format 'yyyyMMddHHmmss')"
Write-Log "리허설용 임시 DB 생성: $probeDb"
Invoke-Psql 'postgres' "CREATE DATABASE ""$probeDb"" ENCODING 'UTF8'" | Out-Null

$restored = $false
try {
    Write-Log '덤프 복원 중…'
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'   # pg_restore 는 진행 상황을 stderr 로 낸다
    try {
        & $pgRestore --host=$dbHost --port=$dbPort --username=$dbUser `
            --dbname=$probeDb --no-owner --no-privileges $dumpPath
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previous }
    if ($code -ne 0) {
        throw "pg_restore 실패 (exit $code). **이 백업은 쓸 수 없습니다.** 다른 백업을 확인하세요."
    }
    $restored = $true

    Write-Host ''
    Write-Host '  백업에 들어 있는 것:' -ForegroundColor Cyan
    $counts = @{}
    foreach ($table in $COUNTED) {
        $n = Get-Count $probeDb $table
        $counts[$table] = $n
        $shown = if ($n -lt 0) { '(표 없음 — 구버전 백업)' } else { "$n 행" }
        Write-Host ("    {0,-22} {1}" -f $table, $shown)
    }

    # **빈 백업을 받아 두고 안심하는 것**이 가장 흔한 실패다. 덤프는 멀쩡히
    # 복원되는데 안에 아무것도 없다.
    if ($counts['cards'] -le 0 -and $counts['users'] -le 0) {
        Write-Warning '카드도 계정도 없습니다. 정말 이 시점에 자료가 없었는지 확인하세요.'
        $findings++
    }

    # --- 이미지 짝 맞추기 ------------------------------------------------------
    # backup.ps1 이 경고한 어긋남을 여기서 실제로 센다. DB 에는 있는데 파일이
    # 없으면 복원한 카드가 깨진 이미지로 뜬다.
    if ($counts['images'] -gt 0) {
        # 파일은 카드별 하위 폴더에 있다: uploads\<카드id>\<저장이름>
        # (backend/app/modules/cards/routes.py 의 UPLOAD_ROOT 배치).
        # 옛 배치에서 평면으로 놓인 것도 있을 수 있어 둘 다 본다.
        $rows = Invoke-Psql $probeDb "SELECT card_id || '/' || stored_name FROM images"
        $missing = @()
        $total = 0
        foreach ($row in $rows) {
            $row = "$row".Trim()
            if (-not $row) { continue }
            $total++
            $flat = $row.Substring($row.IndexOf('/') + 1)
            $nested = Join-Path $backupUploads ($row -replace '/', '\')
            if (-not (Test-Path $nested) -and -not (Test-Path (Join-Path $backupUploads $flat))) {
                $missing += $row
            }
        }
        if ($missing.Count -gt 0) {
            Write-Host ''
            Write-Warning "이미지 $($missing.Count) 개가 uploads 에 없습니다. 복원하면 깨진 이미지로 뜹니다."
            $missing | Select-Object -First 5 | ForEach-Object { Write-Host "      $_" }
            $findings++
        } else {
            Write-Host ("    {0,-22} {1}" -f 'uploads 짝 맞음', "$total 개 모두 있음")
        }
    }
    Write-Host ''
} finally {
    # 임시 DB 는 반드시 지운다. 남으면 다음 리허설마다 하나씩 쌓인다.
    Write-Log "임시 DB 삭제: $probeDb"
    Invoke-Psql 'postgres' "DROP DATABASE IF EXISTS ""$probeDb"" WITH (FORCE)" | Out-Null
}

if (-not $Apply) {
    if ($findings -gt 0) {
        # 덤프 자체는 되살아났다. 그래도 통과라고 하지 않는다 — 이대로
        # 복원하면 화면에서 무언가 빠진 채로 돌아온다.
        Write-Host "리허설: 덤프는 되살아나지만 확인할 것이 $findings 건 있습니다." -ForegroundColor Yellow
        Write-Host '  위의 경고를 먼저 해결하거나, 다른 시점의 백업을 확인하세요.'
        Write-Host ''
        # 0 이 아닌 코드로 끝낸다. 야간 자동 점검이 이 값으로 사람을 부른다.
        exit 1
    }
    Write-Host '리허설 통과 — 이 백업은 되살릴 수 있습니다.' -ForegroundColor Green
    Write-Host ''
    Write-Host '  운영에 실제로 되돌리려면 -Apply 를 붙여 다시 실행하세요.'
    Write-Host '  (그때는 서비스를 멈추고, 지금 상태를 먼저 백업한 뒤 덮어씁니다.)'
    Write-Host ''
    return
}

# ==============================================================================
# 진짜 복원 — 여기서부터는 되돌릴 수 없다
# ==============================================================================
Write-Host ''
Write-Host '  ***  운영 데이터를 덮어씁니다  ***' -ForegroundColor Yellow
Write-Host "  대상 : $dbName @ ${dbHost}:${dbPort}"
Write-Host "  업로드: $uploadDir"
Write-Host "  출처 : $BackupDir"
Write-Host ''
if ($findings -gt 0) {
    Write-Host "  리허설에서 확인할 것이 $findings 건 나왔습니다(위 경고). 그래도 진행합니까?" -ForegroundColor Yellow
}
$answer = Read-Host "정말 진행하려면 DB 이름을 그대로 입력하세요 ($dbName)"
if ($answer -ne $dbName) { throw '입력이 일치하지 않아 중단했습니다.' }

# **덮어쓰기 전에 지금 상태를 먼저 받는다.** 복원은 되돌릴 수 없고, 잘못된
# 백업을 골랐다는 것은 대개 복원한 뒤에 안다.
$safetyDir = Join-Path ($AppPath + '_data') ("pre-restore-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Force -Path $safetyDir | Out-Null
Write-Log "복원 전 현재 상태 백업: $safetyDir"
$previous = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
    & $pgDump --host=$dbHost --port=$dbPort --username=$dbUser --format=custom `
        --file=(Join-Path $safetyDir 'db.dump') $dbName
    $code = $LASTEXITCODE
} finally { $ErrorActionPreference = $previous }
if ($code -ne 0) { throw "복원 전 백업에 실패했습니다 (exit $code). 되돌릴 수단 없이 덮어쓰지 않습니다." }
if (Test-Path $uploadDir) {
    Copy-Item -Recurse -Force $uploadDir (Join-Path $safetyDir 'uploads')
}

# --- 서비스 중지 ---------------------------------------------------------------
$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
$wasRunning = $false
if ($service -and $service.Status -eq 'Running') {
    Write-Log "서비스 중지: $ServiceName"
    Stop-Service -Name $ServiceName -Force
    $wasRunning = $true
    Start-Sleep -Seconds 2
} elseif (-not $service) {
    Write-Warning "서비스 '$ServiceName' 가 없습니다. 앱이 콘솔로 떠 있다면 직접 멈추세요."
}

# --- DB 교체 -------------------------------------------------------------------
# 지우고 다시 만든다. 기존 DB 위에 덮으면 백업에 없는 표·행이 남아 섞인다.
Write-Log "데이터베이스 교체: $dbName"
Invoke-Psql 'postgres' "DROP DATABASE IF EXISTS ""$dbName"" WITH (FORCE)" | Out-Null
Invoke-Psql 'postgres' "CREATE DATABASE ""$dbName"" ENCODING 'UTF8'" | Out-Null

$previous = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
    & $pgRestore --host=$dbHost --port=$dbPort --username=$dbUser `
        --dbname=$dbName --no-owner --no-privileges $dumpPath
    $code = $LASTEXITCODE
} finally { $ErrorActionPreference = $previous }
if ($code -ne 0) {
    throw @"
pg_restore 가 실패했습니다 (exit $code). 데이터베이스가 반쪽 상태입니다.

복원 전 상태가 여기 있습니다:
    $safetyDir\db.dump
되돌리려면 이 폴더를 -BackupDir 로 지정해 다시 실행하세요.
"@
}

# --- 업로드 교체 ---------------------------------------------------------------
# DB 와 같은 시점의 것으로 함께 되돌린다. 한쪽만 되돌리면 "DB에는 있는데 파일이
# 없는" 이미지가 생긴다.
if (Test-Path $backupUploads) {
    Write-Log "업로드 교체: $uploadDir"
    if (Test-Path $uploadDir) { Remove-Item -Recurse -Force $uploadDir }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $uploadDir) | Out-Null
    Copy-Item -Recurse -Force $backupUploads $uploadDir
} else {
    Write-Warning '백업에 uploads 가 없습니다. 이미지가 없던 시점이면 정상입니다.'
}

# --- 확인 ---------------------------------------------------------------------
Write-Host ''
Write-Host '  복원된 내용:' -ForegroundColor Cyan
foreach ($table in $COUNTED) {
    $n = Get-Count $dbName $table
    if ($n -ge 0) { Write-Host ("    {0,-22} {1} 행" -f $table, $n) }
}

if ($wasRunning) {
    Write-Log "서비스 시작: $ServiceName"
    Start-Service -Name $ServiceName
    Start-Sleep -Seconds 3
    $status = (Get-Service -Name $ServiceName).Status
    Write-Host "서비스 상태: $status"
    if ($status -ne 'Running') {
        Write-Warning "서비스가 뜨지 않았습니다. 로그를 보세요: ${AppPath}_data\logs\service-stderr.log"
    }
}

Write-Host ''
Write-Host '복원 완료.' -ForegroundColor Green
Write-Host "  복원 전 상태는 $safetyDir 에 남아 있습니다."
Write-Host '  화면에서 카드와 이미지가 제대로 보이는지 확인한 뒤 지우세요.'
Write-Host ''

} finally {
    $env:PGPASSWORD = ''
}
