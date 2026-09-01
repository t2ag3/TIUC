import { meshCodes } from "../public/mesh.js";

import {
  isValidLangPair,
  LIKE_HOURLY_LIMIT,
  LOC_SOURCES,
  MAX_IMAGE_BYTES,
  POINTS_POST_SUBMIT,
  POST_HOURLY_LIMIT,
  POST_PLACE_KINDS,
  UUID_RE,
} from "./config";

import { bad, nextStreakCount, sha256Short } from "./utils";
import { classifySensitivePhoto, extractSignInfo } from "./moderation";
import type { AppEnv } from "./types";

// =====================================================================
// ①撮影投稿モード
// =====================================================================

// point_events経由でcharacters.character_pointsを自動加算するトリガー
// (migrations/0019)と同じく、この関数の結果は投稿行のUPDATEだけで完結する。
async function runSensitivityCheck(
  env: AppEnv,
  postId: string,
  srcFull: File,
): Promise<void> {
  const imageBytes = new Uint8Array(await srcFull.arrayBuffer());
  const result = await classifySensitivePhoto(env, imageBytes);
  await env.DB.prepare(
    `UPDATE posts SET ai_verdict = ?2, ai_score = ?3, ai_model = ?4, ai_raw = ?5, ai_at = ?6
      WHERE id = ?1`,
  )
    .bind(
      postId,
      result.verdict,
      result.score,
      result.model,
      result.raw,
      Math.floor(Date.now() / 1000),
    )
    .run();
}

