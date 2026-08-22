-- 投稿自体への「いいね」(新規)。judgments/corrections/votes とは別の、
-- 誰でも押せる軽い好意シグナル。ポイント付与はしない(水増し防止・rule10)。
CREATE TABLE post_likes (
  id         TEXT    PRIMARY KEY,
  post_id    TEXT    NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (post_id, user_id)
) STRICT;
CREATE INDEX idx_post_likes_post ON post_likes(post_id);
