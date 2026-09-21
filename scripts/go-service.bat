@echo off
REM ============================================================
REM NGAN HANG V4.3 - GO SERVICE
REM ============================================================
REM Go service NganHangV4 khoi he thong Windows
REM Sau khi go, server se khong con tu chay moi khi bat may
REM ============================================================

chcp 65001 >nul
title Go Service Ngan Hang V4.3
cd /d "%~dp0\.."

net session >nul 2>&1
if errorlevel 1 (
    echo [X] CAN QUYEN ADMINISTRATOR
    echo Chuot phai file nay -^> Run as administrator
    pause
    exit /b 1
)

echo.
echo ============================================
echo   GO SERVICE NGAN HANG V4.3
echo ============================================
echo.

choice /C YN /M "Ban co chac muon go service"
if errorlevel 2 exit /b 0

REM Stop service
echo [1/3] Dung service...
net stop NganHangV4 >nul 2>&1

REM Tao script uninstall
echo [2/3] Tao script go service...
cd backend
(
echo const { Service } = require^('node-windows'^);
echo const path = require^('path'^);
echo const svc = new Service^({
echo   name: 'NganHangV4',
echo   script: path.join^(process.cwd^(^), 'src', 'server.js'^)
echo }^);
echo svc.on^('uninstall', ^(^) =^> console.log^('[OK] Da go service'^)^);
echo svc.uninstall^(^);
) > _uninstall-service.js

echo [3/3] Dang go service...
node _uninstall-service.js
del _install-service.js 2>nul
del _uninstall-service.js 2>nul
cd ..

echo.
echo ============================================
echo   Da go service xong
echo ============================================
echo.
echo Neu muon chay lai server:
echo   - Cai lai service: scripts\cai-service.bat
echo   - Hoac chay tay:    scripts\start-server.bat
echo.
pause
