@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-huashu.ps1" %*
exit /b %ERRORLEVEL%
