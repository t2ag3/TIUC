import { UUID_RE } from "./config";
import { bad } from "./utils";
import type { AppEnv } from "./types";

// =====================================================================
// curate.html向けのAI修正提案(rule4: AIは断定させない・下書きのみ。
// 最終的な採用・編集は必ずバイリンガルのキュレーターが行う)。
// キューの取得(correctNext)には含めず、キュレーターが能動的に
// 「AIの提案を見る」を押した時だけオンデマンドで呼ぶ(GET /api/correct/suggest)。
// =====================================================================

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const LANG_NAMES: Record<string, string> = {
  "ja-en": "英語",
  "ja-zh": "中国語",
  "ja-ko": "韓国語",
  "ja-fr": "フランス語",
  "ja-es": "スペイン語",
  "ja-hi": "ヒンディー語",
};

export type CorrectionSuggestion = {
  fixedText: string | null;
  explanation: string | null;
};

function extractJson(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  const text = String(raw ?? "");
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("JSONが見つかりません");
  return JSON.parse(match[0]);
}

export async function suggestCorrection(
  env: AppEnv,
  params: {
    originalText: string | null;
    translatedText: string | null;
    langPair: string;
  },
): Promise<CorrectionSuggestion> {
  const langName = LANG_NAMES[params.langPair] || params.langPair;
  const prompt = `あなたは街の外国語表記を自然な訳に直す手伝いをする校正アシスタントです。
以下の情報から、より自然な${langName}訳と、何が変だったかの一言説明を、次のJSON形式のみで回答してください。前後に説明文を付けないでください。

日本語の原文(読み取れた範囲): ${params.originalText || "(不明)"}
現在の${langName}訳: ${params.translatedText || "(不明)"}

{"fixed_text": "自然な${langName}訳", "explanation": "何が変だったかの一言説明(日本語で1文程度)"}

原文または現在の訳文が不明な場合は、無理に断定せず妥当な範囲で答えてください。`;

  try {
    const result = await env.AI.run(MODEL, {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 512,
    });
    const payload =
      typeof result === "string"
        ? result
        : ((result as { response?: unknown })?.response ?? result);
    const parsed = extractJson(payload);
    const fixedText =
      typeof parsed.fixed_text === "string" ? parsed.fixed_text.trim() : null;
    const explanation =
      typeof parsed.explanation === "string" ? parsed.explanation.trim() : null;
    return { fixedText: fixedText || null, explanation: explanation || null };
  } catch (e) {
    console.error("suggestCorrection failed", e);
    // fail-open: 参考にできるものが無ければ空欄のまま(キュレーターの入力を妨げない)
    return { fixedText: null, explanation: null };
  }
}

// GET /api/correct/suggest?user_id=...&post_id=...
export async function correctSuggest(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  const sp = new URL(request.url).searchParams;
  const userId = String(sp.get("user_id") || "");
  const postId = String(sp.get("post_id") || "");
  if (!UUID_RE.test(userId)) return bad("ユーザーIDが不正です");
  if (!postId) return bad("post_id が必要です");

  const post = await env.DB.prepare(
    "SELECT original_text, translated_text, lang_pair FROM posts WHERE id = ?1",
  )
    .bind(postId)
    .first<{
      original_text: string | null;
      translated_text: string | null;
      lang_pair: string;
    }>();
  if (!post) return bad("該当する投稿がありません", 404);

  const suggestion = await suggestCorrection(env, {
    originalText: post.original_text,
    translatedText: post.translated_text,
    langPair: post.lang_pair,
  });

  return Response.json({
    ok: true,
    fixed_text: suggestion.fixedText,
    explanation: suggestion.explanation,
  });
}
