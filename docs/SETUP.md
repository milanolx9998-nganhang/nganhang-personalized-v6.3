# Hướng dẫn cài đặt chi tiết

## Yêu cầu trước khi cài

### 1. Node.js 18+

Tải LTS từ https://nodejs.org → cài mặc định → mở PowerShell kiểm tra:
```powershell
node --version   # Phải ≥ v18
npm --version
```

### 2. PostgreSQL 16

Tải installer từ https://www.postgresql.org/download/windows/ → cài mặc định.

**Quan trọng**: Khi cài ghi nhớ:
- Mật khẩu user `postgres` (user mặc định)
- Port `5432` (giữ mặc định)
- Locale `C` hoặc `en_US` (không dùng `vi_VN` — một số bản có bug)

Sau khi cài xong, mở `services.msc` xem có service tên `postgresql-x64-16` đang `Running` là OK.

### 3. Giải nén source

Giải nén `nganhang-v4.3.zip` vào đâu đó ổn định, VD:
```
C:\Users\Duong Hieu\Desktop\ngan hang cau hoi\nganhang-v4\
```

## Cài đặt tự động (khuyến cáo)

Mở PowerShell **as Administrator**:

```powershell
cd "C:\Users\Duong Hieu\Desktop\ngan hang cau hoi\nganhang-v4"
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\install-windows.ps1
```

Script sẽ hỏi:
1. **Mật khẩu `postgres`** — mật khẩu anh đã đặt khi cài PostgreSQL
2. **Mật khẩu cho user `nganhang`** — user mới mà script tạo để app dùng. Nhớ ghi chú lại.

Script tự làm:
- ✓ Kiểm tra Node.js + PostgreSQL
- ✓ Tạo user `nganhang` trên PostgreSQL
- ✓ Tạo database `nganhang_v4`
- ✓ Tạo file `backend\.env` với JWT secret random
- ✓ `npm install` cho backend + frontend
- ✓ `npm run build` cho frontend (tạo `frontend/dist/`)
- ✓ Chạy migration (tạo 13 bảng)
- ✓ Seed dữ liệu mẫu: 14 môn, 3 phân môn KHTN, 9 users, 51 bài KHTN 9
- ✓ Mở firewall port 3000

## Cài đặt thủ công

Nếu script auto không chạy được:

### Bước 1 — Tạo database bằng pgAdmin

Mở pgAdmin → chuột phải "Login/Group Roles" → **Create → Login/Group Role**:
- Name: `nganhang`
- Password: (mật khẩu anh tự chọn)
- Privileges: Can login + Create databases → OK

Chuột phải "Databases" → **Create → Database**:
- Database: `nganhang_v4`
- Owner: `nganhang` → OK

### Bước 2 — Tạo file `.env`

Tạo file `backend\.env` với nội dung:
```env
PORT=3000
HOST=0.0.0.0
NODE_ENV=production
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=nganhang_v4
DB_USER=nganhang
DB_PASSWORD=<mat_khau_nganhang>
JWT_SECRET=<random_32_ky_tu>
JWT_EXPIRES_IN=7d
UPLOAD_DIR=./uploads
MAX_UPLOAD_SIZE=10485760
CORS_ORIGIN=*
```

Tạo JWT secret bằng PowerShell:
```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { [byte](Get-Random -Max 256) }))
```

### Bước 3 — Cài deps + build

```powershell
cd nganhang-v4
cd backend
npm install
cd ..\frontend
npm install
npm run build
cd ..
```

### Bước 4 — Migrate + seed

```powershell
cd backend
node src\db\migrate.js
node src\db\seed.js
node src\db\seed-khtn9.js
cd ..
```

### Bước 5 — Test

```powershell
cd backend
node src\server.js
```

Mở `http://localhost:3000` — nếu thấy màn hình đăng nhập là OK. Tắt bằng Ctrl+C.

## Chạy app

Sau khi cài xong, chọn 1 trong 2 cách:

### Cách A: Service 24/7 (khuyến cáo máy chủ trường)

Chuột phải `scripts\cai-service.bat` → **Run as administrator**.

Sau đó server tự chạy mỗi khi máy khởi động. Không cần thao tác gì nữa.

Muốn tạm dừng/khôi phục: `services.msc` → tìm **NganHangV4** → Stop/Start.

### Cách B: Bật tay (máy cá nhân)

Double-click `scripts\tao-shortcut-desktop.bat` → có 3 icon trên Desktop:
- 🚀 Bật Ngân Hàng V4
- 🛑 Tắt Ngân Hàng V4
- 🔍 Kiểm Tra Ngân Hàng V4

## Tài khoản mẫu

| Username | Password | Vai trò |
|----------|----------|---------|
| `admin` | `admin123` | Quản trị hệ thống |
| `bgh` | `admin123` | BGH |
| `to_khtn` | `teacher123` | Tổ trưởng KHTN |
| `to_toan` | `teacher123` | Tổ trưởng Toán |
| `nhom_khtn9` | `teacher123` | Nhóm trưởng KHTN 9 |
| `gv_ly_01` | `teacher123` | Giáo viên Vật lí |
| `gv_hoa_01` | `teacher123` | Giáo viên Hóa |
| `gv_sinh_01` | `teacher123` | Giáo viên Sinh |
| `gv_toan_01` | `teacher123` | Giáo viên Toán |

**Bắt buộc đổi mật khẩu admin ngay sau lần đăng nhập đầu tiên!**

## Kết nối từ máy khác trong LAN

Máy chủ: mở Command Prompt, gõ `ipconfig`, tìm `IPv4 Address` (ví dụ `192.168.1.5`).

Máy khác (cùng WiFi): gõ vào trình duyệt:
```
http://192.168.1.5:3000
```

Nếu không vào được:
1. Kiểm tra firewall port 3000 đã mở chưa (install script tự mở, nếu không thì `netsh advfirewall firewall add rule name="Nganhang V4" dir=in action=allow protocol=TCP localport=3000`)
2. Kiểm tra `backend\.env` có `HOST=0.0.0.0` (không phải `127.0.0.1`)
3. Kiểm tra 2 máy có cùng subnet không (cùng WiFi trường)

## Backup dữ liệu

Sao lưu database định kỳ (mỗi tuần) bằng pg_dump:

```powershell
cd "C:\Program Files\PostgreSQL\16\bin"
$env:PGPASSWORD = "<mat_khau_nganhang>"
.\pg_dump.exe -U nganhang nganhang_v4 > "D:\Backup\nganhang_$(Get-Date -Format yyyyMMdd).sql"
```

Khôi phục từ file backup:
```powershell
.\psql.exe -U nganhang -d nganhang_v4 < "D:\Backup\nganhang_20260418.sql"
```

## Gỡ bỏ hệ thống

1. Dừng service: chuột phải `scripts\go-service.bat` → Run as admin
2. Xóa database: pgAdmin → chuột phải `nganhang_v4` → Delete
3. Xóa user: pgAdmin → chuột phải `nganhang` → Delete
4. Xóa thư mục source
