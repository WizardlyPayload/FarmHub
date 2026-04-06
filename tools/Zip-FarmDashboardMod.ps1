<#
.SYNOPSIS
  Builds FS25_FarmDashboard.zip with modDesc.xml, icon.png, and src at the archive root (no wrapper folder).

.DESCRIPTION
  Reads from FS25_FarmDashboard_Mod\FS25_FarmDashboard_Mod\ only:
    modDesc.xml, icon.png (if present), src\

  Uses -Path (not -LiteralPath) with an array — Windows PowerShell 5.1 is unreliable with
  Compress-Archive -LiteralPath @(...) for multiple items.

.EXAMPLE
  Set-Location "...\MAIN CODEBASE"
  .\tools\Zip-FarmDashboardMod.ps1
#>
[CmdletBinding()]
param(
    [string] $RepoRoot = "",
    [string] $OutZipName = "FS25_FarmDashboard.zip"
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

$toZip = [System.Collections.ArrayList]@()
[void]$toZip.Add($ModDesc)
if (Test-Path -LiteralPath $IconPng) {
    [void]$toZip.Add($IconPng)
} else {
    Write-Warning "icon.png not in mod folder - zip will omit it. Add: $IconPng"
}
[void]$toZip.Add($SrcTree)

# -Path accepts multiple literal paths; -LiteralPath + array is broken on PS 5.1 for this cmdlet
Compress-Archive -Path @($toZip.ToArray()) -DestinationPath $DestZip -CompressionLevel Optimal -Force

Write-Host "Wrote: $DestZip (root: modDesc.xml, icon.png if present, src folder)"
