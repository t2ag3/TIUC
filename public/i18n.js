// 多言語対応(i18n)。ビルド工程なしのため、素の ES モジュールで完結させる。
// 対応言語: 日本語(ja) / 英語(en) / 中国語(zh) / フランス語(fr) / スペイン語(es) / 韓国語(ko)
//
// 使い方:
//   import { t, applyI18n, initLangSwitcher } from './i18n.js';
//   applyI18n();                 // data-i18n[-html|-placeholder|-aria-label|-title] を一括反映
//   initLangSwitcher('lang-switcher'); // <select id="lang-switcher"> を言語切替UIにする
//   t('report.h1')               // 動的にJSから文字列を組み立てる場合はこれを使う
//
// 言語切替は localStorage に保存し、選択時にページを再読み込みして反映する
// (地図・一覧などJSが組み立てるDOMを全ページで漏れなく再翻訳するための単純な方式)。

export const LANGS = ['ja', 'en', 'zh', 'fr', 'es', 'ko'];
export const LANG_NAMES = { ja: '日本語', en: 'English', zh: '中文', fr: 'Français', es: 'Español', ko: '한국어' };

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
  const entry = STRINGS[key];
  if (!entry) return key;
  const lang = getLang();
  let str = entry[lang] ?? entry.ja ?? key;
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

