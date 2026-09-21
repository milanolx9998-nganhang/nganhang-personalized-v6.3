@echo off
REM ============================================================
REM NGAN HANG V4.3 - RESTART SERVER + BUILD FRONTEND
REM ============================================================
REM Chay file nay sau khi sua code:
REM   1. Build lai frontend (Vite)
REM   2. Don port 3000
REM   3. Khoi dong lai backend
REM ============================================================

chcp 65001 >nul
title Ngan Hang V4.3 - Restart
cd /d "%~dp0\.."

echo.
echo ============================================
echo   NGAN HANG V4.3 - RESTART
echo ============================================
echo.

REM --- Buoc 1: Build frontend ---
echo [1/4] Build frontend...
cd frontend
call npx vite build >nul 2>&1
if %errorlevel%==0 (
    echo   [OK] Frontend build thanh cong
) else (
    echo   [!] Frontend build loi, thu npm install...
    call npm install >nul 2>&1
    call npx vite build >nul 2>&1
    if %errorlevel%==0 (
        echo   [OK] Frontend build thanh cong (sau install)
    ) else (
        echo   [X] KHONG BUILD DUOC FRONTEND
        echo       Kiem tra loi: cd frontend ^&^& npx vite build
        pause
        exit /b 1
    )
)
cd ..

REM --- Buoc 2: Kiem tra PostgreSQL ---
echo [2/4] Kiem tra PostgreSQL...
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
        pause
        exit /b 1
    )
)

REM --- Buoc 3: Don port 3000 ---
echo [3/4] Don port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    echo   [!] Port 3000 bi chiem boi PID %%a, dang ket thuc...
    taskkill /F /PID %%a >nul 2>&1
)
echo   [OK] Port 3000 san sang

REM --- Buoc 4: Khoi dong server ---
echo [4/4] Khoi dong server...
echo.
echo ============================================
echo   Server: http://localhost:3000
echo   LAN:    http://192.168.1.2:3000
echo   Nhan Ctrl+C de dung
echo ============================================
echo.

cd backend
node src/server.js

echo.
echo Server da dung. Nhan phim bat ky de thoat.
pause >nul
