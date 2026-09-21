# 🚀 Hướng dẫn nhanh — Ngân Hàng V4.3

Anh có **2 cách dùng**. Chọn 1 cách phù hợp:

---

## 🌟 CÁCH 1: TREO LUÔN (KHUYẾN CÁO CHO MÁY CHỦ TRƯỜNG)

Server tự chạy ngầm, tự bật lại khi máy khởi động, **không cần bật tay**.

### Cài 1 lần duy nhất

1. **Cài hệ thống** (nếu chưa):
```powershell
cd "C:\Users\Duong Hieu\Desktop\ngan hang cau hoi\nganhang-v4"
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\install-windows.ps1
```
Script hỏi 2 mật khẩu — gõ mật khẩu postgres anh đã đặt khi cài PostgreSQL, và mật khẩu mới cho user `nganhang` (nhớ ghi chú lại).

2. **Cài service treo luôn**: Chuột phải file này → **Run as administrator**:
```
scripts\cai-service.bat
```

3. Xong! Từ giờ:
   - **Không cần làm gì** mỗi khi bật máy
   - Server luôn chạy sẵn ở `http://localhost:3000`
   - Crash thì Windows tự khởi động lại

### Khi nào dùng?

- Máy chủ của trường — luôn bật, ai vào cũng được
- Không muốn thấy cửa sổ đen, không muốn nhớ bật tay

### Tạm tắt / khởi động lại

Mở `services.msc` (gõ vào Start Menu) → tìm **NganHangV4** → chuột phải → **Stop** / **Start** / **Restart**.

### Muốn gỡ service

Chuột phải → Run as admin: `scripts\go-service.bat`

---

## 🖱️ CÁCH 2: BẬT TAY KHI CẦN

Phù hợp máy cá nhân thỉnh thoảng mới cần.

### Cài 1 lần

1. Cài hệ thống (như Cách 1 bước 1)
2. Double-click: `scripts\tao-shortcut-desktop.bat`
3. Desktop xuất hiện 3 icon:
   - 🚀 **Bật Ngân Hàng V4**
   - 🛑 **Tắt Ngân Hàng V4**
   - 🔍 **Kiểm Tra Ngân Hàng V4**

### Dùng hàng ngày

- Double-click 🚀 → chờ 5 giây → mở Chrome gõ `http://localhost:3000`
- Đóng cửa sổ đen hoặc double-click 🛑 để tắt

---

## SO SÁNH 2 CÁCH

| | Cách 1 (Service) | Cách 2 (Bật tay) |
|---|---|---|
| Tự chạy khi bật máy | ✓ | ✗ |
| Chạy ngầm, không có cửa sổ | ✓ | ✗ |
| Tự khôi phục khi crash | ✓ | ✗ |
| Cần quyền Admin để cài | ✓ | ✗ |
| Phù hợp | Máy chủ trường 24/7 | Máy cá nhân |

Anh có thể dùng cả hai: cài service để treo, thỉnh thoảng test bằng icon Desktop.

---

## KHI CÓ SỰ CỐ

### Server không phản hồi

1. Mở `http://localhost:3000` trên Chrome — nếu không vào được:
2. Chạy `scripts\test-server.bat` — script tự chẩn đoán
3. Nếu đang dùng service: `services.msc` → tìm **NganHangV4** → **Restart**

### Lỗi `Cannot find module './util.inspect'` khi bật server

Đây là lỗi do `node_modules` cài từ bản cũ (có workspace hoisting). Fix bằng 1 click:

**Double-click `scripts\fix-node-modules.bat`** — script tự xóa node_modules cũ và cài lại sạch.

Hoặc làm tay trong PowerShell:
```powershell
cd "C:\Users\Duong Hieu\Desktop\ngan hang cau hoi\nganhang-v4"
Remove-Item -Recurse -Force node_modules, backend\node_modules -ErrorAction SilentlyContinue
Remove-Item -Force package-lock.json, backend\package-lock.json -ErrorAction SilentlyContinue
cd backend
npm install
```

### Lỗi `relation "matrix_templates" does not exist` / Dashboard trống rỗng

Database chưa có bảng hoặc chưa có dữ liệu. Fix bằng 1 click:

**Double-click `scripts\init-database.bat`** — script tự tạo 13 bảng + seed 14 môn + 51 bài KHTN 9 + 9 tài khoản mẫu.

Hoặc làm tay:
```powershell
cd backend
node src\db\migrate.js      # Tạo 13 bảng
node src\db\seed.js         # Nạp 14 môn, 3 phân môn KHTN, 9 users
node src\db\seed-khtn9.js   # Nạp 51 bài KHTN 9
```

### Máy khác trong WiFi trường không vào được

1. Kiểm tra IP máy chủ: mở Command Prompt, gõ `ipconfig` → tìm `IPv4 Address` (ví dụ `192.168.1.5`)
2. Máy khác gõ `http://192.168.1.5:3000`
3. Nếu vẫn không được: kiểm tra Windows Firewall mở port 3000

### Quên mật khẩu admin

Mở PowerShell trong thư mục `backend`, chạy:
```powershell
node -e "import('bcryptjs').then(async b => { const h = await b.default.hash('admin123', 10); const { pool } = await import('./src/db/pool.js'); await pool.query('UPDATE users SET password_hash=\$1 WHERE username=\$2', [h, 'admin']); console.log('OK, mật khẩu mới: admin123'); await pool.end(); })"
```

---

## TÀI KHOẢN MẪU

| Username | Password | Vai trò |
|----------|----------|---------|
| `admin` | `admin123` | Quản trị |
| `bgh` | `admin123` | BGH |
| `to_khtn` | `teacher123` | Tổ trưởng KHTN |
| `to_toan` | `teacher123` | Tổ trưởng Toán |
| `gv_toan_01` | `teacher123` | Giáo viên Toán |
| `gv_ly_01` | `teacher123` | GV Vật lí |

**Đổi mật khẩu admin ngay sau lần đăng nhập đầu tiên!**

---

## CÁC FILE TRONG `scripts\`

| File | Tác dụng | Quyền cần |
|------|----------|-----------|
| `install-windows.ps1` | Cài lần đầu: tạo DB, cài deps, build | Admin |
| **`cai-service.bat`** | **Cài server tự chạy nền (cách 1)** | **Admin** |
| `go-service.bat` | Gỡ service | Admin |
| `tao-shortcut-desktop.bat` | Tạo 3 icon Desktop (cách 2) | User |
| `start-server.bat` | Bật server tay | User |
| `stop-server.bat` | Tắt server tay | User |
| `test-server.bat` | Kiểm tra hệ thống | User |

Xem thêm:
- `docs/SETUP.md` — hướng dẫn cài đặt chi tiết
- `docs/USER-GUIDE.md` — quy trình nghiệp vụ dùng ngân hàng
- `docs/API.md` — API reference cho developer
- `CHANGELOG.md` — lịch sử thay đổi
