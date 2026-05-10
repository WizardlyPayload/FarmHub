#Requires -Version 5.1
# farmdash-clean-build v3 - Stops processes locking Farm Dashboard / electron-builder output folders, then deletes those trees.
# Run from repo: npm run clean:build-out
# If folders still stick, close Explorer windows on them and run this script as Administrator.
# NOTE: In PowerShell, do not use "[Label]" inside double-quoted strings; use single quotes or -f. See v3 fix.

param(
    [string[]]$AlsoRemove,
    # Stops the Windows Search (WSearch) service briefly so the indexer can release app.asar (requires Administrator).
    [switch]$StopWindowsSearch
)

$ErrorActionPreference = 'Continue'
# Script lives in FarmHub/tools/app — resolve inner Electron app root for in-repo output folders
$toolsAppDir = $PSScriptRoot
$repoRoot = Split-Path -Parent (Split-Path -Parent $toolsAppDir)
$appRoot = Join-Path $repoRoot 'FS25_FarmDashboard_App\FS25_FarmDashboard_App'
# package.json build.output is ../electron-pack-out → sibling of inner app folder
$packParent = Split-Path -Parent $appRoot

$targets = [System.Collections.Generic.List[string]]::new()
# Default npm run dist/pack output — outside repo (see tools/run-electron-builder.mjs)
if ($env:LOCALAPPDATA) {
    [void]$targets.Add((Join-Path $env:LOCALAPPDATA 'fs25-farm-dashboard-electron-out'))
}
foreach ($p in @(
        (Join-Path $packParent 'electron-pack-out'),
        (Join-Path $packParent 'electron-pack-out-alt'),
        (Join-Path $appRoot 'release'),
        (Join-Path $appRoot 'release-build')
    )) {
    if ($p) { [void]$targets.Add($p) }
}

Get-ChildItem -Path $appRoot -Directory -Filter 'release-*' -ErrorAction SilentlyContinue | ForEach-Object {
    [void]$targets.Add($_.FullName)
}
Get-ChildItem -Path $packParent -Directory -Filter 'release-*' -ErrorAction SilentlyContinue | ForEach-Object {
    [void]$targets.Add($_.FullName)
}

foreach ($x in $AlsoRemove) {
    if ($x -and (Test-Path -LiteralPath $x)) { [void]$targets.Add((Resolve-Path -LiteralPath $x).Path) }
}

$unique = $targets | Select-Object -Unique
Write-Host '[FarmDash] Targets to clear:'
$unique | ForEach-Object { Write-Host "  $_" }

if ($StopWindowsSearch) {
    Write-Host '[FarmDash] Stopping Windows Search service (indexer) for a few seconds...'
    Stop-Service -Name WSearch -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

# 1) App started from a win-unpacked build (do not taskkill all electron.exe - that would kill Cursor/VS Code)
$null = & cmd.exe /c 'taskkill /F /T /IM "FS25 Farm Dashboard.exe" 2>nul'
Start-Sleep -Milliseconds 800

# 1b) Any running process whose .Path is under an output folder (catches helpers the dashboard spawns)
foreach ($pr in Get-Process -ErrorAction SilentlyContinue) {
    try {
        $pp = $pr.Path
        if (-not $pp) { continue }
        foreach ($root in ($unique | Where-Object { $_ })) {
            if ($pp.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) {
                Write-Host ('[FarmDash] Stopping process {0} (PID {1})' -f $pp, $pr.Id)
                Stop-Process -Id $pr.Id -Force -ErrorAction SilentlyContinue
                break
            }
        }
    } catch {
        # Some system processes have no Path
    }
}
Start-Sleep -Milliseconds 600

# 1c) Hung node.exe (electron-builder / npm) still holding paths under output dirs
foreach ($wp in Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'node.exe' }) {
    try {
        $cl = $wp.CommandLine
        if (-not $cl) { continue }
        foreach ($root in ($unique | Where-Object { $_ })) {
            if ($cl.IndexOf($root, [StringComparison]::OrdinalIgnoreCase) -lt 0) { continue }
            Write-Host ('[FarmDash] Stopping node.exe PID {0} (build still referencing output folder)' -f $wp.ProcessId)
            Stop-Process -Id $wp.ProcessId -Force -ErrorAction SilentlyContinue
            break
        }
    } catch { }
}
Start-Sleep -Milliseconds 500

