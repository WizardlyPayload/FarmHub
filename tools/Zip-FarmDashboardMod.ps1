<#
.SYNOPSIS
  Builds FS25_FarmDashboard.zip containing only modDesc.xml, icon.png (if present), and the src\ tree - nothing else.

.DESCRIPTION
  Reads from FS25_FarmDashboard_Mod\FS25_FarmDashboard_Mod\ only:
    modDesc.xml, icon.png (optional), src\

  Zip layout is **flat at archive root** (Giants resolves `sourceFile` paths like `src/FarmDashboard.lua` from there):
    modDesc.xml, icon.png, src/...

  Do not add other repo files (e.g. stray zips, README, l10n) - only those three roots.

  IMPORTANT: Do not use Compress-Archive for FS mods. On Windows it writes zip entry names with
  backslashes (src\collectors\Foo.lua). The GIANTS engine resolves extraSourceFiles using forward
  slashes (src/collectors/Foo.lua), so "Can't load resource" appears and the mod never runs.

  This script uses ZipArchive + CreateEntryFromFile with '/' entry names (POSIX paths inside the zip).

.EXAMPLE
  Set-Location "...\MAIN CODEBASE\FarmHub"
  .\tools\Zip-FarmDashboardMod.ps1

.EXAMPLE
  .\tools\Zip-FarmDashboardMod.ps1 -CopyTo "C:\Users\Graham\Documents\FS25_FarmDashboard.zip"
#>
[CmdletBinding()]
param(
    [string] $RepoRoot = "",
    [string] $OutZipName = "FS25_FarmDashboard.zip",
    [string] $CopyTo = ""
)

$ErrorActionPreference = "Stop"

if (-not $RepoRoot) {
    $RepoRoot = Split-Path -Parent $PSScriptRoot
}

$ModSource = Join-Path $RepoRoot "FS25_FarmDashboard_Mod\FS25_FarmDashboard_Mod"
$DestZip = Join-Path $RepoRoot "FS25_FarmDashboard_Mod\$OutZipName"
$SrcTree = Join-Path $ModSource "src"
$ModDesc = Join-Path $ModSource "modDesc.xml"
$IconPng = Join-Path $ModSource "icon.png"

if (-not (Test-Path -LiteralPath $ModSource -PathType Container)) {
    throw "Mod folder not found: $ModSource"
}
if (-not (Test-Path -LiteralPath $ModDesc)) {
    throw "Missing modDesc.xml: $ModDesc"
}
if (-not (Test-Path -LiteralPath $SrcTree -PathType Container)) {
    throw "Missing src folder: $SrcTree"
}

if (Test-Path -LiteralPath $DestZip) {
    Remove-Item -LiteralPath $DestZip -Force
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$rootNorm = $ModSource.TrimEnd('\', '/')
$zip = [System.IO.Compression.ZipFile]::Open($DestZip, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $ModDesc, "modDesc.xml") | Out-Null
    if (Test-Path -LiteralPath $IconPng) {
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $IconPng, "icon.png") | Out-Null
    } else {
        Write-Warning "icon.png not in mod folder - zip will omit it. Add: $IconPng"
    }
    Get-ChildItem -LiteralPath $SrcTree -Recurse -File | ForEach-Object {
        $full = $_.FullName
        if (-not $full.StartsWith($rootNorm, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Unexpected path under src: $full"
        }
        $rel = $full.Substring($rootNorm.Length).TrimStart('\', '/').Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $full, $rel) | Out-Null
    }
} finally {
    $zip.Dispose()
}

Write-Host "Wrote: $DestZip (only modDesc.xml, icon.png, src/ - POSIX paths inside zip)"

if ($CopyTo) {
    $destParent = Split-Path -Parent $CopyTo
    if ($destParent -and -not (Test-Path -LiteralPath $destParent)) {
        New-Item -ItemType Directory -Path $destParent -Force | Out-Null
    }
    Copy-Item -LiteralPath $DestZip -Destination $CopyTo -Force
    Write-Host "Copied to: $CopyTo"
}
