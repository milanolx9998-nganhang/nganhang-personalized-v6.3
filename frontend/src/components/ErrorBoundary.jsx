import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('💥 React Error Boundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: '60vh', padding: 40, textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>😵</div>
          <h2 style={{ margin: '0 0 8px', color: '#ef4444' }}>Đã xảy ra lỗi</h2>
          <p style={{ color: '#6b7280', marginBottom: 16, maxWidth: 400 }}>
            Một thành phần giao diện gặp sự cố. Thử tải lại trang hoặc liên hệ quản trị viên.
          </p>
          <details style={{ fontSize: 12, color: '#9ca3af', maxWidth: 500, textAlign: 'left' }}>
            <summary style={{ cursor: 'pointer', marginBottom: 4 }}>Chi tiết lỗi</summary>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {this.state.error?.toString()}
            </pre>
          </details>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            style={{
              marginTop: 20, padding: '10px 24px', background: '#3b82f6', color: 'white',
              border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer',
            }}
          >
            🔄 Tải lại trang
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
