@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-huashu.ps1" %*
exit /b %ERRORLEVEL%
