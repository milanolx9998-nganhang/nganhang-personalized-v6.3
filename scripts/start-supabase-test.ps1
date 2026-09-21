param([string]$ConfigPath)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
if(!$ConfigPath){$ConfigPath=Join-Path $projectRoot 'deploy/.env.supabase-lan'}
$ConfigPath=(Resolve-Path -LiteralPath $ConfigPath).Path
if(Get-NetTCPConnection -LocalPort 3004 -State Listen -ErrorAction SilentlyContinue){throw 'Cổng thử nghiệm 3004 đang được sử dụng'}
$backendRoot=Join-Path $projectRoot 'backend'
$artifactRoot=Join-Path $projectRoot 'artifacts'
New-Item -ItemType Directory -Path $artifactRoot -Force | Out-Null
$saved=@{}
foreach($key in @('DOTENV_CONFIG_PATH','PORT','HOST')){$saved[$key]=[Environment]::GetEnvironmentVariable($key,'Process')}
try{
 $env:DOTENV_CONFIG_PATH=$ConfigPath
 $env:PORT='3004'
 $env:HOST='127.0.0.1'
 Push-Location $backendRoot
 try {
  & node --input-type=module -e "import 'dotenv/config'; import {profile} from './src/config/profile.js'; if(!profile.test)process.exit(2)"
  if($LASTEXITCODE -ne 0){throw 'Cấu hình không phải profile Supabase thử nghiệm hợp lệ'}
 } finally {Pop-Location}
 $appProcess=Start-Process -FilePath (Get-Command node).Source -ArgumentList 'src/server.js' -WorkingDirectory $backendRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $artifactRoot 'supabase-test.log') -RedirectStandardError (Join-Path $artifactRoot 'supabase-test-error.log') -PassThru
} finally {foreach($key in $saved.Keys){[Environment]::SetEnvironmentVariable($key,$saved[$key],'Process')}}
$healthy=$false
for($attemptIndex=0;$attemptIndex -lt 60;$attemptIndex++){
 if($appProcess.HasExited){break}
 try{$health=Invoke-RestMethod 'http://127.0.0.1:3004/api/health' -TimeoutSec 2;if($health.status -eq 'ok' -and $health.test_environment){$healthy=$true;break}}catch{}
 Start-Sleep -Milliseconds 500
}
if(!$healthy){if(!$appProcess.HasExited){Stop-Process -Id $appProcess.Id};throw 'Supabase chưa healthy; xem log. Không tự khởi động/migration DB từ script này.'}
$verifiedProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$($appProcess.Id)"
@{pid=$appProcess.Id;started_at=$verifiedProcess.CreationDate.ToUniversalTime().ToString('o');project=$projectRoot;health=$health} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $artifactRoot 'supabase-test-runtime.json') -Encoding utf8
Write-Output 'App thử nghiệm ở loopback 3004. Production test dùng Caddy HTTPS; Supabase phải được provision riêng. Không dùng dữ liệu thật.'
