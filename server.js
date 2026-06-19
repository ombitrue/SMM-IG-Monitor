// ============================================================
//  Instagram Analytics Monitor — Backend Proxy
//  Запуск: node server.js
//  Порт по умолчанию: 5050 (НЕ 5000!)
//
//  ПОЧЕМУ НЕ 5000: на macOS системный сервис AirPlay Receiver
//  слушает 127.0.0.1:5000 (Control Center → AirDrop & Handoff).
//  Он перехватывает часть запросов раньше Node-процесса, из-за
//  чего CORS-заголовки могут пропадать или приходить с задержкой/
//  ошибкой — именно это давало "No Access-Control-Allow-Origin"
//  при формально верно настроенном сервере. Порт 5050 эту
//  проблему полностью обходит.
// ============================================================
require('dotenv').config();
const express = require('express');
const axios   = require('axios');

const app  = express();
const PORT = process.env.PORT || 5050;

// ── API конфиг ───────────────────────────────────────────────
// instagram-statistics-api.p.rapidapi.com
// Основной (наиболее вероятный) путь для этого конкретного API —
// /community с параметром url=<полная ссылка на профиль>.
// Если он не подойдёт именно вашей подписке — см. /api/probe ниже,
// он проверит все известные варианты и скажет точно, какой рабочий.
const API_HOST = "instagram-statistics-api.p.rapidapi.com";
const ENDPOINTS = {
  userInfo:  "/community",
  userPosts: "/posts",
};
const profileUrl = username => `https://www.instagram.com/${username}/`;
// ─────────────────────────────────────────────────────────────

app.use(express.json());

// ── РУЧНОЙ CORS (без пакета `cors`) ────────────────────────────
// Поставлен САМЫМ ПЕРВЫМ middleware, до любых других обработчиков.
// Не зависит от path-to-regexp, не использует '*' как путь маршрута,
// поэтому не ломается ни в Express 4, ни в Express 5.
// Гарантированно прописывает заголовки на КАЖДЫЙ ответ, включая
// preflight (OPTIONS), и сразу завершает OPTIONS без похода дальше
// по цепочке middleware.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-rapidapi-key, X-RapidAPI-Key, Accept');
  res.setHeader('Access-Control-Max-Age', '86400'); // кэш preflight на 24ч — меньше лишних OPTIONS

  if (req.method === 'OPTIONS') {
    const ts = new Date().toISOString().slice(11, 23);
    console.log(`[${ts}] ⚡ PREFLIGHT (OPTIONS) ${req.originalUrl}  ←  Origin: ${req.headers.origin || '—'}`);
    console.log(`           ↳ Ответ: 204, CORS-заголовки прикреплены ✓`);
    return res.sendStatus(204);
  }
  next();
});

// ── Логируем каждый входящий запрос (после CORS, чтобы не дублировать OPTIONS) ──
app.use((req, _res, next) => {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`\n[${ts}] ▶ ${req.method} ${req.originalUrl}  ←  Origin: ${req.headers.origin || '—'}`);
  if (req.headers['x-rapidapi-key']) {
    const k = req.headers['x-rapidapi-key'];
    console.log(`        🔑 API-ключ получен: ${k.slice(0, 6)}...${k.slice(-4)} (${k.length} симв.)`);
  } else {
    console.warn(`        ⚠️  Заголовок x-rapidapi-key ОТСУТСТВУЕТ`);
  }
  next();
});

