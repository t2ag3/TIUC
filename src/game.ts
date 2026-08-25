import { UUID_RE } from "./config";
import { bad } from "./utils";
import type { AppEnv } from "./types";

function xpCostForLevel(level: number): number {
  return 2 + Math.floor((level - 1) / 3);
}
function xpForLevel(level: number): number {
  let xp = 0;
  for (let l = 1; l < level; l++) xp += xpCostForLevel(l);
  return xp;
}
function levelFromXp(total: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= total) level++;
  return level;
}
// レベル称号。相棒(1体育成)の見た目段階に代わり、収集ガチャの世界観での称号を返す。
const LEVEL_TITLES: Array<{ min: number; key: string }> = [
  { min: 1, key: "novice" },
  { min: 4, key: "apprentice" },
  { min: 7, key: "journeyman" },
  { min: 10, key: "master" },
  { min: 14, key: "sage" },
];
function levelTitleKey(level: number): string {
  let key = LEVEL_TITLES[0].key;
  for (const t of LEVEL_TITLES) if (level >= t.min) key = t.key;
  return key;
}

// 通常ドロップ(投稿・判定・修正提案・投票)とレア確定ドロップ(レベルアップ・修正確定)の
// 抽選テーブル。種族は migrations/0012 で固定4種のみ投入しているため、コード側に直書きする
// (QUESTS配列と同じくハードコード方針)。
const NORMAL_DROP_TABLE: Array<{ id: string; weight: number }> = [
  { id: "sparrow", weight: 65 },
  { id: "white_eye", weight: 25 },
  { id: "kingfisher", weight: 10 },
];
const RARE_DROP_TABLE: Array<{ id: string; weight: number }> = [
  { id: "white_eye", weight: 70 },
  { id: "kingfisher", weight: 30 },
];

function weightedPick(table: Array<{ id: string; weight: number }>): string {
  const total = table.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * total;
  for (const t of table) {
    if (r < t.weight) return t.id;
    r -= t.weight;
  }
  return table[table.length - 1].id;
}

export function rollNormalDrop(): string {
  return weightedPick(NORMAL_DROP_TABLE);
}
export function rollRareDrop(): string {
  return weightedPick(RARE_DROP_TABLE);
}

// character_drops への1行を返す。source_key はイベント単位で一意にし、リトライでの
// 二重ドロップを防ぐ(所持数の加算は migrations/0012 のトリガー任せ、ここではpushしない)。
export function dropStatement(
  env: AppEnv,
  userId: string,
  speciesId: string,
  sourceKey: string,
  now: number,
) {
  return env.DB.prepare(
    `INSERT INTO character_drops (user_id, species_id, source_key, created_at)
     VALUES (?1,?2,?3,?4) ON CONFLICT(source_key) DO NOTHING`,
  ).bind(userId, speciesId, sourceKey, now);
}

async function ensureCharacter(env: AppEnv, userId: string): Promise<number> {
  const now = Math.floor(Date.now() / 1000);

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO users (id, created_at) VALUES (?1,?2) ON CONFLICT(id) DO NOTHING",
    ).bind(userId, now),

    env.DB.prepare(
      "INSERT INTO characters (user_id, created_at, updated_at) VALUES (?1,?2,?2) ON CONFLICT(user_id) DO NOTHING",
    ).bind(userId, now),
  ]);

  const row = await env.DB.prepare(
    `SELECT
       u.points_total AS contribution_xp,
       COALESCE((
         SELECT SUM(xe.xp)
         FROM xp_events xe
         WHERE xe.user_id = u.id
       ), 0) AS bonus_xp,
       c.last_level AS last_level
     FROM users u
     JOIN characters c ON c.user_id = u.id
     WHERE u.id = ?1`,
  )
    .bind(userId)
    .first<{
      contribution_xp: number;
      bonus_xp: number;
      last_level: number;
    }>();

  const xpTotal = (row?.contribution_xp ?? 0) + (row?.bonus_xp ?? 0);
  const lastLevel = row?.last_level ?? 1;
  const currentLevel = levelFromXp(xpTotal);

  const stmts = [
    env.DB.prepare(
      `UPDATE characters
          SET xp_total = ?2,
              last_level = ?3,
              updated_at = ?4
        WHERE user_id = ?1`,
    ).bind(userId, xpTotal, currentLevel, now),
  ];

  // レベルが上がっていたら、その到達を1回だけレア確定ドロップとして記録する。
  // source_key がレベル単位で一意なので、複数エンドポイントから呼ばれても二重発行されない。
  if (currentLevel > lastLevel) {
    for (let lv = lastLevel + 1; lv <= currentLevel; lv++) {
      stmts.push(
        dropStatement(
          env,
          userId,
          rollRareDrop(),
          `drop:levelup:${userId}:${lv}`,
          now,
        ),
      );
    }
  }

  await env.DB.batch(stmts);

  return xpTotal;
}

