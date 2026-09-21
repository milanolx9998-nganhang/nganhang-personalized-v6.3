$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $projectRoot 'backend'
$artifactRoot = Join-Path $projectRoot 'artifacts'
if (Get-NetTCPConnection -LocalPort 3003 -State Listen -ErrorAction SilentlyContinue) {
    throw 'Cổng 3003 đang được dùng. Không dừng tiến trình khác; hãy kiểm tra ứng dụng đang chạy.'
}
New-Item -ItemType Directory -Path $artifactRoot -Force | Out-Null
$nodePath = (Get-Command node).Source
$appProcess = Start-Process -FilePath $nodePath -ArgumentList 'src/server.js' -WorkingDirectory $backendRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $artifactRoot 'local-server.log') -RedirectStandardError (Join-Path $artifactRoot 'local-server-error.log') -PassThru
$healthy = $false
for ($attemptIndex=0; $attemptIndex -lt 45; $attemptIndex++) {
    if ($appProcess.HasExited) { break }
    try {
        $healthResult = Invoke-RestMethod -Uri 'http://127.0.0.1:3003/api/health' -TimeoutSec 1
        if ($healthResult.status -eq 'ok') { $healthy=$true; break }
    } catch {}
    Start-Sleep -Milliseconds 500
}
if (-not $healthy) {
    if (-not $appProcess.HasExited) { Stop-Process -Id $appProcess.Id }
    throw 'Chưa khởi động được; xem artifacts/local-server-error.log.'
}
$verifiedProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$($appProcess.Id)"
@{started_at=$verifiedProcess.CreationDate.ToUniversalTime().ToString('o'); pid=$appProcess.Id; url='http://127.0.0.1:3003'; project=$projectRoot; health=$healthResult} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $artifactRoot 'local-runtime.json') -Encoding utf8
Write-Output "Đã chạy bản hiện tại tại http://127.0.0.1:3003 (PID $($appProcess.Id)). HTTP chỉ dùng kiểm tra local; triển khai LAN dùng HTTPS qua Caddy."