// ── Утилита: запрос к RapidAPI с подробным логом ───────────────
const rapidRequest = async (endpoint, params, apiKey, label) => {
  const url    = `https://${API_HOST}${endpoint}`;
  const config = {
    method:  'GET',
    url,
    params,
    headers: {
      'X-RapidAPI-Host': API_HOST,
      'X-RapidAPI-Key':  apiKey,
      'Accept':          'application/json',
    },
    timeout: 15000,
  };

  console.log(`\n  [RapidAPI → ${label}]`);
  console.log(`  URL:    ${url}`);
  console.log(`  Params: ${JSON.stringify(params)}`);

  try {
    const response = await axios(config);
    console.log(`  ✅ HTTP ${response.status} | данные получены`);
    const preview = JSON.stringify(response.data).slice(0, 300);
    console.log(`  Preview: ${preview}${preview.length === 300 ? '...' : ''}`);
    return response.data;
  } catch (err) {
    const status  = err.response?.status;
    const body    = err.response?.data;
    const headers = err.response?.headers;

    console.error(`\n  ❌ ОШИБКА при запросе к RapidAPI [${label}]`);
    console.error(`  HTTP Status  : ${status ?? 'нет ответа (таймаут/сеть)'}`);
    console.error(`  URL запроса  : ${url}`);
    console.error(`  Тело ответа  : ${JSON.stringify(body, null, 2)}`);

    if (status === 403) {
      console.error(`  💡 403 = Ключ есть, но нет доступа. Проверьте:`);
      console.error(`     1. Подписка именно на "${API_HOST}" активна?`);
      console.error(`     2. Не превышен лимит запросов?`);
      console.error(`     3. Ключ скопирован полностью, без пробелов?`);
    } else if (status === 404) {
      console.error(`  💡 404 = Эндпоинт не найден: ${endpoint}`);
      console.error(`     Сверьте путь с разделом "Endpoints" вашей подписки на RapidAPI.`);
    } else if (status === 429) {
      console.error(`  💡 429 = Превышен лимит запросов (rate limit). Подождите.`);
      const retryAfter = headers?.['retry-after'] || headers?.['x-ratelimit-reset'];
      if (retryAfter) console.error(`     Повторите через: ${retryAfter}s`);
    } else if (status === 401) {
      console.error(`  💡 401 = Ключ недействителен или не передан.`);
    } else if (!status) {
      console.error(`  💡 Нет ответа от RapidAPI. Проверьте интернет или таймаут.`);
    }

    const enhanced = new Error(body?.message || err.message || 'RapidAPI error');
    enhanced.status    = status || 500;
    enhanced.rapidBody = body;
    throw enhanced;
  }
};

// ── GET / ────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({
    status:    'running',
    port:      PORT,
    api_host:  API_HOST,
    endpoints: ENDPOINTS,
    tip:       'Используйте GET /api/health для проверки связи',
  });
});

// ── GET /api/health ──────────────────────────────────────────
app.get('/api/health', (req, res) => {
  const key = req.headers['x-rapidapi-key'] || process.env.RAPIDAPI_KEY;
  res.json({
    server:    'ok',
    port:      PORT,
    api_key:   key ? `присутствует (${key.length} симв.)` : 'ОТСУТСТВУЕТ',
    api_host:  API_HOST,
    endpoints: ENDPOINTS,
  });
});

// ── GET /api/userinfo?username=handle ──────────────────────────
app.get('/api/userinfo', async (req, res) => {
  const { username } = req.query;
  if (!username)
    return res.status(400).json({ error: 'Параметр username обязателен.' });

  const apiKey = req.headers['x-rapidapi-key'] || process.env.RAPIDAPI_KEY;
  if (!apiKey)
    return res.status(401).json({ error: 'API-ключ отсутствует. Передайте заголовок x-rapidapi-key.' });

  try {
    const data = await rapidRequest(ENDPOINTS.userInfo, { url: profileUrl(username) }, apiKey, 'userInfo');
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({
      error:     err.message,
      rapidBody: err.rapidBody,
      tip:       `Если ошибка 404 — откройте GET /api/probe?username=${username} в браузере, чтобы найти рабочий путь для вашей подписки.`,
    });
  }
});

// ── GET /api/userposts?username=handle ─────────────────────────
app.get('/api/userposts', async (req, res) => {
  const { username } = req.query;
  if (!username)
    return res.status(400).json({ error: 'Параметр username обязателен.' });

  const apiKey = req.headers['x-rapidapi-key'] || process.env.RAPIDAPI_KEY;
  if (!apiKey)
    return res.status(401).json({ error: 'API-ключ отсутствует.' });

  try {
    const data = await rapidRequest(ENDPOINTS.userPosts, { url: profileUrl(username) }, apiKey, 'userPosts');
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({
      error:     err.message,
      rapidBody: err.rapidBody,
    });
  }
});

