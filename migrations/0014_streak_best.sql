-- 過去最長ストリーク。streak_count は途切れると1にリセットされるため、
-- 「◯日連続を一度でも達成した」というマイルストーン実績の判定には使えない。
-- 実績判定は streak_best（ハイウォーターマーク、途切れても減らない）で行う。
ALTER TABLE users ADD COLUMN streak_best INTEGER NOT NULL DEFAULT 0;
UPDATE users SET streak_best = streak_count WHERE streak_count > streak_best;