export async function gameCharacter(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  const userId = String(new URL(request.url).searchParams.get("user_id") || "");
  if (!UUID_RE.test(userId)) return bad("ユーザーIDが不正です");
  const xpTotal = await ensureCharacter(env, userId);
  const level = levelFromXp(xpTotal);
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const [recent, streak, display] = await Promise.all([
    env.DB.prepare(
      "SELECT kind,xp,created_at,note FROM xp_events WHERE user_id=?1 ORDER BY created_at DESC,id DESC LIMIT 20",
    )
      .bind(userId)
      .all(),
    env.DB.prepare("SELECT streak_count AS n FROM users WHERE id=?1")
      .bind(userId)
      .first<{ n: number }>(),
    env.DB.prepare(
      `SELECT c.display_species_id, s.rarity AS display_rarity
         FROM characters c LEFT JOIN species s ON s.id = c.display_species_id
        WHERE c.user_id = ?1`,
    )
      .bind(userId)
      .first<{ display_species_id: string | null; display_rarity: number | null }>(),
  ]);
  return Response.json({
    ok: true,
    xp_total: xpTotal,
    level,
    title_key: levelTitleKey(level),
    xp_into_level: xpTotal - base,
    xp_for_next_level: next - base,
    streak_count: streak?.n ?? 0,
    display_species_id: display?.display_species_id ?? null,
    display_rarity: display?.display_rarity ?? null,
    recent: recent.results,
  });
}

type QuestDef = {
  id: string;
  title: string;
  desc: string;
  reward: number;
  icon: string;
};
const QUESTS: QuestDef[] = [
  {
    id: "first_post",
    title: "はじめての発見",
    desc: "外国語表記を1件投稿する",
    reward: 5,
    icon: "🏅",
  },
  {
    id: "judge_10",
    title: "違和感ハンター",
    desc: "違和感チェックを10件行う",
    reward: 10,
    icon: "🔥",
  },
  {
    id: "fix_1",
    title: "ことばの職人",
    desc: "修正案を1件提出する",
    reward: 10,
    icon: "🛠️",
  },
  {
    id: "confirmed_1",
    title: "みんなの正解",
    desc: "自分の修正案が1件確定する",
    reward: 15,
    icon: "🌐",
  },
  {
    id: "three_languages",
    title: "三言語チャレンジ",
    desc: "英語・中国語・韓国語をすべて発見する",
    reward: 20,
    icon: "👑",
  },
  {
    id: "zukan_12",
    title: "街ことば図鑑コンプリート",
    desc: "12種類の言語×表記カテゴリを埋める",
    reward: 25,
    icon: "⭐",
  },
];

