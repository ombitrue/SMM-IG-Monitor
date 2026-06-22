// stats.js — движок статистики
const { getHistory } = require('./db');

const DAY_MS = 86_400_000;
const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;

function rollupRowsByDay(rows) {
  const byDay = {};
  for (const r of rows) {
    const day = new Date(r.captured_at).toISOString().slice(0, 10);
    if (!byDay[day]) byDay[day] = { day, followers: [], er: [] };
    byDay[day].followers.push(r.followers);
    if (r.engagement_rate != null) byDay[day].er.push(r.engagement_rate);
  }
  return Object.values(byDay)
    .map(d => ({
      day:            d.day,
      followers_avg:  Math.round(avg(d.followers)),
      followers_last: d.followers[d.followers.length - 1],
      er_avg:         d.er.length ? +avg(d.er).toFixed(2) : null,
      samples:        d.followers.length,
    }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

function growthFromRows(rows) {
  if (rows.length < 2) return { delta: 0, pct: 0, samples: rows.length, insufficient: true };
  const first = rows[0].followers, last = rows[rows.length - 1].followers;
  return {
    delta:        last - first,
    pct:          first ? +(((last - first) / first) * 100).toFixed(2) : 0,
    samples:      rows.length,
    insufficient: rows.length < 3,
  };
}

const rollupByDay = (username, days = 30) =>
  rollupRowsByDay(getHistory(username, Date.now() - days * DAY_MS));

const growth = (username, days = 7) =>
  growthFromRows(getHistory(username, Date.now() - days * DAY_MS));

module.exports = { rollupByDay, growth, rollupRowsByDay, growthFromRows };
