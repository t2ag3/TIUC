import { t } from "./i18n.js";

// ①②③どの画面からも呼べる、キャラドロップの演出。判定・修正・投票は連続操作の
// キューなので、ここでawaitを強制せず自動で消える(タップで早送りも可)ようにして
// スループットを止めない(CLAUDE.mdのKPI: 締め出し・行き止まりを作らない)。

const RARITY_BG = {
  1: "#e7ece9",
  2: "radial-gradient(circle at 50% 42%, #bfe3d3, #7fc4aa)",
  3: "radial-gradient(circle at 50% 40%, #a9e8ff, #4f9bd6 70%, #2f6ea8)",
  4: "linear-gradient(135deg, #fff27a, #ffb347 26%, #ff6fd8 52%, #8f7bff 76%, #5ec6ff)",
};
const DEFAULT_HOLD_MS = { 1: 900, 2: 1300, 3: 1700, 4: 2400 };

let styleInjected = false;
function ensureStyle() {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    .gacha-reveal-overlay {
      position: fixed;
      inset: 0;
      z-index: 4000;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(18, 28, 20, 0.35);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.18s ease;
    }
    .gacha-reveal-overlay.show {
      opacity: 1;
      pointer-events: auto;
    }
    .gacha-reveal-card {
      width: 148px;
      padding: 14px 10px 12px;
      border-radius: 20px;
      text-align: center;
      background: #fff;
      box-shadow: 0 16px 44px rgba(18, 28, 20, 0.28);
      transform: scale(0.4) translateY(12px);
      opacity: 0;
      transition:
        transform 0.38s cubic-bezier(0.2, 1.4, 0.4, 1),
        opacity 0.25s ease;
    }
    .gacha-reveal-overlay.show .gacha-reveal-card {
      transform: scale(1) translateY(0);
      opacity: 1;
    }
    .gacha-reveal-get {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.06em;
      color: var(--color-accent, #1a5c3a);
      margin: 0 0 6px;
    }
    .gacha-reveal-art {
      height: 76px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 8px;
      overflow: hidden;
    }
    .gacha-reveal-art.r4 {
      background-size: 240% 240%;
      animation: gacha-reveal-shine 2.6s ease infinite;
    }
    @keyframes gacha-reveal-shine {
      0%,
      100% {
        background-position: 0% 50%;
      }
      50% {
        background-position: 100% 50%;
      }
    }
    .gacha-reveal-art img {
      width: 46px;
      height: 46px;
      object-fit: contain;
      filter: drop-shadow(2px 3px 0 rgba(0, 0, 0, 0.18));
    }
    .gacha-reveal-name {
      font-size: 13px;
      font-weight: 800;
    }
    .gacha-reveal-stars {
      font-size: 11px;
      color: #c9a227;
      margin-top: 2px;
    }
  `;
  document.head.appendChild(style);
}

// drop: { species_id, name_key, rarity } (各APIレスポンスの `drop` フィールドをそのまま渡す)
export function showGachaReveal(drop, { holdMs } = {}) {
  if (!drop || !drop.species_id) return;
  ensureStyle();

  const rarity = drop.rarity || 1;
  const name = t(`game.species.${drop.name_key}.name`);
  const hold = holdMs ?? DEFAULT_HOLD_MS[rarity] ?? 1200;

  const overlay = document.createElement("div");
  overlay.className = "gacha-reveal-overlay";
  overlay.innerHTML = `
    <div class="gacha-reveal-card">
      <p class="gacha-reveal-get">${t("common.gacha_get_label")}</p>
      <div class="gacha-reveal-art r${rarity}" style="background:${RARITY_BG[rarity] || RARITY_BG[1]}">
        <img src="images/species/${drop.species_id}.png" onerror="this.onerror=null;this.src='images/mon-placeholder.svg'" alt="">
      </div>
      <p class="gacha-reveal-name">${name}</p>
      <p class="gacha-reveal-stars">${"★".repeat(rarity)}</p>
    </div>
  `;
  document.body.appendChild(overlay);

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    overlay.classList.remove("show");
    setTimeout(() => overlay.remove(), 220);
  };
  overlay.addEventListener("click", dismiss);
  requestAnimationFrame(() => overlay.classList.add("show"));
  setTimeout(dismiss, hold);
}
