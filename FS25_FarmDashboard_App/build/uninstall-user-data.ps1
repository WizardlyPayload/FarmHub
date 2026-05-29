# Farm Dashboard — uninstall user-profile cleanup (invoked from NSIS customUnInstall).
# -Mode Full  : remove all Farm Dashboard Roaming/Local profile data + updater cache
# -Mode Keep  : keep only electron-store config.json + serverLiveCache/ (settings + offline snapshots)

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Full', 'Keep')]
    [string]$Mode
)

$ErrorActionPreference = 'SilentlyContinue'

function Remove-Tree([string]$Path) {
    if (-not $Path -or -not (Test-Path -LiteralPath $Path)) { return }
    try {
        Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
    } catch {
        Write-Host "[FarmDash uninstall] Could not remove: $Path ($($_.Exception.Message))"
    }
}

function Get-ProfileRoots() {
    # Primary profile is package.json "name"; others are legacy / electron-builder aliases.
    $names = @(
        'fs25-farm-dashboard',
        'FS25 Farm Dashboard',
        'com.farmdashboard.app'
    )

    $roaming = @()
    $local = @()
    foreach ($n in $names) {
        if ($env:APPDATA) { $roaming += Join-Path $env:APPDATA $n }
        if ($env:LOCALAPPDATA) { $local += Join-Path $env:LOCALAPPDATA $n }
    }
  if ($env:LOCALAPPDATA) {
        $local += Join-Path $env:LOCALAPPDATA 'fs25-farm-dashboard-updater'
        $local += Join-Path $env:LOCALAPPDATA 'com.farmdashboard.app-updater'
    }
    return @{
        Roaming = $roaming | Select-Object -Unique
        Local   = $local | Select-Object -Unique
    }
}

$KeepFileNames = @{ 'config.json' = $true }
$KeepDirNames  = @{ 'serverLiveCache' = $true }

function Prune-ProfileKeepSettings([string]$ProfileDir) {
    if (-not (Test-Path -LiteralPath $ProfileDir)) { return }
    Get-ChildItem -LiteralPath $ProfileDir -Force | ForEach-Object {
        $n = $_.Name
        if ($KeepFileNames.ContainsKey($n) -or $KeepDirNames.ContainsKey($n)) { return }
        Remove-Tree $_.FullName
    }
}

$roots = Get-ProfileRoots

if ($Mode -eq 'Full') {
    Write-Host '[FarmDash uninstall] Removing all Farm Dashboard user data (Full)...'
    foreach ($p in $roots.Roaming) { Remove-Tree $p }
    foreach ($p in $roots.Local) { Remove-Tree $p }
} else {
    Write-Host '[FarmDash uninstall] Keeping settings (config.json) and offline snapshots (serverLiveCache)...'
    foreach ($p in $roots.Local) { Remove-Tree $p }
    foreach ($p in $roots.Roaming) { Prune-ProfileKeepSettings $p }
}

if ($env:TEMP) {
    Remove-Item -LiteralPath (Join-Path $env:TEMP 'farmdash-install-locale.txt') -Force -ErrorAction SilentlyContinue
}

exit 0
