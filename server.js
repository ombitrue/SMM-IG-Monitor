// ============================================================
//  Instagram Analytics Monitor — Backend Proxy
//  Запуск: node server.js
//  Порт по умолчанию: 5050 (НЕ 5000!)
//
//  ПОЧЕМУ НЕ 5000: на macOS системный сервис AirPlay Receiver
//  слушает 127.0.0.1:5000 (Control Center → AirDrop & Handoff)
//  и перехватывает часть запросов раньше Node-процесса, из-за
//  чего CORS-заголовки могут пропадать. Порт 5050 это обходит.
//
//  ВСЯ конфигурация провайдера API задаётся через .env — см.
//  README.md, раздел "Переменные окружения" и "Другие провайдеры".
// ============================================================
const express = require('express');
const axios   = require('axios');
const { config, validate }    = require('./config');
const { saveSnapshot }        = require('./db');
const { rollupByDay, growth } = require('./stats');

const app  = express();
const PORT = config.port;

// ── Конфиг провайдера (полностью переопределяется через .env) ──
const API_HOST    = config.apiHost;
const ENDPOINT    = config.endpoint;
const PARAM_NAME  = config.paramName;   // имя query-параметра, который ждёт API
const PARAM_MODE  = config.paramMode;   // "url" → полная ссылка на профиль; "username" → голый юзернейм
const AUTH_HEADER = config.authHeader;   // на случай провайдера без RapidAPI
const HOST_HEADER = config.hostHeader;  // можно пусто, если провайдеру не нужен

const ENDPOINTS = { userInfo: ENDPOINT, userPosts: ENDPOINT };

const profileUrl  = username => `https://www.instagram.com/${username}/`;
const buildParams = username => ({ [PARAM_NAME]: PARAM_MODE === "username" ? username : profileUrl(username) });
// ─────────────────────────────────────────────────────────────

app.use(express.json());

// ── РУЧНОЙ CORS (без пакета `cors`, не зависит от path-to-regexp) ──
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-rapidapi-key, X-RapidAPI-Key, Accept');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    const ts = new Date().toISOString().slice(11, 23);
    console.log(`[${ts}] ⚡ PREFLIGHT (OPTIONS) ${req.originalUrl}  ←  Origin: ${req.headers.origin || '—'}`);
    console.log(`           ↳ Ответ: 204, CORS-заголовки прикреплены ✓`);
    return res.sendStatus(204);
  }
  next();
});

// ── Логируем каждый входящий запрос ────────────────────────────
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

// ── MOCK API fixture ─────────────────────────────────────────
const mockCommunity = username => {
  const clean = username.toLowerCase().replace(/^@/, '');
  const known = { nasa: 96500000, cristiano: 630000000 };
  const fallback = 10000 + [...clean].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) * 1000;
  const follower_count = known[clean] || fallback;
  return {
    data: {
      community: {
        username: clean,
        follower_count,
        avgLikes: Math.round(follower_count * 0.015),
        avgComments: Math.round(follower_count * 0.0004),
        engagementRate: 1.54,
      },
    },
  };
};

// ── Утилита: запрос к провайдеру с подробным логом ──────────────
const apiRequest = async (endpoint, params, apiKey, label) => {
  const url = `https://${API_HOST}${endpoint}`;
  const headers = { 'Accept': 'application/json' };
  if (HOST_HEADER) headers[HOST_HEADER] = API_HOST;
  if (AUTH_HEADER) headers[AUTH_HEADER] = apiKey;

  const requestConfig = { method: 'GET', url, params, headers, timeout: 15000 };

  console.log(`\n  [API → ${label}]`);
  console.log(`  URL:    ${url}`);
  console.log(`  Params: ${JSON.stringify(params)}`);

  if (config.mockApi) {
    const raw = params[PARAM_NAME] || '';
    const username = String(raw).split('/').filter(Boolean).pop() || String(raw).replace(/^@/, '') || 'mock';
    console.log('  🧪 MOCK_API=true | возвращаю fixture');
    return mockCommunity(username);
  }

  try {
    const response = await axios(requestConfig);
    console.log(`  ✅ HTTP ${response.status} | данные получены`);
    const preview = JSON.stringify(response.data).slice(0, 300);
    console.log(`  Preview: ${preview}${preview.length === 300 ? '...' : ''}`);
    return response.data;
  } catch (err) {
    const status  = err.response?.status;
    const body    = err.response?.data;
    const headers2 = err.response?.headers;

    console.error(`\n  ❌ ОШИБКА при запросе к API [${label}]`);
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
      console.error(`     Сверьте путь с разделом "Endpoints" вашей подписки или используйте GET /api/probe.`);
    } else if (status === 429) {
      console.error(`  💡 429 = Превышен лимит запросов (rate limit). Подождите.`);
      const retryAfter = headers2?.['retry-after'] || headers2?.['x-ratelimit-reset'];
      if (retryAfter) console.error(`     Повторите через: ${retryAfter}s`);
    } else if (status === 401) {
      console.error(`  💡 401 = Ключ недействителен или не передан.`);
    } else if (!status) {
      console.error(`  💡 Нет ответа от API. Проверьте интернет или таймаут.`);
    }

    const enhanced = new Error(body?.message || body?.meta?.message || err.message || 'API error');
    enhanced.status    = status || 500;
    enhanced.rapidBody = body;
    throw enhanced;
  }
};

