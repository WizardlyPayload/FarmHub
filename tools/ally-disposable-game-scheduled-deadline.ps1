<#
Independent deadline guard for a disposable Ally FS25 run. Copy this file to a
local, persistent Ally path before arming. A one-shot Task Scheduler action is
intended to survive its launching shell while the Ally user remains logged in.
A task is not proof of safety until its registered trigger and a harmless probe have been checked
on the target machine. This stops only the exact PID/start-time pair; it does
not restore mods, settings, saves or the installed app.

Arm:    -Mode Arm -GamePid N -ExpectedStartUtc ISO -MaxMinutes 20 -ManifestPath LOCAL_JSON -LogPath LOCAL_LOG
Enforce is invoked by the registered task. Disarm only after the game has quit.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidateSet('Arm', 'Enforce', 'Disarm')][string]$Mode,
    [ValidateRange(1, 2147483647)][int]$GamePid,
    [string]$ExpectedStartUtc,
    [ValidateRange(1, 20)][int]$MaxMinutes,
    [Parameter(Mandatory = $true)][string]$ManifestPath,
    [string]$LogPath
)

$ErrorActionPreference = 'Stop'

function Parse-Utc([string]$value) {
    return [DateTimeOffset]::Parse(
        $value,
        [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::AssumeUniversal
    ).ToUniversalTime()
}

function Get-ExactGame([int]$pidValue, [DateTimeOffset]$startUtc) {
    $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
    if ($null -eq $process -or $process.ProcessName -ne 'FarmingSimulator2025Game') { return $null }
    try {
        $actual = [DateTimeOffset]::new($process.StartTime.ToUniversalTime())
        if ([Math]::Abs(($actual - $startUtc).TotalSeconds) -gt 2) { return $null }
    } catch { return $null }
    return $process
}

function Write-GuardLog([string]$path, [string]$message) {
    try {
        Add-Content -LiteralPath $path -Encoding UTF8 -Value (
            '{0:o} {1}' -f [DateTimeOffset]::UtcNow, $message
        )
    } catch {
        # A failed evidence write must not disable a due process stop.
    }
}

function Assert-LocalSystemPath([string]$path, [string]$label) {
    $root = [Regex]::Escape([string]$env:SystemDrive)
    if ([string]::IsNullOrWhiteSpace($path) -or $path -notmatch ('^{0}\\' -f $root)) {
        throw ('{0} must be an absolute path on the Ally system drive.' -f $label)
    }
}

if ($Mode -eq 'Arm') {
    if ($GamePid -le 0 -or [string]::IsNullOrWhiteSpace($ExpectedStartUtc) -or
        $MaxMinutes -le 0 -or [string]::IsNullOrWhiteSpace($LogPath)) {
        throw 'Arm requires GamePid, ExpectedStartUtc, MaxMinutes and a local LogPath.'
    }
    if (Test-Path -LiteralPath $ManifestPath) { throw 'Manifest already exists; use a fresh path for each run.' }
    Assert-LocalSystemPath $ManifestPath 'ManifestPath'
    Assert-LocalSystemPath $LogPath 'LogPath'
    $expected = Parse-Utc $ExpectedStartUtc
    if ($null -eq (Get-ExactGame $GamePid $expected)) { throw 'Exact FS25 PID/start time does not match.' }
    $deadline = $expected.AddMinutes($MaxMinutes)
    if ($deadline -le [DateTimeOffset]::UtcNow.AddSeconds(45)) {
        throw 'Too little time remains to register and independently verify the deadline.'
    }
    if (-not (Test-Path -LiteralPath $PSCommandPath)) { throw 'Guard script must remain on the local Ally disk.' }
    $scriptPath = (Resolve-Path -LiteralPath $PSCommandPath).Path
    Assert-LocalSystemPath $scriptPath 'Guard script'

    $taskName = 'FarmHub-FS25-{0}-{1}' -f $GamePid, [Guid]::NewGuid().ToString('N').Substring(0, 8)
    $manifest = [ordered]@{
        gamePid = $GamePid
        expectedStartUtc = $expected.ToString('o')
        deadlineUtc = $deadline.ToString('o')
        taskName = $taskName
        logPath = $LogPath
    }
    $parent = Split-Path -Parent $ManifestPath
    if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    $logParent = Split-Path -Parent $LogPath
    if (-not (Test-Path -LiteralPath $logParent)) { New-Item -ItemType Directory -Path $logParent -Force | Out-Null }
    $manifest | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $ManifestPath -Encoding UTF8 -NoNewline

    $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "{0}" -Mode Enforce -ManifestPath "{1}"' -f $scriptPath, $ManifestPath
    $action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments
    $trigger = New-ScheduledTaskTrigger -Once -At $deadline.LocalDateTime
    $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 3)
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings | Out-Null

    $registered = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
    $info = Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction Stop
    $actualTrigger = [DateTime]::Parse($registered.Triggers[0].StartBoundary)
    if ($registered.State -ne 'Ready' -or
        [Math]::Abs(($actualTrigger - $deadline.LocalDateTime).TotalSeconds) -gt 2 -or
        [Math]::Abs(($info.NextRunTime - $deadline.LocalDateTime).TotalSeconds) -gt 60) {
        throw 'Task registration readback does not prove the intended one-shot deadline.'
    }
    Write-GuardLog $LogPath ('ARMED task={0} pid={1} start={2:o} deadline={3:o} nextRun={4:o}' -f $taskName, $GamePid, $expected, $deadline, $info.NextRunTime)
    Write-Output ('ARMED task={0} pid={1} deadlineUtc={2:o}' -f $taskName, $GamePid, $deadline)
    return
}

if (-not (Test-Path -LiteralPath $ManifestPath)) { throw 'Manifest missing.' }
$manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
$pidValue = [int]$manifest.gamePid
$expected = Parse-Utc ([string]$manifest.expectedStartUtc)
$deadline = Parse-Utc ([string]$manifest.deadlineUtc)
$taskName = [string]$manifest.taskName
$log = [string]$manifest.logPath
if ($pidValue -le 0 -or [string]::IsNullOrWhiteSpace($taskName) -or
    [string]::IsNullOrWhiteSpace($log)) {
    throw 'Manifest identity or log path invalid.'
}
Assert-LocalSystemPath $ManifestPath 'ManifestPath'
Assert-LocalSystemPath $log 'LogPath'

if ($Mode -eq 'Disarm') {
    if ($null -ne (Get-ExactGame $pidValue $expected)) { throw 'Game still running; cannot disarm.' }
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction Stop
    Write-GuardLog $log ('DISARMED task={0} pid={1}' -f $taskName, $pidValue)
    return
}

if ([DateTimeOffset]::UtcNow -lt $deadline.AddSeconds(-5)) {
    Write-GuardLog $log ('REFUSED_EARLY task={0} pid={1}' -f $taskName, $pidValue)
    exit 3
}
Write-GuardLog $log ('DUE task={0} pid={1}' -f $taskName, $pidValue)
if ($null -eq (Get-ExactGame $pidValue $expected)) {
    Write-GuardLog $log ('EXITED_OR_MISMATCH task={0} pid={1}' -f $taskName, $pidValue)
    return
}
Stop-Process -Id $pidValue -Force -ErrorAction Stop
Start-Sleep -Seconds 2
if ($null -ne (Get-ExactGame $pidValue $expected)) { throw 'Exact game process survived Stop-Process.' }
Write-GuardLog $log ('STOPPED task={0} pid={1}; restore profile and saves now' -f $taskName, $pidValue)
