param([Parameter(Mandatory)][string]$BuildRoot, [Parameter(Mandatory)][string]$FixtureRoot)
$ErrorActionPreference = 'Stop'
$fixture = [IO.Path]::GetFullPath($FixtureRoot)
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
if (-not $fixture.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -or
    (Split-Path -Leaf $fixture) -notlike 'farmdash-installer-runtime-*') {
    throw 'Fixture must be a uniquely named test directory inside TEMP.'
}
$shell = (Get-Process -Id $PID).Path
$results = [ordered]@{ otherProfilesIntact = $true }
foreach ($scenario in @('keep', 'full', 'alias', 'locked')) {
    $caseRoot = Join-Path $fixture $scenario
    $env:APPDATA = Join-Path $caseRoot 'Roaming'
    $env:LOCALAPPDATA = Join-Path $caseRoot 'Local'
    $env:TEMP = Join-Path $caseRoot 'Temp'
    $env:TMP = $env:TEMP
    New-Item -ItemType Directory -Path $env:TEMP -Force | Out-Null
    foreach ($parent in @($env:APPDATA, $env:LOCALAPPDATA)) {
        foreach ($name in @('fs25-farm-dashboard-rf', 'fs25-farm-dashboard-rf-updater', 'com.farmdashboard.rf-updater',
                'fs25-farm-dashboard', 'unrelated-app')) {
            $dir = Join-Path $parent $name
            New-Item -ItemType Directory -Path (Join-Path $dir 'serverLiveCache') -Force | Out-Null
            Set-Content -LiteralPath (Join-Path $dir 'config.json') -Value '{"synthetic":true}'
            Set-Content -LiteralPath (Join-Path $dir 'serverLiveCache\offline.json') -Value '{"syntheticSnapshot":true}'
            Set-Content -LiteralPath (Join-Path $dir 'cache.tmp') -Value 'synthetic-cache'
        }
    }
    $rf = Join-Path $env:APPDATA 'fs25-farm-dashboard-rf'
    $mode = if ($scenario -eq 'keep') { 'Keep' } else { 'Full' }
    $edition = if ($scenario -eq 'alias') { 'Rf' } else { 'V5' }
    $held = $null
    try {
        if ($scenario -eq 'locked') { $held = [IO.File]::Open((Join-Path $rf 'cache.tmp'), [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::None) }
        & $shell -NoProfile -NonInteractive -File (Join-Path $BuildRoot 'uninstall-user-data.ps1') -Mode $mode -Edition $edition
        $results[$scenario + 'Exit'] = $LASTEXITCODE
        if ($scenario -eq 'locked') { $results.lockedRemains = Test-Path -LiteralPath (Join-Path $rf 'cache.tmp') }
    } finally { if ($held) { $held.Dispose() } }
    if ($scenario -eq 'keep') {
        $results.keepConfig = Test-Path -LiteralPath (Join-Path $rf 'config.json')
        $results.keepSnapshots = Test-Path -LiteralPath (Join-Path $rf 'serverLiveCache\offline.json')
        $results.keepCacheRemoved = -not (Test-Path -LiteralPath (Join-Path $rf 'cache.tmp'))
        $results.keepLocalRemoved = -not (Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA 'fs25-farm-dashboard-rf'))
    } elseif ($scenario -eq 'locked') {
        & $shell -NoProfile -NonInteractive -File (Join-Path $BuildRoot 'uninstall-user-data.ps1') -Mode Full -Edition V5
        $results.retryExit = $LASTEXITCODE
        $results.retryRemoved = -not (Test-Path -LiteralPath $rf)
    } else { $results[$scenario + 'Removed'] = -not (Test-Path -LiteralPath $rf) }
    foreach ($parent in @($env:APPDATA, $env:LOCALAPPDATA)) {
        foreach ($name in @('fs25-farm-dashboard', 'unrelated-app')) {
            if (-not (Test-Path -LiteralPath (Join-Path (Join-Path $parent $name) 'config.json'))) { $results.otherProfilesIntact = $false }
        }
    }
}

