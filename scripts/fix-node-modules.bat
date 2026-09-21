@echo off
REM ============================================================
REM NGAN HANG V4.3 - FIX LOI NODE_MODULES
REM ============================================================
REM Chay file nay neu gap loi "Cannot find module" khi bat server
REM ============================================================

chcp 65001 >nul
title Fix loi node_modules
cd /d "%~dp0\.."

echo.
echo ============================================
echo   FIX LOI NODE_MODULES HOIST
echo ============================================
echo.
echo Script se xoa node_modules hoisted cu va cai lai backend.
echo Thoi gian: khoang 1-2 phut.
echo.
pause

echo.
echo [1/4] Dung server neu dang chay...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo   [OK]

echo [2/4] Xoa node_modules va package-lock cu...
if exist "node_modules" (
    rmdir /s /q "node_modules" 2>nul
    echo   [OK] Da xoa node_modules root
)
if exist "package-lock.json" del /q "package-lock.json" 2>nul
if exist "backend\node_modules" (
    rmdir /s /q "backend\node_modules" 2>nul
    echo   [OK] Da xoa backend\node_modules
)
if exist "backend\package-lock.json" del /q "backend\package-lock.json" 2>nul

echo [3/4] Cai lai package cho backend...
cd backend
call npm install --no-audit --no-fund
if %errorlevel% neq 0 (
    echo.
    echo [X] LOI khi cai package!
    echo Kiem tra:
    echo   - Node.js da cai chua: node --version
    echo   - Ket noi internet co on dinh khong
    cd ..
    pause
    exit /b 1
)
cd ..
echo   [OK] Backend ready

echo [4/4] Test khoi dong server...
cd backend
start /B "" node src\server.js
cd ..
timeout /t 4 /nobreak >nul

curl -s http://127.0.0.1:3000/api/health > _check.txt 2>&1
findstr "ok" _check.txt >nul 2>&1
if %errorlevel%==0 (
    echo   [OK] Server hoat dong!
    echo.
    echo ============================================
    echo   FIX THANH CONG
    echo ============================================
    echo.
    echo Server dang chay tai: http://localhost:3000
    echo Gio co the dong cua so nay va dung binh thuong.
) else (
    echo   [X] Server van khong phan hoi, kiem tra:
    echo       - PostgreSQL co chay khong (services.msc)
    echo       - File backend\.env co dung cau hinh khong
)
del _check.txt 2>nul

echo.
pause
