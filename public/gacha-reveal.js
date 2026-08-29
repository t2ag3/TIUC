import { t } from "./i18n.js";

// game.htmlの「キャラゲット」ガチャ結果表示(ユーザー指示、2026-08-29改定)。
// 以前は投稿・判定・修正・投票のたびに自動で1体抽選して見せていたが、
// 行動はキャラポイントを貯めるだけにし、貯めたポイントで自分の意思でガチャを回す方式に
// 変更したため、演出も「自動フェードで消える単発カード」から「明示的に閉じるまで残る、
// 複数結果対応の結果画面」に置き換えた。レア度別の背景グラデーション・画像フォールバックは
// 前バージョンの見た目資産をそのまま流用している。

const RARITY_BG = {
  1: "#e7ece9",
  2: "radial-gradient(circle at 50% 42%, #bfe3d3, #7fc4aa)",
  3: "radial-gradient(circle at 50% 40%, #a9e8ff, #4f9bd6 70%, #2f6ea8)",
  4: "linear-gradient(135deg, #fff27a, #ffb347 26%, #ff6fd8 52%, #8f7bff 76%, #5ec6ff)",
};

let styleInjected = false;
function ensureStyle() {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    .gacha-results-overlay {
      position: fixed;
      inset: 0;
      z-index: 4000;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(18, 28, 20, 0.55);
      padding: 16px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.18s ease;
    }
    .gacha-results-overlay.show {
      opacity: 1;
      pointer-events: auto;
    }
    .gacha-results-modal {
      width: 100%;
      max-width: 420px;
      max-height: 88vh;
      overflow-y: auto;
      background: #fff;
      border-radius: 22px;
      padding: 20px 16px;
      text-align: center;
      box-shadow: 0 20px 60px rgba(18, 28, 20, 0.3);
      transform: scale(0.85) translateY(16px);
      opacity: 0;
      transition:
        transform 0.32s cubic-bezier(0.2, 1.3, 0.4, 1),
        opacity 0.22s ease;
    }
    .gacha-results-overlay.show .gacha-results-modal {
      transform: scale(1) translateY(0);
      opacity: 1;
    }
    .gacha-results-title {
      font-size: 15px;
      font-weight: 800;
      margin: 0 0 14px;
    }
    .gacha-results-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
      gap: 10px;
      margin-bottom: 16px;
    }
    .gacha-result-card {
      position: relative;
      padding: 10px 6px 8px;
      border-radius: 16px;
      background: #f7f8f5;
      border: 1px solid #e3e6df;
    }
    .gacha-result-art {
      height: 64px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 6px;
      overflow: hidden;
    }
    .gacha-result-art.r4 {
      background-size: 240% 240%;
      animation: gacha-results-shine 2.6s ease infinite;
    }
    @keyframes gacha-results-shine {
      0%,
      100% {
        background-position: 0% 50%;
      }
      50% {
        background-position: 100% 50%;
      }
    }
    .gacha-result-art img {
      width: 40px;
      height: 40px;
      object-fit: contain;
      filter: drop-shadow(2px 3px 0 rgba(0, 0, 0, 0.18));
    }
    .gacha-result-name {
      font-size: 12px;
      font-weight: 800;
      line-height: 1.3;
    }
    .gacha-result-stars {
      font-size: 10px;
      color: #c9a227;
      margin-top: 2px;
    }
    .gacha-result-new {
      position: absolute;
      top: -8px;
      right: -6px;
      font-size: 11px;
      font-weight: 900;
      color: #e02424;
      background: #fff;
      border: 1.5px solid #e02424;
      border-radius: 999px;
      padding: 1px 7px;
      animation: gacha-results-blink 0.9s step-start infinite;
    }
    @keyframes gacha-results-blink {
      50% {
        opacity: 0;
      }
    }
    .gacha-results-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .gacha-results-dex-btn {
      display: block;
      padding: 11px;
      border-radius: 12px;
      border: 0;
      background: var(--color-accent, #1a5c3a);
      color: #fff;
      font-weight: 700;
      font-size: 13px;
      text-decoration: none;
      cursor: pointer;
    }
    .gacha-results-close-btn {
      display: block;
      padding: 11px;
      border-radius: 12px;
      border: 1px solid #e3e6df;
      background: #fff;
      color: #1d211d;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
    }
  `;
  document.head.appendChild(style);
}

function resultCardHtml(drop) {
  const rarity = drop.rarity || 1;
  const name = drop.name || drop.name_key;
  return `
    <div class="gacha-result-card">
      ${drop.is_new ? `<span class="gacha-result-new">${t("game.gacha_new_badge")}</span>` : ""}
      <div class="gacha-result-art r${rarity}" style="background:${RARITY_BG[rarity] || RARITY_BG[1]}">
        <img src="images/species/${drop.species_id}.png" onerror="this.onerror=null;this.src='images/mon-placeholder.svg'" alt="">
      </div>
      <p class="gacha-result-name">${name}</p>
      <p class="gacha-result-stars">${"★".repeat(rarity)}</p>
    </div>
  `;
}

// drops: [{ species_id, name_key, rarity, is_new }, ...] (POST /api/game/gacha/pull の drops をそのまま渡す)
export function showGachaResults(drops) {
  if (!Array.isArray(drops) || !drops.length) return;
  ensureStyle();

  const overlay = document.createElement("div");
  overlay.className = "gacha-results-overlay";
  overlay.innerHTML = `
    <div class="gacha-results-modal">
      <p class="gacha-results-title">${t("game.gacha_result_title")}</p>
      <div class="gacha-results-grid">${drops.map(resultCardHtml).join("")}</div>
      <div class="gacha-results-actions">
        <a class="gacha-results-dex-btn" href="collection.html">${t("game.gacha_view_dex_btn")}</a>
        <button type="button" class="gacha-results-close-btn">${t("common.close")}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const dismiss = () => {
    overlay.classList.remove("show");
    setTimeout(() => overlay.remove(), 220);
  };
  overlay
    .querySelector(".gacha-results-close-btn")
    .addEventListener("click", dismiss);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) dismiss();
  });
  requestAnimationFrame(() => overlay.classList.add("show"));
}
