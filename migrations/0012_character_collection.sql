-- 相棒(1体育成)システムをキャラ収集ガチャに置き換える。
-- 絵は当面 mon-placeholder.svg を種族間で共用し、カード背景色でレア度を表現する
-- (lp_mock.html自身が同じ絵を4カードで使い回している方式に合わせる。個別絵は後回し)。

CREATE TABLE species (
  id          TEXT PRIMARY KEY,
  name_key    TEXT NOT NULL,
  rarity      INTEGER NOT NULL CHECK (rarity BETWEEN 1 AND 4),
  sort_order  INTEGER NOT NULL DEFAULT 0
) STRICT;

-- ドロップの事実ログ。source_key で冪等性を担保する(xp_events の 'point:'||id パターンを踏襲)。
CREATE TABLE character_drops (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  species_id  TEXT NOT NULL REFERENCES species(id),
  source_key  TEXT UNIQUE,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX idx_character_drops_user ON character_drops(user_id, created_at DESC);

-- 所持数の集計テーブル(表示用)。
CREATE TABLE user_characters (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  species_id  TEXT NOT NULL REFERENCES species(id),
  count       INTEGER NOT NULL DEFAULT 0,
  first_at    INTEGER,
  PRIMARY KEY (user_id, species_id)
) STRICT;

-- レベルアップ検知用。/api/game/character 取得のたびに現レベルと比較し、
-- 上がっていればレア確定ドロップを1回だけ発行する。
ALTER TABLE characters ADD COLUMN last_level INTEGER NOT NULL DEFAULT 1;

INSERT INTO species (id, name_key, rarity, sort_order) VALUES
  ('sparrow',    'sparrow',    1, 1),
  ('white_eye',  'white_eye',  2, 2),
  ('kingfisher', 'kingfisher', 3, 3),
  ('mystery',    'mystery',    4, 4);

-- character_drops への実際のINSERT成功時だけ所持数を+1する(ON CONFLICT DO NOTHINGで
-- 弾かれた重複source_keyのリトライではトリガーが発火しないため、二重加算しない)。
-- xp_events用の trg_point_event_to_xp と同じ設計思想。
CREATE TRIGGER trg_character_drop_to_inventory
AFTER INSERT ON character_drops
BEGIN
  INSERT INTO user_characters (user_id, species_id, count, first_at)
  VALUES (NEW.user_id, NEW.species_id, 1, NEW.created_at)
  ON CONFLICT(user_id, species_id) DO UPDATE SET count = count + 1;
END;
