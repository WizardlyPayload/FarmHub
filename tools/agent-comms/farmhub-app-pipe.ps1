# Return the current Codex desktop pipe only to the FarmHub watcher's parent
# process. Never log or persist its value.
param([switch]$EmitPipeForWatcher)
$ErrorActionPreference = 'Stop'
if (-not $EmitPipeForWatcher) { throw 'PIPE_OUTPUT_FOR_WATCHER_ONLY' }
if (-not $env:CODEX_THREAD_ID) { throw 'CODEX_THREAD_ID_REQUIRED' }

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class FarmHubAppEnvironment {
    [StructLayout(LayoutKind.Sequential)]
    public struct ProcessBasicInformation {
        public IntPtr Reserved1, PebBaseAddress, Reserved2_0, Reserved2_1, UniqueProcessId, Reserved3;
    }
    [DllImport("kernel32.dll", SetLastError=true)]
    private static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll", SetLastError=true)]
    private static extern bool ReadProcessMemory(IntPtr process, IntPtr address, byte[] buffer, int length, out IntPtr read);
    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr process);
    [DllImport("ntdll.dll")]
    private static extern int NtQueryInformationProcess(IntPtr process, int infoClass,
        ref ProcessBasicInformation info, int length, out int returned);

    public static string ReadVariable(int pid, string name) {
        IntPtr process = OpenProcess(0x0410, false, pid);
        if (process == IntPtr.Zero) throw new Exception("APP_PROCESS_OPEN_FAILED");
        try {
            var info = new ProcessBasicInformation(); int returned;
            if (NtQueryInformationProcess(process, 0, ref info, Marshal.SizeOf<ProcessBasicInformation>(), out returned) != 0)
                throw new Exception("APP_PROCESS_QUERY_FAILED");
            IntPtr read; var peb = new byte[0x40];
            if (!ReadProcessMemory(process, info.PebBaseAddress, peb, peb.Length, out read))
                throw new Exception("APP_PEB_READ_FAILED");
            var parameters = new byte[0x100];
            if (!ReadProcessMemory(process, new IntPtr(BitConverter.ToInt64(peb, 0x20)), parameters, parameters.Length, out read))
                throw new Exception("APP_PARAMETERS_READ_FAILED");
            long environment = BitConverter.ToInt64(parameters, 0x80);
            if (environment == 0) throw new Exception("APP_ENVIRONMENT_MISSING");
            foreach (int size in new int[] { 65536, 32768, 16384, 8192 }) {
                var data = new byte[size];
                if (!ReadProcessMemory(process, new IntPtr(environment), data, data.Length, out read)) continue;
                string block = System.Text.Encoding.Unicode.GetString(data, 0, read.ToInt32());
                foreach (string item in block.Split('\0'))
                    if (item.StartsWith(name + "=", StringComparison.OrdinalIgnoreCase))
                        return item.Substring(name.Length + 1);
            }
            throw new Exception("APP_PIPE_NOT_FOUND");
        } finally { CloseHandle(process); }
    }
}
'@

$appServers = @(Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'codex.exe' -and $_.CommandLine -like '*app-server*' -and
    (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.ParentProcessId)").Name -eq 'ChatGPT.exe'
})
if ($appServers.Count -ne 1) { throw "Expected one Codex desktop app server; found $($appServers.Count)." }
$pipeValue = [FarmHubAppEnvironment]::ReadVariable($appServers[0].ProcessId, 'CODEX_APP_TOOLS_PIPE_PATH')
if ([string]::IsNullOrWhiteSpace($pipeValue) -or $pipeValue -match '[\r\n]') { throw 'APP_PIPE_INVALID' }

$node = 'C:\Program Files\nodejs\node.exe'
$rfRoot = 'C:\Users\Graham\Documents\Realistic-Farming'
$original = $env:CODEX_APP_TOOLS_PIPE_PATH
try {
    $env:CODEX_APP_TOOLS_PIPE_PATH = $pipeValue
    Push-Location $rfRoot
    try {
        & $node --input-type=module -e "import {readBrianTask} from './tools/motherbarn-brian/codex-app.mjs'; const result=await readBrianTask({turnLimit:1}); if(result.threadId!==process.env.CODEX_THREAD_ID) throw Error('WRONG_TASK');"
        if ($LASTEXITCODE -ne 0) { throw 'APP_TASK_CHECK_FAILED' }
    } finally { Pop-Location }
    Write-Output $pipeValue
} finally {
    if ($null -eq $original) { Remove-Item Env:CODEX_APP_TOOLS_PIPE_PATH -ErrorAction SilentlyContinue }
    else { $env:CODEX_APP_TOOLS_PIPE_PATH = $original }
}
