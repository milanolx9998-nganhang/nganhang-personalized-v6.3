@echo off
REM ============================================================
REM NGAN HANG V4.3 - STOP SERVER
REM ============================================================
REM Chay file nay de dung tat ca node process va giai phong port
REM ============================================================

chcp 65001 >nul
title Ngan Hang V4.3 - Stop

echo.
echo ============================================
echo   DUNG NGAN HANG V4.3
echo ============================================
echo.

echo [1/2] Ket thuc tat ca Node.js processes tren port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    echo   [!] Ket thuc PID %%a
    taskkill /F /PID %%a >nul 2>&1
)

echo [2/2] Xoa moi Node.js rac (neu con)...
tasklist | findstr "node.exe" >nul 2>&1
if %errorlevel%==0 (
    echo   [!] Con Node.exe dang chay, hoi truoc khi kill
    choice /C YN /M "Ban co muon tat TAT CA node.exe khong"
    if errorlevel 2 goto skip
    taskkill /F /IM node.exe >nul 2>&1
    echo   [OK] Da tat tat ca node.exe
    goto done
)
:skip
echo   [OK] Khong con Node.js chay
:done

echo.
echo ============================================
echo   Da dung server
echo   PostgreSQL van chay (binh thuong)
echo ============================================
echo.
timeout /t 3 >nul
