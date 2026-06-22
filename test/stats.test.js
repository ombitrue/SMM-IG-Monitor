// Юнит-тесты чистых функций stats.js — без БД, без сети, без сервера.
const test   = require('node:test');
const assert = require('node:assert/strict');
const { growthFromRows, rollupRowsByDay } = require('../stats');

test('growthFromRows: insufficient при менее 3 точек', () => {
  const rows = [
    { captured_at: 1000, followers: 100 },
    { captured_at: 2000, followers: 110 },
  ];
  const g = growthFromRows(rows);
  assert.equal(g.insufficient, true);
  assert.equal(g.delta, 10);
  assert.equal(g.pct, 10);
});

test('growthFromRows: sufficient при 3+ точках', () => {
  const rows = [
    { captured_at: 1000, followers: 100 },
    { captured_at: 2000, followers: 105 },
    { captured_at: 3000, followers: 110 },
  ];
  const g = growthFromRows(rows);
  assert.equal(g.insufficient, false);
  assert.equal(g.delta, 10);
});

test('rollupRowsByDay: группирует снэпшоты одного дня', () => {
  const day = new Date('2026-06-19T08:00:00Z').getTime();
  const rows = [
    { captured_at: day,           followers: 100, engagement_rate: 2 },
    { captured_at: day + 3600000, followers: 106, engagement_rate: 4 },
  ];
  const result = rollupRowsByDay(rows);
  assert.equal(result.length, 1);
  assert.equal(result[0].followers_avg, 103);
  assert.equal(result[0].followers_last, 106);
  assert.equal(result[0].er_avg, 3);
  assert.equal(result[0].samples, 2);
});

test('rollupRowsByDay: разные дни дают разные записи', () => {
  const d1 = new Date('2026-06-18T10:00:00Z').getTime();
  const d2 = new Date('2026-06-19T10:00:00Z').getTime();
  const rows = [
    { captured_at: d1, followers: 100, engagement_rate: null },
    { captured_at: d2, followers: 110, engagement_rate: null },
  ];
  const result = rollupRowsByDay(rows);
  assert.equal(result.length, 2);
  assert.equal(result[0].day, '2026-06-18');
  assert.equal(result[1].day, '2026-06-19');
});

test('growthFromRows: возвращает нули при пустом массиве', () => {
  const g = growthFromRows([]);
  assert.equal(g.delta, 0);
  assert.equal(g.insufficient, true);
  assert.equal(g.samples, 0);
});
