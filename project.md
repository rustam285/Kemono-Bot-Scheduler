# project.md — VK + Telegram Post Scheduler (Kemono-Bot-Scheduler)

> Документ-снимок архитектуры и кодовой базы для стороннего ИИ-ассистента.
> Прочитав этот файл, ассистент получает полное представление о проекте без доступа к репозиторию.
> Сгенерировано: 2026-11-03. Актуально для коммита `b95e2d3` ( ветка `main`).

---

## 1. Что это за проект

Локальное веб-приложение для автоматизации отложенных постов в **VK-группе** и **Telegram-канале**.

Сценарий использования (единственный пользователь — владелец):

1. Пользователь вставляет ссылки на источники медиа (Twitter/X, Reddit, YouTube, Bilibili, прямые ссылки на файлы) или загружает локальные файлы.
2. Приложение извлекает из ссылок медиа (через `yt-dlp` / `gallery-dl` / прямые HTTP-запросы).
3. Медиа группируются в посты, которым автоматически назначаются свободные временные слоты.
4. Посты создаются **сразу как отложенные в самих платформах**: в VK — через `wall.post` с `publish_date` (раздел «отложенные» VK), в Telegram — через Telethon (MTProto) с нативными запланированными сообщениями.
5. Дальше публикацию выполняют сами платформы; приложение хранит зеркало расписания в Supabase (PostgreSQL) и позволяет управлять постами (просмотр, редактирование, удаление) из единого UI.

Ключевая особенность архитектуры: **очередь публикации не хранится на стороне приложения** — истина живёт в VK/Telegram, локальная БД (Supabase) — это учётный слой-зеркало, синхронизируемый с VK.

Репозиторий: https://github.com/rustam285/Kemono-Bot-Scheduler

---

## 2. Технологический стек

| Слой                          | Технологии                                                                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Backend                           | Python 3.13, FastAPI, uvicorn, httpx, structlog, pytz, pydantic v2                                                                        |
| БД                              | Supabase (PostgreSQL) через `supabase-py` (service_role, RLS запрещает anon)                                              |
| VK                                | VK API v5.199 (HTTP,`wall.post`, `photos.*`, `video.save`, `utils.getShortLink`)                                                  |
| Telegram                          | Telethon (MTProto, user-аккаунт), SOCKS5/HTTP-прокси опционально                                                  |
| Медиа-экстракторы | yt-dlp, gallery-dl (внешние CLI, вызываются как `python -m`), httpx для прямых ссылок; static-ffmpeg |
| Frontend                          | React 18, TypeScript, Vite 5, React Router 6, TanStack Query 5, axios, Tailwind CSS 3, shadcn/ui (Radix), lucide-react                    |
| Запуск                      | npm-скрипты + concurrently (backend + frontend),`wait-for-backend.js`, start.bat / start.sh                                      |

---

## 3. Архитектура и потоки данных

```
┌───────────────────────────── Browser (React SPA, :5173) ─────────────────────────────┐
│  /create/:type (мастер 3 шагов)   /posts/calendar   /posts/no-media   /settings      │
│  TanStack Query ←→ axios (baseURL /api, проксируется Vite → 127.0.0.1:8000)          │
└───────────────────────────────────────────┬──────────────────────────────────────────┘
                                            │ REST /api/*  (без аутентификации)
┌───────────────────────────────────────────▼──────────────────────────────────────────┐
│  FastAPI (backend/main.py, порт 8000, по умолчанию 127.0.0.1)                        │
│  routers/: extract, preview+publish, scheduled, settings, stats, tasks, upload,      │
│             telegram, health                                                         │
│  services/:                                                                          │
│   • media_downloader — извлечение и скачивание медиа (yt-dlp → gallery-dl → direct)  │
│   • scheduler        — занятые слоты VK+TG, раскладка постов по слотам, текст поста  │
│   • publisher        — фоновая задача публикации (скачивание → загрузка в VK/TG)     │
│   • task_store       — in-memory задачи + persist в data/tasks.json                  │
│   • vk_api           — вызовы VK API с ретраями                                      │
│   • telegram_api     — Telethon-клиент (singleton, session-файл)                     │
│   • supabase_client  — доступ к PostgreSQL (зеркало расписания, дедуп URL)           │
│   • supabase_watchdog— контроль БД: периодический ping + авто-restore спящего проекта│
│   • settings_store   — data/settings.json (+ AES-шифрование VK-токена)               │
│   • sync_cache, url_shortener, url_utils, crypto                                     │
└───────┬────────────────────────────┬───────────────────────────┬─────────────────────┘
        │                            │                           │
   ┌────▼─────┐              ┌───────▼────────┐           ┌──────▼───────┐
   │ VK API   │              │ Telegram       │           │ Supabase PG  │
   │ wall.*,  │              │ MTProto        │           │ used_urls    │
   │ photos.*,│              │ (Telethon)     │           │ scheduled_   │
   │ video.*  │              │                │           │ posts        │
   └──────────┘              └────────────────┘           └──────────────┘
   [источник истины о постах]  [истина о TG-постах]        [зеркало/учёт + дедуп]

   Локальные файлы (backend/data/): settings.json, tasks.json, cookies.txt (Netscape),
   telegram.session (+journal), uploads/ (локальные медиа), logs/
   Временные файлы: {tmp}/vk_scheduler/{task_id}/ — скачанное медиа, чистка раз в сутки
```

