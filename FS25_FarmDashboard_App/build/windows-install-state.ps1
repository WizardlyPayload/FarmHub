#Requires -Version 5.1
# V5 registration only. Never installs/removes application files or dependencies.
param(
    [ValidateSet('Library', 'Register', 'Remove')][string]$Action = 'Library',
    [string]$InstallDirectory,
    [ValidateSet('CurrentUser', 'all')][string]$Scope = 'CurrentUser',
    [string]$Version = '5.0.2',
    [uint32]$EstimatedSizeKB = 0
)

function Invoke-FarmDashRegistryService([string]$Method, [hashtable]$Arguments) {
    # Invoke the out-of-process Windows registry provider. NSIS launched by a
    # packaged/virtualized parent can see a private HKU view which Installed Apps
    # and WinGet cannot enumerate. This provider targets the user's real SID.
    Invoke-CimMethod -Namespace root/default -ClassName StdRegProv -MethodName $Method `
        -Arguments $Arguments -OperationTimeoutSec 15 -ErrorAction Stop
}

function Get-FarmDashRegistryArguments(
    [ValidateSet('CurrentUser', 'all')][string]$InstallScope,
    [ValidateSet('Install', 'Uninstall', 'Dependency')][string]$Record
) {
    $guid = '11de34ca-2bb0-58cf-bf02-9951a95a886c'
    $key = if ($Record -eq 'Install') { 'Software\' + $guid } else {
        'Software\Microsoft\Windows\CurrentVersion\Uninstall\' + $guid
    }
    if ($Record -eq 'Dependency') {
        if ($InstallScope -ne 'CurrentUser') { throw 'Dependency ownership belongs to the installing user.' }
        $key = 'Software\fs25-farm-dashboard'
    }
    if ($InstallScope -eq 'all') {
        return @{ hDefKey = [uint32]2147483650; sSubKeyName = $key }
    }
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    return @{ hDefKey = [uint32]2147483651; sSubKeyName = $sid + '\' + $key }
}

function Read-FarmDashNativeString([string]$InstallScope, [string]$Record, [string]$Name) {
    $arguments = Get-FarmDashRegistryArguments $InstallScope $Record
    $arguments.sValueName = $Name
    $result = Invoke-FarmDashRegistryService 'GetStringValue' $arguments
    if ($result.ReturnValue -eq 2) { return $null }
    if ($result.ReturnValue -eq 1) {
        # StdRegProv also returns 1 when the key exists but this value does not.
        # Confirm absence before accepting it: wrong types, denied reads and
        # provider failures must remain errors, not become "not installed".
        $enumeration = Invoke-FarmDashRegistryService 'EnumValues' (Get-FarmDashRegistryArguments $InstallScope $Record)
        if ($enumeration.ReturnValue -eq 2 -or
            ($enumeration.ReturnValue -eq 0 -and @($enumeration.sNames) -notcontains $Name)) {
            return $null
        }
    }
    if ($result.ReturnValue -ne 0) { throw "Cannot read V5 registration ($Name, exit $($result.ReturnValue))." }
    return $result.sValue
}

function Write-FarmDashNativeValue([string]$InstallScope, [string]$Record, [string]$Name, $Value) {
    $arguments = Get-FarmDashRegistryArguments $InstallScope $Record
    $result = Invoke-FarmDashRegistryService 'CreateKey' $arguments
    if ($result.ReturnValue -ne 0) { throw "Cannot create V5 registration (exit $($result.ReturnValue))." }
    $arguments.sValueName = $Name
    if ($Value -is [uint32] -or $Value -is [int]) {
        $arguments.uValue = [uint32]$Value
        $method = 'SetDWORDValue'
    } else {
        $arguments.sValue = [string]$Value
        $method = 'SetStringValue'
    }
    $result = Invoke-FarmDashRegistryService $method $arguments
    if ($result.ReturnValue -ne 0) { throw "Cannot write V5 registration ($Name, exit $($result.ReturnValue))." }
}

function Get-FarmDashInstallDirectory([string]$Directory) {
    if ([string]::IsNullOrWhiteSpace($Directory) -or -not [IO.Path]::IsPathRooted($Directory) -or
        $Directory -match '["\r\n]') { throw 'An absolute V5 installation directory is required.' }
    $full = [IO.Path]::GetFullPath($Directory).TrimEnd('\', '/')
    if ($full -eq [IO.Path]::GetPathRoot($full).TrimEnd('\', '/')) {
        throw 'A drive root is not a V5 installation directory.'
    }
    return $full
}

function Remove-FarmDashLocalShadowRecord(
    [string]$Directory,
    [string]$InstallScope,
    [ValidateSet('Install', 'Uninstall')][string]$Record,
    [hashtable]$RegistryArguments = $null
) {
    # A launcher can give NSIS a private registry view. The Windows-visible
    # record was removed through StdRegProv above, but NSIS's local copy can
    # otherwise retain an uninstall command pointing to a removed executable.
    $arguments = if ($null -ne $RegistryArguments) {
        $RegistryArguments
    } else {
        Get-FarmDashRegistryArguments $InstallScope $Record
    }
    $hive = if ($InstallScope -eq 'all') {
        [Microsoft.Win32.RegistryHive]::LocalMachine
    } else {
        [Microsoft.Win32.RegistryHive]::Users
    }
    $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey($hive, [Microsoft.Win32.RegistryView]::Default)
    try {
        $key = $base.OpenSubKey($arguments.sSubKeyName, $false)
        if (-not $key) { return }
        try {
            if ($Record -eq 'Install') {
                if ($key.GetValueKind('InstallLocation') -ne [Microsoft.Win32.RegistryValueKind]::String -or
                    (Get-FarmDashInstallDirectory ([string]$key.GetValue('InstallLocation'))) -ne $Directory) {
                    throw 'Local V5 install record belongs to a different location. Refusing to remove it.'
                }
            } else {
                $flag = if ($InstallScope -eq 'all') { '/allusers' } else { '/currentuser' }
                $expected = '"' + (Join-Path $Directory 'Uninstall FS25 Farm Dashboard V5.exe') + '" ' + $flag
                if ($key.GetValueKind('UninstallString') -ne [Microsoft.Win32.RegistryValueKind]::String -or
                    [string]$key.GetValue('UninstallString') -ne $expected -or
                    $key.GetValueKind('DisplayName') -ne [Microsoft.Win32.RegistryValueKind]::String -or
                    -not ([string]$key.GetValue('DisplayName')).StartsWith('FS25 Farm Dashboard V5 ')) {
                    throw 'Local V5 uninstall record does not match this installation. Refusing to remove it.'
                }
            }
        } finally { $key.Dispose() }
        $base.DeleteSubKey($arguments.sSubKeyName, $false)
        $remaining = $base.OpenSubKey($arguments.sSubKeyName, $false)
        if ($remaining) {
            $remaining.Dispose()
            throw "Local V5 $Record record remains after cleanup."
        }
    } finally { $base.Dispose() }
}

function Register-FarmDashNativeInstallation([string]$Directory, [string]$InstallScope, [string]$AppVersion, [uint32]$SizeKB) {
    $full = Get-FarmDashInstallDirectory $Directory
    if ($AppVersion -notmatch '^5\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$') { throw 'V5 registration requires a V5 version.' }
    $exe = Join-Path $full 'FS25 Farm Dashboard V5.exe'
    $uninstaller = Join-Path $full 'Uninstall FS25 Farm Dashboard V5.exe'
    foreach ($file in @($exe, $uninstaller)) {
        $item = Get-Item -LiteralPath $file -Force -ErrorAction Stop
        if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw 'The V5 executable and uninstaller must be regular files.'
        }
    }
    $flag = if ($InstallScope -eq 'all') { '/allusers' } else { '/currentuser' }
    $command = '"' + $uninstaller + '" ' + $flag
    $display = 'FS25 Farm Dashboard V5 ' + $AppVersion
    $existingName = Read-FarmDashNativeString $InstallScope 'Uninstall' 'DisplayName'
    $existingCommand = Read-FarmDashNativeString $InstallScope 'Uninstall' 'UninstallString'
    if ($null -ne $existingName -or $null -ne $existingCommand) {
        if ($null -ne $existingName -and -not $existingName.StartsWith('FS25 Farm Dashboard V5 ')) {
            throw 'The V5 Windows uninstall identity belongs to a different application.'
        }
        if ($null -ne $existingCommand -and $existingCommand -ne $command) {
            throw 'The V5 Windows uninstall identity points to a different installation.'
        }
        if ($null -eq $existingName -or $null -eq $existingCommand) {
            throw 'The existing V5 Windows uninstall entry is incomplete.'
        }
        if ($existingName -ne $display -or
            (Read-FarmDashNativeString $InstallScope 'Uninstall' 'DisplayVersion') -ne $AppVersion) {
            throw 'The V5 native uninstall entry has the wrong version.'
        }
    }
    Write-FarmDashNativeValue $InstallScope 'Install' 'InstallLocation' $full
    Write-FarmDashNativeValue $InstallScope 'Install' 'KeepShortcuts' 'true'
    Write-FarmDashNativeValue $InstallScope 'Install' 'ShortcutName' 'Farm Dashboard V5'
    # NSIS created its native uninstall entry before customInstall. Leave a
    # matching entry untouched: 5.1.5 changed that entry a second time and it
    # disappeared from Windows uninstall lists. A launcher may instead give
    # NSIS a private registry view; only then publish the minimal entry through
    # the out-of-process provider that Windows itself can enumerate.
    if ($null -eq $existingName -and $null -eq $existingCommand) {
        $values = [ordered]@{
            UninstallString = $command
            QuietUninstallString = $command + ' /S'
            DisplayVersion = $AppVersion
            DisplayIcon = $exe + ',0'
            Publisher = 'JoshWalki / Wizardlypayload & WizardlyPayload'
            Comments = 'Real-time Farm Management Dashboard for FS25'
            NoModify = [uint32]1
            NoRepair = [uint32]1
        }
        if ($SizeKB -gt 0) { $values.EstimatedSize = $SizeKB }
        foreach ($name in $values.Keys) { Write-FarmDashNativeValue $InstallScope 'Uninstall' $name $values[$name] }
        Write-FarmDashNativeValue $InstallScope 'Uninstall' 'DisplayName' $display
    }
    if ((Read-FarmDashNativeString $InstallScope 'Uninstall' 'DisplayName') -ne $display -or
        (Read-FarmDashNativeString $InstallScope 'Uninstall' 'UninstallString') -ne $command -or
        (Read-FarmDashNativeString $InstallScope 'Install' 'InstallLocation') -ne $full) {
        throw 'Windows cannot read back the V5 installation registration. Setup must not report success.'
    }
    Write-Host 'V5 installation and uninstall entry read back through the Windows registry service.'
}

function Remove-FarmDashNativeRegistration([string]$Directory, [string]$InstallScope) {
    $full = Get-FarmDashInstallDirectory $Directory
    # Called only AFTER NSIS has removed the application, never before cleanup.
    if (Test-Path -LiteralPath (Join-Path $full 'FS25 Farm Dashboard V5.exe')) {
        throw 'V5 application files remain. Its Windows registration must be retained.'
    }
    $flag = if ($InstallScope -eq 'all') { '/allusers' } else { '/currentuser' }
    $expectedCommand = '"' + (Join-Path $full 'Uninstall FS25 Farm Dashboard V5.exe') + '" ' + $flag
    $uninstallLocation = Read-FarmDashNativeString $InstallScope 'Uninstall' 'InstallLocation'
    $uninstallCommand = Read-FarmDashNativeString $InstallScope 'Uninstall' 'UninstallString'
    $uninstallName = Read-FarmDashNativeString $InstallScope 'Uninstall' 'DisplayName'
    $installLocation = Read-FarmDashNativeString $InstallScope 'Install' 'InstallLocation'
    foreach ($location in @($uninstallLocation, $installLocation)) {
        if ($null -ne $location -and (Get-FarmDashInstallDirectory $location) -ne $full) {
            throw 'V5 registration points to a different installation. Refusing to remove it.'
        }
    }
    if ($null -ne $uninstallCommand -and $uninstallCommand -ne $expectedCommand) {
        throw 'V5 uninstall command points to a different installation. Refusing to remove it.'
    }
    if ($null -eq $uninstallLocation -and $null -eq $uninstallCommand -and $null -ne $uninstallName) {
        throw 'V5 uninstall entry has no verifiable installation path. Refusing to remove it.'
    }
    # NSIS can leave the Windows uninstall key without InstallLocation even when
    # its exact UninstallString is valid. Do not leave that visible key orphaned.
    if ($null -ne $uninstallLocation -or $null -ne $uninstallCommand) {
        $result = Invoke-FarmDashRegistryService 'DeleteKey' (Get-FarmDashRegistryArguments $InstallScope 'Uninstall')
        if ($result.ReturnValue -notin @(0, 2)) { throw "V5 uninstall registration cleanup failed (exit $($result.ReturnValue))." }
        if ($null -ne (Read-FarmDashNativeString $InstallScope 'Uninstall' 'UninstallString') -or
            $null -ne (Read-FarmDashNativeString $InstallScope 'Uninstall' 'DisplayName')) {
            throw 'Windows still reports the removed V5 uninstall entry.'
        }
    }
    if ($null -ne $installLocation) {
        $result = Invoke-FarmDashRegistryService 'DeleteKey' (Get-FarmDashRegistryArguments $InstallScope 'Install')
        if ($result.ReturnValue -notin @(0, 2)) { throw "V5 installation registration cleanup failed (exit $($result.ReturnValue))." }
        if ($null -ne (Read-FarmDashNativeString $InstallScope 'Install' 'InstallLocation')) {
            throw 'Windows still reports the removed V5 installation.'
        }
    }
    Remove-FarmDashLocalShadowRecord $full $InstallScope 'Uninstall'
    Remove-FarmDashLocalShadowRecord $full $InstallScope 'Install'
    Write-Host 'V5 Windows registration cleanup completed.'
}

if ($Action -ne 'Library') {
    $ErrorActionPreference = 'Stop'
    try {
        if ($Action -eq 'Register') {
            Register-FarmDashNativeInstallation $InstallDirectory $Scope $Version $EstimatedSizeKB
        } else {
            Remove-FarmDashNativeRegistration $InstallDirectory $Scope
        }
        exit 0
    } catch {
        $message = '[' + (Get-Date -Format o) + '] ' + $_.Exception.Message
        Write-Host $message
        Add-Content -LiteralPath (Join-Path $env:TEMP 'FarmDashWindowsRegistration.log') -Value $message -Encoding UTF8 -ErrorAction SilentlyContinue
        exit 1
    }
}
