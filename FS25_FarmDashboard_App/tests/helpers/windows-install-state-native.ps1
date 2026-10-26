param([Parameter(Mandatory = $true)][string]$SourceRoot)
$ErrorActionPreference = 'Stop'
. (Join-Path $SourceRoot 'build\windows-install-state.ps1')

$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$subKey = $sid + '\Software\Microsoft\Windows\CurrentVersion\Uninstall\FarmDashNativeTest-' + [Guid]::NewGuid().ToString('n')
$arguments = @{ hDefKey = [uint32]2147483651; sSubKeyName = $subKey }
$shadowSubKey = $sid + '\Software\Microsoft\Windows\CurrentVersion\Uninstall\FarmDashShadowTest-' + [Guid]::NewGuid().ToString('n')
$shadowInstallSubKey = $sid + '\Software\FarmDashShadowInstallTest-' + [Guid]::NewGuid().ToString('n')
$shadowArgs = @{ hDefKey = [uint32]2147483651; sSubKeyName = $shadowSubKey }
$shadowInstallArgs = @{ hDefKey = [uint32]2147483651; sSubKeyName = $shadowInstallSubKey }
$shadowDirectory = Join-Path $env:TEMP ('FarmDashShadowTest-' + [Guid]::NewGuid().ToString('n'))
$registryBase = [Microsoft.Win32.RegistryKey]::OpenBaseKey(
    [Microsoft.Win32.RegistryHive]::Users, [Microsoft.Win32.RegistryView]::Default)
