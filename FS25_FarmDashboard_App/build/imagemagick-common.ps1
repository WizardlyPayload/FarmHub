#Requires -Version 5.1
# Shared definitions only. Entry scripts perform installation/removal.
$script:FarmDashDependencyKey = 'HKCU:\Software\fs25-farm-dashboard'
function Write-DependencyLog([string]$Message) {
    $line = '[{0}] {1}' -f (Get-Date -Format o), $Message
    Write-Host $line
    if ($script:DependencyLog) { Add-Content -LiteralPath $script:DependencyLog -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue }
}
function Get-DependencyState {
    if ($script:FarmDashNativeDependencyRegistry) {
        $values = @{}
        foreach ($name in @('ImageMagickInstalledByFarmDash', 'ImageMagickInstallMethod', 'ImageMagickExecutable',
                'ImageMagickUninstallExe', 'ImageMagickUninstallSHA256', 'ImageMagickOwnershipVersion',
                'ImageMagickConsumerV4', 'ImageMagickConsumerV5')) {
            $values[$name] = Read-FarmDashNativeString 'CurrentUser' 'Dependency' $name
        }
        $script:FarmDashDependencyRecoveryPending = $false
        if ($null -eq $values.ImageMagickInstalledByFarmDash -and $script:FarmDashAllowDependencyRecovery) {
            $legacy = Get-ItemProperty -LiteralPath $script:FarmDashDependencyKey -ErrorAction SilentlyContinue
            if ($legacy.ImageMagickInstalledByFarmDash -eq '1') {
                $script:FarmDashDependencyRecoveryPending = $true
                return $legacy
            }
        }
        return [pscustomobject]$values
    }
    return Get-ItemProperty -LiteralPath $script:FarmDashDependencyKey -ErrorAction SilentlyContinue
}
function Get-ImageMagickCandidates {
    $paths = @()
    $command = Get-Command magick.exe -ErrorAction SilentlyContinue
    if ($command -and $command.Source -and (Test-Path -LiteralPath $command.Source -PathType Leaf)) {
        $paths += [IO.Path]::GetFullPath($command.Source)
    }
    # NSIS can launch 32-bit PowerShell, where both ProgramFiles variables point
    # to the x86 directory. ProgramW6432 still identifies native 64-bit installs.
    foreach ($root in @($env:ProgramW6432, $env:ProgramFiles, ${env:ProgramFiles(x86)})) {
        if ([string]::IsNullOrWhiteSpace($root)) { continue }
        foreach ($dir in @(Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -like 'ImageMagick*' })) {
            $exe = Join-Path $dir.FullName 'magick.exe'
            if (Test-Path -LiteralPath $exe -PathType Leaf) { $paths += [IO.Path]::GetFullPath($exe) }
        }
    }
    return @($paths | Sort-Object -Unique)
}
function Get-AdjacentImageMagickUninstaller([string]$Executable) {
    $dir = Split-Path -Parent $Executable
    foreach ($name in @('unins000.exe', 'uninstall.exe')) {
        $file = Join-Path $dir $name
        if (Test-Path -LiteralPath $file -PathType Leaf) { return [IO.Path]::GetFullPath($file) }
    }
    return $null
}
function Assert-ImageMagickTarget([string]$Executable, [string]$Uninstaller) {
    $exe = [IO.Path]::GetFullPath($Executable)
    $unins = [IO.Path]::GetFullPath($Uninstaller)
    $dir = Split-Path -Parent $exe
    if ((Split-Path -Leaf $exe) -ne 'magick.exe' -or
        (Split-Path -Leaf $dir) -notlike 'ImageMagick*' -or
        (Split-Path -Parent $unins) -ne $dir -or
        (Split-Path -Leaf $unins) -notin @('unins000.exe', 'uninstall.exe')) {
        throw 'Refusing an ambiguous ImageMagick uninstall target.'
    }
    $cursor = $dir
    while ($cursor) {
        $item = Get-Item -LiteralPath $cursor -Force -ErrorAction Stop
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked ImageMagick paths require manual review.' }
        $parent = Split-Path -Parent $cursor
        if ($parent -eq $cursor) { break }
        $cursor = $parent
    }
    foreach ($file in @($exe, $unins)) {
        $item = Get-Item -LiteralPath $file -Force -ErrorAction Stop
        if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw 'ImageMagick executable must be a regular file.'
        }
    }
}
function Test-DependencyAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
function Invoke-DependencyProcess([string]$FilePath, [string[]]$Arguments, [int]$TimeoutSeconds = 180) {
    # Same-token launch. Caller requests elevation separately when needed.
    $psi = New-Object Diagnostics.ProcessStartInfo
    $psi.FileName = $FilePath
    $psi.Arguments = [string]::Join(' ', $Arguments)
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
    try { $process = [Diagnostics.Process]::Start($psi) }
    catch [ComponentModel.Win32Exception] {
        if ($_.Exception.NativeErrorCode -eq 740) { return 740 }
        throw
    }
    if (-not $process) { throw 'Dependency process did not start.' }
    try {
        if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
            Write-DependencyLog 'Dependency operation timed out. Its process may still be running; do not launch another copy until it exits.'
            return 1460
        }
        return $process.ExitCode
    } finally { $process.Dispose() }
}
function Invoke-ElevatedDependencyProcess([string]$FilePath, [string[]]$Arguments, [int]$TimeoutSeconds = 180) {
    # Visible Windows permission prompt (UAC). Do not hide this; ImageMagick's vendor installer needs administrator.
    $psi = New-Object Diagnostics.ProcessStartInfo
    $psi.FileName = $FilePath
    $psi.Arguments = [string]::Join(' ', $Arguments)
    $psi.UseShellExecute = $true
    $psi.Verb = 'runas'
    $psi.WindowStyle = [Diagnostics.ProcessWindowStyle]::Normal
    try { $process = [Diagnostics.Process]::Start($psi) }
    catch [ComponentModel.Win32Exception] {
        if ($_.Exception.NativeErrorCode -in @(1223, 5, 740)) { return [int]$_.Exception.NativeErrorCode }
        throw
    }
    if (-not $process) { throw 'Elevated dependency process did not start.' }
    try {
        if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
            Write-DependencyLog 'Elevated ImageMagick setup timed out. Its process may still be running; do not launch another copy until it exits.'
            return 1460
        }
        return $process.ExitCode
    } finally { $process.Dispose() }
}
function Test-OtherDashboardRegistryView([string]$HiveName, [Microsoft.Win32.RegistryView]$View, [string]$Guid) {
    $base = $null
    try {
        $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::$HiveName, $View)
    } catch {
        return $false
    }
    try {
        foreach ($sub in @("Software\$Guid", "Software\Microsoft\Windows\CurrentVersion\Uninstall\$Guid")) {
            $key = $base.OpenSubKey($sub)
            if (-not $key) { continue }
            try {
                $location = [string]$key.GetValue('InstallLocation')
                if ($location -and (Test-Path -LiteralPath (Join-Path $location 'resources\app.asar') -PathType Leaf)) {
                    return $true
                }
            } finally { $key.Dispose() }
        }
    } finally { $base.Dispose() }
    return $false
}

