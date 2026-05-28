#Requires -Version 5.1
# Runs during Farm Dashboard setup: ensures ImageMagick (magick) is available for DDS→PNG in the mod scanner.
# Order (default): bundled installer → already installed → winget → Chocolatey → download official Windows installer.
# With -NoPackageManagers (NSIS installer): bundled → already installed → silent download only (no winget/choco windows).
# Exits 0 always so the main app install completes even if every path fails (user can install IM manually).

param(
    [switch] $NoPackageManagers
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Inno Setup silent switches (no wizard, no console from the IM setup.exe itself).
$script:InnoSilentArgs = @('/VERYSILENT', '/SILENT', '/SP-', '/SUPPRESSMSGBOXES', '/NORESTART')

$log = Join-Path $env:TEMP 'FarmDashImageMagickInstall.log'

# Bump when ImageMagick ships a newer 7.x Q16 HDRI x64 DLL build (see https://imagemagick.org/archive/binaries/).
$OfficialInstallerUrls = @(
    'https://download.imagemagick.org/archive/binaries/ImageMagick-7.1.2-7-Q16-HDRI-x64-dll.exe'
    'https://imagemagick.org/archive/binaries/ImageMagick-7.1.2-7-Q16-HDRI-x64-dll.exe'
)

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

function Update-SessionPathFromRegistry {
    $machine = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [System.Environment]::GetEnvironmentVariable('Path', 'User')
    if (-not [string]::IsNullOrWhiteSpace($machine) -or -not [string]::IsNullOrWhiteSpace($user)) {
        $env:Path = "$machine;$user;$env:Path"
    }
}

$FarmDashRegistryKey = 'HKCU:\Software\fs25-farm-dashboard'

function Find-ImageMagickUninstaller {
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

function Register-FarmDashImageMagickInstall {
    param([string]$Method)
    if (-not (Test-MagickOnPath)) { return }
    try {
        New-Item -Path $FarmDashRegistryKey -Force | Out-Null
        Set-ItemProperty -LiteralPath $FarmDashRegistryKey -Name 'ImageMagickInstalledByFarmDash' -Value '1'
        Set-ItemProperty -LiteralPath $FarmDashRegistryKey -Name 'ImageMagickInstallMethod' -Value $Method
        $unins = Find-ImageMagickUninstaller
        if ($unins) {
            Set-ItemProperty -LiteralPath $FarmDashRegistryKey -Name 'ImageMagickUninstallExe' -Value $unins
        }
        Write-Log "Recorded Farm Dashboard ImageMagick install (method=$Method)."
    } catch {
        Write-Log "Could not record ImageMagick install marker: $($_.Exception.Message)"
    }
}

function Test-MagickOnPath {
    Update-SessionPathFromRegistry
    foreach ($name in @('magick.exe', 'magick')) {
        $c = Get-Command $name -ErrorAction SilentlyContinue
        if ($c -and $c.Source -and (Test-Path -LiteralPath $c.Source)) {
            Write-Log "Found existing: $($c.Source)"
            return $true
        }
    }
    $pf64 = [Environment]::GetEnvironmentVariable('ProgramFiles')
    $pf32 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
    foreach ($root in @($pf64, $pf32)) {
        if ([string]::IsNullOrWhiteSpace($root)) { continue }
        $dirs = @(Get-ChildItem -Path $root -Directory -Filter 'ImageMagick*' -ErrorAction SilentlyContinue)
        foreach ($d in $dirs) {
            $exe = Join-Path $d.FullName 'magick.exe'
            if (Test-Path -LiteralPath $exe) {
                Write-Log "Found ImageMagick: $exe"
                return $true
            }
        }
    }
    return $false
}

function Install-FromBundledExe {
    param([string] $ResourcesRoot)
    $dir = Join-Path $ResourcesRoot 'imagemagick'
    if (-not (Test-Path -LiteralPath $dir)) { return $false }
    $candidates = Get-ChildItem -LiteralPath $dir -Filter '*.exe' -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match 'ImageMagick' } | Sort-Object Length -Descending
    $setup = $candidates | Select-Object -First 1
    if (-not $setup) { return $false }
    Write-Log "Bundled installer found: $($setup.FullName)"
    try {
        $p = Start-HiddenProcess -FilePath $setup.FullName -ArgumentList $script:InnoSilentArgs -Wait
        Write-Log "Bundled setup exit: $($p.ExitCode)"
    } catch {
        Write-Log "Bundled setup error: $($_.Exception.Message)"
        return $false
    }
    Update-SessionPathFromRegistry
    return (Test-MagickOnPath)
}

function Install-FromOfficialDownload {
    $dest = Join-Path $env:TEMP ("FarmDashImageMagick-" + [Guid]::NewGuid().ToString('n') + '.exe')
    foreach ($url in $OfficialInstallerUrls) {
        Write-Log "Trying download: $url"
        try {
            Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing -MaximumRedirection 5
            if ((Get-Item -LiteralPath $dest -ErrorAction SilentlyContinue).Length -lt 5MB) {
                Write-Log 'Download too small or missing; next URL.'
                Remove-Item -LiteralPath $dest -Force -ErrorAction SilentlyContinue
                continue
            }
            $p = Start-HiddenProcess -FilePath $dest -ArgumentList $script:InnoSilentArgs -Wait
            Write-Log "Downloaded installer exit: $($p.ExitCode)"
            Remove-Item -LiteralPath $dest -Force -ErrorAction SilentlyContinue
            Update-SessionPathFromRegistry
            if (Test-MagickOnPath) { return $true }
        } catch {
            Write-Log "Download/install error: $($_.Exception.Message)"
            Remove-Item -LiteralPath $dest -Force -ErrorAction SilentlyContinue
        }
    }
    return $false
}

try {
    Write-Log '--- Farm Dashboard ImageMagick setup start ---'
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $resourcesRoot = $scriptDir

    if (Install-FromBundledExe -ResourcesRoot $resourcesRoot) {
        Write-Log 'Bundled ImageMagick install succeeded.'
        Register-FarmDashImageMagickInstall -Method 'bundled'
        exit 0
    }

    if (Test-MagickOnPath) {
        Write-Log 'Already available before setup; not recorded for uninstall.'
        exit 0
    }

    if ($NoPackageManagers) {
        Write-Log 'NoPackageManagers: skipping winget/Chocolatey (no visible console during NSIS install).'
        if (Install-FromOfficialDownload) {
            Write-Log 'Official download install succeeded.'
            Register-FarmDashImageMagickInstall -Method 'download'
            exit 0
        }
        Write-Log 'ImageMagick not installed (quiet path). DDS thumbnails may need texconv or manual ImageMagick.'
        exit 0
    }

    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if ($winget -and $winget.Source) {
        $args = @(
            'install', '--id', 'ImageMagick.ImageMagick', '-e',
            '--accept-package-agreements', '--accept-source-agreements', '--silent'
        )
        Write-Log 'Trying winget (user context) ...'
        try {
            $p = Start-HiddenProcess -FilePath $winget.Source -ArgumentList $args -Wait
            Write-Log "winget exit: $($p.ExitCode)"
        } catch {
            Write-Log "winget start error: $($_.Exception.Message)"
        }
        Update-SessionPathFromRegistry
        if (Test-MagickOnPath) {
            Write-Log 'winget succeeded.'
            Register-FarmDashImageMagickInstall -Method 'winget'
            exit 0
        }

    } else {
        Write-Log 'winget not on PATH.'
    }

    $choco = Get-Command choco.exe -ErrorAction SilentlyContinue
    if ($choco) {
        Write-Log 'Trying Chocolatey ...'
        try {
            $c = Start-HiddenProcess -FilePath $choco.Source -ArgumentList @('install', 'imagemagick', '-y') -Wait
            if ($c) { Write-Log "choco exit: $($c.ExitCode)" }
        } catch {
            Write-Log "choco: $($_.Exception.Message)"
        }
        Update-SessionPathFromRegistry
        if (Test-MagickOnPath) {
            Register-FarmDashImageMagickInstall -Method 'choco'
            exit 0
        }
    }

    if (Install-FromOfficialDownload) {
        Write-Log 'Official download install succeeded.'
        Register-FarmDashImageMagickInstall -Method 'download'
        exit 0
    }

    Write-Log 'ImageMagick could not be installed automatically. Install from https://imagemagick.org if DDS thumbnails are missing.'
}
catch {
    Write-Log "Error: $($_.Exception.Message)"
}

exit 0
