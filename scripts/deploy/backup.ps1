<#
백업 — 데이터베이스와 업로드 파일을 함께 받는다.

**둘 중 하나만 받으면 복구되지 않는다.** DB에는 이미지 레코드(카드 id·저장
파일명)가, uploads 에는 그 파일의 실제 내용이 있다. 시점이 어긋나면 "DB에는
있는데 파일이 없는" 행이 생겨 카드가 깨진 이미지로 뜬다. 그래서 한 스크립트가
같은 시각에 둘 다 받는다.

받는 것:
    <BackupRoot>\<타임스탬프>\db.dump        pg_dump 커스텀 포맷
    <BackupRoot>\<타임스탬프>\uploads\       업로드 이미지
    <BackupRoot>\<타임스탬프>\.env           접속 정보·비밀키
    <BackupRoot>\<타임스탬프>\MANIFEST.txt   무엇을 언제 받았는지 + 복구 절차

사용:
  .\backup.ps1 -AppPath 'C:\Server\MechanicalDesign' -BackupRoot 'D:\backup\mechanicaldesign'
  .\backup.ps1 -AppPath 'C:\Server\MechanicalDesign' -BackupRoot 'D:\backup\mechanicaldesign' -KeepDays 30
#>

param(
    [Parameter(Mandatory = $true)][string]$AppPath,
    [Parameter(Mandatory = $true)][string]$BackupRoot,
    [int]$KeepDays = 30,
    [string]$PgDumpExe
)

$ErrorActionPreference = 'Stop'

function Assert-NotFlag([string]$value, [string]$name) {
    if ($value -and $value.StartsWith('-')) {
        throw "-$name 값이 '$value' 입니다 — PowerShell 매개변수는 대시가 하나입니다: -$name '<값>'"
    }
}
Assert-NotFlag $AppPath 'AppPath'
Assert-NotFlag $BackupRoot 'BackupRoot'
Assert-NotFlag $PgDumpExe 'PgDumpExe'
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

$envFile = Join-Path $AppPath 'backend\.env'
if (-not (Test-Path $envFile)) { throw "backend\.env 를 찾을 수 없습니다: $envFile" }

# .env 에서 접속 정보를 읽는다. 백업 스크립트가 별도 설정을 갖게 하면 앱과
# 다른 DB 를 받는 사고가 난다.
$envLines = Get-Content $envFile -Encoding UTF8
$dsn = Get-KeyValue $envLines 'DATABASE_URL'
if (-not $dsn) { throw '.env 에 DATABASE_URL 이 없습니다.' }
if ($dsn -notmatch '://(?<user>[^:@/]+):(?<pw>[^@]*)@(?<host>[^:/]+):(?<port>\d+)/(?<db>[^?]+)') {
    throw 'DATABASE_URL 을 해석하지 못했습니다.'
}
# install.ps1 이 URL 인코딩해 넣으므로 되돌린다. 비밀번호에 @ 가 들어 있으면
# 인코딩된 %40 을 그대로 pg_dump 에 넘겨 인증이 실패한다.
$dbUser = [uri]::UnescapeDataString($Matches['user'])
$dbPw = [uri]::UnescapeDataString($Matches['pw'])
$dbHost = $Matches['host']; $dbPort = $Matches['port']; $dbName = $Matches['db']

# 업로드 위치도 .env 를 따른다. 비어 있으면 예전 배치(앱 폴더 안)다.
$uploadDir = Get-KeyValue $envLines 'UPLOAD_DIR'
if (-not $uploadDir) { $uploadDir = Join-Path $AppPath 'backend\uploads' }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$target = Join-Path $BackupRoot $stamp
New-Item -ItemType Directory -Force -Path $target | Out-Null

# --- pg_dump 찾기 -------------------------------------------------------------
if (-not $PgDumpExe) {
    $candidate = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\pg_dump.exe' -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending | Select-Object -First 1
    if ($candidate) { $PgDumpExe = $candidate.FullName }
    elseif (Get-Command pg_dump -ErrorAction SilentlyContinue) { $PgDumpExe = 'pg_dump' }
}
if (-not $PgDumpExe) {
    throw 'pg_dump 를 찾지 못했습니다. -PgDumpExe 로 경로를 지정하세요.'
}