async function questDone(
  env: AppEnv,
  userId: string,
  id: string,
): Promise<boolean> {
  if (id === "first_post") {
    const r = await env.DB.prepare(
      "SELECT post_count AS n FROM users WHERE id=?1",
    )
      .bind(userId)
      .first<{ n: number }>();
    return (r?.n ?? 0) >= 1;
  }
  if (id === "judge_10") {
    const r = await env.DB.prepare(
      "SELECT judged_count AS n FROM users WHERE id=?1",
    )
      .bind(userId)
      .first<{ n: number }>();
    return (r?.n ?? 0) >= 10;
  }
  if (id === "fix_1") {
    const r = await env.DB.prepare(
      "SELECT corrected_count AS n FROM users WHERE id=?1",
    )
      .bind(userId)
      .first<{ n: number }>();
    return (r?.n ?? 0) >= 1;
  }
  if (id === "confirmed_1") {
    const r = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM point_events WHERE user_id=?1 AND kind='correction_confirm_bonus'",
    )
      .bind(userId)
      .first<{ n: number }>();
    return (r?.n ?? 0) >= 1;
  }
  if (id === "three_languages") {
    const r = await env.DB.prepare(
      "SELECT COUNT(DISTINCT lang_pair) AS n FROM posts WHERE submitter_id=?1",
    )
      .bind(userId)
      .first<{ n: number }>();
    return (r?.n ?? 0) >= 3;
  }
  if (id === "zukan_12") {
    const r = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM (SELECT DISTINCT lang_pair,place_kind FROM posts WHERE submitter_id=?1 AND place_kind<>'unknown')",
    )
      .bind(userId)
      .first<{ n: number }>();
    return (r?.n ?? 0) >= 12;
  }
  return false;
}

export async function gameQuests(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  const userId = String(new URL(request.url).searchParams.get("user_id") || "");
  if (!UUID_RE.test(userId)) return bad("ユーザーIDが不正です");
  await ensureCharacter(env, userId);
  const claims = await env.DB.prepare(
    "SELECT quest_id FROM quest_claims WHERE user_id=?1",
  )
    .bind(userId)
    .all<{ quest_id: string }>();
  const claimed = new Set(claims.results.map((x) => x.quest_id));
  const out = [];
  for (const q of QUESTS)
    out.push({
      ...q,
      done: await questDone(env, userId, q.id),
      claimed: claimed.has(q.id),
    });
  return Response.json({ ok: true, quests: out });
}

export async function gameClaimQuest(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  const body = await request.json<Record<string, unknown>>();
  const userId = String(body.user_id || "");
  const questId = String(body.quest_id || "");
  if (!UUID_RE.test(userId)) return bad("ユーザーIDが不正です");
  const q = QUESTS.find((x) => x.id === questId);
  if (!q) return bad("クエストが不正です");
  if (!(await questDone(env, userId, questId)))
    return bad("まだ達成していません");
  await ensureCharacter(env, userId);
  const already = await env.DB.prepare(
    "SELECT 1 FROM quest_claims WHERE user_id=?1 AND quest_id=?2",
  )
    .bind(userId, questId)
    .first();
  if (already) return bad("受け取り済みです");
  const now = Math.floor(Date.now() / 1000);
  const stmts = [
    env.DB.prepare(
      "INSERT INTO quest_claims (user_id,quest_id,claimed_at) VALUES (?1,?2,?3)",
    ).bind(userId, questId, now),
    env.DB.prepare(
      "INSERT INTO xp_events (user_id,kind,xp,source_key,created_at,note) VALUES (?1,'quest',?2,?3,?4,?5)",
    ).bind(userId, q.reward, `quest:${userId}:${questId}`, now, q.title),
    env.DB.prepare(
      "UPDATE characters SET xp_total=xp_total+?2,updated_at=?3 WHERE user_id=?1",
    ).bind(userId, q.reward, now),
  ];
  // 図鑑コンプリートだけは、採用フロー実装まで唯一到達可能な mystery(★4)の入手経路。
  if (questId === "zukan_12") {
    stmts.push(
      dropStatement(env, userId, "mystery", `drop:quest:${userId}:zukan_12`, now),
    );
  }
  await env.DB.batch(stmts);
  return Response.json({ ok: true, reward: q.reward });
}

export async function gameEncyclopedia(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  const userId = String(new URL(request.url).searchParams.get("user_id") || "");
  if (!UUID_RE.test(userId)) return bad("ユーザーIDが不正です");
  const rows = await env.DB.prepare(
    "SELECT lang_pair,place_kind,COUNT(*) AS n FROM posts WHERE submitter_id=?1 AND place_kind<>'unknown' GROUP BY lang_pair,place_kind",
  )
    .bind(userId)
    .all();
  return Response.json({
    ok: true,
    slots: rows.results,
    total: rows.results.length,
    max: 12,
  });
}

