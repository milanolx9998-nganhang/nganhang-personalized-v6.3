@echo off
REM ============================================================
REM NGAN HANG V4.3 - SMOKE TEST ONE CLICK
REM ============================================================
REM Chay file nay de test xem server co hoat dong khong
REM Se tu dong: start server nen, test 5 API chinh, bao cao
REM ============================================================

chcp 65001 >nul
title Ngan Hang V4.3 - Smoke Test
cd /d "%~dp0\.."

echo.
echo ============================================
echo   KIEM TRA HE THONG NGAN HANG V4.3
echo ============================================
echo.

REM --- Kiem tra PostgreSQL ---
echo [1/7] PostgreSQL...
sc query postgresql-x64-16 | findstr "RUNNING" >nul 2>&1
if %errorlevel%==0 (
    echo   [OK] Dang chay
) else (
    echo   [!] Chua chay, dang khoi dong...
    net start postgresql-x64-16 >nul 2>&1
    if errorlevel 1 (
        echo   [X] Khong khoi dong duoc. Can quyen Admin.
        pause
        exit /b 1
    )
    echo   [OK] Da khoi dong
)

REM --- Don port ---
echo [2/7] Don port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo   [OK] San sang

REM --- Kiem tra .env ---
echo [3/7] Cau hinh...
if not exist "backend\.env" (
    echo   [X] Chua co backend\.env. Chay install-windows.ps1 truoc.
    pause
    exit /b 1
)
echo   [OK] OK

REM --- Start server nen ---
echo [4/7] Khoi dong server nen...
cd backend
start /B "" /MIN node src\server.js > ..\test-run.log 2>&1
cd ..
timeout /t 4 /nobreak >nul

REM --- Test health ---
echo [5/7] Test /api/health...
curl -s http://127.0.0.1:3000/api/health > test-health.txt 2>&1
findstr "ok" test-health.txt >nul 2>&1
if %errorlevel%==0 (
    echo   [OK] Health check pass
) else (
    echo   [X] Server khong phan hoi
    type test-run.log
    goto cleanup
)

REM --- Test login ---
echo [6/7] Test dang nhap admin...
curl -s -X POST http://127.0.0.1:3000/api/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"username\":\"admin\",\"password\":\"admin123\"}" > test-login.txt 2>&1
findstr "token" test-login.txt >nul 2>&1
if %errorlevel%==0 (
    echo   [OK] Login admin thanh cong
) else (
    echo   [X] Login that bai
    type test-login.txt
    goto cleanup
)

REM --- Test taxonomy ---
echo [7/7] Test lay danh sach mon hoc...
for /f "tokens=*" %%a in ('type test-login.txt ^| node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).token))"') do set TOKEN=%%a
curl -s http://127.0.0.1:3000/api/taxonomy/subjects -H "Authorization: Bearer %TOKEN%" > test-subjects.txt 2>&1
findstr "KHTN" test-subjects.txt >nul 2>&1
if %errorlevel%==0 (
    echo   [OK] Lay mon hoc thanh cong
) else (
    echo   [X] Khong lay duoc mon hoc
    type test-subjects.txt
    goto cleanup
)

REM --- Clean up test files ---
echo.
echo ============================================
echo   TAT CA KIEM TRA DAT. HE THONG HOAT DONG!
echo ============================================
echo.
echo De bat server su dung:  scripts\start-server.bat
echo De dung server:         scripts\stop-server.bat
echo.

:cleanup
REM Kill server test
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
del test-health.txt test-login.txt test-subjects.txt test-run.log 2>nul

pause
