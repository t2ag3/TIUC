-- キャラゲットを「行動のたびに自動抽選」から「行動でキャラポイントを貯め、
-- 貯めたポイントでガチャを回す」方式に変更する(ユーザー指示、2026-08-29)。
-- ドロップ機構自体(character_drops→user_charactersの自動反映)は変更せず、
-- 「いつdropStatement()を呼ぶか」だけをアプリ側からガチャエンドポイントに移す。
--
-- point_eventsからxp_events/characters.xp_totalを自動更新するtrg_point_event_to_xp
-- (migrations/0009)と全く同じパターンで、character_pointsも自動更新する。
-- 対象はルーティン行動4種のみ(post_submit/judgment/correction_propose/vote)。
-- レベルアップ・クエスト達成・修正確定ボーナスの自動ドロップは変更しない(対象外)。

ALTER TABLE characters ADD COLUMN character_points INTEGER NOT NULL DEFAULT 0;

CREATE TRIGGER trg_point_event_to_charpoints
AFTER INSERT ON point_events
WHEN NEW.kind IN ('post_submit','judgment','correction_propose','vote')
BEGIN
  INSERT OR IGNORE INTO characters (user_id, created_at, updated_at)
  VALUES (NEW.user_id, NEW.created_at, NEW.created_at);

  UPDATE characters SET character_points = character_points + 1
   WHERE user_id = NEW.user_id;
END;