---

## 4. Структура репозитория

```
├── package.json              # корневые скрипты: npm start / setup (concurrently)
├── wait-for-backend.js       # фронт ждёт готовности backend на :8000
├── start.bat / start.sh      # запуск без npm
├── .env / .env.example       # инфраструктурные секреты (см. §8)
├── .github/workflows/supabase-keepalive.yml  # пинг REST Supabase каждые ~3 дня (секреты в GitHub)
├── project.md                # этот файл
├── backend/
│   ├── main.py               # FastAPI app: lifespan, CORS, обработчики ошибок, роутеры
│   ├── startup.py            # запуск uvicorn: обновление yt-dlp/gallery-dl в фоне, static-ffmpeg
│   ├── config.py             # все env-параметры и константы (см. §8.2)
│   ├── logging_config.py     # structlog-настройка (JSON-логи)
│   ├── schemas.py            # error_response()
│   ├── models/schemas.py     # Pydantic: SettingsResponse/Update, VerifyVk, Cookies, Health
│   ├── routers/              # HTTP-эндпоинты (см. §6)
│   │   ├── extract.py        # POST /api/extract
│   │   ├── publish.py        # POST /api/preview, POST /api/publish
│   │   ├── scheduled.py      # CRUD постов + синхронизация с VK (самый большой роутер)
│   │   ├── settings.py       # настройки, verify-vk, cookies
│   │   ├── stats.py          # агрегаты для шапки UI + аватарки TG
│   │   ├── tasks.py          # статус/отмена фоновой задачи
│   │   ├── telegram.py       # TG auth + запланированные сообщения
│   │   ├── upload.py         # загрузка локальных файлов + раздача /api/upload/media/*
│   │   └── health.py         # health-check (Supabase + состояние парсеров)
│   ├── services/             # бизнес-логика (см. §7)
│   ├── database/
│   │   ├── create_tables.sql     # DDL: used_urls, scheduled_posts + RLS
│   │   └── add_tg_columns.sql    # миграция TG-колонок в scheduled_posts
│   └── data/                 # runtime-файлы (в git не должны попадать секреты!)
└── frontend/
    ├── vite.config.ts        # dev-сервер :5173, proxy /api → 127.0.0.1:8000
    └── src/
        ├── App.tsx           # маршруты, сайдбар/мобильные табы, StatsHeader
        ├── api/client.ts     # все хуки TanStack Query + axios (см. §9.2)
        ├── components/       # Header/StatsHeader, MediaCard, PostCard, ui/* (shadcn)
        └── pages/
            ├── CreatePost/   # 3-шаговый мастер: Step1Sources, Step2Schedule, Step3Preview
            ├── Calendar/     # index, CalendarGrid, DayDetail
            ├── NoMedia/      # посты без медиа
            └── Settings/     # index (VK + операционные), TelegramSettings (MTProto auth)
```

---

## 5. Модель данных

### 5.1 PostgreSQL (Supabase) — `used_urls`

Дедупликация использованных источников. Заполняется при успешной публикации.

| Колонка | Тип      | Примечание                                                                                                                             |
| -------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| id             | UUID PK     |                                                                                                                                                  |
| url            | TEXT        | оригинальный URL                                                                                                                     |
| normalized     | TEXT UNIQUE | см.`url_utils.normalize_url` (нижний регистр, срез trailing `/`, удаление utm_*/ref/fbclid/gclid/mc_* и др.) |
| vk_post_id     | BIGINT      |                                                                                                                                                  |
| created_at     | TIMESTAMPTZ |                                                                                                                                                  |

