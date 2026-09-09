@echo off
setlocal
cd /d "%~dp0"
title SANI GROUP LOTO - SERVER
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo =============================================
  echo  SANI GROUP LOTO
  echo  Node.js is not installed.
  echo  Install Node.js 18+ and run START.bat again.
  echo =============================================
  pause
  exit /b 1
)
start "SANI GROUP LOTO SERVER" /min cmd /c "node server.js"
timeout /t 1 /nobreak >nul
start "" "http://localhost:3000/"
exit /b 0
