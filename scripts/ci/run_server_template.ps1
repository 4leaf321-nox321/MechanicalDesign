Param()
<#
배포된 백엔드의 콘솔 기동 스크립트.

    cd <AppPath>
    .\run_server.ps1

서비스로 등록했다면 이걸 쓸 일이 없다(Get-Service / Restart-Service 로 다룬다).
서비스가 뜨지 않을 때 오류를 눈으로 보려고 쓰는 쪽이 많다 — 그때는 서비스를
먼저 멈춰야 한다. 같은 포트를 둘이 잡을 수 없다.

의존성은 deploy.ps1(또는 venv_sync.ps1)이 앱 폴더 옆에 만든 가상환경
(<AppPath>_venvs\backend)에서 온다. PYTHONPATH 가 아니라 venv 를 쓰는 이유는
인터프리터의 site-packages 가 섞여 들어오지 않게 하기 위해서다.

FLASK_ENV=production 이면 run.py 가 waitress 로, development 면 Flask 개발
서버로 뜬다. 운영 .env 는 production 이다.
#>

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

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvPython = Join-Path ($scriptDir + '_venvs') 'backend\Scripts\python.exe'

if (-not (Test-Path $venvPython)) {
    Write-Error "가상환경이 없습니다: $venvPython — venv_sync.ps1 -AppPath '$scriptDir' 를 먼저 실행하세요."
    exit 1
}

$actual = & $venvPython -c "import sys; print('{}.{}'.format(sys.version_info[0], sys.version_info[1]))" 2>$null
Write-Host "사용 인터프리터: $venvPython (Python $actual)"

$buildInfo = Join-Path $scriptDir 'BUILD_INFO.txt'
if (Test-Path $buildInfo) {
    $lines = Get-Content $buildInfo
    $buildPython = Get-KeyValue $lines 'python'
    $version = Get-KeyValue $lines 'version'
    if ($version) { Write-Host "버전: $version" }
    if ($buildPython -and $actual -and $actual -ne $buildPython) {
        Write-Warning "wheel 은 Python $buildPython 로 만들었는데 이 가상환경은 $actual 입니다."
    }
}

$backend = Join-Path $scriptDir 'backend'
if (-not (Test-Path (Join-Path $backend 'run.py'))) {
    Write-Error 'backend\run.py 를 찾을 수 없습니다. 패키지가 불완전합니다.'
    exit 1
}
if (-not (Test-Path (Join-Path $backend '.env'))) {
    Write-Error 'backend\.env 가 없습니다. install.ps1 로 만들거나 이전 설치에서 복사하세요.'
    exit 1
}
if (-not (Test-Path (Join-Path $scriptDir 'frontend\dist\index.html'))) {
    Write-Warning 'frontend\dist\index.html 이 없습니다 — API 는 뜨지만 화면은 404 가 납니다.'
}

Push-Location $backend
try {
    & $venvPython run.py
} finally {
    Pop-Location
}
