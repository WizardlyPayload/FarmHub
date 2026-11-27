<#
Harmless Ally Task Scheduler probe. The Arm command schedules this file to write
a nonce marker after its launching shell exits. It does not open or stop FS25.
Copy to a local Ally path and use a fresh local ProbeDir for every run.

Arm:     -Mode Arm -ProbeDir C:\...\probe -DelaySeconds 60
Check:   -Mode Check -ProbeDir C:\...\probe, after the due time
Cleanup: -Mode Cleanup -ProbeDir C:\...\probe, after evidence is copied
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidateSet('Arm', 'Fire', 'Check', 'Cleanup')][string]$Mode,
    [Parameter(Mandatory = $true)][string]$ProbeDir,
    [ValidateRange(45, 180)][int]$DelaySeconds = 60
)

$ErrorActionPreference = 'Stop'
$systemRoot = [IO.Path]::GetPathRoot([Environment]::SystemDirectory)
$fullDir = [IO.Path]::GetFullPath($ProbeDir).TrimEnd('\')
if (-not $fullDir.StartsWith($systemRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'ProbeDir must be on the local system drive.'
}
$manifestPath = Join-Path $fullDir 'manifest.json'
$markerPath = Join-Path $fullDir 'fired.txt'

if ($Mode -eq 'Arm') {
    if (Test-Path -LiteralPath $fullDir) { throw 'Use a fresh, absent ProbeDir.' }
    $scriptPath = (Resolve-Path -LiteralPath $PSCommandPath).Path
    if (-not $scriptPath.StartsWith($systemRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Probe script must be copied to the local system drive.'
    }
    $due = [DateTimeOffset]::Now.AddSeconds($DelaySeconds)
    $taskName = 'FarmHub-Scheduler-Probe-{0}' -f [Guid]::NewGuid().ToString('N').Substring(0, 12)
    $manifest = [ordered]@{
        taskName = $taskName
        nonce = [Guid]::NewGuid().ToString('N')
        dueUtc = $due.ToUniversalTime().ToString('o')
        scriptPath = $scriptPath
        probeDir = $fullDir
    }
    New-Item -ItemType Directory -Path $fullDir -ErrorAction Stop | Out-Null
    $manifest | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $manifestPath -Encoding UTF8 -NoNewline
    $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "{0}" -Mode Fire -ProbeDir "{1}"' -f $scriptPath, $fullDir
    $action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments
    $trigger = New-ScheduledTaskTrigger -Once -At $due.LocalDateTime
    $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 2)
    try {
        Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
        $registered = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
        $info = Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction Stop
        $actual = [DateTime]::Parse($registered.Triggers[0].StartBoundary)
        if ($registered.State -ne 'Ready' -or
            [Math]::Abs(($actual - $due.LocalDateTime).TotalSeconds) -gt 2 -or
            [Math]::Abs(($info.NextRunTime - $due.LocalDateTime).TotalSeconds) -gt 60) {
            throw 'Registered task trigger/readback does not match the probe deadline.'
        }
    } catch {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
        throw
    }
    Write-Output ('ARMED task={0} dueUtc={1:o} nextRun={2:o}' -f $taskName, $due.ToUniversalTime(), $info.NextRunTime)
    return
}

if (-not (Test-Path -LiteralPath $manifestPath)) { throw 'Probe manifest missing.' }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.probeDir -ne $fullDir -or [string]::IsNullOrWhiteSpace($manifest.taskName) -or
    [string]::IsNullOrWhiteSpace($manifest.nonce)) {
    throw 'Probe manifest identity mismatch.'
}

if ($Mode -eq 'Fire') {
    $content = '{0:o} nonce={1}' -f [DateTimeOffset]::UtcNow, $manifest.nonce
    Set-Content -LiteralPath $markerPath -Value $content -Encoding UTF8 -NoNewline
    return
}

if ($Mode -eq 'Check') {
    $task = Get-ScheduledTask -TaskName $manifest.taskName -ErrorAction Stop
    $info = Get-ScheduledTaskInfo -TaskName $manifest.taskName -ErrorAction Stop
    $dueUtc = [DateTimeOffset]::Parse($manifest.dueUtc).ToUniversalTime()
    $expectedScript = [string]$manifest.scriptPath
    if ($task.Actions[0].Arguments -notlike ('*' + $expectedScript + '*')) {
        throw 'Registered action does not reference the exact local probe script.'
    }
    if ([DateTimeOffset]::UtcNow -lt $dueUtc.AddSeconds(5)) { throw 'Probe deadline has not passed.' }
    if (-not (Test-Path -LiteralPath $markerPath)) { throw 'Scheduled action did not write the marker.' }
    $marker = Get-Content -LiteralPath $markerPath -Raw
    if ($marker -notmatch ('nonce=' + [Regex]::Escape([string]$manifest.nonce))) {
        throw 'Probe marker nonce mismatch.'
    }
    $lastRunUtc = [DateTimeOffset]::new($info.LastRunTime.ToUniversalTime())
    if ($info.LastTaskResult -ne 0 -or $lastRunUtc -lt $dueUtc.AddSeconds(-10)) {
        throw 'Task Scheduler did not report a successful due-time run.'
    }
    Write-Output ('PASSED task={0} lastRun={1:o} marker={2}' -f $manifest.taskName, $info.LastRunTime, $marker)
    return
}

Unregister-ScheduledTask -TaskName $manifest.taskName -Confirm:$false -ErrorAction Stop
if ($null -ne (Get-ScheduledTask -TaskName $manifest.taskName -ErrorAction SilentlyContinue)) {
    throw 'Probe task still registered after Cleanup.'
}
Write-Output ('CLEANED task={0}; probe files remain for evidence' -f $manifest.taskName)
