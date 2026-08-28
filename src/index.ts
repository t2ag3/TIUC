// =====================================================================
// TIUC: Today is under construction.
// Worker entry point / routing.
// =====================================================================

import { authMe, googleAuthCallback, googleAuthStart } from "./auth";
import {
  adminActivity,
  adminAdjustPoints,
  adminLeaderboard,
  adminPageviews,
  adminPostDelete,
  adminPostDetail,
  adminPostEdit,
  adminPostsList,
  adminSpeciesCreate,
  adminSpeciesImage,
  adminWhoami,
  serveSpeciesImage,
  trackPageview,
} from "./admin";
import {
  gameCharacter,
  gameClaimQuest,
  gameCollection,
  gameEncyclopedia,
  gameImpact,
  gameMapSpots,
  gameQuests,
  gameSelectDisplayCharacter,
  gameSynthesize,
} from "./game";
import { serveImage } from "./images";
import { publicMap } from "./map";
import {
  analyzePostPhoto,
  createPost,
  deletePost,
  nearbyCheck,
  togglePostLike,
} from "./posts";
import {
  correctNext,
  correctSubmit,
  correctVoteNext,
  correctVoteSubmit,
  judgeNext,
  judgeSubmit,
} from "./review";
import { mypage } from "./user";
import { bad } from "./utils";
import type { AppEnv, CookieAttrs } from "./types";

export default {
  async fetch(request: Request, env: AppEnv): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const cookieAttrs: CookieAttrs =
      url.protocol === "https:" ? "; Secure" : "";

    try {
      // --- ①撮影投稿 ---
      if (path === "/api/posts" && request.method === "POST")
        return await createPost(request, env);
      if (path === "/api/posts/analyze" && request.method === "POST")
        return await analyzePostPhoto(request, env);
      if (path === "/api/posts/delete" && request.method === "POST")
        return await deletePost(request, env);
      if (path === "/api/nearby" && request.method === "GET")
        return await nearbyCheck(request, env);
      if (path === "/api/posts/like" && request.method === "POST")
        return await togglePostLike(request, env);

      // --- ②違和感チェック ---
      if (path === "/api/judge/next" && request.method === "GET")
        return await judgeNext(request, env);
      if (path === "/api/judge/submit" && request.method === "POST")
        return await judgeSubmit(request, env);

      // --- ③正誤・修正・解説 ---
      if (path === "/api/correct/next" && request.method === "GET")
        return await correctNext(request, env);
      if (path === "/api/correct/submit" && request.method === "POST")
        return await correctSubmit(request, env);
      if (path === "/api/correct/vote/next" && request.method === "GET")
        return await correctVoteNext(request, env);
      if (path === "/api/correct/vote/submit" && request.method === "POST")
        return await correctVoteSubmit(request, env);

      // --- ゲーム層(Kubiaka由来 / 翻訳ドメイン用に再設計) ---
      if (path === "/api/game/character" && request.method === "GET")
        return await gameCharacter(request, env);
      if (path === "/api/game/quests" && request.method === "GET")
        return await gameQuests(request, env);
      if (path === "/api/game/quests/claim" && request.method === "POST")
        return await gameClaimQuest(request, env);
      if (path === "/api/game/encyclopedia" && request.method === "GET")
        return await gameEncyclopedia(request, env);
      if (path === "/api/game/impact" && request.method === "GET")
        return await gameImpact(request, env);
      if (path === "/api/game/collection" && request.method === "GET")
        return await gameCollection(request, env);
      if (path === "/api/game/collection/select" && request.method === "POST")
        return await gameSelectDisplayCharacter(request, env);
      if (path === "/api/game/synthesize" && request.method === "POST")
        return await gameSynthesize(request, env);
      if (path === "/api/game/map-spots" && request.method === "GET")
        return await gameMapSpots(request, env);

      // --- 閲覧モード ---
      if (path === "/api/map" && request.method === "GET")
        return await publicMap(request, env);
      if (path === "/api/mypage" && request.method === "GET")
        return await mypage(request, env);

      // --- Google ログイン ---
      if (path === "/api/auth/google/start" && request.method === "GET")
        return await googleAuthStart(request, env, cookieAttrs);
      if (path === "/api/auth/google/callback" && request.method === "GET")
        return await googleAuthCallback(request, env, cookieAttrs);
      if (path === "/api/auth/me" && request.method === "GET")
        return await authMe(request, env);
      if (path === "/api/auth/logout") {
        return new Response(JSON.stringify({ ok: true }), {
          headers: {
            "content-type": "application/json",
            "set-cookie": `uid=; HttpOnly${cookieAttrs}; SameSite=Strict; Path=/; Max-Age=0`,
          },
        });
      }

      // --- 管理画面 ---
      if (path === "/api/admin/whoami" && request.method === "GET")
        return await adminWhoami(request, env);
      if (path === "/api/admin/posts" && request.method === "GET")
        return await adminPostsList(request, env);
      if (path === "/api/admin/posts/detail" && request.method === "GET")
        return await adminPostDetail(request, env);
      if (path === "/api/admin/posts/edit" && request.method === "POST")
        return await adminPostEdit(request, env);
      if (path === "/api/admin/posts/delete" && request.method === "POST")
        return await adminPostDelete(request, env);
      if (path === "/api/admin/leaderboard" && request.method === "GET")
        return await adminLeaderboard(request, env);
      if (path === "/api/admin/users/adjust_points" && request.method === "POST")
        return await adminAdjustPoints(request, env);
      if (path === "/api/admin/activity" && request.method === "GET")
        return await adminActivity(request, env);
      if (path === "/api/admin/pageviews" && request.method === "GET")
        return await adminPageviews(request, env);
      if (path === "/api/admin/species/create" && request.method === "POST")
        return await adminSpeciesCreate(request, env);
      if (path === "/api/admin/species/image" && request.method === "POST")
        return await adminSpeciesImage(request, env);
      if (path === "/api/track/pageview" && request.method === "POST")
        return await trackPageview(request, env);
      if (path.startsWith("/species-img/"))
        return await serveSpeciesImage(request, env);

      if (path.startsWith("/img/")) return await serveImage(request, env);

      if (path === "/api/health") {
        const r = await env.DB.prepare(
          `SELECT COUNT(*) AS total,
					        SUM(status = 'pending_judgment') AS pending,
					        SUM(status = 'needs_fix') AS needs_fix,
					        SUM(status = 'confirmed') AS confirmed,
					        SUM(status = 'adopted') AS adopted
					   FROM posts`,
        ).first();
        return Response.json({ ok: true, ...r });
      }

      return new Response("not found", { status: 404 });
    } catch (e) {
      console.error(e);
      return bad(
        "サーバ側でエラーが発生しました: " +
          (e instanceof Error ? e.message : String(e)),
        500,
      );
    }
  },
};
