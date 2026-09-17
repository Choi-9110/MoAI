@echo off
rem  ASCII only - cmd reads this file as CP949. See start-moai.cmd.
chcp 65001 >nul
cd /d "%~dp0"
set "PATH=C:\nvm4w\nodejs;%PATH%"

rem ============================================================
rem  Restart the API server (4000) only.
rem
rem  This file used to kill whatever held port 4000 and then run
rem  `pnpm dev:api` in a cmd window. Three things were wrong with it:
rem
rem    - the thing it killed was pm2's process. pm2 did not know, and
rem      brought it straight back, so the two fought over the port.
rem    - closing the window killed the server. Nothing brought it back.
rem    - it never built. pm2 runs dist\main.js; with no dist that is
rem      MODULE_NOT_FOUND on a restart loop (it reached 29 rounds).
rem
rem  `pnpm run deploy api` does it properly:
rem    build -> restart ONLY if the build passed -> wait for a real
rem    response before calling it done.
rem  A broken build therefore changes nothing and the live server
rem  keeps serving.
rem
rem  Use this after an .env change too - env vars only take effect
rem  when the process restarts.
rem  `pnpm run deploy`, not `pnpm deploy`. `deploy` is a pnpm BUILT-IN
rem  command and it shadows the package script - `pnpm deploy` dies with
rem  ERR_PNPM_NOTHING_TO_DEPLOY without ever reaching scripts/deploy.mjs.
rem ============================================================

echo.
echo   Rebuilding and restarting moai api. Takes 1-2 minutes.
echo.
call pnpm run deploy api

echo.
pause
