import { UUID_RE } from "./config";
import { getVerifiedAdminEmail } from "./auth";
import { bad } from "./utils";
import type { AppEnv } from "./types";

export async function serveImage(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const key = decodeURIComponent(path.slice(5));
  let authorized = false;

  // 管理画面(投稿の手動修正・削除)は、キュー参加や採用状況に関わらずどの投稿の
  // 写真も閲覧できる必要がある
  if (!authorized && (await getVerifiedAdminEmail(request, env))) {
    authorized = true;
  }

  const userId = String(url.searchParams.get("user_id") || "");
  if (!authorized && UUID_RE.test(userId)) {
    const row = await env.DB.prepare(
      `SELECT 1 FROM posts
			  WHERE (src_image_key = ?1 OR src_thumb_key = ?1 OR tgt_image_key = ?1 OR tgt_thumb_key = ?1)
			    AND submitter_id = ?2`,
    )
      .bind(key, userId)
      .first();
    authorized = !!row;
  }

  const judgeId = String(url.searchParams.get("judge_id") || "");
  if (!authorized && UUID_RE.test(judgeId)) {
    const row = await env.DB.prepare(
      `SELECT 1 FROM posts
			  WHERE (src_thumb_key = ?1 OR tgt_thumb_key = ?1)
			    AND (
			      (status = 'pending_judgment' AND submitter_id <> ?2
			         AND NOT EXISTS (SELECT 1 FROM judgments j WHERE j.post_id = posts.id AND j.judge_id = ?2))
			      -- 過去に自分が判定した投稿はステータスに関わらずマイページの振り返りで閲覧できる
			      OR EXISTS (SELECT 1 FROM judgments j2 WHERE j2.post_id = posts.id AND j2.judge_id = ?2)
			    )`,
    )
      .bind(key, judgeId)
      .first();
    authorized = !!row;
  }

  const curatorId = String(url.searchParams.get("curator_id") || "");
  if (!authorized && UUID_RE.test(curatorId)) {
    const row = await env.DB.prepare(
      `SELECT 1 FROM posts
			  WHERE (src_image_key = ?1 OR src_thumb_key = ?1 OR tgt_image_key = ?1 OR tgt_thumb_key = ?1)
			    AND (
			      (status = 'needs_fix' AND submitter_id <> ?2)
			      -- 過去に自分が提案した修正はステータスに関わらずマイページの振り返りで閲覧できる
			      OR EXISTS (SELECT 1 FROM corrections c WHERE c.post_id = posts.id AND c.curator_id = ?2)
			    )`,
    )
      .bind(key, curatorId)
      .first();
    authorized = !!row;
  }

  // 確定・採用済みの投稿はコミュニティ検証済みの情報として地図から誰でも閲覧できる
  // (2026-08-23改定。未確定の投稿は従来通りレビュアー認証必須のまま)
  if (!authorized) {
    const row = await env.DB.prepare(
      `SELECT 1 FROM posts
			  WHERE (src_image_key = ?1 OR src_thumb_key = ?1)
			    AND status IN ('confirmed', 'adopted')`,
    )
      .bind(key)
      .first();
    authorized = !!row;
  }

  if (!authorized) return bad("アクセスできません", 401);

  const obj = await env.PHOTOS.get(key);
  if (!obj) return new Response("not found", { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", "private, max-age=3600");
  return new Response(obj.body, { headers });
}
