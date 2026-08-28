-- 管理画面向け：操作の監査ログと、ページビュー計測(アクセス数の可視化用)。
-- 認証はGoogleログイン＋ADMIN_EMAILSシークレットの許可リストで行うため、
-- ここでは新しい権限テーブルは作らない(既存のusers.email/email_verified_atで足りる)。

CREATE TABLE admin_audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_email TEXT    NOT NULL,
  action      TEXT    NOT NULL,
  target_id   TEXT,
  detail      TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX idx_admin_audit_created ON admin_audit_log(created_at DESC);

-- public/配下はCloudflareの静的アセットバインディングが直接返すため、Workerの
-- fetchハンドラだけではページアクセスを捕捉できない。クライアント側の軽量ビーコン
-- (public/track.js)からの自己申告を溜めるだけの簡易テーブル。
CREATE TABLE page_views (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  path       TEXT    NOT NULL,
  user_id    TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
CREATE INDEX idx_page_views_created ON page_views(created_at DESC);
CREATE INDEX idx_page_views_path ON page_views(path, created_at DESC);
