import {
  isValidLangPair,
  MAP_POST_STATUSES,
  MAX_SPECIES_IMAGE_BYTES,
  PAGEVIEW_HOURLY_LIMIT,
  POST_PLACE_KINDS,
  UUID_RE,
} from "./config";
import { getVerifiedAdminEmail } from "./auth";
import { bad } from "./utils";
import type { AppEnv } from "./types";

// =====================================================================
// 管理画面(admin.html)向けAPI。認証は既存のGoogleログイン基盤(uid Cookie)に
// ADMIN_EMAILSシークレット(カンマ区切り許可リスト)を乗せるだけ([変更]/[新規])。
// 破壊的な操作(削除・手動修正・ポイント調整・種族登録)はすべてadmin_audit_logに記録する。
// =====================================================================

async function requireAdmin(
  request: Request,
  env: AppEnv,
): Promise<string | Response> {
  const email = await getVerifiedAdminEmail(request, env);
  if (!email) return bad("管理者権限がありません", 403);
  return email;
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

export async function adminWhoami(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  const email = await getVerifiedAdminEmail(request, env);
  return Response.json({ ok: true, admin: !!email, email: email || null });
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
  const whereSql = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

  const rows = await env.DB.prepare(
    `SELECT id, submitter_id, created_at, lang_pair, place_kind, status,
            original_text, translated_text, src_thumb_key, flagged
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

export async function adminPostEdit(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;

  const body = await request.json<Record<string, unknown>>();
  const postId = String(body.post_id || "");
  if (!postId) return bad("post_id が必要です");

  const before = await env.DB.prepare("SELECT * FROM posts WHERE id = ?1")
    .bind(postId)
    .first();
  if (!before) return bad("該当する投稿がありません", 404);

  const sets: string[] = [];
  const binds: unknown[] = [];
  let n = 1;

  if (typeof body.original_text === "string") {
    sets.push(`original_text = ?${n++}`);
    binds.push(body.original_text.trim().slice(0, 2000) || null);
  }
  if (typeof body.translated_text === "string") {
    sets.push(`translated_text = ?${n++}`);
    binds.push(body.translated_text.trim().slice(0, 2000) || null);
  }
  if (typeof body.status === "string") {
    if (!MAP_POST_STATUSES.has(body.status)) return bad("statusの指定が不正です");
    sets.push(`status = ?${n++}`);
    binds.push(body.status);
  }
  if (typeof body.lang_pair === "string") {
    if (!isValidLangPair(body.lang_pair)) return bad("lang_pairの指定が不正です");
    sets.push(`lang_pair = ?${n++}`);
    binds.push(body.lang_pair);
  }
  if (typeof body.place_kind === "string") {
    if (!POST_PLACE_KINDS.has(body.place_kind))
      return bad("place_kindの指定が不正です");
    sets.push(`place_kind = ?${n++}`);
    binds.push(body.place_kind);
  }
  if (body.flagged === true || body.flagged === false) {
    sets.push(`flagged = ?${n++}`);
    binds.push(body.flagged ? 1 : 0);
  }

  if (!sets.length) return bad("更新する項目がありません");

  binds.push(postId);
  await env.DB.batch([
    env.DB.prepare(`UPDATE posts SET ${sets.join(", ")} WHERE id = ?${n}`).bind(
      ...binds,
    ),
    logAdminAction(env, admin, "post_edit", postId, { before, changes: body }),
  ]);

  return Response.json({ ok: true });
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
    logAdminAction(env, admin, "post_delete", postId, {
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
    logAdminAction(env, admin, "points_adjust", userId, { delta, note }),
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
  const nameKey = String(body.name_key || "").trim();
  const rarity = Math.trunc(Number(body.rarity));
  const sortOrder = Math.trunc(Number(body.sort_order)) || 0;
  if (!/^[a-zA-Z0-9_]{1,40}$/.test(id)) return bad("idの形式が不正です");
  if (!/^[a-zA-Z0-9_]{1,40}$/.test(nameKey)) return bad("name_keyの形式が不正です");
  if (!(rarity >= 1 && rarity <= 4)) return bad("rarityは1〜4で指定してください");

  const existing = await env.DB.prepare("SELECT id FROM species WHERE id = ?1")
    .bind(id)
    .first();
  if (existing) return bad("同じidの種族が既に存在します");

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO species (id, name_key, rarity, sort_order) VALUES (?1,?2,?3,?4)",
    ).bind(id, nameKey, rarity, sortOrder),
    logAdminAction(env, admin, "species_create", id, { nameKey, rarity, sortOrder }),
  ]);

  return Response.json({ ok: true, id });
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
  await logAdminAction(env, admin, "species_image", id, null).run();

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