export async function createPost(
  request: Request,
  env: AppEnv,
  ctx: ExecutionContext,
): Promise<Response> {
  const form = await request.formData();

  const userId = String(form.get("user_id") || "");
  if (!UUID_RE.test(userId)) return bad("ユーザーIDが不正です");

  const lat = Number(form.get("lat"));
  const lng = Number(form.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng))
    return bad("位置情報がありません");
  if (lat < 20 || lat > 46 || lng < 122 || lng > 154)
    return bad("日本国内の座標ではありません");

  const langPair = String(form.get("lang_pair") || "");
  if (!isValidLangPair(langPair))
    return bad("言語ペアの指定が不正です");

  const placeKind = String(form.get("place_kind") || "unknown");
  if (!POST_PLACE_KINDS.has(placeKind)) return bad("表記種別の指定が不正です");

  const flagged = form.get("flagged") === "1" ? 1 : 0;

  const locSource = String(form.get("loc_source") || "");
  if (!LOC_SOURCES.has(locSource)) return bad("位置情報の取得方法が不正です");
  const locConflict = form.get("loc_conflict") === "1" ? 1 : 0;
  const accField = form.get("loc_accuracy_m");
  const accRaw = accField === null ? NaN : Number(accField);
  const accuracy = Number.isFinite(accRaw) ? accRaw : null;
  const obsRaw = Number(form.get("observed_at"));
  const observedAt =
    Number.isFinite(obsRaw) && obsRaw > 0 ? Math.floor(obsRaw) : null;
  const situation =
    String(form.get("situation") || "")
      .trim()
      .slice(0, 500) || null;
  const whatItSays =
    String(form.get("what_it_says") || "")
      .trim()
      .slice(0, 500) || null;
  const whatsWeird =
    String(form.get("whats_weird") || "")
      .trim()
      .slice(0, 500) || null;

  // 可変投稿フロー(2026-08-22改定): 見つけた外国語表記の写真(src)は必須、
  // 日本語原文の写真(tgt)は任意(1枚に両方写っていてもよい)
  const srcFull = form.get("src_full");
  const srcThumb = form.get("src_thumb");
  if (!(srcFull instanceof File) || !(srcThumb instanceof File))
    return bad("写真がありません");
  if (srcFull.size === 0 || srcThumb.size === 0) return bad("写真が空です");
  if (srcFull.size > MAX_IMAGE_BYTES) return bad("写真が大きすぎます");
  if (srcFull.type !== "image/jpeg" || srcThumb.type !== "image/jpeg")
    return bad("JPEG のみ受け付けます");

  const tgtFull = form.get("tgt_full");
  const tgtThumb = form.get("tgt_thumb");
  const hasTgt = tgtFull instanceof File && tgtThumb instanceof File;
  if (tgtFull instanceof File !== tgtThumb instanceof File) {
    return bad("訳文の写真は full/thumb を両方送ってください");
  }
  if (hasTgt) {
    if (tgtFull.size === 0 || tgtThumb.size === 0) return bad("写真が空です");
    if (tgtFull.size > MAX_IMAGE_BYTES) return bad("写真が大きすぎます");
    if (tgtFull.type !== "image/jpeg" || tgtThumb.type !== "image/jpeg")
      return bad("JPEG のみ受け付けます");
  }

  // メッシュコードは必ずサーバ側で再計算する(rule2)
  const mesh = meshCodes(lat, lng);
  const now = Math.floor(Date.now() / 1000);

  const hourly = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM posts WHERE submitter_id = ?1 AND created_at > ?2 - 3600",
  )
    .bind(userId, now)
    .first<{ n: number }>();
  if ((hourly?.n ?? 0) >= POST_HOURLY_LIMIT) {
    return bad(
      "短時間の投稿が多すぎます。しばらく待ってから再度お試しください",
      429,
    );
  }

  const id = crypto.randomUUID();
  const d = new Date(now * 1000);
  const prefix = `p/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${id}`;
  const srcImageKey = `${prefix}/src-full.jpg`;
  const srcThumbKey = `${prefix}/src-thumb.jpg`;
  const tgtImageKey = hasTgt ? `${prefix}/tgt-full.jpg` : null;
  const tgtThumbKey = hasTgt ? `${prefix}/tgt-thumb.jpg` : null;

  const puts = [
    env.PHOTOS.put(srcImageKey, srcFull.stream(), {
      httpMetadata: { contentType: "image/jpeg" },
    }),
    env.PHOTOS.put(srcThumbKey, srcThumb.stream(), {
      httpMetadata: { contentType: "image/jpeg" },
    }),
  ];
  if (
    tgtFull instanceof File &&
    tgtThumb instanceof File &&
    tgtImageKey &&
    tgtThumbKey
  ) {
    puts.push(
      env.PHOTOS.put(tgtImageKey, tgtFull.stream(), {
        httpMetadata: { contentType: "image/jpeg" },
      }),
      env.PHOTOS.put(tgtThumbKey, tgtThumb.stream(), {
        httpMetadata: { contentType: "image/jpeg" },
      }),
    );
  }
  await Promise.all(puts);

  const clientHash = await sha256Short(
    `${env.HASH_SALT || "dev"}:${request.headers.get("cf-connecting-ip") || ""}:${
      request.headers.get("user-agent") || ""
    }`,
  );

  // 優先度: 「変かも」フラグ付きは②の配車を優先する。数字が小さいほど先に見る
  let priority = 100;
  if (flagged) priority -= 20;

  const points = POINTS_POST_SUBMIT;

  const streakRow = await env.DB.prepare(
    "SELECT streak_count, streak_at, streak_best FROM users WHERE id = ?1",
  )
    .bind(userId)
    .first<{ streak_count: number; streak_at: number | null; streak_best: number }>();
  const newStreak = nextStreakCount(
    streakRow?.streak_count ?? 0,
    streakRow?.streak_at ?? null,
    now,
  );
  const newBest = Math.max(streakRow?.streak_best ?? 0, newStreak);

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO users (id, created_at) VALUES (?1, ?2) ON CONFLICT(id) DO NOTHING",
    ).bind(userId, now),
    env.DB.prepare(
      `INSERT INTO posts (
         id, submitter_id, created_at, observed_at, lat, lng,
         loc_source, loc_accuracy_m, loc_conflict,
         mesh3, mesh4, mesh5, lang_pair, place_kind, flagged, situation,
         what_it_says, whats_weird,
         src_image_key, src_thumb_key, tgt_image_key, tgt_thumb_key, image_bytes,
         status, review_priority, turnstile_ok, client_hash
       ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,
                 ?17,?18,?19,?20,?21,?22,?23,'pending_judgment',?24,0,?25)`,
    ).bind(
      id,
      userId,
      now,
      observedAt,
      lat,
      lng,
      locSource,
      accuracy,
      locConflict,
      mesh.mesh3,
      mesh.mesh4,
      mesh.mesh5,
      langPair,
      placeKind,
      flagged,
      situation,
      whatItSays,
      whatsWeird,
      srcImageKey,
      srcThumbKey,
      tgtImageKey,
      tgtThumbKey,
      srcFull.size,
      priority,
      clientHash,
    ),
    env.DB.prepare(
      `INSERT INTO point_events (user_id, post_id, kind, points, created_at)
       VALUES (?1,?2,'post_submit',?3,?4)`,
    ).bind(userId, id, points, now),
    env.DB.prepare(
      `UPDATE users SET post_count = post_count + 1, points_total = points_total + ?2,
              streak_count = ?3, streak_at = ?4, streak_best = ?5
        WHERE id = ?1`,
    ).bind(userId, points, newStreak, now, newBest),
  ]);

  // センシティブ画像判定はレスポンスを待たせない(2026-09-02改定：撮影〜送信の同期パスから
  // 完全に切り離す)。ai_verdictがpassになるまで②③のキューには出ない(src/review.ts側でゲート)。
  ctx.waitUntil(runSensitivityCheck(env, id, srcFull));

  return Response.json({
    ok: true,
    id,
    mesh3: mesh.mesh3,
    points,
  });
}

