// Kịch bản k6 cho STAGING (PERF V6.6.7): học sinh đăng nhập → trang chủ → bắt đầu bài → trả lời → nộp → dashboard.
// KHÔNG chạy vào production. Cần sẵn tài khoản học sinh thử <USER_PREFIX>1..<USERS> cùng một mật khẩu và chủ đề
// có đủ câu đã duyệt (xem docs/PERF_V6_6_7_REDIS_SUPAVISOR.md §6).
//
//   k6 run -e BASE_URL=https://staging.example -e USER_PREFIX=load_student_ -e PASSWORD=... \
//          -e SUBJECT_ID=1 -e TOPIC_ID=10 -e GRADE=9 -e SCENARIO=ramp backend/test/load/k6-quiz.js
//
// SCENARIO: ramp (50 → 100 → 200), burst_start (120 bắt đầu trong 5 s), soak (100 người 30 phút).
import http from 'k6/http';
import {check, sleep} from 'k6';

const BASE = __ENV.BASE_URL;
const PREFIX = __ENV.USER_PREFIX || 'load_student_';
const PASSWORD = __ENV.PASSWORD;
const ITEMS = Number(__ENV.ITEMS || 10);
const THINK = Number(__ENV.THINK_S || 8);
const config = {subject_id: Number(__ENV.SUBJECT_ID), topic_ids: [Number(__ENV.TOPIC_ID)], grade: Number(__ENV.GRADE || 9),
  count: ITEMS, percent: [100, 0, 0, 0], types: ['multiple_choice'], mode: 'practice'};

const scenarios = {
  ramp: {executor: 'ramping-vus', startVUs: 0, stages: [
    {duration: '2m', target: 50}, {duration: '5m', target: 50},
    {duration: '2m', target: 100}, {duration: '5m', target: 100},
    {duration: '2m', target: 200}, {duration: '5m', target: 200}, {duration: '1m', target: 0}]},
  burst_start: {executor: 'per-vu-iterations', vus: 120, iterations: 1, maxDuration: '15m'},
  soak: {executor: 'constant-vus', vus: 100, duration: '30m'},
};
export const options = {
  scenarios: {quiz: scenarios[__ENV.SCENARIO || 'ramp']},
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:shared}': ['p(95)<300'],
    'http_req_duration{name:save}': ['p(95)<500'],
    'http_req_duration{name:attempt}': ['p(95)<500'],
    'http_req_duration{name:submit}': ['p(95)<2500'],
  },
};

const json = body => ({headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
const auth = (token, name) => ({headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'}, tags: {name}});

export default function () {
  const username = PREFIX + (((__VU - 1) % Number(__ENV.USERS || 200)) + 1);
  const login = http.post(`${BASE}/api/auth/login`, JSON.stringify({username, password: PASSWORD}), {...json({}), tags: {name: 'login'}});
  if (!check(login, {'login 200': r => r.status === 200})) return;
  const token = login.json('token');
  for (const path of ['/api/practice/dashboard', '/api/practice/assignments', '/api/practice/catalog'])
    http.get(BASE + path, auth(token, 'shared'));
  sleep(1 + Math.random() * 2);
  const start = http.post(`${BASE}/api/practice/attempts`, JSON.stringify(config), auth(token, 'start'));
  if (!check(start, {'start 201': r => r.status === 201})) return;
  const id = start.json('id');
  const attempt = http.get(`${BASE}/api/practice/attempts/${id}`, auth(token, 'attempt'));
  for (const item of attempt.json('items') || []) {
    sleep(THINK * (0.5 + Math.random()));
    const response = ['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)];
    http.put(`${BASE}/api/practice/attempts/${id}/items/${item.id}`, JSON.stringify({response, final: false}), auth(token, 'save'));
    http.put(`${BASE}/api/practice/attempts/${id}/items/${item.id}`, JSON.stringify({response, final: true}), auth(token, 'save'));
  }
  const submit = http.post(`${BASE}/api/practice/attempts/${id}/submit`, '{}', auth(token, 'submit'));
  check(submit, {'submit 200': r => r.status === 200});
  http.get(`${BASE}/api/practice/dashboard`, auth(token, 'shared'));
}
