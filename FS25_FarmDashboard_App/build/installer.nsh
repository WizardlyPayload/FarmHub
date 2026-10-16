; Farm Dashboard NSIS — language first (customWelcomePage), then ImageMagick after install (customInstall).
; Persists installer_locale in HKCU + %TEMP% so "Install for all users" (UAC restart) keeps the same language pre-selected.
; Writes the installing user's roaming profile install-locale.txt (2-letter code)
; for first launch. All-users setup must use the current-user shell context so
; $APPDATA is not ProgramData.
; Requires nsis.warningsAsErrors = false in package.json for some NSIS builds.

; Replaces electron-builder's default app-running check. Default taskkill omits /T, so GPU/helper child
; processes can keep app.asar locked — NSIS then shows "cannot be closed" even after a reboot.
; V5 matches only processes whose executable is exactly $INSTDIR\${APP_EXECUTABLE_FILENAME}; the bundled
; check matches any process under $INSTDIR (including this uninstaller) and V4's taskkill /IM matches the
; image name anywhere.
!macro customCheckAppRunning
  !if "${APP_ID}" == "com.farmdashboard.rf"
    !insertmacro FarmDashV5CheckAppRunning
  !else
    DetailPrint "Stopping ${PRODUCT_NAME} if running (/F /T so child processes release file locks)..."
    ClearErrors
    nsExec::ExecToLog `"$SYSDIR\taskkill.exe" /F /T /IM "${APP_EXECUTABLE_FILENAME}"`
    Pop $R0
    Sleep 1500
    ClearErrors
  !endif
!macroend

; PowerShell for the V5 check. Inputs come only from the environment (FARMDASH_APP_EXE, FARMDASH_APP_ACTION)
; so install paths are never parsed as code. Must stay free of double quotes and backticks; $$ is a literal $.
; Exit: 0 = the exact app still runs as this user, 1 = not running, 3 = check failed,
; 4 = the exact app runs but is not ours to close (another user, unknown owner, or our own ancestor).
; Stop closes main windows, waits, then kills only this user's exact-path processes that are not ancestors.
; NSIS runs the 32-bit PowerShell, where Process.Path of the 64-bit app is null, so each action is bound to the
; matched instance instead: open and hold a handle (a held handle stops the PID being reused), then require its
; start time, truncated to whole microseconds, to equal the CIM CreationDate exactly (WMI stores microseconds,
; the handle 100 ns). No held, matching handle means no close and no kill. Kill only reuses a handle that was
; offered the graceful close and still matches. Windows PowerShell returns null instead of throwing when a
; property getter fails (refused Handle or StartTime), so every identity value is checked explicitly.
!define FarmDashAppRunningPs `$$ErrorActionPreference='Stop';try{`
!define /redef FarmDashAppRunningPs `${FarmDashAppRunningPs}$$t=$$env:FARMDASH_APP_EXE;$$a=$$env:FARMDASH_APP_ACTION;`
!define /redef FarmDashAppRunningPs `${FarmDashAppRunningPs}if(-not $$t -or -not [IO.Path]::IsPathRooted($$t)){exit 3};`
!define /redef FarmDashAppRunningPs `${FarmDashAppRunningPs}$$t=[IO.Path]::GetFullPath($$t);`
!define /redef FarmDashAppRunningPs `${FarmDashAppRunningPs}$$me=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;`
!define /redef FarmDashAppRunningPs `${FarmDashAppRunningPs}$$sel={$$all=@(Get-CimInstance -ClassName Win32_Process -OperationTimeoutSec 30);`
!define /redef FarmDashAppRunningPs `${FarmDashAppRunningPs}$$by=@{};foreach($$p in $$all){$$by[[int]$$p.ProcessId]=$$p};`
!define /redef FarmDashAppRunningPs `${FarmDashAppRunningPs}$$anc=@{};$$c=[int]$$PID;`
!define /redef FarmDashAppRunningPs `${FarmDashAppRunningPs}while($$by.ContainsKey($$c) -and -not $$anc.ContainsKey($$c)){$$anc[$$c]=1;$$p=$$by[$$c];$$n=[int]$$p.ParentProcessId;`
!define /redef FarmDashAppRunningPs `${FarmDashAppRunningPs}if(-not $$by.ContainsKey($$n) -or ($$by[$$n].CreationDate -gt $$p.CreationDate)){break};$$c=$$n};`
!define /redef FarmDashAppRunningPs `${FarmDashAppRunningPs}$$r=@{own=@();other=@();anc=@()};`
!define /redef FarmDashAppRunningPs `${FarmDashAppRunningPs}foreach($$p in $$all){$$x=[string]$$p.ExecutablePath;if(-not $$x){continue};`
!define /redef FarmDashAppRunningPs `${FarmDashAppRunningPs}try{$$x=[IO.Path]::GetFullPath($$x)}catch{continue};`
!define /redef FarmDashAppRunningPs `${FarmDashAppRunningPs}if(-not [string]::Equals($$x,$$t,[StringComparison]::OrdinalIgnoreCase)){continue};`
!define /redef FarmDashAppRunningPs `${FarmDashAppRunningPs}if($$anc.ContainsKey([int]$$p.ProcessId)){$$r.anc+=$$p;continue};`
!define /redef FarmDashAppRunningPs `${FarmDashAppRunningPs}$$o=$$null;try{$$o=[string](Invoke-CimMethod -InputObject $$p -MethodName GetOwnerSid -OperationTimeoutSec 15).Sid}catch{};`
!define /redef FarmDashAppRunningPs `${FarmDashAppRunningPs}if($$o -and $$o -eq $$me){$$r.own+=$$p}else{$$r.other+=$$p}};$$r};`
!define /redef FarmDashAppRunningPs `${FarmDashAppRunningPs}$$r=& $$sel;`
!define /redef FarmDashAppRunningPs `${FarmDashAppRunningPs}if($$a -eq 'Find'){if(($$r.own.Count+$$r.anc.Count) -gt 0){exit 0};if($$r.other.Count -gt 0){exit 4};exit 1};`
!define /redef FarmDashAppRunningPs `${FarmDashAppRunningPs}if($$a -ne 'Stop'){exit 3};`
!define /redef FarmDashAppRunningPs `${FarmDashAppRunningPs}$$us={param($$d)$$k=$$d.ToUniversalTime().Ticks;$$k-($$k%10)};`
!define /redef FarmDashAppRunningPs `${FarmDashAppRunningPs}$$pin={param($$p)try{$$h=Get-Process -Id ([int]$$p.ProcessId);$$hn=$$h.Handle;`
!define /redef FarmDashAppRunningPs `${FarmDashAppRunningPs}if(($$null -eq $$hn) -or ([int64]$$hn -eq 0)){return $$null};$$st=$$h.StartTime;`
!define /redef FarmDashAppRunningPs `${FarmDashAppRunningPs}if(($$null -ne $$st) -and ((& $$us $$st) -eq (& $$us $$p.CreationDate))){return $$h}}catch{};$$null};`
!define /redef FarmDashAppRunningPs `${FarmDashAppRunningPs}$$held=@{};foreach($$p in $$r.own){$$h=& $$pin $$p;`
!define /redef FarmDashAppRunningPs `${FarmDashAppRunningPs}if($$h){$$held[[string]$$p.ProcessId+'|'+(& $$us $$p.CreationDate)]=$$h;try{[void]$$h.CloseMainWindow()}catch{}}};`
!define /redef FarmDashAppRunningPs `${FarmDashAppRunningPs}$$end=(Get-Date).AddSeconds(10);`
!define /redef FarmDashAppRunningPs `${FarmDashAppRunningPs}while((($$r.own.Count+$$r.anc.Count) -gt 0) -and ((Get-Date) -lt $$end)){Start-Sleep -Milliseconds 500;$$r=& $$sel};`
!define /redef FarmDashAppRunningPs `${FarmDashAppRunningPs}foreach($$p in $$r.own){$$h=$$held[[string]$$p.ProcessId+'|'+(& $$us $$p.CreationDate)];`
!define /redef FarmDashAppRunningPs `${FarmDashAppRunningPs}if($$h){try{$$st=$$h.StartTime;if(($$h.HasExited -eq $$false) -and ($$null -ne $$st) -and ((& $$us $$st) -eq (& $$us $$p.CreationDate))){$$h.Kill()}}catch{}}};`
!define /redef FarmDashAppRunningPs `${FarmDashAppRunningPs}if($$r.own.Count -gt 0){Start-Sleep -Milliseconds 1000;$$r=& $$sel};`
!define /redef FarmDashAppRunningPs `${FarmDashAppRunningPs}if($$r.own.Count -gt 0){exit 0};if(($$r.anc.Count+$$r.other.Count) -gt 0){exit 4};exit 1`
!define /redef FarmDashAppRunningPs `${FarmDashAppRunningPs}}catch{exit 3}`

