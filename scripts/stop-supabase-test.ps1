$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$record=Get-Content -LiteralPath (Join-Path $projectRoot 'artifacts/supabase-test-runtime.json') -Raw | ConvertFrom-Json
if($record.project -ne $projectRoot){throw 'Runtime không thuộc dự án này'}
$appProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$($record.pid)"
if(!$appProcess){Write-Output 'Runtime thử nghiệm đã dừng';exit 0}
if(!$record.started_at -or $appProcess.CreationDate.ToUniversalTime().ToString('o') -ne $record.started_at -or $appProcess.CommandLine -notlike '*src/server.js*'){throw 'Không xác minh được PID; không dừng'}
Stop-Process -Id $record.pid
Write-Output 'Đã dừng app Supabase test. Không dừng/xóa DB, volumes hay bản School.'
