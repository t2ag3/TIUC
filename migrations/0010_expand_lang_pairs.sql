-- posts.lang_pair の CHECK 制約に ja-fr / ja-es / ja-hi を追加する。
-- (ダミーデータ投入・地図の言語フィルタ拡張のため。judge.html/curate.html の
--  言語選択ボタンは英中韓のみのまま変更しない = 実際のレビューは従来3言語のみ)
--
-- SQLite は CHECK 制約を直接 ALTER できないため、テーブルを作り直す([流用] 0006と同じ手法)。
-- posts は judgments/corrections/quality_checks から ON DELETE CASCADE、
-- votes は corrections から ON DELETE CASCADE、point_events は posts から
-- ON DELETE SET NULL で参照されている。DROP TABLE posts は(トランザクション内では
-- PRAGMA foreign_keys=OFF が効かないため)これらを巻き込んで消してしまうので、
-- 一時テーブルに退避してから作り直し、直後に元の行を復元する。

CREATE TABLE _bak_judgments AS SELECT * FROM judgments;
CREATE TABLE _bak_corrections AS SELECT * FROM corrections;
CREATE TABLE _bak_votes AS SELECT * FROM votes;
CREATE TABLE _bak_quality_checks AS SELECT * FROM quality_checks;
CREATE TABLE _bak_point_events_pid AS SELECT id, post_id FROM point_events WHERE post_id IS NOT NULL;

DROP VIEW public_mesh_stats;

CREATE TABLE posts_new (
  id              TEXT    PRIMARY KEY,
  submitter_id    TEXT    NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  observed_at     INTEGER,

  lat             REAL    NOT NULL CHECK (lat BETWEEN 20  AND 46),
  lng             REAL    NOT NULL CHECK (lng BETWEEN 122 AND 154),
  loc_source      TEXT    NOT NULL
                          CHECK (loc_source IN ('exif','geolocation','manual')),
  loc_accuracy_m  REAL,
  loc_conflict    INTEGER NOT NULL DEFAULT 0 CHECK (loc_conflict IN (0,1)),

  mesh3           TEXT    NOT NULL,
  mesh4           TEXT    NOT NULL,
  mesh5           TEXT    NOT NULL,

  -- 対象言語ペア(拡張: 日→英/中/韓/仏/西/ヒンディー。ダミーデータ・地図表示専用の追加で、
  -- ②③の実レビューUIは従来通り英中韓のみ)
  lang_pair       TEXT    NOT NULL CHECK (lang_pair IN ('ja-en','ja-zh','ja-ko','ja-fr','ja-es','ja-hi')),
  place_kind      TEXT    NOT NULL DEFAULT 'unknown'
                          CHECK (place_kind IN ('menu','sign','notice','other','unknown')),
  flagged         INTEGER NOT NULL DEFAULT 0 CHECK (flagged IN (0,1)),

  original_text   TEXT,
  translated_text TEXT,
  situation       TEXT,

  src_image_key   TEXT    NOT NULL,
  src_thumb_key   TEXT    NOT NULL,
  tgt_image_key   TEXT,
  tgt_thumb_key   TEXT,
  image_bytes     INTEGER,

  ai_verdict      TEXT    CHECK (ai_verdict IN ('pass','review','reject')),
  ai_score        REAL    CHECK (ai_score BETWEEN 0 AND 1),
  ai_model        TEXT,
  ai_raw          TEXT,
  ai_at           INTEGER,

  status          TEXT    NOT NULL DEFAULT 'pending_judgment'
                          CHECK (status IN ('pending_judgment','needs_fix','looks_ok',
                                            'confirmed','adopted')),
  review_priority INTEGER NOT NULL DEFAULT 100,

  turnstile_ok    INTEGER NOT NULL DEFAULT 0 CHECK (turnstile_ok IN (0,1)),
  client_hash     TEXT
) STRICT;

INSERT INTO posts_new (
  id, submitter_id, created_at, observed_at, lat, lng, loc_source, loc_accuracy_m, loc_conflict,
  mesh3, mesh4, mesh5, lang_pair, place_kind, flagged, original_text, translated_text, situation,
  src_image_key, src_thumb_key, tgt_image_key, tgt_thumb_key, image_bytes,
  ai_verdict, ai_score, ai_model, ai_raw, ai_at, status, review_priority, turnstile_ok, client_hash
)
SELECT
  id, submitter_id, created_at, observed_at, lat, lng, loc_source, loc_accuracy_m, loc_conflict,
  mesh3, mesh4, mesh5, lang_pair, place_kind, flagged, original_text, translated_text, situation,
  src_image_key, src_thumb_key, tgt_image_key, tgt_thumb_key, image_bytes,
  ai_verdict, ai_score, ai_model, ai_raw, ai_at, status, review_priority, turnstile_ok, client_hash
FROM posts;

DROP TABLE posts;
ALTER TABLE posts_new RENAME TO posts;

CREATE INDEX idx_posts_queue     ON posts(status, review_priority, created_at);
CREATE INDEX idx_posts_mesh3     ON posts(mesh3, status);
CREATE INDEX idx_posts_dupe      ON posts(mesh5, lang_pair, created_at);
CREATE INDEX idx_posts_bbox      ON posts(lat, lng);
CREATE INDEX idx_posts_submitter ON posts(submitter_id, created_at DESC);
CREATE INDEX idx_posts_thumb_key ON posts(src_thumb_key);

CREATE VIEW public_mesh_stats AS
SELECT
  mesh3,
  COUNT(*)                                             AS post_count,
  COUNT(*) FILTER (WHERE status = 'needs_fix')         AS needs_fix_count,
  COUNT(*) FILTER (WHERE status = 'confirmed')         AS confirmed_count,
  COUNT(*) FILTER (WHERE status = 'adopted')           AS adopted_count,
  MAX(created_at)                                      AS last_post_at
FROM posts
GROUP BY mesh3;

-- DROP TABLE posts が巻き込んで消した行を復元する。posts_new は元の id を
-- そのまま引き継いでいるので、この時点で外部キーは作り直したテーブルに解決する。
INSERT INTO judgments      SELECT * FROM _bak_judgments;
INSERT INTO corrections    SELECT * FROM _bak_corrections;
INSERT INTO votes          SELECT * FROM _bak_votes;
INSERT INTO quality_checks SELECT * FROM _bak_quality_checks;

UPDATE point_events
   SET post_id = (SELECT post_id FROM _bak_point_events_pid WHERE _bak_point_events_pid.id = point_events.id)
 WHERE id IN (SELECT id FROM _bak_point_events_pid);

DROP TABLE _bak_judgments;
DROP TABLE _bak_corrections;
DROP TABLE _bak_votes;
DROP TABLE _bak_quality_checks;
DROP TABLE _bak_point_events_pid;
