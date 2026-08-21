<#
MCP 서버를 설치하고 Windows 서비스로 등록한다.

MCP 는 밖의 AI(Claude 등)가 이 시스템의 계산 카드를 읽고 만들게 하는 통로다.
**앱과는 별개의 프로세스·별개의 가상환경**으로 돈다 — mcp 패키지가 끌고 오는
starlette/pydantic 이 백엔드의 Flask 의존성과 부딪히기 때문이다. 섞으면 그
충돌이 배포하는 날에야 드러난다.

**이것은 선택 기능이다.** 안 깔아도 앱은 그대로 돌고, 웹에서 하던 일도 전부
그대로다. 밖에서 AI 로 카드를 만들 계획이 있을 때만 깐다.

의존성은 PyPI 에서 받는다(앱 배포와 다른 점). 앱은 wheel 을 동봉해 폐쇄망에서도
설치되지만, MCP 는 선택 기능이라 그 무게를 배포 패키지에 얹지 않았다. 인터넷이
안 되는 서버라면 -PackagesDir 로 미리 받아 둔 wheel 폴더를 지정한다.

    실행     <AppPath>_venvs\mcp\Scripts\python.exe  <AppPath>\mcp_server\server.py
    작업폴더 <AppPath>\mcp_server
    로그     <AppPath>_data\logs\

가상환경을 앱 폴더 **바깥**에 두는 이유는 백엔드와 같다 — 배포가 앱 폴더를
통째로 교체하는 순간 서비스가 가리키던 python.exe 가 사라진다.

사용 (관리자 PowerShell):
  .\install-mcp.ps1 -AppPath 'C:\Server\MechanicalDesign'
  .\install-mcp.ps1 -AppPath 'C:\Server\MechanicalDesign' -LocalOnly  # 이 서버 안에서만
  .\install-mcp.ps1 -AppPath 'C:\Server\MechanicalDesign' -Uninstall
#>

