@echo off
rem craigtrim/axiom#206: keep the caller's directory and release its terminal.
setlocal
set ELECTRON_NO_ATTACH_CONSOLE=1
start "" "%~dp0..\Axiom.exe" %*
