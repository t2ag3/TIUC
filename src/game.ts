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

// ドロップするレア度ティアの抽選テーブル。合計100になるよう厳密指定(ユーザー指示、2026-08-27)。
// ★1〜3は共通の基本種プール(species.rarity=1、60種)から、★4は専用の特別枠プール
// (species.rarity=4、mystery等)から種族を選ぶ。実際のレア度は種族固定ではなく、
// このドロップ時のティア抽選と合成(migrations/0016)で決まる。
const TIER_WEIGHTS: Array<{ tier: number; weight: number }> = [
  { tier: 1, weight: 80 },
  { tier: 2, weight: 15 },
  { tier: 3, weight: 4.5 },
  { tier: 4, weight: 0.5 },
];

export type Drop = { speciesId: string; nameKey: string; rarity: number };

function weightedPickTier(table: Array<{ tier: number; weight: number }>): number {
  const total = table.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * total;
  for (const t of table) {
    if (r < t.weight) return t.tier;
    r -= t.weight;
  }
  return table[table.length - 1].tier;
}

async function pickSpeciesForTier(
  env: AppEnv,
  tier: number,
): Promise<{ id: string; nameKey: string }> {
  const rows = await env.DB.prepare(
    "SELECT id, name_key FROM species WHERE rarity = ?1",
  )
    .bind(tier === 4 ? 4 : 1)
    .all<{ id: string; name_key: string }>();
  const pool = rows.results;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  return { id: picked.id, nameKey: picked.name_key };
}

export async function rollNormalDrop(env: AppEnv): Promise<Drop> {
  const tier = weightedPickTier(TIER_WEIGHTS);
  const picked = await pickSpeciesForTier(env, tier);
  return { speciesId: picked.id, nameKey: picked.nameKey, rarity: tier };
}

// レベルアップ・修正確定などの「確定で少し良い」ボーナス枠。★1を除外して再抽選する。
export async function rollRareDrop(env: AppEnv): Promise<Drop> {
  const tier = weightedPickTier(TIER_WEIGHTS.filter((t) => t.tier > 1));
  const picked = await pickSpeciesForTier(env, tier);
  return { speciesId: picked.id, nameKey: picked.nameKey, rarity: tier };
}

// レスポンスJSON用の形。フロントのガチャ演出(gacha-reveal.js)が消費する。
export function dropPayload(drop: Drop) {
  return { species_id: drop.speciesId, name_key: drop.nameKey, rarity: drop.rarity };
}

// character_drops への1行を返す。source_key はイベント単位で一意にし、リトライでの
// 二重ドロップを防ぐ(所持数の加算は migrations/0016 のトリガー任せ、ここではpushしない)。
export function dropStatement(
  env: AppEnv,
  userId: string,
  speciesId: string,
  rarity: number,
  sourceKey: string,
  now: number,
) {
  return env.DB.prepare(
    `INSERT INTO character_drops (user_id, species_id, rarity, source_key, created_at)
     VALUES (?1,?2,?3,?4,?5) ON CONFLICT(source_key) DO NOTHING`,
  ).bind(userId, speciesId, rarity, sourceKey, now);
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
      const drop = await rollRareDrop(env);
      stmts.push(
        dropStatement(
          env,
          userId,
          drop.speciesId,
          drop.rarity,
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
      `SELECT c.display_species_id, c.character_points,
              (SELECT MAX(uc.rarity) FROM user_characters uc
                WHERE uc.user_id = c.user_id AND uc.species_id = c.display_species_id AND uc.count > 0
              ) AS display_rarity
         FROM characters c
        WHERE c.user_id = ?1`,
    )
      .bind(userId)
      .first<{
        display_species_id: string | null;
        display_rarity: number | null;
        character_points: number;
      }>(),
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
    character_points: display?.character_points ?? 0,
    recent: recent.results,
  });
}

// =====================================================================
// キャラガチャ(ユーザー指示・2026-08-29改定)：行動のたびに自動で1体抽選していたのを、
// 行動ではキャラポイントだけを貯め(migrations/0019のトリガーで自動加算)、貯めたポイントを
// 使ってユーザー自身がガチャを回す方式に変更。ドロップ機構自体(character_drops→
// user_charactersの反映)は既存のdropStatement()をそのまま使う。
// =====================================================================
const GACHA_ALLOWED_TIMES = new Set([1, 5]);

