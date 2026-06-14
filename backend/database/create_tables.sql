-- Таблица used_urls — хранит все использованные URL для дедупликации
CREATE TABLE IF NOT EXISTS used_urls (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url          TEXT NOT NULL,
  normalized   TEXT NOT NULL UNIQUE,
  vk_post_id   BIGINT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Таблица scheduled_posts — локальный учёт постов
CREATE TABLE IF NOT EXISTS scheduled_posts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vk_post_id        BIGINT UNIQUE,
  post_type         TEXT NOT NULL CHECK (post_type IN ('art', 'fursuit', 'video')),
  scheduled_at      TIMESTAMPTZ NOT NULL,
  source_urls       TEXT[] NOT NULL,
  media_attachments JSONB,
  post_text         TEXT,
  has_media         BOOLEAN DEFAULT TRUE,
  status            TEXT DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled', 'published', 'error', 'deleted')),
  error_message     TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- RLS — запретить anon, разрешить service_role
ALTER TABLE used_urls ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_posts ENABLE ROW LEVEL SECURITY;

-- Политики для service_role (полный доступ)
CREATE POLICY "service_role_all_used_urls" ON used_urls
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_all_scheduled_posts" ON scheduled_posts
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