# --- 데이터베이스 -------------------------------------------------------------
Write-Log "데이터베이스 백업: $dbName"
$env:PGPASSWORD = $dbPw
$dumpPath = Join-Path $target 'db.dump'
$previous = $ErrorActionPreference
$ErrorActionPreference = 'Continue'   # pg_dump 는 진행 상황을 stderr 로 낸다
try {
    & $PgDumpExe --host=$dbHost --port=$dbPort --username=$dbUser --format=custom `
        --file=$dumpPath $dbName
    $code = $LASTEXITCODE
} finally {
    $ErrorActionPreference = $previous
    $env:PGPASSWORD = ''
}
if ($code -ne 0) {
    Remove-Item -Recurse -Force $target -ErrorAction SilentlyContinue
    throw "pg_dump 실패 (exit $code) — 반쪽짜리 백업 폴더는 지웠습니다."
}

# --- 업로드 -------------------------------------------------------------------
if (Test-Path $uploadDir) {
    Write-Log "업로드 백업: $uploadDir"
    Copy-Item -Recurse -Force $uploadDir (Join-Path $target 'uploads')
} else {
    Write-Warning "업로드 폴더가 없습니다 ($uploadDir). 아직 올린 이미지가 없다면 정상입니다."
}

Copy-Item -Force $envFile (Join-Path $target '.env')

# --- 기록 --------------------------------------------------------------------
$dumpMb = [math]::Round((Get-Item $dumpPath).Length / 1MB, 1)
$fileCount = (Get-ChildItem (Join-Path $target 'uploads') -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count
$version = Get-KeyValue (Get-Content (Join-Path $AppPath 'BUILD_INFO.txt') -ErrorAction SilentlyContinue) 'version'
if (-not $version) { $version = '(알 수 없음)' }

@(
    "받은 시각    : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
    "앱 경로      : $AppPath",
    "앱 버전      : $version",
    "데이터베이스 : $dbName @ ${dbHost}:${dbPort}  (db.dump, ${dumpMb}MB)",
    "업로드       : $fileCount 개 파일  (원래 위치: $uploadDir)",
    '',
    '복구 방법:',
    '  1. 앱을 중지한다  (Stop-Service MechanicalDesign)',
    "  2. createdb 후  pg_restore --host=$dbHost --port=$dbPort --username=$dbUser --dbname=<새DB> db.dump",
    "  3. uploads\ 를 $uploadDir 로 되돌린다",
    '  4. .env 의 DATABASE_URL·UPLOAD_DIR 을 확인하고 앱을 시작한다',
    '',
    '주의: DB 와 업로드는 같은 시점의 것이어야 한다. 한쪽만 되돌리면',
    '      "DB에는 있는데 파일이 없는" 이미지가 생긴다.'
) | Set-Content -Path (Join-Path $target 'MANIFEST.txt') -Encoding utf8

# --- 오래된 백업 정리 ----------------------------------------------------------
if ($KeepDays -gt 0) {
    $cutoff = (Get-Date).AddDays(-$KeepDays)
    $old = Get-ChildItem $BackupRoot -Directory | Where-Object { $_.CreationTime -lt $cutoff }
    foreach ($dir in $old) {
        Write-Log "오래된 백업 삭제: $($dir.Name)"
        Remove-Item -Recurse -Force $dir.FullName
    }
}

Write-Log "백업 완료: $target (DB ${dumpMb}MB, 파일 $fileCount 개)"
Write-Host ''
Write-Host '  복구 절차는 MANIFEST.txt 에 함께 적혀 있습니다.'
Write-Host '  **한 번은 실제로 복구해 보세요.** 받아만 두고 복구를 해 본 적이 없는'
Write-Host '  백업은 백업이 아닙니다.'
Write-Host ''
