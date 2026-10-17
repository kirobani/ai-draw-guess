@echo off
cd /d "%~dp0"
where npm >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22.9+ from https://nodejs.org first.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo Open http://127.0.0.1:3211 after the server starts. Press Ctrl+C to stop.
call npm start
pause
