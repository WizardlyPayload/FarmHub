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
    [string]$Edition = 'V4',

    # NSIS gets these from Windows shell folders. A child PowerShell process
    # launched by a packaged Windows Settings host can inherit redirected
    # APPDATA/LOCALAPPDATA environment values, silently cleaning the wrong view.
    [string]$RoamingBase,
    [string]$LocalBase,
    [string]$TraceLog
)

$ErrorActionPreference = 'Stop'
$script:CleanupFailures = New-Object 'System.Collections.Generic.List[string]'

function Write-CleanupTrace([string]$Message) {
    $line = '[' + (Get-Date -Format o) + '] ' + $Message
    Write-Host $line
    if ($TraceLog) {
        Add-Content -LiteralPath $TraceLog -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
    }
}

function Test-IsV5Edition([string]$Name) {
    return @('Rf', 'V5') -contains $Name
}

function Test-HasLinkedAncestor([string]$Path) {
    if (-not $Path) { return $false }
    $cursor = $Path
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            $item = Get-Item -LiteralPath $cursor -Force -ErrorAction SilentlyContinue
            if ($item -and ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
                return $true
            }
        }
        $parent = Split-Path -Path $cursor -Parent
        if (-not $parent -or $parent -eq $cursor) { break }
        $cursor = $parent
    }
    return $false
}

function Reject-LinkedPath([string]$Path) {
    $script:CleanupFailures.Add($Path)
    Write-Host "[FarmDash uninstall] Refusing a linked profile path: $Path"
}

function Remove-Tree([string]$Path) {
    if (-not $Path -or -not (Test-Path -LiteralPath $Path)) {
        Write-CleanupTrace "Profile target absent from helper view: $Path"
        return
    }
    Write-CleanupTrace "Removing profile target: $Path"
    if (Test-HasLinkedAncestor $Path) {
        Reject-LinkedPath $Path
        return
    }
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
            Write-CleanupTrace "Removed profile target: $resolved"
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

function Get-ProfileRoots([string]$EditionName, [string]$RoamingDirectory, [string]$LocalDirectory) {
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
        if ($RoamingDirectory) { $roaming += Join-Path $RoamingDirectory $n }
        if ($LocalDirectory) { $local += Join-Path $LocalDirectory $n }
    }
    if ($LocalDirectory) {
        foreach ($u in $updater) {
            $local += Join-Path $LocalDirectory $u
        }
    }
    return @{
        Roaming = $roaming | Select-Object -Unique
        Local   = $local | Select-Object -Unique
    }
}

function Remove-LegacyV5UpdaterInstaller([string]$LocalDirectory) {
    if (-not (Test-IsV5Edition $Edition) -or -not $LocalDirectory) { return }

    # Older V5 builds used V4's cache name. Never remove that shared tree: its
    # pending/ directory may contain a genuine V4 update. Only the root-level
    # installer.exe is a V5 cleanup candidate, and only when its PE identity
    # proves it belongs to this product line.
    $legacyRoot = Join-Path $LocalDirectory 'fs25-farm-dashboard-updater'
    $candidate = Join-Path $legacyRoot 'installer.exe'
    if (-not (Test-Path -LiteralPath $candidate)) { return }
    if (Test-HasLinkedAncestor $candidate) {
        Reject-LinkedPath $candidate
        return
    }

    $resolvedRoot = [IO.Path]::GetFullPath($legacyRoot).TrimEnd([IO.Path]::DirectorySeparatorChar)
    $resolvedCandidate = [IO.Path]::GetFullPath($candidate)
    $expectedCandidate = Join-Path $resolvedRoot 'installer.exe'
    if (-not $resolvedCandidate.Equals($expectedCandidate, [StringComparison]::OrdinalIgnoreCase)) {
        $script:CleanupFailures.Add($resolvedCandidate)
        Write-Host "[FarmDash uninstall] Refusing an out-of-scope updater path: $resolvedCandidate"
        return
    }

    try {
        $item = Get-Item -LiteralPath $resolvedCandidate -Force -ErrorAction Stop
        if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw 'Linked or non-file updater cache entry requires manual review.'
        }
        try {
            $identity = [Diagnostics.FileVersionInfo]::GetVersionInfo($resolvedCandidate)
        } catch {
            Write-Host "[FarmDash uninstall] Retaining updater cache entry with unreadable identity: $resolvedCandidate"
            return
        }
        if ($identity.ProductName -cne 'FS25 Farm Dashboard V5' -or
            $identity.ProductVersion -notmatch '^5\.') {
            Write-Host "[FarmDash uninstall] Retaining updater cache entry not proven V5-owned: $resolvedCandidate"
            return
        }

        Remove-Item -LiteralPath $resolvedCandidate -Force -ErrorAction Stop
        if (Test-Path -LiteralPath $resolvedCandidate) { throw 'V5 cached installer remains after removal.' }
        Write-Host "[FarmDash uninstall] Removed proven V5 installer from legacy shared updater cache."
        if (@(Get-ChildItem -LiteralPath $resolvedRoot -Force -ErrorAction Stop).Count -eq 0) {
            Remove-Item -LiteralPath $resolvedRoot -Force -ErrorAction Stop
        }
    } catch {
        $script:CleanupFailures.Add($resolvedCandidate)
        Write-Host "[FarmDash uninstall] Could not clean proven V5 updater cache entry: $resolvedCandidate ($($_.Exception.Message))"
    }
}

