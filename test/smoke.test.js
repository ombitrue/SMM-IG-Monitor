// Smoke-тесты против запущенного сервера.
// Запуск: MOCK_API=true node server.js &  →  node --test test/smoke.test.js
const test   = require('node:test');
const assert = require('node:assert/strict');
const BASE   = process.env.TEST_BASE_URL || 'http://localhost:5050';

test('GET / отвечает 200', async () => {
  const res = await fetch(`${BASE}/`);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.status, 'running');
});

test('GET /api/health возвращает корректную структуру', async () => {
  const res = await fetch(`${BASE}/api/health`);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.server, 'ok');
  assert.ok(typeof json.port === 'number');
  assert.ok(typeof json.mock_api === 'boolean');
});

test('GET /api/userinfo с MOCK_API возвращает fixture', async () => {
  const res = await fetch(`${BASE}/api/userinfo?username=nasa`, {
    headers: { 'x-rapidapi-key': 'test-key-mock' },
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  const d = json?.data?.community || json?.community || json?.data || json;
  assert.ok(d.follower_count > 0, 'follower_count должен быть > 0');
});

test('GET /api/userinfo: nasa и cristiano дают разные follower_count', async () => {
  const headers = { 'x-rapidapi-key': 'test-key-mock' };
  const r1 = await fetch(`${BASE}/api/userinfo?username=nasa`, { headers });
  const r2 = await fetch(`${BASE}/api/userinfo?username=cristiano`, { headers });
  const j1 = await r1.json();
  const j2 = await r2.json();
  const f1 = j1?.data?.community?.follower_count || j1?.follower_count;
  const f2 = j2?.data?.community?.follower_count || j2?.follower_count;
  assert.notEqual(f1, f2, 'Разные username должны давать разные follower_count');
});

test('GET /api/history возвращает корректную структуру', async () => {
  const res = await fetch(`${BASE}/api/history?username=nasa`);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.ok(Array.isArray(json.rollup));
  assert.ok(typeof json.growth === 'object');
  assert.ok(typeof json.has_sufficient_data === 'boolean');
});

test('GET /api/userinfo без username → 400', async () => {
  const res = await fetch(`${BASE}/api/userinfo`, {
    headers: { 'x-rapidapi-key': 'test' },
  });
  assert.equal(res.status, 400);
});

test('CORS: OPTIONS /api/userinfo возвращает 204 с нужными заголовками', async () => {
  const res = await fetch(`${BASE}/api/userinfo`, {
    method: 'OPTIONS',
    headers: {
      'Origin': 'http://127.0.0.1:5500',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'x-rapidapi-key',
    },
  });
  assert.equal(res.status, 204);
  assert.ok(res.headers.get('access-control-allow-origin'));
});
