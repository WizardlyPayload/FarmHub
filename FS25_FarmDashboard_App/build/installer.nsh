; Farm Dashboard NSIS — language first (customWelcomePage), then ImageMagick after install (customInstall).
; Persists installer_locale in HKCU + %TEMP% so "Install for all users" (UAC restart) keeps the same language pre-selected.
; Writes %APPDATA%\fs25-farm-dashboard\install-locale.txt (2-letter code) for the app to read on first launch.
; Requires nsis.warningsAsErrors = false in package.json for some NSIS builds.

; Replaces electron-builder's default app-running check. Default taskkill omits /T, so GPU/helper child
; processes can keep app.asar locked — NSIS then shows "cannot be closed" even after a reboot.
!macro customCheckAppRunning
  DetailPrint "Stopping ${PRODUCT_NAME} if running (/F /T so child processes release file locks)..."
  ClearErrors
  nsExec::ExecToLog `"$SYSDIR\taskkill.exe" /F /T /IM "${APP_EXECUTABLE_FILENAME}"`
  Pop $R0
  Sleep 1500
  ClearErrors
!macroend

!include nsDialogs.nsh

Var FarmDashLangCombo
Var FarmDashSavedLang
; 0 = keep config.json + serverLiveCache only; 1 = remove all user-level data (set in customUnInit).
Var FarmDashWipeUserData

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
  StrCpy $R4 "V4"
  StrCmp "${APP_ID}" "com.farmdashboard.rf" 0 FarmDashUnInitEdReady
  StrCpy $R4 "V5"
  FarmDashUnInitEdReady:
    ; V4 and V5 both honor --delete-app-data so a UAC relaunch can finish Full
    ; uninstall after ImageMagick returns 740 (admin required).
    ClearErrors
    ${GetParameters} $R9
    ${GetOptions} $R9 "--delete-app-data" $R8
    ${IfNot} ${Errors}
      StrCpy $FarmDashWipeUserData "1"
      Goto FarmDashUnInitDone
    ${EndIf}
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
  ${If} $FarmDashWipeUserData == "1"
    nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "$INSTDIR\resources\uninstall-dependencies.ps1" -Edition $R4 -CheckOnly'
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
  DetailPrint "Stopping ${PRODUCT_NAME} if still running..."
  ClearErrors
  nsExec::ExecToLog `"$SYSDIR\taskkill.exe" /F /T /IM "${APP_EXECUTABLE_FILENAME}"`
  Pop $R0
  Sleep 1500

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
