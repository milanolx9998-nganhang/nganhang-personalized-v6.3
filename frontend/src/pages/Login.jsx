import { useState } from 'react';
import { useNavigate,useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';

export default function Login() {
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword,setShowPassword]=useState(false);
  const { login } = useAuth();
  const nav = useNavigate(),location=useLocation();

  const handle = async (e) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await login(username, password);
      nav(location.state?.from||'/');
    } catch (err) {
      setErr(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-bg">
      <form className="login-card" onSubmit={handle}>
        <h1>📚 Ngân hàng</h1>
        <p>Ngân hàng câu hỏi · Luyện tập và hồ sơ học tập</p>

        {err && <div className="error-box" role="alert">{err}</div>}

        <div className="form-group">
          <label className="label" htmlFor="login-user">Mã học sinh / Tên đăng nhập</label>
          <input id="login-user" autoComplete="username" value={username} onChange={e => setU(e.target.value)} placeholder="admin" autoFocus required />
        </div>
        <div className="form-group">
          <label className="label" htmlFor="login-password">Mật khẩu</label>
          <input id="login-password" autoComplete="current-password" type={showPassword?'text':'password'} value={password} onChange={e => setP(e.target.value)} required />
          <button className="btn" type="button" aria-controls="login-password" aria-pressed={showPassword} onClick={()=>setShowPassword(v=>!v)}>{showPassword?'Ẩn mật khẩu':'Hiện mật khẩu'}</button>
        </div>
        <button type="submit" className="btn primary" disabled={loading}>
          {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>

        <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
          Sử dụng tài khoản do nhà trường cấp. Không chia sẻ mật khẩu.
        </div>
      </form>
    </div>
  );
}
