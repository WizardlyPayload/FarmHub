<#
Source candidate only. Do not arm until a separate, frozen Ally packet has reviewed
this script and a harmless scheduler probe has passed. The first PID-only guard
missed an FS25 launcher replacement on 2026-11-13. This guard starts before the
game, monitors the whole post-arm FS25 process cohort, and registers a separate
deadline task. It also stops the cohort if the real profile is touched or a game
process lacks the exact isolated-profile argument. It does not restore files.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidateSet('Arm', 'Watch', 'Enforce', 'Disarm')][string]$Mode,
    [Parameter(Mandatory = $true)][string]$ManifestPath,
    [string]$LogPath,
    [string]$RealProfileDir,
    [string]$IsolatedProfileDir,
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
function RealProfileSnapshot([string]$root) {
    $paths = @('game.xml', 'gameSettings.xml', 'inputBinding.xml', 'extraContent.xml', 'log.txt',
        'updater\updater.00.log')
    $updater = Join-Path $root 'updater'
    if (Test-Path -LiteralPath $updater) {
        foreach ($f in @(Get-ChildItem -LiteralPath $updater -Filter 'activation.0.txt' -Recurse -File -ErrorAction SilentlyContinue)) {
            $paths += $f.FullName.Substring($root.Length + 1)
        }
    }
    $result = [ordered]@{}
    foreach ($relative in @($paths | Sort-Object -Unique)) {
        $path = Join-Path $root $relative
        $f = Get-Item -LiteralPath $path -ErrorAction SilentlyContinue
        $result[$relative] = if ($null -eq $f) { 'ABSENT' } else {
            '{0}|{1}' -f $f.Length, $f.LastWriteTimeUtc.Ticks
        }
    }
    return $result
}
function ProfileChanged($baseline, [string]$root) {
    $now = RealProfileSnapshot $root
    foreach ($key in $baseline.PSObject.Properties.Name) {
        if ([string]$baseline.$key -ne [string]$now[$key]) { return $key }
    }
    return $null
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
    $real = LocalPath $RealProfileDir 'RealProfileDir'
    $isolated = LocalPath $IsolatedProfileDir 'IsolatedProfileDir'
    $script = LocalPath $PSCommandPath 'Guard script'
    if ($real.Equals($isolated, [StringComparison]::OrdinalIgnoreCase) -or
        $isolated.StartsWith($real + '\', [StringComparison]::OrdinalIgnoreCase) -or
        $real.StartsWith($isolated + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Profiles must be separate.' }
    if (-not (Test-Path -LiteralPath $real -PathType Container) -or
        -not (Test-Path -LiteralPath $isolated -PathType Container)) { throw 'Both profile directories must exist.' }
    if (Test-Path -LiteralPath $manifestFile) { throw 'Use a fresh manifest path.' }
    if (@(Get-Process -Name 'FarmingSimulator2025','FarmingSimulator2025Game' -ErrorAction SilentlyContinue).Count -ne 0) {
        throw 'FS25 already running; exclusive Ally window required.'
    }
    $arm = [DateTimeOffset]::UtcNow
    $deadline = $arm.AddMinutes($MaxMinutes)
    $nonce = [Guid]::NewGuid().ToString('N').Substring(0, 10)
    $watchName = 'FarmHub-FS25-Watch-' + $nonce
    $stopName = 'FarmHub-FS25-Stop-' + $nonce
    $snapshot = RealProfileSnapshot $real
    $manifest = [ordered]@{
        armUtc = $arm.ToString('o'); deadlineUtc = $deadline.ToString('o')
        watchTask = $watchName; stopTask = $stopName; realProfileDir = $real
        isolatedProfileDir = $isolated; logPath = $logFile; realProfileSnapshot = $snapshot
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
$real = LocalPath ([string]$m.realProfileDir) 'RealProfileDir'
$isolated = LocalPath ([string]$m.isolatedProfileDir) 'IsolatedProfileDir'
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
if ($null -ne (ProfileChanged $m.realProfileSnapshot $real)) { throw 'Real profile changed before watch was ready.' }
Log $log ('READY watch={0} deadline={1:o}' -f $m.watchTask, $deadline)
$breached = $false
while ([DateTimeOffset]::UtcNow -lt $deadline.AddSeconds(90)) {
    $changed = ProfileChanged $m.realProfileSnapshot $real
    if ($null -ne $changed -and -not $breached) {
        Log $log ('REAL_PROFILE_CHANGED file={0}' -f $changed)
        $breached = $true
    }
    foreach ($p in @(Fs25Cohort $arm)) {
        $expected = '-profile "' + $isolated + '"'
        if ($p.Name -eq 'FarmingSimulator2025Game' -and
            $p.CommandLine.IndexOf($expected, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
            Log $log ('UNISOLATED_GAME pid={0} command={1}' -f $p.Id, $p.CommandLine)
            $breached = $true
        }
    }
    if ($breached) { StopCohort $arm $log 'ISOLATION_BREACH' }
    Start-Sleep -Seconds 2
}
StopCohort $arm $log 'WATCH_DEADLINE'
Log $log 'WATCH_EXITED'
