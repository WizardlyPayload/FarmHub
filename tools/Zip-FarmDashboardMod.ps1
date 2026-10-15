<#
.SYNOPSIS
  Builds FS25_FarmDashboard.zip containing only modDesc.xml, icon_FarmDashboard.dds (if present), and the src\ tree - nothing else.

.DESCRIPTION
  Reads from FS25_FarmDashboard_Mod\ only:
    modDesc.xml, icon_FarmDashboard.dds (optional), src\

  Zip layout is **flat at archive root** (Giants resolves `sourceFile` paths like `src/FarmDashboard.lua` from there):
    modDesc.xml, icon_FarmDashboard.dds, src/..., l10n/...

  Run tools\Convert-ModIconToDds.mjs after editing icon.png (composites onto tools\modIcon_BG512.png; 512×512 DXT1, icon_modName.dds).

  Do not add other repo files (e.g. stray zips, README) - only modDesc, icon, src, l10n.

  IMPORTANT: Do not use Compress-Archive for FS mods. On Windows it writes zip entry names with
  backslashes (src\collectors\Foo.lua). The GIANTS engine resolves extraSourceFiles using forward
  slashes (src/collectors/Foo.lua), so "Can't load resource" appears and the mod never runs.

  This script uses ZipArchive + CreateEntryFromFile with '/' entry names (POSIX paths inside the zip).

  -VersionOverride stamps modDesc.xml + FarmDashboard.VERSION in a **staging copy** only.
  Working-tree V5 (e.g. 5.0.0.1) is left unchanged. Use for V4 public zips
  (e.g. 3.4.0.8) without switching the local V5 deploy line.
  A version override never deploys into the game profile.

  -DeployToGame is off by default. package:mod only writes the release ZIP.
  Explicit deployment copies that finished ZIP and nothing else. A loose
  FS25_FarmDashboard folder, or a running Farming Simulator process, refuses
  the copy before the installed ZIP is changed.

  The archive filename is always FS25_FarmDashboard.zip, including release copies.
  Keep version numbers inside the mod metadata, never in the ZIP filename.
  V5 mod packages default to Documents\FarmDash Release. Classic version overrides
  retain their separate output location. FARMDASH_BUILD_OUTPUT can override the folder.

.EXAMPLE
  Set-Location "...\MAIN CODEBASE\FarmHub"
  .\tools\Zip-FarmDashboardMod.ps1

.EXAMPLE
  .\tools\Zip-FarmDashboardMod.ps1 -VersionOverride 3.4.0.7

.EXAMPLE
  .\tools\Zip-FarmDashboardMod.ps1 -CopyTo "C:\Users\Graham\Documents\FS25_FarmDashboard.zip"
#>
[CmdletBinding()]
param(
    [string] $RepoRoot = "",
    [string] $OutZipName = "FS25_FarmDashboard.zip",
    [string] $CopyTo = "",
    # Stamp this version into the zip only (does not edit the working tree).
    [string] $VersionOverride = "",
    # Copy the finished ZIP into the FS25 mods folder. Off unless this switch is passed.
    [switch] $DeployToGame
)

$ErrorActionPreference = "Stop"

# Fail before creating or replacing files if a caller tries to rename the mod.
# Keep OutZipName for compatible callers, but do not allow versioned identities.
$CanonicalZipName = "FS25_FarmDashboard.zip"
if ($OutZipName -cne $CanonicalZipName) {
    throw "OutZipName must remain $CanonicalZipName. Put the version in modDesc.xml, not the ZIP filename."
}
if ($DeployToGame -and $VersionOverride) {
    throw "VersionOverride must not deploy into the game profile. Classic stamps stay in their output folder."
}

