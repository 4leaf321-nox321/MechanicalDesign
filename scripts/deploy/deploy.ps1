<#
릴리스를 고정 폴더에 배포한다.

    <AppPath>                항상 여기서 실행한다
    <AppPath>_prev           직전 버전 (롤백용)
    <AppPath>_venvs\backend  가상환경 — requirements 가 바뀔 때만 다시 만든다
    <AppPath>_data\uploads   업로드 이미지 — 배포가 건드리지 않는다
    <AppPath>_data\logs      서비스 로그

의존성은 패키지에 동봉된 wheel 번들에서 설치하므로(`pip install --no-index`)
배포가 네트워크에 의존하지 않는다. 사내망에서 pip 이 불안정해도 멈추지 않는다.

**전 방식(update.ps1)과의 차이.** 그쪽은 서버에서 git pull → pip → 마이그레이션
→ npm ci → npm run build 를 차례로 돌렸다. 중간 어디서 깨져도 되돌릴 방법이
없었고(코드는 이미 새것, venv 는 반쯤 갱신), 서버에 git·Node·인터넷이 모두
있어야 했다. 여기서는 검사를 모두 통과한 다음에야 폴더를 원자적으로 바꾼다 —
검사 단계에서 실패하면 운영 폴더는 손대지 않은 상태 그대로다.

서비스가 등록돼 있으면 교체 전에 멈추고 끝나면 다시 켠다 — 윈도우는 실행 중인
파일을 잠근다.

사용:
  .\deploy.ps1 -AppPath 'C:\Server\MechanicalDesign'
  .\deploy.ps1 -AppPath 'C:\Server\MechanicalDesign' -Tag v0.2.0
  .\deploy.ps1 -AppPath 'C:\Server\MechanicalDesign' -ZipPath 'C:\tmp\deploy_package.zip'
  .\deploy.ps1 -AppPath 'C:\Server\MechanicalDesign' -SkipMigrations
#>

param(
    [Parameter(Mandatory = $true)][string]$AppPath,
    [string]$Repo = '4leaf321-nox321/MechanicalDesign',
    [string]$Tag,
    [string]$ZipPath,
    [string]$PythonExe,
    [string]$ServiceName = 'MechanicalDesign',
    [switch]$SkipMigrations,
    [switch]$NoRestart
)

$ErrorActionPreference = 'Stop'

<#
매개변수를 값으로 받아 버리는 것을 막는다 — **대시는 하나다.**

`--AppPath 'C:\Server\MechanicalDesign'` 으로 쓰면 PowerShell 은 오류를 내지
않는다. '--AppPath' 라는 문자열이 첫 위치 매개변수에 들어가고, 뒤따르는 진짜
경로는 그 다음 위치 매개변수로 **밀려 들어간다.** 여기서는 그것이 -Repo 라서
`gh release download --repo C:\Server\MechanicalDesign` 이 실행되고, 사람은
"gh 가 안 된다" 를 보게 된다. 값이 잘못 들어갔다는 신호가 어디에도 없다.

값이 대시로 시작하면 그건 경로도 저장소도 아니다. 그 자리에서 멈춘다.
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

# -Repo 는 'owner/name' 이다. 경로가 여기 들어와 있으면 위의 밀림이 일어난 것이다.
if ($Repo -and $Repo -notmatch '^[^/\:]+/[^/\:]+$') {
    throw "-Repo 는 'owner/name' 형식입니다. 지금 값: '$Repo' — -AppPath 에 쓰려던 경로가 여기로 밀려 들어오지 않았는지 확인하세요."
}
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

<#
네이티브 명령 실행 — stderr 를 오류로 착각하지 않는다.

Windows PowerShell 5.1 은 $ErrorActionPreference='Stop' 상태에서 네이티브 명령이
stderr 에 한 줄만 써도 그것을 종료성 오류로 바꾼다. alembic 은 INFO 로그를
stderr 로 내보내므로(flask db upgrade 가 그렇다) 정상 배포가 실패로 뒤집힌다.
성공 여부는 종료 코드로만 판정한다.
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

