@echo off
REM ============================================================
REM TAO SHORTCUT RA DESKTOP
REM ============================================================
REM Chay file nay 1 lan de tao 3 shortcut tren Desktop:
REM   - Ngan Hang V4 - Bat server
REM   - Ngan Hang V4 - Tat server
REM   - Ngan Hang V4 - Test
REM ============================================================

chcp 65001 >nul
cd /d "%~dp0"

set "PROJECT=%~dp0.."
set "DESKTOP=%USERPROFILE%\Desktop"

echo.
echo ============================================
echo   TAO SHORTCUT RA DESKTOP
echo ============================================
echo.

REM Tao shortcut bang PowerShell
powershell -NoProfile -Command "$w = New-Object -ComObject WScript.Shell; $s = $w.CreateShortcut('%DESKTOP%\Bat Ngan Hang V4.lnk'); $s.TargetPath = '%~dp0start-server.bat'; $s.WorkingDirectory = '%~dp0'; $s.IconLocation = 'shell32.dll,137'; $s.Description = 'Khoi dong Ngan Hang V4.3'; $s.Save()"
echo [OK] Da tao: Bat Ngan Hang V4

powershell -NoProfile -Command "$w = New-Object -ComObject WScript.Shell; $s = $w.CreateShortcut('%DESKTOP%\Tat Ngan Hang V4.lnk'); $s.TargetPath = '%~dp0stop-server.bat'; $s.WorkingDirectory = '%~dp0'; $s.IconLocation = 'shell32.dll,131'; $s.Description = 'Dung Ngan Hang V4.3'; $s.Save()"
echo [OK] Da tao: Tat Ngan Hang V4

powershell -NoProfile -Command "$w = New-Object -ComObject WScript.Shell; $s = $w.CreateShortcut('%DESKTOP%\Kiem Tra Ngan Hang V4.lnk'); $s.TargetPath = '%~dp0test-server.bat'; $s.WorkingDirectory = '%~dp0'; $s.IconLocation = 'shell32.dll,21'; $s.Description = 'Kiem tra Ngan Hang V4.3 hoat dong'; $s.Save()"
echo [OK] Da tao: Kiem Tra Ngan Hang V4

echo.
echo ============================================
echo   HOAN TAT!
echo ============================================
echo.
echo Kiem tra Desktop se thay 3 shortcut:
echo   - Bat Ngan Hang V4
echo   - Tat Ngan Hang V4
echo   - Kiem Tra Ngan Hang V4
echo.
echo Double-click "Bat Ngan Hang V4" de dung.
echo.
pause
