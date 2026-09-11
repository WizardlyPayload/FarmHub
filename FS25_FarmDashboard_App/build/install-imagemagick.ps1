#Requires -Version 5.1
# Optional DDS converter. Existing installs are never adopted or reinstalled.
param(
    [switch]$NoPackageManagers,
    [switch]$RepairOwnershipOnly,
    [switch]$AllowElevation,
    [ValidateSet('Classic', 'Rf', 'V4', 'V5')][string]$Edition = 'V4'
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$script:FarmDashNativeDependencyRegistry = $Edition -in @('V5', 'Rf')
$script:FarmDashAllowDependencyRecovery = $true
if ($script:FarmDashNativeDependencyRegistry) { . (Join-Path $PSScriptRoot 'windows-install-state.ps1') }
. (Join-Path $PSScriptRoot 'imagemagick-common.ps1')
$script:DependencyLog = Join-Path $env:TEMP 'FarmDashImageMagickInstall.log'
$script:ApprovedImageMagickName = 'ImageMagick-7.1.2-24-Q16-HDRI-x64-dll.exe'
$script:ApprovedImageMagickHash = '5665E6B0C27591AB3103E757D509EEF85508133D0312390D6EAEBF78BDBB4C8A'
function Invoke-FarmDashImageMagickInstall([string]$ResourcesRoot, [string]$EditionName, [bool]$ElevationAllowed = $true) {
    Write-DependencyLog ("ImageMagick setup: edition=" + $EditionName + '; identity=' + [Security.Principal.WindowsIdentity]::GetCurrent().Name + '; process64=' + [Environment]::Is64BitProcess)
    $existing = @(Get-ImageMagickCandidates)
    if ($existing.Count -gt 0) {
        $state = Get-DependencyState
        if ($RepairOwnershipOnly -and $state.ImageMagickInstalledByFarmDash -ne '1') {
            throw 'No existing Dashboard ownership evidence. An external ImageMagick copy will not be adopted.'
        }
        if ($state.ImageMagickInstalledByFarmDash -eq '1' -and
            ($script:FarmDashDependencyRecoveryPending -or $state.ImageMagickOwnershipVersion -ne '2' -or -not $state.ImageMagickExecutable -or
             -not $state.ImageMagickUninstallExe -or -not $state.ImageMagickUninstallSHA256)) {
            if ($existing.Count -ne 1 -or
                ($state.ImageMagickExecutable -and [IO.Path]::GetFullPath([string]$state.ImageMagickExecutable) -ne $existing[0])) {
                throw 'Existing Farm Dashboard ownership cannot uniquely identify ImageMagick for repair. Ownership has been retained.'
            }
            $method = if ($state.ImageMagickInstallMethod) { [string]$state.ImageMagickInstallMethod } else { 'legacy' }
            Register-OwnedImageMagick $existing[0] $method $EditionName
            Write-DependencyLog 'Repaired existing Farm Dashboard ownership with the exact executable, uninstaller and checksum. ImageMagick was not reinstalled.'
        } else {
            Write-DependencyLog 'ImageMagick is already available. Not reinstalling it or claiming new ownership.'
        }
        Register-DependencyConsumer $EditionName
        return 0
    }
    if ($RepairOwnershipOnly) { throw 'ImageMagick is absent. Ownership-only repair never installs software.' }
    $downloaded = $false
    $setup = Join-Path (Join-Path $ResourcesRoot 'imagemagick') $script:ApprovedImageMagickName
    try {
        if (-not (Test-Path -LiteralPath $setup -PathType Leaf)) {
            $setup = Join-Path $env:TEMP ('FarmDashImageMagick-' + [Guid]::NewGuid().ToString('n') + '.exe')
            $downloaded = $true
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            $url = 'https://download.imagemagick.org/archive/binaries/' + $script:ApprovedImageMagickName
            Write-DependencyLog 'Downloading the pinned official ImageMagick installer (60 second timeout).'
            Invoke-WebRequest -Uri $url -OutFile $setup -UseBasicParsing -MaximumRedirection 5 -TimeoutSec 60
        }
        if ((Get-FileHash -LiteralPath $setup -Algorithm SHA256).Hash -ne $script:ApprovedImageMagickHash) {
            throw 'ImageMagick installer checksum mismatch. No installer was run.'
        }
        $imArgs = @('/VERYSILENT', '/SILENT', '/SP-', '/SUPPRESSMSGBOXES', '/NORESTART')
        if (Test-DependencyAdministrator) {
            $code = Invoke-DependencyProcess $setup $imArgs
        } elseif ($ElevationAllowed) {
            Write-DependencyLog 'ImageMagick needs administrator permission. Opening the normal Windows permission prompt.'
            $code = Invoke-ElevatedDependencyProcess $setup $imArgs
        } else {
            Write-DependencyLog 'ImageMagick needs administrator permission and elevation was not allowed (silent setup).'
            return 740
        }
        if ($code -ne 0) {
            Write-DependencyLog ("ImageMagick installer did not succeed (exit " + $code + '). Ownership was not recorded.')
            return $code
        }
        $installed = @(Get-ImageMagickCandidates)
        Write-DependencyLog ("ImageMagick vendor setup returned success; executable candidates found: " + $installed.Count)
        if ($installed.Count -ne 1) { throw 'Could not uniquely identify the newly installed ImageMagick executable.' }
        $method = if ($downloaded) { 'download' } else { 'bundled' }
        Register-OwnedImageMagick $installed[0] $method $EditionName
        Write-DependencyLog 'ImageMagick installed; its exact executable and uninstaller are recorded for Full removal.'
        return 0
    } finally {
        if ($downloaded -and (Test-Path -LiteralPath $setup)) { Remove-Item -LiteralPath $setup -Force -ErrorAction SilentlyContinue }
    }
}
try { exit (Invoke-FarmDashImageMagickInstall $PSScriptRoot $Edition $AllowElevation.IsPresent) }
catch {
    Write-DependencyLog ("ImageMagick setup incomplete: " + $_.Exception.Message)
    exit 1
}
