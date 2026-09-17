@echo off
rem  ASCII only - cmd reads this file as CP949. See start-moai.cmd.
chcp 65001 >nul
cd /d "%~dp0"
set "PATH=C:\nvm4w\nodejs;%PATH%"

rem ============================================================
rem  What came in, and did it work? Double-click, no terminal.
rem
rem  Shows the last 50 requests the API and the agent answered.
rem  Anything that failed is marked, and the count at the bottom
rem  says how many there were in total.
rem
rem  From a terminal there is more:
rem    pnpm run log            last 50
rem    pnpm run log --fail     only the ones that failed
rem    pnpm run log 200        last 200
rem    pnpm run log --all      no folding
rem
rem  Requests that repeat are folded into one line with a count, so a
rem  tab someone left open cannot bury the failure you need to see.
rem ============================================================

call pnpm run log

echo.
pause