function Test-OtherDashboardInstalled([string]$Edition) {
    $other = if ($Edition -in @('V5', 'Rf')) { '2079a287-5a88-5a64-b630-f5040f92dd25' } else { '11de34ca-2bb0-58cf-bf02-9951a95a886c' }
    # Native StdRegProv is not WOW64-redirected. Use it whenever the helpers
    # are loaded so a 32-bit V4 uninstaller can see an all-users V5 install.
    if (Get-Command Get-FarmDashRegistryArguments -ErrorAction SilentlyContinue) {
        foreach ($scope in @('CurrentUser', 'all')) {
            $arguments = Get-FarmDashRegistryArguments $scope 'Install'
            $arguments.sSubKeyName = $arguments.sSubKeyName.Replace('11de34ca-2bb0-58cf-bf02-9951a95a886c', $other)
            $keyArguments = @{ hDefKey = $arguments.hDefKey; sSubKeyName = $arguments.sSubKeyName }
            $arguments.sValueName = 'InstallLocation'
            $result = Invoke-FarmDashRegistryService 'GetStringValue' $arguments
            if ($result.ReturnValue -eq 2) { continue }
            if ($result.ReturnValue -eq 1) {
                # Same StdRegProv 1 as Read-FarmDashNativeString: key exists but
                # this string may be absent. A leftover Software\{guid} key must
                # not abort Full uninstall; wrong types / denied reads still throw.
                $enumeration = Invoke-FarmDashRegistryService 'EnumValues' $keyArguments
                if ($enumeration.ReturnValue -eq 2 -or
                    ($enumeration.ReturnValue -eq 0 -and @($enumeration.sNames) -notcontains 'InstallLocation')) {
                    continue
                }
            }
            if ($result.ReturnValue -ne 0) { throw 'Cannot determine whether another Dashboard needs ImageMagick.' }
            if ($result.sValue -and (Test-Path -LiteralPath (Join-Path $result.sValue 'resources\app.asar') -PathType Leaf)) {
                return $true
            }
        }
    }
    # Also open both registry views. 32-bit PowerShell HKLM:\Software maps to
    # Wow6432Node; V5 native registration lives in the 64-bit hive.
    foreach ($hive in @('CurrentUser', 'LocalMachine')) {
        foreach ($view in @([Microsoft.Win32.RegistryView]::Registry64, [Microsoft.Win32.RegistryView]::Registry32)) {
            if (Test-OtherDashboardRegistryView $hive $view $other) { return $true }
        }
    }
    return $false
}
function Register-DependencyConsumer([string]$Edition) {
    $state = Get-DependencyState
    if ($state.ImageMagickInstalledByFarmDash -ne '1') { return }
    $normalized = if ($Edition -in @('Rf', 'V5')) { 'V5' } else { 'V4' }
    if ($script:FarmDashNativeDependencyRegistry) {
        Write-FarmDashNativeValue 'CurrentUser' 'Dependency' ('ImageMagickConsumer' + $normalized) '1'
        return
    }
    Set-ItemProperty -LiteralPath $script:FarmDashDependencyKey -Name ("ImageMagickConsumer" + $normalized) -Value '1' -ErrorAction Stop
}
function Register-OwnedImageMagick([string]$Executable, [string]$Method, [string]$Edition) {
    $unins = Get-AdjacentImageMagickUninstaller $Executable
    if (-not $unins) { throw 'Installed ImageMagick has no identifiable adjacent uninstaller.' }
    Assert-ImageMagickTarget $Executable $unins
    if ($script:FarmDashNativeDependencyRegistry) {
        $previous = Get-DependencyState
        if ($script:FarmDashDependencyRecoveryPending) {
            if (($previous.ImageMagickExecutable -and [IO.Path]::GetFullPath([string]$previous.ImageMagickExecutable) -ne [IO.Path]::GetFullPath($Executable)) -or
                ($previous.ImageMagickUninstallExe -and [IO.Path]::GetFullPath([string]$previous.ImageMagickUninstallExe) -ne $unins) -or
                ($previous.ImageMagickUninstallSHA256 -and (Get-FileHash -LiteralPath $unins -Algorithm SHA256).Hash -ne $previous.ImageMagickUninstallSHA256)) {
                throw 'Stored ImageMagick ownership does not match the current files. Refusing recovery.'
            }
        }
        $native = @{
            ImageMagickInstallMethod = $Method
            ImageMagickExecutable = [IO.Path]::GetFullPath($Executable)
            ImageMagickUninstallExe = $unins
            ImageMagickUninstallSHA256 = (Get-FileHash -LiteralPath $unins -Algorithm SHA256).Hash
            ImageMagickOwnershipVersion = '2'
        }
        foreach ($name in $native.Keys) { Write-FarmDashNativeValue 'CurrentUser' 'Dependency' $name $native[$name] }
        Write-FarmDashNativeValue 'CurrentUser' 'Dependency' 'ImageMagickInstalledByFarmDash' '1'
        $registered = Get-DependencyState
        foreach ($name in $native.Keys) {
            if ($registered.$name -ne $native[$name]) { throw 'Windows cannot read back ImageMagick ownership.' }
        }
        if ($registered.ImageMagickInstalledByFarmDash -ne '1' -or $script:FarmDashDependencyRecoveryPending) {
            throw 'ImageMagick ownership is not visible outside the installer context.'
        }
        Register-DependencyConsumer $Edition
        return
    }
    New-Item -Path $script:FarmDashDependencyKey -Force -ErrorAction Stop | Out-Null
    $values = @{
        ImageMagickInstalledByFarmDash = '1'
        ImageMagickInstallMethod = $Method
        ImageMagickExecutable = [IO.Path]::GetFullPath($Executable)
        ImageMagickUninstallExe = $unins
        ImageMagickUninstallSHA256 = (Get-FileHash -LiteralPath $unins -Algorithm SHA256).Hash
        ImageMagickOwnershipVersion = '2'
    }
    foreach ($name in $values.Keys) { Set-ItemProperty -LiteralPath $script:FarmDashDependencyKey -Name $name -Value $values[$name] -ErrorAction Stop }
    Register-DependencyConsumer $Edition
}
function Resolve-OwnedImageMagick($State) {
    if ($State.ImageMagickExecutable) { return [IO.Path]::GetFullPath([string]$State.ImageMagickExecutable) }
    if ($State.ImageMagickUninstallExe) {
        return Join-Path (Split-Path -Parent ([IO.Path]::GetFullPath([string]$State.ImageMagickUninstallExe))) 'magick.exe'
    }
    # Legacy flags are honored only when the actual installation is unambiguous.
    $candidates = @(Get-ImageMagickCandidates)
    if ($candidates.Count -eq 0) {
        throw 'Legacy ImageMagick ownership has no exact path and discovery found no executable. Ownership is retained; absence cannot safely be confirmed.'
    }
    if ($candidates.Count -ne 1) { throw 'Multiple ImageMagick installations found; legacy ownership cannot identify which one to remove.' }
    return $candidates[0]
}
function Clear-DependencyOwnership {
    if ($script:FarmDashNativeDependencyRegistry) {
        # A retirement marker prevents an old private registry view from
        # reclaiming ownership of a later, independently installed copy.
        Write-FarmDashNativeValue 'CurrentUser' 'Dependency' 'ImageMagickInstalledByFarmDash' '0'
        foreach ($name in @('ImageMagickInstallMethod', 'ImageMagickExecutable', 'ImageMagickUninstallExe',
                'ImageMagickUninstallSHA256', 'ImageMagickOwnershipVersion', 'ImageMagickConsumerV4', 'ImageMagickConsumerV5')) {
            $arguments = Get-FarmDashRegistryArguments 'CurrentUser' 'Dependency'
            $arguments.sValueName = $name
            $result = Invoke-FarmDashRegistryService 'DeleteValue' $arguments
            if ($result.ReturnValue -notin @(0, 2)) { throw 'ImageMagick ownership cleanup did not finish.' }
        }
        return
    }
    foreach ($name in @('ImageMagickInstalledByFarmDash', 'ImageMagickInstallMethod', 'ImageMagickExecutable',
            'ImageMagickUninstallExe', 'ImageMagickUninstallSHA256', 'ImageMagickOwnershipVersion',
            'ImageMagickConsumerV4', 'ImageMagickConsumerV5')) {
        Remove-ItemProperty -LiteralPath $script:FarmDashDependencyKey -Name $name -ErrorAction SilentlyContinue
    }
}
