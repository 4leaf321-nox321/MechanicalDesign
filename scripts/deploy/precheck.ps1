<#
설치·배포 전 환경 점검.

문제를 찾으면 목록으로 보여 주고 0이 아닌 코드로 끝난다. 설치 도중에 절반만
적용된 상태로 멈추는 것보다, 시작 전에 막는 편이 원인 추적이 쉽다.

전 방식(setup.ps1)은 python·node·npm 이 PATH 에 있는지만 봤고 그 검사도 설치를
이미 시작한 뒤였다. DB 에 닿지 않거나 포트가 막힌 것은 마이그레이션 단계까지
가서야 드러났다.

사용:
  .\precheck.ps1 -AppPath 'C:\Server\MechanicalDesign' -DatabaseUrl 'postgresql+psycopg://...'
#>

param(
    [Parameter(Mandatory = $true)][string]$AppPath,
    [string]$DatabaseUrl,
    [string]$PythonVersion = '3.13',
    [int]$Port = 5176,
    [int]$RequiredFreeGb = 3
)

$ErrorActionPreference = 'Stop'
$problems = @()
$notes = @()

function Add-Problem([string]$m) { $script:problems += $m }
function Add-Note([string]$m) { $script:notes += $m }

# --- Python — wheel 번들의 ABI 태그가 마이너 버전에 묶여 있다 ------------------
$pythonExe = $null
try {
    $resolved = & py "-$PythonVersion" -c "import sys; print(sys.executable)" 2>$null
    if ($LASTEXITCODE -eq 0 -and $resolved) { $pythonExe = $resolved.Trim() }
} catch { }
if (-not $pythonExe) {
    # py 런처가 없는 서버도 있다. PATH 의 python 이 맞는 버전이면 그것으로 된다.
    try {
        $ver = & python -c "import sys; print('{}.{}'.format(sys.version_info[0], sys.version_info[1]))" 2>$null
        if ($LASTEXITCODE -eq 0 -and $ver -and $ver.Trim() -eq $PythonVersion) {
            $pythonExe = (& python -c "import sys; print(sys.executable)").Trim()
        }
    } catch { }
}
if ($pythonExe) {
    Add-Note "Python $PythonVersion : $pythonExe"
} else {
    Add-Problem "Python $PythonVersion 을 찾지 못했습니다. 설치하거나 -PythonExe 로 지정하세요 (py -0p 로 목록 확인)."
}

# --- Node — 있으면 좋고 없어도 앱은 돈다 --------------------------------------
# 서버에서 프론트를 빌드하지 않고 코드도 릴리스 zip 으로 오므로, 앱 구동에 Node
# 는 필요 없다. 다만 카드 정의 검증(POST /api/cards/<id>/validate)의 **시험 계산**
# 은 프론트와 같은 자바스크립트 계산기를 그대로 돌리기 때문에 Node 가 있어야 한다.
#
# 그래서 문제가 아니라 안내로 남긴다. 없다고 설치를 막으면, 검증을 안 쓰는
# 서버까지 Node 를 깔아야 하는 꼴이 된다. 반대로 아무 말도 안 하면 "검증이
# 반쪽만 돈다" 는 사실을 아무도 모르는 채로 넘어간다.
$nodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
if ($nodeExe) {
    $nodeVer = (& node -v 2>$null)
    Add-Note "Node : $nodeExe $nodeVer — 카드 검증의 시험 계산까지 동작합니다."
} else {
    Add-Note 'Node : 없음 — 앱은 정상 동작합니다. 카드 검증은 정적 검사까지만 돌고, 시험 계산은 응답의 trial_skipped 에 사유가 남습니다.'
}

# **git 은 확인하지 않는다.** 코드가 릴리스 zip 으로 오므로 서버에 필요 없다.

# --- 디스크 여유 --------------------------------------------------------------
$drive = (Split-Path -Qualifier $AppPath)
if ($drive) {
    $free = (Get-PSDrive -Name $drive.TrimEnd(':') -ErrorAction SilentlyContinue).Free
    if ($null -ne $free) {
        $freeGb = [math]::Round($free / 1GB, 1)
        if ($freeGb -lt $RequiredFreeGb) {
            Add-Problem "$drive 여유 공간 ${freeGb}GB — 앱 2벌·가상환경·업로드에 최소 ${RequiredFreeGb}GB 가 필요합니다."
        } else {
            Add-Note "$drive 여유 공간 : ${freeGb}GB"
        }
    }
}

# --- 쓰기 권한 ----------------------------------------------------------------
$parent = Split-Path -Parent $AppPath
if (-not (Test-Path $parent)) {
    try { New-Item -ItemType Directory -Force -Path $parent | Out-Null } catch { }
}
if (Test-Path $parent) {
    $probe = Join-Path $parent ('.mdz_probe_' + [guid]::NewGuid().ToString('N'))
    try {
        New-Item -ItemType File -Path $probe -Force | Out-Null
        Remove-Item -Force $probe
        Add-Note "쓰기 권한 : $parent"
    } catch {
        Add-Problem "$parent 에 쓸 수 없습니다. 관리자 권한으로 실행하거나 다른 경로를 쓰세요."
    }
} else {
    Add-Problem "$parent 를 만들 수 없습니다."
}

