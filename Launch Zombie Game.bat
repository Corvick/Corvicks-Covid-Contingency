@echo off
setlocal
title Zombie Simulator Launcher
cd /d "%~dp0"

REM Node is installed per-machine; make sure it's on PATH even if the
REM shell was opened before the install. Two layouts are in use: a normal
REM installer build in Program Files, and a portable unzip under LOCALAPPDATA
REM on machines without admin rights, where the installer won't run.
if exist "C:\Program Files\nodejs\node.exe" set "PATH=C:\Program Files\nodejs;%PATH%"
for /d %%D in ("%LOCALAPPDATA%\node-portable\node-v*-win-x64") do (
  if exist "%%D\node.exe" set "PATH=%%D;%PATH%"
)

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js was not found.
  echo   With admin rights: install the LTS build from https://nodejs.org.
  echo   Without: unzip the Windows x64 portable build from
  echo   https://nodejs.org/dist to %LOCALAPPDATA%\node-portable
  echo   so that node.exe sits in a node-vXX.X.X-win-x64 folder inside it.
  echo.
  pause
  exit /b 1
)

if not exist "server\node_modules" (
  echo Installing server dependencies, this only happens once...
  pushd server
  call npm install
  popd
)

if not exist "client\node_modules" (
  echo Installing client dependencies, this only happens once...
  pushd client
  call npm install
  popd
)

echo Starting game server...
start "Zombie Game - Server" cmd /k "cd /d "%~dp0server" && npm run dev"

echo Starting game client...
start "Zombie Game - Client" cmd /k "cd /d "%~dp0client" && npm run dev"

echo Waiting for the client to come up...
timeout /t 6 /nobreak >nul

start "" "http://localhost:5173"

echo.
echo   Game launched. Two console windows are now running:
echo     "Zombie Game - Server"  and  "Zombie Game - Client"
echo   Close both of those windows to stop the game.
echo.
timeout /t 5 /nobreak >nul
endlocal
