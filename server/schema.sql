-- База объяснений umi (Cloudflare D1 / SQLite).
-- Объяснения не персональные: на форму глагола хранится до AI_MAX_VARIANTS вариантов
-- «объяснение + 3 задания»; дальше ответы идут из базы без запросов к модели.

CREATE TABLE IF NOT EXISTS ai_content (
  form_id     TEXT    NOT NULL,              -- id формы из VERB_RULES (напр. causative_masu_negative_past)
  variant     INTEGER NOT NULL,              -- 0..AI_MAX_VARIANTS-1
  prompt_v    INTEGER NOT NULL,              -- версия промпта: новая версия = новые варианты
  status      TEXT    NOT NULL,              -- pending (идёт генерация) | ok | hidden (снят после жалоб)
  body        TEXT,                          -- JSON для приложения (см. server/src/explain.js → assemble)
  model       TEXT,
  tokens_in   INTEGER DEFAULT 0,
  tokens_out  INTEGER DEFAULT 0,
  cost_usd    REAL    DEFAULT 0,
  served      INTEGER DEFAULT 0,             -- сколько раз отдан
  reports     INTEGER DEFAULT 0,             -- жалобы «ошибка в объяснении»
  created_at  INTEGER NOT NULL,              -- unix ms
  PRIMARY KEY (form_id, prompt_v, variant)
);

-- лимит генераций на пользователя в сутки (отдача из кэша не ограничена)
CREATE TABLE IF NOT EXISTS ai_usage (
  day         TEXT    NOT NULL,              -- YYYY-MM-DD (UTC)
  user_id     TEXT    NOT NULL,              -- Telegram user id из проверенного initData
  generations INTEGER NOT NULL DEFAULT 0,
  requests    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, user_id)
);

-- суточный расход на модель: при превышении AI_DAILY_BUDGET_USD новые генерации не запускаются
CREATE TABLE IF NOT EXISTS ai_budget (
  day      TEXT PRIMARY KEY,
  cost_usd REAL NOT NULL DEFAULT 0,
  calls    INTEGER NOT NULL DEFAULT 0
);

-- жалобы на объяснение: что проверить и поправить
CREATE TABLE IF NOT EXISTS ai_reports (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  form_id    TEXT    NOT NULL,
  prompt_v   INTEGER NOT NULL,
  variant    INTEGER NOT NULL,
  user_id    TEXT    NOT NULL,
  note       TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_reports_form ON ai_reports (form_id, prompt_v, variant);
