import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import '@fontsource/lexend/300.css';
import '@fontsource/lexend/400.css';
import '@fontsource/lexend/500.css';
import '@fontsource/lexend/600.css';
import '@fontsource/lexend/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './styles/global.css';
import './styles/content-scope-v2.css';
// V6.6.6 — hệ giao diện chung toàn web. Phải nạp SAU CÙNG (sau cả CSS mà App.jsx kéo vào),
// nên đặt ở đây chứ không ở App.jsx: import của App được đánh giá trước global.css.
import './styles/theme.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