export async function gameCollection(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  const userId = String(new URL(request.url).searchParams.get("user_id") || "");
  if (!UUID_RE.test(userId)) return bad("ユーザーIDが不正です");
  const rows = await env.DB.prepare(
    `SELECT s.id, s.name_key, s.rarity, s.sort_order,
            COALESCE(uc.count, 0) AS count, uc.first_at
       FROM species s
       LEFT JOIN user_characters uc ON uc.species_id = s.id AND uc.user_id = ?1
      ORDER BY s.sort_order`,
  )
    .bind(userId)
    .all();
  return Response.json({ ok: true, species: rows.results });
}

// ヒーロー表示用キャラの選択。所持していない種族は選べない(表示だけの詐称を防ぐ)。
export async function gameSelectDisplayCharacter(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  const body = await request.json<Record<string, unknown>>();
  const userId = String(body.user_id || "");
  const speciesId = String(body.species_id || "");
  if (!UUID_RE.test(userId)) return bad("ユーザーIDが不正です");
  if (!speciesId) return bad("species_id が必要です");

  const owned = await env.DB.prepare(
    "SELECT count FROM user_characters WHERE user_id=?1 AND species_id=?2",
  )
    .bind(userId, speciesId)
    .first<{ count: number }>();
  if (!owned || owned.count <= 0) return bad("所持していないキャラです");

  await ensureCharacter(env, userId);
  await env.DB.prepare(
    "UPDATE characters SET display_species_id=?2, updated_at=?3 WHERE user_id=?1",
  )
    .bind(userId, speciesId, Math.floor(Date.now() / 1000))
    .run();

  return Response.json({ ok: true });
}

export async function gameMapSpots(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  const userId = String(new URL(request.url).searchParams.get("user_id") || "");
  if (!UUID_RE.test(userId)) return bad("ユーザーIDが不正です");
  const [spots, areas] = await Promise.all([
    env.DB.prepare(
      `SELECT id, lat, lng, status FROM posts
        WHERE submitter_id = ?1 AND status IN ('confirmed','adopted')
        ORDER BY created_at DESC LIMIT 200`,
    )
      .bind(userId)
      .all(),
    env.DB.prepare(
      `SELECT COUNT(DISTINCT mesh4) AS n FROM posts
        WHERE submitter_id = ?1 AND status IN ('confirmed','adopted')`,
    )
      .bind(userId)
      .first<{ n: number }>(),
  ]);
  return Response.json({
    ok: true,
    spots: spots.results,
    area_count: areas?.n ?? 0,
  });
}

export async function gameImpact(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  const userId = String(new URL(request.url).searchParams.get("user_id") || "");
  if (!UUID_RE.test(userId)) return bad("ユーザーIDが不正です");
  const latest = await env.DB.prepare(
    "SELECT mesh3 FROM posts WHERE submitter_id=?1 ORDER BY created_at DESC LIMIT 1",
  )
    .bind(userId)
    .first<{ mesh3: string }>();
  if (!latest) return Response.json({ ok: true, region: null });
  const since = Math.floor(Date.now() / 1000) - 30 * 86400;
  const stats = await env.DB.prepare(
    `SELECT COUNT(*) AS posts,
            SUM(status='confirmed') AS confirmed,
            SUM(status='adopted') AS adopted,
            COUNT(DISTINCT submitter_id) AS people
       FROM posts WHERE mesh3=?1 AND created_at>=?2`,
  )
    .bind(latest.mesh3, since)
    .first();
  const mine = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM posts WHERE mesh3=?1 AND submitter_id=?2 AND created_at>=?3",
  )
    .bind(latest.mesh3, userId, since)
    .first<{ n: number }>();
  const ahead = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM (
       SELECT submitter_id,COUNT(*) c FROM posts WHERE mesh3=?1 AND created_at>=?2 GROUP BY submitter_id HAVING c>?3
     )`,
  )
    .bind(latest.mesh3, since, mine?.n ?? 0)
    .first<{ n: number }>();
  return Response.json({
    ok: true,
    region: {
      mesh3: latest.mesh3,
      ...stats,
      my_posts: mine?.n ?? 0,
      rank: (ahead?.n ?? 0) + 1,
    },
  });
}
