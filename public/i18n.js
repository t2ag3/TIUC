// 多言語対応(i18n)。ビルド工程なしのため、素の ES モジュールで完結させる。
// 対応言語: 日本語(ja) / 英語(en) / 中国語(zh) / フランス語(fr) / スペイン語(es) / 韓国語(ko)
//
// 文言そのものは ./locales/<lang>.js に言語ごとに分割してある(保守性のため)。
// このファイルは辞書の読み込み・言語判定・DOM反映のロジックだけを持つ。
//
// 使い方:
//   import { t, applyI18n, initLangSwitcher } from './i18n.js';
//   applyI18n();                 // data-i18n[-html|-placeholder|-alt|-aria-label|-title] を一括反映
//   initLangSwitcher('lang-switcher'); // <select id="lang-switcher"> を言語切替UIにする
//   t('report.h1')               // 動的にJSから文字列を組み立てる場合はこれを使う
//
// 言語切替は localStorage に保存し、選択時にページを再読み込みして反映する
// (地図・一覧などJSが組み立てるDOMを全ページで漏れなく再翻訳するための単純な方式)。

import ja from './locales/ja.js';
import en from './locales/en.js';
import zh from './locales/zh.js';
import fr from './locales/fr.js';
import es from './locales/es.js';
import ko from './locales/ko.js';

export const LANGS = ['ja', 'en', 'zh', 'fr', 'es', 'ko'];
export const LANG_NAMES = { ja: '日本語', en: 'English', zh: '中文', fr: 'Français', es: 'Español', ko: '한국어' };

const DICTS = { ja, en, zh, fr, es, ko };

const STORAGE_KEY = 'tiuc_lang';

export function getLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && LANGS.includes(saved)) return saved;
  } catch { /* localStorage 不可でも既定言語で続行 */ }
  const nav = (navigator.language || 'ja').toLowerCase();
  const found = LANGS.find((l) => nav.startsWith(l));
  return found || 'ja';
}

export function setLang(lang) {
  if (!LANGS.includes(lang)) return;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* 保存できなくても致命的ではない */ }
}

export function t(key, vars) {
  const lang = getLang();
  let str = DICTS[lang]?.[key] ?? DICTS.ja[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) str = str.replaceAll(`{${k}}`, String(v));
  }
  return str;
}

export function applyI18n(root = document) {
  document.documentElement.lang = getLang();
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')); });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.getAttribute('data-i18n-html')); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder'))); });
  root.querySelectorAll('[data-i18n-alt]').forEach((el) => { el.setAttribute('alt', t(el.getAttribute('data-i18n-alt'))); });
  root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria-label'))); });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.setAttribute('title', t(el.getAttribute('data-i18n-title'))); });
}

export function initLangSwitcher(id = 'lang-switcher') {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = LANGS.map((l) => `<option value="${l}">${LANG_NAMES[l]}</option>`).join('');
  sel.value = getLang();
  sel.addEventListener('change', () => { setLang(sel.value); location.reload(); });
}