# --- 포트 --------------------------------------------------------------------
# **연결 테이블을 읽지 않고 실제로 바인딩해 본다.**
#
# Get-NetTCPConnection 은 이미 종료된 프로세스를 소유자로 가리키는 유령 항목을
# 그대로 보여 준다. 그걸 믿으면 멀쩡한 포트에 설치가 막힌다. 반대로 바인딩이
# 되면 그 포트는 실제로 쓸 수 있는 것이므로, 하려는 일을 그대로 시험하는 편이
# 정확하다.
#
# 이미 이 앱이 서비스로 돌고 있으면 여기서 걸린다 — 그게 맞다. 갱신 배포는
# 서비스를 먼저 멈추므로 precheck 를 다시 탈 일이 없고, 신규 설치인데 5176 이
# 잡혀 있다면 그건 알아야 할 사실이다.
$bindable = $false
try {
    $probe = New-Object System.Net.Sockets.TcpListener ([System.Net.IPAddress]::Any, $Port)
    $probe.Start()
    $probe.Stop()
    $bindable = $true
} catch {
    $bindable = $false
}

if ($bindable) {
    Add-Note "포트 $Port : 비어 있음"
} else {
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    $owner = if ($listener) {
        (Get-Process -Id $listener[0].OwningProcess -ErrorAction SilentlyContinue).ProcessName
    } else { $null }
    $who = if ($owner) { " (프로세스: $owner)" } else { '' }
    Add-Problem "포트 $Port 에 바인딩할 수 없습니다$who. 쓰고 있는 프로세스를 중지하거나 -Port 로 다른 포트를 지정하세요."
}

# --- PostgreSQL ---------------------------------------------------------------
# 도달 가능성부터 확인한다. 폐쇄망에서 가장 흔한 실패가 "설치는 다 됐는데 DB 에
# 닿지 않는" 것이고, 그건 자격 증명 문제가 아니라 네트워크 문제다. TCP 연결은
# 외부 의존성 없이 .NET 으로 확인할 수 있다.
if ($DatabaseUrl) {
    if ($DatabaseUrl -match '@([^:/@]+):(\d+)/') {
        $dbHost = $Matches[1]
        $dbPort = [int]$Matches[2]
        $tcp = New-Object System.Net.Sockets.TcpClient
        try {
            if ($tcp.ConnectAsync($dbHost, $dbPort).Wait(3000)) {
                Add-Note "PostgreSQL 도달 : ${dbHost}:${dbPort}"
            } else {
                Add-Problem "PostgreSQL 에 닿지 않습니다 (${dbHost}:${dbPort}). 서비스 기동·방화벽·주소를 확인하세요."
            }
        } catch {
            Add-Problem "PostgreSQL 에 닿지 않습니다 (${dbHost}:${dbPort}) — $($_.Exception.Message)"
        } finally {
            $tcp.Close()
        }
    } else {
        Add-Note 'PostgreSQL : DATABASE_URL 에서 호스트·포트를 읽지 못해 도달 확인을 건너뜀'
    }

    # 자격 증명까지 보려면 psycopg 이 필요하다. 시스템 파이썬에는 없는 것이
    # 정상이며, 그때는 설치 과정의 DB 생성 단계에서 걸러진다.
    if ($pythonExe) {
        $probeScript = @'
import sys
from urllib.parse import urlsplit, unquote
url = urlsplit(sys.argv[1].replace("postgresql+psycopg://", "postgresql://"))
try:
    import psycopg
except ImportError:
    print("SKIP psycopg 미설치 - 설치 후 다시 확인됩니다")
    sys.exit(0)
try:
    with psycopg.connect(host=url.hostname, port=url.port or 5432,
                         user=unquote(url.username or ""),
                         password=unquote(url.password or ""),
                         dbname="postgres", connect_timeout=5) as conn:
        version = conn.execute("SHOW server_version").fetchone()[0]
    print(f"OK PostgreSQL {version}")
except Exception as exc:
    print(f"FAIL {type(exc).__name__}: {exc}")
    sys.exit(1)
'@
        # **임시 파일을 쓰지 않는다.** 스크립트를 표준입력으로 넘긴다 — 쓰고
        # 지우는 자리가 없으면 그 경로 때문에 막힐 일도 없다. 윈도우 계정명이
        # 한글이면 %TEMP% 가 8.3 단축 경로로 잡혀 그 이름이 풀리지 않는 일이 있다.
        $result = $probeScript | & $pythonExe - $DatabaseUrl 2>&1
        if ($result -match '^OK') { Add-Note ($result -replace '^OK ', 'PostgreSQL 인증 : ') }
        elseif ($result -match '^SKIP') { Add-Note ($result -replace '^SKIP ', 'PostgreSQL 인증 : ') }
        else { Add-Problem "PostgreSQL 인증에 실패했습니다 — $result" }
    }
} else {
    Add-Note 'PostgreSQL : -DatabaseUrl 을 주지 않아 건너뜀'
}

# --- 결과 --------------------------------------------------------------------
Write-Host ''
foreach ($n in $notes) { Write-Host "  [ok]   $n" }
foreach ($p in $problems) { Write-Host "  [문제] $p" -ForegroundColor Yellow }
Write-Host ''

if ($problems.Count -gt 0) {
    Write-Host "$($problems.Count) 건을 해결한 뒤 다시 실행하세요." -ForegroundColor Yellow
    exit 1
}
Write-Host '환경 점검 통과.'
