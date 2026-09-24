// Kịch bản k6 cho STAGING (PERF V6.6.7): học sinh đăng nhập → trang chủ → bắt đầu bài → trả lời → nộp → dashboard.
// KHÔNG chạy vào production. Cần sẵn tài khoản học sinh thử <USER_PREFIX>1..<USERS> cùng một mật khẩu và chủ đề
// có đủ câu đã duyệt (xem docs/PERF_V6_6_7_REDIS_SUPAVISOR.md §6).
//
//   k6 run -e BASE_URL=https://staging.example -e USER_PREFIX=load_student_ -e PASSWORD=... \
//          -e SUBJECT_ID=1 -e TOPIC_ID=10 -e GRADE=9 -e SCENARIO=load100 backend/test/load/k6-quiz.js
//
// SCENARIO: load50, load100, load200 (mỗi mức chạy riêng), ramp (exploratory 50→100→200),
// burst_start (120 start trong ≤5 s), burst_submit (120 submit trong ≤10 s), soak (100 người 30 phút).
// Burst dùng setup() để chuẩn bị token/attempt trước; không tính login/think-time vào cửa sổ burst.
import http from 'k6/http';
import {check, sleep} from 'k6';
import {Counter, Rate} from 'k6/metrics';

const BASE = __ENV.BASE_URL;
const PREFIX = __ENV.USER_PREFIX || 'load_student_';
const PASSWORD = __ENV.PASSWORD;
const ITEMS = Number(__ENV.ITEMS || 10);
const THINK = Number(__ENV.THINK_S || 8);
const SCENARIO = __ENV.SCENARIO || 'ramp';
const BURST_USERS = Number(__ENV.BURST_USERS || 120);
const configuredUsers = Number(__ENV.USERS || 0);
const defaultUsers = {load50: 50, load100: 100, load200: 200, soak: 100, ramp: 200}[SCENARIO] || 200;
const FLOW_USERS = configuredUsers > 0 ? configuredUsers : defaultUsers;
const config = {subject_id: Number(__ENV.SUBJECT_ID), topic_ids: [Number(__ENV.TOPIC_ID)], grade: Number(__ENV.GRADE || 9),
  count: ITEMS, percent: [100, 0, 0, 0], types: ['multiple_choice'], mode: 'practice'};

// These counters are deliberately scenario-specific. A count threshold proves that a
// bounded per-vu-iterations scenario completed every requested request, not just that
// the successful subset had a good rate.
const burstStartCompleted = new Counter('burst_start_completed');
const burstStartSuccess = new Rate('burst_start_success');
const burstSubmitCompleted = new Counter('burst_submit_completed');
const burstSubmitSuccess = new Rate('burst_submit_success');

// Release gate: 2 phút tăng tải + 5 phút ổn định + 1 phút giảm tải (8 phút mỗi mức). Cửa sổ ổn định đủ dài
// để quan sát DB pool / cache / Redis dưới tải đều, và tách được kết quả 100 với 200 người.
const flowStages = target => [
  {duration: '2m', target},
  {duration: '5m', target},
  {duration: '1m', target: 0},
];

const scenarios = {
  load50: {executor: 'ramping-vus', exec: 'default', startVUs: 0, stages: flowStages(50)},
  load100: {executor: 'ramping-vus', exec: 'default', startVUs: 0, stages: flowStages(100)},
  load200: {executor: 'ramping-vus', exec: 'default', startVUs: 0, stages: flowStages(200)},
  // Kept as an exploratory comparison run. Its aggregate p95 must not be reported as
  // separate 100/200-user acceptance evidence; use load100/load200 for that.
  ramp: {executor: 'ramping-vus', exec: 'default', startVUs: 0, stages: [
    {duration: '2m', target: 50}, {duration: '5m', target: 50},
    {duration: '2m', target: 100}, {duration: '5m', target: 100},
    {duration: '2m', target: 200}, {duration: '5m', target: 200}, {duration: '1m', target: 0}]},
  // A bounded duration plus the completion counter makes failure to launch the full burst visible.
  burst_start: {executor: 'per-vu-iterations', exec: 'burstStart', vus: BURST_USERS, iterations: 1, maxDuration: '5s', gracefulStop: '0s'},
  burst_submit: {executor: 'per-vu-iterations', exec: 'burstSubmit', vus: BURST_USERS, iterations: 1, maxDuration: '10s', gracefulStop: '0s'},
  soak: {executor: 'constant-vus', exec: 'default', vus: 100, duration: '30m'},
};