. (Join-Path $BuildRoot 'imagemagick-common.ps1')
# Exercise the real discovery code with the environment inherited by a cold
# 32-bit installer. These are synthetic files, never executable dependencies.
$savedEnvironment = @{}
foreach ($key in @('ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432', 'PATH')) {
    $savedEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
}
try {
    $native = Join-Path $fixture 'Native64'
    $x86 = Join-Path $fixture 'X86'
    $nativeMod = Join-Path $native 'ImageMagick-native'
    New-Item -ItemType Directory -Path $nativeMod, $x86 -Force | Out-Null
    $nativeExe = Join-Path $nativeMod 'magick.exe'
    Set-Content -LiteralPath $nativeExe -Value 'synthetic-executable-never-run'
    $env:ProgramFiles = $x86
    ${env:ProgramFiles(x86)} = $x86
    $env:ProgramW6432 = $native
    $env:PATH = Join-Path $env:SystemRoot 'System32'
    $candidates = @(Get-ImageMagickCandidates)
    $results.native64Discovered = $candidates -contains $nativeExe
    $results.native64CandidateCount = $candidates.Count
    $env:ProgramFiles = $native
    $results.duplicateRootsCandidateCount = @(Get-ImageMagickCandidates).Count
    $env:ProgramFiles = $x86
    $env:ProgramW6432 = $x86
    $results.legacyMissingThrows = $false
    try { $null = Resolve-OwnedImageMagick ([pscustomobject]@{ImageMagickInstalledByFarmDash='1'}) }
    catch { $results.legacyMissingThrows = $true }
} finally {
    foreach ($key in $savedEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($key, $savedEnvironment[$key], 'Process')
    }
}
$timeoutScript = Join-Path $fixture 'bounded-child.ps1'
Set-Content -LiteralPath $timeoutScript -Value 'Start-Sleep -Seconds 3'
$watch = [Diagnostics.Stopwatch]::StartNew()
$results.timeoutExit = Invoke-DependencyProcess $shell @('-NoProfile', '-NonInteractive', '-File', ('"' + $timeoutScript + '"')) 1
$results.timeoutElapsedMs = $watch.ElapsedMilliseconds

$imBundleDir = Join-Path $fixture 'imagemagick'
New-Item -ItemType Directory -Path $imBundleDir -Force | Out-Null
Set-Content -LiteralPath (Join-Path $imBundleDir 'ImageMagick-7.1.2-24-Q16-HDRI-x64-dll.exe') -Value 'synthetic-installer-never-run'