// 撮影直後のOCR的な事前チェック。言語・表記種別のデフォルト値提案のため、本送信より前に
// 呼ばれる(サムネイル程度の解像度で十分)。不適切判定はここでは行わない(2026-09-02改定：
// センシティブ判定はcreatePost経由のバックグラウンド処理に一本化し、クライアントには
// 公開しない)。ここでの判定はDBに保存しない(あくまで一時的な提案)。
export async function analyzePostPhoto(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  const userId = String(
    new URL(request.url).searchParams.get("user_id") || "",
  );
  if (!UUID_RE.test(userId)) return bad("ユーザーIDが不正です");
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length === 0) return bad("写真がありません");

  const result = await extractSignInfo(env, bytes);
  return Response.json({
    ok: true,
    has_text: result.hasText,
    lang_pair_guess: result.langPairGuess,
    place_kind_guess: result.placeKindGuess,
  });
}

// 近隣の既存投稿チェック(重複抑制の一次確認)。認証不要・読み取りのみ [流用]
export async function nearbyCheck(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  const sp = new URL(request.url).searchParams;
  const userId = String(sp.get("user_id") || "");
  if (!UUID_RE.test(userId)) return bad("ユーザーIDが不正です");

  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng))
    return bad("位置情報がありません");
  if (lat < 20 || lat > 46 || lng < 122 || lng > 154)
    return bad("日本国内の座標ではありません");

  const langPair = String(sp.get("lang_pair") || "");
  if (!isValidLangPair(langPair))
    return bad("言語ペアの指定が不正です");

  const mesh = meshCodes(lat, lng);
  const row = await env.DB.prepare(
    `SELECT id AS post_id, COALESCE(observed_at, created_at) AS event_at
       FROM posts
      WHERE mesh5 = ?1 AND lang_pair = ?2 AND submitter_id <> ?3
        AND created_at > unixepoch() - 2592000
      ORDER BY created_at DESC
      LIMIT 1`,
  )
    .bind(mesh.mesh5, langPair, userId)
    .first();

  if (!row) return Response.json({ ok: true, match: false });
  return Response.json({
    ok: true,
    match: true,
    post_id: row.post_id,
    event_at: row.event_at,
  });
}

