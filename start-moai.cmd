@echo off
rem  ASCII only in this file - see the note at the bottom.
chcp 65001 >nul
cd /d "%~dp0"
set "PATH=C:\nvm4w\nodejs;%PATH%"

rem ============================================================
rem  Start everything.
rem
rem  This file used to open four cmd windows. It must not any more:
rem  pm2 owns these processes now, and a second copy fights the pm2
rem  copy for the same port until both die with EADDRINUSE. That
rem  crashloop actually happened - ecosystem.config.js has the story.
rem
rem  So this just hands off to pm2:
rem    1. clear dev-mode leftovers holding a port
rem    2. start per ecosystem.config.js
rem    3. remember the list, so a reboot brings the same set back
rem
rem  Step 2 RESTARTS whatever is already up (pm2 start on an existing
rem  name is a restart), so this is "start all" and "restart all" at
rem  once - the site blips. To touch one app only, use
rem  restart-api.cmd / restart-web.cmd instead.
rem
rem  Logs go to logs\, not to a window. Closing a window kills nothing.
rem ============================================================

where pnpm >nul 2>&1
if errorlevel 1 (
  echo.
  echo   ERROR: pnpm not found.
  echo   Check that C:\nvm4w\nodejs\pnpm.cmd exists.
  echo.
  pause
  exit /b 1
)

echo.
echo   Clearing leftover dev processes...
node "%~dp0scripts\cleanup-ghosts.mjs" --kill

echo.
echo   Starting moai...
echo.
call pm2 start ecosystem.config.js
call pm2 save >nul 2>&1

rem  --wait: check only once everything answers. Checking the instant
rem  after a restart reports failures that are not real (Nest needs a few
rem  seconds, Next about 30), and a status tool that cries wolf stops
rem  being read at all.
echo.
echo   Checking.
call pnpm status --wait

echo.
echo   ------------------------------------------------------------
echo     https://moai.drevv.co.kr
echo.
echo     pnpm status              is it healthy?
echo     pm2 logs --lines 50      what went wrong?
echo     pnpm run deploy          build + restart after a code change
echo   ------------------------------------------------------------
echo.
pause

rem ============================================================
rem  Why is this file English-only?
rem
rem  cmd.exe reads a batch file with the console codepage, and it
rem  buffers ahead - so `chcp 65001` on line 3 does NOT make the rest
rem  of THIS file UTF-8. Korean written here is read as CP949, turns
rem  into garbage, and the garbage gets run as a command:
rem
rem      '..' is not recognized as an internal or external command
rem
rem  (Verified: a single Korean `rem` line broke the `echo` after it.)
rem  scripts\boot.cmd carries the same warning.
rem
rem  The chcp line still earns its place - it is for the CHILD
rem  processes. node prints UTF-8, so without it every Korean line
rem  from `pnpm status` comes out as mojibake in this window.
rem
rem  Short version: Korean belongs in the node scripts, which already
rem  do all the talking. This file just points at them.
rem ============================================================