### 5.2 PostgreSQL — `scheduled_posts`

Зеркало всех постов (VK и TG). **Важно:** VK-часть и «both»-посты после публикации разделяются на две записи (одна `platform='vk'` с `vk_post_id`, одна `platform='tg'` с `tg_message_ids`).

| Колонка                | Тип                                                    | Примечание                                                                                 |
| ----------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| id                            | UUID PK                                                   | основной идентификатор для TG/ошибочных записей              |
| vk_post_id                    | BIGINT UNIQUE                                             | только для VK-постов                                                                  |
| post_type                     | TEXT CHECK IN ('art','fursuit','video')                   | **enum зашит в БД** — расширение типов требует миграции |
| scheduled_at                  | TIMESTAMPTZ NOT NULL                                      |                                                                                                      |
| source_urls                   | TEXT[]                                                    |                                                                                                      |
| media_attachments             | JSONB                                                     | для VK:`[{type, attachment}]` либо `[{type, owner_id, media_id}]`                         |
| post_text                     | TEXT                                                      |                                                                                                      |
| has_media                     | BOOLEAN                                                   | false → пост попадает на страницу «Без медиа»                       |
| status                        | TEXT CHECK IN ('scheduled','published','error','deleted') |                                                                                                      |
| error_message                 | TEXT                                                      | в т.ч. пометка «медиа N/M» при частичной публикации           |
| platform                      | TEXT DEFAULT 'vk'                                         | 'vk'\| 'tg'                                                                                          |
| tg_message_ids                | JSONB                                                     | массив id запланированных сообщений TG                                 |
| tg_channel / tg_channel_title | TEXT                                                      |                                                                                                      |

RLS: обе таблицы — только `service_role` (анониму всё запрещено).

При старте бэкенд удаляет записи со статусами `deleted`/`error` (`cleanup_stale_posts`).

### 5.3 Pydantic-модели запросов/ответов (кратко)

- `SettingsResponse/SettingsUpdate` — vk_token (write-only), vk_group_id, vk_owner_id, time_slots, timezone, max_download_workers (1-10), vk_publish_delay_seconds (1-60), ytdlp_timeout_seconds (5-300), max_photo_size_mb (≤50), max_video_size_mb (≤2048), tg_channel_id, tg_channel_title.
- `PreviewRequest` — `post_groups[]` (source_urls + media_item_ids), `post_type` (art|fursuit|video), `start_date` (YYYY-MM-DD), `time_slots[]`, `timezone`, `session_key`, `platform` (vk|tg|both).
- `PublishRequest` — `posts[]`: id, post_type, scheduled_at (обязательно в будущем, ≤1 года), media_items[] (≤10), post_text, source_urls, platform.
- `ExtractRequest` — `urls[]` (≤25); ответ содержит `already_used` (дедуп).

### 5.4 Локальные хранилища (backend/data/)

| Файл             | Назначение                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `settings.json`    | все операционные настройки;`vk_token` хранится как `enc:...` (Fernet AES-256, ключ из `ENCRYPTION_KEY`) |
| `tasks.json`       | состояние фоновых задач (переживает рестарт; processing → interrupted)                                          |
| `cookies.txt`      | Netscape-cookies для yt-dlp/gallery-dl (Twitter/X и др.), загружается через UI                                                   |
| `telegram.session` | Telethon session (авторизованный user-аккаунт TG)                                                                                 |
| `uploads/`         | локально загруженные медиа (≤500 МБ, расширения: jpg/jpeg/png/gif/webp/mp4/mov/webm)                              |

---

## 6. REST API (все под префиксом `/api`, аутентификации нет)