const STRINGS = {
  // ---- common ----
  'common.login': { ja: 'ログイン', en: 'Log in', zh: '登录', fr: 'Se connecter', es: 'Iniciar sesión', ko: '로그인' },
  'common.login_active_fallback': { ja: 'ログイン中', en: 'Logged in', zh: '已登录', fr: 'Connecté', es: 'Conectado', ko: '로그인됨' },
  'common.close': { ja: '閉じる', en: 'Close', zh: '关闭', fr: 'Fermer', es: 'Cerrar', ko: '닫기' },
  'common.back_top': { ja: '← トップ', en: '← Home', zh: '← 首页', fr: '← Accueil', es: '← Inicio', ko: '← 홈' },
  'common.back_curation': { ja: '← キュレーション', en: '← Curation', zh: '← 校对', fr: '← Curation', es: '← Curación', ko: '← 큐레이션' },
  'common.camera_btn': { ja: 'カメラを開始', en: 'Start camera', zh: '打开相机', fr: 'Démarrer la caméra', es: 'Iniciar cámara', ko: '카메라 시작' },
  'common.file_btn': { ja: 'ファイルを選択', en: 'Choose file', zh: '选择文件', fr: 'Choisir un fichier', es: 'Elegir archivo', ko: '파일 선택' },
  'common.unselected': { ja: '未選択', en: 'Not selected', zh: '未选择', fr: 'Non sélectionné', es: 'No seleccionado', ko: '미선택' },
  'common.next_btn': { ja: 'つぎへ', en: 'Next', zh: '下一步', fr: 'Suivant', es: 'Siguiente', ko: '다음' },
  'common.back_btn': { ja: 'もどる', en: 'Back', zh: '上一步', fr: 'Précédent', es: 'Atrás', ko: '이전' },
  'common.processing': { ja: '処理中...', en: 'Processing...', zh: '处理中...', fr: 'Traitement en cours...', es: 'Procesando...', ko: '처리 중...' },
  'common.loading': { ja: '読み込み中...', en: 'Loading...', zh: '加载中...', fr: 'Chargement...', es: 'Cargando...', ko: '로딩 중...' },
  'common.fetch_error': { ja: '取得に失敗しました', en: 'Failed to load data', zh: '获取失败', fr: 'Échec du chargement', es: 'Error al cargar los datos', ko: '불러오기에 실패했습니다' },
  'common.memo_prefix': { ja: 'メモ: {text}', en: 'Note: {text}', zh: '备注：{text}', fr: 'Note : {text}', es: 'Nota: {text}', ko: '메모: {text}' },
  'common.arrow_lang_en': { ja: '→英語', en: '→ English', zh: '→英语', fr: '→ Anglais', es: '→ Inglés', ko: '→영어' },
  'common.arrow_lang_zh': { ja: '→中国語', en: '→ Chinese', zh: '→中文', fr: '→ Chinois', es: '→ Chino', ko: '→중국어' },
  'common.arrow_lang_ko': { ja: '→韓国語', en: '→ Korean', zh: '→韩语', fr: '→ Coréen', es: '→ Coreano', ko: '→한국어' },
  'common.pair_label_en': { ja: '日→英', en: 'JA→EN', zh: '日→英', fr: 'JA→EN', es: 'JA→EN', ko: '일→영' },
  'common.pair_label_zh': { ja: '日→中', en: 'JA→ZH', zh: '日→中', fr: 'JA→ZH', es: 'JA→ZH', ko: '일→중' },
  'common.pair_label_ko': { ja: '日→韓', en: 'JA→KO', zh: '日→韩', fr: 'JA→KO', es: 'JA→KO', ko: '일→한' },
  'common.label_judgment_check': { ja: '違和感チェック', en: 'Naturalness check', zh: '自然度检查', fr: 'Vérification de la fluidité', es: 'Verificación de naturalidad', ko: '어색함 체크' },
  'common.label_correction_proposal': { ja: '修正提案', en: 'Correction proposal', zh: '修改提案', fr: 'Proposition de correction', es: 'Propuesta de corrección', ko: '수정 제안' },
  'common.map_load_error': { ja: '地図を読み込めませんでした', en: 'Failed to load the map', zh: '地图加载失败', fr: 'Impossible de charger la carte', es: 'No se pudo cargar el mapa', ko: '지도를 불러오지 못했습니다' },
  'common.mypage_link': { ja: 'マイページ', en: 'My page', zh: '我的页面', fr: 'Mon espace', es: 'Mi página', ko: '마이페이지' },
  'common.alt_translated': { ja: '訳文', en: 'Translation', zh: '译文', fr: 'Traduction', es: 'Traducción', ko: '번역문' },
  'common.alt_original': { ja: '原文', en: 'Original', zh: '原文', fr: 'Original', es: 'Original', ko: '원문' },

  // ---- index.html ----
  'index.brand_aria': { ja: 'TIUC トップ', en: 'TIUC home', zh: 'TIUC 首页', fr: 'Accueil TIUC', es: 'Inicio de TIUC', ko: 'TIUC 홈' },
  'index.hero_title': {
    ja: '街の外国語を、<br><span class="accent">みんなで少しずつ良くする。</span>',
    en: 'Improving the city’s foreign-language signs,<br><span class="accent">little by little, together.</span>',
    zh: '让街头的外语标识，<br><span class="accent">大家一起一点点变好。</span>',
    fr: 'Les textes en langue étrangère de la ville,<br><span class="accent">améliorés petit à petit, ensemble.</span>',
    es: 'Los textos en idiomas extranjeros de la ciudad,<br><span class="accent">mejorados poco a poco, entre todos.</span>',
    ko: '거리의 외국어 표기를,<br><span class="accent">모두 함께 조금씩 더 좋게.</span>',
  },
  'index.hero_lead': {
    ja: '気になった外国語表記を撮る。自然かどうかを確かめる。より良い表現を提案する。小さな参加を積み重ねて、街のことばをアップデートします。',
    en: 'Snap a photo of a foreign-language sign that catches your eye. Check whether it sounds natural. Suggest a better phrasing. Small contributions add up to update the language of the city.',
    zh: '拍下让你在意的外语标识。确认它是否自然。提出更好的表达方式。一点一滴的参与，逐步更新这座城市的语言。',
    fr: 'Photographiez un texte en langue étrangère qui attire votre attention. Vérifiez s’il sonne naturel. Proposez une meilleure formulation. De petites contributions qui, mises bout à bout, font évoluer la langue de la ville.',
    es: 'Fotografía un texto en idioma extranjero que te llame la atención. Comprueba si suena natural. Propón una expresión mejor. Pequeñas contribuciones que, sumadas, van actualizando el lenguaje de la ciudad.',
    ko: '눈에 띈 외국어 표기를 촬영하세요. 자연스러운지 확인하세요. 더 나은 표현을 제안하세요. 작은 참여가 쌓여 거리의 언어를 업데이트합니다.',
  },
  'index.stat_posts_label': { ja: '集まった投稿', en: 'Submissions collected', zh: '收到的投稿', fr: 'Signalements reçus', es: 'Publicaciones recibidas', ko: '수집된 게시물' },
  'index.stat_fixed_label': { ja: '確定した修正', en: 'Confirmed corrections', zh: '已确认的修改', fr: 'Corrections confirmées', es: 'Correcciones confirmadas', ko: '확정된 수정' },
  'index.section_participate_title': { ja: '参加する', en: 'Get involved', zh: '参与', fr: 'Participer', es: 'Participar', ko: '참여하기' },
  'index.section_participate_sub': { ja: 'できることから、1つだけでも。', en: 'Start with just one thing you can do.', zh: '从力所能及的一件事开始。', fr: 'Commencez par une seule chose que vous pouvez faire.', es: 'Empieza por una sola cosa que puedas hacer.', ko: '할 수 있는 것부터 하나만이라도.' },
  'index.mode_report_title': { ja: '見つける', en: 'Find', zh: '发现', fr: 'Repérer', es: 'Detectar', ko: '찾기' },
  'index.mode_report_desc': { ja: '街で見つけた外国語表記を撮影して投稿します。', en: 'Photograph and submit a foreign-language sign you find in the city.', zh: '拍摄并提交你在街上发现的外语标识。', fr: 'Photographiez et publiez un texte en langue étrangère repéré dans la ville.', es: 'Fotografía y publica un texto en idioma extranjero que encuentres en la ciudad.', ko: '거리에서 발견한 외국어 표기를 촬영해 등록합니다.' },
  'index.mode_curate_title': { ja: '確かめる・なおす', en: 'Check & fix', zh: '核查与修正', fr: 'Vérifier et corriger', es: 'Verificar y corregir', ko: '확인하고 고치기' },
  'index.mode_curate_desc': { ja: '自然さを判定したり、より良い表現を提案します。', en: 'Judge naturalness or suggest a better phrasing.', zh: '判断是否自然，或提出更好的表达。', fr: 'Jugez si le texte sonne naturel ou proposez une meilleure formulation.', es: 'Evalúa si suena natural o propone una expresión mejor.', ko: '자연스러운지 판정하거나 더 나은 표현을 제안합니다.' },
  'index.mode_map_title': { ja: '街を見る', en: 'View the city', zh: '查看街区', fr: 'Voir la ville', es: 'Ver la ciudad', ko: '거리 보기' },
  'index.mode_map_desc': { ja: '集まった投稿と改善状況を地図から確認します。', en: 'See submissions and progress on a map.', zh: '在地图上查看已收集的投稿与改善情况。', fr: 'Consultez les signalements et les progrès sur une carte.', es: 'Consulta las publicaciones y el progreso en un mapa.', ko: '지도를 통해 게시물과 개선 현황을 확인합니다.' },
  'index.mypage_label': { ja: 'あなたの貢献', en: 'Your contributions', zh: '你的贡献', fr: 'Vos contributions', es: 'Tus contribuciones', ko: '당신의 기여' },
  'index.mypage_hint': { ja: '履歴・ポイント・能力レベルを見る', en: 'View history, points & skill level', zh: '查看历史记录、积分与能力等级', fr: 'Voir l’historique, les points et le niveau de compétence', es: 'Ver historial, puntos y nivel de habilidad', ko: '이력·포인트·능력 레벨 보기' },
  'index.buddy_title': { ja: '街ことばの相棒', en: 'Your city-words buddy', zh: '街头语言伙伴', fr: 'Votre compagnon des mots de la ville', es: 'Tu compañero de palabras urbanas', ko: '거리 언어 파트너' },
  'index.buddy_hint_default': { ja: '投稿や判定で育ちます。クエストと図鑑を見る', en: 'Grows as you submit and judge. See quests & encyclopedia', zh: '通过投稿与判定成长。查看任务与图鉴', fr: 'Grandit grâce à vos publications et jugements. Voir les quêtes et l’encyclopédie', es: 'Crece con tus publicaciones y evaluaciones. Ver misiones y enciclopedia', ko: '게시와 판정으로 성장합니다. 퀘스트와 도감 보기' },
  'index.buddy_hint_with_xp': { ja: '{xp} XP・投稿や判定で育ちます。クエストと図鑑を見る', en: '{xp} XP • Grows as you submit and judge. See quests & encyclopedia', zh: '{xp} XP・通过投稿与判定成长。查看任务与图鉴', fr: '{xp} XP • Grandit grâce à vos publications et jugements. Voir les quêtes et l’encyclopédie', es: '{xp} XP • Crece con tus publicaciones y evaluaciones. Ver misiones y enciclopedia', ko: '{xp} XP・게시와 판정으로 성장합니다. 퀘스트와 도감 보기' },
  'index.footer_note': {
    ja: 'ログイン不要・匿名でも利用できます。投稿された写真は、判定・修正に必要な範囲で取り扱われます。',
    en: 'No login required — you can use it anonymously. Submitted photos are handled only to the extent necessary for judging and correcting.',
    zh: '无需登录，匿名也可使用。提交的照片仅在判定与修正所需范围内使用。',
    fr: 'Aucune connexion requise, utilisable de manière anonyme. Les photos envoyées ne sont utilisées que dans la mesure nécessaire au jugement et à la correction.',
    es: 'No se requiere iniciar sesión; se puede usar de forma anónima. Las fotos enviadas se usan solo en la medida necesaria para la evaluación y corrección.',
    ko: '로그인 없이 익명으로도 이용할 수 있습니다. 등록된 사진은 판정·수정에 필요한 범위에서만 취급됩니다.',
  },

  // ---- menu.html ----
  'menu.title': { ja: 'メニュー - TIUC', en: 'Menu - TIUC', zh: '菜单 - TIUC', fr: 'Menu - TIUC', es: 'Menú - TIUC', ko: '메뉴 - TIUC' },
  'menu.back_top_full': { ja: '← トップに戻る', en: '← Back to home', zh: '← 返回首页', fr: '← Retour à l’accueil', es: '← Volver al inicio', ko: '← 홈으로 돌아가기' },
  'menu.h1': { ja: 'キュレーションモード', en: 'Curation mode', zh: '校对模式', fr: 'Mode curation', es: 'Modo de curación', ko: '큐레이션 모드' },
  'menu.lead': {
    ja: '投稿された外国語表記を評価・修正します。ここだけが「属性(能力)」で中身が変わりますが、素養がなくても練習として参加できます。まずは違和感チェックからどうぞ。',
    en: 'Evaluate and correct submitted foreign-language signs. This is the only place where your "attributes (skills)" change what you see, but you can still join as practice even without the relevant skill. Start with the naturalness check.',
    zh: '对提交的外语标识进行评价与修正。只有在这里，内容会根据你的“属性（能力）”而变化，但即使没有相关素养，也可以作为练习参与。请先从自然度检查开始吧。',
    fr: 'Évaluez et corrigez les textes en langue étrangère soumis. C’est le seul endroit où votre « profil (compétence) » change le contenu proposé, mais vous pouvez y participer comme entraînement même sans compétence particulière. Commencez par la vérification de la fluidité.',
    es: 'Evalúa y corrige los textos en idioma extranjero enviados. Este es el único lugar donde tu "perfil (nivel)" cambia el contenido, pero puedes participar como práctica aunque no tengas ese nivel. Empieza por la verificación de naturalidad.',
    ko: '등록된 외국어 표기를 평가하고 수정합니다. 이곳에서만 속성(능력)에 따라 내용이 달라지지만, 소양이 없어도 연습으로 참여할 수 있습니다. 먼저 어색함 체크부터 시작해 보세요.',
  },
  'menu.tile_judge_desc': { ja: '訳文言語のネイティブ向け・一タップ', en: 'For native speakers of the target language — one tap', zh: '面向译文语言的母语者・一键完成', fr: 'Pour les locuteurs natifs de la langue cible – en un clic', es: 'Para hablantes nativos del idioma de destino: un solo toque', ko: '번역문 언어의 원어민 대상・원탭' },
  'menu.tile_curate_title': { ja: '修正・投票', en: 'Correct & vote', zh: '修正与投票', fr: 'Correction et vote', es: 'Corrección y votación', ko: '수정・투표' },
  'menu.tile_curate_desc': { ja: 'バイリンガル向け・正誤判定', en: 'For bilingual users — right/wrong judgment', zh: '面向双语者・正误判断', fr: 'Pour les bilingues – jugement de justesse', es: 'Para bilingües: juicio de correcto/incorrecto', ko: '이중언어자 대상・정오 판정' },
  'menu.tile_report': { ja: '撮影投稿モードへ(新しい表記を投稿する)', en: 'Go to photo submission mode (submit a new sign)', zh: '前往拍摄投稿模式（提交新的标识）', fr: 'Accéder au mode de soumission de photos (publier un nouveau texte)', es: 'Ir al modo de envío de fotos (publicar un nuevo texto)', ko: '촬영 등록 모드로 이동 (새 표기 등록하기)' },
  'menu.tile_mypage': { ja: 'マイページ(貢献履歴・ポイント)', en: 'My page (contribution history & points)', zh: '我的页面（贡献记录・积分）', fr: 'Mon espace (historique des contributions et points)', es: 'Mi página (historial de contribuciones y puntos)', ko: '마이페이지 (기여 이력・포인트)' },
  'menu.footer': { ja: 'ログイン不要・匿名で利用できます。', en: 'No login required — usable anonymously.', zh: '无需登录，匿名即可使用。', fr: 'Aucune connexion requise, utilisable de manière anonyme.', es: 'No se requiere iniciar sesión; se puede usar de forma anónima.', ko: '로그인 없이 익명으로 이용할 수 있습니다.' },
  'menu.stats_line_plain': {
    ja: 'これまでに <strong>{total}</strong> 件の投稿が届いています。',
    en: 'So far, <strong>{total}</strong> submissions have been received.',
    zh: '迄今为止已收到 <strong>{total}</strong> 件投稿。',
    fr: 'À ce jour, <strong>{total}</strong> signalements ont été reçus.',
    es: 'Hasta ahora se han recibido <strong>{total}</strong> publicaciones.',
    ko: '지금까지 <strong>{total}</strong>건의 게시물이 도착했습니다.',
  },
  'menu.stats_line_with_fix': {
    ja: 'これまでに <strong>{total}</strong> 件の投稿が届いています(うち修正待ち <strong>{needs_fix}</strong> 件)。',
    en: 'So far, <strong>{total}</strong> submissions have been received ({needs_fix} awaiting correction).',
    zh: '迄今为止已收到 <strong>{total}</strong> 件投稿（其中 <strong>{needs_fix}</strong> 件待修正）。',
    fr: 'À ce jour, <strong>{total}</strong> signalements ont été reçus (dont {needs_fix} en attente de correction).',
    es: 'Hasta ahora se han recibido <strong>{total}</strong> publicaciones ({needs_fix} a la espera de corrección).',
    ko: '지금까지 <strong>{total}</strong>건의 게시물이 도착했습니다(그중 수정 대기 <strong>{needs_fix}</strong>건).',
  },

  // ---- report.html ----
  'report.title': { ja: '投稿する - TIUC', en: 'Submit - TIUC', zh: '投稿 - TIUC', fr: 'Publier - TIUC', es: 'Publicar - TIUC', ko: '등록하기 - TIUC' },
  'report.h1': { ja: '📷 外国語表記を投稿する', en: '📷 Submit a foreign-language sign', zh: '📷 提交外语标识', fr: '📷 Publier un texte en langue étrangère', es: '📷 Publicar un texto en idioma extranjero', ko: '📷 외국어 표기 등록하기' },
  'report.lead_text': {
    ja: '街で見かけた外国語のメニュー・看板・注意書きを撮って投稿してください。語学力は不要です。',
    en: 'Take a photo of a foreign-language menu, sign, or notice you see in the city and submit it. No language skills required.',
    zh: '请拍摄你在街上看到的外语菜单、招牌或告示并提交。无需外语能力。',
    fr: 'Prenez en photo un menu, une pancarte ou un avis en langue étrangère que vous voyez en ville, puis publiez-le. Aucune compétence linguistique n’est requise.',
    es: 'Toma una foto de un menú, letrero o aviso en idioma extranjero que veas en la ciudad y publícalo. No se necesitan conocimientos de idiomas.',
    ko: '거리에서 본 외국어 메뉴・간판・안내문을 촬영해 등록해 주세요. 어학 실력은 필요하지 않습니다.',
  },
  'report.step_label': { ja: 'Step {n} / {total}', en: 'Step {n} / {total}', zh: '步骤 {n} / {total}', fr: 'Étape {n} / {total}', es: 'Paso {n} / {total}', ko: '단계 {n} / {total}' },
  'report.step1_legend': { ja: '1. 見つけた外国語の表記を撮影', en: '1. Photograph the foreign-language sign you found', zh: '1. 拍摄发现的外语标识', fr: '1. Photographiez le texte en langue étrangère repéré', es: '1. Fotografía el texto en idioma extranjero que encontraste', ko: '1. 발견한 외국어 표기 촬영' },
  'report.step1_lead': { ja: 'メニュー・看板・注意書きなど、気になった外国語の表記を撮ってください。', en: 'Take a photo of any foreign-language menu, sign, or notice that caught your eye.', zh: '请拍摄让你在意的外语菜单、招牌或告示等。', fr: 'Photographiez un menu, une pancarte ou un avis en langue étrangère qui a attiré votre attention.', es: 'Fotografía cualquier menú, letrero o aviso en idioma extranjero que te haya llamado la atención.', ko: '메뉴・간판・안내문 등 눈에 띈 외국어 표기를 촬영해 주세요.' },
  'report.tgt_question': { ja: 'この表記の日本語版の写真もありますか？(任意)', en: 'Do you also have a photo of the Japanese version of this sign? (optional)', zh: '是否也有这段文字的日语版照片？（可选）', fr: 'Avez-vous aussi une photo de la version japonaise de ce texte ? (facultatif)', es: '¿También tienes una foto de la versión en japonés de este texto? (opcional)', ko: '이 표기의 일본어판 사진도 있으신가요? (선택)' },
  'report.tgt_wrap_label': { ja: '2. 日本語表記の写真', en: '2. Photo of the Japanese text', zh: '2. 日语文字的照片', fr: '2. Photo du texte japonais', es: '2. Foto del texto en japonés', ko: '2. 일본어 표기 사진' },
  'report.place_en_lang': { ja: '英語', en: 'English', zh: '英语', fr: 'Anglais', es: 'Inglés', ko: '영어' },
  'report.place_zh_lang': { ja: '中国語', en: 'Chinese', zh: '中文', fr: 'Chinois', es: 'Chino', ko: '중국어' },
  'report.place_ko_lang': { ja: '韓国語', en: 'Korean', zh: '韩语', fr: 'Coréen', es: 'Coreano', ko: '한국어' },
  'report.step2_legend':{ ja: '2. 言語(訳文は何語?)', en: '2. Language (what is the translation in?)', zh: '2. 语言（译文是什么语言？）', fr: '2. Langue (dans quelle langue est la traduction ?)', es: '2. Idioma (¿en qué idioma está la traducción?)', ko: '2. 언어 (번역문은 어떤 언어인가요?)' },
  'report.step3b_legend': { ja: '3. 何の表記? (わかれば)', en: '3. What kind of sign is it? (if known)', zh: '3. 是什么类型的标识？（如果知道的话）', fr: '3. De quel type de texte s’agit-il ? (si vous le savez)', es: '3. ¿Qué tipo de texto es? (si lo sabes)', ko: '3. 어떤 표기인가요? (알고 있다면)' },
  'report.place_unknown': { ja: 'わからない', en: 'Not sure', zh: '不清楚', fr: 'Je ne sais pas', es: 'No lo sé', ko: '모르겠음' },
  'report.place_menu': { ja: 'メニュー', en: 'Menu', zh: '菜单', fr: 'Menu', es: 'Menú', ko: '메뉴' },
  'report.place_sign': { ja: '看板', en: 'Sign', zh: '招牌', fr: 'Pancarte', es: 'Letrero', ko: '간판' },
  'report.place_notice': { ja: '注意書き', en: 'Notice', zh: '告示', fr: 'Avis', es: 'Aviso', ko: '안내문' },
  'report.place_other': { ja: 'その他', en: 'Other', zh: '其他', fr: 'Autre', es: 'Otro', ko: '기타' },
  'report.flag_label': { ja: 'これ、訳が変かも?と思った(任意)', en: 'I suspect this translation might be off (optional)', zh: '我觉得这个翻译可能有点奇怪（可选）', fr: 'J’ai l’impression que cette traduction est bizarre (facultatif)', es: 'Creo que esta traducción podría ser rara (opcional)', ko: '이거 번역이 이상한 것 같다고 느꼈어요 (선택)' },
  'report.step4_legend': { ja: '4. 位置情報', en: '4. Location', zh: '4. 位置信息', fr: '4. Localisation', es: '4. Ubicación', ko: '4. 위치 정보' },
  'report.loc_status_default': { ja: '写真を選ぶと自動で取得します。', en: 'Selecting a photo will fetch this automatically.', zh: '选择照片后将自动获取。', fr: 'La sélection d’une photo la récupère automatiquement.', es: 'Al elegir una foto se obtiene automáticamente.', ko: '사진을 선택하면 자동으로 가져옵니다.' },
  'report.map_toggle_link': { ja: '地図で場所を指定する', en: 'Specify location on the map', zh: '在地图上指定位置', fr: 'Indiquer l’emplacement sur la carte', es: 'Indicar la ubicación en el mapa', ko: '지도에서 위치 지정하기' },
  'report.nearby_notice': {
    ja: '近くで最近、別の方が同じ言語ペアで投稿しています。重複の可能性があります。',
    en: 'Someone else recently submitted the same language pair nearby. This may be a duplicate.',
    zh: '附近最近有其他人提交了相同语言对的投稿，可能存在重复。',
    fr: 'Quelqu’un d’autre a récemment publié la même paire de langues à proximité. Il pourrait s’agir d’un doublon.',
    es: 'Otra persona ha publicado recientemente el mismo par de idiomas cerca de aquí. Podría ser un duplicado.',
    ko: '근처에서 최근 다른 분이 같은 언어 쌍으로 등록했습니다. 중복일 가능성이 있습니다.',
  },
  'report.map_confirm_btn': { ja: 'この位置に決定', en: 'Confirm this location', zh: '确定此位置', fr: 'Confirmer cet emplacement', es: 'Confirmar esta ubicación', ko: '이 위치로 결정' },
  'report.step5_legend': { ja: '5. メモ(任意)', en: '5. Notes (optional)', zh: '5. 备注（可选）', fr: '5. Remarque (facultatif)', es: '5. Nota (opcional)', ko: '5. 메모 (선택)' },
  'report.situation_placeholder': { ja: 'お店の名前や状況など', en: 'e.g. shop name or situation', zh: '例如店名或情况说明', fr: 'Nom du magasin, contexte, etc.', es: 'Nombre del comercio o la situación, por ejemplo', ko: '가게 이름이나 상황 등' },
  'report.submit_btn': { ja: '送信する', en: 'Submit', zh: '提交', fr: 'Envoyer', es: 'Enviar', ko: '제출하기' },
  'report.done_title': { ja: '投稿しました!', en: 'Submitted!', zh: '已提交！', fr: 'Publié !', es: '¡Publicado!', ko: '등록되었습니다!' },
  'report.done_desc': { ja: 'ご協力ありがとうございます!', en: 'Thank you for your contribution!', zh: '感谢您的协助！', fr: 'Merci pour votre contribution !', es: '¡Gracias por tu colaboración!', ko: '협조해 주셔서 감사합니다!' },
  'report.done_link_top': { ja: 'トップに戻る', en: 'Back to home', zh: '返回首页', fr: 'Retour à l’accueil', es: 'Volver al inicio', ko: '홈으로 돌아가기' },
  'report.done_link_curate': { ja: 'キュレーションに参加する', en: 'Join curation', zh: '参与校对', fr: 'Participer à la curation', es: 'Participar en la curación', ko: '큐레이션에 참여하기' },
  'report.done_link_mypage': { ja: 'マイページを見る', en: 'View my page', zh: '查看我的页面', fr: 'Voir mon espace', es: 'Ver mi página', ko: '마이페이지 보기' },
  'report.image_process_error': { ja: '画像を処理できません: {msg}', en: 'Could not process the image: {msg}', zh: '无法处理图片：{msg}', fr: 'Impossible de traiter l’image : {msg}', es: 'No se pudo procesar la imagen: {msg}', ko: '이미지를 처리할 수 없습니다: {msg}' },
  'report.loc_src_exif': { ja: '写真の記録', en: 'Photo metadata', zh: '照片记录', fr: 'Métadonnées de la photo', es: 'Metadatos de la foto', ko: '사진 기록' },
  'report.loc_src_geolocation': { ja: '端末の現在地', en: 'Device’s current location', zh: '设备当前位置', fr: 'Position actuelle de l’appareil', es: 'Ubicación actual del dispositivo', ko: '기기의 현재 위치' },
  'report.loc_src_manual': { ja: '地図で指定', en: 'Specified on the map', zh: '地图上指定', fr: 'Indiqué sur la carte', es: 'Indicado en el mapa', ko: '지도에서 지정' },
  'report.loc_acquired': { ja: '取得しました', en: 'Acquired', zh: '已获取', fr: 'Obtenu', es: 'Obtenido', ko: '확보했습니다' },
  'report.loc_row_coord': { ja: '座標', en: 'Coordinates', zh: '坐标', fr: 'Coordonnées', es: 'Coordenadas', ko: '좌표' },
  'report.loc_row_source': { ja: '取得元', en: 'Source', zh: '来源', fr: 'Source', es: 'Origen', ko: '획득 방법' },
  'report.loc_accuracy_suffix': { ja: ' / 誤差 約{m}m', en: ' / accuracy ≈{m}m', zh: ' / 误差约{m}米', fr: ' / précision ≈ {m} m', es: ' / precisión aprox. {m} m', ko: ' / 오차 약 {m}m' },
  'report.loc_row_mesh': { ja: 'メッシュ', en: 'Mesh', zh: '网格', fr: 'Maille', es: 'Malla', ko: '메쉬' },
  'report.loc_fetching': { ja: '位置情報を取得中...', en: 'Fetching location...', zh: '正在获取位置信息...', fr: 'Récupération de la position...', es: 'Obteniendo la ubicación...', ko: '위치 정보 가져오는 중...' },
  'report.loc_error': {
    ja: '位置情報を取得できません。ブラウザの位置情報を許可するか、下の地図で場所を指定してください。',
    en: 'Could not get your location. Please allow location access in your browser, or specify the location on the map below.',
    zh: '无法获取位置信息。请在浏览器中允许获取位置信息，或在下方地图上指定位置。',
    fr: 'Impossible d’obtenir la position. Autorisez la géolocalisation dans votre navigateur, ou indiquez l’emplacement sur la carte ci-dessous.',
    es: 'No se pudo obtener la ubicación. Permite el acceso a la ubicación en tu navegador o indica el lugar en el mapa de abajo.',
    ko: '위치 정보를 가져올 수 없습니다. 브라우저에서 위치 정보를 허용하거나 아래 지도에서 위치를 지정해 주세요.',
  },
  'report.sending': { ja: '送信中...', en: 'Sending...', zh: '发送中...', fr: 'Envoi en cours...', es: 'Enviando...', ko: '전송 중...' },
  'report.submit_error_default': { ja: '送信に失敗しました', en: 'Failed to submit', zh: '提交失败', fr: 'Échec de l’envoi', es: 'Error al enviar', ko: '전송에 실패했습니다' },
  'report.submit_success': { ja: '送信しました。ありがとうございます。', en: 'Submitted. Thank you!', zh: '提交成功，谢谢您！', fr: 'Envoyé. Merci !', es: '¡Enviado. Gracias!', ko: '전송되었습니다. 감사합니다.' },
  'report.receipt_id_label': { ja: '受付番号', en: 'Reference number', zh: '受理编号', fr: 'Numéro de référence', es: 'Número de referencia', ko: '접수 번호' },
  'report.receipt_points': { ja: ' / {points} ポイント獲得', en: ' / {points} points earned', zh: ' / 获得 {points} 积分', fr: ' / {points} points obtenus', es: ' / {points} puntos obtenidos', ko: ' / {points} 포인트 획득' },
  'report.submit_done_btn': { ja: '✅ 送信済み', en: '✅ Submitted', zh: '✅ 已提交', fr: '✅ Envoyé', es: '✅ Enviado', ko: '✅ 전송 완료' },

  // ---- judge.html ----
  'judge.title': { ja: '違和感チェック - TIUC', en: 'Naturalness Check - TIUC', zh: '自然度检查 - TIUC', fr: 'Vérification de la fluidité - TIUC', es: 'Verificación de naturalidad - TIUC', ko: '어색함 체크 - TIUC' },
  'judge.h1': { ja: '🔍 違和感チェック', en: '🔍 Naturalness check', zh: '🔍 自然度检查', fr: '🔍 Vérification de la fluidité', es: '🔍 Verificación de naturalidad', ko: '🔍 어색함 체크' },
  'judge.lead': {
    ja: '訳文を見て、自然かどうかを一タップで判定してください。母語話者向けです。',
    en: 'Look at the translation and judge whether it sounds natural with one tap. For native speakers.',
    zh: '看一下译文，一键判断是否自然。适合母语者参与。',
    fr: 'Regardez la traduction et jugez en un clic si elle sonne naturelle. Destiné aux locuteurs natifs.',
    es: 'Mira la traducción y juzga si suena natural con un solo toque. Para hablantes nativos.',
    ko: '번역문을 보고 자연스러운지 한 번의 탭으로 판정해 주세요. 원어민을 위한 기능입니다.',
  },
  'judge.btn_unnatural': { ja: '😕 不自然', en: '😕 Unnatural', zh: '😕 不自然', fr: '😕 Pas naturel', es: '😕 No natural', ko: '😕 부자연스러움' },
  'judge.btn_natural': { ja: '🙂 自然', en: '🙂 Natural', zh: '🙂 自然', fr: '🙂 Naturel', es: '🙂 Natural', ko: '🙂 자연스러움' },
  'judge.skip_btn': { ja: 'スキップして次へ', en: 'Skip to next', zh: '跳过并进入下一个', fr: 'Passer au suivant', es: 'Saltar al siguiente', ko: '건너뛰고 다음으로' },
  'judge.empty_text': {
    ja: '今この言語ペアで判定できる投稿はありません。<br>ほかの言語ペアを試すか、また後で来てください。',
    en: 'There are no submissions to judge for this language pair right now.<br>Try another language pair, or come back later.',
    zh: '目前没有可供该语言对判定的投稿。<br>请尝试其他语言对，或稍后再来。',
    fr: 'Il n’y a actuellement aucun signalement à juger pour cette paire de langues.<br>Essayez une autre paire de langues, ou revenez plus tard.',
    es: 'Ahora mismo no hay publicaciones para evaluar en este par de idiomas.<br>Prueba con otro par de idiomas o vuelve más tarde.',
    ko: '지금 이 언어 쌍으로 판정할 수 있는 게시물이 없습니다.<br>다른 언어 쌍을 시도하거나 나중에 다시 와 주세요.',
  },
  'judge.toast_dispatched': { ja: ' ・配車しました', en: ' • Dispatched', zh: ' ・已分派', fr: ' • Envoyé pour traitement', es: ' • Enviado para procesar', ko: ' ・배차되었습니다' },

  // ---- curate.html ----
  'curate.title': { ja: '修正・投票 - TIUC', en: 'Correct & Vote - TIUC', zh: '修正与投票 - TIUC', fr: 'Correction et vote - TIUC', es: 'Corrección y votación - TIUC', ko: '수정・투표 - TIUC' },
  'curate.h1': { ja: '✏️ 修正・投票', en: '✏️ Correct & vote', zh: '✏️ 修正与投票', fr: '✏️ Correction et vote', es: '✏️ Corrección y votación', ko: '✏️ 수정・투표' },
  'curate.lead': {
    ja: 'バイリンガル向けサブモード。正しい訳を提案するか、他の人の提案に投票してください。',
    en: 'A sub-mode for bilingual users. Suggest a correct translation, or vote on someone else’s suggestion.',
    zh: '面向双语者的子模式。请提出正确的译文，或为他人的提案投票。',
    fr: 'Sous-mode destiné aux bilingues. Proposez une traduction correcte ou votez pour la proposition de quelqu’un d’autre.',
    es: 'Submodo para usuarios bilingües. Propón una traducción correcta o vota la propuesta de otra persona.',
    ko: '이중언어자를 위한 서브모드입니다. 올바른 번역을 제안하거나 다른 사람의 제안에 투표해 주세요.',
  },
  'curate.tab_fix': { ja: '修正する', en: 'Correct', zh: '修正', fr: 'Corriger', es: 'Corregir', ko: '수정하기' },
  'curate.tab_vote': { ja: '投票する', en: 'Vote', zh: '投票', fr: 'Voter', es: 'Votar', ko: '투표하기' },
  'curate.verdict_fix': { ja: '修正が必要', en: 'Needs correction', zh: '需要修正', fr: 'Correction nécessaire', es: 'Necesita corrección', ko: '수정 필요' },
  'curate.verdict_no_issue': { ja: '実は問題なし', en: 'Actually fine', zh: '其实没问题', fr: 'En fait, c’est correct', es: 'En realidad está bien', ko: '사실 문제없음' },
  'curate.label_original': { ja: '原文(読み取れた日本語)', en: 'Original text (Japanese, as read)', zh: '原文（读取到的日语）', fr: 'Texte original (japonais tel que lu)', es: 'Texto original (japonés tal como se lee)', ko: '원문 (읽어낸 일본어)' },
  'curate.label_translated': { ja: '現在の訳文', en: 'Current translation', zh: '当前译文', fr: 'Traduction actuelle', es: 'Traducción actual', ko: '현재 번역문' },
  'curate.label_fixed': { ja: '修正後の訳文', en: 'Corrected translation', zh: '修正后的译文', fr: 'Traduction corrigée', es: 'Traducción corregida', ko: '수정된 번역문' },
  'curate.label_explanation': { ja: 'なぜ変か(任意)', en: 'Why it’s off (optional)', zh: '为什么奇怪（可选）', fr: 'Pourquoi est-ce bizarre (facultatif)', es: 'Por qué suena raro (opcional)', ko: '왜 이상한지 (선택)' },
  'curate.submit_fix_btn': { ja: 'この内容で提案する', en: 'Submit this suggestion', zh: '以此内容提出建议', fr: 'Envoyer cette proposition', es: 'Enviar esta propuesta', ko: '이 내용으로 제안하기' },
  'curate.empty_fix': {
    ja: '今この言語ペアで修正待ちの投稿はありません。',
    en: 'There are no submissions awaiting correction for this language pair right now.',
    zh: '目前没有该语言对待修正的投稿。',
    fr: 'Il n’y a actuellement aucun signalement en attente de correction pour cette paire de langues.',
    es: 'Ahora mismo no hay publicaciones pendientes de corrección para este par de idiomas.',
    ko: '지금 이 언어 쌍으로 수정 대기 중인 게시물이 없습니다.',
  },
  'curate.btn_disagree': { ja: '👎 賛成しない', en: '👎 Disagree', zh: '👎 不赞成', fr: '👎 Pas d’accord', es: '👎 No estoy de acuerdo', ko: '👎 반대' },
  'curate.btn_agree': { ja: '👍 賛成', en: '👍 Agree', zh: '👍 赞成', fr: '👍 D’accord', es: '👍 De acuerdo', ko: '👍 찬성' },
  'curate.empty_vote': {
    ja: '今この言語ペアで投票できる提案はありません。',
    en: 'There are no suggestions to vote on for this language pair right now.',
    zh: '目前没有该语言对可供投票的提案。',
    fr: 'Il n’y a actuellement aucune proposition à voter pour cette paire de langues.',
    es: 'Ahora mismo no hay propuestas para votar en este par de idiomas.',
    ko: '지금 이 언어 쌍으로 투표할 수 있는 제안이 없습니다.',
  },
  'curate.fixed_text_required': { ja: '修正後の訳文を入力してください', en: 'Please enter the corrected translation', zh: '请输入修正后的译文', fr: 'Veuillez saisir la traduction corrigée', es: 'Introduce la traducción corregida', ko: '수정된 번역문을 입력해 주세요' },
  'curate.toast_proposed': { ja: '+{points}pt 提案しました', en: '+{points}pt Suggestion submitted', zh: '+{points}pt 已提出建议', fr: '+{points}pt Proposition envoyée', es: '+{points}pt Propuesta enviada', ko: '+{points}pt 제안했습니다' },
  'curate.vote_meta': {
    ja: '原文: {original} / 現在の訳: {translated}',
    en: 'Original: {original} / Current translation: {translated}',
    zh: '原文：{original} / 当前译文：{translated}',
    fr: 'Original : {original} / Traduction actuelle : {translated}',
    es: 'Original: {original} / Traducción actual: {translated}',
    ko: '원문: {original} / 현재 번역: {translated}',
  },
  'curate.verdict_no_issue_result': { ja: '裁定: このままで問題なし', en: 'Verdict: fine as is', zh: '裁定：无需修改', fr: 'Verdict : correct tel quel', es: 'Veredicto: está bien así', ko: '판정: 이대로 문제없음' },
  'curate.proposed_translation': { ja: '提案訳: {fixed}', en: 'Suggested translation: {fixed}', zh: '建议译文：{fixed}', fr: 'Traduction proposée : {fixed}', es: 'Traducción propuesta: {fixed}', ko: '제안 번역: {fixed}' },
  'curate.toast_confirmed_suffix': { ja: ' ・確定しました!', en: ' • Confirmed!', zh: ' ・已确认！', fr: ' • Confirmé !', es: ' • ¡Confirmado!', ko: ' ・확정되었습니다!' },

  // ---- map.html ----
  'map.title': { ja: 'マップ - TIUC', en: 'Map - TIUC', zh: '地图 - TIUC', fr: 'Carte - TIUC', es: 'Mapa - TIUC', ko: '지도 - TIUC' },
  'map.h1': { ja: 'TIUC マップ', en: 'TIUC Map', zh: 'TIUC 地图', fr: 'Carte TIUC', es: 'Mapa TIUC', ko: 'TIUC 지도' },
  'map.place_placeholder': { ja: '地名・住所で検索(例: 新宿区)', en: 'Search by place name or address (e.g. Shinjuku)', zh: '按地名或地址搜索（例如：新宿区）', fr: 'Rechercher par nom de lieu ou adresse (ex. Shinjuku)', es: 'Buscar por nombre de lugar o dirección (ej. Shinjuku)', ko: '지명・주소로 검색 (예: 신주쿠구)' },
  'map.search_btn': { ja: '検索', en: 'Search', zh: '搜索', fr: 'Rechercher', es: 'Buscar', ko: '검색' },
  'map.lang_filter_btn': { ja: '言語', en: 'Language', zh: '语言', fr: 'Langue', es: 'Idioma', ko: '언어' },
  'map.legend_btn': { ja: '凡例', en: 'Legend', zh: '图例', fr: 'Légende', es: 'Leyenda', ko: '범례' },
  'map.lang_pair_header': { ja: '言語ペア', en: 'Language pairs', zh: '语言对', fr: 'Paires de langues', es: 'Pares de idiomas', ko: '언어 쌍' },
  'map.legend_mesh_header': { ja: '投稿件数(メッシュ集計)', en: 'Submission count (grid aggregate)', zh: '投稿数量（网格统计）', fr: 'Nombre de signalements (agrégation par maille)', es: 'Número de publicaciones (agregado por cuadrícula)', ko: '게시물 수 (메쉬 집계)' },
  'map.legend_pin_header': {
    ja: '採用済み(店がコミュニティ検証を認めた投稿のみピン表示)',
    en: 'Adopted (only submissions the shop has accepted through community review are pinned)',
    zh: '已采用（仅显示店铺认可社区验证结果的投稿）',
    fr: 'Adopté (seuls les signalements validés par la communauté et acceptés par le commerce sont épinglés)',
    es: 'Adoptado (solo se marcan las publicaciones que el comercio aceptó tras la verificación comunitaria)',
    ko: '채택 완료 (매장이 커뮤니티 검증을 인정한 게시물만 핀 표시)',
  },
  'map.legend_unsurveyed_header': { ja: '未投稿エリアの目安', en: 'Guide to areas with no submissions', zh: '未提交区域参考', fr: 'Indication des zones sans signalement', es: 'Guía de zonas sin publicaciones', ko: '미등록 지역 안내' },
  'map.mesh_0': { ja: '0件', en: '0', zh: '0 件', fr: '0', es: '0', ko: '0건' },
  'map.mesh_1_2': { ja: '1〜2件', en: '1–2', zh: '1–2 件', fr: '1–2', es: '1–2', ko: '1~2건' },
  'map.mesh_3_5': { ja: '3〜5件', en: '3–5', zh: '3–5 件', fr: '3–5', es: '3–5', ko: '3~5건' },
  'map.mesh_6_11': { ja: '6〜11件', en: '6–11', zh: '6–11 件', fr: '6–11', es: '6–11', ko: '6~11건' },
  'map.mesh_12plus': { ja: '12件以上', en: '12+', zh: '12 件以上', fr: '12+', es: '12+', ko: '12건 이상' },
  'map.status_reviewing': { ja: '審査中', en: 'Under review', zh: '审核中', fr: 'En cours d’examen', es: 'En revisión', ko: '심사 중' },
  'map.status_fix_proposed': { ja: '修正案あり', en: 'Correction proposed', zh: '有修正提案', fr: 'Correction proposée', es: 'Corrección propuesta', ko: '수정안 있음' },
  'map.status_looks_ok': { ja: '違和感なし', en: 'Looks fine', zh: '无违和感', fr: 'Semble correct', es: 'Parece correcto', ko: '위화감 없음' },
  'map.status_confirmed': { ja: '修正確定(採用待ち)', en: 'Correction confirmed (awaiting adoption)', zh: '修正已确认（待采用）', fr: 'Correction confirmée (en attente d’adoption)', es: 'Corrección confirmada (pendiente de adopción)', ko: '수정 확정 (채택 대기)' },
  'map.status_adopted': { ja: '採用済み', en: 'Adopted', zh: '已采用', fr: 'Adopté', es: 'Adoptado', ko: '채택 완료' },
  'map.unsurveyed_legend_item': { ja: '投稿0件(未投稿の目安)', en: '0 submissions (indicates no submissions)', zh: '投稿0件（未提交参考）', fr: '0 signalement (indication d’absence de signalement)', es: '0 publicaciones (indica ausencia de publicaciones)', ko: '게시물 0건 (미등록 안내)' },
  'map.label_confirmed_translation': { ja: '確定訳', en: 'Confirmed translation', zh: '已确定译文', fr: 'Traduction confirmée', es: 'Traducción confirmada', ko: '확정 번역' },
  'map.label_unconfirmed_translation': { ja: '訳文(未確定)', en: 'Translation (unconfirmed)', zh: '译文（未确定）', fr: 'Traduction (non confirmée)', es: 'Traducción (no confirmada)', ko: '번역문 (미확정)' },
  'map.row_status': { ja: '状態', en: 'Status', zh: '状态', fr: 'Statut', es: 'Estado', ko: '상태' },
  'map.row_lang': { ja: '言語', en: 'Language', zh: '语言', fr: 'Langue', es: 'Idioma', ko: '언어' },
  'map.row_original': { ja: '原文', en: 'Original', zh: '原文', fr: 'Original', es: 'Original', ko: '원문' },
  'map.row_date': { ja: '日付', en: 'Date', zh: '日期', fr: 'Date', es: 'Fecha', ko: '날짜' },
  'map.not_entered': { ja: '(未記入)', en: '(not entered)', zh: '（未填写）', fr: '(non renseigné)', es: '(no indicado)', ko: '(미기입)' },
  'map.goto_link': { ja: 'ここへ行く(Googleマップ)', en: 'Directions (Google Maps)', zh: '前往此处（谷歌地图）', fr: 'Itinéraire (Google Maps)', es: 'Cómo llegar (Google Maps)', ko: '이곳으로 가기 (구글 지도)' },
  'map.unsurveyed_popup_text': { ja: 'このエリアはまだ投稿がありません。', en: 'There are no submissions in this area yet.', zh: '该区域尚无投稿。', fr: 'Il n’y a pas encore de signalement dans cette zone.', es: 'Todavía no hay publicaciones en esta zona.', ko: '이 지역에는 아직 게시물이 없습니다.' },
  'map.area_too_large_hint': {
    ja: 'エリアが広すぎるため未投稿表示は省略しています。ズームインしてください。',
    en: 'The area is too large, so unsurveyed areas are not shown. Please zoom in.',
    zh: '由于区域过大，未提交区域的显示已省略。请放大地图。',
    fr: 'La zone est trop grande, l’affichage des zones sans signalement est donc omis. Veuillez zoomer.',
    es: 'El área es demasiado grande, por lo que no se muestran las zonas sin publicaciones. Acerca el mapa.',
    ko: '지역이 너무 넓어 미등록 표시를 생략했습니다. 확대해 주세요.',
  },
  'map.searching': { ja: '検索中...', en: 'Searching...', zh: '搜索中...', fr: 'Recherche en cours...', es: 'Buscando...', ko: '검색 중...' },
  'map.search_failed': { ja: '検索に失敗しました', en: 'Search failed', zh: '搜索失败', fr: 'Échec de la recherche', es: 'Error en la búsqueda', ko: '검색에 실패했습니다' },
  'map.not_found': { ja: '見つかりませんでした', en: 'No results found', zh: '未找到结果', fr: 'Aucun résultat trouvé', es: 'No se encontraron resultados', ko: '검색 결과가 없습니다' },

  // ---- mypage.html ----
  'mypage.title': { ja: 'マイページ - TIUC', en: 'My Page - TIUC', zh: '我的页面 - TIUC', fr: 'Mon espace - TIUC', es: 'Mi página - TIUC', ko: '마이페이지 - TIUC' },
  'mypage.h1': { ja: 'マイページ', en: 'My page', zh: '我的页面', fr: 'Mon espace', es: 'Mi página', ko: '마이페이지' },
  'mypage.lead': { ja: 'これまでの貢献とポイントです。', en: 'Here are your contributions and points so far.', zh: '这是您迄今为止的贡献和积分。', fr: 'Voici vos contributions et points jusqu’à présent.', es: 'Estas son tus contribuciones y puntos hasta ahora.', ko: '지금까지의 기여와 포인트입니다.' },
  'mypage.h2_posts': { ja: '投稿履歴', en: 'Submission history', zh: '投稿记录', fr: 'Historique des signalements', es: 'Historial de publicaciones', ko: '게시물 이력' },
  'mypage.h2_ledger': { ja: 'ポイント履歴', en: 'Points history', zh: '积分记录', fr: 'Historique des points', es: 'Historial de puntos', ko: '포인트 이력' },
  'mypage.detail_img_alt': { ja: '投稿時の写真', en: 'Photo submitted', zh: '投稿时的照片', fr: 'Photo publiée', es: 'Foto publicada', ko: '등록 당시 사진' },
  'mypage.status_pending_judgment': { ja: '判定待ち', en: 'Awaiting judgment', zh: '待判定', fr: 'En attente de jugement', es: 'Pendiente de evaluación', ko: '판정 대기' },
  'mypage.status_needs_fix': { ja: '修正待ち', en: 'Awaiting correction', zh: '待修正', fr: 'En attente de correction', es: 'Pendiente de corrección', ko: '수정 대기' },
  'mypage.status_looks_ok': { ja: '問題なし(確認済み)', en: 'No issue (confirmed)', zh: '无问题（已确认）', fr: 'Aucun problème (confirmé)', es: 'Sin problemas (confirmado)', ko: '문제없음 (확인됨)' },
  'mypage.status_confirmed': { ja: '修正確定', en: 'Correction confirmed', zh: '修正已确认', fr: 'Correction confirmée', es: 'Corrección confirmada', ko: '수정 확정' },
  'mypage.status_adopted': { ja: '店が採用', en: 'Adopted by the shop', zh: '店铺已采用', fr: 'Adopté par le commerce', es: 'Adoptado por el comercio', ko: '매장이 채택함' },
  'mypage.point_post_submit': { ja: '投稿', en: 'Submission', zh: '投稿', fr: 'Signalement', es: 'Publicación', ko: '게시' },
  'mypage.point_correction_confirm_bonus': { ja: '修正案が確定', en: 'Correction confirmed', zh: '修改方案已确认', fr: 'Correction confirmée', es: 'Corrección confirmada', ko: '수정안 확정' },
  'mypage.point_vote': { ja: '投票', en: 'Vote', zh: '投票', fr: 'Vote', es: 'Voto', ko: '투표' },
  'mypage.point_adopt_bonus': { ja: '店に採用', en: 'Adopted by shop', zh: '被店铺采用', fr: 'Adopté par le commerce', es: 'Adoptado por el comercio', ko: '매장에 채택됨' },
  'mypage.point_revoke': { ja: '取り消し', en: 'Revoked', zh: '撤销', fr: 'Annulé', es: 'Revocado', ko: '취소' },
  'mypage.point_manual': { ja: '運営調整', en: 'Manual adjustment', zh: '运营调整', fr: 'Ajustement manuel', es: 'Ajuste manual', ko: '운영 조정' },
  'mypage.stat_points': { ja: 'ポイント (Lv.{level})', en: 'Points (Lv.{level})', zh: '积分 (Lv.{level})', fr: 'Points (Lv.{level})', es: 'Puntos (Lv.{level})', ko: '포인트 (Lv.{level})' },
  'mypage.stat_posts': { ja: '投稿', en: 'Submissions', zh: '投稿', fr: 'Signalements', es: 'Publicaciones', ko: '게시물' },
  'mypage.posts_empty_text': {
    ja: 'まだ投稿がありません。街で見かけた外国語表記を撮ってみましょう。',
    en: 'You haven’t submitted anything yet. Try photographing a foreign-language sign you see in the city.',
    zh: '还没有投稿。试着拍下您在街上看到的外语标识吧。',
    fr: 'Vous n’avez encore rien publié. Essayez de photographier un texte en langue étrangère que vous voyez en ville.',
    es: 'Todavía no has publicado nada. Prueba a fotografiar un texto en idioma extranjero que veas en la ciudad.',
    ko: '아직 게시물이 없습니다. 거리에서 본 외국어 표기를 촬영해 보세요.',
  },
  'mypage.posts_empty_cta': { ja: '投稿する', en: 'Submit', zh: '去投稿', fr: 'Publier', es: 'Publicar', ko: '등록하기' },
  'mypage.ledger_empty': { ja: 'まだ履歴がありません。', en: 'No history yet.', zh: '还没有记录。', fr: 'Aucun historique pour le moment.', es: 'Todavía no hay historial.', ko: '아직 이력이 없습니다.' },
  'mypage.row_lang': { ja: '言語', en: 'Language', zh: '语言', fr: 'Langue', es: 'Idioma', ko: '언어' },
  'mypage.row_status': { ja: '状態', en: 'Status', zh: '状态', fr: 'Statut', es: 'Estado', ko: '상태' },
  'mypage.row_original': { ja: '原文', en: 'Original', zh: '原文', fr: 'Original', es: 'Original', ko: '원문' },
  'mypage.row_translated': { ja: '訳文', en: 'Translation', zh: '译文', fr: 'Traduction', es: 'Traducción', ko: '번역문' },
  'mypage.row_created_at': { ja: '投稿日', en: 'Date submitted', zh: '投稿日期', fr: 'Date de publication', es: 'Fecha de publicación', ko: '등록일' },
  'mypage.row_memo': { ja: 'メモ', en: 'Note', zh: '备注', fr: 'Remarque', es: 'Nota', ko: '메모' },
  'mypage.delete_btn': { ja: '削除する', en: 'Delete', zh: '删除', fr: 'Supprimer', es: 'Eliminar', ko: '삭제하기' },
  'mypage.deleting': { ja: '削除中...', en: 'Deleting...', zh: '删除中...', fr: 'Suppression en cours...', es: 'Eliminando...', ko: '삭제 중...' },
};
