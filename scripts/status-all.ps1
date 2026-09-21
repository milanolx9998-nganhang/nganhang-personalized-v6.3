$ErrorActionPreference='Stop'
foreach($port in @(3003,3004)) {
 try { Invoke-RestMethod "http://127.0.0.1:$port/api/health" -TimeoutSec 3 | ConvertTo-Json -Compress }
 catch { Write-Output "Cổng $port chưa có health hợp lệ." }
}
Write-Output 'Không suy ra trạng thái Ubuntu từ trạng thái máy Windows.'