# 8.3 단축경로(C:\Users\계정~1\...)를 원래 경로로 되돌린다. 계정명이 한글이면
# 경로가 단축형으로 잡히는 일이 있는데, 그대로 넘기면 문자열을 다루는 중간
# 도구에서 어긋난다. .NET GetFullPath 도 풀어주지 않으므로 Win32 를 직접 부른다.
Add-Type -MemberDefinition @'
[DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
public static extern uint GetLongPathName(string lpszShortPath,
                                          System.Text.StringBuilder lpszLongPath,
                                          uint cchBuffer);
'@ -Name NativePath -Namespace MdzDeploy -ErrorAction SilentlyContinue

function Resolve-LongPath([string]$path) {
    if (-not $path) { return $path }
    try {
        $buffer = New-Object System.Text.StringBuilder 32768
        $length = [MdzDeploy.NativePath]::GetLongPathName($path, $buffer, $buffer.Capacity)
        if ($length -gt 0 -and $length -lt $buffer.Capacity) { return $buffer.ToString() }
    } catch { }
    return $path
}

$AppPath = Resolve-LongPath $AppPath
if ($ZipPath) { $ZipPath = Resolve-LongPath $ZipPath }
if ($AppPath -like '*~*') {
    Write-Warning "경로에 단축형이 남아 있습니다: $AppPath — 긴 경로로 다시 지정하는 것이 안전합니다."
}

$prevPath = $AppPath + '_prev'
$stagingPath = $AppPath + '_staging'
$dataPath = $AppPath + '_data'
$isFirstRun = -not (Test-Path $AppPath)

if ($isFirstRun) { Write-Log "$AppPath 에 기존 설치가 없습니다 — 첫 배포로 처리합니다." }

# --- 서비스 중지 --------------------------------------------------------------
# 켜져 있던 것만 다시 켠다. 원래 꺼져 있던 서비스를 배포가 마음대로 켜면,
# 일부러 내려 둔 서버가 배포 후에 살아나는 일이 생긴다.
$serviceWasRunning = $false
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($null -ne $svc) {
    if ($svc.Status -eq 'Running') {
        Write-Log "서비스 '$ServiceName' 중지"
        Stop-Service -Name $ServiceName -Force
        # Stop-Service 는 SCM 이 STOPPED 로 표시하면 돌아오지만 프로세스가 아직
        # 파일 핸들을 놓지 않은 순간이 있다. 그 상태에서 폴더를 옮기면 실패한다.
        $deadline = (Get-Date).AddSeconds(30)
        while ((Get-Date) -lt $deadline) {
            if ((Get-Service -Name $ServiceName).Status -eq 'Stopped') { break }
            Start-Sleep -Milliseconds 300
        }
        Start-Sleep -Milliseconds 700
        $serviceWasRunning = $true
    } else {
        Write-Log "서비스 '$ServiceName' 는 이미 멈춰 있습니다 ($($svc.Status))."
    }
} else {
    Write-Log "서비스 '$ServiceName' 가 등록돼 있지 않습니다 — 콘솔 실행으로 간주합니다."
}

# 폴더가 잠겨 있으면 시작 전에 멈춘다.
#
# **루트에 파일을 써 보는 것으로는 부족하다.** run_server.ps1 이 작업 디렉터리를
# <AppPath>\backend 로 옮기므로, 그 프로세스(또는 거기 머문 셸)가 살아 있으면
# 루트 쓰기는 성공하는데 폴더 이동은 실패한다. 게다가 Move-Item 은 그 상황에서
# **부분 이동**을 해버려 _prev 에는 복사본이 생기고 운영 폴더는 반쯤 지워진
# 상태로 남는다.
#
# 그래서 실제로 할 연산(이름 바꾸기)을 그대로 시험한다. 성공하면 되돌린다.
function Test-FolderMovable([string]$path) {
    $probe = $path + '_lockprobe'
    try {
        [System.IO.Directory]::Move($path, $probe)
        [System.IO.Directory]::Move($probe, $path)
        return $true
    } catch {
        if (Test-Path $probe) { [System.IO.Directory]::Move($probe, $path) }
        return $false
    }
}

# 무엇이 잡고 있는지 **이름을 대 준다.**
#
# 사람이 눈으로 찾을 수 있는 것 — 탐색기, 터미널 — 은 대개 이미 닫은 뒤다.
# 남는 것은 보이지 않는 것들이다: 배포를 돌리는 셸 자신, 창 없이 살아남은
# python.exe, 서비스로 등록된 실행 파일. 목록을 못 주면 사람에게 남는 선택지는
# 재부팅뿐이다.
#
# 경로 비교에 -like 를 쓰지 않는다. 경로에 '[' 가 들어 있으면 와일드카드로 읽혀
# 아무것도 안 걸린다. StartsWith 로 문자 그대로 본다.
function Get-FolderHolders([string]$path) {
    $found = New-Object System.Collections.ArrayList
    $cmp = [System.StringComparison]::OrdinalIgnoreCase

    $here = (Get-Location).Path
    if ($here.StartsWith($path, $cmp)) {
        [void]$found.Add("이 창의 현재 위치가 그 폴더 안입니다: $here")
    }

    # (1) 그 폴더 안의 실행 파일로 도는 프로세스.
    $seen = @{}
    foreach ($proc in Get-Process -ErrorAction SilentlyContinue) {
        $exe = $null
        try { $exe = $proc.Path } catch { }   # 권한 없는 프로세스는 조용히 넘긴다
        if ($exe -and $exe.StartsWith($path, $cmp)) {
            $seen[$proc.Id] = $true
            [void]$found.Add("프로세스 $($proc.Id) $($proc.ProcessName) — $exe")
        }
    }

    # (2) 명령줄에 그 경로가 있는 프로세스. venv 가 앱 폴더 바깥에 있으므로
    #     python.exe 는 (1) 이 아니라 여기 걸린다.
    try {
        foreach ($proc in Get-CimInstance Win32_Process -ErrorAction Stop) {
            if ($seen[[int]$proc.ProcessId]) { continue }
            $line = $proc.CommandLine
            if ($line -and $line.IndexOf($path, $cmp) -ge 0) {
                if ($line.Length -gt 120) { $line = $line.Substring(0, 120) + '…' }
                [void]$found.Add("프로세스 $($proc.ProcessId) $($proc.Name) — $line")
            }
        }
    } catch { }

    # (3) 서비스로 등록돼 있으면 죽여도 되살아난다. 먼저 멈춰야 한다.
    try {
        foreach ($service in Get-CimInstance Win32_Service -ErrorAction Stop) {
            if ($service.PathName -and $service.PathName.IndexOf($path, $cmp) -ge 0) {
                [void]$found.Add("서비스 '$($service.Name)' ($($service.State)) — Stop-Service '$($service.Name)' 로 먼저 멈추세요")
            }
        }
    } catch { }

    return $found
}

if (-not $isFirstRun) {
    if (-not (Test-FolderMovable $AppPath)) {
        $holders = Get-FolderHolders $AppPath
        $detail = if ($holders.Count -gt 0) {
            "잡고 있는 것으로 보이는 것:`n" + (($holders | ForEach-Object { "  · $_" }) -join "`n")
        } else {
            @"
프로세스 목록에서는 찾지 못했습니다. 남은 후보:
  · 탐색기 창(미리 보기 창 포함) — 다른 폴더로 옮기거나 닫으세요.
  · 백신 검사나 인덱싱이 그 폴더를 훑는 중.
  · 열려 있는 파일 핸들 — 리소스 모니터 > CPU > 연결된 핸들 에서
    '$(Split-Path -Leaf $AppPath)' 로 검색하면 보입니다.
확실한 방법은 서버 재시작입니다. 배포 중에는 어차피 앱이 멈춥니다.
"@
        }
        throw @"
$AppPath 를 옮길 수 없습니다 — 무언가 이 폴더를 잡고 있습니다.

$detail

  · 실행 중인 앱을 중지하세요 (서비스면 Stop-Service '$ServiceName').
  · 그 폴더나 하위 폴더에 들어가 있는 탐색기·터미널 창을 닫으세요.
    (특히 <AppPath>\backend 에 머문 셸이 흔한 원인입니다)

이 서버는 아무것도 바뀌지 않았습니다.
"@
    }
}

# --- 릴리스 zip 확보 ----------------------------------------------------------
# %TEMP% 를 일부러 쓰지 않는다. 윈도우 계정명이 비ASCII 면 %TEMP% 가 8.3 단축
# 경로로 잡히고, 문자열을 그대로 넘기는 도구에서 풀리지 않는 경로가 된다.
# 앱 폴더 옆에 펼친다 — 그 경로는 배포를 실행하는 사람이 정했고 쓰기 권한도 이미
# 확인된 자리다.
$tempZipDir = $null
if (-not $ZipPath) {
    if (-not $Repo) {
        throw '-ZipPath 또는 -Repo 중 하나가 필요합니다. 폐쇄망이라면 zip 을 반입하고 -ZipPath 를 쓰세요.'
    }
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        throw "gh CLI 가 없습니다. 설치 후 'gh auth login' 하거나(비공개 저장소), -ZipPath 를 쓰세요."
    }
    $tempZipDir = $AppPath + '_download'
    if (Test-Path $tempZipDir) { Remove-Item -Recurse -Force $tempZipDir }
    New-Item -ItemType Directory -Force -Path $tempZipDir | Out-Null
    $ghArgs = @('release', 'download')
    if ($Tag) { $ghArgs += $Tag }
    $ghArgs += @('--repo', $Repo, '--pattern', 'deploy_package.zip', '--dir', $tempZipDir)
    Write-Log '릴리스 자산 다운로드'
    & gh @ghArgs
    if ($LASTEXITCODE -ne 0) {
        throw @"
gh release download 실패 (exit $LASTEXITCODE). 위에 찍힌 gh 오류가 이유입니다.

  · 인증 확인:  gh auth status
    비공개 저장소라 로그인이 없으면 받을 수 없습니다 — 'gh auth login' 하세요.
    운영 서버는 개발 PC 와 다른 계정으로 도는 일이 많아 인증이 따라오지 않습니다.
  · 태그 확인:  gh release list --repo $Repo
  · 폐쇄망이거나 인증을 서버에 두고 싶지 않다면, 다른 PC 에서 zip 을 받아
    옮기고 -ZipPath 로 지정하세요:

      gh release download $(if ($Tag) { $Tag } else { '<태그>' }) --repo $Repo ``
        --pattern deploy_package.zip --dir .
      .\deploy.ps1 -AppPath '$AppPath' -ZipPath '<옮긴 경로>\deploy_package.zip'

이 서버는 아무것도 바뀌지 않았습니다.
"@
    }
    $ZipPath = Join-Path $tempZipDir 'deploy_package.zip'
}
if (-not (Test-Path $ZipPath)) { throw "zip 을 찾을 수 없습니다: $ZipPath" }

