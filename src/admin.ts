import {
  isValidLangPair,
  MAP_POST_STATUSES,
  MAX_SPECIES_IMAGE_BYTES,
  PAGEVIEW_HOURLY_LIMIT,
  POST_PLACE_KINDS,
  UUID_RE,
} from "./config";
import { getVerifiedAdmin } from "./auth";
import { bad } from "./utils";
import type { AppEnv } from "./types";

// =====================================================================
// 管理画面(admin.html)向けAPI。認証は既存のGoogleログイン基盤(uid Cookie)に
// ADMIN_EMAILSシークレット(カンマ区切り許可リスト)を乗せるだけ([変更]/[新規])。
// 破壊的な操作(削除・手動修正・ポイント調整・種族登録)はすべてadmin_audit_logに記録する。
// =====================================================================

type Admin = { userId: string; email: string };

async function requireAdmin(
  request: Request,
  env: AppEnv,
): Promise<Admin | Response> {
  const admin = await getVerifiedAdmin(request, env);
  if (!admin) return bad("管理者権限がありません", 403);
  return admin;
}

function logAdminAction(
  env: AppEnv,
  adminEmail: string,
  action: string,
  targetId: string | null,
  detail: unknown,
) {
  return env.DB.prepare(
    `INSERT INTO admin_audit_log (admin_email, action, target_id, detail, created_at)
     VALUES (?1,?2,?3,?4,?5)`,
  ).bind(
    adminEmail,
    action,
    targetId,
    detail == null ? null : JSON.stringify(detail),
    Math.floor(Date.now() / 1000),
  );
}

// 簡易CSVパーサ(RFC4180相当。引用符で囲んだフィールド内のカンマ・改行・""エスケープに対応)。
// ビルド工程が無く外部npm依存を増やしたくないため自前で持つ。ヘッダー行を列名として、
// 2行目以降を Record<列名, 値> の配列で返す(欠けている列は空文字)。
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
  if (!nonEmpty.length) return [];
  const header = nonEmpty[0].map((h) => h.trim());
  return nonEmpty.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((h, idx) => {
      obj[h] = (r[idx] ?? "").trim();
    });
    return obj;
  });
}

export async function adminWhoami(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  const admin = await getVerifiedAdmin(request, env);
  return Response.json({ ok: true, admin: !!admin, email: admin?.email || null });
}

// --- 投稿管理 ---------------------------------------------------------

export async function adminPostsList(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const sp = new URL(request.url).searchParams;
  const status = String(sp.get("status") || "");
  const langPair = String(sp.get("lang_pair") || "");
  const q = String(sp.get("q") || "").trim();
  const aiVerdict = String(sp.get("ai_verdict") || "");
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit")) || 30));
  const offset = Math.max(0, Number(sp.get("offset")) || 0);

  const conds: string[] = [];
  const binds: unknown[] = [];
  let n = 1;
  if (status && MAP_POST_STATUSES.has(status)) {
    conds.push(`status = ?${n++}`);
    binds.push(status);
  }
  if (langPair && isValidLangPair(langPair)) {
    conds.push(`lang_pair = ?${n++}`);
    binds.push(langPair);
  }
  if (q) {
    conds.push(`(original_text LIKE ?${n} OR translated_text LIKE ?${n})`);
    binds.push(`%${q}%`);
    n++;
  }
  if (aiVerdict === "pending") {
    conds.push("ai_verdict IS NULL");
  } else if (["pass", "review", "reject"].includes(aiVerdict)) {
    conds.push(`ai_verdict = ?${n++}`);
    binds.push(aiVerdict);
  }
  const whereSql = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

  const rows = await env.DB.prepare(
    `SELECT id, submitter_id, created_at, lang_pair, place_kind, status,
            original_text, translated_text, src_thumb_key, flagged, ai_verdict
       FROM posts
       ${whereSql}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}`,
  )
    .bind(...binds)
    .all();

  return Response.json({ ok: true, posts: rows.results });
}

