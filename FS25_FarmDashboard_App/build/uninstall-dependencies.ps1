# Farm Dashboard — remove optional dependencies installed by setup (ImageMagick only).
# Skips removal if ImageMagick was already on the PC before Farm Dashboard setup.

#Requires -Version 5.1

$ErrorActionPreference = 'SilentlyContinue'
$FarmDashRegistryKey = 'HKCU:\Software\fs25-farm-dashboard'
$log = Join-Path $env:TEMP 'FarmDashImageMagickUninstall.log'

function Write-Log([string] $m) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'o'), $m
    Add-Content -LiteralPath $log -Value $line -Encoding utf8 -ErrorAction SilentlyContinue
}

function Start-HiddenProcess {
    param(
        [Parameter(Mandatory)][string] $FilePath,
        [string[]] $ArgumentList = @(),
        [switch] $Wait
    )
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $FilePath
    if ($ArgumentList.Count -gt 0) {
        $psi.Arguments = [string]::Join(' ', $ArgumentList)
    }
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $p = [System.Diagnostics.Process]::Start($psi)
    if ($Wait -and $p) {
        $p.WaitForExit()
        return $p
    }
    return $p
}

function Clear-FarmDashImageMagickRegistry {
    try {
        if (-not (Test-Path -LiteralPath $FarmDashRegistryKey)) { return }
        Remove-ItemProperty -LiteralPath $FarmDashRegistryKey -Name 'ImageMagickInstalledByFarmDash' -ErrorAction SilentlyContinue
        Remove-ItemProperty -LiteralPath $FarmDashRegistryKey -Name 'ImageMagickInstallMethod' -ErrorAction SilentlyContinue
        Remove-ItemProperty -LiteralPath $FarmDashRegistryKey -Name 'ImageMagickUninstallExe' -ErrorAction SilentlyContinue
    } catch { }
}

function Find-ImageMagickUninstaller {
    try {
        $props = Get-ItemProperty -LiteralPath $FarmDashRegistryKey -ErrorAction Stop
        if ($props.ImageMagickUninstallExe -and (Test-Path -LiteralPath $props.ImageMagickUninstallExe)) {
            return $props.ImageMagickUninstallExe
        }
    } catch { }
    foreach ($root in @(
            [Environment]::GetEnvironmentVariable('ProgramFiles'),
            [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
        )) {
        if ([string]::IsNullOrWhiteSpace($root)) { continue }
        $dirs = @(Get-ChildItem -Path $root -Directory -Filter 'ImageMagick*' -ErrorAction SilentlyContinue)
        foreach ($d in $dirs) {
            foreach ($name in @('unins000.exe', 'uninstall.exe')) {
                $u = Join-Path $d.FullName $name
                if (Test-Path -LiteralPath $u) { return $u }
            }
        }
    }
    return $null
}

function Uninstall-ImageMagickInno([string] $UninstallExe) {
    if (-not $UninstallExe) { return $false }
    Write-Log "Running ImageMagick uninstaller: $UninstallExe"
    try {
        $p = Start-HiddenProcess -FilePath $UninstallExe -ArgumentList @(
            '/VERYSILENT', '/SILENT', '/SUPPRESSMSGBOXES', '/NORESTART'
        ) -Wait
        Write-Log "Inno uninstall exit: $($p.ExitCode)"
        return ($p.ExitCode -eq 0)
    } catch {
        Write-Log "Inno uninstall error: $($_.Exception.Message)"
        return $false
    }
}

function Uninstall-ImageMagickWinget {
    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if (-not $winget) { return $false }
    Write-Log 'Trying winget uninstall ImageMagick.ImageMagick ...'
    try {
        $p = Start-HiddenProcess -FilePath $winget.Source -ArgumentList @(
            'uninstall', '--id', 'ImageMagick.ImageMagick', '-e',
            '--accept-source-agreements', '--silent'
        ) -Wait
        Write-Log "winget uninstall exit: $($p.ExitCode)"
        return ($p.ExitCode -eq 0)
    } catch {
        Write-Log "winget uninstall error: $($_.Exception.Message)"
        return $false
    }
}

function Uninstall-ImageMagickChoco {
    $choco = Get-Command choco.exe -ErrorAction SilentlyContinue
    if (-not $choco) { return $false }
    Write-Log 'Trying Chocolatey uninstall imagemagick ...'
    try {
        $p = Start-HiddenProcess -FilePath $choco.Source -ArgumentList @(
            'uninstall', 'imagemagick', '-y', '--force'
        ) -Wait
        Write-Log "choco uninstall exit: $($p.ExitCode)"
        return ($p.ExitCode -eq 0)
    } catch {
        Write-Log "choco uninstall error: $($_.Exception.Message)"
        return $false
    }
}

function Test-MagickStillPresent {
    foreach ($name in @('magick.exe', 'magick')) {
        $c = Get-Command $name -ErrorAction SilentlyContinue
        if ($c -and $c.Source -and (Test-Path -LiteralPath $c.Source)) { return $true }
    }
    return $false
}

Write-Log '--- Farm Dashboard dependency uninstall start ---'

try {
    $props = Get-ItemProperty -LiteralPath $FarmDashRegistryKey -ErrorAction Stop
} catch {
    Write-Log 'No Farm Dashboard registry key; nothing to remove.'
    exit 0
}

if ($props.ImageMagickInstalledByFarmDash -ne '1') {
    Write-Log 'ImageMagick was not installed by Farm Dashboard setup; skipping.'
    exit 0
}

$method = [string]$props.ImageMagickInstallMethod
Write-Log "Removing ImageMagick (install method: $method)."

$unins = Find-ImageMagickUninstaller
if ($unins) { Uninstall-ImageMagickInno -UninstallExe $unins | Out-Null }

if (Test-MagickStillPresent) {
    switch ($method) {
        'winget' { Uninstall-ImageMagickWinget | Out-Null }
        'choco'  { Uninstall-ImageMagickChoco | Out-Null }
        default  {
            Uninstall-ImageMagickWinget | Out-Null
            if (Test-MagickStillPresent) { Uninstall-ImageMagickChoco | Out-Null }
        }
    }
}

if (Test-MagickStillPresent) {
    Write-Log 'ImageMagick may still be installed (manual removal from Settings > Apps may be needed).'
} else {
    Write-Log 'ImageMagick removed successfully.'
}

Clear-FarmDashImageMagickRegistry
Remove-Item -LiteralPath (Join-Path $env:TEMP 'FarmDashImageMagickInstall.log') -Force -ErrorAction SilentlyContinue

exit 0
