@echo off
rem  ASCII only - cmd reads this file as CP949. See start-moai.cmd.
chcp 65001 >nul
cd /d "%~dp0"
set "PATH=C:\nvm4w\nodejs;%PATH%"

rem ============================================================
rem  Restart the web front end (3000) only.
rem  api, agent and the tunnel are left alone.
rem
rem  Same reasoning as restart-api.cmd - `pnpm run deploy` instead of a
rem  raw cmd window. Two reasons it matters more here:
rem
rem    - without a fresh `next build` the page you just edited does
rem      not change at all.
rem    - Next takes ~30s to answer. Open the site right after a bare
rem      restart and you get a 502. deploy waits for a real response,
rem      so when it says done, it is done.
rem  `pnpm run deploy`, not `pnpm deploy`. `deploy` is a pnpm BUILT-IN
rem  command and it shadows the package script - `pnpm deploy` dies with
rem  ERR_PNPM_NOTHING_TO_DEPLOY without ever reaching scripts/deploy.mjs.
rem ============================================================

echo.
echo   Rebuilding and restarting moai web. Next needs ~30s to boot.
echo.
call pnpm run deploy web

echo.
pause
