@echo off
rem  moai boot script - see README ("Turning the PC on" section) for the why.
rem
rem  Batch files are read with the console codepage, so Korean comments here
rem  get parsed as commands and spew errors on every boot. ASCII only.
rem
rem  To disable: delete
rem    %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\moai.cmd

rem  node lives under nvm4w and is not always on a fresh PATH
set "PATH=C:\nvm4w\nodejs;%PATH%"

cd /d "%~dp0.."

rem  clear dev-mode leftovers first - one holding port 4000 blocks the API
node "%~dp0cleanup-ghosts.mjs" --kill >> "%~dp0..\logs\boot.log" 2>&1

rem  restore the list pm2 remembered (pm2 save)
call pm2 resurrect >> "%~dp0..\logs\boot.log" 2>&1

rem  Safety net. resurrect replays a saved dump - if that dump is missing,
rem  stale, or was never written, it silently starts nothing and the site is
rem  just down after a reboot, with no error anywhere. Starting from the
rem  ecosystem file covers that: it launches whatever is not up yet and
rem  leaves already-online processes alone, so running both is safe.
call pm2 start ecosystem.config.js >> "%~dp0..\logs\boot.log" 2>&1
call pm2 save >> "%~dp0..\logs\boot.log" 2>&1
