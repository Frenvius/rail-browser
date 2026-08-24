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
    Write-Host "Installer: $installer"
    return
}

& (Join-Path $projectRoot "scripts\run.ps1") `
    -StartUrl $StartUrl -Config Release -FreshProfile:$FreshProfile
