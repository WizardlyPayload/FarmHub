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
    [string] $VersionOverride = ""
)

$ErrorActionPreference = "Stop"

# Fail before creating or replacing files if a caller tries to rename the mod.
# Keep OutZipName for compatible callers, but do not allow versioned identities.
$CanonicalZipName = "FS25_FarmDashboard.zip"
if ($OutZipName -cne $CanonicalZipName) {
    throw "OutZipName must remain $CanonicalZipName. Put the version in modDesc.xml, not the ZIP filename."
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
    if ($Staging -and (Test-Path -LiteralPath $Staging)) {
        Remove-Item -LiteralPath $Staging -Recurse -Force -ErrorAction SilentlyContinue
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

# Local playtest: copy the working-tree zip into FS25 mods. Skip VersionOverride
# (classic public stamp) so it does not overwrite the RF test zip.
if (-not $VersionOverride) {
    $fs25Mods = $env:FARMDASH_FS25_MODS
    if (-not $fs25Mods) {
        $fs25Mods = Join-Path $env:USERPROFILE "Documents\My Games\FarmingSimulator2025\mods"
    }
    if (Test-Path -LiteralPath $fs25Mods -PathType Container) {
        $modsZip = Join-Path $fs25Mods $CanonicalZipName
        Copy-Item -LiteralPath $DestZip -Destination $modsZip -Force
        Write-Host "Copied to FS25 mods: $modsZip"
        # Giants SP loads an unpacked FS25_FarmDashboard folder over the zip.
        # Always keep a complete unpacked tree: an empty leftover folder makes extraSourceFiles
        # fail while FarmDashboard.lua still runs and crashes at init.
        $modsFolder = Join-Path $fs25Mods "FS25_FarmDashboard"
        if (-not (Test-Path -LiteralPath $modsFolder -PathType Container)) {
            New-Item -ItemType Directory -Path $modsFolder -Force | Out-Null
        }
        if (Test-Path -LiteralPath $modsFolder -PathType Container) {
            Copy-Item -LiteralPath (Join-Path $ModSource "modDesc.xml") -Destination (Join-Path $modsFolder "modDesc.xml") -Force
            foreach ($iconName in @("icon.png", "icon_FarmDashboard.dds")) {
                $iconSrc = Join-Path $ModSource $iconName
                if (Test-Path -LiteralPath $iconSrc) {
                    Copy-Item -LiteralPath $iconSrc -Destination (Join-Path $modsFolder $iconName) -Force
                }
            }
            $srcSrc = Join-Path $ModSource "src"
            $srcDest = Join-Path $modsFolder "src"
            & robocopy $srcSrc $srcDest /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
            if ($LASTEXITCODE -ge 8) {
                Write-Warning "robocopy src into unpacked mod folder failed (exit $LASTEXITCODE)"
            }
            $l10nSrc = Join-Path $ModSource "l10n"
            if (Test-Path -LiteralPath $l10nSrc -PathType Container) {
                $l10nDest = Join-Path $modsFolder "l10n"
                & robocopy $l10nSrc $l10nDest /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
                if ($LASTEXITCODE -ge 8) {
                    Write-Warning "robocopy l10n into unpacked mod folder failed (exit $LASTEXITCODE)"
                }
            }
            # robocopy uses 0-7 for success; reset so npm does not treat the pack as failed.
            if ($LASTEXITCODE -lt 8) {
                $global:LASTEXITCODE = 0
            }
            Write-Host "Synced unpacked FS25 mod folder: $modsFolder"
        }
    } else {
        Write-Warning "FS25 mods folder not found (skip local copy): $fs25Mods"
    }
}
