# Truy cập Home từ xa

Ưu tiên VPN riêng + SSH theo khóa, không port-forward PostgreSQL, Storage gateway, Studio hoặc Node ra Internet. Không cấu hình router khi chưa có thông tin mạng và quyền quản trị cụ thể.

- Tạo tài khoản Ubuntu quản trị riêng, khóa SSH riêng và lưu recovery ngoài host; kiểm tra đăng nhập phiên thứ hai trước khi khóa password login.
- Giới hạn SSH theo VPN/địa chỉ quản trị. Chỉ Caddy HTTPS phục vụ app cho mạng được cho phép.
- Studio chỉ mở tạm bằng tunnel loopback khi thật sự cần; đóng tunnel sau thao tác. Không bỏ lớp auth mặc định của upstream.
- Không gửi private key, service-role key, DATABASE_URL hoặc JWT_SECRET qua chat/log. Dùng secret store/file chmod 600.
- Home mất mạng hoặc tắt máy không ảnh hưởng School. Không failover, replication hoặc đồng bộ ngầm.

Chưa xác minh VPN, firewall, SSH, certificate hay cổng trên Home. Người triển khai phải ghi ngày, host, bằng chứng kiểm tra cổng/TLS và người thực hiện vào biên bản UAT; không ghi credential.
