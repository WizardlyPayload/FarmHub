@echo off
set "SCRIPTDIR=%~dp0"
set "APP=%SCRIPTDIR%..\..\FS25_FarmDashboard_App\FS25_FarmDashboard_App"
cd /d "%APP%"
node "%SCRIPTDIR%export-fields-to-csv.mjs"
if errorlevel 1 exit /b 1
echo.
echo Open fields-from-savegame.csv in Excel (working directory: inner app folder).
pause