| Метод     | Путь                                                                  | Назначение                                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET            | `/health`                                                               | статус: Supabase ping + degraded-парсеры + состояние watchdog (`supabase_watchdog`)                                                                                                                                        |
| GET/PUT        | `/settings`                                                             | чтение (токен маскируется)/обновление настроек                                                                                                       |
| POST           | `/settings/verify-vk`                                                   | проверка VK токена (users.get + groups.getById)                                                                                                                                |
| POST/DELETE    | `/settings/cookies`                                                     | загрузка/удаление cookies.txt                                                                                                                                                |
| POST           | `/extract`                                                              | извлечь медиа из URL (≤25 за раз); параллельно, semaphore = max_download_workers (≤4)                                                                        |
| POST           | `/preview`                                                              | раскладка постов по свободным слотам (VK wall.get postponed + TG GetScheduledHistory, кэш 5 мин по session_key)                                      |
| POST           | `/publish`                                                              | создать фоновую задачу публикации →`{task_id}`                                                                                                              |
| GET/DELETE     | `/task/{task_id}`                                                       | статус задачи / отмена                                                                                                                                                     |
| GET            | `/scheduled`                                                            | все посты; ленивая синхронизация с VK (кэш 1 ч), заодно подтягивает названия TG-каналов                                     |
| GET            | `/scheduled/calendar?year&month`                                        | агрегат по дням:`{art, fursuit, video, total}`                                                                                                                                |
| GET            | `/scheduled/no-media`                                                   | посты с `has_media=false` (не удалённые)                                                                                                                                  |
| GET/PUT/DELETE | `/scheduled/{vk_post_id}`                                               | детали/редактирование/удаление по VK id                                                                                                                        |
| PUT/DELETE     | `/scheduled/by-id/{post_id}`                                            | то же по UUID (для TG-постов и ошибочных записей)                                                                                                            |
| GET            | `/stats`                                                                | счётчики scheduled (vk/tg), дата последнего поста, инфо VK-аккаунта/группы + TG-аккаунта/канала (аватарки base64, кэш) |
| POST           | `/upload/media`                                                         | загрузка локального файла (multipart) →`{id, filename, url: "/api/upload/media/<uuid>.<ext>"}`                                                                     |
| GET            | `/upload/media/{filename}`                                              | раздача загруженных файлов (защита от path traversal)                                                                                                        |
| GET            | `/telegram/status`                                                      | authorized / not_authorized / session_expired / not_configured + аккаунт                                                                                                              |
| POST           | `/telegram/auth/start` \| `/resend` \| `/complete` \| `/password` | вход по телефону: код → (2FA-пароль)                                                                                                                                 |
| GET            | `/telegram/channels`                                                    | каналы, где юзер creator/admin                                                                                                                                                  |
| POST           | `/telegram/channels/select`                                             | выбрать канал публикации (пишется в settings)                                                                                                                  |
| GET            | `/telegram/scheduled`                                                   | запланированные сообщения выбранного канала (кэш 30 с)                                                                                           |
| DELETE         | `/telegram/scheduled/{message_id}`                                      | удалить запланированное TG-сообщение                                                                                                                          |

Ошибки: единый формат `{"error": "...", "code": "..."}` (HTTPException-хендлер), при валидации публикации — список нарушений.

---

## 7. Ключевые сервисы backend

### 7.1 `media_downloader.py` — извлечение и скачивание

Извлечение (`extract_media`):

1. SSRF-проверка `_assert_public_http_url`: только http/https, DNS-резолв хоста обязан давать публичный IP (запрет private/loopback/link-local/reserved/multicast).
2. Twitter/X — особый путь: глобальный `asyncio.Lock` (все twitter-ссылки по одной), gallery-dl → fallback yt-dlp, после каждой ссылки пауза 3 с (анти-рейт-лимит).
3. Общий путь: yt-dlp `--dump-json --flat-playlist` → при `UnsupportedByTool`/ошибке gallery-dl `--dump-json` → при ошибке прямая ссылка (HEAD/GET, проверка content-type image/video).
4. Ошибки пишутся в скользящее окно (5 мин): ≥3 ошибок домена → домин «degraded» (светится в /health).

Скачивание (`download_media_file`):

- `source_tool == "local"` → файл берётся напрямую с диска из `backend/data/uploads` (без HTTP-само-к-себе).
- Twitter/TikTok → yt-dlp; иначе httpx (браузерный UA, 3 попытки, лимит размера); если видео >50 МБ → повторное скачивание через yt-dlp с деградацией качества 720→480→360 (лимит Telegram).
- Фолбэк по `source_tool`: yt-dlp / gallery-dl / httpx.
- yt-dlp формат: `bestvideo[height<=1080]+bestaudio/best[height<=1080]`, `--no-playlist`, cookies при наличии.
- Все пути проверяются на принадлежность TEMP_BASE, id санитизируется (анти path-traversal).
- Таймауты процессов: `ytdlp_timeout_seconds` (настройка, default 30) ×2 для скачивания; килл дерева процессов (taskkill на Windows).
- Чистка temp-каталогов старше 24 ч.

### 7.2 `scheduler.py` — слоты и превью