# --- staging 에 펼치고 검사한다. 여기까지는 운영 폴더를 건드리지 않는다 ---------
if (Test-Path $stagingPath) { Remove-Item -Recurse -Force $stagingPath }
Write-Log "펼치기: $stagingPath"
Expand-Archive -Path $ZipPath -DestinationPath $stagingPath -Force
if ($tempZipDir) { Remove-Item -Recurse -Force $tempZipDir }

function Abort-Staging([string]$message) {
    Remove-Item -Recurse -Force $stagingPath -ErrorAction SilentlyContinue
    throw $message
}

$req = Join-Path $stagingPath 'backend\requirements.txt'
if (-not (Test-Path $req)) { Abort-Staging '패키지에 backend\requirements.txt 가 없습니다.' }
$wheels = Get-ChildItem -Path (Join-Path $stagingPath 'backend\packages') -Filter '*.whl' -ErrorAction SilentlyContinue
if (-not $wheels) { Abort-Staging '패키지에 wheel 번들이 없습니다. 운영 폴더는 그대로입니다.' }
Write-Log "wheel 번들: $($wheels.Count) 개"

# 백엔드가 frontend\dist 에서 SPA 를 서빙한다. 없으면 모든 페이지가 API 의 JSON
# 404 를 돌려주는데, 그러면 라우팅 버그처럼 보여 원인을 엉뚱한 데서 찾게 된다.
if (-not (Test-Path (Join-Path $stagingPath 'frontend\dist\index.html'))) {
    Abort-Staging '패키지에 frontend\dist\index.html 이 없습니다. 운영 폴더는 그대로입니다.'
}
Write-Log '프론트엔드 포함 확인'

