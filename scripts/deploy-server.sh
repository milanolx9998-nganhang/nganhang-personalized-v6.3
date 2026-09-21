#!/bin/bash
set -e

echo "🚀 [Deploy] Bắt đầu tự động triển khai mã nguồn mới..."
cd /home/hieu/nganhang-personalized-v6.3

# 1. Kéo mã nguồn mới nhất từ GitHub
echo "📥 [Deploy] Kéo mã nguồn mới nhất từ branch main..."
git fetch origin main
git reset --hard origin/main

# 2. Build Frontend
echo "🎨 [Deploy] Cài đặt dependencies & build Frontend..."
cd /home/hieu/nganhang-personalized-v6.3/frontend
npm install --prefer-offline --no-audit
npm run build

# 3. Chạy migration Database Supabase
echo "🗄️ [Deploy] Cài đặt dependencies Backend & cập nhật Database Supabase..."
cd /home/hieu/nganhang-personalized-v6.3/backend
npm install --prefer-offline --no-audit
npm run migrate

# 4. Khởi động lại ứng dụng
echo "🔄 [Deploy] Khởi động lại dịch vụ nganhang.service..."
systemctl --user restart nganhang.service

# 5. Kiểm tra sức khỏe dịch vụ
echo "🔍 [Deploy] Kiểm tra tình trạng hoạt động..."
sleep 2
curl -s -f http://127.0.0.1:3001/api/health > /dev/null

echo "🎉 [Deploy] Triển khai thành công rực rỡ! Dịch vụ đã cập nhật và hoạt động ổn định."