!macro FarmDashV5CannotClose
  DetailPrint `${PRODUCT_NAME} is still running (check result $R0).`
  MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY +3
  SetErrorLevel 1
  Quit
!macroend

; Inserted by electron-builder in the install section and in un.checkAppRunning (before un.onInit's
; initMultiUser/customUnInit). Every failure quits before files, uninstaller or registration change.
!macro FarmDashV5CheckAppRunning
  Push "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  System::Call 'Kernel32::SetEnvironmentVariable(t "FARMDASH_APP_EXE", t s)'
  ${If} ${isUpdated}
    Sleep 300
  ${EndIf}
  StrCpy $R1 "Find"
  ${Do}
    Push $R1
    System::Call 'Kernel32::SetEnvironmentVariable(t "FARMDASH_APP_ACTION", t s)'
    ${If} $R1 == "Stop"
      DetailPrint "$(appClosing)"
    ${EndIf}
    nsExec::Exec `"$PowerShellPath" -NoProfile -NonInteractive -WindowStyle Hidden -Command "${FarmDashAppRunningPs}"`
    Pop $R0
    ${If} $R0 == "1"
      ${Break}
    ${EndIf}
    ${If} $R0 == "0"
    ${AndIf} $R1 == "Find"
      StrCpy $R1 "Stop"
      ${IfNot} ${isUpdated}
        MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK +3
        SetErrorLevel 1
        Quit
      ${EndIf}
    ${ElseIf} $R0 == "0"
      !insertmacro FarmDashV5CannotClose
    ${ElseIf} $R0 == "4"
      !insertmacro FarmDashV5CannotClose
      StrCpy $R1 "Find"
    ${Else}
      DetailPrint `Could not check whether ${PRODUCT_NAME} is running (result $R0).`
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Setup could not check whether ${PRODUCT_NAME} is running (result $R0).$\r$\n$\r$\nNothing has been changed. Click Retry to check again, or Cancel to stop." /SD IDCANCEL IDRETRY +3
      SetErrorLevel 1
      Quit
      StrCpy $R1 "Find"
    ${EndIf}
  ${Loop}
  !ifndef BUILD_UNINSTALLER
    ; installSection calls this before uninstallOldVersion. The UAC inner instance
    ; skips that call, so customInit invokes this same check there instead.
    !insertmacro FarmDashV5StageUpgradeSelection
  !endif
!macroend