- `fetch_occupied_slots_from_vk`: постраничный `wall.get` `filter=postponed` → множество `publish_date`.
- `fetch_occupied_slots_from_tg`: `GetScheduledHistoryRequest` через Telethon.
- Кэш занятых слотов на `session_key` (TTL 300 c) — сессия мастера создания постов.
- `assign_slots`: от `start_date` вперёд по дням, в каждом дне по `time_slots` (локальное время через pytz, Europe/Moscow по умолчанию); занятые слоты пропускаются; защита от бесконечного цикла (`post_count × 10` итераций).
- `build_post_text`: **хардкод** `✯ #{post_type}@xkemonox ✯` + `\n\nSource: {url}` (хэштег группы зашит в коде; для локальных файлов строка Source вырезается при публикации).
- `generate_preview`: проверка настроек (VK group / TG channel по платформе), возвращает посты с назначенными `scheduled_at` (UTC ISO).

### 7.3 `publisher.py` — фоновая публикация

`publish_processor(task)` на каждый пост:

1. Ранние ошибки (нет настроенной платформы / нет слота) → запись в БД со статусом `error`, без имитации успеха.
2. VK-текст: первый source_url заменяется на короткую ссылку (`utils.getShortLink`).
3. Скачивание всех media_items; `media_cache` на пост переживает ретраи (файлы + загруженные VK-вложения переиспользуются, доиспользуются только упавшие). Максимум 2 ретрая на пост (аппенд в очередь, `progress.retries`).
4. Загрузка в VK: фото — `photos.getWallUploadServer` → POST файла → `photos.saveWallPhoto` (3 попытки, delays 2/8/16 c); видео — `video.save` → POST файла (таймаут 300 c).
5. `wall.post` c `publish_date`; при VK-ошибке 214 (слот занят) — сдвиг +30 минут, до 5 попыток. Если `scheduled_at` уже в прошлом — публикация через минуту.
6. TG: `telegram_api.send_scheduled` (текст / одиночное медиа / альбом) с FloodWait-обработкой (ожидание ≤300 с, 3 попытки, delays 1/4/16).
7. Запись в БД: платформа `both` → **две записи** (vk + tg); `record_used_url` для каждого source_url; при неполном наборе медиа — пост всё равно выходит, но с `error_message = "медиа N/M"`.
8. Между постами пауза `vk_publish_delay_seconds` (default 5 c); в конце — инвалидация кэшей и чистка temp.

### 7.4 `task_store.py` — фоновые задачи

- In-memory dict + persist в `tasks.json` (atomic replace). Статусы: pending/processing/completed/error/cancelled/interrupted.
- Semaphore `MAX_CONCURRENT_TASKS` (default 3). Cancel через `asyncio.Event` (процессор проверяет в точках остановки).
- Cleanup-loop: раз в 15 мин удаляются задачи старше 1 ч.
- На рестарте `processing` → `interrupted`. Graceful shutdown (SIGTERM/SIGINT, отдельная ветка для Windows).

### 7.5 `scheduled.py` (роутер) — синхронизация и редактирование

- `_sync_with_vk`: кэш TTL 1 ч + lock (double-checked). Постранично читает `wall.get filter=postponed`:
  - новые VK-посты вставляются в БД (post_type парсится из хэштегов `#fursuit`/`#video`, source_urls — из строк `Source:`);
  - записи в БД со статусом scheduled, которых больше нет в VK → `deleted` (значит, пост уже вышел или удалён вручную);
  - подтягивает названия TG-каналов (кэш + 0.5 с пауза между запросами).
- Редактирование VK-поста: **пересоздание** — новый `wall.post` → `wall.delete` старого (принцип «лучше дубликат, чем потеря»); для уже опубликованных (время прошло) — `wall.edit`.
- Редактирование TG-поста: скачивает медиа запланированных сообщений → `DeleteScheduledMessagesRequest` → повторная отправка с новым текстом/временем; если сообщение уже опубликовано — ищет по id, затем по тексту, и редактирует `edit_message`. При сбое скачивания медиа правка прерывается (сохраняется оригинал).
- Удаление: `wall.delete` / `DeleteScheduledMessagesRequest` + статус `deleted` в БД.

### 7.6 `telegram_api.py` — Telethon-клиент

