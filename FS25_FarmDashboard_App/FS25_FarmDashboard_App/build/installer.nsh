; Farm Dashboard NSIS — language first (customWelcomePage), then ImageMagick after install (customInstall).
; Persists installer_locale in HKCU + %TEMP% so "Install for all users" (UAC restart) keeps the same language pre-selected.
; Writes %APPDATA%\fs25-farm-dashboard\install-locale.txt (2-letter code) for the app to read on first launch.
; Requires nsis.warningsAsErrors = false in package.json for some NSIS builds.

; Replaces electron-builder's default app-running check. Default taskkill omits /T, so GPU/helper child
; processes can keep app.asar locked — NSIS then shows "cannot be closed" even after a reboot.
!macro customCheckAppRunning
  DetailPrint "Stopping ${PRODUCT_NAME} if running (/F /T so child processes release file locks)..."
  ClearErrors
  nsExec::ExecToLog `cmd.exe /c taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}" 2>nul`
  Pop $R0
  Sleep 1500
  ClearErrors
!macroend

!include nsDialogs.nsh

Var FarmDashLangCombo
Var FarmDashSavedLang
; 0 = keep config.json + serverLiveCache only; 1 = remove all user-level data (set in customUnInit).
Var FarmDashWipeUserData

!macro customWelcomePage
  Page custom FarmDashLangPageShow FarmDashLangPageLeave
!macroend

; Pre-select dropdown after combo is filled ($FarmDashSavedLang = 2-letter code or empty)
Function FarmDashPrefillLangCombo
  StrCmp $FarmDashSavedLang "" FarmDashPrefillDone
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
  ${NSD_CB_SelectString} $FarmDashLangCombo "en - English"
FarmDashPrefillDone:
FunctionEnd

Function FarmDashLangPageShow
  StrCpy $FarmDashSavedLang ""
  ReadRegStr $0 HKCU "Software\fs25-farm-dashboard" "installer_locale"
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
  WriteRegStr HKCU "Software\fs25-farm-dashboard" "installer_locale" "$R9"
  ClearErrors
  FileOpen $1 "$TEMP\farmdash-install-locale.txt" w
  IfErrors FarmDashSkipTemp
  FileWrite $1 $R9
  FileClose $1
FarmDashSkipTemp:
  CreateDirectory "$APPDATA\fs25-farm-dashboard"
  ClearErrors
  FileOpen $1 "$APPDATA\fs25-farm-dashboard\install-locale.txt" w
  IfErrors skipLocaleWrite
  FileWrite $1 $R9
  FileClose $1
  skipLocaleWrite:
FunctionEnd

!macro customInstall
  IfFileExists "$INSTDIR\resources\install-imagemagick.ps1" FarmDash_RunMagick FarmDash_MagickDone
  FarmDash_RunMagick:
    DetailPrint "Installing ImageMagick (mod folder DDS to PNG thumbnails)..."
    ; -WindowStyle Hidden avoids a visible blue PowerShell console during install
    ExecWait 'powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "$INSTDIR\resources\install-imagemagick.ps1" -NoPackageManagers'
  FarmDash_MagickDone:
!macroend

; Runs at start of uninstall (before files are removed). Ask whether to keep profile data.
!macro customUnInit
  StrCpy $FarmDashWipeUserData "0"
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
!macroend

; After built-in uninstall steps: optionally remove user profile data, or keep only settings + offline snapshots.
!macro customUnInstall
  DetailPrint "Stopping ${PRODUCT_NAME} if still running..."
  ClearErrors
  nsExec::ExecToLog `cmd.exe /c taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}" 2>nul`
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

  ${If} $R6 == "1"
    DetailPrint "Removing all Farm Dashboard user data..."
    IfFileExists "$INSTDIR\resources\uninstall-user-data.ps1" FarmDash_UnFullScript FarmDash_UnFullLegacy
    FarmDash_UnFullScript:
      ExecWait 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\resources\uninstall-user-data.ps1" -Mode Full' $R0
      Goto FarmDash_UnFullDone
    FarmDash_UnFullLegacy:
      RMDir /r "$APPDATA\fs25-farm-dashboard"
      !ifdef APP_FILENAME
        RMDir /r "$APPDATA\${APP_FILENAME}"
      !endif
      !ifdef APP_PACKAGE_NAME
        RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
      !endif
      !ifdef APP_PRODUCT_FILENAME
        RMDir /r "$APPDATA\${APP_PRODUCT_FILENAME}"
      !endif
      RMDir /r "$LOCALAPPDATA\fs25-farm-dashboard"
      RMDir /r "$LOCALAPPDATA\fs25-farm-dashboard-updater"
      !ifdef APP_PACKAGE_NAME
        RMDir /r "$LOCALAPPDATA\${APP_PACKAGE_NAME}"
        RMDir /r "$LOCALAPPDATA\${APP_PACKAGE_NAME}-updater"
      !endif
      !ifdef APP_FILENAME
        RMDir /r "$LOCALAPPDATA\${APP_FILENAME}"
      !endif
      !ifdef APP_PRODUCT_FILENAME
        RMDir /r "$LOCALAPPDATA\${APP_PRODUCT_FILENAME}"
      !endif
      Delete "$TEMP\farmdash-install-locale.txt"
    FarmDash_UnFullDone:
    DetailPrint "Removing optional dependencies installed by setup (ImageMagick)..."
    IfFileExists "$INSTDIR\resources\uninstall-dependencies.ps1" FarmDash_UnDeps FarmDash_UnDepsDone
    FarmDash_UnDeps:
      ExecWait 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\resources\uninstall-dependencies.ps1"' $R0
    FarmDash_UnDepsDone:
    DeleteRegKey HKCU "Software\fs25-farm-dashboard"
  ${Else}
    DetailPrint "Keeping settings and offline snapshots; removing caches and temporary data..."
    IfFileExists "$INSTDIR\resources\uninstall-user-data.ps1" FarmDash_UnKeepScript FarmDash_UnKeepLegacy
    FarmDash_UnKeepScript:
      ExecWait 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\resources\uninstall-user-data.ps1" -Mode Keep' $R0
      Goto FarmDash_UnKeepDone
    FarmDash_UnKeepLegacy:
      RMDir /r "$LOCALAPPDATA\fs25-farm-dashboard"
      RMDir /r "$LOCALAPPDATA\fs25-farm-dashboard-updater"
      !ifdef APP_PACKAGE_NAME
        RMDir /r "$LOCALAPPDATA\${APP_PACKAGE_NAME}"
        RMDir /r "$LOCALAPPDATA\${APP_PACKAGE_NAME}-updater"
      !endif
    FarmDash_UnKeepDone:
  ${EndIf}

  ${if} $installMode == "all"
    SetShellVarContext all
  ${endif}
!macroend