export async function adminPostDetail(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const postId = String(new URL(request.url).searchParams.get("post_id") || "");
  if (!postId) return bad("post_id が必要です");

  const post = await env.DB.prepare("SELECT * FROM posts WHERE id = ?1")
    .bind(postId)
    .first();
  if (!post) return bad("該当する投稿がありません", 404);

  const [judgments, corrections] = await Promise.all([
    env.DB.prepare(
      "SELECT id, verdict, judge_id, created_at FROM judgments WHERE post_id = ?1 ORDER BY created_at",
    )
      .bind(postId)
      .all(),
    env.DB.prepare(
      "SELECT id, verdict, fixed_text, explanation, curator_id, status, created_at FROM corrections WHERE post_id = ?1 ORDER BY created_at",
    )
      .bind(postId)
      .all(),
  ]);

  return Response.json({
    ok: true,
    post,
    judgments: judgments.results,
    corrections: corrections.results,
  });
}

// 単一編集・CSV一括編集の両方から呼ぶ共通の検証+UPDATEロジック。
// Responseを直接返さず結果オブジェクトを返すのは、CSV側が行ごとの結果一覧を
// 組み立てる必要があるため(1件エラーで全体を止めたくない)。
type PostEditResult = { ok: true } | { ok: false; error: string; notFound?: boolean };

async function applyPostEditFields(
  env: AppEnv,
  postId: string,
  fields: Record<string, unknown>,
  adminEmail: string,
): Promise<PostEditResult> {
  const before = await env.DB.prepare("SELECT * FROM posts WHERE id = ?1")
    .bind(postId)
    .first();
  if (!before) return { ok: false, error: "該当する投稿がありません", notFound: true };

  const sets: string[] = [];
  const binds: unknown[] = [];
  let n = 1;

  if (typeof fields.original_text === "string") {
    sets.push(`original_text = ?${n++}`);
    binds.push(fields.original_text.trim().slice(0, 2000) || null);
  }
  if (typeof fields.translated_text === "string") {
    sets.push(`translated_text = ?${n++}`);
    binds.push(fields.translated_text.trim().slice(0, 2000) || null);
  }
  if (typeof fields.what_it_says === "string") {
    sets.push(`what_it_says = ?${n++}`);
    binds.push(fields.what_it_says.trim().slice(0, 500) || null);
  }
  if (typeof fields.whats_weird === "string") {
    sets.push(`whats_weird = ?${n++}`);
    binds.push(fields.whats_weird.trim().slice(0, 500) || null);
  }
  if (typeof fields.status === "string") {
    if (!MAP_POST_STATUSES.has(fields.status))
      return { ok: false, error: "statusの指定が不正です" };
    sets.push(`status = ?${n++}`);
    binds.push(fields.status);
  }
  if (typeof fields.lang_pair === "string") {
    if (!isValidLangPair(fields.lang_pair))
      return { ok: false, error: "lang_pairの指定が不正です" };
    sets.push(`lang_pair = ?${n++}`);
    binds.push(fields.lang_pair);
  }
  if (typeof fields.place_kind === "string") {
    if (!POST_PLACE_KINDS.has(fields.place_kind))
      return { ok: false, error: "place_kindの指定が不正です" };
    sets.push(`place_kind = ?${n++}`);
    binds.push(fields.place_kind);
  }
  if (fields.flagged === true || fields.flagged === false) {
    sets.push(`flagged = ?${n++}`);
    binds.push(fields.flagged ? 1 : 0);
  }
  if (typeof fields.ai_verdict === "string") {
    // AIの誤検知を管理者が手動で戻す/確定させるための上書き(2026-09-02改定)。
    // 'review'はCHECK制約上は許容されるが現状の判定ロジックからは出ないため、
    // 手動オーバーライドの選択肢としてのみ意味を持つ。
    if (!["pass", "review", "reject"].includes(fields.ai_verdict))
      return { ok: false, error: "ai_verdictの指定が不正です" };
    sets.push(`ai_verdict = ?${n++}`);
    binds.push(fields.ai_verdict);
  }

  if (!sets.length) return { ok: false, error: "更新する項目がありません" };

  binds.push(postId);
  await env.DB.batch([
    env.DB.prepare(`UPDATE posts SET ${sets.join(", ")} WHERE id = ?${n}`).bind(
      ...binds,
    ),
    logAdminAction(env, adminEmail, "post_edit", postId, { before, changes: fields }),
  ]);
  return { ok: true };
}

export async function adminPostEdit(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const body = await request.json<Record<string, unknown>>();
  const postId = String(body.post_id || "");
  if (!postId) return bad("post_id が必要です");

  const result = await applyPostEditFields(env, postId, body, admin.email);
  if (!result.ok) return bad(result.error, result.notFound ? 404 : 400);
  return Response.json({ ok: true });
}