// ── GET / ────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({
    status: 'running',
    port: PORT,
    api_host: API_HOST,
    endpoint: ENDPOINT,
    param_name: PARAM_NAME,
    param_mode: PARAM_MODE,
    tip: 'Используйте GET /api/health для проверки связи или GET /api/probe?username=... для поиска рабочего эндпоинта',
  });
});

// ── GET /api/health ──────────────────────────────────────────
app.get('/api/health', (req, res) => {
  const key = req.headers['x-rapidapi-key'] || config.rapidApiKey;
  res.json({
    server: 'ok',
    port: PORT,
    api_key: key ? `присутствует (${key.length} симв.)` : 'ОТСУТСТВУЕТ',
    api_host: API_HOST,
    endpoint: ENDPOINT,
    param_name: PARAM_NAME,
    param_mode: PARAM_MODE,
    mock_api: config.mockApi,
  });
});

// ── GET /api/userinfo?username=handle ──────────────────────────
app.get('/api/userinfo', async (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: 'Параметр username обязателен.' });

  const apiKey = req.headers['x-rapidapi-key'] || config.rapidApiKey;
  if (!apiKey) return res.status(401).json({ error: 'API-ключ отсутствует. Передайте заголовок x-rapidapi-key.' });

  try {
    const data = await apiRequest(ENDPOINTS.userInfo, buildParams(username), apiKey, 'userInfo');

    try {
      const d = data?.data?.community || data?.community || data?.data || data;
      saveSnapshot({
        username,
        followers:   d.follower_count  || d.followers   || d.usersCount   || 0,
        avgLikes:    d.avgLikes        || d.avg_likes    || d.averageLikes || null,
        avgComments: d.avgComments     || d.avg_comments                  || null,
        er:          d.engagementRate  || d.qualityScore || d.communityER  || null,
        raw: d,
      });
      console.log(`  💾 Снэпшот сохранён: @${username}`);
    } catch (dbErr) {
      console.error(`  ⚠️  Ошибка сохранения снэпшота: ${dbErr.message}`);
    }

    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({
      error: err.message,
      rapidBody: err.rapidBody,
      tip: `Если ошибка 404 — откройте GET /api/probe?username=${username} в браузере, чтобы найти рабочий путь для вашей подписки.`,
    });
  }
});

