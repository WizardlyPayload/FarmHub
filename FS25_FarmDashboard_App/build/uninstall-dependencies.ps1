#Requires -Version 5.1
# Full removal only. Do not remove external or still-shared ImageMagick installations.
param([ValidateSet('Classic', 'Rf', 'V4', 'V5')][string]$Edition = 'V4', [switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$script:FarmDashNativeDependencyRegistry = $Edition -in @('V5', 'Rf')
$script:FarmDashAllowDependencyRecovery = $false
# Always load native registry helpers so V4 Full uninstall can see an all-users
# V5 install in the 64-bit hive. Ownership writes stay edition-gated above.
. (Join-Path $PSScriptRoot 'windows-install-state.ps1')
. (Join-Path $PSScriptRoot 'imagemagick-common.ps1')
$script:DependencyLog = Join-Path $env:TEMP 'FarmDashImageMagickUninstall.log'
function Invoke-FarmDashDependencyRemoval([string]$EditionName, [bool]$PreflightOnly = $false) {
    $state = Get-DependencyState
    Write-DependencyLog ("ImageMagick removal: edition=" + $EditionName + '; identity=' + [Security.Principal.WindowsIdentity]::GetCurrent().Name + '; process64=' + [Environment]::Is64BitProcess + '; ownership=' + [string]$state.ImageMagickInstalledByFarmDash)
    if ($state.ImageMagickInstalledByFarmDash -ne '1') {
        Write-DependencyLog 'ImageMagick is not owned by Farm Dashboard. Preserving it.'
        return 0
    }
    if (Test-OtherDashboardInstalled $EditionName) {
        Write-DependencyLog 'Another Dashboard edition is installed and may need ImageMagick. Preserving the shared dependency and its ownership record.'
        return 0
    }
    $exe = Resolve-OwnedImageMagick $state
    if (-not $exe -or -not (Test-Path -LiteralPath $exe -PathType Leaf)) {
        Write-DependencyLog 'The recorded ImageMagick executable is already absent. Clearing only dependency ownership values.'
        if (-not $PreflightOnly) { Clear-DependencyOwnership }
        return 0
    }
    $unins = Get-AdjacentImageMagickUninstaller $exe
    if (-not $unins) { throw 'Owned ImageMagick is present but its adjacent uninstaller is missing. Ownership has been retained for repair.' }
    Assert-ImageMagickTarget $exe $unins
    if ($state.ImageMagickUninstallExe -and [IO.Path]::GetFullPath([string]$state.ImageMagickUninstallExe) -ne $unins) {
        throw 'ImageMagick uninstaller path changed. Ownership has been retained for review.'
    }
    if ($state.ImageMagickUninstallSHA256 -and
        (Get-FileHash -LiteralPath $unins -Algorithm SHA256).Hash -ne $state.ImageMagickUninstallSHA256) {
        throw 'ImageMagick uninstaller changed. Ownership has been retained for review.'
    }
    if (-not (Test-DependencyAdministrator)) {
        Write-DependencyLog 'Administrator permission is required to remove the owned ImageMagick installation. Re-run the Dashboard uninstaller as administrator; no hidden UAC prompt was opened.'
        return 740
    }
    if ($PreflightOnly) { return 0 }
    $code = Invoke-DependencyProcess $unins @('/VERYSILENT', '/SILENT', '/SUPPRESSMSGBOXES', '/NORESTART')
    if ($code -ne 0) {
        Write-DependencyLog ("ImageMagick removal failed (exit " + $code + '). Ownership retained; Dashboard uninstall must stop for retry.')
        return $code
    }
    if (Test-Path -LiteralPath $exe) { throw 'ImageMagick remains after its uninstaller returned success. Ownership has been retained.' }
    Clear-DependencyOwnership
    Write-DependencyLog 'Owned ImageMagick removal verified. Dependency ownership values cleared.'
    return 0
}
try { exit (Invoke-FarmDashDependencyRemoval $Edition $CheckOnly.IsPresent) }
catch {
    Write-DependencyLog ("ImageMagick removal incomplete: " + $_.Exception.Message)
    exit 1
}