# Execute the production entry functions with synthetic external boundaries.
# No real registry, installer, uninstaller, package manager, or elevation is invoked.
function Import-EntryFunction([string]$File, [string]$Name) {
    $tokens = $null; $errors = $null
    $ast = [Management.Automation.Language.Parser]::ParseFile($File, [ref]$tokens, [ref]$errors)
    if ($errors.Count -gt 0) { throw ($errors | Out-String) }
    $node = $ast.Find({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $Name }, $false)
    if (-not $node) { throw "Missing production function $Name" }
    return $node.Extent.Text
}
. ([scriptblock]::Create((Import-EntryFunction (Join-Path $BuildRoot 'install-imagemagick.ps1') 'Invoke-FarmDashImageMagickInstall')))
. ([scriptblock]::Create((Import-EntryFunction (Join-Path $BuildRoot 'uninstall-dependencies.ps1') 'Invoke-FarmDashDependencyRemoval')))
$script:ApprovedImageMagickName = 'ImageMagick-7.1.2-24-Q16-HDRI-x64-dll.exe'
$script:ApprovedImageMagickHash = '5665E6B0C27591AB3103E757D509EEF85508133D0312390D6EAEBF78BDBB4C8A'
$script:policy = $null
function Write-DependencyLog([string]$Message) { }
function Get-ImageMagickCandidates {
    if ($script:policy.started -gt 0 -and $script:policy.candidatesAfterInstall) {
        return @($script:policy.candidatesAfterInstall)
    }
    return @($script:policy.candidates)
}
function Register-DependencyConsumer([string]$Edition) { }
function Register-OwnedImageMagick { $script:policy.ownershipWrites++ }
function Test-DependencyAdministrator { $script:policy.administratorChecks++; return $script:policy.admin }
function Get-DependencyState { return $script:policy.state }
function Test-OtherDashboardInstalled { return $script:policy.shared }
function Resolve-OwnedImageMagick { return $script:policy.exe }
function Get-AdjacentImageMagickUninstaller { return $script:policy.uninstaller }
function Assert-ImageMagickTarget { }
function Clear-DependencyOwnership { $script:policy.cleared = $true }
function Get-FileHash { [pscustomobject]@{ Hash = '5665E6B0C27591AB3103E757D509EEF85508133D0312390D6EAEBF78BDBB4C8A' } }
function Invoke-DependencyProcess {
    $script:policy.started++
    if ($script:policy.disappear) {
        $target = [IO.Path]::GetFullPath($script:policy.exe)
        if (-not $target.StartsWith($fixture + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe mock deletion target' }
        Remove-Item -LiteralPath $target -Force
    }
    return $script:policy.exitCode
}
function Invoke-ElevatedDependencyProcess {
    $script:policy.started++
    $script:policy.elevatedStarts++
    return $script:policy.exitCode
}
foreach ($name in @('existingInstall', 'existingOwnedInstall', 'noAdminInstall', 'externalRemoval', 'sharedRemoval', 'noAdminRemoval',
        'cancelledRemoval', 'timedOutRemoval', 'remainingRemoval', 'successfulRemoval', 'changedUninstaller')) {
    $dir = Join-Path $fixture ('ImageMagick-' + $name)
    New-Item -ItemType Directory -Path $dir | Out-Null
    $exe = Join-Path $dir 'magick.exe'
    $uninstaller = Join-Path $dir 'unins000.exe'
    Set-Content -LiteralPath $exe -Value 'synthetic-executable-never-run'
    Set-Content -LiteralPath $uninstaller -Value 'synthetic-uninstaller-never-run'
    $script:policy = @{
        candidates = @(); candidatesAfterInstall = $null; started = 0; elevatedStarts = 0
        administratorChecks = 0; ownershipWrites = 0; cleared = $false
        admin = $true; shared = $false; exe = $exe; uninstaller = $uninstaller; exitCode = 0; disappear = $false
        state = [pscustomobject]@{ ImageMagickInstalledByFarmDash = '1' }
    }
    switch ($name) {
        'existingInstall' { $script:policy.candidates = @($exe); $script:policy.state.ImageMagickInstalledByFarmDash = '0' }
        'existingOwnedInstall' { $script:policy.candidates = @($exe) }
        'noAdminInstall' { $script:policy.admin = $false; $script:policy.candidatesAfterInstall = $exe }
        'externalRemoval' { $script:policy.state.ImageMagickInstalledByFarmDash = '0' }
        'sharedRemoval' { $script:policy.shared = $true }
        'noAdminRemoval' { $script:policy.admin = $false }
        'cancelledRemoval' { $script:policy.exitCode = 1223 }
        'timedOutRemoval' { $script:policy.exitCode = 1460 }
        'successfulRemoval' { $script:policy.disappear = $true }
        'changedUninstaller' { $script:policy.state | Add-Member NoteProperty ImageMagickUninstallSHA256 'not-the-current-hash' }
    }
    $code = $null; $threw = $false
    try {
        if ($name -like '*Install') { $code = Invoke-FarmDashImageMagickInstall $fixture 'V5' }
        else { $code = Invoke-FarmDashDependencyRemoval 'V5' }
    } catch { $threw = $true }
    $results[$name] = @{
        code = $code; threw = $threw; started = $script:policy.started
        elevatedStarts = $script:policy.elevatedStarts
        administratorChecks = $script:policy.administratorChecks
        ownershipWrites = $script:policy.ownershipWrites; cleared = $script:policy.cleared
    }
}
Write-Output ('RESULT_JSON=' + ($results | ConvertTo-Json -Depth 6 -Compress))