; Only the new V5 installer stages Local Storage. The old installed uninstaller
; cannot be changed and its Keep path removes Local Storage during an upgrade.
!macro FarmDashV5StageUpgradeSelection
  ${If} $FarmDashInitiatingSid == ""
    !insertmacro FarmDashV5IdentityStop
  ${EndIf}
  ${If} $FarmDashInitiatingRoamingRoot == ""
    !insertmacro FarmDashV5IdentityStop
  ${EndIf}
  ${If} $FarmDashInitiatingLocalRoot == ""
    !insertmacro FarmDashV5IdentityStop
  ${EndIf}
  StrCpy $FarmDashUpgradeSelectionSaved "0"
  InitPluginsDir
  ClearErrors
  File /oname=$PLUGINSDIR\farmdash-upgrade-selection.ps1 "${BUILD_RESOURCES_DIR}\upgrade-selected-source.ps1"
  ${If} ${Errors}
    DetailPrint "Could not extract the V5 selected-source upgrade helper."
    MessageBox MB_OK|MB_ICONEXCLAMATION "Setup could not prepare selected-source preservation. The old installation has not been removed." /SD IDOK
    SetErrorLevel 1
    Quit
  ${EndIf}
  SetShellVarContext current
  nsExec::ExecToLog `powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "$PLUGINSDIR\farmdash-upgrade-selection.ps1" -Action Save -RoamingRoot "$FarmDashInitiatingRoamingRoot" -LocalRoot "$FarmDashInitiatingLocalRoot" -ExpectedSid "$FarmDashInitiatingSid" -ExpectedRoamingRoot "$FarmDashInitiatingRoamingRoot" -ExpectedLocalRoot "$FarmDashInitiatingLocalRoot"`
  Pop $R0
  ${If} $installMode == "all"
    SetShellVarContext all
  ${EndIf}
  ${If} $R0 == "0"
    StrCpy $FarmDashUpgradeSelectionSaved "1"
  ${ElseIf} $R0 != "10"
    DetailPrint "V5 selected-source staging failed (exit $R0); old uninstaller not started."
    MessageBox MB_OK|MB_ICONEXCLAMATION "Setup could not safely preserve the selected source (exit $R0). The old installation has not been removed. Close Farm Dashboard and retry. If an earlier attempt left a staged copy, it remains in this user's V5 serverLiveCache for recovery." /SD IDOK
    SetErrorLevel 1
    Quit
  ${EndIf}
!macroend

!include nsDialogs.nsh

Var FarmDashLangCombo
Var FarmDashSavedLang
Var FarmDashUpgradeSelectionSaved
Var FarmDashInitiatingSid
Var FarmDashInitiatingRoamingRoot
Var FarmDashInitiatingLocalRoot
Var FarmDashCurrentSid
Var FarmDashCurrentRoamingRoot
Var FarmDashCurrentLocalRoot
; 0 = keep config.json + serverLiveCache only; 1 = remove all user-level data (set in customUnInit).
Var FarmDashWipeUserData

!macro FarmDashV5IdentityStop
  DetailPrint "V5 installer user identity could not be matched before selected-source preservation."
  MessageBox MB_ICONSTOP|MB_OK "Setup cannot confirm that this installer is running as the dashboard's Windows user. Nothing has been uninstalled. Run the update under the dashboard user's administrator account." /SD IDOK
  SetErrorLevel 1
  Abort "V5 installer user identity mismatch"
!macroend

; Read the token SID and both Windows AppData known folders, not the shell
; context or inherited environment variables. Write() avoids trailing newlines.
!macro FarmDashV5ReadCurrentIdentity
  StrCpy $FarmDashCurrentSid ""
  StrCpy $FarmDashCurrentRoamingRoot ""
  StrCpy $FarmDashCurrentLocalRoot ""
  nsExec::ExecToStack `powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -Command "[Console]::Out.Write([Security.Principal.WindowsIdentity]::GetCurrent().User.Value)"`
  Pop $R0
  Pop $FarmDashCurrentSid
  ${If} $R0 != "0"
    !insertmacro FarmDashV5IdentityStop
  ${EndIf}
  ${If} $FarmDashCurrentSid == ""
    !insertmacro FarmDashV5IdentityStop
  ${EndIf}
  nsExec::ExecToStack `powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -Command "[Console]::Out.Write([IO.Path]::GetFullPath([Environment]::GetFolderPath([Environment+SpecialFolder]::ApplicationData)).TrimEnd([char]92))"`
  Pop $R0
  Pop $FarmDashCurrentRoamingRoot
  ${If} $R0 != "0"
    !insertmacro FarmDashV5IdentityStop
  ${EndIf}
  ${If} $FarmDashCurrentRoamingRoot == ""
    !insertmacro FarmDashV5IdentityStop
  ${EndIf}
  nsExec::ExecToStack `powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -Command "[Console]::Out.Write([IO.Path]::GetFullPath([Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)).TrimEnd([char]92))"`
  Pop $R0
  Pop $FarmDashCurrentLocalRoot
  ${If} $R0 != "0"
    !insertmacro FarmDashV5IdentityStop
  ${EndIf}
  ${If} $FarmDashCurrentLocalRoot == ""
    !insertmacro FarmDashV5IdentityStop
  ${EndIf}
!macroend

; UAC inner installers bypass installSection's CHECK_APP_RUNNING. Run the same
; exact-path stop and selection staging here only for that install instance.
!macro customInit
  !if "${APP_ID}" == "com.farmdashboard.rf"
    !insertmacro FarmDashV5ReadCurrentIdentity
    ${If} ${UAC_IsInnerInstance}
      ; The outer instance captured these before UAC. Credential elevation to
      ; a different account must stop before even the exact-app running check.
      !insertmacro UAC_AsUser_GetGlobalVar $FarmDashInitiatingSid
      !insertmacro UAC_AsUser_GetGlobalVar $FarmDashInitiatingRoamingRoot
      !insertmacro UAC_AsUser_GetGlobalVar $FarmDashInitiatingLocalRoot
      ${If} $FarmDashInitiatingSid == ""
        !insertmacro FarmDashV5IdentityStop
      ${EndIf}
      ${If} $FarmDashInitiatingRoamingRoot == ""
        !insertmacro FarmDashV5IdentityStop
      ${EndIf}
      ${If} $FarmDashInitiatingLocalRoot == ""
        !insertmacro FarmDashV5IdentityStop
      ${EndIf}
      ${If} $FarmDashCurrentSid != $FarmDashInitiatingSid
        !insertmacro FarmDashV5IdentityStop
      ${EndIf}
      ${If} $FarmDashCurrentRoamingRoot != $FarmDashInitiatingRoamingRoot
        !insertmacro FarmDashV5IdentityStop
      ${EndIf}
      ${If} $FarmDashCurrentLocalRoot != $FarmDashInitiatingLocalRoot
        !insertmacro FarmDashV5IdentityStop
      ${EndIf}
      !insertmacro FarmDashV5CheckAppRunning
    ${Else}
      StrCpy $FarmDashInitiatingSid $FarmDashCurrentSid
      StrCpy $FarmDashInitiatingRoamingRoot $FarmDashCurrentRoamingRoot
      StrCpy $FarmDashInitiatingLocalRoot $FarmDashCurrentLocalRoot
    ${EndIf}
  !endif
