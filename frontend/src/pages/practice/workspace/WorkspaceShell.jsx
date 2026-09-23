import {NavLink} from 'react-router-dom';
import {useAuth, hasAnyCapability} from '../../../hooks/useAuth.js';

// Kho / Nhập / Duyệt là ba việc của cùng một công việc, nên dùng chung một vỏ và một ngôn ngữ.
// V6.6.6: một thanh đầu trang gọn — tên khu vực, ba thẻ dạng nút, thao tác của trang nằm bên phải.
const TABS = [
  {to: '/practice/banks', label: 'Kho câu hỏi', capabilities: ['content.read']},
  {to: '/practice/import', label: 'Nhập câu', capabilities: ['content.write']},
  {to: '/practice/reviews', label: 'Duyệt câu', capabilities: ['content.write', 'content.review', 'content.approve']},
];

export default function WorkspaceShell({title, description, actions, children}) {
  const {user} = useAuth();
  const tabs = TABS.filter(t => hasAnyCapability(user, t.capabilities));
  return (
    <section className="practice-page workspace">
      <header className="workspace-header">
        <h1>Ngân hàng câu hỏi</h1>
        <nav className="workspace-tabs" aria-label="Khu vực ngân hàng câu hỏi">
          {tabs.map(tab => (
            <NavLink key={tab.to} to={tab.to} end
                     className={({isActive}) => 'workspace-tab' + (isActive ? ' active' : '')}>
              {tab.label}
            </NavLink>
          ))}
        </nav>
        {actions && <div className="workspace-actions">{actions}</div>}
      </header>
      {(title || description) && (
        <div className="workspace-subhead">
          {title && <h2>{title}</h2>}
          {description && <p>{description}</p>}
        </div>
      )}
      {children}
    </section>
  );
}