// 既存投稿(写真は既にある前提)のテキスト項目をCSVで一括編集する(ユーザー指示、2026-08-29)。
// 列: post_id,original_text,translated_text,lang_pair,what_it_says,whats_weird,status,flagged
// post_id以外は空欄ならそのフィールドを変更しない(既存値を維持)。行ごとにapplyPostEditFieldsを
// 呼ぶだけで、検証・監査ログの仕組みは単一編集と完全に共有する。
export async function adminPostsCsvImport(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return bad("CSVファイルがありません");
  const rows = parseCsv(await file.text());
  if (!rows.length) return bad("CSVにデータ行がありません");

  const results: Array<{
    row: number;
    post_id: string;
    status: "updated" | "error";
    error?: string;
  }> = [];

  for (let idx = 0; idx < rows.length; idx++) {
    const r = rows[idx];
    const postId = (r.post_id || "").trim();
    if (!postId) {
      results.push({ row: idx + 2, post_id: "", status: "error", error: "post_idが空です" });
      continue;
    }
    const fields: Record<string, unknown> = {};
    for (const key of [
      "original_text",
      "translated_text",
      "lang_pair",
      "what_it_says",
      "whats_weird",
      "status",
    ]) {
      if (r[key]) fields[key] = r[key];
    }
    if (r.flagged === "0" || r.flagged === "1") fields.flagged = r.flagged === "1";

    const result = await applyPostEditFields(env, postId, fields, admin.email);
    results.push({
      row: idx + 2,
      post_id: postId,
      status: result.ok ? "updated" : "error",
      error: result.ok ? undefined : result.error,
    });
  }

  return Response.json({ ok: true, results });
}

export async function adminPostDelete(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const body = await request.json<Record<string, unknown>>();
  const postId = String(body.post_id || "");
  if (!postId) return bad("post_id が必要です");

  const post = await env.DB.prepare(
    `SELECT submitter_id, status, src_image_key, src_thumb_key,
            tgt_image_key, tgt_thumb_key
       FROM posts WHERE id = ?1`,
  )
    .bind(postId)
    .first<{
      submitter_id: string;
      status: string;
      src_image_key: string;
      src_thumb_key: string;
      tgt_image_key: string | null;
      tgt_thumb_key: string | null;
    }>();
  if (!post) return bad("該当する投稿がありません", 404);

  // 監査ログ用に、この投稿に紐づくポイント台帳のスナップショットを残す
  // (rule10のポイント台帳はここでは書き換えない。取消が要れば管理者が
  // リーダーボード機能から個別に手動調整する、という疎結合な設計)
  const points = await env.DB.prepare(
    `SELECT user_id, kind, points FROM point_events WHERE post_id = ?1`,
  )
    .bind(postId)
    .all();

  await env.DB.batch([
    env.DB.prepare("DELETE FROM posts WHERE id = ?1").bind(postId),
    logAdminAction(env, admin.email, "post_delete", postId, {
      submitter_id: post.submitter_id,
      status: post.status,
      point_events: points.results,
    }),
  ]);

  await Promise.all(
    [
      env.PHOTOS.delete(post.src_image_key),
      env.PHOTOS.delete(post.src_thumb_key),
      post.tgt_image_key ? env.PHOTOS.delete(post.tgt_image_key) : null,
      post.tgt_thumb_key ? env.PHOTOS.delete(post.tgt_thumb_key) : null,
    ].filter(Boolean) as Promise<void>[],
  );

  return Response.json({ ok: true });
}

// 管理画面から修正案(corrections)を直接触れるようにする(ユーザー指示、2026-09-02)。
// posts側の手動修正(applyPostEditFields)とは独立した単純なCRUD。confirmedに設定しても
// posts.translated_text/gold_itemsへの自動反映は行わない(correctVoteSubmitの確定カスケードは
// 実際の投票イベント専用のロジックのため、ここでは複製しない。反映したい場合は同じ編集モーダル内で
// 投稿側のtranslated_textも管理者が別途編集すればよい)。
const CORRECTION_VERDICTS = new Set(["fix", "no_issue"]);
const CORRECTION_STATUSES = new Set(["proposed", "confirmed", "rejected"]);