- Singleton-клиент + `asyncio.Lock` на все операции; session-файл `backend/data/telegram.session`; при `AuthKeyError` session-файл удаляется (нужен повторный вход).
- Рандомизированные device-параметры (модель ОС/версия приложения) при создании клиента.
- Прокси из `TG_PROXY` (socks5/http, нужен PySocks).
- Запланированные сообщения: прямой MTProto `GetScheduledHistoryRequest` — возвращает все сразу (комментарий «прямые MTProto запросы» из последнего коммита). Кэш 30 с на канал.
- `send_scheduled`: 0 медиа → send_message; 1 → send_file; 2+ → альбом (send_file списком). FloodWait ≤300 с — авто-ожидание.

### 7.7 Прочее

- `settings_store.py`: settings.json c merge-дефолтами; токен `enc:` (Fernet, ключ = SHA-256 от ENCRYPTION_KEY); bootstrap из env только пока нет файла.
- `supabase_client.py`: обёртка над sync-клиентом через `asyncio.to_thread`, глобальный lock, 3 ретрая с пересозданием клиента; `recreate_client()` для пересоздания после восстановления спящего проекта.
- `supabase_watchdog.py`: фоновый цикл (интервал `SUPABASE_WATCHDOG_INTERVAL`, 900 c) — health-check БД; при недоступности и заданном `SUPABASE_ACCESS_TOKEN` — статус через Supabase Management API и `POST /v1/projects/{ref}/restore` с поллингом до ACTIVE (таймаут `SUPABASE_RESTORE_TIMEOUT`, 600 c), затем пересоздание клиента БД. Состояние (restore: in_progress/ok/failed) отдаётся в `/api/health` → `supabase_watchdog`. Пока приложение запущено, цикл сам считается активностью для анти-паузы free-тарифа; когда ПК выключен, проект пингает GitHub-воркфлоу `.github/workflows/supabase-keepalive.yml` (секреты `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` в настройках репозитория).
- `vk_api.py`: POST на `api.vk.com/method/*`, ретраи (3, delays 1/4/16 c) на код 6 (too many requests) и httpx-ошибки.
- `url_shortener.py`: `utils.getShortLink` (при ошибке — исходный URL).
- `stats.py`: инфо о VK-аккаунте/группе (users.get/groups.getById), TG-аккаунт/канал + аватарки (base64 data-URI, кэш на процесс, сбрасывается при смене канала), счётчики по платформам, дата последнего поста и последнего «плотного» дня (≥3 постов).

---

## 8. Конфигурация

### 8.1 `.env` (инфраструктура)

| Переменная                                          | Описание                                                                         |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`                    | Supabase (service_role, обход RLS)                                                  |
| `SUPABASE_ACCESS_TOKEN`                                      | опционально; personal access token для авто-restore спящего проекта (watchdog) |
| `SUPABASE_WATCHDOG_INTERVAL`, `SUPABASE_RESTORE_TIMEOUT` | опционально; 900 c / 600 c                                                              |
| `ENCRYPTION_KEY`                                            | **обязательна**; ключ шифрования VK-токена          |
| `VK_TOKEN`, `VK_GROUP_ID`, `VK_OWNER_ID`                | bootstrap (только до первого сохранения настроек в UI) |
| `TG_API_ID`, `TG_API_HASH`                                | из my.telegram.org                                                                     |
| `TG_PROXY`                                                  | socks5://… (опционально, анти-DPI)                                       |
| `HOST`                                                      | default 127.0.0.1; 0.0.0.0 — осознанно (API без auth)                       |
| `ALLOWED_ORIGINS`                                           | CORS, default localhost:5173                                                             |
| `LOG_LEVEL`, `MAX_TEMP_SIZE_GB`, `MAX_CONCURRENT_TASKS` | технические                                                                   |

### 8.2 Константы (`config.py`)

`VK_API_VERSION=5.199`; `VK_MAX_SLOT_ATTEMPTS=5`; `VK_SLOT_DELAY_SECONDS=1800`; `VK_API_MAX_RETRIES=3` (delays 1/4/16); `EXTRACT_MAX_URLS=25`; `MAX_MEDIA_PER_POST=10` (совпадает с лимитом VK); `MEDIA_DEGRADED_THRESHOLD=3` за окно `MEDIA_DEGRADED_WINDOW=300` c; `TASK_CLEANUP_INTERVAL=900` c; `TASK_MAX_AGE_SECONDS=3600` c; TG: ретраи 3 (delays 1/4/16), FloodWait-порог 300 с, кэш scheduled 30 с; sync-кэш 3600 с; кэш слотов 300 c; чистка temp 24 ч; watchdog: интервал 900 c, таймаут restore 600 c.

### 8.3 `settings.json` (операционные, редактируются через UI `/settings`)

`vk_token`, `vk_group_id`, `vk_owner_id`, `time_slots` (default `["10:00","15:00","20:00"]`), `timezone` (default Europe/Moscow), `max_download_workers` (3), `vk_publish_delay_seconds` (5), `ytdlp_timeout_seconds` (30), `max_photo_size_mb` (50), `max_video_size_mb` (500), `cookies_uploaded_at`, `tg_channel_id`, `tg_channel_title`.

---

## 9. Frontend

### 9.1 Страницы и маршруты (`App.tsx`)

| Маршрут      | Страница | Содержимое                                                                                                                                                                                                                              |
| ------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/create/:type`   | CreatePost       | 3-шаговый мастер;`:type` ∈ art/fursuit/video (фиксированный набор в сайдбаре)                                                                                                                          |
| `/posts/calendar` | Calendar         | месячная сетка с цветовой кодировкой по типам; клик по дню → DayDetail (список постов дня, редактирование текста/времени/медиа, удаление) |
| `/posts/no-media` | NoMedia          | посты без медиа (ссылка на пост VK, удаление)                                                                                                                                                                    |
| `/settings`       | Settings         | VK-токен/group/owner + verify, слоты, таймзона, лимиты, cookies; секция TelegramSettings: статус, вход по телефону (код/2FA/resend), выбор канала                                 |