function Remove-ContainedTempStaging {
    param([string] $Staging)
    if (-not $Staging -or -not (Test-Path -LiteralPath $Staging)) { return }
    $tempRoot = [System.IO.Path]::GetFullPath($env:TEMP).TrimEnd('\')
    $full = [System.IO.Path]::GetFullPath($Staging).TrimEnd('\')
    $prefix = $tempRoot + [System.IO.Path]::DirectorySeparatorChar
    if (-not $full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove staging outside TEMP: $full"
    }
    $leaf = Split-Path -Leaf $full
    if ($leaf -notmatch '^FarmDashModPack_[0-9a-fA-F]{32}$') {
        throw "Refusing to remove unexpected staging name: $leaf"
    }
    $item = Get-Item -LiteralPath $full -Force
    if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        throw "Refusing to remove a junction or symlink staging path: $full"
    }
    Remove-Item -LiteralPath $full -Recurse -Force
}

function Get-RealFs25ModsDir {
    return [System.IO.Path]::GetFullPath((Join-Path $env:USERPROFILE "Documents\My Games\FarmingSimulator2025\mods"))
}

function Test-Fs25GameRunning {
    try {
        $found = @(Get-Process -ErrorAction Stop | Where-Object {
            $_.ProcessName -like "FarmingSimulator*"
        })
        return $found.Count -gt 0
    } catch {
        throw "Cannot confirm Farming Simulator is stopped ($($_.Exception.Message)). Deployment refused."
    }
}

function Get-BoundaryPaths {
    param([string] $Path)
    $full = [System.IO.Path]::GetFullPath($Path).TrimEnd('\')
    $paths = New-Object System.Collections.Generic.List[string]
    $paths.Add($full) | Out-Null
    $cursor = $full
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            $item = Get-Item -LiteralPath $cursor -Force
            if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
                $target = $item.Target
                if ($target -is [System.Array]) { $target = $target | Select-Object -First 1 }
                if (-not $target) { throw "Refusing an unresolved junction or symlink: $cursor" }
                $target = [string]$target
                if (-not [System.IO.Path]::IsPathRooted($target)) {
                    $target = Join-Path (Split-Path -Parent $cursor) $target
                }
                $resolved = [System.IO.Path]::GetFullPath($target).TrimEnd('\')
                if (-not $full.Equals($cursor, [StringComparison]::OrdinalIgnoreCase)) {
                    $tail = $full.Substring($cursor.Length).TrimStart('\')
                    if ($tail) { $resolved = [System.IO.Path]::GetFullPath((Join-Path $resolved $tail)).TrimEnd('\') }
                }
                $paths.Add($resolved) | Out-Null
            }
        }
        try {
            $parent = Split-Path -Parent $cursor
        } catch {
            break
        }
        if (-not $parent -or $parent -eq $cursor) { break }
        $cursor = $parent.TrimEnd('\')
    }
    return $paths
}

function Test-PathInsideBoundary {
    param([string] $Child, [string] $Parent)
    $childPath = $Child.TrimEnd('\')
    $parentPath = $Parent.TrimEnd('\')
    if ($childPath.Equals($parentPath, [StringComparison]::OrdinalIgnoreCase)) { return $true }
    return $childPath.StartsWith($parentPath + '\', [StringComparison]::OrdinalIgnoreCase)
}

function Assert-ReleaseCopyOutsideMods {
    param([string] $CopyToPath)
    $modsRoots = New-Object System.Collections.Generic.List[string]
    $modsRoots.Add((Get-RealFs25ModsDir)) | Out-Null
    if ($env:FARMDASH_FS25_MODS) {
        $modsRoots.Add([System.IO.Path]::GetFullPath($env:FARMDASH_FS25_MODS)) | Out-Null
    }
    $copyBounds = @(Get-BoundaryPaths -Path $CopyToPath)
    $modBounds = @()
    foreach ($root in $modsRoots) {
        $modBounds += @(Get-BoundaryPaths -Path $root)
    }
    foreach ($copyBound in $copyBounds) {
        foreach ($modBound in $modBounds) {
            if (Test-PathInsideBoundary -Child $copyBound -Parent $modBound) {
                throw "Refusing to write a release copy inside a game mods directory: $CopyToPath. Explicit deployment must use -DeployToGame."
            }
        }
    }
}

function Assert-PackVersions {
    param([string] $DescPath, [string] $LuaPath)
    $desc = [System.IO.File]::ReadAllText($DescPath)
    $lua = [System.IO.File]::ReadAllText($LuaPath)
    $descHits = [regex]::Matches($desc, '<version>([^<]*)</version>')
    $luaHits = [regex]::Matches($lua, 'FarmDashboard\.VERSION\s*=\s*"([^"]*)"')
    $descriptor = ""
    $runtime = ""
    if ($descHits.Count -eq 1) { $descriptor = $descHits[0].Groups[1].Value.Trim() }
    if ($luaHits.Count -eq 1) { $runtime = $luaHits[0].Groups[1].Value.Trim() }
    if ($descHits.Count -ne 1 -or $luaHits.Count -ne 1) {
        throw "Refusing to package: descriptor version count=$($descHits.Count) value='$descriptor', runtime VERSION count=$($luaHits.Count) value='$runtime'. Both must be present exactly once."
    }
    $valid = '^\d+(\.\d+){1,3}$'
    if ($descriptor -notmatch $valid -or $runtime -notmatch $valid -or $descriptor -ne $runtime) {
        throw "Refusing to package: descriptor version '$descriptor' does not match runtime VERSION '$runtime'."
    }
    return $descriptor
}

function Deploy-FarmDashboardZip {
    param(
        [string] $SourceZip,
        [string] $CanonicalZipName
    )
    if (-not (Test-Path -LiteralPath $SourceZip)) {
        throw "Refusing to deploy before the release ZIP exists: $SourceZip"
    }
    $modsDir = $env:FARMDASH_FS25_MODS
    if (-not $modsDir) {
        $modsDir = Get-RealFs25ModsDir
    }
    $modsFull = [System.IO.Path]::GetFullPath($modsDir).TrimEnd('\')
    if ($modsFull -match '(?i)\\modSettings(\\|$)') {
        throw "Refusing to deploy into modSettings: $modsFull"
    }
    if (-not (Test-Path -LiteralPath $modsFull -PathType Container)) {
        throw "FS25 mods folder not found: $modsFull"
    }
    $modsItem = Get-Item -LiteralPath $modsFull -Force
    if ($modsItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        throw "Refusing to deploy through a junction or symlink: $modsFull"
    }
    if (Test-Fs25GameRunning) {
        throw "Farming Simulator is running. Deployment refused before any installed file was changed."
    }
    $loose = Join-Path $modsFull "FS25_FarmDashboard"
    if (Test-Path -LiteralPath $loose -PathType Container) {
        throw "A loose FS25_FarmDashboard folder exists at $loose. Move it outside the game search path before ZIP deployment. This packager will not delete, overwrite, rename, or merge it."
    }
    $modsZip = [System.IO.Path]::GetFullPath((Join-Path $modsFull $CanonicalZipName))
    $prefix = $modsFull + [System.IO.Path]::DirectorySeparatorChar
    if (-not $modsZip.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to write outside the mods directory: $modsZip"
    }
    if ((Split-Path -Leaf $modsZip) -cne $CanonicalZipName) {
        throw "Refusing a non-canonical installed ZIP name: $modsZip"
    }
    Copy-Item -LiteralPath $SourceZip -Destination $modsZip -Force
    Write-Host "Deployed ZIP only: $modsZip"
}

if (-not $CopyTo) {
    if ($env:FARMDASH_BUILD_OUTPUT) {
        $CopyTo = Join-Path $env:FARMDASH_BUILD_OUTPUT $CanonicalZipName
    } elseif ($VersionOverride) {
        $CopyTo = Join-Path $env:USERPROFILE "Documents\FarmDash Final Output\$CanonicalZipName"
    } else {
        $CopyTo = Join-Path $env:USERPROFILE "Documents\FarmDash Release\$CanonicalZipName"
    }
}
if ((Split-Path -Leaf $CopyTo) -cne $CanonicalZipName) {
    throw "CopyTo must end in $CanonicalZipName. Choose a different folder if needed, not a different mod filename."
}
Assert-ReleaseCopyOutsideMods -CopyToPath $CopyTo

if (-not $RepoRoot) {
    $RepoRoot = Split-Path -Parent $PSScriptRoot
}

$ModSource = Join-Path $RepoRoot "FS25_FarmDashboard_Mod"
$DestZip = Join-Path $RepoRoot "FS25_FarmDashboard_Mod\$OutZipName"
$SrcTree = Join-Path $ModSource "src"
$ModDesc = Join-Path $ModSource "modDesc.xml"
$IconDds = Join-Path $ModSource "icon_FarmDashboard.dds"

if (-not (Test-Path -LiteralPath $ModSource -PathType Container)) {
    throw "Mod folder not found: $ModSource"
}
if (-not (Test-Path -LiteralPath $ModDesc)) {
    throw "Missing modDesc.xml: $ModDesc"
}
if (-not (Test-Path -LiteralPath $SrcTree -PathType Container)) {
    throw "Missing src folder: $SrcTree"
}

$PackRoot = $ModSource
$Staging = $null
if ($VersionOverride) {
    if ($VersionOverride -notmatch '^\d+(\.\d+){1,3}$') {
        throw "VersionOverride must look like 3.4.0.7 (got: $VersionOverride)"
    }
    $Staging = Join-Path $env:TEMP ("FarmDashModPack_" + [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $Staging -Force | Out-Null
    Copy-Item -LiteralPath $ModDesc -Destination (Join-Path $Staging "modDesc.xml") -Force
    if (Test-Path -LiteralPath $IconDds) {
        Copy-Item -LiteralPath $IconDds -Destination (Join-Path $Staging "icon_FarmDashboard.dds") -Force
    }
    Copy-Item -LiteralPath $SrcTree -Destination (Join-Path $Staging "src") -Recurse -Force
    $l10nSrc = Join-Path $ModSource "l10n"
    if (Test-Path -LiteralPath $l10nSrc -PathType Container) {
        Copy-Item -LiteralPath $l10nSrc -Destination (Join-Path $Staging "l10n") -Recurse -Force
    }

    $stagedDesc = Join-Path $Staging "modDesc.xml"
    $descText = [System.IO.File]::ReadAllText($stagedDesc)
    $descText = [regex]::Replace($descText, '(?s)(<!--\s*FS25 FarmDashboard\s*\|\s*modDesc\.xml\s*\|\s*)v[\d.]+', "`${1}v$VersionOverride")
    $descText = [regex]::Replace($descText, '(<version>)[^<]+(</version>)', "`${1}$VersionOverride`${2}")
    [System.IO.File]::WriteAllText($stagedDesc, $descText)

    $stagedLua = Join-Path $Staging "src\FarmDashboard.lua"
    if (-not (Test-Path -LiteralPath $stagedLua)) {
        throw "Missing FarmDashboard.lua in staging: $stagedLua"
    }
    $luaText = [System.IO.File]::ReadAllText($stagedLua)
    $luaText = [regex]::Replace($luaText, '(FarmDashboard\.VERSION\s*=\s*")[^"]+(")', "`${1}$VersionOverride`${2}")
    [System.IO.File]::WriteAllText($stagedLua, $luaText)

    $PackRoot = $Staging
    Write-Host "VersionOverride $VersionOverride applied in staging (working tree unchanged)"
    try {
        $stamped = Assert-PackVersions -DescPath (Join-Path $Staging "modDesc.xml") -LuaPath (Join-Path $Staging "src\FarmDashboard.lua")
        if ($stamped -ne $VersionOverride) {
            throw "Refusing to package: descriptor version '$stamped' does not match runtime VERSION '$VersionOverride'."
        }
    } catch {
        Remove-ContainedTempStaging -Staging $Staging
        throw
    }
} else {
    Assert-PackVersions -DescPath $ModDesc -LuaPath (Join-Path $SrcTree "FarmDashboard.lua") | Out-Null
}

if (Test-Path -LiteralPath $DestZip) {
    Remove-Item -LiteralPath $DestZip -Force
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$rootNorm = $PackRoot.TrimEnd('\', '/')
$packDesc = Join-Path $PackRoot "modDesc.xml"
$packIcon = Join-Path $PackRoot "icon_FarmDashboard.dds"
$packSrc = Join-Path $PackRoot "src"

$zip = [System.IO.Compression.ZipFile]::Open($DestZip, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $packDesc, "modDesc.xml") | Out-Null
    if (Test-Path -LiteralPath $packIcon) {
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $packIcon, "icon_FarmDashboard.dds") | Out-Null
    } else {
        Write-Warning "icon_FarmDashboard.dds not in mod folder - zip will omit it. Run tools\Convert-ModIconToDds.mjs (needs icon.png source in mod folder)."
    }
    Get-ChildItem -LiteralPath $packSrc -Recurse -File | ForEach-Object {
        $full = $_.FullName
        if (-not $full.StartsWith($rootNorm, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Unexpected path under src: $full"
        }
        $rel = $full.Substring($rootNorm.Length).TrimStart('\', '/').Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $full, $rel) | Out-Null
    }
    foreach ($extraDir in @("l10n")) {
        $extraPath = Join-Path $PackRoot $extraDir
        if (-not (Test-Path -LiteralPath $extraPath -PathType Container)) { continue }
        Get-ChildItem -LiteralPath $extraPath -Recurse -File | ForEach-Object {
            $full = $_.FullName
            $rel = $full.Substring($rootNorm.Length).TrimStart('\', '/').Replace('\', '/')
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $full, $rel) | Out-Null
        }
    }
} finally {
    $zip.Dispose()
    if ($Staging) {
        Remove-ContainedTempStaging -Staging $Staging
    }
}

if (-not (Test-Path -LiteralPath $DestZip)) {
    throw "Zip was not created: $DestZip"
}

Write-Host "Wrote: $DestZip (modDesc.xml, icon, src/, l10n/ - POSIX paths inside zip)"

if ($CopyTo) {
    $destParent = Split-Path -Parent $CopyTo
    if ($destParent -and -not (Test-Path -LiteralPath $destParent)) {
        New-Item -ItemType Directory -Path $destParent -Force | Out-Null
    }
    Copy-Item -LiteralPath $DestZip -Destination $CopyTo -Force
    Write-Host "Copied to: $CopyTo"
}

if ($DeployToGame) {
    Deploy-FarmDashboardZip -SourceZip $DestZip -CanonicalZipName $CanonicalZipName
}