param(
    [Parameter(Mandatory = $true)][string]$AppPath,
    [string]$ServiceName = 'MechanicalDesignMCP',
    [int]$Port = 3010,
    [int]$AppPort = 5176,
    # **기본은 모든 주소에서 받는다.**
    #
    # 전에는 루프백만 열고 -BindAll 을 명시하게 했는데, 그러면 등록 명령을
    # 복사해 간 사람이 연결이 안 되는 이유를 한참 찾는다 — 주소도 맞고
    # 서버도 떠 있는데 닿지를 않는다.
    #
    # 열어 두어도 되는 이유는 이 서버가 **자기 자격 증명을 갖지 않기**
    # 때문이다. 들어온 토큰을 백엔드에 넘길 뿐이고, 토큰이 없거나 틀리면
    # 백엔드가 401 로 막는다. 앱 백엔드도 이미 같은 조건으로 열려 있다.
    [switch]$LocalOnly,
    # SSE 를 버퍼링하는 프록시·보안장비가 끼면 "붙는데 응답이 없다" 로 실패한다.
    # 그때 단발 JSON 으로 바꿔 통과시킨다.
    [switch]$JsonResponse,
    [string]$PythonVersion = '3.13',
    [string]$PackagesDir,
    [string]$NssmPath,
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

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
$mcpDir = Join-Path $AppPath 'mcp_server'
$venvDir = Join-Path ($AppPath + '_venvs') 'mcp'
$venvPython = Join-Path $venvDir 'Scripts\python.exe'
$serverScript = Join-Path $mcpDir 'server.py'

# --- nssm 확보 ----------------------------------------------------------------
# 백엔드 서비스와 같은 nssm.exe 를 쓴다(<AppPath>_data\nssm.exe). 앱 폴더 안에
# 두면 배포가 지워 버린다.
function Resolve-Nssm {
    if ($NssmPath -and (Test-Path $NssmPath)) { return $NssmPath }
    $local = Join-Path $dataPath 'nssm.exe'
    if (Test-Path $local) { return $local }
    if (Get-Command nssm -ErrorAction SilentlyContinue) { return (Get-Command nssm).Source }
    return $null
}

$nssm = Resolve-Nssm
if (-not $nssm) {
    throw @"
nssm.exe 를 찾지 못했습니다.

백엔드 서비스를 먼저 등록하면(install-service.ps1) nssm 이 '$dataPath\nssm.exe'
에 준비됩니다. 또는 -NssmPath 로 경로를 지정하세요.
"@
}
Write-Log "nssm: $nssm"

# --- 제거 ---------------------------------------------------------------------
if ($Uninstall) {
    Write-Log "서비스 제거: $ServiceName"
    & $nssm stop $ServiceName confirm 2>$null
    & $nssm remove $ServiceName confirm
    Write-Host ''
    Write-Host 'MCP 서비스를 제거했습니다. 앱은 그대로 돕니다.' -ForegroundColor Green
    Write-Host "가상환경은 남아 있습니다: $venvDir"
    Write-Host '완전히 지우려면 그 폴더를 삭제하세요.'
    return
}

# --- 사전 검증 ----------------------------------------------------------------
if (-not (Test-Path $serverScript)) {
    throw "mcp_server\server.py 가 없습니다: $serverScript — 배포 패키지에 mcp_server 가 담겼는지 확인하세요."
}

$requirements = Join-Path $mcpDir 'requirements.txt'
if (-not (Test-Path $requirements)) { throw "requirements.txt 가 없습니다: $requirements" }

# 포트가 실제로 비었는지 **바인딩해서** 본다. 연결 테이블은 이미 죽은 프로세스를
# 소유자로 가리키는 유령 항목을 그대로 보여 준다.
$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($null -eq $existingService) {
    try {
        $probe = New-Object System.Net.Sockets.TcpListener ([System.Net.IPAddress]::Any, $Port)
        $probe.Start()
        $probe.Stop()
    } catch {
        throw "포트 $Port 를 쓸 수 없습니다. -Port 로 다른 포트를 지정하거나 쓰고 있는 프로세스를 멈추세요."
    }
}

# --- 가상환경 ------------------------------------------------------------------
$systemPython = $null
try {
    $resolved = & py "-$PythonVersion" -c "import sys; print(sys.executable)" 2>$null
    if ($LASTEXITCODE -eq 0 -and $resolved) { $systemPython = $resolved.Trim() }
} catch { }
if (-not $systemPython) {
    if (Get-Command python -ErrorAction SilentlyContinue) {
        $systemPython = (Get-Command python).Source
    }
}
if (-not $systemPython) { throw "Python $PythonVersion 을 찾지 못했습니다." }

if (-not (Test-Path $venvPython)) {
    Write-Log "가상환경 생성: $venvDir"
    & $systemPython -m venv $venvDir
    if ($LASTEXITCODE -ne 0) { throw "venv 생성 실패 (exit $LASTEXITCODE)" }
}

Write-Log '의존성 설치'
& $venvPython -m pip install --upgrade pip --quiet
if ($PackagesDir) {
    & $venvPython -m pip install --no-index --find-links $PackagesDir -r $requirements
} else {
    & $venvPython -m pip install -r $requirements
}
if ($LASTEXITCODE -ne 0) {
    throw @"
의존성 설치에 실패했습니다 (exit $LASTEXITCODE).

인터넷이 안 되는 서버라면, 인터넷이 되는 PC 에서
    pip wheel -r requirements.txt -w mcp_packages
로 wheel 을 모아 반입한 뒤 -PackagesDir 로 그 폴더를 지정하세요.
"@
}

# 설치가 됐다고 서버가 뜨는 것은 아니다. import 까지 확인한다 — 여기서 걸리면
# 서비스가 뜨자마자 죽는 것보다 원인이 훨씬 분명하다.
Write-Log '기동 점검 (import)'
& $venvPython -c "import sys; sys.path.insert(0, r'$mcpDir'); import server; print('tools ok')"
if ($LASTEXITCODE -ne 0) { throw 'server.py 를 불러오지 못했습니다. 위 오류를 보세요.' }

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# --- 서비스 등록 ----------------------------------------------------------------
if ($null -ne $existingService) {
    Write-Log '기존 서비스 발견 → 제거 후 재등록'
    & $nssm stop $ServiceName confirm 2>$null
    & $nssm remove $ServiceName confirm
    Start-Sleep -Seconds 1
}

$bindHost = if ($LocalOnly) { '127.0.0.1' } else { '0.0.0.0' }

Write-Log "서비스 등록: $ServiceName (bind $bindHost`:$Port)"
& $nssm install $ServiceName $venvPython $serverScript
if ($LASTEXITCODE -ne 0) { throw "nssm install 실패 (exit $LASTEXITCODE)" }

& $nssm set $ServiceName AppDirectory $mcpDir
& $nssm set $ServiceName DisplayName 'Mechanical Design MCP'
& $nssm set $ServiceName Description 'MCP server letting external AI read and build calculation cards'
& $nssm set $ServiceName Start SERVICE_AUTO_START

# 백엔드는 같은 서버의 루프백으로 부른다. MCP 가 밖으로 열려 있어도 백엔드를
# 다시 밖으로 낼 이유는 없다.
$envLines = @(
    "MD_API_BASE=http://127.0.0.1:$AppPort",
    "MCP_HOST=$bindHost",
    "MCP_PORT=$Port"
)
if ($JsonResponse) { $envLines += 'MCP_JSON_RESPONSE=1' }
& $nssm set $ServiceName AppEnvironmentExtra ($envLines -join ' ')

& $nssm set $ServiceName AppStdout (Join-Path $logDir 'mcp-stdout.log')
& $nssm set $ServiceName AppStderr (Join-Path $logDir 'mcp-stderr.log')
& $nssm set $ServiceName AppRotateFiles 1
& $nssm set $ServiceName AppRotateBytes 10485760

# --- 방화벽 --------------------------------------------------------------------
# 0.0.0.0 으로 열어 두고 방화벽을 안 열면 반쪽이다 — 바인딩은 됐는데 아무도
# 닿지 못하는 상태라, 화면에 나온 주소를 복사해 간 사람이 원인을 못 찾는다.
# 백엔드 설치(install.ps1)도 같은 방식으로 연다.
if (-not $LocalOnly) {
    $ruleName = "MechanicalDesignMCP $Port"
    if (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue) {
        Write-Log "방화벽 규칙이 이미 있습니다: $ruleName"
    } else {
        # -ErrorAction Stop 이 필요하다. CIM 계열 cmdlet 은 5.1 에서
        # $ErrorActionPreference='Stop' 을 따르지 않고 비종료 오류를 내는 경우가
        # 있어, 그대로 두면 실패했는데도 아래 성공 로그가 찍힌다.
        try {
            New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow `
                -Protocol TCP -LocalPort $Port -ErrorAction Stop | Out-Null
            Write-Log "방화벽 열기: TCP $Port"
        } catch {
            Write-Warning '방화벽 규칙을 만들지 못했습니다. 관리자 PowerShell 에서 다음을 실행하세요:'
            Write-Warning "  New-NetFirewallRule -DisplayName '$ruleName' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port"
        }
    }
}

Write-Log '서비스 시작'
& $nssm start $ServiceName
Start-Sleep -Seconds 3

$svc = Get-Service -Name $ServiceName
Write-Host "서비스 상태: $($svc.Status)"
if ($svc.Status -ne 'Running') {
    Write-Host 'MCP 서비스가 Running 상태가 아닙니다.' -ForegroundColor Red
    Write-Host "로그: $logDir\mcp-stderr.log" -ForegroundColor Yellow
    throw 'MCP 서비스 시작 실패'
}

Write-Host ''
Write-Host 'MCP 서버 등록 완료.' -ForegroundColor Green
Write-Host ''
Write-Host '사람이 할 일이 하나 남았습니다 — 토큰 발급:'
Write-Host "  1. 웹에 로그인 → 상단 '토큰' → 새 토큰 만들기"
Write-Host '  2. 원문은 그 자리에서 한 번만 보입니다. 바로 복사하세요'
Write-Host '  3. 각자 자기 PC 에서 아래를 실행합니다'
Write-Host ''
Write-Host "     claude mcp add --transport http mechanicaldesign http://<서버주소>:$Port/mcp ``" -ForegroundColor DarkGray
Write-Host '       --header "Authorization: Bearer mdt_..."' -ForegroundColor DarkGray
Write-Host ''
if ($LocalOnly) {
    Write-Host '지금은 이 서버 안에서만 붙을 수 있습니다(127.0.0.1).' -ForegroundColor Yellow
    Write-Host '다른 PC 에서 붙게 하려면 -LocalOnly 없이 다시 실행하세요.' -ForegroundColor Yellow
    Write-Host ''
} else {
    Write-Host "밖의 PC 에서 http://<서버주소>:$Port/mcp 로 붙을 수 있습니다."
    Write-Host '  토큰이 없거나 틀리면 백엔드가 막습니다 — 열려 있다고 아무나 쓰는 것은 아닙니다.'
    Write-Host ''
}
Write-Host '관리:'
Write-Host "  Get-Service     $ServiceName"
Write-Host "  Restart-Service $ServiceName"
Write-Host "  로그: $logDir\mcp-stderr.log"
Write-Host ''
Write-Host '제거 (앱에는 영향 없음):'
Write-Host "  .\install-mcp.ps1 -AppPath '$AppPath' -Uninstall"
Write-Host ''
