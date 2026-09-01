import type { AppEnv } from "./types";

// =====================================================================
// 撮影写真のAI処理(rule4: AIは足切り・下書きのみ。正誤判定は人間)。
// 2026-09-02改定(ユーザー指示)：性質の異なる2つの処理を分離した。
//   ①extractSignInfo … 文字の有無・言語・表記種別の推測。クライアント起動の
//     プレビュー(/api/posts/analyze)用。不適切判定は含まない。
//   ②classifySensitivePhoto … 不適切画像か否かの判定のみ。createPostから
//     ctx.waitUntil()経由でバックグラウンド実行する専用で、クライアントに
//     公開するエンドポイントは持たない。
// どちらもAI呼び出し自体が失敗した場合はfail-open(投稿を止めない。
// CLAUDE.mdの「継続率を守る・詰まらせない」方針)。
// =====================================================================

const VISION_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";

// --- ①OCR的な下書き(文字の有無・言語・表記種別) --------------------------

const EXTRACT_PROMPT = `あなたは市民参加型アプリの写真読み取り補助です。次の写真について、以下のJSON形式のみで回答してください。前後に説明文を付けないでください。

{"has_text": true または false, "language": "en" または "zh" または "ko" または "other" または "none", "sign_type": "menu" または "sign" または "notice" または "other" または "unknown"}

- has_text: 写真に文字(外国語・日本語問わず)が写っていればtrue、写っていなければfalse。
- language: 写真に写っている外国語(日本語以外)の表記が、英語ならen、中国語ならzh、韓国語ならko、それ以外の言語ならother、外国語の文字が見当たらなければnone。
- sign_type: その表記がメニューならmenu、看板ならsign、注意書き・掲示ならnotice、それ以外ならother、判断できなければunknown。`;

export type SignInfo = {
  hasText: boolean;
  langPairGuess: string | null;
  placeKindGuess: string | null;
};

const LANG_MAP: Record<string, string> = {
  en: "ja-en",
  zh: "ja-zh",
  ko: "ja-ko",
};
const PLACE_KINDS = new Set(["menu", "sign", "notice", "other"]);

function extractJson(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  const text = String(raw ?? "");
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("JSONが見つかりません");
  return JSON.parse(match[0]);
}

export async function extractSignInfo(
  env: AppEnv,
  imageBytes: Uint8Array,
): Promise<SignInfo> {
  try {
    const result = await env.AI.run(VISION_MODEL, {
      image: Array.from(imageBytes),
      prompt: EXTRACT_PROMPT,
      max_tokens: 256,
    });
    const payload =
      typeof result === "string"
        ? result
        : ((result as { response?: unknown })?.response ?? result);
    const parsed = extractJson(payload);
    const language = String(parsed.language || "");
    const signType = String(parsed.sign_type || "");
    return {
      hasText: parsed.has_text === true,
      langPairGuess: LANG_MAP[language] ?? null,
      placeKindGuess: PLACE_KINDS.has(signType) ? signType : null,
    };
  } catch (e) {
    console.error("extractSignInfo failed", e);
    return { hasText: true, langPairGuess: null, placeKindGuess: null };
  }
}

// --- ②センシティブ画像判定(サーバ側専用、非公開) --------------------------

const SENSITIVE_PROMPT = `あなたは市民参加型アプリの写真フィルタです。次の写真について、以下のJSON形式のみで回答してください。前後に説明文を付けないでください。

{"inappropriate": true または false, "confidence": 0から1の数値}

- inappropriate: 性的な内容、グロテスクな内容、人の顔だけが大きく写っていて周囲に文字や看板が写っていない写真、性器が写っている写真の場合はtrue。それ以外(メニュー・看板・注意書きなどの外国語表記が写っている通常の写真)はfalse。
- confidence: その判定にどれくらい自信があるかを0(自信なし)〜1(確信)で。`;

export type SensitivityResult = {
  verdict: "pass" | "reject";
  score: number | null;
  model: string;
  raw: string;
};

export async function classifySensitivePhoto(
  env: AppEnv,
  imageBytes: Uint8Array,
): Promise<SensitivityResult> {
  try {
    const result = await env.AI.run(VISION_MODEL, {
      image: Array.from(imageBytes),
      prompt: SENSITIVE_PROMPT,
      max_tokens: 128,
    });
    const payload =
      typeof result === "string"
        ? result
        : ((result as { response?: unknown })?.response ?? result);
    const parsed = extractJson(payload);
    const score = Number(parsed.confidence);
    return {
      verdict: parsed.inappropriate === true ? "reject" : "pass",
      score: Number.isFinite(score) ? Math.min(1, Math.max(0, score)) : null,
      model: VISION_MODEL,
      raw: JSON.stringify(payload).slice(0, 2000),
    };
  } catch (e) {
    console.error("classifySensitivePhoto failed", e);
    // fail-open: AIの不調で投稿を詰まらせない(rule4)
    return { verdict: "pass", score: null, model: VISION_MODEL, raw: "" };
  }
}
