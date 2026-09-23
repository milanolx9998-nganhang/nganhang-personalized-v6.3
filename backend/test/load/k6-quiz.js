// Kịch bản k6 cho STAGING (PERF V6.6.7): học sinh đăng nhập → trang chủ → bắt đầu bài → trả lời → nộp → dashboard.
// KHÔNG chạy vào production. Cần sẵn tài khoản học sinh thử <USER_PREFIX>1..<USERS> cùng một mật khẩu và chủ đề
// có đủ câu đã duyệt (xem docs/PERF_V6_6_7_REDIS_SUPAVISOR.md §6).
//
//   k6 run -e BASE_URL=https://staging.example -e USER_PREFIX=load_student_ -e PASSWORD=... \
//          -e SUBJECT_ID=1 -e TOPIC_ID=10 -e GRADE=9 -e SCENARIO=ramp backend/test/load/k6-quiz.js
//
// SCENARIO: ramp (50 → 100 → 200), burst_start (120 start trong ≤5 s),
// burst_submit (120 submit trong ≤10 s), soak (100 người 30 phút).
// Burst dùng setup() để chuẩn bị token/attempt trước; không tính login/think-time vào cửa sổ burst.
import http from 'k6/http';
import {check, sleep} from 'k6';

const BASE = __ENV.BASE_URL;
const PREFIX = __ENV.USER_PREFIX || 'load_student_';
const PASSWORD = __ENV.PASSWORD;
const ITEMS = Number(__ENV.ITEMS || 10);
const THINK = Number(__ENV.THINK_S || 8);
const SCENARIO = __ENV.SCENARIO || 'ramp';
const BURST_USERS = Number(__ENV.BURST_USERS || 120);
const config = {subject_id: Number(__ENV.SUBJECT_ID), topic_ids: [Number(__ENV.TOPIC_ID)], grade: Number(__ENV.GRADE || 9),
  count: ITEMS, percent: [100, 0, 0, 0], types: ['multiple_choice'], mode: 'practice'};

const scenarios = {
  ramp: {executor: 'ramping-vus', exec: 'default', startVUs: 0, stages: [
    {duration: '2m', target: 50}, {duration: '5m', target: 50},
    {duration: '2m', target: 100}, {duration: '5m', target: 100},
    {duration: '2m', target: 200}, {duration: '5m', target: 200}, {duration: '1m', target: 0}]},
  // A bounded duration makes failure to launch the full burst visible.
  burst_start: {executor: 'per-vu-iterations', exec: 'burstStart', vus: BURST_USERS, iterations: 1, maxDuration: '5s', gracefulStop: '0s'},
  burst_submit: {executor: 'per-vu-iterations', exec: 'burstSubmit', vus: BURST_USERS, iterations: 1, maxDuration: '10s', gracefulStop: '0s'},
  soak: {executor: 'constant-vus', exec: 'default', vus: 100, duration: '30m'},
};
export const options = {
  setupTimeout: '15m',
  scenarios: {quiz: scenarios[SCENARIO]},
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

function setupTokens() {
  if (__ENV.BURST_TOKENS_JSON) {
    const supplied = JSON.parse(__ENV.BURST_TOKENS_JSON);
    if (Array.isArray(supplied) && supplied.length >= BURST_USERS) return supplied.slice(0, BURST_USERS);
    throw new Error('BURST_TOKENS_JSON phải chứa ít nhất BURST_USERS token');
  }
  const requests = Array.from({length: BURST_USERS}, (_, i) => [
    'POST', `${BASE}/api/auth/login`, JSON.stringify({username: PREFIX + (i + 1), password: PASSWORD}),
    {...json({}), tags: {name: 'setup_login'}},
  ]);
  const responses = http.batch(requests);
  const tokens = responses.map((response, i) => {
    if (response.status !== 200) throw new Error(`Setup login thất bại cho user ${i + 1}: HTTP ${response.status}`);
    return response.json('token');
  });
  return tokens;
}

export function setup() {
  if (SCENARIO === 'ramp' || SCENARIO === 'soak') return null;
  const tokens = setupTokens();
  if (SCENARIO === 'burst_start') return {tokens};

  // Tạo sẵn một attempt/user ở setup; scenario submit chỉ đo finalize burst.
  const starts = http.batch(tokens.map(token => [
    'POST', `${BASE}/api/practice/attempts`, JSON.stringify(config), auth(token, 'setup_start'),
  ]));
  const attempts = starts.map((response, i) => {
    if (response.status !== 201) throw new Error(`Setup start thất bại cho user ${i + 1}: HTTP ${response.status}`);
    return response.json('id');
  });
  return {tokens, attempts};
}

export function burstStart(data) {
  const response = http.post(`${BASE}/api/practice/attempts`, JSON.stringify(config), auth(data.tokens[__VU - 1], 'burst_start'));
  check(response, {'burst start 201': r => r.status === 201});
}

export function burstSubmit(data) {
  const response = http.post(`${BASE}/api/practice/attempts/${data.attempts[__VU - 1]}/submit`, '{}', auth(data.tokens[__VU - 1], 'burst_submit'));
  check(response, {'burst submit 200': r => r.status === 200});
}

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