$KeepFileNames = @{ 'config.json' = $true }
$KeepDirNames  = @{ 'serverLiveCache' = $true }

function Prune-ProfileKeepSettings([string]$ProfileDir) {
    if (-not (Test-Path -LiteralPath $ProfileDir)) { return }
    if (Test-HasLinkedAncestor $ProfileDir) {
        Reject-LinkedPath $ProfileDir
        return
    }
    Get-ChildItem -LiteralPath $ProfileDir -Force | ForEach-Object {
        $n = $_.Name
        if ($KeepFileNames.ContainsKey($n) -or $KeepDirNames.ContainsKey($n)) { return }
        Remove-Tree $_.FullName
    }
}

function Resolve-ProfileBase([string]$Explicit, [string]$EnvironmentValue, [string]$Label) {
    $chosen = if ($Explicit) { $Explicit } else { $EnvironmentValue }
    if ([string]::IsNullOrWhiteSpace($chosen) -or -not [IO.Path]::IsPathRooted($chosen) -or
        $chosen -match '["\r\n]') { throw "A valid absolute $Label profile base is required." }
    $full = [IO.Path]::GetFullPath($chosen).TrimEnd('\', '/')
    if ($full -eq [IO.Path]::GetPathRoot($full).TrimEnd('\', '/')) {
        throw "A drive root cannot be the $Label profile base."
    }
    return $full
}

$roamingDirectory = Resolve-ProfileBase $RoamingBase $env:APPDATA 'Roaming'
$localDirectory = Resolve-ProfileBase $LocalBase $env:LOCALAPPDATA 'Local'
Write-CleanupTrace "[FarmDash uninstall] $Edition $Mode profile bases: roaming=$roamingDirectory local=$localDirectory; inherited APPDATA=$env:APPDATA LOCALAPPDATA=$env:LOCALAPPDATA; identity=$([Security.Principal.WindowsIdentity]::GetCurrent().Name)"
$roots = Get-ProfileRoots $Edition $roamingDirectory $localDirectory
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

Remove-LegacyV5UpdaterInstaller $localDirectory

foreach ($p in @($roots.Roaming) + @($roots.Local)) {
    Write-CleanupTrace "Post-cleanup helper view: path=$p exists=$(Test-Path -LiteralPath $p)"
}

if ($env:TEMP) {
    Remove-Item -LiteralPath (Join-Path $env:TEMP 'farmdash-install-locale.txt') -Force -ErrorAction SilentlyContinue
}

if ($script:CleanupFailures.Count -gt 0) {
    Write-Host "[FarmDash uninstall] Cleanup incomplete. Close applications holding these files and retry. The uninstaller must be retained."
    exit 1
}
Write-CleanupTrace '[FarmDash uninstall] User profile cleanup helper completed.'
exit 0
