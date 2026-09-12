# Farm Dashboard — uninstall user-profile cleanup (invoked from NSIS customUnInstall).
# -Mode Full  : remove this version's Roaming/Local profile data + updater cache
# -Mode Keep  : keep only electron-store config.json + serverLiveCache/
# -Edition V4 | V5  (aliases Classic | Rf) : never touch the other version's folders

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Full', 'Keep')]
    [string]$Mode,

    [Parameter(Mandatory = $false)]
    [ValidateSet('Classic', 'Rf', 'V4', 'V5')]
    [string]$Edition = 'V4'
)

$ErrorActionPreference = 'Stop'
$script:CleanupFailures = New-Object 'System.Collections.Generic.List[string]'

function Test-IsV5Edition([string]$Name) {
    return @('Rf', 'V5') -contains $Name
}

function Remove-Tree([string]$Path) {
    if (-not $Path -or -not (Test-Path -LiteralPath $Path)) { return }
    $resolved = [IO.Path]::GetFullPath($Path)
    $allowed = @($script:AllowedCleanupRoots | Where-Object {
        $resolved.Equals($_, [StringComparison]::OrdinalIgnoreCase) -or
        $resolved.StartsWith($_ + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
    })
    if ($allowed.Count -eq 0) {
        $script:CleanupFailures.Add($resolved)
        Write-Host "[FarmDash uninstall] Refusing an out-of-scope path: $resolved"
        return
    }
    for ($attempt = 0; $attempt -lt 3; $attempt++) {
        try {
            $item = Get-Item -LiteralPath $resolved -Force -ErrorAction Stop
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw "Linked profile paths require manual review."
            }
            $links = @(Get-ChildItem -LiteralPath $resolved -Recurse -Force -ErrorAction Stop |
                Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint })
            if ($links.Count -gt 0) { throw "Linked profile children require manual review." }
            Remove-Item -LiteralPath $resolved -Recurse -Force -ErrorAction Stop
            if (Test-Path -LiteralPath $resolved) { throw "Path remains after removal." }
            return
        } catch {
            if (-not (Test-Path -LiteralPath $resolved)) { return }
            if ($attempt -lt 2) { Start-Sleep -Milliseconds 250 }
            else {
                $script:CleanupFailures.Add($resolved)
                Write-Host "[FarmDash uninstall] Could not remove: $resolved ($($_.Exception.Message))"
            }
        }
    }
}

function Get-ProfileRoots([string]$EditionName) {
    if (Test-IsV5Edition $EditionName) {
        $names = @('fs25-farm-dashboard-rf')
        $updater = @(
            'fs25-farm-dashboard-rf-updater',
            'com.farmdashboard.rf-updater'
        )
    } else {
        $names = @(
            'fs25-farm-dashboard',
            'FS25 Farm Dashboard',
            'com.farmdashboard.app'
        )
        $updater = @(
            'fs25-farm-dashboard-updater',
            'com.farmdashboard.app-updater'
        )
    }

    $roaming = @()
    $local = @()
    foreach ($n in $names) {
        if ($env:APPDATA) { $roaming += Join-Path $env:APPDATA $n }
        if ($env:LOCALAPPDATA) { $local += Join-Path $env:LOCALAPPDATA $n }
    }
    if ($env:LOCALAPPDATA) {
        foreach ($u in $updater) {
            $local += Join-Path $env:LOCALAPPDATA $u
        }
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

$roots = Get-ProfileRoots $Edition
$script:AllowedCleanupRoots = @(@($roots.Roaming) + @($roots.Local) |
    ForEach-Object { [IO.Path]::GetFullPath($_).TrimEnd([IO.Path]::DirectorySeparatorChar) })

if ($Mode -eq 'Full') {
    Write-Host "[FarmDash uninstall] Removing $Edition Farm Dashboard user data (Full)..."
    foreach ($p in $roots.Roaming) { Remove-Tree $p }
    foreach ($p in $roots.Local) { Remove-Tree $p }
} else {
    Write-Host "[FarmDash uninstall] Keeping $Edition settings (config.json) and offline snapshots (serverLiveCache)..."
    foreach ($p in $roots.Local) { Remove-Tree $p }
    foreach ($p in $roots.Roaming) { Prune-ProfileKeepSettings $p }
}

if ($env:TEMP) {
    Remove-Item -LiteralPath (Join-Path $env:TEMP 'farmdash-install-locale.txt') -Force -ErrorAction SilentlyContinue
}

if ($script:CleanupFailures.Count -gt 0) {
    Write-Host "[FarmDash uninstall] Cleanup incomplete. Close applications holding these files and retry. The uninstaller must be retained."
    exit 1
}
exit 0