# 동봉된 wheel 은 빌드한 파이썬의 ABI 태그를 달고 있어 마이너 버전이 다르면
# 설치 단계에서 실패한다. 운영 폴더가 아직 멀쩡할 때 여기서 잡는다.
$buildInfoPath = Join-Path $stagingPath 'BUILD_INFO.txt'
$buildPython = $null
if (Test-Path $buildInfoPath) {
    $buildPython = Get-KeyValue (Get-Content $buildInfoPath) 'python'
}

$interpreter = $null
if ($PythonExe) {
    $interpreter = $PythonExe
    Write-Log "-PythonExe 로 지정한 인터프리터: $interpreter"
} elseif ($buildPython) {
    # PATH 의 python 을 믿지 않는다. 서버에 새 파이썬이 앞에 있어도 앱은 다른
    # 버전으로 돌아야 할 수 있다.
    try {
        $resolved = & py "-$buildPython" -c "import sys; print(sys.executable)" 2>$null
        if ($LASTEXITCODE -eq 0 -and $resolved) {
            $interpreter = $resolved.Trim()
            Write-Log "py 런처로 찾은 Python ${buildPython}: $interpreter"
        }
    } catch { }
}
if (-not $interpreter) { $interpreter = 'python' }

try {
    $serverPython = & $interpreter -c "import sys; print('{}.{}'.format(sys.version_info[0], sys.version_info[1]))"
} catch {
    Abort-Staging "'$interpreter' 를 실행하지 못했습니다. Python 설치를 확인하거나 -PythonExe 를 주세요."
}
if ($LASTEXITCODE -ne 0) {
    Abort-Staging "'$interpreter' 를 실행하지 못했습니다. Python 설치를 확인하거나 -PythonExe 를 주세요."
}