export async function adminCorrectionUpsert(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const body = await request.json<Record<string, unknown>>();
  const postId = String(body.post_id || "");
  const correctionId = body.correction_id ? String(body.correction_id) : null;
  const verdict = String(body.verdict || "fix");
  const status = String(body.status || "proposed");
  const fixedText =
    typeof body.fixed_text === "string"
      ? body.fixed_text.trim().slice(0, 500) || null
      : null;
  const explanation =
    typeof body.explanation === "string"
      ? body.explanation.trim().slice(0, 500) || null
      : null;

  if (!postId) return bad("post_id が必要です");
  if (!CORRECTION_VERDICTS.has(verdict)) return bad("verdictの指定が不正です");
  if (!CORRECTION_STATUSES.has(status)) return bad("statusの指定が不正です");
  if (verdict === "fix" && !fixedText)
    return bad("verdict='fix'の場合はfixed_textが必要です");

  const post = await env.DB.prepare("SELECT id FROM posts WHERE id = ?1")
    .bind(postId)
    .first();
  if (!post) return bad("該当する投稿がありません", 404);

  if (correctionId) {
    const existing = await env.DB.prepare(
      "SELECT id FROM corrections WHERE id = ?1 AND post_id = ?2",
    )
      .bind(correctionId, postId)
      .first();
    if (!existing) return bad("該当する修正案がありません", 404);

    await env.DB.batch([
      env.DB.prepare(
        `UPDATE corrections SET verdict = ?2, fixed_text = ?3, explanation = ?4, status = ?5
          WHERE id = ?1`,
      ).bind(correctionId, verdict, fixedText, explanation, status),
      logAdminAction(env, admin.email, "correction_edit", correctionId, {
        post_id: postId,
        verdict,
        fixedText,
        explanation,
        status,
      }),
    ]);
    return Response.json({ ok: true, correction_id: correctionId });
  }

  const newId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO corrections (id, post_id, verdict, fixed_text, explanation, curator_id, status, created_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`,
    ).bind(
      newId,
      postId,
      verdict,
      fixedText,
      explanation,
      admin.userId,
      status,
      Math.floor(Date.now() / 1000),
    ),
    logAdminAction(env, admin.email, "correction_create", newId, {
      post_id: postId,
      verdict,
      fixedText,
      explanation,
      status,
    }),
  ]);
  return Response.json({ ok: true, correction_id: newId });
}

export async function adminCorrectionDelete(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const body = await request.json<Record<string, unknown>>();
  const correctionId = String(body.correction_id || "");
  if (!correctionId) return bad("correction_id が必要です");

  const existing = await env.DB.prepare(
    "SELECT post_id FROM corrections WHERE id = ?1",
  )
    .bind(correctionId)
    .first<{ post_id: string }>();
  if (!existing) return bad("該当する修正案がありません", 404);

  await env.DB.batch([
    env.DB.prepare("DELETE FROM corrections WHERE id = ?1").bind(correctionId),
    logAdminAction(env, admin.email, "correction_delete", correctionId, {
      post_id: existing.post_id,
    }),
  ]);
  return Response.json({ ok: true });
}

// --- リーダーボード -----------------------------------------------------

export async function adminLeaderboard(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const sp = new URL(request.url).searchParams;
  const limit = Math.min(200, Math.max(1, Number(sp.get("limit")) || 50));
  const offset = Math.max(0, Number(sp.get("offset")) || 0);

  const rows = await env.DB.prepare(
    `SELECT id, display_name, email, points_total, post_count,
            judged_count, corrected_count, adopted_count, created_at
       FROM users
      ORDER BY points_total DESC, created_at ASC
      LIMIT ${limit} OFFSET ${offset}`,
  ).all();

  return Response.json({ ok: true, users: rows.results });
}

export async function adminAdjustPoints(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const body = await request.json<Record<string, unknown>>();
  const userId = String(body.user_id || "");
  const delta = Math.trunc(Number(body.delta));
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : null;
  if (!UUID_RE.test(userId)) return bad("user_id が不正です");
  if (!Number.isFinite(delta) || delta === 0) return bad("deltaが不正です");

  const user = await env.DB.prepare("SELECT id FROM users WHERE id = ?1")
    .bind(userId)
    .first();
  if (!user) return bad("該当するユーザーがありません", 404);

  const now = Math.floor(Date.now() / 1000);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO point_events (user_id, kind, points, created_at, note)
       VALUES (?1,'manual',?2,?3,?4)`,
    ).bind(userId, delta, now, note),
    env.DB.prepare(
      "UPDATE users SET points_total = points_total + ?2 WHERE id = ?1",
    ).bind(userId, delta),
    logAdminAction(env, admin.email, "points_adjust", userId, { delta, note }),
  ]);

  return Response.json({ ok: true });
}

