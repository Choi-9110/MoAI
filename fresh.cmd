@echo off
rem  ASCII only - cmd reads this file as CP949. See start-moai.cmd.
chcp 65001 >nul
cd /d "%~dp0"
set "PATH=C:\nvm4w\nodejs;%PATH%"

rem ============================================================
rem  Wipe and rebuild everything - back to a just-booted state.
rem
rem  How this differs from restart-api.cmd / restart-web.cmd:
rem  those swap one app and leave the rest running. This one clears
rem  the whole pm2 list and starts over from ecosystem.config.js, so
rem  it also drops state you cannot otherwise get rid of - piled-up
rem  restart counts, and the stale config pm2 keeps holding from the
rem  first time it launched a process.
rem
rem  Order is the safety net: it builds BEFORE it tears anything
rem  down, so a broken build stops here and the live site never
rem  goes away. Costs 1-2 minutes of downtime when the build passes.
rem
rem  `pnpm run fresh`, not `pnpm fresh` - see start-moai.cmd for why
rem  the `run` matters with these script names.
rem ============================================================

echo.
echo   Rebuilding everything from scratch. 1-2 minutes.
echo.
call pnpm run fresh

echo.
pause