!macroend

; A failed helper must stop before electron-builder deletes the executable,
; uninstaller, and Windows uninstall records. Silent mode must fail too.
!macro FarmDashAssertCleanupSuccess Phase
  ${If} $R0 != "0"
    DetailPrint "${Phase} incomplete (exit $R0). Application and uninstaller retained for retry."
    MessageBox MB_OK|MB_ICONEXCLAMATION "${Phase} did not finish (exit $R0).$\r$\n$\r$\nThe application and uninstaller have been kept so you can retry.$\r$\nClose applications holding Dashboard files. For exit 740, run this uninstaller as administrator to remove Dashboard-owned ImageMagick.$\r$\n$\r$\nSee FarmDashImageMagickUninstall.log in your temporary folder for dependency details." /SD IDOK
    SetErrorLevel 1
    Abort "${Phase} incomplete"
  ${EndIf}
!macroend

!macro customWelcomePage
  Page custom FarmDashLangPageShow FarmDashLangPageLeave
!macroend

; Pre-select dropdown after combo is filled ($FarmDashSavedLang = 2-letter code or empty)
Function FarmDashPrefillLangCombo
  StrCmp $FarmDashSavedLang "" FarmDashPrefillEnglish
  StrCmp $FarmDashSavedLang "en" 0 +3
    ${NSD_CB_SelectString} $FarmDashLangCombo "en - English"
    Goto FarmDashPrefillDone
  StrCmp $FarmDashSavedLang "bg" 0 +3
    ${NSD_CB_SelectString} $FarmDashLangCombo "bg - Български"
    Goto FarmDashPrefillDone
  StrCmp $FarmDashSavedLang "hr" 0 +3
    ${NSD_CB_SelectString} $FarmDashLangCombo "hr - Hrvatski"
    Goto FarmDashPrefillDone
  StrCmp $FarmDashSavedLang "cs" 0 +3
    ${NSD_CB_SelectString} $FarmDashLangCombo "cs - Čeština"
    Goto FarmDashPrefillDone
  StrCmp $FarmDashSavedLang "da" 0 +3
    ${NSD_CB_SelectString} $FarmDashLangCombo "da - Dansk"
    Goto FarmDashPrefillDone
  StrCmp $FarmDashSavedLang "nl" 0 +3
    ${NSD_CB_SelectString} $FarmDashLangCombo "nl - Nederlands"
    Goto FarmDashPrefillDone
  StrCmp $FarmDashSavedLang "et" 0 +3
    ${NSD_CB_SelectString} $FarmDashLangCombo "et - Eesti"
    Goto FarmDashPrefillDone
  StrCmp $FarmDashSavedLang "fi" 0 +3
    ${NSD_CB_SelectString} $FarmDashLangCombo "fi - Suomi"
    Goto FarmDashPrefillDone
  StrCmp $FarmDashSavedLang "fr" 0 +3
    ${NSD_CB_SelectString} $FarmDashLangCombo "fr - Français"
    Goto FarmDashPrefillDone
  StrCmp $FarmDashSavedLang "de" 0 +3
    ${NSD_CB_SelectString} $FarmDashLangCombo "de - Deutsch"
    Goto FarmDashPrefillDone
  StrCmp $FarmDashSavedLang "el" 0 +3
    ${NSD_CB_SelectString} $FarmDashLangCombo "el - Ελληνικά"
    Goto FarmDashPrefillDone
  StrCmp $FarmDashSavedLang "hu" 0 +3
    ${NSD_CB_SelectString} $FarmDashLangCombo "hu - Magyar"
    Goto FarmDashPrefillDone
  StrCmp $FarmDashSavedLang "ga" 0 +3
    ${NSD_CB_SelectString} $FarmDashLangCombo "ga - Gaeilge"
    Goto FarmDashPrefillDone
  StrCmp $FarmDashSavedLang "it" 0 +3
    ${NSD_CB_SelectString} $FarmDashLangCombo "it - Italiano"
    Goto FarmDashPrefillDone
  StrCmp $FarmDashSavedLang "lv" 0 +3
    ${NSD_CB_SelectString} $FarmDashLangCombo "lv - Latviešu"
    Goto FarmDashPrefillDone
  StrCmp $FarmDashSavedLang "lt" 0 +3
    ${NSD_CB_SelectString} $FarmDashLangCombo "lt - Lietuvių"
    Goto FarmDashPrefillDone
  StrCmp $FarmDashSavedLang "mt" 0 +3
    ${NSD_CB_SelectString} $FarmDashLangCombo "mt - Malti"
    Goto FarmDashPrefillDone
  StrCmp $FarmDashSavedLang "pl" 0 +3
    ${NSD_CB_SelectString} $FarmDashLangCombo "pl - Polski"
    Goto FarmDashPrefillDone
  StrCmp $FarmDashSavedLang "pt" 0 +3
    ${NSD_CB_SelectString} $FarmDashLangCombo "pt - Português"
    Goto FarmDashPrefillDone
  StrCmp $FarmDashSavedLang "ro" 0 +3
    ${NSD_CB_SelectString} $FarmDashLangCombo "ro - Română"
    Goto FarmDashPrefillDone
  StrCmp $FarmDashSavedLang "sk" 0 +3
    ${NSD_CB_SelectString} $FarmDashLangCombo "sk - Slovenčina"
    Goto FarmDashPrefillDone
  StrCmp $FarmDashSavedLang "sl" 0 +3
    ${NSD_CB_SelectString} $FarmDashLangCombo "sl - Slovenščina"
    Goto FarmDashPrefillDone
  StrCmp $FarmDashSavedLang "es" 0 +3
    ${NSD_CB_SelectString} $FarmDashLangCombo "es - Español"
    Goto FarmDashPrefillDone
  StrCmp $FarmDashSavedLang "sv" 0 +3
    ${NSD_CB_SelectString} $FarmDashLangCombo "sv - Svenska"
    Goto FarmDashPrefillDone
  StrCmp $FarmDashSavedLang "is" 0 +3
    ${NSD_CB_SelectString} $FarmDashLangCombo "is - Íslenska"
    Goto FarmDashPrefillDone
  StrCmp $FarmDashSavedLang "nb" 0 +3
    ${NSD_CB_SelectString} $FarmDashLangCombo "nb - Norsk bokmål"
    Goto FarmDashPrefillDone
  StrCmp $FarmDashSavedLang "uk" 0 +3
    ${NSD_CB_SelectString} $FarmDashLangCombo "uk - Українська"
    Goto FarmDashPrefillDone
