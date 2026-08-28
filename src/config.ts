// 投稿で現在明示的に扱っている言語ペア。
// 英・中・韓以外はUI上では「その他」としてまとめて表示する。
export const LANG_PAIRS = new Set([
  "ja-en",
  "ja-zh",
  "ja-ko",
  "ja-fr",
  "ja-es",
  "ja-hi",
]);

// 言語ペアとして許可する形式。
// 「その他」の言語を追加してもconfigへの追記を必須にしない。
export const LANG_PAIR_RE = /^ja-[a-z]{2,3}$/;

export function isValidLangPair(value: string): boolean {
  return LANG_PAIR_RE.test(value) && value !== "ja-ja";
}

// 現時点では既存レビューUIが直接対応している3言語。
// 「その他」をレビュー可能にする変更はreview.ts確認後に行う。
export const REVIEWABLE_LANG_PAIRS = new Set([
  "ja-en",
  "ja-zh",
  "ja-ko",
]);
export const PLACE_KINDS = new Set(["menu", "sign", "notice", "other"]);
export const POST_PLACE_KINDS = new Set([...PLACE_KINDS, "unknown"]);
export const LOC_SOURCES = new Set(["exif", "geolocation", "manual"]);
export const MAP_LEVELS = new Set(["mesh3", "mesh4", "mesh5"]);
// 公開マップのステータスフィルタで選べる値(auto_rejectedは常に除外・選択不可)。
export const MAP_POST_STATUSES = new Set([
  "pending_judgment",
  "needs_fix",
  "looks_ok",
  "confirmed",
  "adopted",
]);
export const SUBMODES = new Set(["quality", "judgment", "correction"]);
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export const POST_HOURLY_LIMIT = 30;
export const JUDGE_HOURLY_LIMIT = 60;
export const CORRECT_HOURLY_LIMIT = 30;
export const VOTE_HOURLY_LIMIT = 60;
export const LIKE_HOURLY_LIMIT = 120;

export const AUTH_SESSION_HOURS = 24 * 30;
export const OAUTH_STATE_TTL_SEC = 300;

// ②違和感チェック・③修正案投票 とも、この人数の判定/票が集まった時点で
// 多数決で自動的にステータスを遷移させる。
// MVPはこの固定しきい値で「割れたら人を増やす」設計だけ先に用意する。
export const JUDGMENT_THRESHOLD = 2;
export const VOTE_THRESHOLD = 2;

// ポイント経済: 投稿は小さく、確定・採用時に大きく
export const POINTS_POST_SUBMIT = 2;
export const POINTS_JUDGMENT = 1;
export const POINTS_CORRECTION_PROPOSE = 3;
export const POINTS_CORRECTION_CONFIRM_BONUS = 15;
export const POINTS_VOTE = 1;
