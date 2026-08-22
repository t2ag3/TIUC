import { UUID_RE } from "./config";
import { bad } from "./utils";
import type { AppEnv } from "./types";

// 簡易な非線形レベルカーブ(表示用のみ。実効重みは levels テーブルで別管理) [流用]
function pointsCostForLevel(level: number): number {
  return 4 + Math.floor((level - 1) / 3) * 2;
}
function pointsForLevel(level: number): number {
  let p = 0;
  for (let l = 1; l < level; l++) p += pointsCostForLevel(l);
  return p;
}
function levelFromPoints(pointsTotal: number): number {
  let level = 1;
  while (pointsForLevel(level + 1) <= pointsTotal) level++;
  return level;
}

// =====================================================================
// マイページ(本人の履歴)。user_id を知っていることのみを根拠に閲覧可 [流用]
// =====================================================================
export async function mypage(request: Request, env: AppEnv): Promise<Response> {
  const sp = new URL(request.url).searchParams;
  const userId = String(sp.get("user_id") || "");
  if (!UUID_RE.test(userId)) return bad("ユーザーIDが不正です");

  const [summary, postsRes, eventsRes, levelsRes, judgmentsRes, correctionsRes] = await Promise.all([
    env.DB.prepare(
      `SELECT points_total, post_count, judged_count, corrected_count, adopted_count, streak_count
         FROM users WHERE id = ?1`
    ).bind(userId).first<{
      points_total: number;
      post_count: number;
      judged_count: number;
      corrected_count: number;
      adopted_count: number;
      streak_count: number;
    }>(),
    env.DB.prepare(
      `SELECT id, created_at, lang_pair, place_kind, situation, status, src_thumb_key,
              original_text, translated_text
         FROM posts
        WHERE submitter_id = ?1
        ORDER BY created_at DESC
        LIMIT 100`
    ).bind(userId).all(),
    env.DB.prepare(
      `SELECT kind, points, created_at, post_id, note
         FROM point_events
        WHERE user_id = ?1
        ORDER BY created_at DESC
        LIMIT 200`
    ).bind(userId).all(),
    env.DB.prepare(
      `SELECT lang_pair, submode, display_rank, declared_level
         FROM levels WHERE user_id = ?1`
    ).bind(userId).all(),
    // 過去に自分が判定した投稿(振り返り用。マイページの「違和感チェック」履歴)
    env.DB.prepare(
      `SELECT j.post_id, j.verdict, j.category, j.created_at,
              p.lang_pair, p.situation, p.status AS post_status,
              p.src_thumb_key, p.tgt_thumb_key
         FROM judgments j JOIN posts p ON p.id = j.post_id
        WHERE j.judge_id = ?1
        ORDER BY j.created_at DESC
        LIMIT 100`
    ).bind(userId).all(),
    // 過去に自分が提案した修正(振り返り用。マイページの「修正提案」履歴)
    env.DB.prepare(
      `SELECT c.id AS correction_id, c.post_id, c.verdict, c.fixed_text, c.explanation,
              c.status AS correction_status, c.created_at,
              p.lang_pair, p.situation, p.original_text, p.translated_text, p.status AS post_status,
              p.src_image_key, p.tgt_image_key
         FROM corrections c JOIN posts p ON p.id = c.post_id
        WHERE c.curator_id = ?1
        ORDER BY c.created_at DESC
        LIMIT 100`
    ).bind(userId).all(),
  ]);

  const pointsTotal = summary?.points_total ?? 0;
  return Response.json({
    ok: true,
    summary: {
      points_total: pointsTotal,
      level: levelFromPoints(pointsTotal),
      post_count: summary?.post_count ?? 0,
      judged_count: summary?.judged_count ?? 0,
      corrected_count: summary?.corrected_count ?? 0,
      adopted_count: summary?.adopted_count ?? 0,
      streak_count: summary?.streak_count ?? 0,
    },
    posts: postsRes.results,
    point_events: eventsRes.results,
    levels: levelsRes.results,
    judgments: judgmentsRes.results,
    corrections: correctionsRes.results,
  });
}