FarmDashPrefillEnglish:
  ${NSD_CB_SelectString} $FarmDashLangCombo "en - English"
FarmDashPrefillDone:
FunctionEnd

Function FarmDashLangPageShow
  StrCpy $FarmDashSavedLang ""
  StrCpy $R7 "fs25-farm-dashboard"
  StrCmp "${APP_ID}" "com.farmdashboard.rf" 0 FarmDashLangRegReady
  StrCpy $R7 "fs25-farm-dashboard-rf"
FarmDashLangRegReady:
  ReadRegStr $0 HKCU "Software\$R7" "installer_locale"
  StrCmp $0 "" FarmDashTryTempFile
  StrCpy $FarmDashSavedLang $0
  Goto FarmDashLangUi
FarmDashTryTempFile:
  IfFileExists "$TEMP\farmdash-install-locale.txt" 0 FarmDashLangUi
  FileOpen $1 "$TEMP\farmdash-install-locale.txt" r
  IfErrors FarmDashLangUi
  FileRead $1 $0
  FileClose $1
  StrCpy $0 $0 2
  StrCmp $0 "" FarmDashLangUi
  StrCpy $FarmDashSavedLang $0

FarmDashLangUi:
  nsDialogs::Create 1018
  Pop $0
  StrCmp $FarmDashSavedLang "" FarmDashLblDefault FarmDashLblRestart
FarmDashLblRestart:
  ${NSD_CreateLabel} 0 0 100% 52u "Choose your language for Farm Dashboard (setup wizard and app).$\r$\n$\r$\nIf the installer restarted for administrator rights, your previous choice is pre-selected below — press Next to continue.$\r$\n$\r$\nSprache / Langue / Idioma / … — same list as in the app."
  Pop $0
  Goto FarmDashAfterLbl
FarmDashLblDefault:
  ${NSD_CreateLabel} 0 0 100% 40u "Choose your language for Farm Dashboard (setup wizard and app). You can change this later in Theme settings.$\r$\n$\r$\nSprache / Langue / Idioma / … — same list as in the app."
  Pop $0
FarmDashAfterLbl:
  ${NSD_CreateDropList} 0 56u 100% 220u ""
  Pop $FarmDashLangCombo
  ${NSD_CB_AddString} $FarmDashLangCombo "en - English"
  ${NSD_CB_AddString} $FarmDashLangCombo "bg - Български"
  ${NSD_CB_AddString} $FarmDashLangCombo "hr - Hrvatski"
  ${NSD_CB_AddString} $FarmDashLangCombo "cs - Čeština"
  ${NSD_CB_AddString} $FarmDashLangCombo "da - Dansk"
  ${NSD_CB_AddString} $FarmDashLangCombo "nl - Nederlands"
  ${NSD_CB_AddString} $FarmDashLangCombo "et - Eesti"
  ${NSD_CB_AddString} $FarmDashLangCombo "fi - Suomi"
  ${NSD_CB_AddString} $FarmDashLangCombo "fr - Français"
  ${NSD_CB_AddString} $FarmDashLangCombo "de - Deutsch"
  ${NSD_CB_AddString} $FarmDashLangCombo "el - Ελληνικά"
  ${NSD_CB_AddString} $FarmDashLangCombo "hu - Magyar"
  ${NSD_CB_AddString} $FarmDashLangCombo "ga - Gaeilge"
  ${NSD_CB_AddString} $FarmDashLangCombo "it - Italiano"
  ${NSD_CB_AddString} $FarmDashLangCombo "lv - Latviešu"
  ${NSD_CB_AddString} $FarmDashLangCombo "lt - Lietuvių"
  ${NSD_CB_AddString} $FarmDashLangCombo "mt - Malti"
  ${NSD_CB_AddString} $FarmDashLangCombo "pl - Polski"
  ${NSD_CB_AddString} $FarmDashLangCombo "pt - Português"
  ${NSD_CB_AddString} $FarmDashLangCombo "ro - Română"
  ${NSD_CB_AddString} $FarmDashLangCombo "sk - Slovenčina"
  ${NSD_CB_AddString} $FarmDashLangCombo "sl - Slovenščina"
  ${NSD_CB_AddString} $FarmDashLangCombo "es - Español"
  ${NSD_CB_AddString} $FarmDashLangCombo "sv - Svenska"
  ${NSD_CB_AddString} $FarmDashLangCombo "is - Íslenska"
  ${NSD_CB_AddString} $FarmDashLangCombo "nb - Norsk bokmål"
  ${NSD_CB_AddString} $FarmDashLangCombo "uk - Українська"
  Call FarmDashPrefillLangCombo
  nsDialogs::Show
