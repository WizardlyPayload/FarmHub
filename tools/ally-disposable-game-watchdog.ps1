<#
Polls the identified FS25 process from a disposable Ally test. This hidden
child is NOT a sufficient independent hard stop: V76R1's helper logged ARMED,
but was absent after the launcher call was interrupted; the game remained live
past the limit. The cause of helper exit is unproved. Pair future runs with a proven
scheduled deadline; do not infer safety from ARMED alone. This script does not
save or restore profile data; full restoration remains required.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidateRange(1, 2147483647)][int]$GamePid,
    [Parameter(Mandatory = $true)][string]$ExpectedStartUtc,
    [Parameter(Mandatory = $true)][ValidateRange(1, 20)][int]$MaxMinutes,
    [Parameter(Mandatory = $true)][string]$LogPath
)

$ErrorActionPreference = 'Stop'
$expected = [DateTimeOffset]::Parse(
    $ExpectedStartUtc,
    [Globalization.CultureInfo]::InvariantCulture,
    [Globalization.DateTimeStyles]::AssumeUniversal
).ToUniversalTime()
$deadline = [DateTimeOffset]::UtcNow.AddMinutes($MaxMinutes)

function Write-GuardLog([string]$message) {
    try {
        Add-Content -LiteralPath $LogPath -Encoding UTF8 -Value (
            '{0:o} pid={1} {2}' -f [DateTimeOffset]::UtcNow, $GamePid, $message
        )
    } catch {
        # A disconnected evidence share must not disable the process deadline.
    }
}

function Get-TestGame {
    $process = Get-Process -Id $GamePid -ErrorAction SilentlyContinue
    if ($null -eq $process) { return $null }
    if ($process.ProcessName -ne 'FarmingSimulator2025Game') { return $null }
    $actual = [DateTimeOffset]::new($process.StartTime.ToUniversalTime())
    if ([Math]::Abs(($actual - $expected).TotalSeconds) -gt 2) { return $null }
    return $process
}

if ($null -eq (Get-TestGame)) {
    Write-GuardLog 'REFUSED: process name/start time did not match.'
    exit 2
}
Write-GuardLog ('ARMED: hard limit {0} minute(s).' -f $MaxMinutes)
while ([DateTimeOffset]::UtcNow -lt $deadline) {
    if ($null -eq (Get-TestGame)) {
        Write-GuardLog 'EXITED: target game closed before deadline.'
        exit 0
    }
    Start-Sleep -Seconds 5
}
if ($null -ne (Get-TestGame)) {
    Stop-Process -Id $GamePid -Force -ErrorAction Stop
    Write-GuardLog 'STOPPED: disposable game exceeded hard wall-clock limit. Restore profile now.'
} else {
    Write-GuardLog 'EXITED: target game closed at deadline.'
}
