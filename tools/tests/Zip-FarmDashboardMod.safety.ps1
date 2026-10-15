# Scratch-fixture checks for tools/Zip-FarmDashboardMod.ps1.
# Process substitution exists only in this test process. Production deployment always calls Get-Process.
# FARMDASH_FS25_MODS points at the fake mods directory before the first pack, so a reintroduced
# implicit deploy cannot write the real profile.
$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$packager = Join-Path $repo "tools\Zip-FarmDashboardMod.ps1"
if (-not (Test-Path -LiteralPath $packager)) {
    throw "Packager not found: $packager"
}

$scratch = Join-Path $env:TEMP ("FarmDashPackSafety_" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $scratch -Force | Out-Null

$savedMods = $env:FARMDASH_FS25_MODS
$savedBuild = $env:FARMDASH_BUILD_OUTPUT
$Probe = [pscustomobject]@{ Calls = 0; Mode = "stopped" }

function Get-Process {
    [CmdletBinding()]
    param()
    $Probe.Calls++
    if ($Probe.Mode -eq "throw") { throw "probe unavailable" }
    if ($Probe.Mode -eq "running") {
        return @([pscustomobject]@{ ProcessName = "FarmingSimulator2025" })
    }
    return @()
}

function Remove-Scratch {
    if (-not $scratch) { return }
    $tempRoot = [System.IO.Path]::GetFullPath($env:TEMP).TrimEnd('\')
    $full = [System.IO.Path]::GetFullPath($scratch).TrimEnd('\')
    $prefix = $tempRoot + [System.IO.Path]::DirectorySeparatorChar
    if (-not $full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove scratch outside TEMP: $full"
    }
    if ((Split-Path -Leaf $full) -notmatch '^FarmDashPackSafety_[0-9a-fA-F]{32}$') {
        throw "Refusing to remove unexpected scratch: $full"
    }
    if (Test-Path -LiteralPath $full) {
        Remove-Item -LiteralPath $full -Recurse -Force
    }
}

function Fingerprint([string] $Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return "ABSENT" }
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
}

function Invoke-Packager {
    param([hashtable] $PackArgs)
    try {
        $output = & $packager @PackArgs 2>&1
        return @{
            Ok = $true
            Text = (($output | ForEach-Object { "$_" }) -join "`n")
        }
    } catch {
        return @{
            Ok = $false
            Text = [string]$_.Exception.Message
        }
    }
}

function New-ModRoot {
    param([string] $Root, [string] $Descriptor, [string] $RuntimeLines)
    $mod = Join-Path $Root "FS25_FarmDashboard_Mod"
    New-Item -ItemType Directory -Path (Join-Path $mod "src") -Force | Out-Null
    [System.IO.File]::WriteAllText((Join-Path $mod "modDesc.xml"), @"
<?xml version="1.0" encoding="utf-8" standalone="no" ?>
<modDesc descVersion="100">
    <version>$Descriptor</version>
</modDesc>
"@)
    [System.IO.File]::WriteAllText((Join-Path $mod "src\FarmDashboard.lua"), $RuntimeLines)
    return $mod
}

$realZip = Join-Path $env:USERPROFILE "Documents\My Games\FarmingSimulator2025\mods\FS25_FarmDashboard.zip"
$realLoose = Join-Path $env:USERPROFILE "Documents\My Games\FarmingSimulator2025\mods\FS25_FarmDashboard\modDesc.xml"
$realZipBefore = Fingerprint $realZip
$realLooseBefore = Fingerprint $realLoose

try {
    $mod = New-ModRoot -Root $scratch -Descriptor "9.9.9.9" -RuntimeLines "FarmDashboard = {}`r`nFarmDashboard.VERSION = `"9.9.9.9`"`r`n"
    $fake = Join-Path $scratch "fake-mods"
    New-Item -ItemType Directory -Path (Join-Path $fake "FS25_FarmDashboard") -Force | Out-Null
    [System.IO.File]::WriteAllText((Join-Path $fake "FS25_FarmDashboard.zip"), "SENTINEL-ZIP")
    [System.IO.File]::WriteAllText((Join-Path $fake "FS25_FarmDashboard\sentinel.txt"), "SENTINEL-LOOSE")
    $zipBefore = Fingerprint (Join-Path $fake "FS25_FarmDashboard.zip")
    $looseBefore = Fingerprint (Join-Path $fake "FS25_FarmDashboard\sentinel.txt")
    $prior = Join-Path $scratch "prior-release\FS25_FarmDashboard.zip"
    New-Item -ItemType Directory -Path (Split-Path -Parent $prior) -Force | Out-Null
    [System.IO.File]::WriteAllBytes($prior, [byte[]](9, 9, 9, 9))
    $priorBefore = Fingerprint $prior

    $env:FARMDASH_FS25_MODS = $fake
    Remove-Item Env:FARMDASH_BUILD_OUTPUT -ErrorAction SilentlyContinue
    $copy = Join-Path $scratch "release\FS25_FarmDashboard.zip"

    $Probe.Mode = "stopped"
    $Probe.Calls = 0
    $default = Invoke-Packager -PackArgs @{ RepoRoot = $scratch; CopyTo = $copy }
    if (-not $default.Ok) { throw "default packaging failed: $($default.Text)" }
    if ((Fingerprint (Join-Path $fake "FS25_FarmDashboard.zip")) -ne $zipBefore) {
        throw "default packaging changed the configured fake mods ZIP"
    }
    if ((Fingerprint (Join-Path $fake "FS25_FarmDashboard\sentinel.txt")) -ne $looseBefore) {
        throw "default packaging changed the fake loose folder"
    }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($copy)
    try {
        $names = @($archive.Entries | ForEach-Object { $_.FullName })
        $descEntry = $archive.GetEntry("modDesc.xml").Open()
        $luaEntry = $archive.GetEntry("src/FarmDashboard.lua").Open()
        $readerD = New-Object System.IO.StreamReader($descEntry)
        $readerL = New-Object System.IO.StreamReader($luaEntry)
        $descText = $readerD.ReadToEnd()
        $luaText = $readerL.ReadToEnd()
        $readerD.Dispose(); $readerL.Dispose(); $descEntry.Dispose(); $luaEntry.Dispose()
    } finally {
        $archive.Dispose()
    }
    if ($names -notcontains "modDesc.xml" -or $names -notcontains "src/FarmDashboard.lua") {
        throw "archive is missing flat entries: $($names -join ',')"
    }
    foreach ($name in $names) {
        if ($name.Contains("\")) { throw "archive entry is not POSIX: $name" }
    }
    if ($descText -notmatch "<version>9.9.9.9</version>" -or $luaText -notmatch 'FarmDashboard.VERSION = "9.9.9.9"') {
        throw "matching versions were not packed together"
    }

    $badName = Invoke-Packager -PackArgs @{ OutZipName = "FS25_FarmDashboard-V5.zip"; RepoRoot = $scratch; CopyTo = $copy }
    if ($badName.Ok -or $badName.Text -notmatch "OutZipName must remain") {
        throw "canonical basename was not rejected: $($badName.Text)"
    }

    $classic = Invoke-Packager -PackArgs @{ VersionOverride = "3.4.0.8"; DeployToGame = $true; RepoRoot = $scratch; CopyTo = $copy }
    if ($classic.Ok -or $classic.Text -notmatch "must not deploy") {
        throw "classic override was allowed to deploy: $($classic.Text)"
    }

    $Probe.Mode = "stopped"
    $Probe.Calls = 0
    $loose = Invoke-Packager -PackArgs @{ RepoRoot = $scratch; CopyTo = $copy; DeployToGame = $true }
    if ($loose.Ok -or $loose.Text -notmatch "loose FS25_FarmDashboard folder") {
        throw "loose-folder deployment was not refused: $($loose.Text)"
    }
    if ($Probe.Calls -lt 1) { throw "loose-folder refusal did not query the process list" }
    if ((Fingerprint (Join-Path $fake "FS25_FarmDashboard.zip")) -ne $zipBefore) {
        throw "loose-folder refusal changed the installed ZIP"
    }

    $runningMods = Join-Path $scratch "fake-mods-running"
    New-Item -ItemType Directory -Path $runningMods -Force | Out-Null
    [System.IO.File]::WriteAllText((Join-Path $runningMods "FS25_FarmDashboard.zip"), "SENTINEL-RUNNING")
    $runningBefore = Fingerprint (Join-Path $runningMods "FS25_FarmDashboard.zip")
    $env:FARMDASH_FS25_MODS = $runningMods
    $Probe.Mode = "running"
    $Probe.Calls = 0
    $running = Invoke-Packager -PackArgs @{ RepoRoot = $scratch; CopyTo = $copy; DeployToGame = $true }
    if ($running.Ok -or $running.Text -notmatch "Farming Simulator is running") {
        throw "running-game deployment was not refused: $($running.Text)"
    }
    if ($Probe.Calls -lt 1) { throw "running-game refusal did not query the process list" }
    if ((Fingerprint (Join-Path $runningMods "FS25_FarmDashboard.zip")) -ne $runningBefore) {
        throw "running-game refusal changed the installed ZIP"
    }
    if (Test-Path -LiteralPath (Join-Path $runningMods "FS25_FarmDashboard")) {
        throw "running-game refusal created a loose folder"
    }

    $Probe.Mode = "throw"
    $Probe.Calls = 0
    $thrown = Invoke-Packager -PackArgs @{ RepoRoot = $scratch; CopyTo = $copy; DeployToGame = $true }
    if ($thrown.Ok -or $thrown.Text -notmatch "Cannot confirm Farming Simulator is stopped") {
        throw "a failed process query was not refused: $($thrown.Text)"
    }
    if ($Probe.Calls -lt 1) { throw "throwing process query was not called" }
    if ((Fingerprint (Join-Path $runningMods "FS25_FarmDashboard.zip")) -ne $runningBefore) {
        throw "failed process query changed the installed ZIP"
    }

    $cleanMods = Join-Path $scratch "fake-mods-clean"
    New-Item -ItemType Directory -Path $cleanMods -Force | Out-Null
    $env:FARMDASH_FS25_MODS = $cleanMods
    $Probe.Mode = "stopped"
    $Probe.Calls = 0
    $deployed = Invoke-Packager -PackArgs @{ RepoRoot = $scratch; CopyTo = $copy; DeployToGame = $true }
    if (-not $deployed.Ok) { throw "explicit ZIP deploy failed: $($deployed.Text)" }
    if ($Probe.Calls -lt 1) { throw "stopped deploy did not query the process list" }
    if (-not (Test-Path -LiteralPath (Join-Path $cleanMods "FS25_FarmDashboard.zip"))) {
        throw "explicit deploy did not write the ZIP"
    }
    if (Test-Path -LiteralPath (Join-Path $cleanMods "FS25_FarmDashboard")) {
        throw "explicit deploy created a loose folder"
    }

    $env:FARMDASH_FS25_MODS = $fake
    $Probe.Mode = "running"
    $Probe.Calls = 0
    $copyRoute = Invoke-Packager -PackArgs @{ RepoRoot = $scratch; CopyTo = (Join-Path $fake "FS25_FarmDashboard.zip") }
    if ($copyRoute.Ok -or $copyRoute.Text -notmatch "release copy inside a game mods directory") {
        throw "CopyTo into mods was not refused: $($copyRoute.Text)"
    }
    if ($Probe.Calls -ne 0) { throw "CopyTo refusal reached the process probe" }
    if ((Fingerprint (Join-Path $fake "FS25_FarmDashboard.zip")) -ne $zipBefore) {
        throw "CopyTo refusal changed the mods ZIP"
    }
    if ((Fingerprint $prior) -ne $priorBefore) { throw "CopyTo refusal changed the prior release artifact" }

    $Probe.Calls = 0
    $env:FARMDASH_BUILD_OUTPUT = $fake
    $buildRoute = Invoke-Packager -PackArgs @{ RepoRoot = $scratch }
    if ($buildRoute.Ok -or $buildRoute.Text -notmatch "release copy inside a game mods directory") {
        throw "FARMDASH_BUILD_OUTPUT into mods was not refused: $($buildRoute.Text)"
    }
    if ($Probe.Calls -ne 0) { throw "build-output refusal reached the process probe" }
    if ((Fingerprint (Join-Path $fake "FS25_FarmDashboard.zip")) -ne $zipBefore) {
        throw "build-output refusal changed the mods ZIP"
    }
    if ((Fingerprint $prior) -ne $priorBefore) { throw "build-output refusal changed the prior release artifact" }
    Remove-Item Env:FARMDASH_BUILD_OUTPUT -ErrorAction SilentlyContinue

    $driftRoot = Join-Path $scratch "drift"
    New-ModRoot -Root $driftRoot -Descriptor "1.0.0.1" -RuntimeLines "FarmDashboard = {}`r`nFarmDashboard.VERSION = `"1.0.0.2`"`r`n" | Out-Null
    $driftOut = Join-Path $scratch "drift-out\FS25_FarmDashboard.zip"
    New-Item -ItemType Directory -Path (Split-Path -Parent $driftOut) -Force | Out-Null
    [System.IO.File]::WriteAllBytes($driftOut, [byte[]](4, 5, 6, 7))
    $driftBefore = Fingerprint $driftOut
    $drift = Invoke-Packager -PackArgs @{ RepoRoot = $driftRoot; CopyTo = $driftOut }
    if ($drift.Ok -or $drift.Text -notmatch "descriptor version '1.0.0.1' does not match runtime VERSION '1.0.0.2'") {
        throw "version drift was not refused: $($drift.Text)"
    }
    if ((Fingerprint $driftOut) -ne $driftBefore) { throw "version drift replaced the previous output" }

    $missingRoot = Join-Path $scratch "missing-version"
    New-ModRoot -Root $missingRoot -Descriptor "1.0.0.1" -RuntimeLines "return `"no version`"`r`n" | Out-Null
    $missingOut = Join-Path $scratch "missing-out\FS25_FarmDashboard.zip"
    New-Item -ItemType Directory -Path (Split-Path -Parent $missingOut) -Force | Out-Null
    [System.IO.File]::WriteAllBytes($missingOut, [byte[]](1, 1, 1, 1))
    $missingBefore = Fingerprint $missingOut
    $missing = Invoke-Packager -PackArgs @{ RepoRoot = $missingRoot; CopyTo = $missingOut }
    if ($missing.Ok -or $missing.Text -notmatch "runtime VERSION count=0") {
        throw "missing VERSION was not refused: $($missing.Text)"
    }
    if ((Fingerprint $missingOut) -ne $missingBefore) { throw "missing VERSION replaced the previous output" }

    $ambiguousRoot = Join-Path $scratch "ambiguous-version"
    New-ModRoot -Root $ambiguousRoot -Descriptor "1.0.0.1" -RuntimeLines "FarmDashboard.VERSION = `"1.0.0.1`"`r`nFarmDashboard.VERSION = `"1.0.0.1`"`r`n" | Out-Null
    $ambiguousOut = Join-Path $scratch "ambiguous-out\FS25_FarmDashboard.zip"
    New-Item -ItemType Directory -Path (Split-Path -Parent $ambiguousOut) -Force | Out-Null
    [System.IO.File]::WriteAllBytes($ambiguousOut, [byte[]](2, 2, 2, 2))
    $ambiguousBefore = Fingerprint $ambiguousOut
    $ambiguous = Invoke-Packager -PackArgs @{ RepoRoot = $ambiguousRoot; CopyTo = $ambiguousOut }
    if ($ambiguous.Ok -or $ambiguous.Text -notmatch "runtime VERSION count=2") {
        throw "ambiguous VERSION was not refused: $($ambiguous.Text)"
    }
    if ((Fingerprint $ambiguousOut) -ne $ambiguousBefore) { throw "ambiguous VERSION replaced the previous output" }

    $overrideOut = Join-Path $scratch "override-out\FS25_FarmDashboard.zip"
    $override = Invoke-Packager -PackArgs @{ RepoRoot = $scratch; CopyTo = $overrideOut; VersionOverride = "3.4.0.8" }
    if (-not $override.Ok) { throw "version override fixture failed: $($override.Text)" }
    $overrideZip = [System.IO.Compression.ZipFile]::OpenRead($overrideOut)
    try {
        $overrideDesc = (New-Object System.IO.StreamReader($overrideZip.GetEntry("modDesc.xml").Open())).ReadToEnd()
        $overrideLua = (New-Object System.IO.StreamReader($overrideZip.GetEntry("src/FarmDashboard.lua").Open())).ReadToEnd()
    } finally {
        $overrideZip.Dispose()
    }
    if ($overrideDesc -notmatch "<version>3.4.0.8</version>" -or $overrideLua -notmatch 'FarmDashboard.VERSION = "3.4.0.8"') {
        throw "version override did not stamp both staged values"
    }
    $sourceLua = [System.IO.File]::ReadAllText((Join-Path $mod "src\FarmDashboard.lua"))
    if ($sourceLua -notmatch 'FarmDashboard.VERSION = "9.9.9.9"') {
        throw "version override edited the fixture working tree"
    }

    if ((Fingerprint $realZip) -ne $realZipBefore) { throw "real installed ZIP changed" }
    if ((Fingerprint $realLoose) -ne $realLooseBefore) { throw "real loose modDesc changed" }

    Write-Output "PASS default-pack-leaves-configured-sentinels"
    Write-Output "PASS archive-flat-posix-matching-versions"
    Write-Output "PASS canonical-basename-rejected"
    Write-Output "PASS classic-override-does-not-deploy"
    Write-Output "PASS loose-folder-refused-after-process-query"
    Write-Output "PASS custom-mods-running-process-refused"
    Write-Output "PASS process-query-throw-refused"
    Write-Output "PASS explicit-deploy-is-zip-only-when-stopped"
    Write-Output "PASS copyto-mods-refused-before-probe"
    Write-Output "PASS build-output-mods-refused-before-probe"
    Write-Output "PASS version-drift-preserves-output"
    Write-Output "PASS missing-version-preserves-output"
    Write-Output "PASS ambiguous-version-preserves-output"
    Write-Output "PASS version-override-stamps-staging-only"
    Write-Output "PASS real-mods-tree-unchanged"
} finally {
    if ($null -eq $savedMods) { Remove-Item Env:FARMDASH_FS25_MODS -ErrorAction SilentlyContinue }
    else { $env:FARMDASH_FS25_MODS = $savedMods }
    if ($null -eq $savedBuild) { Remove-Item Env:FARMDASH_BUILD_OUTPUT -ErrorAction SilentlyContinue }
    else { $env:FARMDASH_BUILD_OUTPUT = $savedBuild }
    Remove-Scratch
}