FunctionEnd

Function FarmDashLangPageLeave
  ${NSD_GetText} $FarmDashLangCombo $0
  StrCpy $R9 $0 2
  ${If} $R9 == ""
    StrCpy $R9 "en"
  ${EndIf}
  StrCpy $R7 "fs25-farm-dashboard"
  StrCmp "${APP_ID}" "com.farmdashboard.rf" 0 FarmDashLocaleDirReady
  StrCpy $R7 "fs25-farm-dashboard-rf"
FarmDashLocaleDirReady:
  WriteRegStr HKCU "Software\$R7" "installer_locale" "$R9"
  ClearErrors
  FileOpen $1 "$TEMP\farmdash-install-locale.txt" w
  IfErrors FarmDashSkipTemp
  FileWrite $1 $R9
  FileClose $1
FarmDashSkipTemp:
  ; Do not create an application profile merely by visiting/cancelling setup.
FunctionEnd

!macro customInstall
  !if "${APP_ID}" == "com.farmdashboard.rf"
    ${If} $FarmDashUpgradeSelectionSaved == "1"
      SetShellVarContext current
      nsExec::ExecToLog `powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "$PLUGINSDIR\farmdash-upgrade-selection.ps1" -Action Restore -RoamingRoot "$FarmDashInitiatingRoamingRoot" -LocalRoot "$FarmDashInitiatingLocalRoot" -ExpectedSid "$FarmDashInitiatingSid" -ExpectedRoamingRoot "$FarmDashInitiatingRoamingRoot" -ExpectedLocalRoot "$FarmDashInitiatingLocalRoot"`
      Pop $R0
      ${If} $installMode == "all"
        SetShellVarContext all
      ${EndIf}
      ${If} $R0 != "0"
        DetailPrint "V5 selected-source restoration failed (exit $R0); staged data retained."
        MessageBox MB_OK|MB_ICONEXCLAMATION "The new app files were copied, but the selected source could not be restored (exit $R0). Do not launch Farm Dashboard yet. The staged Local Storage remains in this user's V5 serverLiveCache for recovery." /SD IDOK
        SetErrorLevel 1
        Abort "V5 selected-source restoration failed"
      ${EndIf}
    ${EndIf}
    DetailPrint "Registering V5 with Windows Installed apps..."
    ClearErrors
    ReadRegDWORD $R5 SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "EstimatedSize"
    IfErrors 0 +2
      StrCpy $R5 "0"
    StrCmp $R5 "" 0 +2
      StrCpy $R5 "0"
    nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "$INSTDIR\resources\windows-install-state.ps1" -Action Register -InstallDirectory "$INSTDIR" -Scope "$installMode" -Version "${VERSION}" -EstimatedSizeKB $R5'
    Pop $R0
    ${If} $R0 != "0"
      MessageBox MB_OK|MB_ICONEXCLAMATION "V5 files were copied, but Windows installation registration failed (exit $R0).$\r$\n$\r$\nSetup has not completed successfully. Your files and uninstaller have been retained for repair.$\r$\n$\r$\nDetails: FarmDashWindowsRegistration.log in your temporary folder." /SD IDOK
      SetErrorLevel 1
      Abort "Windows installation registration failed"
    ${EndIf}
  !endif
  StrCpy $R4 "V4"
  StrCpy $R7 "fs25-farm-dashboard"
  StrCmp "${APP_ID}" "com.farmdashboard.rf" 0 FarmDash_InstallIdentityReady
  StrCpy $R4 "V5"
  StrCpy $R7 "fs25-farm-dashboard-rf"
  FarmDash_InstallIdentityReady:
    ReadRegStr $R9 HKCU "Software\$R7" "installer_locale"
    StrCmp $R9 "" 0 FarmDash_InstallLocaleReady
    StrCpy $R9 "en"
  FarmDash_InstallLocaleReady:
    CreateDirectory "$APPDATA\$R7"
    ClearErrors
    FileOpen $1 "$APPDATA\$R7\install-locale.txt" w
    IfErrors FarmDash_InstallLocaleDone
    FileWrite $1 $R9
    FileClose $1
  FarmDash_InstallLocaleDone:
  IfFileExists "$INSTDIR\resources\install-imagemagick.ps1" FarmDash_RunMagick FarmDash_MagickDone
  FarmDash_RunMagick:
    DetailPrint "Installing ImageMagick (mod folder DDS to PNG thumbnails)..."
    ; nsExec::ExecToLog runs hidden — avoids a PowerShell console. ImageMagick itself may still
    ; show the normal Windows permission prompt when this setup is not already elevated.
    ${If} ${Silent}
      nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "$INSTDIR\resources\install-imagemagick.ps1" -NoPackageManagers -Edition $R4'
    ${Else}
      nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "$INSTDIR\resources\install-imagemagick.ps1" -NoPackageManagers -AllowElevation -Edition $R4'
    ${EndIf}
    Pop $R0
    ${If} $R0 == "1223"
      DetailPrint "ImageMagick was not installed (Windows permission prompt declined)."
    ${ElseIf} $R0 == "740"
      DetailPrint "ImageMagick needs administrator permission. See FarmDashImageMagickInstall.log."
      MessageBox MB_OK|MB_ICONINFORMATION "Farm Dashboard is installed, but ImageMagick still needs administrator permission.$\r$\n$\r$\nClick OK, then approve the Windows permission prompt if it appears, or re-run setup and choose Install for all users.$\r$\n$\r$\nDetails: FarmDashImageMagickInstall.log in your temporary folder." /SD IDOK
    ${ElseIf} $R0 != "0"
      DetailPrint "ImageMagick setup failed (exit $R0). See FarmDashImageMagickInstall.log."
      MessageBox MB_OK|MB_ICONINFORMATION "Farm Dashboard is installed, but ImageMagick setup did not complete (exit $R0).$\r$\n$\r$\nDetails: FarmDashImageMagickInstall.log in your temporary folder." /SD IDOK
    ${EndIf}
  FarmDash_MagickDone:
