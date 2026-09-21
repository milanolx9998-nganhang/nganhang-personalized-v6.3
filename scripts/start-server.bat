@echo off
REM ============================================================
REM NGAN HANG V4.5 - ONE CLICK START
REM ============================================================
REM Chay file nay moi lan muon bat server.
REM Script se tu dong:
REM   1. Khoi dong PostgreSQL (neu chua chay)
REM   2. Don port 3000 (neu bi chiem)
REM   3. Khoi dong server
REM ============================================================

chcp 65001 >nul
title Ngan Hang V4.5 - Server
cd /d "%~dp0\.."

echo.
echo ============================================
echo   NGAN HANG V4.5 - KHOI DONG SERVER
echo ============================================
echo.

REM --- Buoc 1: Kiem tra va khoi dong PostgreSQL ---
echo [1/4] Kiem tra PostgreSQL...

sc query postgresql-x64-16 | findstr "RUNNING" >nul 2>&1
if %errorlevel%==0 (
    echo   [OK] PostgreSQL dang chay
) else (
    echo   [!] PostgreSQL chua chay, dang khoi dong...
    net start postgresql-x64-16 >nul 2>&1
    if %errorlevel%==0 (
        echo   [OK] Da khoi dong PostgreSQL
    ) else (
        echo   [X] KHONG KHOI DONG DUOC PostgreSQL
        echo       Hay chay voi quyen Administrator
        echo       Hoac kiem tra: services.msc
        pause
        exit /b 1
    )
)

REM --- Buoc 2: Don port 3000 ---
echo [2/4] Don port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    echo   [!] Port 3000 bi chiem boi PID %%a, dang ket thuc...
    taskkill /F /PID %%a >nul 2>&1
)
echo   [OK] Port 3000 san sang

REM --- Buoc 3: Kiem tra .env ---
echo [3/4] Kiem tra cau hinh...
if not exist "backend\.env" (
    echo   [X] Chua co file backend\.env
    echo       Chay truoc: scripts\install-windows.ps1
    pause
    exit /b 1
)
echo   [OK] File cau hinh OK

REM --- Buoc 4: Khoi dong server ---
echo [4/4] Khoi dong server Node.js...
echo.
echo ============================================
echo   Server se chay tai: http://localhost:3000
echo   Nhan Ctrl+C de dung server
echo ============================================
echo.

cd backend
node src/server.js

REM Neu server tat bat thuong
echo.
echo Server da dung. Nhan phim bat ky de thoat.
pause >nul