// 投稿者本人による自己削除。誰も判定していない投稿のみ許可
// (他の人が既に労力をかけたものを一方的に消させないため)
export async function deletePost(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  const body = await request.json<Record<string, unknown>>();
  const userId = String(body.user_id || "");
  const postId = String(body.post_id || "");
  if (!UUID_RE.test(userId) || !postId) return bad("パラメータが不正です");

  const row = await env.DB.prepare(
    `SELECT p.submitter_id, p.status, p.src_image_key, p.src_thumb_key,
            p.tgt_image_key, p.tgt_thumb_key,
            (SELECT COUNT(*) FROM judgments WHERE post_id = p.id) AS judge_n
       FROM posts p WHERE p.id = ?1`,
  )
    .bind(postId)
    .first<{
      submitter_id: string;
      status: string;
      src_image_key: string;
      src_thumb_key: string;
      tgt_image_key: string | null;
      tgt_thumb_key: string | null;
      judge_n: number;
    }>();
  if (!row) return bad("該当する投稿がありません", 404);
  if (row.submitter_id !== userId) return bad("この投稿は削除できません", 403);
  if (row.status !== "pending_judgment" || row.judge_n > 0) {
    return bad("既に判定が始まっているため削除できません");
  }

  await env.DB.prepare("DELETE FROM posts WHERE id = ?1").bind(postId).run();
  await Promise.all(
    [
      env.PHOTOS.delete(row.src_image_key),
      env.PHOTOS.delete(row.src_thumb_key),
      row.tgt_image_key ? env.PHOTOS.delete(row.tgt_image_key) : null,
      row.tgt_thumb_key ? env.PHOTOS.delete(row.tgt_thumb_key) : null,
    ].filter(Boolean),
  );

  return Response.json({ ok: true });
}

// =====================================================================
// 投稿への「いいね」(新規)。judgments/corrections/votes とは別の軽い好意
// シグナル。ポイントは付与しない(rule10: ゲーミフィケーションの水増し防止)。
// 押すたびにON/OFFをトグルする。
// =====================================================================
export async function togglePostLike(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  const body = await request.json<Record<string, unknown>>();
  const userId = String(body.user_id || "");
  const postId = String(body.post_id || "");
  if (!UUID_RE.test(userId)) return bad("ユーザーIDが不正です");
  if (!postId) return bad("post_id が必要です");

  const now = Math.floor(Date.now() / 1000);
  const rate = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM post_likes WHERE user_id = ?1 AND created_at > ?2 - 3600",
  )
    .bind(userId, now)
    .first<{ n: number }>();
  if ((rate?.n ?? 0) >= LIKE_HOURLY_LIMIT) {
    return bad(
      "短時間の操作が多すぎます。しばらく待ってから再度お試しください",
      429,
    );
  }

  const post = await env.DB.prepare(
    "SELECT submitter_id FROM posts WHERE id = ?1",
  )
    .bind(postId)
    .first<{ submitter_id: string }>();
  if (!post) return bad("該当する投稿がありません", 404);
  if (post.submitter_id === userId)
    return bad("自分の投稿にはいいねできません");

  await env.DB.prepare(
    "INSERT INTO users (id, created_at) VALUES (?1, ?2) ON CONFLICT(id) DO NOTHING",
  )
    .bind(userId, now)
    .run();

  const existing = await env.DB.prepare(
    "SELECT id FROM post_likes WHERE post_id = ?1 AND user_id = ?2",
  )
    .bind(postId, userId)
    .first<{ id: string }>();

  if (existing) {
    await env.DB.prepare("DELETE FROM post_likes WHERE id = ?1")
      .bind(existing.id)
      .run();
  } else {
    await env.DB.prepare(
      "INSERT INTO post_likes (id, post_id, user_id, created_at) VALUES (?1,?2,?3,?4)",
    )
      .bind(crypto.randomUUID(), postId, userId, now)
      .run();
  }

  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM post_likes WHERE post_id = ?1",
  )
    .bind(postId)
    .first<{ n: number }>();

  return Response.json({ ok: true, liked: !existing, count: count?.n ?? 0 });
}