Тёмная тема (класс `dark` на корне). Адаптив: сайдбар на десктопе, мобильные нижние табы + drawer. Шапка `StatsHeader` — счётчики и аккаунты (обновление /stats раз в 30 с).

### 9.2 Мастер создания поста (CreatePost)

- **Шаг 1 (Step1Sources):** ввод до 25 URL (дедуп-предупреждение по `already_used`), кнопка «Извлечь» → превью всех медиа с чекбоксами; загрузка локальных файлов (`POST /upload/media`, превью через возвращённый относительный URL); выбор платформы: VK / Telegram / Обе; группировка медиа в посты (до 10 в посте).
- **Шаг 2 (Step2Schedule):** дата начала, временные слоты (из настроек по умолчанию), таймзона → `POST /preview` (несёт `session_key` для переиспользования кэша слотов) → посты с назначенным временем.
- **Шаг 3 (Step3Preview):** карточки постов (время, текст, медиа), правка перед публикацией → `POST /publish` → поллинг `GET /task/{id}` каждые 2 c (стадии: downloading_media → creating_posts → done, счётчик и ретраи), кнопка отмены.

### 9.3 API-клиент (`api/client.ts`)

- axios `baseURL: "/api"`, обычный таймаут 120 c, отдельный клиент для `/extract` — 600 c.
- Все запросы — хуки TanStack Query (useStats, useExtract, usePreview, usePublish, useTaskStatus, useScheduledPosts, useCalendar, useNoMediaPosts, useUpdatePost, useDeletePost, useTelegram* и т. д.) с инвалидацией кэша после мутаций.
- `extractApiError()` — вытаскивает человекочитаемые ошибки из `{error|detail}` (в т.ч. массивы).

---

## 10. Безопасность (что уже реализовано)

- **Нет аутентификации API** — приложение однопользовательское, backend слушает 127.0.0.1; `HOST=0.0.0.0` — осознанный риск.
- SSRF-фильтр на все внешние URL (extract + download): только публичные http/https-хосты.
- Path-traversal защита: раздача uploads, temp-пути, id медиа от клиента.
- VK-токен шифруется AES-256 (Fernet) в settings.json; в API отдаётся только маска.
- RLS в Supabase: anon запрещён, доступ только service_role.
- Cookies загружаются как файл, хранятся локально.
- `SUPABASE_ACCESS_TOKEN` (если задан) даёт доступ ко всем проектам аккаунта Supabase — хранится только в `.env`.
- CORS ограничен ALLOWED_ORIGINS.

---

## 11. Ограничения и «грабли» (важно учитывать при проектировании фич)

