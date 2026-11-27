<#
Source candidate for a bounded Ally real-profile game-stop proof. The no-game
watch/deadline scheduler probe passed on 2026-11-13, while the earlier isolated
profile game test proved that FS25 still wrote the real profile and replaced its
launcher PID. This guard starts before FS25, monitors all post-arm FS25 process
members, and registers a separate deadline task. It does not isolate or restore
the real profile: the frozen test packet and Tina must back it up and restore it.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidateSet('Arm', 'Watch', 'Enforce', 'Disarm')][string]$Mode,
    [Parameter(Mandatory = $true)][string]$ManifestPath,
    [string]$LogPath,
    [ValidateRange(1, 20)][int]$MaxMinutes
)
$ErrorActionPreference = 'Stop'

function Utc([string]$value) {
    return [DateTimeOffset]::Parse($value, [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::AssumeUniversal).ToUniversalTime()
}
function LocalPath([string]$path, [string]$label) {
    if ([string]::IsNullOrWhiteSpace($path) -or $path.Contains('"')) { throw "$label is invalid." }
    $full = [IO.Path]::GetFullPath($path)
    if (-not [IO.Path]::IsPathRooted($path) -or
        -not $full.StartsWith($env:SystemDrive + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw "$label must be absolute on the Ally system drive."
    }
    return $full.TrimEnd('\')
}
function Log([string]$path, [string]$message) {
    try { Add-Content -LiteralPath $path -Encoding UTF8 -Value ('{0:o} {1}' -f [DateTimeOffset]::UtcNow, $message) }
    catch { } # Evidence failure must not disable a due stop.
}
function Fs25Cohort([DateTimeOffset]$armUtc) {
    $names = @('FarmingSimulator2025', 'FarmingSimulator2025Game')
    foreach ($p in @(Get-Process -Name $names -ErrorAction SilentlyContinue)) {
        try {
            $start = [DateTimeOffset]::new($p.StartTime.ToUniversalTime())
            if ($start -ge $armUtc.AddSeconds(-2)) {
                $cim = Get-CimInstance Win32_Process -Filter ('ProcessId={0}' -f $p.Id) -ErrorAction SilentlyContinue
                [pscustomobject]@{ Id = $p.Id; Name = $p.ProcessName; Start = $start; CommandLine = [string]$cim.CommandLine }
            }
        } catch { } # A PID that exits during enumeration is not a live cohort member.
    }
}
function StopCohort([DateTimeOffset]$armUtc, [string]$log, [string]$reason) {
    for ($attempt = 0; $attempt -lt 5; $attempt++) {
        $cohort = @(Fs25Cohort $armUtc)
        if ($cohort.Count -eq 0) { return }
        foreach ($p in $cohort) {
            try {
                $live = Get-Process -Id $p.Id -ErrorAction SilentlyContinue
                if ($null -eq $live -or $live.ProcessName -ne $p.Name) { continue }
                $start = [DateTimeOffset]::new($live.StartTime.ToUniversalTime())
                if ([Math]::Abs(($start - $p.Start).TotalSeconds) -gt 2) { continue }
                Stop-Process -Id $p.Id -Force -ErrorAction Stop
                Log $log ('STOPPED reason={0} pid={1} name={2} start={3:o}' -f $reason, $p.Id, $p.Name, $p.Start)
            } catch { Log $log ('STOP_FAILED reason={0} pid={1} error={2}' -f $reason, $p.Id, $_.Exception.Message) }
        }
        Start-Sleep -Seconds 1
    }
    Log $log ('SURVIVED reason={0} count={1}' -f $reason, @(Fs25Cohort $armUtc).Count)
    throw 'A post-arm FS25 process survived the stop attempts.'
}
function TaskAction([string]$script, [string]$mode, [string]$manifest) {
    $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $args = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "{0}" -Mode {1} -ManifestPath "{2}"' -f $script, $mode, $manifest
    return New-ScheduledTaskAction -Execute $powershell -Argument $args
}

if ($Mode -eq 'Arm') {
    if ($MaxMinutes -le 0) { throw 'Arm requires MaxMinutes.' }
    $manifestFile = LocalPath $ManifestPath 'ManifestPath'
    $logFile = LocalPath $LogPath 'LogPath'
    $script = LocalPath $PSCommandPath 'Guard script'
    if (Test-Path -LiteralPath $manifestFile) { throw 'Use a fresh manifest path.' }
    if (@(Get-Process -Name 'FarmingSimulator2025','FarmingSimulator2025Game' -ErrorAction SilentlyContinue).Count -ne 0) {
        throw 'FS25 already running; exclusive Ally window required.'
    }
    $arm = [DateTimeOffset]::UtcNow
    $deadline = $arm.AddMinutes($MaxMinutes)
    $nonce = [Guid]::NewGuid().ToString('N').Substring(0, 10)
    $watchName = 'FarmHub-FS25-Watch-' + $nonce
    $stopName = 'FarmHub-FS25-Stop-' + $nonce
    $manifest = [ordered]@{
        armUtc = $arm.ToString('o'); deadlineUtc = $deadline.ToString('o')
        watchTask = $watchName; stopTask = $stopName; logPath = $logFile
    }
    New-Item -ItemType Directory -Path (Split-Path -Parent $manifestFile),(Split-Path -Parent $logFile) -Force | Out-Null
    $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestFile -Encoding UTF8 -NoNewline
    $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes ($MaxMinutes + 3))
    try {
        Register-ScheduledTask -TaskName $watchName -Action (TaskAction $script 'Watch' $manifestFile) -Trigger (New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(5)) -Principal $principal -Settings $settings | Out-Null
        Register-ScheduledTask -TaskName $stopName -Action (TaskAction $script 'Enforce' $manifestFile) -Trigger (New-ScheduledTaskTrigger -Once -At $deadline.LocalDateTime) -Principal $principal -Settings $settings | Out-Null
        $stop = Get-ScheduledTask -TaskName $stopName -ErrorAction Stop
        $info = Get-ScheduledTaskInfo -TaskName $stopName -ErrorAction Stop
        if ($stop.State -ne 'Ready' -or [Math]::Abs(($info.NextRunTime - $deadline.LocalDateTime).TotalSeconds) -gt 60) {
            throw 'Independent deadline task readback failed.'
        }
        $ready = $false
        for ($i = 0; $i -lt 12; $i++) {
            Start-Sleep -Seconds 1
            if (Test-Path -LiteralPath $logFile) {
                $ready = [bool](Select-String -LiteralPath $logFile -Pattern ('READY watch=' + [regex]::Escape($watchName)) -Quiet)
                if ($ready) { break }
            }
        }
        if (-not $ready -or (Get-ScheduledTask -TaskName $watchName).State -ne 'Running') { throw 'Watch task did not become ready.' }
        Write-Output ('ARMED watch={0} stop={1} deadlineUtc={2:o}' -f $watchName, $stopName, $deadline)
    } catch {
        foreach ($name in @($watchName, $stopName)) {
            Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
            Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
        }
        throw
    }
    return
}

$manifestFile = LocalPath $ManifestPath 'ManifestPath'
if (-not (Test-Path -LiteralPath $manifestFile)) { throw 'Manifest missing.' }
$m = Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
$arm = Utc ([string]$m.armUtc)
$deadline = Utc ([string]$m.deadlineUtc)
$log = LocalPath ([string]$m.logPath) 'LogPath'
if ($deadline -le $arm -or $deadline -gt $arm.AddMinutes(20) -or
    -not ([string]$m.watchTask).StartsWith('FarmHub-FS25-Watch-') -or
    -not ([string]$m.stopTask).StartsWith('FarmHub-FS25-Stop-')) { throw 'Manifest invalid.' }

if ($Mode -eq 'Disarm') {
    if (@(Fs25Cohort $arm).Count -ne 0) { throw 'Post-arm FS25 process still running.' }
    if ([DateTimeOffset]::UtcNow -lt $deadline.AddSeconds(90)) { throw 'Keep the independent guard armed through its post-deadline respawn window.' }
    if (-not (Test-Path -LiteralPath $log) -or
        -not (Select-String -LiteralPath $log -Pattern 'WATCH_EXITED' -Quiet) -or
        -not (Select-String -LiteralPath $log -Pattern 'DUE independent deadline' -Quiet)) {
        throw 'Watcher or independent deadline did not prove its full window; report BLOCKED and inspect tasks.'
    }
    Stop-ScheduledTask -TaskName ([string]$m.watchTask) -ErrorAction SilentlyContinue
    foreach ($name in @([string]$m.watchTask, [string]$m.stopTask)) {
        Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
    }
    Log $log 'DISARMED'
    return
}
if ($Mode -eq 'Enforce') {
    if ([DateTimeOffset]::UtcNow -lt $deadline.AddSeconds(-5)) { throw 'Refused early deadline enforcement.' }
    Log $log 'DUE independent deadline'
    StopCohort $arm $log 'DEADLINE'
    return
}

if (@(Fs25Cohort $arm).Count -ne 0) {
    StopCohort $arm $log 'STARTED_BEFORE_READY'
    throw 'FS25 started before independent watch was ready.'
}
Log $log ('READY watch={0} deadline={1:o}' -f $m.watchTask, $deadline)
while ([DateTimeOffset]::UtcNow -lt $deadline.AddSeconds(90)) {
    Start-Sleep -Seconds 2
}
StopCohort $arm $log 'WATCH_DEADLINE'
Log $log 'WATCH_EXITED'
