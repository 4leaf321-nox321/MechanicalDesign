Param(
    [switch]$Setup,
    [string]$PackagesDir,
    [string]$PythonExe
)
<#
배포된 MCP 서버의 콘솔 기동 스크립트.

    cd <AppPath>
    .\run_mcp_server.ps1

서비스로 등록했다면(install-mcp.ps1) 이걸 쓸 일이 없다 — Get-Service /
Restart-Service 로 다룬다. 서비스가 뜨지 않을 때 오류를 눈으로 보려고 쓰는 쪽이
많다. 그때는 서비스를 먼저 멈춰야 한다. 같은 포트를 둘이 잡을 수 없다.

**앱 백엔드와는 다른 프로세스·다른 가상환경·다른 포트다.** mcp 패키지가 끌고
오는 starlette/pydantic 이 백엔드의 Flask 의존성과 부딪히기 때문이다. 그래서
run_server.ps1 을 돌려도 이건 안 뜬다. 대신 이쪽이 죽어도 앱은 멀쩡하다.

**-Setup 이 있는 이유**: 가상환경을 만드는 것은 install-mcp.ps1 의 일인데, 그
스크립트는 서비스를 등록하므로 **관리자 권한을 요구한다.** 서비스 없이 손으로만
띄워 보려는 사람이 그 문턱에 걸린다 — venv 생성도 pip 도 관리자가 필요 없는
일인데도. -Setup 은 그 부분만 떼어 관리자 없이 돌린다.

    .\run_mcp_server.ps1 -Setup                      # 가상환경 만들고 바로 기동
    .\run_mcp_server.ps1 -Setup -PackagesDir C:\wheels  # 폐쇄망

환경 변수 (없으면 아래 기본값):
    MD_API_BASE   백엔드 API 주소   기본 http://127.0.0.1:<backend\.env 의 FLASK_PORT>
    MCP_HOST      바인딩 주소       기본 0.0.0.0 (server.py 의 기본값과 같다)
    MCP_PORT      바인딩 포트       기본 backend\.env 의 MCP_PORT, 없으면 3010
#>

$ErrorActionPreference = 'Stop'