1. **Типы постов зашиты жёстко:** CHECK-constraint в PostgreSQL (`art|fursuit|video`), маршруты `/create/:type`, цвета/лейблы в UI, хэштег `@xkemonox` захардкожен в `scheduler.build_post_text`. Новые типы = миграция БД + правки бэка и фронта.
2. **Одна VK-группа, один TG-аккаунт и один канал** — настройки глобальные (settings.json), не мультиаккаунтные.
3. **Нет очереди публикации на своей стороне** — приложение создаёт отложенные посты сразу в VK/TG; «изменить время» = пересоздание поста (VK) или delete+re-send (TG).
4. **`both`-платформа разделяется на 2 записи в БД** — редактирование/удаление идёт по-отдельности (для TG — через `/scheduled/by-id/{uuid}`).
5. Задачи публикации — in-memory (переживают рестарт как interrupted, но не возобновляются).
6. Редактирование TG-поста перескачивает медиа и пересоздаёт сообщения — тяжёлая операция; при сбое скачивания правка отменяется ради сохранения оригинала.
7. Зависимость от внешних CLI (yt-dlp/gallery-dl): экстракторы сайтов ломаются регулярно; на старте идёт авто-обновление (uv → pip fallback); есть degraded-мониторинг, но нет авто-восстановления.
8. VK `wall.post` не редактирует отложенный пост с новым временем — только пересоздание (так делает и текущий код).
9. TG-видео ≤50 МБ (лимит Telegram), иначе — деградация качества через yt-dlp; в VK до `max_video_size_mb` (500).
10. Асинхронные гонки смягчены локами: глобальный twitter-lock, `_client_lock` Telethon, глобальный lock Supabase-клиента, sync-lock.
11. Фронтенд-прокси `/api` → 127.0.0.1:8000 только в dev (vite); production-сборки как таковой не эксплуатируется (проект локальный).
12. `has_media=false`-посты (в т.ч. ошибочные без медиа) копятся в БД до следующего рестарта (startup-cleanup удаляет deleted/error).

---

## 12. Запуск и разработка

```bash
# 1. .env из .env.example: SUPABASE_URL/KEY, ENCRYPTION_KEY, TG_API_ID/HASH, (bootstrap VK)
# 2. SQL-миграции в Supabase SQL Editor:
#    backend/database/create_tables.sql, затем backend/database/add_tg_columns.sql
npm install        # зависимости фронта + concurrently
npm run setup      # pip install -r backend/requirements.txt + npm install (frontend)
npm start          # backend (:8000) + ожидание готовности + frontend (:5173)
# Frontend: http://localhost:5173 · Swagger: http://localhost:8000/docs
```

- `npm start` = concurrently: `python backend/startup.py` (обновляет yt-dlp/gallery-dl в фоне, подключает static-ffmpeg, поднимает uvicorn) + `node wait-for-backend.js && vite`.
- Python-зависимости: см. `backend/requirements.txt` (fastapi, uvicorn, yt-dlp, gallery-dl, static-ffmpeg, httpx, supabase, telethon, structlog, cryptography, pytz, …).

### Соглашения кода

- Комментарии и пользовательские тексты — на русском; логи — structlog с dotted-событиями (`publish.vk_post_created`, `sync.inserted` …).
- Бэкенд: модули верхнего уровня (импорты `from services... import`, без пакета-префикса), async/await везде, retry-обёртки на всех внешних вызовах.
- Фронтенд: функциональные компоненты + хуки, все данные через TanStack Query, UI-примитивы shadcn в `components/ui`.

---

## 13. Куда вживлять новые функции (ориентир)

| Хотите…                                                      | Трогать                                                                                                                                                                           |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Новый тип поста / иная логика текста   | `scheduler.build_post_text`, DB CHECK, `publish.py` (pattern-валидация), сайдбар `App.tsx`, страницы CreatePost/Calendar/NoMedia (лейблы/цвета) |
| Новая платформа-источник медиа           | `media_downloader.py` (extract/download цепочки, доменные спец-обработки как у Twitter)                                                                |
| Мультиканальность TG / мультигруппы VK | `settings_store.py`, `publisher.py`, `scheduled.py`, `telegram_api.py`, Settings UI                                                                                              |
| Новая кнопка/действие над постами      | `routers/scheduled.py` + `api/client.ts` + `Calendar/DayDetail.tsx`                                                                                                                |
| Фоновые регламентные работы                | `task_store.py` (паттерн фоновых задач), `main.py` lifespan                                                                                                       |
| Новые настройки                                       | `models/schemas.py` (SettingsUpdate/Response), `settings_store.DEFAULT_SETTINGS`, `Settings/index.tsx`                                                                             |
| Статистика/дашборд                                 | `routers/stats.py`, `StatsHeader.tsx`                                                                                                                                                |

---

*Конец документа.*
