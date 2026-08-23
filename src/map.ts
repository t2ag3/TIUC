import { meshBounds } from "../public/mesh.js";

import { LANG_PAIRS, MAP_LEVELS } from "./config";

import { bad } from "./utils";
import type { AppEnv } from "./types";

// =====================================================================
// 公開マップ(認証不要)。メッシュ集計に加え、投稿直後から正確な座標付き
// ピンを公開する(2026-08-22、rule1改定。店の採用を待たない)。
// =====================================================================
export async function publicMap(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  const sp = new URL(request.url).searchParams;

  const level = sp.get("level") || "mesh3";
  if (!MAP_LEVELS.has(level))
    return bad("level は mesh3・mesh4・mesh5 のいずれかを指定してください");

  const bboxRaw = sp.get("bbox");
  if (!bboxRaw) return bad("bbox が必要です");
  const parts = bboxRaw.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n)))
    return bad("bbox の形式が不正です");
  let [minLng, minLat, maxLng, maxLat] = parts;
  if (minLng > maxLng || minLat > maxLat) return bad("bbox の範囲が不正です");
  minLat = Math.max(20, minLat);
  maxLat = Math.min(46, maxLat);
  minLng = Math.max(122, minLng);
  maxLng = Math.min(154, maxLng);

  const langPairs = String(sp.get("lang_pair") || "ja-en,ja-zh,ja-ko")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => LANG_PAIRS.has(s));
  if (!langPairs.length) return bad("lang_pair の指定が不正です");
  const langSql = langPairs.map((_, i) => `?${i + 5}`).join(",");

  // いいね数・修正案への賛成票数での絞り込み(任意。0件なら未指定と同じ)
  const minLikes = Math.max(0, Number(sp.get("min_likes")) || 0);
  const minAgree = Math.max(0, Number(sp.get("min_agree")) || 0);

  const cache = (caches as CacheStorage & { default: Cache }).default;
  const url = new URL(request.url);
  const cacheKey = new Request(url.toString(), { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const meshSql = `
    SELECT ${level} AS mesh,
           COUNT(*) AS post_count,
           COUNT(*) FILTER (WHERE status = 'needs_fix') AS needs_fix_count,
           COUNT(*) FILTER (WHERE status IN ('confirmed','adopted')) AS confirmed_count,
           MAX(COALESCE(observed_at, created_at)) AS last_post_at
      FROM posts
     WHERE lat BETWEEN ?1 AND ?2 AND lng BETWEEN ?3 AND ?4
       AND lang_pair IN (${langSql})
     GROUP BY ${level}
     LIMIT 2000`;

  // rule1改定(2026-08-22): 投稿直後から公開マップに正確なピンを出す。
  // 写真品質NGで機械的に除外された投稿(auto_rejected)のみ除く。
  // like_count: 投稿への「いいね」総数。agree_count: 修正案のうち最も賛成票が
  // 集まったものの票数(未確定でも先頭の提案を指標にする)。explanation は
  // 確定した修正案の解説(2026-08-23改定: 確定投稿は地図から写真ごと閲覧可)。
  const havingParts = [];
  if (minLikes > 0) havingParts.push("like_count >= " + minLikes);
  if (minAgree > 0) havingParts.push("agree_count >= " + minAgree);
  const havingSql = havingParts.length
    ? `WHERE ${havingParts.join(" AND ")}`
    : "";

  const pinSql = `
    SELECT * FROM (
      SELECT id, lat, lng, lang_pair, place_kind, status, original_text, translated_text,
             src_thumb_key,
             COALESCE(observed_at, created_at) AS event_at,
             (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = posts.id) AS like_count,
             COALESCE((
               SELECT MAX(agree_cnt) FROM (
                 SELECT COUNT(*) FILTER (WHERE v.agree = 1) AS agree_cnt
                   FROM corrections c LEFT JOIN votes v ON v.correction_id = c.id
                  WHERE c.post_id = posts.id
                  GROUP BY c.id
               )
             ), 0) AS agree_count,
             (SELECT c2.explanation FROM corrections c2
               WHERE c2.post_id = posts.id AND c2.status = 'confirmed' LIMIT 1) AS explanation
        FROM posts
       WHERE status <> 'auto_rejected'
         AND lat BETWEEN ?1 AND ?2 AND lng BETWEEN ?3 AND ?4
         AND lang_pair IN (${langSql})
    )
    ${havingSql}
    LIMIT 500`;

  const bind = [minLat, maxLat, minLng, maxLng, ...langPairs];
  const [meshRows, pinRows] = await Promise.all([
    env.DB.prepare(meshSql)
      .bind(...bind)
      .all<{
        mesh: string;
        post_count: number;
        needs_fix_count: number;
        confirmed_count: number;
        last_post_at: number | null;
      }>(),
    env.DB.prepare(pinSql)
      .bind(...bind)
      .all<{
        id: string;
        lat: number;
        lng: number;
        lang_pair: string;
        place_kind: string;
        status: string;
        original_text: string | null;
        translated_text: string | null;
        src_thumb_key: string;
        event_at: number;
        like_count: number;
        agree_count: number;
        explanation: string | null;
      }>(),
  ]);

  const features = [];
  for (const row of meshRows.results) {
    const b = meshBounds(row.mesh);
    features.push({
      type: "Feature",
      properties: {
        kind: "mesh",
        mesh: row.mesh,
        level,
        post_count: row.post_count,
        needs_fix_count: row.needs_fix_count,
        confirmed_count: row.confirmed_count,
        last_post_at: row.last_post_at,
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [b.lngMin, b.latMin],
            [b.lngMax, b.latMin],
            [b.lngMax, b.latMax],
            [b.lngMin, b.latMax],
            [b.lngMin, b.latMin],
          ],
        ],
      },
    });
  }
  for (const row of pinRows.results) {
    const isConfirmed = row.status === "confirmed" || row.status === "adopted";
    features.push({
      type: "Feature",
      properties: {
        kind: "pin",
        id: row.id,
        lang_pair: row.lang_pair,
        place_kind: row.place_kind,
        status: row.status,
        original_text: row.original_text,
        translated_text: row.translated_text,
        // 未確定の投稿は写真キーを渡さない(そもそも/imgが401を返すが、
        // フロント側で試行させないため確定・採用済みのみ含める)
        src_thumb_key: isConfirmed ? row.src_thumb_key : null,
        explanation: isConfirmed ? row.explanation : null,
        event_at: row.event_at,
        like_count: row.like_count,
        agree_count: row.agree_count,
      },
      geometry: { type: "Point", coordinates: [row.lng, row.lat] },
    });
  }

  const body = JSON.stringify({ type: "FeatureCollection", features });
  const response = new Response(body, {
    headers: {
      "content-type": "application/geo+json",
      "cache-control": "public, max-age=20",
    },
  });
  await cache.put(cacheKey, response.clone());
  return response;
}
