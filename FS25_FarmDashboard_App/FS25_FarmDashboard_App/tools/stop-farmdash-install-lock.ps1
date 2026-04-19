#Requires -Version 5.1
# Stops processes locking "%LocalAppData%\Programs\FS25 Farm Dashboard" so the folder can be deleted or upgraded.
# Run in PowerShell (Run as administrator if the app was started elevated or deletion still fails).

param(
    [switch]$DeleteInstallFolder
)

$ErrorActionPreference = 'Continue'
$installRoot = Join-Path $env:LOCALAPPDATA 'Programs\FS25 Farm Dashboard'
$exeName = 'FS25 Farm Dashboard.exe'

Write-Host "[FarmDash] Install folder: $installRoot"

# 1) Kill main EXE and entire process tree (GPU / helper children often hold app.asar open)
$null = & cmd.exe /c "taskkill /F /T /IM `"$exeName`" 2>nul"
Start-Sleep -Milliseconds 900

# 2) Kill anything still running from under that directory (handles odd child names)
$round = 0
while ($round -lt 3) {
    $round++
    $locked = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $_.ExecutablePath -and $_.ExecutablePath.StartsWith($installRoot, [StringComparison]::OrdinalIgnoreCase)
    }
    if (-not $locked) { break }
    foreach ($p in $locked) {
        Write-Host "[FarmDash] Stopping PID $($p.ProcessId) $($p.Name)"
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Milliseconds 600
}

if (-not $DeleteInstallFolder) {
    Write-Host "[FarmDash] Done. Close any Explorer window open inside that folder, then delete it or run your installer."
    Write-Host "[FarmDash] To delete automatically: re-run with -DeleteInstallFolder (prefer Run as administrator)."
    exit 0
}

if (-not (Test-Path -LiteralPath $installRoot)) {
    Write-Host "[FarmDash] Folder not found (already removed): $installRoot"
    exit 0
}

Write-Host "[FarmDash] Removing $installRoot ..."

try {
    Remove-Item -LiteralPath $installRoot -Recurse -Force -ErrorAction Stop
    Write-Host "[FarmDash] Removed OK."
    exit 0
} catch {
    Write-Host "[FarmDash] Remove-Item failed: $($_.Exception.Message)"
}

# Fallback: empty the tree with robocopy /MIR (classic unlock for stubborn directories)
$empty = Join-Path $env:TEMP ("farmdash-empty-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $empty -Force | Out-Null
try {
    Write-Host '[FarmDash] Trying robocopy /MIR empty -> target (clears locked tree)...'
    & robocopy.exe $empty $installRoot /MIR /R:0 /W:0 /NFL /NDL /NJH /NJS | Out-Null
    Remove-Item -LiteralPath $empty -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $installRoot -Recurse -Force -ErrorAction Stop
    Write-Host "[FarmDash] Removed OK (robocopy fallback)."
    exit 0
} catch {
    Write-Host "[FarmDash] Still blocked: $($_.Exception.Message)"
    Write-Host "[FarmDash] Close Explorer windows on that path, pause antivirus real-time scan for a minute, or reboot and run this script with -DeleteInstallFolder before starting any app."
    exit 1
}
