param(
    [string]$StartUrl = "https://example.com",
    [int]$Jobs = 20,
    [switch]$FreshProfile,
    [switch]$SkipBuild,
    [switch]$Package
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$python = Join-Path $projectRoot ".venv\Scripts\python.exe"

if (-not $SkipBuild) {
    $buildArgs = @(".\build.py", "--reuse", "-j", $Jobs)
    if (-not $Package) {
        $buildArgs += @("--target", "chrome")
    }

    Push-Location $projectRoot
    try {
        & $python @buildArgs
        if ($LASTEXITCODE -ne 0) {
            throw "Build failed with exit code $LASTEXITCODE."
        }
    } finally {
        Pop-Location
    }
}

if ($Package) {
    $installer = Join-Path $projectRoot "build\src\out\Release\mini_installer.exe"
    $iscc = @(
        (Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 6\ISCC.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "Inno Setup 6\ISCC.exe")
    ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $iscc) {
        throw "Inno Setup 6 not found. Install it with: winget install JRSoftware.InnoSetup"
    }

    & $iscc /Q "/DMiniInstaller=$installer" "/DOutputDir=$(Join-Path $projectRoot 'build')" `
        (Join-Path $projectRoot "platform\windows\installer\rail_setup.iss")
    if ($LASTEXITCODE -ne 0) {
        throw "Setup compilation failed with exit code $LASTEXITCODE."
    }

    $setup = Get-ChildItem (Join-Path $projectRoot "build\RailSetup-*.exe") |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    Write-Host "Installer: $installer"
    Write-Host "Setup: $($setup.FullName)"
    return
}

& (Join-Path $projectRoot "scripts\run.ps1") `
    -StartUrl $StartUrl -Config Release -FreshProfile:$FreshProfile