!macroend

; Runs at start of uninstall (before files are removed). Ask whether to keep profile data.
!macro customUnInit
  StrCpy $FarmDashWipeUserData "0"
  !if "${APP_ID}" == "com.farmdashboard.rf"
    ClearErrors
    ${GetParameters} $R9
    ${GetOptions} $R9 "--delete-app-data" $R8
    ${IfNot} ${Errors}
      StrCpy $FarmDashWipeUserData "1"
      Goto FarmDashUnInitDone
    ${EndIf}
  !endif
  ${If} ${Silent}
    Goto FarmDashUnInitDone
  ${EndIf}
  MessageBox MB_YESNOCANCEL|MB_ICONQUESTION \
    "Farm Dashboard stores data under your Windows user profile (not in Program Files).$\r$\n$\r$\nYes — Keep for reinstall:$\r$\n  • Settings (servers, FTP/LAN, theme, preferences)$\r$\n  • Offline farm snapshots (last merged view per server)$\r$\n  Removes caches, FTP/XML copies, and other temporary files.$\r$\n  Keeps ImageMagick if the installer added it.$\r$\n$\r$\nNo — Remove everything:$\r$\n  • All settings, snapshots, caches, and registry entries$\r$\n  • ImageMagick if Farm Dashboard installed it (not if you had it already)$\r$\n$\r$\nCancel — Do not uninstall" \
    IDYES FarmDashUnKeep \
    IDNO FarmDashUnWipe
  Quit
  FarmDashUnKeep:
    StrCpy $FarmDashWipeUserData "0"
    Goto FarmDashUnInitDone
  FarmDashUnWipe:
    StrCpy $FarmDashWipeUserData "1"
  FarmDashUnInitDone:
  !if "${APP_ID}" == "com.farmdashboard.rf"
    ${If} $FarmDashWipeUserData == "1"
      nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "$INSTDIR\resources\uninstall-dependencies.ps1" -Edition V5 -CheckOnly'
      Pop $R0
      ${If} $R0 == "740"
        ${If} ${Silent}
          SetErrorLevel 740
          Abort "Administrator permission is required for Full uninstall"
        ${EndIf}
        ; Keep current-user installation scope while requesting a normal UAC
        ; prompt. The explicit argument preserves Full removal after restart.
        ClearErrors
        ExecShell "runas" "$INSTDIR\${UNINSTALL_FILENAME}" "/currentuser --delete-app-data"
        ${If} ${Errors}
          MessageBox MB_OK|MB_ICONINFORMATION "Full uninstall needs administrator permission to remove Dashboard-owned ImageMagick. Permission was not granted; the Dashboard and its uninstaller have been kept." /SD IDOK
          SetErrorLevel 740
          Abort "Full uninstall permission was not granted"
        ${EndIf}
        Quit
      ${Else}
        !insertmacro FarmDashAssertCleanupSuccess "Full uninstall preparation"
      ${EndIf}
    ${EndIf}
  !endif
!macroend

; Before built-in file removal: failure must preserve the executable and uninstaller.
!macro customUnInstall
  ; electron-builder also handles --delete-app-data after this hook. Its default
  ; npm package name is shared with V4; never let that branch erase V4's profile.
  !if "${APP_ID}" == "com.farmdashboard.rf"
    !ifdef APP_PACKAGE_NAME
      !undef APP_PACKAGE_NAME
    !endif
    !define APP_PACKAGE_NAME "fs25-farm-dashboard-rf"
  !endif
  ; V5 already ran its exact-path check in un.checkAppRunning; a second /IM kill would reach same-name
  ; processes outside this installation.
  !if "${APP_ID}" == "com.farmdashboard.rf"
  !else
    DetailPrint "Stopping ${PRODUCT_NAME} if still running..."
    ClearErrors
    nsExec::ExecToLog `"$SYSDIR\taskkill.exe" /F /T /IM "${APP_EXECUTABLE_FILENAME}"`
    Pop $R0
    Sleep 1500
  !endif

  StrCpy $R6 "0"
  ${If} $FarmDashWipeUserData == "1"
    StrCpy $R6 "1"
  ${EndIf}
  ClearErrors
  ${GetParameters} $R9
  ${GetOptions} $R9 "--delete-app-data" $R8
  ${IfNot} ${Errors}
    StrCpy $R6 "1"
  ${EndIf}

  ${if} $installMode == "all"
    SetShellVarContext current
  ${endif}

  StrCpy $R4 "V4"
  StrCmp "${APP_ID}" "com.farmdashboard.rf" 0 FarmDashUnEdReady
  StrCpy $R4 "V5"
