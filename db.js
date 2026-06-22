// db.js — слой персистентности, SQLite (better-sqlite3)
const Database = require('better-sqlite3');
const { config } = require('./config');

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS snapshots (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT    NOT NULL,
    captured_at     INTEGER NOT NULL,
    followers       INTEGER NOT NULL,
    avg_likes       INTEGER,
    avg_comments    INTEGER,
    engagement_rate REAL,
    raw_json        TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_snap_user_time ON snapshots(username, captured_at);
`);

const insertStmt = db.prepare(`
  INSERT INTO snapshots
    (username, captured_at, followers, avg_likes, avg_comments, engagement_rate, raw_json)
  VALUES
    (@username, @captured_at, @followers, @avg_likes, @avg_comments, @engagement_rate, @raw_json)
`);

function saveSnapshot({ username, followers, avgLikes = null, avgComments = null, er = null, raw = null }) {
  return insertStmt.run({
    username:        username.toLowerCase().replace(/^@/, ''),
    captured_at:     Date.now(),
    followers,
    avg_likes:       avgLikes,
    avg_comments:    avgComments,
    engagement_rate: er,
    raw_json:        raw ? JSON.stringify(raw) : null,
  });
}

function getHistory(username, sinceMs) {
  return db.prepare(`
    SELECT * FROM snapshots WHERE username = ? AND captured_at >= ? ORDER BY captured_at ASC
  `).all(username.toLowerCase().replace(/^@/, ''), sinceMs);
}

function getLastSnapshot(username) {
  return db.prepare(`
    SELECT * FROM snapshots WHERE username = ? ORDER BY captured_at DESC LIMIT 1
  `).get(username.toLowerCase().replace(/^@/, ''));
}

module.exports = { saveSnapshot, getHistory, getLastSnapshot };
