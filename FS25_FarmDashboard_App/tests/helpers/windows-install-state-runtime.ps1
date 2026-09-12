param([string]$SourceRoot, [string]$Case)
$ErrorActionPreference = 'Stop'
. (Join-Path $SourceRoot 'build\windows-install-state.ps1')
$script:records = @{}
$script:calls = @()
$script:dropWrites = $Case -eq 'invisible-write'
$script:denyWrites = $Case -eq 'denied-write'
function Invoke-FarmDashRegistryService([string]$Method, [hashtable]$Arguments) {
    $script:calls += $Method
    $key = [string]$Arguments.hDefKey + ':' + $Arguments.sSubKeyName
    switch ($Method) {
        'CreateKey' {
            if ($script:denyWrites) { return @{ ReturnValue = 5 } }
            if (-not $script:records.ContainsKey($key)) { $script:records[$key] = @{} }
            return @{ ReturnValue = 0 }
        }
        'SetStringValue' {
            if (-not $script:dropWrites) { $script:records[$key][$Arguments.sValueName] = $Arguments.sValue }
            return @{ ReturnValue = 0 }
        }
        'SetDWORDValue' {
            if (-not $script:dropWrites) { $script:records[$key][$Arguments.sValueName] = $Arguments.uValue }
            return @{ ReturnValue = 0 }
        }
        'GetStringValue' {
            if ($Arguments.sValueName -eq 'DisplayName' -and $Case -eq 'existing-value-read-error') {
                return @{ ReturnValue = 1; sValue = $null }
            }
            if ($Arguments.sValueName -eq 'DisplayName' -and $Case -eq 'read-access-denied') {
                return @{ ReturnValue = 5; sValue = $null }
            }
            if ($script:records.ContainsKey($key) -and $script:records[$key].ContainsKey($Arguments.sValueName)) {
                if ($script:records[$key][$Arguments.sValueName] -isnot [string]) {
                    return @{ ReturnValue = 1; sValue = $null }
                }
                return @{ ReturnValue = 0; sValue = $script:records[$key][$Arguments.sValueName] }
            }
            if ($script:records.ContainsKey($key)) { return @{ ReturnValue = 1; sValue = $null } }
            return @{ ReturnValue = 2; sValue = $null }
        }
        'EnumValues' {
            if ($Case -eq 'enumeration-access-denied') { return @{ ReturnValue = 5 } }
            if ($script:records.ContainsKey($key)) {
                return @{ ReturnValue = 0; sNames = @($script:records[$key].Keys) }
            }
            return @{ ReturnValue = 2; sNames = $null }
        }
        'DeleteKey' { $script:records.Remove($key); return @{ ReturnValue = 0 } }
        'DeleteValue' {
            if ($script:records.ContainsKey($key)) { $script:records[$key].Remove($Arguments.sValueName) }
            return @{ ReturnValue = 0 }
        }
        default { throw "Unexpected registry method: $Method" }
    }
}
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('FarmDash-native-registry-fixture-' + [Guid]::NewGuid().ToString('n'))
New-Item -ItemType Directory -Path $fixture | Out-Null
$exe = Join-Path $fixture 'FS25 Farm Dashboard V5.exe'
$uninstaller = Join-Path $fixture 'Uninstall FS25 Farm Dashboard V5.exe'
[IO.File]::WriteAllText($exe, 'Non-executable fixture; never launched.')
[IO.File]::WriteAllText($uninstaller, 'Non-executable fixture; never launched.')
$scope = if ($Case -eq 'machine') { 'all' } else { 'CurrentUser' }
$errorText = $null
try {
    Register-FarmDashNativeInstallation $fixture $scope '5.0.3' 1234
    if ($Case -in @('missing-optional-value', 'enumeration-access-denied')) {
        $script:optionalValue = Read-FarmDashNativeString $scope 'Uninstall' 'AbsentOptionalValue'
    }
    if ($Case -eq 'wrong-value-type') {
        $script:optionalValue = Read-FarmDashNativeString $scope 'Uninstall' 'NoModify'
    }
    if ($Case -in @('ownership', 'retired-ownership')) {
        . (Join-Path $SourceRoot 'build\imagemagick-common.ps1')
        $script:FarmDashNativeDependencyRegistry = $true
        $script:FarmDashAllowDependencyRecovery = $true
        Write-FarmDashNativeValue 'CurrentUser' 'Dependency' 'ImageMagickInstalledByFarmDash' '1'
        Write-FarmDashNativeValue 'CurrentUser' 'Dependency' 'ImageMagickExecutable' 'C:\ImageMagick-fixture\magick.exe'
        if ($Case -eq 'retired-ownership') { Clear-DependencyOwnership }
        $observed = Get-DependencyState
        $script:ownershipResult = @{ flag = $observed.ImageMagickInstalledByFarmDash; executable = $observed.ImageMagickExecutable; recovery = $script:FarmDashDependencyRecoveryPending }
    }
    if ($Case -eq 'preflight-only') {
        $tokens = $null; $parseErrors = $null
        $ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $SourceRoot 'build\uninstall-dependencies.ps1'), [ref]$tokens, [ref]$parseErrors)
        if ($parseErrors.Count) { throw 'Cannot parse dependency-removal fixture source.' }
        $fn = $ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Invoke-FarmDashDependencyRemoval'}, $true)
        Invoke-Expression $fn.Extent.Text
        function Write-DependencyLog([string]$Message) {}
        function Get-DependencyState { [pscustomobject]@{ ImageMagickInstalledByFarmDash = '1' } }
        function Test-OtherDashboardInstalled { return $false }
        function Resolve-OwnedImageMagick { return $exe }
        function Get-AdjacentImageMagickUninstaller { return $uninstaller }
        function Assert-ImageMagickTarget {}
        function Test-DependencyAdministrator { return $true }
        function Invoke-DependencyProcess { throw 'Preflight attempted to launch the vendor uninstaller.' }
        function Clear-DependencyOwnership { throw 'Preflight attempted to modify ownership.' }
        $script:preflightResult = Invoke-FarmDashDependencyRemoval 'V5' $true
    }
    if ($Case -eq 'remove-live') { Remove-FarmDashNativeRegistration $fixture $scope }
    if ($Case -in @('remove', 'remove-other')) {
        Remove-Item -LiteralPath $exe -Force
        if ($Case -eq 'remove-other') {
            Write-FarmDashNativeValue $scope 'Uninstall' 'InstallLocation' (Join-Path $fixture 'different-install')
        }
        Remove-FarmDashNativeRegistration $fixture $scope
    }
} catch { $errorText = $_.Exception.Message }
$state = [ordered]@{ case = $Case; error = $errorText; scope = $scope; records = $script:records; calls = $script:calls }
if ($Case -eq 'missing-optional-value') { $state.optionalValue = $script:optionalValue }
if ($script:ownershipResult) { $state.ownership = $script:ownershipResult }
if ($Case -eq 'preflight-only') { $state.preflightExitCode = $script:preflightResult }
# These are the two inert files just created, never actual installed files.
foreach ($file in @($exe, $uninstaller)) {
    if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force }
}
Remove-Item -LiteralPath $fixture -ErrorAction Stop
$state | ConvertTo-Json -Depth 6 -Compress