// --- アクティビティログ --------------------------------------------------

export async function adminActivity(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const sp = new URL(request.url).searchParams;
  const limit = Math.min(200, Math.max(1, Number(sp.get("limit")) || 50));
  const offset = Math.max(0, Number(sp.get("offset")) || 0);

  const rows = await env.DB.prepare(
    `SELECT pe.id, pe.user_id, u.display_name, u.email, pe.post_id,
            pe.kind, pe.points, pe.created_at, pe.note
       FROM point_events pe
       LEFT JOIN users u ON u.id = pe.user_id
      ORDER BY pe.created_at DESC
      LIMIT ${limit} OFFSET ${offset}`,
  ).all();

  return Response.json({ ok: true, events: rows.results });
}

export async function adminPageviews(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const days = Math.min(90, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 7));
  const since = Math.floor(Date.now() / 1000) - days * 86400;

  const [byDay, byPath] = await Promise.all([
    env.DB.prepare(
      `SELECT (created_at / 86400) AS day_bucket, COUNT(*) AS n
         FROM page_views WHERE created_at > ?1
        GROUP BY day_bucket ORDER BY day_bucket`,
    )
      .bind(since)
      .all(),
    env.DB.prepare(
      `SELECT path, COUNT(*) AS n FROM page_views WHERE created_at > ?1
        GROUP BY path ORDER BY n DESC LIMIT 20`,
    )
      .bind(since)
      .all(),
  ]);

  return Response.json({ ok: true, by_day: byDay.results, by_path: byPath.results });
}

// 一般ユーザー向け(管理者権限不要)。ページアクセスの自己申告を溜めるだけ。
export async function trackPageview(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  const body = await request.json<Record<string, unknown>>();
  const path = String(body.path || "").slice(0, 200);
  const userId = String(body.user_id || "");
  if (!path) return bad("pathが必要です");
  const validUserId = UUID_RE.test(userId) ? userId : null;

  const now = Math.floor(Date.now() / 1000);
  if (validUserId) {
    const hourly = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM page_views WHERE user_id = ?1 AND created_at > ?2 - 3600",
    )
      .bind(validUserId, now)
      .first<{ n: number }>();
    if ((hourly?.n ?? 0) >= PAGEVIEW_HOURLY_LIMIT) {
      return Response.json({ ok: true }); // 静かに無視(ビーコンなので429は不要)
    }
  }

  await env.DB.prepare(
    "INSERT INTO page_views (path, user_id, created_at) VALUES (?1,?2,?3)",
  )
    .bind(path, validUserId, now)
    .run();

  return Response.json({ ok: true });
}

// --- キャラクタ(種族)登録 ------------------------------------------------

export async function adminSpeciesCreate(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const body = await request.json<Record<string, unknown>>();
  const id = String(body.id || "").trim();
  const rarity = Math.trunc(Number(body.rarity));
  const sortOrder = Math.trunc(Number(body.sort_order)) || 0;
  const nameJa = typeof body.name_ja === "string" ? body.name_ja.trim() : "";
  const descJa =
    typeof body.desc_ja === "string" ? body.desc_ja.trim() || null : null;
  if (!/^[a-zA-Z0-9_]{1,40}$/.test(id)) return bad("idの形式が不正です");
  if (!(rarity >= 1 && rarity <= 4)) return bad("rarityは1〜4で指定してください");

  const existing = await env.DB.prepare("SELECT id FROM species WHERE id = ?1")
    .bind(id)
    .first();
  if (existing) return bad("同じidの種族が既に存在します");

  // name_key は常にidと同じにする(CSVインポートと同じ規約に統一)
  const stmts = [
    env.DB.prepare(
      "INSERT INTO species (id, name_key, rarity, sort_order) VALUES (?1,?1,?2,?3)",
    ).bind(id, rarity, sortOrder),
  ];
  if (nameJa) {
    stmts.push(
      env.DB.prepare(
        "INSERT INTO species_i18n (species_id, lang, name, desc) VALUES (?1,'ja',?2,?3)",
      ).bind(id, nameJa, descJa),
    );
  }
  stmts.push(
    logAdminAction(env, admin.email, "species_create", id, { rarity, sortOrder, nameJa }),
  );
  await env.DB.batch(stmts);

  return Response.json({ ok: true, id });
}