// ── GET /api/history?username=handle&days=30 ───────────────────
app.get('/api/history', (req, res) => {
  const { username, days = '30' } = req.query;
  if (!username) return res.status(400).json({ error: 'Параметр username обязателен.' });

  const d = Math.min(Math.max(Number(days) || 30, 1), 365);

  try {
    const rollup     = rollupByDay(username, d);
    const growthData = growth(username, Math.min(d, 7));
    res.json({
      username: username.toLowerCase().replace(/^@/, ''),
      days: d,
      rollup,
      growth: growthData,
      data_points: rollup.length,
      has_sufficient_data: !growthData.insufficient,
    });
  } catch (err) {
    console.error(`  ❌ /api/history ошибка: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/userposts?username=handle ─────────────────────────
app.get('/api/userposts', async (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: 'Параметр username обязателен.' });

  const apiKey = req.headers['x-rapidapi-key'] || config.rapidApiKey;
  if (!apiKey) return res.status(401).json({ error: 'API-ключ отсутствует.' });

  try {
    const data = await apiRequest(ENDPOINTS.userPosts, buildParams(username), apiKey, 'userPosts');
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, rapidBody: err.rapidBody });
  }
});

// ── GET /api/probe?username=handle ──────────────────────────────
// Диагностика: перебирает известные варианты пути/параметров и
// показывает, какой реально работает у вашей подписки/провайдера.
app.get('/api/probe', async (req, res) => {
  const { username, key } = req.query;
  if (!username) return res.status(400).json({ error: 'Укажите ?username=...' });

  const apiKey = key || req.headers['x-rapidapi-key'] || config.rapidApiKey;
  if (!apiKey) return res.status(401).json({ error: 'Нужен API-ключ: ?key=... или заголовок x-rapidapi-key' });

  const url = profileUrl(username);
  const CANDIDATES = [
    { label: 'community (url)',       path: '/community',    params: { url } },
    { label: 'community (username)',  path: '/community',    params: { username } },
    { label: 'info (username)',       path: '/info',         params: { username } },
    { label: 'profile (url)',         path: '/profile',      params: { url } },
    { label: 'stats (url)',           path: '/stats',        params: { url } },
    { label: 'v1/info (scraper-api2)',path: '/v1/info',      params: { username_or_id_or_url: username } },
    { label: 'v1/user/info (legacy)', path: '/v1/user/info', params: { username } },
  ];

  console.log(`\n🔍 PROBE: проверяю ${CANDIDATES.length} вариантов эндпоинта для @${username} на хосте ${API_HOST}...`);
  const results = [];

  for (const c of CANDIDATES) {
    const fullUrl = `https://${API_HOST}${c.path}`;
    try {
      const headers = { Accept: 'application/json' };
      if (HOST_HEADER) headers[HOST_HEADER] = API_HOST;
      if (AUTH_HEADER) headers[AUTH_HEADER] = apiKey;
      const r = await axios.get(fullUrl, { params: c.params, headers, timeout: 10000, validateStatus: () => true });
      const ok = r.status >= 200 && r.status < 300;
      console.log(`   ${ok ? '✅' : '❌'} [${r.status}] ${c.label.padEnd(24)} → ${fullUrl}?${new URLSearchParams(c.params)}`);
      results.push({
        label: c.label,
        url: `${fullUrl}?${new URLSearchParams(c.params)}`,
        status: r.status,
        ok,
        preview: ok ? JSON.stringify(r.data).slice(0, 200) : (r.data?.message || JSON.stringify(r.data).slice(0, 150)),
      });
    } catch (e) {
      console.log(`   ⚠️  [нет ответа] ${c.label.padEnd(24)} → ${e.message}`);
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
    error: `Маршрут "${req.originalUrl}" не найден на прокси-сервере`,
    available: ['GET /', 'GET /api/health', 'GET /api/userinfo', 'GET /api/history', 'GET /api/userposts', 'GET /api/probe'],
  });
});

// ── Запуск ──────────────────────────────────────────────────────
validate();
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   📊 Instagram Analytics Monitor — Proxy Server  ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`\n  🚀 Слушаем на     : http://localhost:${PORT}`);
  console.log(`  🌐 API хост       : ${API_HOST}`);
  console.log(`  📌 Эндпоинт       : ${ENDPOINT}`);
  console.log(`  🔧 Параметр       : ${PARAM_NAME} (режим: ${PARAM_MODE})`);
  console.log(`\n  📋 Тест связи     : GET http://localhost:${PORT}/api/health`);
  console.log(`  🔍 Поиск эндпоинта: GET http://localhost:${PORT}/api/probe?username=nasa&key=ВАШ_КЛЮЧ`);
  const envKey = config.rapidApiKey;
  if (envKey) {
    console.log(`  🔑 .env ключ      : ${envKey.slice(0, 6)}...${envKey.slice(-4)} (${envKey.length} симв.)`);
  } else {
    console.warn('  ⚠️  .env: RAPIDAPI_KEY не задан — ключ читается из заголовка запроса от фронтенда');
  }
  if (String(PORT) === '5000') {
    console.warn('\n  ⚠️  ВНИМАНИЕ: порт 5000 на macOS конфликтует с AirPlay Receiver!');
    console.warn('      Рекомендуется использовать порт 5050 (задан по умолчанию).');
  }
  console.log('\n  Ожидаю запросы... (каждый preflight и запрос логируется ниже)\n');
});