if ($buildPython) {
    if ($buildPython -ne $serverPython) {
        Write-Host ''
        Write-Host "  사용한 인터프리터 : $interpreter"
        Write-Host "  그 버전           : $serverPython"
        Write-Host "  패키지 빌드 버전  : $buildPython"
        Write-Host ''
        Write-Host "  Python $buildPython 를 설치하거나, -PythonExe 로 올바른 python.exe 를 지정하거나,"
        Write-Host "  릴리스 워크플로의 python-version 을 '$serverPython' 로 맞춰 새 릴리스를 만드세요."
        Write-Host ''
        Abort-Staging 'Python 버전 불일치. 이 서버는 아무것도 바뀌지 않았습니다.'
    }
    Write-Log "Python 버전 일치 ($serverPython)"
} else {
    Write-Warning "패키지에 BUILD_INFO.txt 가 없습니다. Python $serverPython 로 진행합니다."
}

# --- 교체 --------------------------------------------------------------------
# Move-Item 이 아니라 [System.IO.Directory]::Move 를 쓴다. Move-Item 은 옮기지
# 못하는 항목이 있으면 복사+삭제로 흘러가 폴더를 반쯤 옮긴 상태로 남기지만,
# Directory.Move 는 원자적 이름 변경이라 실패하면 아무것도 바뀌지 않는다.
if (-not $isFirstRun) {
    if (Test-Path $prevPath) { Write-Log '이전 백업 삭제'; Remove-Item -Recurse -Force $prevPath }
    Write-Log "현재 설치를 $prevPath 로 이동"
    [System.IO.Directory]::Move($AppPath, $prevPath)
}
Write-Log "새 버전 배치: $AppPath"
[System.IO.Directory]::Move($stagingPath, $AppPath)

# --- 패키지에 없는 것 이어받기 -------------------------------------------------
# .env 는 접속 정보라 git 에도 패키지에도 없다.
if (-not $isFirstRun) {
    $envFrom = Join-Path $prevPath 'backend\.env'
    $envTo = Join-Path $AppPath 'backend\.env'
    if (Test-Path $envFrom) {
        Write-Log '.env 이어받기'
        Copy-Item -Force $envFrom $envTo
    } else {
        Write-Warning ".env 를 $envFrom 에서 찾지 못했습니다."
    }

    # 업로드는 <AppPath>_data\uploads 에 있어야 교체 대상이 아니게 된다. 예전
    # 배치(UPLOAD_DIR 미설정)에서 넘어오는 첫 배포라면 파일이 아직 앱 폴더 안에
    # 있고, 그대로 두면 _prev 를 지우는 다음 배포에서 **조용히 사라진다.**
    # 지우기 전에 밖으로 옮겨 둔다.
    $legacyUploads = Join-Path $prevPath 'backend\uploads'
    if (Test-Path $legacyUploads) {
        $legacyFiles = @(Get-ChildItem $legacyUploads -Recurse -File -ErrorAction SilentlyContinue)
        if ($legacyFiles.Count -gt 0) {
            $targetUploads = Join-Path $dataPath 'uploads'
            New-Item -ItemType Directory -Force -Path $targetUploads | Out-Null
            Write-Log "예전 위치의 업로드 $($legacyFiles.Count) 개를 $targetUploads 로 옮깁니다"
            # 이미 있는 파일은 덮지 않는다 — 바깥 폴더가 최신이다.
            Get-ChildItem $legacyUploads -Force | ForEach-Object {
                $dest = Join-Path $targetUploads $_.Name
                if (-not (Test-Path $dest)) { Copy-Item -Recurse -Force $_.FullName $dest }
            }
            Write-Warning "backend\.env 의 UPLOAD_DIR 이 '$targetUploads' 를 가리키는지 확인하세요."
        }
    }
}