// キャラをCSVで一括登録する(ユーザー指示、2026-08-29)。運用イメージ：日本語でid/rarity/
// sort_order/name_ja/desc_jaを作り、AI翻訳サービスで他5言語ぶんを追加してもらったCSVを
// そのまま流し込む。列: id,rarity,sort_order,name_ja,desc_ja,name_en,desc_en,name_zh,desc_zh,
// name_ko,desc_ko,name_fr,desc_fr,name_es,desc_es。既に存在するidはスキップする(上書きしない)。
const SPECIES_CSV_LANGS = ["ja", "en", "zh", "ko", "fr", "es"];

export async function adminSpeciesCsvImport(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return bad("CSVファイルがありません");
  const rows = parseCsv(await file.text());
  if (!rows.length) return bad("CSVにデータ行がありません");

  const results: Array<{
    row: number;
    id: string;
    status: "created" | "skipped" | "error";
    error?: string;
  }> = [];

  for (let idx = 0; idx < rows.length; idx++) {
    const r = rows[idx];
    const id = (r.id || "").trim();
    const rarity = Math.trunc(Number(r.rarity));
    const sortOrder = Math.trunc(Number(r.sort_order)) || 0;

    if (!/^[a-zA-Z0-9_]{1,40}$/.test(id)) {
      results.push({ row: idx + 2, id, status: "error", error: "idの形式が不正です" });
      continue;
    }
    if (!(rarity >= 1 && rarity <= 4)) {
      results.push({
        row: idx + 2,
        id,
        status: "error",
        error: "rarityは1〜4で指定してください",
      });
      continue;
    }
    const existing = await env.DB.prepare("SELECT id FROM species WHERE id = ?1")
      .bind(id)
      .first();
    if (existing) {
      results.push({ row: idx + 2, id, status: "skipped", error: "既に存在するidです" });
      continue;
    }

    const stmts = [
      env.DB.prepare(
        "INSERT INTO species (id, name_key, rarity, sort_order) VALUES (?1,?1,?2,?3)",
      ).bind(id, rarity, sortOrder),
    ];
    for (const lang of SPECIES_CSV_LANGS) {
      const name = (r[`name_${lang}`] || "").trim();
      if (!name) continue;
      const desc = (r[`desc_${lang}`] || "").trim() || null;
      stmts.push(
        env.DB.prepare(
          "INSERT INTO species_i18n (species_id, lang, name, desc) VALUES (?1,?2,?3,?4)",
        ).bind(id, lang, name, desc),
      );
    }
    stmts.push(
      logAdminAction(env, admin.email, "species_csv_import", id, { rarity, sortOrder }),
    );
    await env.DB.batch(stmts);
    results.push({ row: idx + 2, id, status: "created" });
  }

  return Response.json({ ok: true, results });
}

export async function adminSpeciesImage(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const form = await request.formData();
  const id = String(form.get("species_id") || "").trim();
  if (!/^[a-zA-Z0-9_]{1,40}$/.test(id)) return bad("species_idの形式が不正です");

  const species = await env.DB.prepare("SELECT id FROM species WHERE id = ?1")
    .bind(id)
    .first();
  if (!species) return bad("該当する種族がありません", 404);

  const file = form.get("image");
  if (!(file instanceof File)) return bad("画像がありません");
  if (file.size === 0) return bad("画像が空です");
  if (file.size > MAX_SPECIES_IMAGE_BYTES) return bad("画像が大きすぎます");
  if (file.type !== "image/png") return bad("PNG画像のみ受け付けます");

  await env.PHOTOS.put(`species/${id}.png`, file.stream(), {
    httpMetadata: { contentType: "image/png" },
  });
  await logAdminAction(env, admin.email, "species_image", id, null).run();

  return Response.json({ ok: true });
}

// 種族イラストの公開配信(管理者権限不要。静的アセットが無い種族の
// フォールバック用。R2のPHOTOSバケットをspecies/{id}.png規約で共用する)
export async function serveSpeciesImage(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  const id = decodeURIComponent(
    new URL(request.url).pathname.slice("/species-img/".length),
  );
  if (!/^[a-zA-Z0-9_]{1,40}$/.test(id)) return bad("不正なリクエストです", 400);

  const obj = await env.PHOTOS.get(`species/${id}.png`);
  if (!obj) return new Response("not found", { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", "public, max-age=86400");
  return new Response(obj.body, { headers });
}
