import {useEffect, useState} from 'react';
import {api} from '../../api/client.js';

// V6.6.5.2 §65–66 — cho quản trị thấy trước vì sao câu nhập sẽ "chưa gắn Bài" hay không đọc được mã,
// thay vì để giáo viên phát hiện lúc nhập. Chỉ đọc.
const BRANCH = {L: 'Vật lí', H: 'Hóa học', S: 'Sinh học'};

export default function MasterDataHealth() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/api/curriculum/health').then(setData).catch(e => setError(e.message)); }, []);
  if (error) return <p className="staff-error" role="alert">{error}</p>;
  if (!data) return <p role="status">Đang kiểm dữ liệu nền…</p>;
  if (!data.items.length) return <p>Chưa có chuẩn chương trình nào trong phạm vi được xem.</p>;
  return (
    <section aria-label="Sức khỏe dữ liệu nền">
      <p className="staff-note">Tính trên đúng bản chương trình mà hệ thống đang dùng để đọc mã câu (bản PUBLISHED mới nhất, hoặc dữ liệu cũ chưa gắn phiên bản).</p>
      {data.items.map(item => (
        <article className="staff-card" key={item.subject_id + ':' + item.grade}>
          <h3>{item.subject_name} · Khối {item.grade} · {item.version ? `Bản ${item.version.code}` : 'Dữ liệu cũ (chưa gắn phiên bản)'}</h3>
          <table className="queue-table">
            <thead><tr><th scope="col">Phân môn</th><th scope="col">Outcome</th><th scope="col">YCCĐ</th><th scope="col">Đã gắn 1 Bài</th><th scope="col">Nhiều Bài</th><th scope="col">Chưa gắn Bài</th><th scope="col">Thiếu số thứ tự</th></tr></thead>
            <tbody>
              {item.branches.map(b => (
                <tr key={b.branch}>
                  <td data-label="Phân môn">{BRANCH[b.branch] || b.branch}</td>
                  <td data-label="Outcome">{b.outcomes}</td>
                  <td data-label="YCCĐ">{b.yccds}</td>
                  <td data-label="Đã gắn 1 Bài" className="tone-ok">{b.yccd_one_lesson}</td>
                  <td data-label="Nhiều Bài">{b.yccd_many_lessons}</td>
                  <td data-label="Chưa gắn Bài" className={b.yccd_unmapped ? 'tone-warn' : ''}>{b.yccd_unmapped}</td>
                  <td data-label="Thiếu số thứ tự" className={b.ordinal_missing ? 'tone-danger' : ''}>{b.ordinal_missing}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>Câu hỏi: {item.questions.total} · chưa gắn Bài {item.questions.without_lesson} · chưa gắn YCCĐ {item.questions.without_yccd}
            {item.questions.on_retired_yccd > 0 && <> · <span className="tone-danger">{item.questions.on_retired_yccd} gắn YCCĐ đã ngừng dùng</span></>}</p>
          {item.issues.length > 0 && <ul>{item.issues.map((issue, i) => <li key={i} className={issue.severity === 'warning' ? 'tone-warn' : ''}>{issue.message}</li>)}</ul>}
        </article>
      ))}
    </section>
  );
}
