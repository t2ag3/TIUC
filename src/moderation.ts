import type { AppEnv } from "./types";

// =====================================================================
// 撮影写真のAI一次チェック(rule4: AIは足切り・下書きのみ。正誤判定は人間)。
// ①不適切な写真(グロテスク・セクシャル・顔だけ・性器だけ等)の足切り、
// ②訳文の言語のざっくり判定、③表記種別の判定を1回のVisionモデル呼び出しでまとめて行う。
// AI呼び出し自体が失敗した場合はfail-open(足切りをスキップして投稿は通す。
// CLAUDE.mdの「継続率を守る・詰まらせない」方針)。
// =====================================================================

const MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";

const PROMPT = `あなたは市民参加型アプリの写真フィルタです。次の写真について、以下のJSON形式のみで回答してください。前後に説明文を付けないでください。

{"inappropriate": true または false, "language": "en" または "zh" または "ko" または "other" または "none", "sign_type": "menu" または "sign" または "notice" または "other" または "unknown"}

- inappropriate: 性的な内容、グロテスクな内容、人の顔だけが大きく写っていて周囲に文字や看板が写っていない写真、性器が写っている写真の場合はtrue。それ以外(メニュー・看板・注意書きなどの外国語表記が写っている通常の写真)はfalse。
- language: 写真に写っている外国語(日本語以外)の表記が、英語ならen、中国語ならzh、韓国語ならko、それ以外の言語ならother、外国語の文字が見当たらなければnone。
- sign_type: その表記がメニューならmenu、看板ならsign、注意書き・掲示ならnotice、それ以外ならother、判断できなければunknown。`;

export type PhotoAnalysis = {
  inappropriate: boolean;
  langPairGuess: string | null;
  placeKindGuess: string | null;
};

const LANG_MAP: Record<string, string> = {
  en: "ja-en",
  zh: "ja-zh",
  ko: "ja-ko",
};
const PLACE_KINDS = new Set(["menu", "sign", "notice", "other"]);

function parseVerdict(raw: unknown): PhotoAnalysis {
  let parsed: { inappropriate?: unknown; language?: unknown; sign_type?: unknown };
  if (raw && typeof raw === "object") {
    parsed = raw as typeof parsed;
  } else {
    const text = String(raw ?? "");
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("JSONが見つかりません");
    parsed = JSON.parse(match[0]);
  }
  const language = String(parsed.language || "");
  const signType = String(parsed.sign_type || "");
  return {
    inappropriate: parsed.inappropriate === true,
    langPairGuess: LANG_MAP[language] ?? null,
    placeKindGuess: PLACE_KINDS.has(signType) ? signType : null,
  };
}

export async function analyzeSignPhoto(
  env: AppEnv,
  imageBytes: Uint8Array,
): Promise<PhotoAnalysis> {
  try {
    const result = await env.AI.run(MODEL, {
      image: Array.from(imageBytes),
      prompt: PROMPT,
      max_tokens: 256,
    });
    const payload =
      typeof result === "string"
        ? result
        : ((result as { response?: unknown })?.response ?? result);
    return parseVerdict(payload);
  } catch (e) {
    console.error("analyzeSignPhoto failed", e);
    return { inappropriate: false, langPairGuess: null, placeKindGuess: null };
  }
}