$state = [ordered]@{
    error = $null
    readNativeValue = $null
    removedNativeKey = $false
    nativeSawHelperWrite = $null
    removedHelperKey = $false
    localUninstallShadowRemoved = $false
    localInstallShadowRemoved = $false
    mismatchedShadowPreserved = $false
}
try {
    # The independent Windows registry service creates this entry. A private
    # process view cannot satisfy the helper's readback.
    $created = Invoke-CimMethod -Namespace root/default -ClassName StdRegProv -MethodName CreateKey -Arguments $arguments
    if ($created.ReturnValue -ne 0) { throw "Windows service could not create key (exit $($created.ReturnValue))." }
    $written = Invoke-CimMethod -Namespace root/default -ClassName StdRegProv -MethodName SetStringValue -Arguments ($arguments + @{
        sValueName = 'Probe'; sValue = 'native-created'
    })
    if ($written.ReturnValue -ne 0) { throw "Windows service could not write key (exit $($written.ReturnValue))." }
    $read = Invoke-FarmDashRegistryService 'GetStringValue' ($arguments + @{ sValueName = 'Probe' })
    if ($read.ReturnValue -ne 0) { throw "Windows-visible key was invisible to helper (exit $($read.ReturnValue))." }
    $state.readNativeValue = $read.sValue
    $removed = Invoke-FarmDashRegistryService 'DeleteKey' $arguments
    if ($removed.ReturnValue -ne 0) { throw "Windows-visible key was not removed (exit $($removed.ReturnValue))." }
    $check = Invoke-CimMethod -Namespace root/default -ClassName StdRegProv -MethodName GetStringValue -Arguments ($arguments + @{
        sValueName = 'Probe'
    })
    $state.removedNativeKey = $check.ReturnValue -in @(1, 2)

    $created = Invoke-FarmDashRegistryService 'CreateKey' $arguments
    if ($created.ReturnValue -ne 0) { throw "Helper could not create key (exit $($created.ReturnValue))." }
    $written = Invoke-FarmDashRegistryService 'SetStringValue' ($arguments + @{
        sValueName = 'Probe'; sValue = 'helper-created'
    })
    if ($written.ReturnValue -ne 0) { throw "Helper could not write key (exit $($written.ReturnValue))." }
    $check = Invoke-CimMethod -Namespace root/default -ClassName StdRegProv -MethodName GetStringValue -Arguments ($arguments + @{
        sValueName = 'Probe'
    })
    if ($check.ReturnValue -ne 0) { throw "Helper write was invisible to Windows service (exit $($check.ReturnValue))." }
    $state.nativeSawHelperWrite = $check.sValue
    $removed = Invoke-FarmDashRegistryService 'DeleteKey' $arguments
    if ($removed.ReturnValue -ne 0) { throw "Helper key was not removed (exit $($removed.ReturnValue))." }
    $check = Invoke-CimMethod -Namespace root/default -ClassName StdRegProv -MethodName GetStringValue -Arguments ($arguments + @{
        sValueName = 'Probe'
    })
    $state.removedHelperKey = $check.ReturnValue -in @(1, 2)

    $shadow = $registryBase.CreateSubKey($shadowSubKey)
    $expectedCommand = '"' + (Join-Path $shadowDirectory 'Uninstall FS25 Farm Dashboard V5.exe') + '" /currentuser'
    $shadow.SetValue('DisplayName', 'FS25 Farm Dashboard V5 5.1.7')
    $shadow.SetValue('UninstallString', $expectedCommand)
    $shadow.Dispose()
    Remove-FarmDashLocalShadowRecord $shadowDirectory 'CurrentUser' 'Uninstall' $shadowArgs
    $check = $registryBase.OpenSubKey($shadowSubKey)
    $state.localUninstallShadowRemoved = $null -eq $check
    if ($check) { $check.Dispose() }

    $shadow = $registryBase.CreateSubKey($shadowInstallSubKey)
    $shadow.SetValue('InstallLocation', $shadowDirectory)
    $shadow.Dispose()
    Remove-FarmDashLocalShadowRecord $shadowDirectory 'CurrentUser' 'Install' $shadowInstallArgs
    $check = $registryBase.OpenSubKey($shadowInstallSubKey)
    $state.localInstallShadowRemoved = $null -eq $check
    if ($check) { $check.Dispose() }

    $shadow = $registryBase.CreateSubKey($shadowSubKey)
    $shadow.SetValue('DisplayName', 'FS25 Farm Dashboard V5 5.1.7')
    $shadow.SetValue('UninstallString', '"C:\other-app\uninstall.exe" /currentuser')
    $shadow.Dispose()
    try {
        Remove-FarmDashLocalShadowRecord $shadowDirectory 'CurrentUser' 'Uninstall' $shadowArgs
    } catch {
        $check = $registryBase.OpenSubKey($shadowSubKey)
        $state.mismatchedShadowPreserved = $null -ne $check -and
            $_.Exception.Message -match 'does not match'
        if ($check) { $check.Dispose() }
    }
} catch {
    $state.error = $_.Exception.Message
    if ($state.error -match 'Local V5 install record belongs') {
        $record = $registryBase.OpenSubKey($shadowInstallSubKey, $false)
        try {
            $recordedDirectory = if ($record) { [string]$record.GetValue('InstallLocation') } else { $null }
            $state.pathDiagnostic = [ordered]@{
                requested = $shadowDirectory
                requestedFull = [IO.Path]::GetFullPath($shadowDirectory).TrimEnd('\', '/')
                recorded = $recordedDirectory
                recordedFull = if ($recordedDirectory) { [IO.Path]::GetFullPath($recordedDirectory).TrimEnd('\', '/') } else { $null }
            }
        } finally { if ($record) { $record.Dispose() } }
    }
} finally {
    $existing = Invoke-CimMethod -Namespace root/default -ClassName StdRegProv -MethodName EnumValues -Arguments $arguments
    if ($existing.ReturnValue -eq 0) {
        $removed = Invoke-CimMethod -Namespace root/default -ClassName StdRegProv -MethodName DeleteKey -Arguments $arguments
        if ($removed.ReturnValue -ne 0) { $state.error = "Fixture cleanup failed (exit $($removed.ReturnValue))." }
    }
    foreach ($keyName in @($shadowSubKey, $shadowInstallSubKey)) {
        $leftover = $registryBase.OpenSubKey($keyName)
        if ($leftover) {
            $leftover.Dispose()
            $registryBase.DeleteSubKey($keyName, $false)
        }
    }
    $registryBase.Dispose()
}
$state | ConvertTo-Json -Compress
