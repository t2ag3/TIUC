-- 合成メカニクス（★1→★2は2枚、★2→★3は3枚）を実装するため、所持数をレア度ティアごとに
-- 分けて管理する必要がある（同じ種族を複数ティアで同時に持てる：★1を2体持ちつつ、
-- 既に合成した★2を1体持っている、等）。SQLiteは主キー変更にテーブル再作成が必要なため、
-- character_drops / user_characters を作り直す。
-- 本番ユーザーデータはテストのみで破壊的変更OKとの指示（2026-08-27、既存の指示を踏襲）のもと実施。

DROP TRIGGER trg_character_drop_to_inventory;
DROP TABLE user_characters;
DROP TABLE character_drops;

CREATE TABLE character_drops (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  species_id  TEXT NOT NULL REFERENCES species(id),
  rarity      INTEGER NOT NULL,
  source_key  TEXT UNIQUE,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX idx_character_drops_user ON character_drops(user_id, created_at DESC);

CREATE TABLE user_characters (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  species_id  TEXT NOT NULL REFERENCES species(id),
  rarity      INTEGER NOT NULL,
  count       INTEGER NOT NULL DEFAULT 0,
  first_at    INTEGER,
  PRIMARY KEY (user_id, species_id, rarity)
) STRICT;

-- character_drops への実際のINSERT成功時だけ、該当ティアの所持数を+1する。
CREATE TRIGGER trg_character_drop_to_inventory
AFTER INSERT ON character_drops
BEGIN
  INSERT INTO user_characters (user_id, species_id, rarity, count, first_at)
  VALUES (NEW.user_id, NEW.species_id, NEW.rarity, 1, NEW.created_at)
  ON CONFLICT(user_id, species_id, rarity) DO UPDATE SET count = count + 1;
END;