export async function gameGachaPull(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  const body = await request.json<Record<string, unknown>>();
  const userId = String(body.user_id || "");
  const times = Math.trunc(Number(body.times));
  const lang = String(body.lang || "ja");
  if (!UUID_RE.test(userId)) return bad("ユーザーIDが不正です");
  if (!GACHA_ALLOWED_TIMES.has(times)) return bad("timesは1か5で指定してください");

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "INSERT INTO users (id, created_at) VALUES (?1, ?2) ON CONFLICT(id) DO NOTHING",
  )
    .bind(userId, now)
    .run();
  await env.DB.prepare(
    "INSERT INTO characters (user_id, created_at, updated_at) VALUES (?1,?2,?2) ON CONFLICT(user_id) DO NOTHING",
  )
    .bind(userId, now)
    .run();

  // 二重消費防止(同時押し等)：先に単独で減算し、影響行数0なら残高不足として中断する
  const debit = await env.DB.prepare(
    `UPDATE characters SET character_points = character_points - ?2, updated_at = ?3
      WHERE user_id = ?1 AND character_points >= ?2`,
  )
    .bind(userId, times, now)
    .run();
  if (debit.meta.changes === 0) return bad("キャラポイントが足りません");

  const ownedRows = await env.DB.prepare(
    "SELECT DISTINCT species_id FROM user_characters WHERE user_id = ?1 AND count > 0",
  )
    .bind(userId)
    .all<{ species_id: string }>();
  const owned = new Set(ownedRows.results.map((r) => r.species_id));

  const pullId = crypto.randomUUID();
  const drops: Drop[] = [];
  for (let i = 0; i < times; i++) drops.push(await rollNormalDrop(env));

  await env.DB.batch(
    drops.map((d, i) =>
      dropStatement(env, userId, d.speciesId, d.rarity, `drop:gacha:${pullId}:${i}`, now),
    ),
  );

  const i18nMap = await fetchSpeciesI18nMap(env, lang);
  const results = drops.map((d) => {
    const isNew = !owned.has(d.speciesId);
    owned.add(d.speciesId);
    const i18n = i18nMap.get(d.speciesId);
    return {
      ...dropPayload(d),
      name: i18n?.name ?? d.nameKey,
      desc: i18n?.desc ?? null,
      is_new: isNew,
    };
  });

  const remaining = await env.DB.prepare(
    "SELECT character_points FROM characters WHERE user_id = ?1",
  )
    .bind(userId)
    .first<{ character_points: number }>();

  return Response.json({
    ok: true,
    drops: results,
    remaining_points: remaining?.character_points ?? 0,
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
    icon: "👀",
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
  {
    id: "streak_3",
    title: "三日坊主卒業",
    desc: "3日連続で活動する",
    reward: 10,
    icon: "🔥",
  },
  {
    id: "streak_7",
    title: "一週間の相棒",
    desc: "7日連続で活動する",
    reward: 20,
    icon: "🔥",
  },
  {
    id: "streak_14",
    title: "半月マスター",
    desc: "14日連続で活動する",
    reward: 35,
    icon: "🔥",
  },
  {
    id: "streak_30",
    title: "ひと月の主",
    desc: "30日連続で活動する",
    reward: 60,
    icon: "🔥",
  },
];

// streak_best（過去最長ストリーク。途切れても減らないハイウォーターマーク）に対する
// マイルストーン日数。questDone/gameClaimQuest の両方から参照する。
const STREAK_MILESTONES: Record<string, number> = {
  streak_3: 3,
  streak_7: 7,
  streak_14: 14,
  streak_30: 30,
};

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
  if (id in STREAK_MILESTONES) {
    const r = await env.DB.prepare(
      "SELECT streak_best AS n FROM users WHERE id=?1",
    )
      .bind(userId)
      .first<{ n: number }>();
    return (r?.n ?? 0) >= STREAK_MILESTONES[id];
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
  // 図鑑コンプリートと30日ストリークは、採用フロー実装まで唯一到達可能な mystery(★4)の入手経路。
  // 7日・14日ストリークはレア確定ドロップで途中の山場を作る。
  if (questId === "zukan_12" || questId === "streak_30") {
    stmts.push(
      dropStatement(env, userId, "mystery", 4, `drop:quest:${userId}:${questId}`, now),
    );
  } else if (questId === "streak_7" || questId === "streak_14") {
    const drop = await rollRareDrop(env);
    stmts.push(
      dropStatement(env, userId, drop.speciesId, drop.rarity, `drop:quest:${userId}:${questId}`, now),
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

// 合成に必要な同ティア枚数。1→2は2枚、2→3は3枚(ユーザー指示、2026-08-27)。★4への合成経路は無い。
const SYNTHESIS_REQUIREMENTS: Record<number, number> = { 1: 2, 2: 3 };

// キャラ名・説明文の言語解決(migrations/0020でD1化。ユーザー指示、2026-08-29)。
// UI言語はクライアント側(localStorage)にしか無いため、呼び出し側が明示的にlangを渡す必要がある。
const VALID_SPECIES_LANGS = new Set(["ja", "en", "zh", "ko", "fr", "es"]);

async function fetchSpeciesI18nMap(
  env: AppEnv,
  lang: string,
): Promise<Map<string, { name: string; desc: string | null }>> {
  const targetLang = VALID_SPECIES_LANGS.has(lang) ? lang : "ja";
  const rows = await env.DB.prepare(
    "SELECT species_id, lang, name, desc FROM species_i18n WHERE lang IN (?1, 'ja')",
  )
    .bind(targetLang)
    .all<{ species_id: string; lang: string; name: string; desc: string | null }>();

  const map = new Map<string, { name: string; desc: string | null }>();
  // 先にjaで埋め、targetLangがja以外ならそれで上書きする(targetLang優先、無ければjaにフォールバック)
  for (const r of rows.results) {
    if (r.lang === "ja") map.set(r.species_id, { name: r.name, desc: r.desc });
  }
  if (targetLang !== "ja") {
    for (const r of rows.results) {
      if (r.lang === targetLang) map.set(r.species_id, { name: r.name, desc: r.desc });
    }
  }
  return map;
}

export async function gameCollection(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  const url = new URL(request.url);
  const userId = String(url.searchParams.get("user_id") || "");
  if (!UUID_RE.test(userId)) return bad("ユーザーIDが不正です");
  const lang = String(url.searchParams.get("lang") || "ja");

  const [speciesRows, ownedRows, i18nMap] = await Promise.all([
    env.DB.prepare(
      "SELECT id, name_key, rarity, sort_order FROM species ORDER BY sort_order",
    ).all<{ id: string; name_key: string; rarity: number; sort_order: number }>(),
    env.DB.prepare(
      "SELECT species_id, rarity, count, first_at FROM user_characters WHERE user_id = ?1 AND count > 0",
    )
      .bind(userId)
      .all<{ species_id: string; rarity: number; count: number; first_at: number }>(),
    fetchSpeciesI18nMap(env, lang),
  ]);

  type Agg = {
    total: number;
    maxRarity: number;
    firstAt: number;
    tiers: Record<number, number>;
  };
  const bySpecies = new Map<string, Agg>();
  for (const row of ownedRows.results) {
    const cur = bySpecies.get(row.species_id) ?? {
      total: 0,
      maxRarity: 0,
      firstAt: row.first_at,
      tiers: {},
    };
    cur.total += row.count;
    cur.maxRarity = Math.max(cur.maxRarity, row.rarity);
    cur.firstAt = Math.min(cur.firstAt, row.first_at);
    cur.tiers[row.rarity] = row.count;
    bySpecies.set(row.species_id, cur);
  }

  // rarity は表示用(未所持なら種族の基本レア度、所持していれば合成込みの最高到達ティア)。
  const species = speciesRows.results.map((s) => {
    const owned = bySpecies.get(s.id);
    const i18n = i18nMap.get(s.id);
    return {
      id: s.id,
      name: i18n?.name ?? s.name_key,
      desc: i18n?.desc ?? null,
      rarity: owned ? owned.maxRarity : s.rarity,
      sort_order: s.sort_order,
      count: owned?.total ?? 0,
      first_at: owned?.firstAt ?? null,
      tiers: owned?.tiers ?? {},
    };
  });

  return Response.json({ ok: true, species });
}

export async function gameSynthesize(
  request: Request,
  env: AppEnv,
): Promise<Response> {
  const body = await request.json<Record<string, unknown>>();
  const userId = String(body.user_id || "");
  const speciesId = String(body.species_id || "");
  const fromRarity = Number(body.from_rarity);
  if (!UUID_RE.test(userId)) return bad("ユーザーIDが不正です");
  if (!speciesId) return bad("species_id が必要です");
  const required = SYNTHESIS_REQUIREMENTS[fromRarity];
  if (!required) return bad("このレア度は合成できません");

  const row = await env.DB.prepare(
    "SELECT count FROM user_characters WHERE user_id=?1 AND species_id=?2 AND rarity=?3",
  )
    .bind(userId, speciesId, fromRarity)
    .first<{ count: number }>();
  if (!row || row.count < required) return bad("合成に必要な数が足りません");

  const now = Math.floor(Date.now() / 1000);
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE user_characters SET count = count - ?4 WHERE user_id=?1 AND species_id=?2 AND rarity=?3",
    ).bind(userId, speciesId, fromRarity, required),
    env.DB.prepare(
      `INSERT INTO user_characters (user_id, species_id, rarity, count, first_at)
       VALUES (?1,?2,?3,1,?4)
       ON CONFLICT(user_id, species_id, rarity) DO UPDATE SET count = count + 1`,
    ).bind(userId, speciesId, fromRarity + 1, now),
  ]);

  return Response.json({ ok: true, new_rarity: fromRarity + 1 });
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
    "SELECT SUM(count) AS n FROM user_characters WHERE user_id=?1 AND species_id=?2",
  )
    .bind(userId, speciesId)
    .first<{ n: number | null }>();
  if (!owned || (owned.n ?? 0) <= 0) return bad("所持していないキャラです");

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
