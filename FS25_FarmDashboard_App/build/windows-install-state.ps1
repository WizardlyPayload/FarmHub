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
    # The service reads/writes the registration Windows sees, rather than an
    # inherited launcher's private registry view. It enforces the caller's ACLs.
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
    Write-FarmDashNativeValue $InstallScope 'Install' 'InstallLocation' $full
    Write-FarmDashNativeValue $InstallScope 'Install' 'KeepShortcuts' 'true'
    Write-FarmDashNativeValue $InstallScope 'Install' 'ShortcutName' 'Farm Dashboard V5'
    $values = [ordered]@{
        UninstallString = $command
        QuietUninstallString = $command + ' /S'
        DisplayVersion = $AppVersion
        DisplayIcon = $exe + ',0'
        InstallLocation = $full
        InstallDate = (Get-Date -Format yyyyMMdd)
        Publisher = 'JoshWalki / Wizardlypayload & WizardlyPayload'
        Comments = 'Real-time Farm Management Dashboard for FS25'
        NoModify = [uint32]1
        NoRepair = [uint32]1
        NoRemove = [uint32]0
        SystemComponent = [uint32]0
    }
    if ($SizeKB -gt 0) { $values.EstimatedSize = $SizeKB }
    foreach ($name in $values.Keys) { Write-FarmDashNativeValue $InstallScope 'Uninstall' $name $values[$name] }
    # Publish the display name last, after the removal command is in place.
    $display = 'FS25 Farm Dashboard V5 ' + $AppVersion
    Write-FarmDashNativeValue $InstallScope 'Uninstall' 'DisplayName' $display
    if ((Read-FarmDashNativeString $InstallScope 'Uninstall' 'DisplayName') -ne $display -or
        (Read-FarmDashNativeString $InstallScope 'Uninstall' 'UninstallString') -ne $command -or
        (Read-FarmDashNativeString $InstallScope 'Install' 'InstallLocation') -ne $full) {
        throw 'Windows cannot read back the V5 installation registration. Setup must not report success.'
    }
    Write-Host 'V5 installation and uninstall command registered and read back through the Windows registry service.'
}

function Remove-FarmDashNativeRegistration([string]$Directory, [string]$InstallScope) {
    $full = Get-FarmDashInstallDirectory $Directory
    # Called only AFTER NSIS has removed the application, never before cleanup.
    if (Test-Path -LiteralPath (Join-Path $full 'FS25 Farm Dashboard V5.exe')) {
        throw 'V5 application files remain. Its Windows registration must be retained.'
    }
    foreach ($record in @('Uninstall', 'Install')) {
        $location = Read-FarmDashNativeString $InstallScope $record 'InstallLocation'
        if ($null -eq $location) { continue }
        if ((Get-FarmDashInstallDirectory $location) -ne $full) {
            throw 'V5 registration points to a different installation. Refusing to remove it.'
        }
    }
    foreach ($record in @('Uninstall', 'Install')) {
        $location = Read-FarmDashNativeString $InstallScope $record 'InstallLocation'
        if ($null -eq $location) { continue }
        $result = Invoke-FarmDashRegistryService 'DeleteKey' (Get-FarmDashRegistryArguments $InstallScope $record)
        if ($result.ReturnValue -notin @(0, 2)) { throw "V5 registration cleanup failed (exit $($result.ReturnValue))." }
        if ($null -ne (Read-FarmDashNativeString $InstallScope $record 'InstallLocation')) {
            throw 'Windows still reports the removed V5 installation.'
        }
    }
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
