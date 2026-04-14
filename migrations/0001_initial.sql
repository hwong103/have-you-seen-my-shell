CREATE TABLE IF NOT EXISTS story_bible (
  id INTEGER PRIMARY KEY DEFAULT 1,
  content TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_number INTEGER NOT NULL UNIQUE,
  text TEXT NOT NULL,
  scene_description TEXT NOT NULL,
  image_url TEXT,
  image_status TEXT NOT NULL DEFAULT 'pending',
  word_a TEXT NOT NULL,
  word_b TEXT NOT NULL,
  word_c TEXT NOT NULL,
  chosen_word TEXT,
  chosen_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO story_bible (id, content)
VALUES (1, '{}')
ON CONFLICT(id) DO NOTHING;