FarmDashUnEdReady:
  IfFileExists "$INSTDIR\resources\uninstall-user-data.ps1" FarmDash_UnCheckDependencies
  Goto FarmDash_UnHelpersMissing
  FarmDash_UnCheckDependencies:
    IfFileExists "$INSTDIR\resources\uninstall-dependencies.ps1" FarmDash_UnCheckCommon
    Goto FarmDash_UnHelpersMissing
  FarmDash_UnCheckCommon:
    IfFileExists "$INSTDIR\resources\imagemagick-common.ps1" FarmDash_UnHelpersReady
  FarmDash_UnHelpersMissing:
    StrCpy $R0 "missing-helper"
    !insertmacro FarmDashAssertCleanupSuccess "Cleanup helper validation"
  FarmDash_UnHelpersReady:
  !if "${APP_ID}" == "com.farmdashboard.rf"
    ; Keep the registration-only helper outside INSTDIR for the final section.
    InitPluginsDir
    ClearErrors
    CopyFiles /SILENT "$INSTDIR\resources\windows-install-state.ps1" "$PLUGINSDIR\farmdash-windows-install-state.ps1"
    ${If} ${Errors}
      StrCpy $R0 "missing-registration-helper"
      !insertmacro FarmDashAssertCleanupSuccess "Windows registration helper preparation"
    ${EndIf}
  !endif

  ${If} $R6 == "1"
    DetailPrint "Removing this edition's Farm Dashboard user data..."
    IfFileExists "$INSTDIR\resources\uninstall-user-data.ps1" FarmDash_UnFullScript FarmDash_UnFullLegacy
    FarmDash_UnFullScript:
      nsExec::ExecToLog `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\resources\uninstall-user-data.ps1" -Mode Full -Edition $R4`
      Pop $R0
      !insertmacro FarmDashAssertCleanupSuccess "User profile cleanup"
      Goto FarmDash_UnFullDone
    FarmDash_UnFullLegacy:
      StrCmp $R4 "V5" FarmDash_UnFullLegacyRf
      StrCmp $R4 "Rf" FarmDash_UnFullLegacyRf
      Goto FarmDash_UnFullLegacyClassic
    FarmDash_UnFullLegacyRf:
      RMDir /r "$APPDATA\fs25-farm-dashboard-rf"
      RMDir /r "$LOCALAPPDATA\fs25-farm-dashboard-rf"
      RMDir /r "$LOCALAPPDATA\fs25-farm-dashboard-rf-updater"
      RMDir /r "$LOCALAPPDATA\com.farmdashboard.rf-updater"
      Goto FarmDash_UnFullLegacyTemp
    FarmDash_UnFullLegacyClassic:
      RMDir /r "$APPDATA\fs25-farm-dashboard"
      RMDir /r "$APPDATA\FS25 Farm Dashboard"
      RMDir /r "$APPDATA\com.farmdashboard.app"
      RMDir /r "$LOCALAPPDATA\fs25-farm-dashboard"
      RMDir /r "$LOCALAPPDATA\fs25-farm-dashboard-updater"
      RMDir /r "$LOCALAPPDATA\com.farmdashboard.app-updater"
    FarmDash_UnFullLegacyTemp:
      Delete "$TEMP\farmdash-install-locale.txt"
    FarmDash_UnFullDone:
    DetailPrint "Removing optional dependencies installed by setup (ImageMagick)..."
    IfFileExists "$INSTDIR\resources\uninstall-dependencies.ps1" FarmDash_UnDeps FarmDash_UnDepsDone
    FarmDash_UnDeps:
      nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\resources\uninstall-dependencies.ps1" -Edition $R4'
      Pop $R0
      !insertmacro FarmDashAssertCleanupSuccess "ImageMagick removal"
    FarmDash_UnDepsDone:
    StrCmp $R4 "V5" FarmDash_UnRegRf
    StrCmp $R4 "Rf" FarmDash_UnRegRf
    Goto FarmDash_UnRegClassic
    FarmDash_UnRegRf:
      DeleteRegKey HKCU "Software\fs25-farm-dashboard-rf"
      Goto FarmDash_UnRegDone
    FarmDash_UnRegClassic:
      ReadRegStr $R0 HKCU "Software\fs25-farm-dashboard" "ImageMagickInstalledByFarmDash"
      StrCmp $R0 "1" FarmDash_UnRegKeepShared
      DeleteRegKey HKCU "Software\fs25-farm-dashboard"
      Goto FarmDash_UnRegDone
    FarmDash_UnRegKeepShared:
      DeleteRegValue HKCU "Software\fs25-farm-dashboard" "installer_locale"
    FarmDash_UnRegDone:
  ${Else}
    DetailPrint "Keeping settings and offline snapshots; removing caches and temporary data..."
    IfFileExists "$INSTDIR\resources\uninstall-user-data.ps1" FarmDash_UnKeepScript FarmDash_UnKeepLegacy
    FarmDash_UnKeepScript:
      nsExec::ExecToLog `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\resources\uninstall-user-data.ps1" -Mode Keep -Edition $R4`
      Pop $R0
      !insertmacro FarmDashAssertCleanupSuccess "User profile cleanup"
      Goto FarmDash_UnKeepDone
    FarmDash_UnKeepLegacy:
      StrCmp $R4 "V5" FarmDash_UnKeepLegacyRf
      StrCmp $R4 "Rf" FarmDash_UnKeepLegacyRf
      Goto FarmDash_UnKeepLegacyClassic
    FarmDash_UnKeepLegacyRf:
      RMDir /r "$LOCALAPPDATA\fs25-farm-dashboard-rf"
      RMDir /r "$LOCALAPPDATA\fs25-farm-dashboard-rf-updater"
      Goto FarmDash_UnKeepDone
    FarmDash_UnKeepLegacyClassic:
      RMDir /r "$LOCALAPPDATA\fs25-farm-dashboard"
      RMDir /r "$LOCALAPPDATA\fs25-farm-dashboard-updater"
    FarmDash_UnKeepDone:
  ${EndIf}

  ${if} $installMode == "all"
    SetShellVarContext all
  ${endif}
!macroend

; electron-builder inserts this section after its normal file removal section.
!macro customUnInstallSection
  !if "${APP_ID}" == "com.farmdashboard.rf"
    Section "un.-FarmDash Windows registration"
      nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "$PLUGINSDIR\farmdash-windows-install-state.ps1" -Action Remove -InstallDirectory "$INSTDIR" -Scope "$installMode"'
      Pop $R0
      ${If} $R0 != "0"
        MessageBox MB_OK|MB_ICONEXCLAMATION "V5 Windows registration cleanup did not finish (exit $R0).$\r$\n$\r$\nSee FarmDashWindowsRegistration.log in your temporary folder. Uninstall has not been verified complete." /SD IDOK
        SetErrorLevel 1
        Abort "Windows registration cleanup failed"
      ${EndIf}
    SectionEnd
  !endif
!macroend
