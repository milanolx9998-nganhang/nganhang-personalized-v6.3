$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try { node scripts/backup.mjs; if($LASTEXITCODE -ne 0){throw 'Backup LOCAL thất bại'} }
finally { Pop-Location }
Write-Output 'Chỉ LOCAL đã chạy backup. HOME độc lập: dùng home-backup.sh trên Ubuntu; không tự copy dữ liệu cá nhân sang HOME.'
