param(
    [string]$StartUrl = "https://example.com",
    [ValidateSet("Dev", "Release")]
    [string]$Config = "Dev",
    [switch]$FreshProfile
)

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$chrome = Join-Path $projectRoot "build\src\out\$Config\chrome.exe"
$profile = Join-Path $projectRoot "build\profile"

if (-not (Test-Path -LiteralPath $chrome)) {
    throw "chrome.exe not found at $chrome. Build it with: .\.venv\Scripts\python.exe .\build.py --dev --reuse --target chrome -j 20"
}

if ($FreshProfile -and (Test-Path -LiteralPath $profile)) {
    $resolvedProfile = (Resolve-Path -LiteralPath $profile).Path
    $resolvedBuild = (Resolve-Path -LiteralPath (Join-Path $projectRoot "build")).Path
    if (-not $resolvedProfile.StartsWith($resolvedBuild, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove a profile outside the project build directory."
    }
    Remove-Item -LiteralPath $resolvedProfile -Recurse -Force
}

$features = @(
    "Webium",
    "AttachUnownedInnerWebContents",
    "ExtensionsMenuAccessControl"
) -join ","

& $chrome `
    "--user-data-dir=$profile" `
    "--enable-features=$features" `
    "--no-first-run" `
    "--no-default-browser-check" `
    $StartUrl