# 2) Any process whose EXE lives under one of our output trees (includes Chromium helpers named *.exe)
$paths = $unique | Where-Object { $_ }
for ($r = 0; $r -lt 4; $r++) {
    $procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $ep = $_.ExecutablePath
        if (-not $ep) { return $false }
        foreach ($root in $paths) {
            if (-not $root) { continue }
            if ($ep.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { return $true }
            if ($ep.IndexOf($root, [StringComparison]::OrdinalIgnoreCase) -ge 0) { return $true }
        }
        # Temp builds from npm run dist:fresh / pack:fresh
        if ($ep -match 'farmdash-electron-out-') { return $true }
        return $false
    }
    if (-not $procs) { break }
    foreach ($p in $procs) {
        Write-Host ('[FarmDash] Stopping PID {0} {1}' -f $p.ProcessId, $p.Name)
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Milliseconds 500
}

function Remove-AppAsarFilesUnder([string]$rootDir) {
    if (-not (Test-Path -LiteralPath $rootDir)) { return }
    $files = @(Get-ChildItem -LiteralPath $rootDir -Filter 'app.asar' -Recurse -File -ErrorAction SilentlyContinue)
    foreach ($f in $files) {
        for ($attempt = 1; $attempt -le 8; $attempt++) {
            try {
                Remove-Item -LiteralPath $f.FullName -Force -ErrorAction Stop
                Write-Host ('[FarmDash] Deleted locked file: ' + $f.FullName)
                break
            } catch {
                Start-Sleep -Milliseconds 350
            }
        }
    }
}

function Remove-TreeStubborn([string]$dir) {
    if (-not (Test-Path -LiteralPath $dir)) { return $true }
    try {
        Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction Stop
        return $true
    } catch {
        Write-Host '[FarmDash] Remove-Item failed, trying robocopy empty-folder trick...'
    }
    $empty = Join-Path $env:TEMP ('farmdash-rm-empty-' + [Guid]::NewGuid().ToString('N'))
    try {
        New-Item -ItemType Directory -Path $empty -Force | Out-Null
        & robocopy.exe $empty $dir /MIR /R:0 /W:0 /NFL /NDL /NJH /NJS | Out-Null
    } finally {
        if (Test-Path -LiteralPath $empty) {
            Remove-Item -LiteralPath $empty -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
    try {
        Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction Stop
        return $true
    } catch {
        Write-Warning ('[FarmDash] Still could not remove: {0} - {1}' -f $dir, $_.Exception.Message)
        return $false
    }
}

Write-Host ''
foreach ($dir in $unique) {
    if (-not $dir) { continue }
    if (-not (Test-Path -LiteralPath $dir)) {
        Write-Host ('[FarmDash] (skip, not found) ' + $dir)
        continue
    }
    Write-Host ('[FarmDash] Removing ' + $dir + ' ...')
    Remove-AppAsarFilesUnder $dir
    Start-Sleep -Milliseconds 300
    $ok = Remove-TreeStubborn $dir
    if ($ok) { Write-Host '[FarmDash] Done.' } else { Write-Host '[FarmDash] You may need to close Explorer on that folder or reboot, then run this script again.' }
    Write-Host ''
}

if ($StopWindowsSearch) {
    Write-Host '[FarmDash] Starting Windows Search service again...'
    Start-Service -Name WSearch -ErrorAction SilentlyContinue
}

Write-Host '[FarmDash] Finished. You can run npm run pack / npm run dist again.'
Write-Host '[FarmDash] If app.asar stayed locked: close Cursor/VS Code, close Explorer on those folders, or run:'
Write-Host '  powershell -ExecutionPolicy Bypass -File <FarmHub>/tools/app/remove-build-output-folders.ps1 -StopWindowsSearch'
Write-Host '  (as Administrator). Or use: npm run dist:fresh'
