param(
    [switch]$SkipLaunch,
    [int]$LaunchWaitSeconds = 20,
    [int]$HistoryDays = 7,
    [string]$OutputDir = [Environment]::GetFolderPath('Desktop')
)

$ErrorActionPreference = 'Stop'

$railRoot = Join-Path $env:LOCALAPPDATA 'Rail'
$appDir = Join-Path $railRoot 'Application'
$userDataDir = Join-Path $railRoot 'User Data'
$railExe = Join-Path $appDir 'chrome.exe'
$since = (Get-Date).AddDays(-$HistoryDays)
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$stagingDir = Join-Path $env:TEMP "rail-crash-report-$stamp"
$zipPath = Join-Path $OutputDir "rail-crash-report-$stamp.zip"

New-Item -ItemType Directory -Path $stagingDir | Out-Null

function Write-Report {
    param([string]$Name, [scriptblock]$Collect)
    try {
        $content = & $Collect
    } catch {
        $content = "collection failed: $($_.Exception.Message)"
    }
    $content | Out-File -FilePath (Join-Path $stagingDir $Name) -Encoding utf8 -Width 4096
}

function Copy-IfPresent {
    param([string]$Source, [string]$DestinationName)
    if (-not (Test-Path -LiteralPath $Source)) {
        return
    }
    try {
        Copy-Item -LiteralPath $Source -Destination (Join-Path $stagingDir $DestinationName) -Recurse -Force
    } catch {
        Add-Content -Path (Join-Path $stagingDir 'collect-errors.txt') -Value "$Source : $($_.Exception.Message)"
    }
}

function Get-RailProcesses {
    Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$appDir\*" }
}

function Invoke-RailLaunch {
    $alreadyRunning = @(Get-RailProcesses).Count
    $process = Start-Process -FilePath $railExe -ArgumentList '--enable-logging', '--v=1' -PassThru
    $null = $process.Handle
    $exited = $process.WaitForExit($LaunchWaitSeconds * 1000)
    $lines = @(
        "launched: $(Get-Date -Format o)"
        "rail processes already running before launch: $alreadyRunning"
    )
    if ($exited) {
        $lines += 'exit code: 0x{0:X8} ({0})' -f $process.ExitCode
    } else {
        $lines += "still running after $LaunchWaitSeconds seconds"
    }
    $lines += "rail processes after wait: $(@(Get-RailProcesses).Count)"
    $lines
}

function Get-CrashEvents {
    $filter = @{
        LogName = 'Application'
        Id = 1000, 1001, 1002
        StartTime = $since
    }
    $events = Get-WinEvent -FilterHashtable $filter -ErrorAction SilentlyContinue |
        Where-Object { $_.Message -match 'chrome\.exe|chrome\.dll|chrome_elf|\\Rail\\' }
    if (-not $events) {
        return "no matching events since $since"
    }
    $events | ForEach-Object {
        "===== $($_.TimeCreated.ToString('o')) $($_.ProviderName) id=$($_.Id)"
        $_.Message
        ''
    }
}

function Get-InstalledFiles {
    if (-not (Test-Path -LiteralPath $appDir)) {
        return "missing: $appDir"
    }
    Get-ChildItem -LiteralPath $appDir -Recurse -File | ForEach-Object {
        '{0,12}  {1,-20}  {2}' -f $_.Length, $_.VersionInfo.FileVersion, $_.FullName.Substring($appDir.Length + 1)
    }
}

function Get-SystemSummary {
    $os = Get-CimInstance Win32_OperatingSystem
    $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
    "os: $($os.Caption) $($os.Version) build $($os.BuildNumber) $($os.OSArchitecture)"
    "locale: $((Get-Culture).Name)"
    "cpu: $($cpu.Name)"
    "ram_gb: $([math]::Round($os.TotalVisibleMemorySize / 1MB, 1))"
    "free_ram_gb: $([math]::Round($os.FreePhysicalMemory / 1MB, 1))"
    ''
    'gpu:'
    Get-CimInstance Win32_VideoController | ForEach-Object {
        "  $($_.Name) driver=$($_.DriverVersion) date=$($_.DriverDate)"
    }
    ''
    'antivirus:'
    Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct -ErrorAction SilentlyContinue |
        ForEach-Object { "  $($_.displayName) state=$($_.productState)" }
    ''
    'disks:'
    Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object {
        "  $($_.DeviceID) free_gb=$([math]::Round($_.FreeSpace / 1GB, 1)) size_gb=$([math]::Round($_.Size / 1GB, 1))"
    }
}

function Copy-WerReports {
    $roots = @(
        (Join-Path $env:LOCALAPPDATA 'Microsoft\Windows\WER\ReportArchive'),
        (Join-Path $env:LOCALAPPDATA 'Microsoft\Windows\WER\ReportQueue'),
        (Join-Path $env:ProgramData 'Microsoft\Windows\WER\ReportArchive'),
        (Join-Path $env:ProgramData 'Microsoft\Windows\WER\ReportQueue')
    )
    $index = 0
    foreach ($root in $roots) {
        if (-not (Test-Path -LiteralPath $root)) {
            continue
        }
        $reports = Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -like '*chrome.exe*' -and $_.LastWriteTime -ge $since }
        foreach ($report in $reports) {
            $index++
            Copy-IfPresent $report.FullName "wer\$index-$($report.Name)"
        }
    }
    $dumpDir = Join-Path $env:LOCALAPPDATA 'CrashDumps'
    if (Test-Path -LiteralPath $dumpDir) {
        Get-ChildItem -LiteralPath $dumpDir -Filter 'chrome.exe*.dmp' |
            Where-Object { $_.LastWriteTime -ge $since } |
            ForEach-Object { Copy-IfPresent $_.FullName "wer\$($_.Name)" }
    }
}

New-Item -ItemType Directory -Path (Join-Path $stagingDir 'wer') | Out-Null

if (-not $SkipLaunch -and (Test-Path -LiteralPath $railExe)) {
    Write-Host "Launching Rail with logging, waiting up to $LaunchWaitSeconds seconds..."
    Write-Report 'launch.txt' { Invoke-RailLaunch }
}

Write-Host 'Collecting...'
Write-Report 'system.txt' { Get-SystemSummary }
Write-Report 'installed-files.txt' { Get-InstalledFiles }
Write-Report 'events.txt' { Get-CrashEvents }
Copy-IfPresent (Join-Path $userDataDir 'chrome_debug.log') 'chrome_debug.log'
Copy-IfPresent (Join-Path $appDir 'debug.log') 'application-debug.log'
Copy-IfPresent (Join-Path $userDataDir 'Crashpad') 'Crashpad'
Copy-IfPresent (Join-Path $userDataDir 'Last Version') 'Last Version'
Copy-IfPresent (Join-Path $env:TEMP 'chromium_installer.log') 'chromium_installer.log'
Copy-WerReports

Compress-Archive -Path (Join-Path $stagingDir '*') -DestinationPath $zipPath -Force
Remove-Item -LiteralPath $stagingDir -Recurse -Force

Write-Host "Report written to $zipPath"
