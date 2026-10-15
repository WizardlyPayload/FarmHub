param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Save', 'Restore')]
    [string]$Action,

    [Parameter(Mandatory = $true)]
    [string]$RoamingRoot,

    [Parameter(Mandatory = $true)]
    [string]$LocalRoot,

    [Parameter(Mandatory = $true)]
    [string]$ExpectedSid,

    [Parameter(Mandatory = $true)]
    [string]$ExpectedRoamingRoot,

    [Parameter(Mandatory = $true)]
    [string]$ExpectedLocalRoot
)

$ErrorActionPreference = 'Stop'
$maxEntries = 4096
$maxBytes = 128MB
$lockStream = $null
$script:restoreTempPath = $null
$script:restoreTempCreated = $false

function Get-Sha256([string]$Path) {
    $hash = [Security.Cryptography.SHA256]::Create()
    $stream = $null
    try {
        $stream = [IO.File]::OpenRead($Path)
        return [Convert]::ToBase64String($hash.ComputeHash($stream))
    } finally {
        if ($null -ne $stream) { $stream.Dispose() }
        $hash.Dispose()
    }
}

function Assert-PlainPath([string]$Path) {
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    if ($null -ne $item -and ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'A V5 profile path is linked; selected-source staging has stopped.'
    }
}

function Get-BoundedEntries([string]$Root) {
    Assert-PlainPath $Root
    $queue = New-Object System.Collections.Queue
    $items = New-Object 'System.Collections.Generic.List[System.IO.FileSystemInfo]'
    $queue.Enqueue((New-Object IO.DirectoryInfo($Root)))
    $bytes = [long]0
    $prefix = $Root.TrimEnd('\') + '\'

    while ($queue.Count -gt 0) {
        $directory = [IO.DirectoryInfo]$queue.Dequeue()
        foreach ($item in $directory.EnumerateFileSystemInfos()) {
            if (-not $item.FullName.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
                throw 'A staged path escaped its fixed V5 directory.'
            }
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw 'Linked content in V5 Local Storage or its stage is not supported.'
            }
            $items.Add($item)
            if ($items.Count -gt $maxEntries) {
                throw 'V5 Local Storage exceeds the staging entry limit.'
            }
            if ($item.Attributes -band [IO.FileAttributes]::Directory) {
                $queue.Enqueue([IO.DirectoryInfo]$item)
            } else {
                $bytes += ([IO.FileInfo]$item).Length
                if ($bytes -gt $maxBytes) {
                    throw 'V5 Local Storage exceeds the staging size limit.'
                }
            }
        }
    }
    return $items
}

function Get-StageState {
    if (-not [IO.File]::Exists($marker)) {
        return ''
    }
    return [IO.File]::ReadAllText($marker).Trim()
}

