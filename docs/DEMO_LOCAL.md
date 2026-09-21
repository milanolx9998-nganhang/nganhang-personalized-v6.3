# Chế độ demo local tạm thời

Học sinh demo bổ sung: `hs_demo` / `Demo12345`, lớp 9-DEMO. Vào **Bài được giao** để mở bài 10 câu KHTN 9. Tài khoản demo này không bắt đổi mật khẩu; tài khoản học sinh tạo mới qua quản trị vẫn bắt đổi. Xem `QUAN_LY_HOC_SINH.md`.

Theo yêu cầu ngày 11/09/2026: tài khoản `pilot_admin`, mật khẩu `admin`; không bắt đổi mật khẩu ở lần vào demo.

`backend/.env` bật `DEMO_DISABLE_LOGIN_LIMIT=true`. Chỉ bỏ giới hạn đăng nhập khi `NODE_ENV` không phải `production` và `HOST` là loopback. Giới hạn API/upload không thay đổi. Khởi động lại backend sẽ xóa bộ đếm khóa cũ.

Trước khi mở LAN/Internet hoặc triển khai production: đổi mật khẩu demo mạnh, bật lại yêu cầu đổi mật khẩu, đặt `DEMO_DISABLE_LOGIN_LIMIT=false` và khởi động lại. Không dùng mật khẩu demo cho môi trường thật. Tệp bootstrap đã cập nhật theo mật khẩu demo hiện hành.
