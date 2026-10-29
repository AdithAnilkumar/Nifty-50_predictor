@echo off
title Rollback to Savepoint v1
echo ===================================================================
echo   NIFTY-50 PREDICTOR - ROLLBACK TO SAVEPOINT V1
echo ===================================================================
echo This will restore all files back to the exact state of Savepoint v1.
set /p confirm="Are you sure you want to rollback? (y/n): "
if /i not "%confirm%"=="y" goto cancel

echo Restoring files from _backups\checkpoint_v1...
xcopy /E /Y /I "_backups\checkpoint_v1\*" "."
git checkout savepoint_v1 -- .
echo.
echo ===================================================================
echo [SUCCESS] Rollback complete! System restored to Savepoint v1.
echo ===================================================================
pause
exit /b

:cancel
echo Rollback cancelled.
pause

