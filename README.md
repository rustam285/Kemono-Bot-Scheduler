# VK Post Scheduler

Веб-приложение для автоматизации создания отложенных постов в VK-группе. Загружает медиа с Twitter/X, Reddit, YouTube, Bilibili и других платформ, группирует в посты и публикует по расписанию.

## Стек

- **Backend:** Python 3.11+, FastAPI, Supabase, VK API
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Медиа:** yt-dlp, gallery-dl, httpx

## Быстрый старт

### Требования

- Python 3.11+
- Node.js 18+
- npm 9+

### Установка

```bash
git clone https://github.com/rustam285/VK-Kemono-Bot-Scheduler.git
cd VK-Kemono-Bot-Scheduler

# Создать .env из примера и заполнить
cp .env.example .env
# Открыть .env и вписать SUPABASE_URL, SUPABASE_SERVICE_KEY, ENCRYPTION_KEY, VK_TOKEN, VK_GROUP_ID, VK_OWNER_ID

# Установить зависимости
npm run setup

# Запустить
npm start
```

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:8000/docs

### Альтернативный запуск (без npm)

```bash
# Windows
start.bat

# Linux / macOS
chmod +x start.sh && ./start.sh
```

## Конфигурация

### .env (инфраструктурные параметры)

| Переменная | Описание |
|------------|----------|
| `SUPABASE_URL` | URL проекта Supabase |
| `SUPABASE_SERVICE_KEY` | service_role ключ Supabase |
| `ENCRYPTION_KEY` | Ключ шифрования VK токена (AES-256). Генерация: `python -c "from services.crypto import generate_key; print(generate_key())"` |
| `VK_TOKEN` | Токен VK (bootstrap, для первого запуска) |
| `VK_GROUP_ID` | ID группы VK |
| `VK_OWNER_ID` | ID аккаунта модератора |
| `LOG_LEVEL` | Уровень логирования (DEBUG/INFO/WARNING/ERROR) |
| `MAX_TEMP_SIZE_GB` | Макс. размер временных файлов (ГБ) |
| `MAX_CONCURRENT_TASKS` | Макс. одновременных задач публикации |

### settings.json (через UI на /settings)

Все операционные настройки (токен VK, таймзона, слоты, задержки) управляются через страницу `/settings` в интерфейсе.

## Функции

- **Извлечение медиа** из URL (YouTube, Twitter/X, Reddit, Bilibili, прямые ссылки)
- **3-шаговый мастер** создания постов (источники → планирование → предпросмотр)
- **Объединение** нескольких источников в один пост
- **Календарь** с цветной кодировкой типов постов (art/fursuit/video)
- **Автоматическое распределение** по временным слотам
- **Cookies** для авторизованных источников (Twitter/X)
- **Дедупликация** URL (предупреждение о дублях)
- **Retry** при ошибках загрузки (автоматическая повторная попытка)
- **Мониторинг** состояния парсеров (yt-dlp/gallery-dl degradation)
- **Шифрование** VK токена (AES-256, хранится как `enc:...` в settings.json)
- **Health check** с проверкой Supabase (`GET /api/health`)
- **Persistence** задач — восстанавливаются при рестарте сервера
- **Graceful shutdown** — SIGTERM/SIGINT сохраняет данные

## Структура проекта

```
├── backend/
│   ├── main.py              # FastAPI app
│   ├── startup.py           # Автообновление yt-dlp + запуск uvicorn
│   ├── config.py            # Конфигурация
│   ├── routers/             # API endpoints
│   ├── services/            # Бизнес-логика
│   └── models/              # Pydantic модели
├── frontend/
│   └── src/
│       ├── pages/           # Страницы (CreatePost, Calendar, NoMedia, Settings)
│       ├── components/      # UI компоненты (shadcn/ui)
│       └── api/             # API клиент (TanStack Query)
├── .env.example
├── package.json
└── start.bat / start.sh
```

## Лицензия

MIT