const flowThresholds = {
  load50: {
    'http_req_duration{name:shared}': ['p(95)<300'],
    'http_req_duration{name:start}': ['p(95)<500'],
    'http_req_duration{name:attempt}': ['p(95)<500'],
    'http_req_duration{name:save}': ['p(95)<500'],
    'http_req_duration{name:submit}': ['p(95)<2500'],
  },
  load100: {
    'http_req_duration{name:shared}': ['p(95)<300'],
    'http_req_duration{name:start}': ['p(95)<500'],
    'http_req_duration{name:attempt}': ['p(95)<500'],
    'http_req_duration{name:save}': ['p(95)<500'],
    'http_req_duration{name:submit}': ['p(95)<2500'],
  },
  load200: {
    'http_req_duration{name:shared}': ['p(95)<500'],
    'http_req_duration{name:start}': ['p(95)<750'],
    'http_req_duration{name:attempt}': ['p(95)<750'],
    'http_req_duration{name:save}': ['p(95)<750'],
    'http_req_duration{name:submit}': ['p(95)<3000'],
  },
  soak: {
    'http_req_duration{name:shared}': ['p(95)<300'],
    'http_req_duration{name:start}': ['p(95)<500'],
    'http_req_duration{name:attempt}': ['p(95)<500'],
    'http_req_duration{name:save}': ['p(95)<500'],
    'http_req_duration{name:submit}': ['p(95)<2500'],
  },
  // Exploratory only: deliberately looser than the two release-gate scenarios.
  ramp: {
    'http_req_duration{name:shared}': ['p(95)<500'],
    'http_req_duration{name:start}': ['p(95)<750'],
    'http_req_duration{name:attempt}': ['p(95)<750'],
    'http_req_duration{name:save}': ['p(95)<750'],
    'http_req_duration{name:submit}': ['p(95)<3000'],
  },
};

if (!scenarios[SCENARIO]) throw new Error(`SCENARIO không hợp lệ: ${SCENARIO}`);

const thresholds = {
  http_req_failed: ['rate<0.01'],
  ...(flowThresholds[SCENARIO] || {}),
  ...(SCENARIO === 'burst_start' ? {
    'http_req_duration{name:burst_start}': ['p(95)<750'],
    'burst_start_success': ['rate==1'],
    'burst_start_completed': [`count==${BURST_USERS}`],
  } : {}),
  ...(SCENARIO === 'burst_submit' ? {
    'http_req_duration{name:burst_submit}': ['p(95)<3000'],
    'burst_submit_success': ['rate==1'],
    'burst_submit_completed': [`count==${BURST_USERS}`],
  } : {}),
};

export const options = {
  setupTimeout: '15m',
  scenarios: {quiz: scenarios[SCENARIO]},
  thresholds,
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
  if (SCENARIO === 'ramp' || SCENARIO.startsWith('load') || SCENARIO === 'soak') return null;
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
  burstStartCompleted.add(1);
  burstStartSuccess.add(response.status === 201);
  check(response, {'burst start 201': r => r.status === 201});
}

export function burstSubmit(data) {
  const response = http.post(`${BASE}/api/practice/attempts/${data.attempts[__VU - 1]}/submit`, '{}', auth(data.tokens[__VU - 1], 'burst_submit'));
  burstSubmitCompleted.add(1);
  burstSubmitSuccess.add(response.status === 200);
  check(response, {'burst submit 200': r => r.status === 200});
}

export default function () {
  const username = PREFIX + (((__VU - 1) % FLOW_USERS) + 1);
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
  if (!check(attempt, {'attempt 200': r => r.status === 200})) return;
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