function Get-KeyValue([string[]]$lines, [string]$key) {
    <#
    설정 파일(.env)에서 값 하나를 읽는다. 없으면 빈 문자열.
    PowerShell 5.1 의 `$null -replace ...` 함정은 run_server.ps1 의 같은 함수
    주석 참조 — 없는 키에서만 터지는 종류라 그때까지 드러나지 않는다.
    #>
    $hit = @($lines | Where-Object { $_ -match "^\s*$key\s*=" }) | Select-Object -Last 1
    if ($null -eq $hit) { return '' }
    return ([string]$hit -replace "^\s*$key\s*=", '').Trim()
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$mcpDir = Join-Path $scriptDir 'mcp_server'
$serverScript = Join-Path $mcpDir 'server.py'

if (-not (Test-Path $serverScript)) {
    Write-Error "mcp_server\server.py 를 찾을 수 없습니다: $serverScript — 패키지 루트에서 실행하고 있는지 확인하세요."
    exit 1
}

# install-mcp.ps1 과 **같은 자리**여야 한다. 다르면 서비스로 돌 때와 손으로 돌 때
# 서로 다른 가상환경을 보게 되고, "손으로는 되는데 서비스로는 안 되는" 형태로
# 나타나 원인을 찾기 어렵다.
$venvDir = Join-Path ($scriptDir + '_venvs') 'mcp'
$venvPython = Join-Path $venvDir 'Scripts\python.exe'

# --- 가상환경 ------------------------------------------------------------------
if ($Setup) {
    $systemPython = if ($PythonExe) { $PythonExe } else { 'python' }
    if (-not (Test-Path $venvPython)) {
        Write-Host "가상환경 생성: $venvDir"
        & $systemPython -m venv $venvDir
        if (-not (Test-Path $venvPython)) { Write-Error "가상환경을 만들지 못했습니다: $venvDir"; exit 1 }
    }
    $requirements = Join-Path $mcpDir 'requirements.txt'
    Write-Host '의존성 설치'
    & $venvPython -m pip install --upgrade pip --quiet
    if ($PackagesDir) {
        & $venvPython -m pip install --no-index --find-links $PackagesDir -r $requirements
    } else {
        & $venvPython -m pip install -r $requirements
    }
    if ($LASTEXITCODE -ne 0) { Write-Error '의존성 설치에 실패했습니다.'; exit 1 }
}

if (-not (Test-Path $venvPython)) {
    Write-Error @"
MCP 가상환경이 없습니다: $venvPython

  관리자 권한 없이 손으로 띄우려면 :  .\run_mcp_server.ps1 -Setup
  서비스로 등록하려면(관리자)       :  .\install-mcp.ps1 -AppPath '$scriptDir'
"@
    exit 1
}

$actual = & $venvPython -c "import sys; print('{}.{}'.format(sys.version_info[0], sys.version_info[1]))" 2>$null
Write-Host "사용 인터프리터: $venvPython (Python $actual)"

# --- 기본값은 backend\.env 에서 가져온다 ------------------------------------------
# 여기에 숫자를 박아 두면 포트를 바꾼 설치에서 조용히 어긋난다. MCP 는 그래도
# 멀쩡히 뜨고 **모든 도구만 연결 실패로 끝나서**, 원인이 포트라는 것을 알기까지
# 한참 걸린다.
$envFile = Join-Path $scriptDir 'backend\.env'
$backendPort = '5176'
$mcpPort = '3010'
if (Test-Path $envFile) {
    $lines = Get-Content $envFile
    $v = Get-KeyValue $lines 'FLASK_PORT'; if ($v) { $backendPort = $v }
    $v = Get-KeyValue $lines 'MCP_PORT';   if ($v) { $mcpPort = $v }
} else {
    Write-Warning "backend\.env 가 없어 기본 포트를 씁니다 (백엔드 $backendPort, MCP $mcpPort)."
}

if (-not $env:MD_API_BASE) { $env:MD_API_BASE = "http://127.0.0.1:$backendPort" }
if (-not $env:MCP_HOST)    { $env:MCP_HOST = '0.0.0.0' }
if (-not $env:MCP_PORT)    { $env:MCP_PORT = $mcpPort }

Write-Host "백엔드     : $env:MD_API_BASE"
Write-Host "바인딩     : $($env:MCP_HOST):$($env:MCP_PORT)"

if ($env:MCP_HOST -eq '0.0.0.0') {
    # **바인딩 주소는 남이 쓸 주소가 아니다.** 그리고 이 기계에서 localhost 로
    # 확인해 보는 것은 아무것도 증명하지 못한다 — 바인딩이 무엇이든 답한다.
    # 그래서 남이 실제로 칠 수 있는 주소를 찾아 찍어 준다.
    $ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
        Select-Object -First 1).IPAddress
    if ($ip) { Write-Host "붙는 주소  : http://${ip}:$($env:MCP_PORT)/mcp  (다른 PC 에서 확인하세요)" }
    Write-Host "방화벽에 인바운드 TCP $($env:MCP_PORT) 가 열려 있어야 합니다."
} else {
    Write-Warning "MCP_HOST 가 $env:MCP_HOST 입니다 — 이 기계에서만 붙을 수 있습니다."
}

# validate_card 의 시험 계산은 화면과 같은 자바스크립트 계산기를 node 로 돌린다.
# 없으면 검증이 정적 검사까지만 하고 그 사실이 응답의 trial_skipped 에 남는데,
# 그 값을 보지 않으면 **통과한 것으로 읽힌다.**
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Warning 'node 를 찾지 못했습니다 — validate_card 가 시험 계산 없이 정적 검사만 합니다.'
}

Write-Host ''
Push-Location $mcpDir
try {
    & $venvPython server.py
} finally {
    Pop-Location
}
