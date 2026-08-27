-- 「ヘンな訳文を撮影」モードで追加される自由記載欄。situationと同じ性質のnullable TEXT。
-- 「外国語の写っている掲示物を撮影」モードでは常にNULLのまま。
ALTER TABLE posts ADD COLUMN what_it_says TEXT;
ALTER TABLE posts ADD COLUMN whats_weird TEXT;
