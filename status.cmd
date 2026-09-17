@echo off
rem  ASCII only - cmd reads this file as CP949. See start-moai.cmd.
chcp 65001 >nul
cd /d "%~dp0"
set "PATH=C:\nvm4w\nodejs;%PATH%"

rem ============================================================
rem  Is it healthy right now? Double-click, no terminal needed.
rem
rem  Prints four things: are the processes up / do they actually
rem  answer / can it still generate / did today's collection run.
rem  If something is wrong it tells you what to do next.
rem ============================================================

call pnpm status

echo.
pause
