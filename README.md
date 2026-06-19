# 📊 Instagram Analytics Monitor

Локальный дашборд для отслеживания статистики Instagram-аккаунтов: подписчики, ER%, динамика по дням/неделям/месяцам/годам, аналитика публикаций, сравнение профилей. Состоит из двух частей:

- **Frontend** — один файл `index.html` (React + Chart.js + Tailwind-стиль через чистый CSS, всё через CDN, без сборки).
- **Backend-прокси** — `server.js` (Node.js/Express), который безопасно хранит ваш API-ключ и пробрасывает запросы к выбранному Instagram-API, обходя проблемы CORS.

Все данные профилей и API-ключ хранятся **только в вашем браузере** (`localStorage`) — никуда, кроме вашего собственного локального сервера, не отправляются.

---

## 📦 Требования

- [Node.js](https://nodejs.org/) версии 18 или новее (проверить: `node -v`)
- npm (идёт вместе с Node.js)
- Любой способ открыть `index.html` как веб-страницу — расширение **Live Server** в VS Code, или любой статический HTTP-сервер

---

## 🚀 Установка и запуск

### 1. Установите зависимости backend'а

В папке проекта:

```bash
npm install express axios dotenv
```

### 2. Создайте файл `.env`

В корне проекта создайте файл `.env` (рядом с `server.js`):

```ini
# Обязательно: ваш ключ от выбранного провайдера API
RAPIDAPI_KEY=вставьте_сюда_ваш_ключ

# Необязательно — порт прокси-сервера (по умолчанию 5050)
PORT=5050
```

> ⚠️ **Важно про порт 5000**: если вы на macOS, НЕ используйте `PORT=5000` — этот порт системно занят сервисом **AirPlay Receiver** (Control Center → AirDrop & Handoff) и будет вызывать необъяснимые ошибки CORS/сети. Порт `5050` (значение по умолчанию) этого избегает.

### 3. Запустите прокси-сервер

```bash
node server.js
```

Вы должны увидеть баннер вида:

```
🚀 Слушаем на     : http://localhost:5050
🌐 API хост       : instagram-statistics-api.p.rapidapi.com
📌 Эндпоинт       : /community
🔑 .env ключ      : 8ba5b5...38ce (50 симв.)
```

### 4. Откройте `index.html`

Любым способом, например через расширение **Live Server** в VS Code (правый клик на файле → "Open with Live Server"), либо:

```bash
npx serve .
```

### 5. Введите API-ключ в интерфейсе

В приложении нажмите на иконку ⚙️ в шапке → вставьте ваш ключ → «Сохранить». Нажмите **«🔍 Проверить связь с сервером»**, чтобы убедиться, что фронтенд видит прокси-сервер.

---

## 🔑 Как получить бесплатный API-ключ (провайдер по умолчанию)

1. Зарегистрируйтесь на [rapidapi.com](https://rapidapi.com) (бесплатно).
2. Найдите **"Instagram Statistics API"** в каталоге.
3. Подпишитесь на бесплатный (Basic/Free) тариф.
4. В разделе **Endpoints → Code Snippets** скопируйте значение `X-RapidAPI-Key`.
5. Вставьте его в `.env` (`RAPIDAPI_KEY=...`) и/или в настройки (⚙️) приложения.

---

## 🧪 Быстрая проверка работоспособности (smoke test)

Чтобы убедиться, что сервер и порт настроены верно — **до** того как тратить запросы к реальному Instagram API, выполните эти проверки.

### Вариант А — вручную через curl

```bash
# 1. Сервер вообще поднялся и слушает порт?
curl -s http://localhost:5050/ | head -c 300

# 2. Health-check без обращения к Instagram API (быстро, бесплатно)
curl -s http://localhost:5050/api/health

# 3. CORS-заголовки реально прикрепляются?
curl -s -i -X OPTIONS http://localhost:5050/api/userinfo \
  -H "Origin: http://127.0.0.1:5500" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: x-rapidapi-key" | grep -i access-control
```

Ожидаемый результат шага 3 — строки вида:
```
access-control-allow-origin: *
access-control-allow-headers: Content-Type, Authorization, x-rapidapi-key, ...
```
Если их нет — порт 5050 перехвачен другим процессом (см. раздел «Диагностика» ниже).

### Вариант Б — простой bash-скрипт

Сохраните как `smoke-check.sh`, дайте права (`chmod +x smoke-check.sh`) и запускайте перед каждой сессией работы:

```bash
#!/bin/bash
PORT=${PORT:-5050}
HOST="http://localhost:$PORT"

echo "🔍 Проверка $HOST ..."

if ! curl -s -o /dev/null -w "" "$HOST/" --max-time 3; then
  echo "❌ Сервер не отвечает на $HOST — запущен ли 'node server.js'?"
  exit 1
fi
echo "✅ Сервер отвечает"

HEALTH=$(curl -s "$HOST/api/health")
echo "📋 /api/health → $HEALTH"

if echo "$HEALTH" | grep -q '"api_key":"ОТСУТСТВУЕТ"'; then
  echo "⚠️  API-ключ не передан — задайте RAPIDAPI_KEY в .env или заголовок x-rapidapi-key"
else
  echo "✅ API-ключ обнаружен"
fi

CORS=$(curl -s -i -X OPTIONS "$HOST/api/userinfo" \
  -H "Origin: http://127.0.0.1:5500" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: x-rapidapi-key" | grep -i "access-control-allow-origin")

if [ -z "$CORS" ]; then
  echo "❌ CORS-заголовки отсутствуют — см. раздел «Диагностика» в README"
else
  echo "✅ CORS настроен корректно: $CORS"
fi
```

Этот скрипт **не делает реальных запросов к Instagram API** — он проверяет только то, что зависит от вашей локальной настройки (сервер, порт, ключ, CORS), и не тратит лимит запросов к провайдеру.

### Вариант В — встроенный диагностический эндпоинт

Откройте в браузере (замените `ВАШ_КЛЮЧ`):
```
http://localhost:5050/api/probe?username=nasa&key=ВАШ_КЛЮЧ
```
Это уже делает реальные запросы (используйте для проверки именно подключения к Instagram API, не чаще, чем нужно) и переберёт несколько вариантов эндпоинтов, показав, какой рабочий.

---

## ⚙️ Переменные окружения (`.env`)

| Переменная | По умолчанию | Описание |
|---|---|---|
| `RAPIDAPI_KEY` | — | Ваш API-ключ. Обязателен для реальных данных. |
| `PORT` | `5050` | Порт прокси-сервера. **Не используйте 5000 на macOS.** |
| `RAPIDAPI_HOST` | `instagram-statistics-api.p.rapidapi.com` | Хост API-провайдера. |
| `RAPIDAPI_ENDPOINT` | `/community` | Путь эндпоинта, отдающего данные профиля. |
| `RAPIDAPI_PARAM_NAME` | `url` | Имя query-параметра, которое ожидает эндпоинт. |
| `RAPIDAPI_PARAM_MODE` | `url` | `url` — отправлять полную ссылку на профиль; `username` — отправлять голый юзернейм. |
| `RAPIDAPI_AUTH_HEADER` | `X-RapidAPI-Key` | Заголовок авторизации (можно изменить для не-RapidAPI провайдеров). |
| `RAPIDAPI_HOST_HEADER` | `X-RapidAPI-Host` | Заголовок хоста (оставьте пустым `""`, если провайдеру он не нужен). |

Пример полного `.env`:
```ini
RAPIDAPI_KEY=8ba5b5xxxxxxxxxxxxxxxxxxxxxxxxxx38ce
PORT=5050
RAPIDAPI_HOST=instagram-statistics-api.p.rapidapi.com
RAPIDAPI_ENDPOINT=/community
RAPIDAPI_PARAM_NAME=url
RAPIDAPI_PARAM_MODE=url
```

---

## 🔄 Использование другого провайдера API

Поскольку `server.js` — это тонкий настраиваемый прокси, переключиться на другой Instagram-scraper API на RapidAPI можно **без единой правки кода**, только через `.env`.

### Пример 1 — Instagram Scraper API2

```ini
RAPIDAPI_KEY=ваш_новый_ключ
RAPIDAPI_HOST=instagram-scraper-api2.p.rapidapi.com
RAPIDAPI_ENDPOINT=/v1/info
RAPIDAPI_PARAM_NAME=username_or_id_or_url
RAPIDAPI_PARAM_MODE=username
```

### Пример 2 — Instagram Bulk Profile Scrapper (или похожий, с параметром `ig`)

```ini
RAPIDAPI_HOST=instagram-bulk-profile-scrapper.p.rapidapi.com
RAPIDAPI_ENDPOINT=/clients/api/ig/ig_profile
RAPIDAPI_PARAM_NAME=ig
RAPIDAPI_PARAM_MODE=username
```

### Как узнать точные значения для ВАШЕЙ подписки

1. На странице вашего API в RapidAPI откройте вкладку **Endpoints**.
2. Выберите эндпоинт, который возвращает данные профиля (обычно называется `info`, `profile`, `user`, `community` и т.п.).
3. Посмотрите панель **Code Snippets → cURL** — там будет точный URL и имя параметра.
4. Перенесите хост → `RAPIDAPI_HOST`, путь после хоста → `RAPIDAPI_ENDPOINT`, имя параметра → `RAPIDAPI_PARAM_NAME`.
5. Перезапустите `node server.js` и проверьте через `/api/probe?username=nasa&key=...`.

> 💡 Если у API другая структура ответа (другие названия полей вместо `followers`/`follower_count` и т.п.) — открывайте консоль браузера (F12) при добавлении профиля: приложение печатает туда **сырой ответ API** (`📦 RAW ответ...`), чтобы вы могли свериться с реальными именами полей и при необходимости скорректировать парсинг в `fetchRealProfile` внутри `index.html`.

### Использование провайдера НЕ с RapidAPI (свой скрапер / другой сервис)

`server.js` не привязан жёстко к экосистеме RapidAPI — это просто HTTP-прокси:

1. Задайте `RAPIDAPI_HOST` на хост вашего сервиса (без `https://`).
2. Если ваш сервис не требует заголовка `X-RapidAPI-Host` — задайте `RAPIDAPI_HOST_HEADER=` (пустая строка).
3. Если авторизация идёт другим заголовком (например, `Authorization: Bearer ...`) — задайте `RAPIDAPI_AUTH_HEADER=Authorization` и передавайте ключ в формате `Bearer xxx` как значение `RAPIDAPI_KEY`.
4. Укажите `RAPIDAPI_ENDPOINT`, `RAPIDAPI_PARAM_NAME`, `RAPIDAPI_PARAM_MODE` под формат вашего API.

---

## 🩺 Диагностика и частые ошибки

### "Failed to fetch" / "Не удалось подключиться к прокси-серверу"
Сервер `node server.js` не запущен, либо запущен на другом порту, чем указано в `index.html` (константа `BACKEND_URL` в начале `<script>`).

### CORS-ошибка "No Access-Control-Allow-Origin header"
1. На **macOS** — почти всегда это конфликт порта 5000 с AirPlay Receiver. Используйте `PORT=5050` (значение по умолчанию).
2. Проверьте, что вы перезапустили сервер (`Ctrl+C`, затем `node server.js`) после любых изменений в `.env` или `server.js` — Node не подхватывает изменения "на лету".
3. Освободите порт от зависших процессов: `lsof -ti:5050 | xargs kill -9` (замените порт при необходимости).

### `404: Endpoint '...' does not exist`
Это значит, что путь в `RAPIDAPI_ENDPOINT` не существует у вашего провайдера. Откройте `http://localhost:PORT/api/probe?username=nasa&key=ВАШ_КЛЮЧ` — диагностика переберёт известные варианты и покажет рабочий.

### `404 {"meta":{"code":404,"message":"Not Found"}}` (другой формат, не "Endpoint does not exist")
Это уже **ответ самого API**, а не шлюза RapidAPI — значит путь правильный, но конкретный аккаунт не найден. Причины: профиль закрытый (приватный), не существует, или ещё не проиндексирован сервисом. Попробуйте крупный публичный аккаунт (`nasa`, `nike`) для проверки.

### `403 Forbidden`
Ключ верный по формату, но нет доступа: либо вы не подписаны на конкретный API (хост в `RAPIDAPI_HOST` отличается от того, на который оформлена подписка), либо исчерпан лимит запросов тарифа.

### Карточки сбрасываются к демо-профилям (NASA/Nike/...) после обновления страницы
Это не должно происходить — добавленные вами профили сохраняются в `localStorage` браузера автоматически. Если это всё же случилось — вероятно, вы открываете `index.html` в режиме инкогнито/приватного окна, либо очистили данные сайта в браузере.

---

## 🗂 Структура проекта

```
.
├── index.html        # Весь фронтенд: UI, логика, графики (открывать напрямую/через Live Server)
├── server.js          # Backend-прокси к Instagram API
├── .env                # Ваши секреты — НЕ коммитьте в git
└── README.md           # Этот файл
```

Рекомендуемый `.gitignore`:
```
.env
node_modules/
```

---

## ✨ Возможности приложения

- 📈 Графики роста подписчиков, лайков и комментариев с разбивкой 1 День / 1 Неделя / 1 Месяц / 1 Год (все периоды взаимно согласованы — данные строятся из единого источника, без расхождений при переключении вкладок)
- 🏷 Категории/теги профилей с фильтрацией и счётчиками
- 🔍 Поиск и сортировка по подписчикам / ER% / росту за день
- ✎ Редактирование профиля: имя, категория, произвольные заметки/комментарии
- 🖼 Превью и прямые ссылки на публикации во вкладке «Аналитика публикаций»
- ⚖️ Сравнение до 5 профилей одновременно — таблица метрик + совмещённый график
- 💾 Все данные и API-ключ хранятся локально в браузере (`localStorage`)
- 🌐 Реальные данные через настраиваемый backend-прокси, либо демо-данные без ключа

---

## 📄 Лицензия

Используйте и модифицируйте свободно для личных и коммерческих проектов.
