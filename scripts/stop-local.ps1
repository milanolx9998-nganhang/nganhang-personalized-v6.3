$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$record=Get-Content -LiteralPath (Join-Path $projectRoot 'artifacts/local-runtime.json') -Raw | ConvertFrom-Json
if($record.project -ne $projectRoot){throw 'Runtime không thuộc dự án này'}
$appProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$($record.pid)"
if(!$appProcess){Write-Output 'Runtime đã dừng';exit 0}
if(!$record.started_at -or $appProcess.CreationDate.ToUniversalTime().ToString('o') -ne $record.started_at){throw 'PID không còn khớp thời điểm tạo; không dừng tiến trình'}
if($appProcess.CommandLine -notlike '*src/server.js*'){throw 'Không khớp tiến trình Node ứng dụng'}
Stop-Process -Id $record.pid
Write-Output 'Đã dừng runtime local đã xác minh; DB vẫn chạy.'