if (-not (Test-Path (Join-Path $AppPath 'backend\.env'))) {
    Write-Warning 'backend\.env 가 없습니다. 마이그레이션과 기동에 DATABASE_URL 이 필요합니다.'
}

# --- 가상환경 -----------------------------------------------------------------
$syncScript = Join-Path $AppPath 'venv_sync.ps1'
if (-not (Test-Path $syncScript)) { throw "패키지에 venv_sync.ps1 이 없습니다 ($syncScript)." }
& $syncScript -AppPath $AppPath -PythonExe $interpreter
if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) { throw "가상환경 준비 실패 (exit $LASTEXITCODE)" }

$backendPython = Join-Path ($AppPath + '_venvs') 'backend\Scripts\python.exe'

# --- 마이그레이션 --------------------------------------------------------------
if ($SkipMigrations) {
    Write-Log '마이그레이션 건너뜀'
} else {
    Write-Log '마이그레이션 적용 (flask db upgrade)'
    Push-Location (Join-Path $AppPath 'backend')
    try {
        if (-not (Test-Path $backendPython)) { throw "가상환경을 찾을 수 없습니다: $backendPython" }
        # Flask-Migrate 는 앱 팩토리를 찾기 위해 FLASK_APP 이 필요하다.
        $env:FLASK_APP = 'run.py'
        Invoke-Native 'flask db upgrade 실패' { & $backendPython -m flask db upgrade }
        Write-Log '마이그레이션 완료'
    } catch {
        Pop-Location
        Write-Error "마이그레이션 실패: $_"
        Write-Host ''
        Write-Host '새 코드는 배치됐지만 데이터베이스가 일부만 적용됐을 수 있습니다.'
        Write-Host "파일만 되돌리려면:  .\rollback.ps1 -AppPath '$AppPath'"
        exit 10
    }
    Pop-Location
}

# **무엇이 깔렸는지 남긴다.** git pull 방식에서는 서버에서 커밋 해시를 조회해야
# 알 수 있었고 git 이 없으면 알 방법이 아예 없었다. 패키지가 자기 버전을 들고
# 오므로 여기서 읽어 적기만 하면 된다.
$installed = Get-Content (Join-Path $AppPath 'BUILD_INFO.txt') -ErrorAction SilentlyContinue |
    Where-Object { $_ -match '^version=' }
if ($installed) { Write-Log ("배포한 버전: " + ($installed -replace '^version=', '')) }

# --- 서비스 재시작 -------------------------------------------------------------
if ($serviceWasRunning -and -not $NoRestart) {
    Write-Log "서비스 '$ServiceName' 시작"
    Start-Service -Name $ServiceName
    Start-Sleep -Seconds 2
    $svc = Get-Service -Name $ServiceName
    Write-Host "  상태: $($svc.Status)"
    if ($svc.Status -ne 'Running') {
        Write-Warning "서비스가 Running 이 아닙니다. 로그를 확인하세요: $dataPath\logs\service-stderr.log"
        Write-Warning "되돌리려면:  .\rollback.ps1 -AppPath '$AppPath'"
        exit 11
    }
} elseif ($serviceWasRunning) {
    Write-Log '-NoRestart — 서비스를 켜지 않았습니다.'
}

Write-Log '배포 완료'
Write-Host ''
if ($null -ne (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue)) {
    Write-Host "  상태 확인:  Get-Service $ServiceName"
} else {
    # 서비스가 없으면 **사람이 다시 켜야 한다.** 배포는 코드를 갈아 끼울 뿐이고,
    # 콘솔로 돌던 프로세스는 배포 전에 멈춰 세운 그대로다. MCP 도 같이 적는다 —
    # 백엔드만 다시 켜고 MCP 를 잊으면, 그때부터 AI 도구만 조용히 죽어 있다.
    Write-Host '다시 켜세요 (콘솔 기동):'
    Write-Host "  cd '$AppPath'"
    Write-Host '  .\run_server.ps1'
    Write-Host '  .\run_mcp_server.ps1      ← MCP 를 쓰고 있었다면 (다른 창에서)'
}
Write-Host ''
Write-Host "직전 버전은 $prevPath 에 있습니다 (롤백: .\rollback.ps1 -AppPath '$AppPath')"
