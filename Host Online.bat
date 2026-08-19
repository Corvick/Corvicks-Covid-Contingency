@echo off
setlocal enabledelayedexpansion
title Zombie Simulator - Host Online
cd /d "%~dp0"

REM Hosting for friends over the internet.
REM
REM Unlike "Launch Zombie Game.bat", this does NOT run the Vite dev server.
REM It builds the client once and lets the game server serve it, so the whole
REM game is on ONE port -- one thing to forward, one thing to tunnel, and a URL
REM your friends can paste on its own with no ?server= stapled to it.

REM Node is installed per-machine; make sure it's on PATH even if the shell was
REM opened before the install. Two layouts are in use: a normal installer build
REM in Program Files, and a portable unzip under LOCALAPPDATA on machines
REM without admin rights, where the installer won't run.
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

set "PORT=8080"
if not "%~1"=="" set "PORT=%~1"

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

echo.
echo Building the client...
pushd client
call npm run build
if errorlevel 1 (
  popd
  echo.
  echo   The client build failed. Nothing has been started.
  echo.
  pause
  exit /b 1
)
popd

echo.
echo Starting the game server on port %PORT%...
start "Zombie Game - Server" cmd /k "cd /d "%~dp0server" && set PORT=%PORT% && npm run dev"

REM cloudflared gives an https URL with no router config and no account, and
REM works behind CGNAT where port forwarding simply cannot. It is a single
REM portable .exe, which is the only kind of install that works on the machine
REM without admin rights.
where cloudflared >nul 2>nul
if errorlevel 1 (
  echo.
  echo   ------------------------------------------------------------------
  echo   Playing on your LAN? You are done. Tell people to open:
  echo.
  for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
    for /f "tokens=* delims= " %%B in ("%%A") do echo         http://%%B:%PORT%
  )
  echo.
  echo   Playing over the INTERNET? You need one of these:
  echo.
  echo     EASIEST - a tunnel, no router access needed:
  echo       1. Download cloudflared.exe (Windows amd64) from
  echo          https://github.com/cloudflare/cloudflared/releases/latest
  echo       2. Put it in this folder, or anywhere on your PATH
  echo       3. Run this script again
  echo       It prints an https://....trycloudflare.com URL. That URL IS the
  echo       game. Send it to your friends along with the 4-letter lobby code.
  echo.
  echo     FASTEST - forward port %PORT% (TCP) to this PC in your router,
  echo       then send friends  http://YOUR-PUBLIC-IP:%PORT%
  echo       Lower latency than a tunnel. Will not work behind CGNAT.
  echo   ------------------------------------------------------------------
  echo.
) else (
  echo Opening a public tunnel with cloudflared...
  echo.
  echo   Watch the "Zombie Game - Tunnel" window for a line like
  echo     https://something-random-words.trycloudflare.com
  echo   That URL is the whole game. Send it to your friends, then create a
  echo   lobby and send them the 4-letter code as well.
  echo.
  start "Zombie Game - Tunnel" cmd /k "cloudflared tunnel --url http://localhost:%PORT%"
)

echo Waiting for the server to come up...
timeout /t 4 /nobreak >nul

REM Open the game on this PC's LAN address rather than localhost. The lobby
REM builds its COPY INVITE LINK button out of the address the page was served
REM from, so opening on localhost would produce a link meaning "your own PC" to
REM everybody it was sent to. The lobby refuses to hand out such a link at all,
REM which is correct and also unhelpful if it is the only address you ever open.
REM Playing through a tunnel? Open the https URL from the tunnel window instead,
REM and the invite link will carry that.
set "LANIP="
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
  for /f "tokens=* delims= " %%B in ("%%A") do if not defined LANIP set "LANIP=%%B"
)
if defined LANIP (
  start "" "http://!LANIP!:%PORT%"
) else (
  start "" "http://localhost:%PORT%"
)

echo.
echo   Close the server window (and the tunnel window, if open) to stop hosting.
echo.
pause
endlocal