function Clear-ExactStage {
    $expected = [IO.Path]::GetFullPath([IO.Path]::Combine($cache, '.upgrade-selection-local-storage'))
    if (-not [string]::Equals($stage, $expected, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Refusing to clear a non-V5 staging path.'
    }
    Assert-PlainPath $profile
    Assert-PlainPath $cache
    Assert-PlainPath $stage
    if (-not [IO.Directory]::Exists($stage)) {
        throw 'The V5 staging path is not a directory.'
    }

    $entries = @(Get-BoundedEntries $stage)
    foreach ($child in [IO.Directory]::EnumerateFileSystemEntries($stage)) {
        $name = [IO.Path]::GetFileName($child)
        if ($name -ieq 'state.txt') {
            if (-not [IO.File]::Exists($child)) { throw 'The V5 stage marker is not a plain file.' }
        } elseif ($name -ieq 'Local Storage') {
            if (-not [IO.Directory]::Exists($child)) { throw 'The V5 staged payload is not a directory.' }
        } else {
            throw 'Unexpected content in the V5 stage; refusing to remove it.'
        }
    }
    $state = Get-StageState
    if ($state -notin @('in-progress', 'complete', 'restored')) {
        if ($state -ne '' -or $entries.Count -ne 0) {
            throw 'Unrecognized V5 staging state; refusing to remove it.'
        }
    }
    for ($i = $entries.Count - 1; $i -ge 0; $i--) {
        $item = $entries[$i]
        Assert-PlainPath $item.FullName
        if ($item.Attributes -band [IO.FileAttributes]::Directory) {
            [IO.Directory]::Delete($item.FullName, $false)
        } else {
            [IO.File]::Delete($item.FullName)
        }
    }
    [IO.Directory]::Delete($stage, $false)
}

function Clear-RestoredHousekeepingStage {
    Assert-PlainPath $profile
    Assert-PlainPath $cache
    Assert-PlainPath $stage
    $entries = @(Get-BoundedEntries $stage)
    if ((Get-StageState) -ne 'restored' -or
        $entries.Count -ne 1 -or
        -not [string]::Equals($entries[0].FullName, $marker, [StringComparison]::OrdinalIgnoreCase) -or
        -not [IO.File]::Exists($marker)) {
        throw 'The restored V5 stage contains data or an unexpected entry; manual recovery is required.'
    }
    [IO.File]::Delete($marker)
    [IO.Directory]::Delete($stage, $false)
}

function Clear-ExactRestoreTemp {
    if (-not $script:restoreTempCreated) { return }
    $temp = $script:restoreTempPath
    if (-not [string]::Equals([IO.Path]::GetDirectoryName($temp), $localProfile, [StringComparison]::OrdinalIgnoreCase) -or
        [IO.Path]::GetFileName($temp) -notmatch '^\.upgrade-selection-local-storage-[0-9a-f]{32}\.tmp$') {
        throw 'Refusing to clear a non-V5 local restore path.'
    }
    Assert-PlainPath $localProfile
    Assert-PlainPath $temp
    if (-not [IO.Directory]::Exists($temp)) {
        throw 'The V5 local restore path is not a directory.'
    }
    $entries = @(Get-BoundedEntries $temp)
    for ($i = $entries.Count - 1; $i -ge 0; $i--) {
        $item = $entries[$i]
        Assert-PlainPath $item.FullName
        if ($item.Attributes -band [IO.FileAttributes]::Directory) {
            [IO.Directory]::Delete($item.FullName, $false)
        } else {
            [IO.File]::Delete($item.FullName)
        }
    }
    [IO.Directory]::Delete($temp, $false)
    $script:restoreTempCreated = $false
}

try {
    $currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    if ([string]::IsNullOrWhiteSpace($ExpectedSid) -or
        -not [string]::Equals($currentSid, $ExpectedSid, [StringComparison]::Ordinal)) {
        throw 'The installer is running under a different Windows user.'
    }
    if (-not [IO.Path]::IsPathRooted($RoamingRoot) -or
        -not [IO.Path]::IsPathRooted($ExpectedRoamingRoot) -or
        -not [IO.Path]::IsPathRooted($LocalRoot) -or
        -not [IO.Path]::IsPathRooted($ExpectedLocalRoot)) {
        throw 'The V5 AppData roots must be absolute paths.'
    }
    $root = [IO.Path]::GetFullPath($RoamingRoot).TrimEnd('\')
    $expectedRoot = [IO.Path]::GetFullPath($ExpectedRoamingRoot).TrimEnd('\')
    $localRoot = [IO.Path]::GetFullPath($LocalRoot).TrimEnd('\')
    $expectedLocalRoot = [IO.Path]::GetFullPath($ExpectedLocalRoot).TrimEnd('\')
    if (-not [string]::Equals($root, $expectedRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'The V5 RoamingRoot differs from the initiating user profile.'
    }
    if (-not [string]::Equals($localRoot, $expectedLocalRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'The V5 LocalRoot differs from the initiating user profile.'
    }
    $profile = [IO.Path]::Combine($root, 'fs25-farm-dashboard-rf')
    $cache = [IO.Path]::Combine($profile, 'serverLiveCache')
    $localProfile = [IO.Path]::Combine($localRoot, 'fs25-farm-dashboard-rf')
    $source = [IO.Path]::Combine($localProfile, 'Local Storage')
    $stage = [IO.Path]::Combine($cache, '.upgrade-selection-local-storage')
    $payload = [IO.Path]::Combine($stage, 'Local Storage')
    $marker = [IO.Path]::Combine($stage, 'state.txt')
    Assert-PlainPath $root
    Assert-PlainPath $localRoot
    Assert-PlainPath $profile
    Assert-PlainPath $cache
    Assert-PlainPath $localProfile
    Assert-PlainPath $source
    Assert-PlainPath $stage

    if ($Action -eq 'Restore') {
        if (-not [IO.Directory]::Exists($stage) -or (Get-StageState) -ne 'complete') {
            throw 'No complete V5 selected-source stage is available to restore.'
        }
        [void]@(Get-BoundedEntries $stage)
        foreach ($child in [IO.Directory]::EnumerateFileSystemEntries($stage)) {
            $name = [IO.Path]::GetFileName($child)
            if ($name -ine 'state.txt' -and $name -ine 'Local Storage') {
                throw 'Unexpected content in the V5 stage; refusing to restore it.'
            }
        }
        if (-not [IO.Directory]::Exists($payload)) {
            throw 'The complete V5 selected-source stage has no Local Storage payload.'
        }
        $payloadEntries = @(Get-BoundedEntries $payload)
        if ([IO.File]::Exists($source)) {
            throw 'Local Storage already exists as a file; restore will not overwrite it.'
        }
        if ([IO.Directory]::Exists($source)) {
            # An ordinary upgrade leaves Electron's original Local Storage in place.
            # Accept it only when every staged entry still matches, except the runtime LOCK.
            $sourceEntries = @(Get-BoundedEntries $source | Where-Object {
                $_.FullName.Substring($source.Length + 1) -ine 'leveldb\LOCK'
            })
            if ($sourceEntries.Count -ne $payloadEntries.Count) {
                throw 'Existing Local Storage differs from the staged copy; restore will not overwrite it.'
            }
            foreach ($item in $payloadEntries) {
                $relative = $item.FullName.Substring($payload.Length + 1)
                $existingPath = [IO.Path]::Combine($source, $relative)
                Assert-PlainPath $existingPath
                if ($item.Attributes -band [IO.FileAttributes]::Directory) {
                    if (-not [IO.Directory]::Exists($existingPath)) {
                        throw 'Existing Local Storage differs from the staged copy; restore will not overwrite it.'
                    }
                } elseif (-not [IO.File]::Exists($existingPath) -or
                    ([IO.FileInfo]$item).Length -ne (New-Object IO.FileInfo($existingPath)).Length -or
                    (Get-Sha256 $item.FullName) -ne (Get-Sha256 $existingPath)) {
                    throw 'Existing Local Storage differs from the staged copy; restore will not overwrite it.'
                }
            }
            [IO.File]::WriteAllText($marker, 'restored')
            Clear-ExactStage
            exit 0
        }
        if (-not [IO.Directory]::Exists($localRoot)) {
            throw 'The initiating user Local AppData root is unavailable.'
        }
        Assert-PlainPath $localRoot
        Assert-PlainPath $localProfile
        if ([IO.File]::Exists($localProfile)) {
            throw 'The V5 Local profile path is not a directory.'
        }
        [void][IO.Directory]::CreateDirectory($localProfile)
        Assert-PlainPath $localProfile
        Assert-PlainPath $source
        if ([IO.Directory]::Exists($source) -or [IO.File]::Exists($source)) {
            throw 'Local Storage appeared during restore; refusing to overwrite it.'
        }
        $script:restoreTempPath = [IO.Path]::Combine(
            $localProfile,
            '.upgrade-selection-local-storage-' + [guid]::NewGuid().ToString('N') + '.tmp'
        )
        if ([IO.Directory]::Exists($script:restoreTempPath) -or [IO.File]::Exists($script:restoreTempPath)) {
            throw 'The V5 local restore path already exists.'
        }
        [void][IO.Directory]::CreateDirectory($script:restoreTempPath)
        $script:restoreTempCreated = $true
        Assert-PlainPath $script:restoreTempPath
        foreach ($item in $payloadEntries) {
            Assert-PlainPath $item.FullName
            $relative = $item.FullName.Substring($payload.Length + 1)
            $target = [IO.Path]::Combine($script:restoreTempPath, $relative)
            if ($item.Attributes -band [IO.FileAttributes]::Directory) {
                [void][IO.Directory]::CreateDirectory($target)
            } else {
                [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))
                [IO.File]::Copy($item.FullName, $target, $false)
                if ((New-Object IO.FileInfo($target)).Length -ne ([IO.FileInfo]$item).Length -or
                    (Get-Sha256 $item.FullName) -ne (Get-Sha256 $target)) {
                    throw 'A restored Local Storage file did not match its staged source.'
                }
            }
        }
        if (@(Get-BoundedEntries $script:restoreTempPath).Count -ne $payloadEntries.Count) {
            throw 'The V5 local restore copy has an unexpected entry count.'
        }
        if ([IO.Directory]::Exists($source) -or [IO.File]::Exists($source)) {
            throw 'Local Storage appeared during restore; refusing to overwrite it.'
        }
        [IO.Directory]::Move($script:restoreTempPath, $source)
        $script:restoreTempCreated = $false
        [IO.File]::WriteAllText($marker, 'restored')
        Clear-ExactStage
        exit 0
    }

    if (-not [IO.Directory]::Exists($source)) {
        if ([IO.File]::Exists($source)) {
            throw 'Local Storage is not a directory.'
        }
        if ([IO.Directory]::Exists($stage)) {
            if ((Get-StageState) -eq 'restored') {
                Clear-RestoredHousekeepingStage
                exit 10
            }
            if ((Get-StageState) -ne 'complete' -or -not [IO.Directory]::Exists($payload)) {
                throw 'Local Storage is absent and the V5 stage is incomplete; manual recovery is required.'
            }
            [void]@(Get-BoundedEntries $stage)
            exit 0
        }
        if ([IO.File]::Exists($stage)) {
            throw 'The V5 staging path is not a directory.'
        }
        exit 10
    }

    $leveldb = [IO.Path]::Combine($source, 'leveldb')
    Assert-PlainPath $leveldb
    if (-not [IO.Directory]::Exists($leveldb)) {
        throw 'Local Storage has no LevelDB directory to lock safely.'
    }
    $lockPath = [IO.Path]::Combine($leveldb, 'LOCK')
    Assert-PlainPath $lockPath
    $lockStream = [IO.File]::Open($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)

    $entries = @(Get-BoundedEntries $source)
    if ([IO.Directory]::Exists($stage)) {
        Clear-ExactStage
    } elseif ([IO.File]::Exists($stage)) {
        throw 'The V5 staging path is not a directory.'
    }
    [void][IO.Directory]::CreateDirectory($cache)
    [void][IO.Directory]::CreateDirectory($stage)
    [IO.File]::WriteAllText($marker, 'in-progress')
    [void][IO.Directory]::CreateDirectory($payload)

    foreach ($item in $entries) {
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw 'Local Storage changed to a linked path during staging.'
        }
        $relative = $item.FullName.Substring($source.Length + 1)
        if ($relative -ieq 'leveldb\LOCK') {
            continue
        }
        $target = [IO.Path]::Combine($payload, $relative)
        if ($item.Attributes -band [IO.FileAttributes]::Directory) {
            [void][IO.Directory]::CreateDirectory($target)
        } else {
            [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))
            [IO.File]::Copy($item.FullName, $target, $false)
            if ((New-Object IO.FileInfo($target)).Length -ne ([IO.FileInfo]$item).Length) {
                throw 'A staged Local Storage file did not match its source length.'
            }
        }
    }
    [IO.File]::WriteAllText($marker, 'complete')
    exit 0
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
} finally {
    if ($null -ne $lockStream) {
        $lockStream.Dispose()
    }
    if ($script:restoreTempCreated) {
        try {
            Clear-ExactRestoreTemp
        } catch {
            [Console]::Error.WriteLine('The V5 local restore copy needs manual cleanup: ' + $_.Exception.Message)
        }
    }
}