// ── GET /api/probe?username=handle ──────────────────────────────
// ДИАГНОСТИЧЕСКИЙ инструмент: пробует сразу все наиболее вероятные
// варианты пути/параметров для instagram-statistics-api и для каждого
// сообщает реальный HTTP-статус. Откройте в браузере:
//   http://localhost:5050/api/probe?username=ombitrue&key=ВАШ_КЛЮЧ
// (ключ можно передать ?key=... — это упрощает ручную проверку прямо
// из адресной строки браузера, без Postman/curl).
app.get('/api/probe', async (req, res) => {
  const { username, key } = req.query;
  if (!username) return res.status(400).json({ error: 'Укажите ?username=...' });

  const apiKey = key || req.headers['x-rapidapi-key'] || process.env.RAPIDAPI_KEY;
  if (!apiKey) return res.status(401).json({ error: 'Нужен API-ключ: ?key=... или заголовок x-rapidapi-key' });

  const url = profileUrl(username);
  const CANDIDATES = [
    { label: 'community (url)',        path: '/community',     params: { url } },
    { label: 'community (username)',   path: '/community',     params: { username } },
    { label: 'info (username)',        path: '/info',          params: { username } },
    { label: 'profile (url)',          path: '/profile',       params: { url } },
    { label: 'stats (url)',            path: '/stats',         params: { url } },
    { label: 'v1/user/info (legacy)',  path: '/v1/user/info',  params: { username } },
  ];

  console.log(`\n🔍 PROBE: проверяю ${CANDIDATES.length} вариантов эндпоинта для @${username}...`);
  const results = [];

  for (const c of CANDIDATES) {
    const fullUrl = `https://${API_HOST}${c.path}`;
    try {
      const r = await axios.get(fullUrl, {
        params: c.params,
        headers: { 'X-RapidAPI-Host': API_HOST, 'X-RapidAPI-Key': apiKey },
        timeout: 10000,
        validateStatus: () => true, // не бросаем исключение на 4xx/5xx — сами разбираем статус
      });
      const ok = r.status >= 200 && r.status < 300;
      console.log(`   ${ok ? '✅' : '❌'} [${r.status}] ${c.label.padEnd(22)} → ${fullUrl}?${new URLSearchParams(c.params)}`);
      results.push({
        label:  c.label,
        url:    `${fullUrl}?${new URLSearchParams(c.params)}`,
        status: r.status,
        ok,
        preview: ok ? JSON.stringify(r.data).slice(0, 200) : (r.data?.message || JSON.stringify(r.data).slice(0, 150)),
      });
    } catch (e) {
      console.log(`   ⚠️  [нет ответа] ${c.label.padEnd(22)} → ${e.message}`);
      results.push({ label: c.label, url: fullUrl, status: null, ok: false, preview: e.message });
    }
  }

  const working = results.filter(r => r.ok);
  console.log(working.length
    ? `\n✅ Рабочий(е) вариант(ы) найден(ы): ${working.map(w => w.label).join(', ')}\n`
    : `\n❌ Ни один вариант не сработал. Смотрите статусы выше — вероятно, неверный API-ключ или нет активной подписки на ${API_HOST}.\n`);

  res.json({
    tested_username: username,
    api_host: API_HOST,
    summary: working.length
      ? `Рабочие пути: ${working.map(w => w.label).join(', ')}`
      : 'Ни один из проверенных путей не вернул успешный ответ — см. results ниже.',
    results,
  });
});

// ── 404 для неизвестных маршрутов ──────────────────────────────
app.use((req, res) => {
  console.warn(`  ⚠️  Неизвестный маршрут: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    error:     `Маршрут "${req.originalUrl}" не найден на прокси-сервере`,
    available: ['GET /', 'GET /api/health', 'GET /api/userinfo', 'GET /api/userposts'],
  });
});

// ── Запуск ──────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   📊 Instagram Analytics Monitor — Proxy Server  ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`\n  🚀 Слушаем на  : http://localhost:${PORT}`);
  console.log(`  🌐 RapidAPI    : ${API_HOST}`);
  console.log(`  📌 Эндпоинты  :`);
  Object.entries(ENDPOINTS).forEach(([k, v]) =>
    console.log(`     ${k.padEnd(12)}: ${v}`)
  );
  console.log(`\n  📋 Тест связи : GET http://localhost:${PORT}/api/health`);
  const envKey = process.env.RAPIDAPI_KEY;
  if (envKey) {
    console.log(`  🔑 .env ключ  : ${envKey.slice(0, 6)}...${envKey.slice(-4)} (${envKey.length} симв.)`);
  } else {
    console.warn('  ⚠️  .env: RAPIDAPI_KEY не задан — ключ читается из заголовка запроса');
  }
  if (PORT === 5000) {
    console.warn('\n  ⚠️  ВНИМАНИЕ: порт 5000 на macOS конфликтует с AirPlay Receiver!');
    console.warn('      Рекомендуется использовать порт 5050 (задан по умолчанию).');
  }
  console.log('\n  Ожидаю запросы... (каждый preflight и запрос будет залогирован ниже)\n');
});