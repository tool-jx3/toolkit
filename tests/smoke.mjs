/* 靜態 smoke 檢查。以 `npm test` 執行。 */
import { check, section, summary, loadI18N, read, exists, listFiles } from './harness.mjs';

/* ---- 引擎行為 ---- */
section('i18n engine');
const I18N = loadI18N();

check('預設語言為 zh-TW', I18N.locale === 'zh-TW', `got: ${I18N.locale}`);
check('註冊了 zh-TW、ko 與 ja 三種語言',
  Object.keys(I18N.locales).join(',') === 'zh-TW,ko,ja',
  `got: ${Object.keys(I18N.locales).join(',')}`);
check('每種語言都有顯示名稱與 lang 屬性',
  Object.values(I18N.locales).every(m => m.label && m.lang));
check('初始字典為空', Object.keys(I18N.messages['zh-TW']).length === 0);
check('未載入任何字典時只有預設語言可用',
  I18N.availableLocales().join(',') === 'zh-TW',
  `got: ${I18N.availableLocales().join(',')}`);

I18N.register({ 'zh-TW': { greet: '你好 {0}', only: '僅繁中' }, ko: { greet: '안녕 {0}' } });
check('register() 併入 zh-TW', I18N.t('greet') === '你好 {0}');
/* 語言選單只列出該頁確實載入字典的語言：只註冊了 ko，就不該出現 ja。 */
check('只列出已載入字典的語言',
  I18N.availableLocales().join(',') === 'zh-TW,ko',
  `got: ${I18N.availableLocales().join(',')}`);
check('切換至沒有字典的語言回傳 false', I18N.setLocale('ja') === false);
check('t() 代入位置參數', I18N.t('greet', '世界') === '你好 世界');
check('未知 key 回傳 key 本身', I18N.t('no.such.key') === 'no.such.key');

check('setLocale() 切換成功', I18N.setLocale('ko') === true);
check('切換後查得 ko 值', I18N.t('greet', '세계') === '안녕 세계');
check('ko 缺 key 時退回 zh-TW', I18N.t('only') === '僅繁中');
check('切換至相同語言回傳 false', I18N.setLocale('ko') === false);
check('切換至未知語言回傳 false', I18N.setLocale('en') === false);

/* 偏好全站共用，但工具只載入自己的原文語言字典：停在沒有該語言字典的
 * 頁面時，resolveLocale() 應退回預設語言呈現。 */
check('頁面缺少該語言字典時退回預設語言',
  I18N.resolveLocale() === 'ko' && (I18N.locale = 'ja', I18N.resolveLocale()) === 'zh-TW',
  `got: ${I18N.locale}`);
I18N.setLocale('ko');

let notified = null;
I18N.onChange(locale => { notified = locale; });
I18N.setLocale('zh-TW');
check('onChange 監聽器收到通知', notified === 'zh-TW', `got: ${notified}`);

I18N.register({ 'zh-TW': { second: '第二份' } });
check('register() 可多次呼叫且不覆蓋既有內容',
  I18N.t('second') === '第二份' && I18N.t('greet') === '你好 {0}');

/* ---- 各工具共用檢查 ---- */
const HANGUL = /[가-힣]/;
/* 日文只查平假名與片假名「字母」：漢字與中文重疊，不能當判準；片假名區塊裡的
 * 中點「・」與長音符「ー」也排除在外——前者中文同樣會用到，會把正常譯文誤判為
 * 未翻譯（真正的片假名詞一定帶有假名字母，不會因此漏掉）。 */
const KANA = /[\u3041-\u3096\u30A1-\u30FA\uFF66-\uFF9D]/;
/* 假名或漢字。character-editor 的解析錨點有純漢字的（「名前」「現在値」），
 * 只查假名會漏掉。僅用於那個工具的錨點比對，不當作原文洩漏的判準。 */
const JAPANESE = /[\u3041-\u3096\u30A1-\u30FA\uFF66-\uFF9D\u4E00-\u9FFF]/;

/* dir: 'tools/magic-circle'；dict: 字典檔名；
 * locale: 該工具原文語言的字典代碼（sotsotssi 的工具為 ko，shiki365 的為 ja）；
 * scripts: 需掃描的 JS 檔名陣列；styles: 需掃描原文洩漏的 CSS 檔名陣列
 * （不檢查 T() key 引用，CSS 本來就不會呼叫 T()）；
 * minHooks: 標記中 i18n 掛勾的最低數量；
 * allowSource(line, lineNo, file): 回傳 true 表示該行允許出現原文字元。 */
function checkTool({ dir, dict, locale = 'ko', scripts, styles = [], minHooks, allowSource = () => false, licence = true }) {
  section(dir);
  const tool = loadI18N([`${dir}/${dict}`]);
  const zh = new Set(Object.keys(tool.messages['zh-TW']));
  const ko = new Set(Object.keys(tool.messages[locale]));
  /* 原文洩漏的判準隨語言而異：韓文查諺文，日文查平假名與片假名——漢字
   * 與中文重疊，拿來當判準會把正常的譯文誤判為未翻譯。 */
  const SOURCE_CHARS = { ko: HANGUL, ja: KANA }[locale];

  check(`只載入 zh-TW 與 ${locale} 兩種語言的字典`,
    Object.keys(tool.messages).filter(l => Object.keys(tool.messages[l]).length).join(',') === `zh-TW,${locale}`,
    `got: ${Object.keys(tool.messages).filter(l => Object.keys(tool.messages[l]).length).join(',')}`);

  check('字典非空', zh.size > 0, `zh-TW keys: ${zh.size}`);
  check('定義了 app.title', zh.has('app.title'));

  const missingKo = [...zh].filter(k => !ko.has(k));
  const extraKo = [...ko].filter(k => !zh.has(k));
  check(`${locale} 涵蓋所有 zh-TW key`, missingKo.length === 0, `missing: ${missingKo.join(', ')}`);
  check(`${locale} 無多餘 key`, extraKo.length === 0, `unknown: ${extraKo.join(', ')}`);

  const ph = v => [...new Set(String(v).match(/\{\d+\}/g) || [])].sort().join(',');
  const badPh = [...zh].filter(k => ph(tool.messages['zh-TW'][k]) !== ph(tool.messages[locale][k] ?? ''));
  check('兩語言的 {n} 佔位符一致', badPh.length === 0, `mismatched: ${badPh.join(', ')}`);

  const html = read(`${dir}/index.html`);
  const htmlKeys = [...html.matchAll(/data-i18n(?:-html|-node|-title|-aria-label|-placeholder)?="([^"]+)"/g)].map(m => m[1]);
  const unknownHtml = [...new Set(htmlKeys)].filter(k => !zh.has(k));
  check('標記僅引用已知 key', unknownHtml.length === 0, `unknown: ${unknownHtml.join(', ')}`);
  check(`標記帶有至少 ${minHooks} 個 i18n 掛勾`, htmlKeys.length >= minHooks, `found ${htmlKeys.length}`);

  check('index.html 載入共用引擎', html.includes('assets/i18n.js'));
  check('index.html 載入自身字典', html.includes(dict));
  check('html lang 為 zh-Hant-TW', /<html[^>]*lang="zh-Hant-TW"/.test(html));

  const titleMatch = html.match(/<title>([^<]*)<\/title>/);
  check('<title> 與 app.title 的 zh-TW 值一致',
    !!titleMatch && titleMatch[1] === tool.messages['zh-TW']['app.title'],
    `<title>="${titleMatch ? titleMatch[1] : '(none)'}" app.title="${tool.messages['zh-TW']['app.title']}"`);

  const leakedIn = (src, file) => src.split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([n, line]) => SOURCE_CHARS.test(line) && !allowSource(line, n, file));
  const report = rows => rows.slice(0, 5)
    .map(([n, l]) => `L${n}: ${l.trim().slice(0, 80)}`).join('\n       ');

  for (const file of scripts) {
    const src = read(`${dir}/${file}`);
    /* A capture ending in '.' isn't a real key — it's the static prefix of a
     * runtime-concatenated call like T('rune.' + name). Skip those here;
     * their coverage is asserted separately (see the rune checks below). */
    const keys = [...src.matchAll(/\bT\((['"`])([a-zA-Z][\w.]*)\1/g)].map(m => m[2]).filter(k => !k.endsWith('.'));
    const unknown = [...new Set(keys)].filter(k => !zh.has(k));
    check(`${file} 僅引用已知 key`, unknown.length === 0, `unknown: ${unknown.join(', ')}`);

    const leaked = leakedIn(src, file);
    check(`${file} 無殘留原文`, leaked.length === 0, report(leaked));
  }

  const htmlLeaked = leakedIn(html, 'index.html');
  check('index.html 無殘留原文', htmlLeaked.length === 0, report(htmlLeaked));

  for (const file of styles) {
    const src = read(`${dir}/${file}`);
    const leaked = leakedIn(src, file);
    check(`${file} 無殘留原文`, leaked.length === 0, report(leaked));
  }

  /* emotion-maker 無原始 LICENSE，該工具傳入 licence: false。 */
  if (licence) check('保留原始 LICENSE', exists(`${dir}/LICENSE`));
  return tool;
}

/* ---- magic-circle ---- */
const mc = checkTool({
  dir: 'tools/magic-circle',
  dict: 'i18n.magic-circle.js',
  scripts: ['app.js'],
  styles: ['styles.css'],
  minHooks: 150
});

/* 如尼文讀音以 T('rune.' + name) 動態組成，靜態掃描看不到，需另外檢查。 */
section('tools/magic-circle runes');
const runeNames = [...read('tools/magic-circle/app.js')
  .matchAll(/\['[^']*', '[^']*', '([^']*)'\]/g)].map(m => m[1]);
check('解析出 69 組如尼文', runeNames.length === 69, `found ${runeNames.length}`);
for (const locale of ['zh-TW', 'ko']) {
  const missing = runeNames.filter(n => !mc.messages[locale][`rune.${n}`]);
  check(`${locale} 每組如尼文都有讀音`, missing.length === 0, `missing: ${missing.join(', ')}`);
}

/* 除了 69 組如尼文讀音之外，字典中其餘 rune.* key 只應是介面固定字串（源自
 * ref-zhtw 原始字典，非本次移植新增）。任何不在這兩個集合內的 rune.* key，
 * 代表萃取腳本混入了無關資料（例如把 app.js 中巧合出現的其他 4 元素陣列
 * 也當成如尼文組別解析）——這正是本檢查要防範的缺陷。 */
const runeReadingKeys = new Set(runeNames.map(n => `rune.${n}`));
const runeUiKeys = new Set([
  'rune.summary', 'rune.system',
  'rune.set.elder', 'rune.set.younger', 'rune.set.futhorc',
  'rune.setOption.elder', 'rune.setOption.younger', 'rune.setOption.futhorc',
  'rune.search', 'rune.search.placeholder',
  'rune.palette.aria', 'rune.palette.empty', 'rune.palette.status',
  'rune.converter.label', 'rune.converter.placeholder', 'rune.conversion.label',
  'rune.replace', 'rune.insert', 'rune.converter.hint'
]);
for (const locale of ['zh-TW', 'ko']) {
  const stray = Object.keys(mc.messages[locale])
    .filter(k => k.startsWith('rune.') && !runeReadingKeys.has(k) && !runeUiKeys.has(k));
  check(`${locale} 無多餘 rune.* key`, stray.length === 0, `stray: ${stray.join(', ')}`);
}

/* ---- text-path ---- */
const tp = checkTool({
  dir: 'tools/text-path',
  dict: 'i18n.text-path.js',
  scripts: ['app.js'],
  styles: ['styles.css'],
  minHooks: 30
});

/* 間距描述字以 T(densityDescriptorKey(val)) 動態組成，靜態掃描看不到，
 * 需另外檢查這 5 個 key 是否兩語言都存在。 */
section('tools/text-path density descriptors');
const densityKeys = ['density.veryTight', 'density.tight', 'density.normal', 'density.loose', 'density.veryLoose'];
for (const locale of ['zh-TW', 'ko']) {
  const missing = densityKeys.filter(k => !tp.messages[locale][k]);
  check(`${locale} 每個間距描述字都存在`, missing.length === 0, `missing: ${missing.join(', ')}`);
}

/* ---- collage-letter ---- */
const cl = checkTool({
  dir: 'tools/collage-letter',
  dict: 'i18n.collage-letter.js',
  scripts: ['app.js'],
  styles: ['styles.css'],
  minHooks: 30
});

/* 色彩標籤以 T(opt.labelKey) 動態組成，靜態掃描看不到，
 * 需另外檢查這些 key 是否兩語言都存在。 */
section('tools/collage-letter color labels');
const colorLabelKeys = [
  'color.blackWhite', 'color.whiteBlack', 'color.redWhite', 'color.yellowBlack',
  'color.magentaWhite', 'color.cyanBlack', 'color.grayBlack', 'color.darkYellow',
  'color.custom'
];
for (const locale of ['zh-TW', 'ko']) {
  const missing = colorLabelKeys.filter(k => !cl.messages[locale][k]);
  check(`${locale} 每個色彩標籤都存在`, missing.length === 0, `missing: ${missing.join(', ')}`);
}

/* ---- typewriter ---- */
const tw = checkTool({
  dir: 'tools/typewriter',
  dict: 'i18n.typewriter.js',
  scripts: ['script.js', 'webp-muxer.js'],
  styles: ['style.css'],
  minHooks: 80,
  /* webp-muxer.js 是原封不動保留的二進位編碼函式庫（供他案共用，非本次翻譯範圍）。
   * 其註解為上游作者所寫、僅供開發者閱讀，允許保留韓文；但其原本 8 個 throw/reject
   * 訊息屬使用者可能看見的文字，已改為穩定的英文錯誤代碼（見下方 webp-muxer error
   * codes 檢查），因此不在此豁免之列——只豁免整行皆為註解（// 或 * 開頭），或韓文
   * 完全落在行內尾隨 // 註解、或完整落在同一行內的區塊註解之中的行；其餘任何行
   * （含字串常值）仍須通過殘留韓文檢查，確保日後若再引入未翻譯訊息會使建置失敗。
   * script.js 中兩處字元類別 [^a-zA-Z0-9가-힣] 用於保留使用者輸入歌詞／字幕中的韓文
   * 字元以組成檔名，屬程式碼而非介面文字，同樣豁免。 */
  allowSource: (line, lineNo, file) => {
    if (file === 'webp-muxer.js') {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return true; /* 整行都是註解 */
      /* 去除行內尾隨的 // 註解，以及完整落在同一行內的區塊註解後，若剩餘的程式碼
       * 部分仍含韓文才視為洩漏。
       * 已知限制：跨越多行、且續行不是以 * 開頭的區塊註解（例如開頭行的區塊註解
       * 起始記號後面接韓文，收尾記號在後續行）不在此邏輯涵蓋範圍內——這種寫法目前
       * 不存在於此檔案（唯一的區塊註解是每行皆以 * 開頭的 JSDoc，已由上面的
       * startsWith('*') 涵蓋）。若日後新增這種格式的韓文註解，會被誤判為洩漏而使
       * 建置失敗；屆時請改寫成每行以 * 開頭的慣例格式，或在此處另行處理。 */
      const codeOnly = line
        .replace(/\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\//g, '')
        .replace(/\/\/.*/, ''); /* 不用 $ 錨點：來源檔為 CRLF 換行，行尾殘留的 \r
                                    會讓 . 在無 /s 旗標時卡住，使 $ 永遠比對不到。 */
      return !/[가-힣]/.test(codeOnly);
    }
    return /\[\^a-zA-Z0-9가-힣\]/.test(line);
  }
});

/* webp-muxer.js 以穩定的英文錯誤代碼（非在地化文字）拋出例外，script.js 的
 * WEBP_ERROR_KEYS 對照表在顯示前將代碼轉換為 T() 訊息；T(key) 的 key 是變數而非字面
 * 常數，靜態掃描看不到，需另外檢查這些 key 是否兩語言都存在。 */
section('tools/typewriter webp-muxer error codes');
const webpErrorKeys = [...read('tools/typewriter/script.js')
  .matchAll(/WEBP_ERR_\w+:\s*'([^']+)'/g)].map(m => m[1]);
check('解析出 8 組 webp-muxer 錯誤代碼', webpErrorKeys.length === 8, `found ${webpErrorKeys.length}`);
for (const locale of ['zh-TW', 'ko']) {
  const missing = webpErrorKeys.filter(k => !tw.messages[locale][k]);
  check(`${locale} 每個 webp-muxer 錯誤代碼都有對應訊息`, missing.length === 0, `missing: ${missing.join(', ')}`);
}

/* ---- emotion-maker ---- */
const emApp = read('tools/emotion-maker/app.js');

/* emotion-maker 的韓文為資料 ID，非顯示文字：MANIFEST 的 id（含 base 分類的
 * "피부"/"얼굴 틀"）與四個分類鍵（"눈"／"눈썹"／"입"／"꾸밈"，用於 CATS、
 * SINGLE、customParts、PRESETS 的部件引用等物件的鍵與陣列元素）。tag 已改為
 * i18n key，不在白名單內。
 *
 * 不變量：該行內每一段被雙引號包住、且含韓文的字串，都必須完整等於上述
 * 已知 ID 之一；且移除所有雙引號字串後，剩餘部分（含註解）不得再含韓文。
 * 這比舊版「整行含 id: 這個子字串、或含特定引號字串，就放行整行」更精確——
 * 舊版只要一行含 id:"..."（不論值為何）或恰好含 draft["입"] 這類子字串，
 * 就會放行該行「全部」內容，即使同一行另有未包裝的韓文顯示字串（例如
 * toast("입을 선택하세요")）也會被誤放行；新版逐一檢查每個引號字串本身
 * 是否為已知 ID，並確保引號外沒有殘留韓文。 */
const emKnownIds = new Set([
  ...[...emApp.matchAll(/\bid:\s*"([^"]*)"/g)].map(m => m[1]),
  '눈', '눈썹', '입', '꾸밈'
]);
function emLineAllowsHangul(line) {
  const quoted = [...line.matchAll(/"([^"]*)"/g)].map(m => m[1]);
  if (quoted.some(q => HANGUL.test(q) && !emKnownIds.has(q))) return false;
  return !HANGUL.test(line.replace(/"[^"]*"/g, ''));
}

const em = checkTool({
  dir: 'tools/emotion-maker',
  dict: 'i18n.emotion-maker.js',
  scripts: ['app.js'],
  styles: ['style.css'],
  minHooks: 40,
  licence: false,
  allowSource: (line, n, file) => file === 'app.js' && emLineAllowsHangul(line)
});

/* emotion-maker 無原始 LICENSE，checkTool 的該項檢查會失敗；
 * 以 ATTRIBUTION.md 標示取代（見 Task 8）。此處單獨確認其確實沒有。 */
section('tools/emotion-maker licence');
check('emotion-maker 無原始 LICENSE（未授權，於 ATTRIBUTION.md 標示）',
  !exists('tools/emotion-maker/LICENSE'));

/* 資產完整性：MANIFEST 每個 file 對應的 PNG 必須存在。 */
section('tools/emotion-maker assets');
const files = [...emApp.matchAll(/file:\s*"([^"]+)"/g)].map(m => m[1]);
check('MANIFEST 解析出 39 個部件', files.length === 39, `found ${files.length}`);
const missingPng = files.filter(f => !exists(`tools/emotion-maker/images/${f}.png`));
check('每個部件的 PNG 都存在', missingPng.length === 0, `missing: ${missingPng.join(', ')}`);
for (const locale of ['zh-TW', 'ko']) {
  const missing = files.filter(f => !em.messages[locale][`part.${f.replace('/', '.')}`]);
  check(`${locale} 每個部件都有顯示名稱`, missing.length === 0, `missing: ${missing.join(', ')}`);
}

/* 20 種內建 preset 的 tag 都要有譯文。 */
section('tools/emotion-maker presets');
const tags = [...emApp.matchAll(/tag:\s*"(preset\.[a-z]+)"/g)].map(m => m[1]);
check('解析出 20 組 preset', tags.length === 20, `found ${tags.length}`);
for (const locale of ['zh-TW', 'ko']) {
  const missing = tags.filter(t => !em.messages[locale][t]);
  check(`${locale} 每組 preset 都有名稱`, missing.length === 0, `missing: ${missing.join(', ')}`);
}

/* 分類標題以 T('cat.' + CAT_KEY[cat]) 動態組成，靜態掃描看不到，
 * 需另外檢查這 4 個 key 是否兩語言都存在。 */
section('tools/emotion-maker categories');
const catBlock = emApp.match(/const CAT_KEY = \{([^}]*)\}/)[1];
const catSuffixes = [...catBlock.matchAll(/:\s*"([a-z]+)"/g)].map(m => m[1]);
check('解析出 4 個分類代稱', catSuffixes.length === 4, `found ${catSuffixes.length}`);
for (const locale of ['zh-TW', 'ko']) {
  const missing = catSuffixes.filter(s => !em.messages[locale][`cat.${s}`]);
  check(`${locale} 每個分類都有顯示名稱`, missing.length === 0, `missing: ${missing.join(', ')}`);
}

/* ---- loading-maker ---- */
const lm = checkTool({
  dir: 'tools/loading-maker',
  dict: 'i18n.loading-maker.js',
  scripts: ['js/app.js', 'js/decoders.js', 'js/exporters.js', 'js/media.js', 'js/renderer.js', 'js/state.js', 'js/utils.js'],
  styles: ['css/styles.css'],
  minHooks: 250,
  licence: false
});

/* loading-maker 無原始 LICENSE，與 emotion-maker 同為未授權收錄，於
 * ATTRIBUTION.md 標示。此處單獨確認其確實沒有。 */
section('tools/loading-maker licence');
check('loading-maker 無原始 LICENSE（未授權，於 ATTRIBUTION.md 標示）',
  !exists('tools/loading-maker/LICENSE'));
check('保留第三方元件聲明（CDN 載入的 pako）',
  read('tools/loading-maker/THIRD_PARTY_NOTICES.md').includes('pako'));

/* 下列 key 由 JS 以變數或三元運算取得，靜態掃描（只認得 T('字面常數')）看不到，
 * 需另外確認兩語言都有定義。 */
section('tools/loading-maker dynamic keys');
const lmDynamicKeys = [
  /* T(EASING_KEYS[value])、T(SHAPE_KEYS[value]) */
  'easing.linear', 'easing.smooth', 'easing.easeIn', 'easing.easeOut',
  'easing.easeInOut', 'easing.steps', 'easing.bounce', 'easing.irregular',
  'shape.circle', 'shape.square', 'shape.diamond', 'shape.triangle',
  'shape.star', 'shape.heart', 'shape.hexagon',
  /* 功能徽章：items 陣列的第一欄 */
  'cap.input', 'cap.apng', 'cap.webp', 'cap.gif',
  /* 三元運算選出的 key */
  'duration.label.bar', 'duration.label.loop', 'duration.label.rowLoop',
  'duration.label.rowProgress', 'duration.label.none',
  'preview.play', 'preview.pause',
  'keyframe.startPoint', 'keyframe.easing',
  'msg.seamless', 'msg.seamless.extended',
  'msg.projectSaved', 'msg.projectSaved.assets',
  /* media.js 以 key 存入 source.warning，由 app.js 顯示 */
  'warn.liveCapture',
  /* 標記上的 data-suffix-key，由 syncUI() 取值 */
  'unit.perSecond', 'unit.times'
];
for (const locale of ['zh-TW', 'ko']) {
  const missing = lmDynamicKeys.filter(k => !lm.messages[locale][k]);
  check(`${locale} 每個動態 key 都有定義`, missing.length === 0, `missing: ${missing.join(', ')}`);
}

/* data-suffix-key 取代了原本寫死韓文的 data-suffix，兩者不應混用韓文。 */
const lmHtml = read('tools/loading-maker/index.html');
const suffixKeys = [...lmHtml.matchAll(/data-suffix-key="([^"]+)"/g)].map(m => m[1]);
check('標記中的 data-suffix-key 皆為已知 key',
  suffixKeys.length > 0 && suffixKeys.every(k => lm.messages['zh-TW'][k]),
  `found: ${suffixKeys.join(', ')}`);
check('index.html 掛上語言切換器與首頁連結',
  lmHtml.includes('id="localeSelect"') && lmHtml.includes('data-i18n="nav.home"'));

/* ---- foreground-frame ---- */
const ff = checkTool({
  dir: 'tools/foreground-frame',
  dict: 'i18n.foreground-frame.js',
  locale: 'ja',
  scripts: ['app.v2.js', 'presets.v1.js', 'model.v2.js', 'render.v2.js',
    'deco.v1.js', 'deco-extra.v1.js', 'effects.v1.js', 'icons.v1.js', 'zip.v1.js'],
  styles: ['styles.css'],
  minHooks: 200,
  /* presets.v1.js 的 CSS font-family 串中含日文字型名（"UD デジタル 教科書体 NK-R"）。
   * 那是使用者電腦上實際安裝的字型名稱，翻譯它會讓字型指定失效，故豁免該行。 */
  allowSource: (line, n, file) => file === 'presets.v1.js' && line.includes('stack:')
});

/* 下列 key 由 JS 以變數取得（presets 的 getter、items 的名稱欄、常數表），
 * 靜態掃描（只認得 T('字面常數')）看不到，需另外確認兩語言都有定義。 */
section('tools/foreground-frame dynamic keys');
const ffPresetKeys = [
  ...['simple', 'mansion', 'forest', 'horror', 'steampunk', 'winter', 'sakura', 'cinema',
    'novel', 'cyber', 'wa'].flatMap(id => [`design.${id}.label`, `design.${id}.desc`]),
  ...['time', 'weather', 'season', 'scene', 'sanity', 'chapter', 'custom']
    .flatMap(id => [`variantKind.${id}.label`, `variantKind.${id}.desc`]),
  ...['ivy', 'flowers', 'thorns', 'sakura', 'grass', 'stars', 'cobweb', 'chain', 'gears',
    'circuit', 'snowcap', 'drips']
    .flatMap(id => [`deco.${id}.label`, `deco.${id}.desc`, `deco.${id}.color1`, `deco.${id}.color2`]),
  ...['thin', 'normal', 'thick', 'cinema', 'novel', 'side'].map(id => `layout.${id}`),
  ...['gothic', 'mincho', 'kyokasho', 'serif', 'sans', 'tcgothic', 'tcmincho', 'tckai'].map(id => `font.${id}`),
  ...['tl', 'tc', 'tr', 'bl', 'bc', 'br'].map(id => `pos.${id}`),
  ...['square', 'round', 'chamfer', 'scoop', 'notch'].map(id => `cornerType.${id}`)
];
for (const locale of ['zh-TW', 'ja']) {
  const missing = ffPresetKeys.filter(k => !ff.messages[locale][k]);
  check(`${locale} 每個預設資料的顯示名稱都存在`, missing.length === 0, `missing: ${missing.join(', ')}`);
}

/* presets.v1.js 的清單資料（效果、圖示、配置、顏色參照、差分項目、尺寸）第二欄
 * 存的就是 key，逐一比對可確保資料與字典不會各自漂移。 */
const ffPresets = read('tools/foreground-frame/presets.v1.js');
const listedKeys = [...ffPresets.matchAll(/\["[\w-]+", "((?:effect|icon|placement|colorRef|variantKind)\.[\w.-]+)"\]/g)]
  .map(m => m[1]);
const sizeKeys = [...ffPresets.matchAll(/T\("(size\.[\w]+)"\)/g)].map(m => m[1]);
check('presets.v1.js 解析出清單 key', listedKeys.length >= 45, `found ${listedKeys.length}`);
check('presets.v1.js 解析出尺寸 key', sizeKeys.length === 7, `found ${sizeKeys.length}`);
for (const locale of ['zh-TW', 'ja']) {
  const missing = [...new Set([...listedKeys, ...sizeKeys])].filter(k => !ff.messages[locale][k]);
  check(`${locale} 每個清單 key 都有譯文`, missing.length === 0, `missing: ${missing.join(', ')}`);
}

/* 文字圖層的佔位符：日文寫法是原版與既有專案檔的格式，必須保留；
 * 繁中寫法則是本 repo 介面提示所顯示的。兩者都要被 render 接受。 */
section('tools/foreground-frame text tokens');
const ffRender = read('tools/foreground-frame/render.v2.js');
check('render 同時接受日文與繁中佔位符',
  ffRender.includes('(差分|時間帯)') && ffRender.includes('(英語|英文)'));
check('繁中提示用的佔位符與 render 接受的一致',
  ff.messages['zh-TW']['layers.text.hint'].includes('{差分}')
  && ff.messages['zh-TW']['layers.text.hint'].includes('{英文}'));

/* ---- scene-transition ---- */
const st = checkTool({
  dir: 'tools/scene-transition',
  dict: 'i18n.scene-transition.js',
  locale: 'ja',
  scripts: ['app.v1.js', 'apng.v1.js'],
  styles: ['styles.css'],
  minHooks: 60
});

/* 18 種預設集的說明以 T(p.descKey) 取得，key 存在資料裡，靜態掃描看不到。 */
section('tools/scene-transition presets');
const stPresetKeys = [...read('tools/scene-transition/app.v1.js')
  .matchAll(/descKey: "(preset\.[\w-]+)"/g)].map(m => m[1]);
check('解析出 18 組預設集', stPresetKeys.length === 18, `found ${stPresetKeys.length}`);
for (const locale of ['zh-TW', 'ja']) {
  const missing = stPresetKeys.filter(k => !st.messages[locale][k]);
  check(`${locale} 每組預設集都有說明`, missing.length === 0, `missing: ${missing.join(', ')}`);
  /* 選單標籤取「：」前半段，因此每則說明都必須含全形冒號。 */
  const noColon = stPresetKeys.filter(k => !String(st.messages[locale][k]).includes('：'));
  check(`${locale} 每組預設集說明都有全形冒號`, noColon.length === 0, `missing: ${noColon.join(', ')}`);
}


/* ---- status-bar ---- */
const sb = checkTool({
  dir: 'tools/status-bar',
  dict: 'i18n.status-bar.js',
  locale: 'ja',
  scripts: ['app.v1.js', 'presets.v1.js', 'css.v1.js', 'deco.v1.js',
    'model.v1.js', 'mock.v1.js', 'shapes.v1.js'],
  styles: ['styles.css'],
  minHooks: 200
});

/* presets.v1.js 的清單資料第二欄存的就是 key（設計範本、形狀、字型、動畫……），
 * 由 optionsHtml() 等單一出口統一 T()，靜態掃描看不到，需另外比對。 */
section('tools/status-bar preset keys');
const sbPresets = read('tools/status-bar/presets.v1.js');
const sbListKeys = [...sbPresets.matchAll(/\["[\w-]+", "([\w]+\.[\w.-]+)"/g)].map(m => m[1]);
check('presets.v1.js 解析出清單 key', sbListKeys.length >= 60, `found ${sbListKeys.length}`);
for (const locale of ['zh-TW', 'ja']) {
  const missing = [...new Set(sbListKeys)].filter(k => !sb.messages[locale][k]);
  check(`${locale} 每個清單 key 都有譯文`, missing.length === 0, `missing: ${missing.join(', ')}`);
}

/* 狀態列會把目前狀態存成 {key, args} 再於語言切換時重繪，因此這些 key 只會以
 * 變數形式傳進 T()，靜態掃描看不到。掃 app.v1.js 的 status()／statusError()
 * 呼叫取得實際用到的集合，逐一確認兩語言都有譯文。 */
section('tools/status-bar status messages');
const sbApp = read('tools/status-bar/app.v1.js');
const sbStatusKeys = [...new Set([
  ...[...sbApp.matchAll(/\bstatus(?:Error)?\("([\w]+\.[\w.]+)"/g)].map(m => m[1]),
  'status.loading'
])];
check('解析出狀態列訊息 key', sbStatusKeys.length >= 12, `found ${sbStatusKeys.length}`);
for (const locale of ['zh-TW', 'ja']) {
  const missing = sbStatusKeys.filter(k => !sb.messages[locale][k]);
  check(`${locale} 狀態列訊息齊全`, missing.length === 0, `missing: ${missing.join(', ')}`);
}

/* ---- chat-window ---- */
/* 這個工具刻意留著一批日文，分兩類：
 *   1. mock.v1.js 是把 CCFOLIA 的聊天畫面照著重畫一遍，好讓使用者看到的預覽
 *      就是 OBS 上會出現的樣子。CCFOLIA 只有日文介面，翻掉預覽就不是實際畫面。
 *   2. 骰子結果是 BCDice 與 CCFOLIA 的實際輸出，使用者的房間也是印這些字。
 * 清單釘死在這裡，不從原始碼推導——推導出來的清單會跟著被翻掉的字一起變，
 * 等於自己給自己開後門。釘死之後兩個方向都要對得上：
 *   每個字串都還在（翻掉就會掉），且原始碼裡每一段帶假名的文字都屬於這份清單
 *   （多出一段就是有介面文字沒被抽進字典）。 */
const CW_KEPT_JA = {
  'mock.v1.js': ['ルームチャット', 'メッセージを入力', 'メイン', '情報', '雑談',
    'チャットウィンドウをとじる', 'チャットタブを追加する', 'チャットを編集する', 'チャットに参加中のユーザー'],
  'presets.v1.js': ['メイン', '決定的成功/スペシャル', '致命的失敗'],
  'index.html': ['メイン', 'スペシャル'],
  /* 上游以英文註解記下 CCFOLIA 的 DOM 結構，其中引用了畫面上的日文字。 */
  'css.v1.js': ['ルームチャット', 'メイン']
};
const CW_KANA_RUN = /[ぁ-ゖァ-ヺｦ-ﾝ・ー一-鿿]+/g;

const cw = checkTool({
  dir: 'tools/chat-window',
  dict: 'i18n.chat-window.js',
  locale: 'ja',
  scripts: ['app.v1.js', 'presets.v1.js', 'css.v1.js', 'model.v1.js', 'mock.v1.js'],
  styles: ['styles.css'],
  minHooks: 180,
  /* 只有整行的每一段日文都在清單裡才放行：同一行多出一段新的原文仍然會被擋下。 */
  allowSource: (line, lineNo, file) => {
    const allowed = CW_KEPT_JA[file];
    if (!allowed) return false;
    return (line.match(CW_KANA_RUN) || [])
      .filter(run => KANA.test(run))
      /* 必須是允許字串的一部分。反過來放行的話，「メインメニューを開く」這種
       * 包住允許字串的新原文就會混過去。 */
      .every(run => allowed.some(keep => keep.includes(run)));
  }
});

section('tools/chat-window kept Japanese');
for (const [file, keeps] of Object.entries(CW_KEPT_JA)) {
  const src = read(`tools/chat-window/${file}`);
  for (const keep of keeps) {
    check(`${file} 仍保留「${keep}」`, src.includes(keep));
  }
}
/* 反向：把清單縮成「重畫 CCFOLIA 介面」那幾條，確認它們真的在 mock.v1.js 裡而不是別處。 */
const cwMock = read('tools/chat-window/mock.v1.js');
check('CCFOLIA 介面的重現都落在 mock.v1.js',
  CW_KEPT_JA['mock.v1.js'].every(k => cwMock.includes(k)));

/* presets.v1.js 的清單資料第二欄存 key，由 optionsHtml() 統一 T()，靜態掃描看不到。 */
section('tools/chat-window preset keys');
const cwPresets = read('tools/chat-window/presets.v1.js');
const cwListKeys = [
  ...[...cwPresets.matchAll(/\["[\w-]+", "([\w]+\.[\w.-]+)"\]/g)].map(m => m[1]),
  ...[...cwPresets.matchAll(/\[\d+, "([\w]+\.[\w.-]+)"\]/g)].map(m => m[1]),
  ...[...cwPresets.matchAll(/(?:label|desc|text|name): "([\w]+\.[\w.-]+)"/g)].map(m => m[1])
];
check('presets.v1.js 解析出清單 key', cwListKeys.length >= 120, `found ${cwListKeys.length}`);
for (const locale of ['zh-TW', 'ja']) {
  const missing = [...new Set(cwListKeys)].filter(k => !cw.messages[locale][k]);
  check(`${locale} 每個清單 key 都有譯文`, missing.length === 0, `missing: ${missing.join(', ')}`);
}

section('tools/chat-window status messages');
const cwApp = read('tools/chat-window/app.v1.js');
const cwStatusKeys = [...new Set([
  ...[...cwApp.matchAll(/\bstatus(?:Error)?\("([\w]+\.[\w.]+)"/g)].map(m => m[1]),
  'status.loading'
])];
check('解析出狀態列訊息 key', cwStatusKeys.length >= 14, `found ${cwStatusKeys.length}`);
for (const locale of ['zh-TW', 'ja']) {
  const missing = cwStatusKeys.filter(k => !cw.messages[locale][k]);
  check(`${locale} 狀態列訊息齊全`, missing.length === 0, `missing: ${missing.join(', ')}`);
}

/* css.v1.js 把譯文寫進產出的 CSS。那個檔案有好幾處把 st.title 取名為 T，
 * 直接呼叫全域 T() 會被蓋掉，因此一律走 TX()；寫回 T() 會靜靜地拿到錯的東西。 */
const cwCss = read('tools/chat-window/css.v1.js');
check('css.v1.js 以 TX() 取譯文，避開被區域變數 T 蓋掉',
  cwCss.includes('const TX = (key, ...args) => window.T(key, ...args);')
  && !/[^.\w]T\((["'`])[a-zA-Z]/.test(cwCss));
const cwCssKeys = [...new Set([...cwCss.matchAll(/\bTX\("([\w]+\.[\w.]+)"/g)].map(m => m[1]))];
check('解析出產出 CSS 的註解 key', cwCssKeys.length >= 20, `found ${cwCssKeys.length}`);
for (const locale of ['zh-TW', 'ja']) {
  const missing = cwCssKeys.filter(k => !cw.messages[locale][k]);
  check(`${locale} 產出 CSS 的註解齊全`, missing.length === 0, `missing: ${missing.join(', ')}`);
}

/* 預覽是 append-only 算繪：只比對 id 的話，切語言時 id 沒變、文字換了一套，
 * 預覽會停在舊語言。文字與骰子結果都要進比對條件。 */
check('mock.v1.js 沿用舊節點前會比對文字',
  /appendOnly[\s\S]{0,400}m\.text === data\.messages\[i\]\.text/.test(cwMock));

/* 範本裡的兩個文字欄位存 i18n key，套用當下才取譯文。 */
check('model.v1.js 套用範本時解析文字欄位的 key',
  read('tools/chat-window/model.v1.js').includes('function localizeLook'));

/* ---- ccfolia-cropper ---- */
checkTool({
  dir: 'tools/ccfolia-cropper',
  dict: 'i18n.ccfolia-cropper.js',
  scripts: ['app.js'],
  styles: ['styles.css'],
  minHooks: 25,
  /* 上游未附任何授權條款，狀態記於 ATTRIBUTION.md。 */
  licence: false
});

/* 未授權，故不應有 LICENSE；理由同 emotion-maker 與 loading-maker。 */
check('ccfolia-cropper 無原始 LICENSE（未授權，於 ATTRIBUTION.md 標示）',
  !exists('tools/ccfolia-cropper/LICENSE'));

section('tools/ccfolia-cropper crop hint');
/* 裁切框的提示由 CSS 的 content: attr(data-hint) 顯示。::after 沒有 data-i18n
 * 掛勾可掛，改由 app.js 在語言切換時寫入；HTML 裡的初始值仍須與字典一致，
 * 否則腳本執行前後會閃字。 */
const ccHtml = read('tools/ccfolia-cropper/index.html');
const ccDict = loadI18N(['tools/ccfolia-cropper/i18n.ccfolia-cropper.js']).messages['zh-TW'];
const ccHint = ccHtml.match(/data-hint="([^"]*)"/);
check('裁切框提示的內嵌值與 zh-TW 字典一致',
  !!ccHint && ccHint[1] === ccDict['crop.dragHint'],
  `data-hint="${ccHint ? ccHint[1] : '(none)'}" 字典="${ccDict['crop.dragHint']}"`);
check('app.js 在語言切換時更新裁切框提示',
  read('tools/ccfolia-cropper/app.js').includes("I18N.onChange(applyCropHint)"));

/* ---- cutin ---- */
/* 唯一需要建置的工具：原始碼在 vendor/cutin-maker/，畫面全部由 React 算繪，
 * 因此 index.html 只有外殼那三個掛勾，沒有內嵌文字可比對。改為檢查
 * 「已提交的建置產物」與「原始碼引用的 key」兩邊都對得上。 */
const cutin = checkTool({
  dir: 'tools/cutin',
  dict: 'i18n.cutin.js',
  locale: 'ja',
  scripts: [],
  minHooks: 3
});

section('tools/cutin build output');
const cutinZh = new Set(Object.keys(cutin.messages['zh-TW']));
/* 只由 index.html 或 i18n 引擎使用，不會出現在 React 原始碼裡。 */
const CUTIN_SHELL_KEYS = ['app.title', 'nav.home', 'lang.aria', 'noscript'];
/* MOTIONS 以 `motion.${id}` 動態組成，原始碼裡沒有字面常數。 */
const CUTIN_DYNAMIC_KEYS = ['motion.none', 'motion.pulse', 'motion.bounce',
  'motion.shake', 'motion.rotate', 'motion.wave'];
/* TEXT_PRESETS（一次匯出多張用的文案組）在上游是 export 出來但還沒接到畫面上的
 * 資料，Rollup 會把它整段搖掉，因此這幾個 key 不會出現在 bundle 裡。保留字典
 * 條目是為了讓 vendor/ 的原始碼維持與上游一致。 */
const CUTIN_TREE_SHAKEN_KEYS = ['textPreset.coc', 'textPreset.simple',
  'textPreset.battle', 'textPreset.kp'];

const cutinSrc = listFiles('vendor/cutin-maker/src')
  .filter(f => /\.tsx?$/.test(f))
  .map(f => read(f))
  .join('\n');
const cutinUsed = [...cutinZh].filter(k => cutinSrc.includes(`'${k}'`));
check('原始碼引用了字典中的大多數 key', cutinUsed.length >= 200, `found ${cutinUsed.length}`);

const stale = [...cutinZh].filter(k =>
  !cutinUsed.includes(k) && !CUTIN_SHELL_KEYS.includes(k) && !CUTIN_DYNAMIC_KEYS.includes(k));
check('字典沒有原始碼用不到的 key', stale.length === 0, `stale: ${stale.join(', ')}`);

const cutinMissing = CUTIN_DYNAMIC_KEYS.filter(k => !cutinZh.has(k));
check('動態組出來的 key 都有譯文', cutinMissing.length === 0, `missing: ${cutinMissing.join(', ')}`);

/* 建置產物是提交進 repo 的，改了原始碼卻忘記 `npm run build` 時，
 * 新加的 key 就不會出現在 bundle 裡——這項檢查會抓到。 */
const cutinBundle = read('tools/cutin/assets/app.js');
const notBuilt = cutinUsed
  .filter(k => !CUTIN_TREE_SHAKEN_KEYS.includes(k))
  .filter(k => !cutinBundle.includes(k));
check('建置產物是最新的（原始碼的 key 都在 bundle 裡）',
  notBuilt.length === 0, `missing from bundle: ${notBuilt.slice(0, 10).join(', ')}`);

/* 畫面文字全部來自字典，因此 bundle 裡不該留有任何假名。 */
for (const file of ['assets/app.js', 'assets/encode.worker.js', 'assets/index.css']) {
  check(`${file} 無殘留原文`, !KANA.test(read(`tools/cutin/${file}`)));
}



/* ---- character-select ---- */
const cs = checkTool({
  dir: 'tools/character-select',
  dict: 'i18n.character-select.js',
  scripts: ['app.js', 'crop.js', 'fonts.js', 'video-export.js'],
  styles: ['styles.css', 'crop.css', 'fonts.css'],
  minHooks: 220,
  /* 上游未附任何授權條款，狀態記於 ATTRIBUTION.md。 */
  licence: false
});
check('character-select 無原始 LICENSE（未授權，於 ATTRIBUTION.md 標示）',
  !exists('tools/character-select/LICENSE'));

/* 清單、玩家面板、裁切編輯器的文字都是 JS 組出來的，標記上沒有 data-i18n 掛勾，
 * 所以 key 幾乎都以字面常數傳進 T()——但也有幾組是存在資料表裡再取出來用的，
 * 靜態掃描看不到，逐一確認兩語言都有定義。 */
section('tools/character-select dynamic keys');
const csApp = read('tools/character-select/app.js');
const csDynamicKeys = [
  /* 分頁提示：guides 表存的是 key 對 */
  ...['guide.title', 'guide.copy'],
  ...['appearance', 'motion', 'export'].flatMap(t => [`guide.${t}.title`, `guide.${t}.copy`]),
  /* 玩家列的 aria-label 後綴，改版後由 key 取代原本的字面後綴 */
  'player.colorAria', 'player.targetCharAria', 'route.startAria', 'route.modeAria',
];
for (const locale of ['zh-TW', 'ko']) {
  const missing = csDynamicKeys.filter(k => !cs.messages[locale][k]);
  check(`${locale} 每個動態 key 都有譯文`, missing.length === 0, `missing: ${missing.join(', ')}`);
}
check('app.js 的 guides 表存的是 key 而非譯文',
  csApp.includes('characters: ["guide.title", "guide.copy"]'));

/* 語言切換時整批重畫：清單與面板沒有 data-i18n 掛勾，引擎的 applyStaticDom()
 * 碰不到，漏了這段就會停在舊語言。 */
check('app.js 在語言切換時重畫 JS 產生的區塊',
  ['renderCharacterList()', 'renderPlayerList()', 'renderPreviewPlayers()', 'updateExportEstimate()']
    .every(call => new RegExp(`I18N\\.onChange\\([\\s\\S]{0,600}${call.replace('(', '\\(').replace(')', '\\)')}`).test(csApp)));
/* initializeTheme() 會綁 click，重畫時只能改按鈕文字，不能整個再跑一次。 */
check('語言切換時不重複綁定主題按鈕',
  !/I18N\.onChange\([\s\S]{0,600}initializeTheme\(\)/.test(csApp));
check('app.js 掛上語言切換器', csApp.includes('I18N.mountSwitcher($("#localeSelect"))'));

/* video-export.js 的兩則訊息原本是模組載入時就固定的字串常數，改成函式才會
 * 在拋出當下取譯文；寫回常數就會永遠停在載入時的語言。 */
const csVideo = read('tools/character-select/video-export.js');
check('video-export.js 的訊息在拋出時才取譯文',
  /const MP4_UNAVAILABLE = \(\) =>/.test(csVideo) && /const TOO_LARGE = \(\) =>/.test(csVideo)
  && !/new Error\(TOO_LARGE\)/.test(csVideo) && !/new Error\(MP4_UNAVAILABLE\)/.test(csVideo));


/* ---- character-editor ---- */
/* 第二個需要建置的工具。畫面全由 React 算繪，index.html 只有外殼那三個掛勾。 */
const ce = checkTool({
  dir: 'tools/character-editor',
  dict: 'i18n.character-editor.js',
  locale: 'ja',
  scripts: [],
  minHooks: 3,
  /* 上游未附任何授權條款，狀態記於 ATTRIBUTION.md。 */
  licence: false
});
check('character-editor 無原始 LICENSE（未授權，於 ATTRIBUTION.md 標示）',
  !exists('tools/character-editor/LICENSE'));

section('tools/character-editor build output');
const ceZh = new Set(Object.keys(ce.messages['zh-TW']));
const CE_SHELL_KEYS = ['app.title', 'nav.home', 'lang.aria', 'noscript'];
/* prepareImport() 以字串常數傳進來，不是 t() 呼叫，靜態掃描看不到。 */
const CE_INDIRECT_KEYS = ['source.json', 'source.editText'];

const ceSrc = listFiles('vendor/ccfolia-character-editor/src')
  .filter(f => /\.tsx?$/.test(f) && !/\.test\./.test(f))
  .map(f => read(f))
  .join('\n');
const ceUsed = [...ceZh].filter(k => ceSrc.includes(`"${k}"`));
check('原始碼引用了字典中的大多數 key', ceUsed.length >= 60, `found ${ceUsed.length}`);
const ceStale = [...ceZh].filter(k =>
  !ceUsed.includes(k) && !CE_SHELL_KEYS.includes(k) && !CE_INDIRECT_KEYS.includes(k));
check('字典沒有原始碼用不到的 key', ceStale.length === 0, `stale: ${ceStale.join(', ')}`);

const ceBundle = read('tools/character-editor/assets/app.js');
const ceNotBuilt = ceUsed.filter(k => !ceBundle.includes(k));
check('建置產物是最新的（原始碼的 key 都在 bundle 裡）',
  ceNotBuilt.length === 0, `missing from bundle: ${ceNotBuilt.slice(0, 10).join(', ')}`);

/* editScreenText.ts 的日文字面常數幾乎都是解析錨點——使用者從 CCFOLIA 編輯畫面
 * 複製貼上的文字要靠它們切分，翻譯了就對不起來。因此這個工具不能像 cutin 那樣
 * 一律禁止假名。
 *
 * 錨點清單釘死在這裡，不從 editScreenText.ts 推導：推導出來的清單會隨著被翻譯的
 * 錨點一起變，等於自己給自己開後門（把錨點翻掉，它就自動進了允許名單）。釘死之後
 * 三個方向都要對得上：
 *   1. 原始碼裡的日文字面常數，恰好就是這份清單（多了代表上游新增了沒審過的錨點，
 *      少了代表有錨點被翻掉或刪掉）；
 *   2. 每個錨點原封不動出現在 bundle 裡（翻掉或建置沒更新都會掉）；
 *   3. bundle 裡殘存的每一段日文，都必須是某個錨點的一部分（或作者署名）。
 *      多出任何一段，就代表有介面文字沒被抽進字典。 */
const CE_ANCHORS = [
  '1d100 などのダイスコマンドやキャラクターに紐づくチャットコマンドを改行区切りで登録します。',
  'HPやMPなどのキャラクターに連動して変動するステータスを設定します。',
  'イニシアティブ',
  'キャラクターに対してめったに変動しないパラメータを設定します。',
  'キャラクター編集',
  'ステータス',
  'ステータスを非公開にする',
  'チャットパレット',
  'パラメータ',
  'ラベル',
  '値',
  '参照URL',
  '名前',
  '最大値',
  '現在値',
  '発言時キャラクターを表示しない',
  '盤面キャラクター一覧に表示しない',
  '秘匿NPC・敵キャラクターなど',
  '立ち絵・差分',
  '駒サイズ'
];
const ceAnchorSrc = read('vendor/ccfolia-character-editor/src/lib/editScreenText.ts');
/* 空字串 "" 也要吃得下，否則引號會配對錯位、錨點少抓一半。 */
const ceFound = [...new Set([...ceAnchorSrc.matchAll(/"([^"]*)"/g)]
  .map(m => m[1]).filter(a => JAPANESE.test(a)))].sort();
const ceExpected = [...CE_ANCHORS].sort();
const ceAdded = ceFound.filter(a => !ceExpected.includes(a));
const ceGone = ceExpected.filter(a => !ceFound.includes(a));
check('editScreenText.ts 的日文字面常數與釘死的錨點清單一致',
  ceAdded.length === 0 && ceGone.length === 0,
  `unexpected: ${ceAdded.join(' / ')} | missing: ${ceGone.join(' / ')}`);
for (const anchor of CE_ANCHORS) {
  check(`解析錨點「${anchor.slice(0, 12)}」原封不動留在 bundle 裡`, ceBundle.includes(anchor));
}
const CE_ALLOWED_JP = ['巡涯学派']; /* 作者署名。固有名詞なので訳さない。 */
const ceRuns = [...new Set(ceBundle.match(/[\u3041-\u3096\u30A1-\u30FA\u30FB\u30FC\u4E00-\u9FFF]+/g) || [])];
const ceStray = ceRuns.filter(r => !CE_ALLOWED_JP.includes(r) && !CE_ANCHORS.some(a => a.includes(r)));
check('bundle 裡的日文只剩解析錨點與作者署名',
  ceStray.length === 0, `stray: ${ceStray.join(' / ')}`);

/* 上游測試靠畫面的日文標籤找元素，收錄版把 ja 字典注入 window.T 才能通過。 */
check('上游 vitest 的 setup 會注入 ja 字典',
  read('vendor/ccfolia-character-editor/src/test/setup.ts').includes('i18n.character-editor.js'));
/* 訊息的錯誤判定原本靠字串比對，改成明示的 isError；寫回字串比對就會靜靜失效。 */
const ceApp = read('vendor/ccfolia-character-editor/src/App.tsx');
check('訊息以 isError 判定，而非比對譯文內容',
  ceApp.includes('isError: boolean') && !/Message\.includes\(|Message\.includes\s*\(/.test(ceApp)
  && !ceApp.includes('parseMessage.includes('));

/* ---- 繁體中文網頁字型 ---- */
/* 五套字型分散在四個工具裡，各自用不同的寫法要求 Google Fonts。字重寫錯會讓
 * 整個 family 的 @font-face 靜靜地不見（Google Fonts 對不存在的字重回 400，
 * 整個 css2 請求就失敗），畫面上看起來只是「字型沒套用」，很難追。
 * 下面把各處宣告的字重跟這張驗證過的表對起來，寫錯就會在這裡被擋下。 */
section('Traditional Chinese webfonts');

/* 以 fonts.googleapis.com/css2 逐一驗證過（2026-09-15）。 */
const TC_WEIGHTS = {
  'Noto Sans TC': [100, 200, 300, 400, 500, 600, 700, 800, 900],
  'Noto Serif TC': [200, 300, 400, 500, 600, 700, 800, 900],
  'LXGW WenKai TC': [300, 400, 700],
  'Chocolate Classical Sans': [400],
  'Cactus Classical Serif': [400],
};
const TC_FAMILIES = Object.keys(TC_WEIGHTS);

/* css2 的網址裡，family 用 + 連字，字重寫在 :wght@ 後面並以 ; 分隔。 */
function checkCss2Url(label, url) {
  for (const m of url.matchAll(/family=([^&:]+)(?::wght@([\d;]+))?/g)) {
    const family = decodeURIComponent(m[1]).replace(/\+/g, ' ');
    if (!TC_FAMILIES.includes(family)) continue; /* 日／韓／拉丁字型不在這張表裡 */
    const asked = (m[2] ?? '').split(';').filter(Boolean).map(Number);
    const bad = asked.filter(w => !TC_WEIGHTS[family].includes(w));
    check(`${label}：${family} 要求的字重都存在`, bad.length === 0,
      `不存在的字重: ${bad.join(', ')}（可用: ${TC_WEIGHTS[family].join(', ')}）`);
  }
}

/* cutin：FONTS 的 family 與 FONT_CSS 的網址要一一對上。 */
const cutinFonts = read('vendor/cutin-maker/src/core/fonts.ts');
const cutinTcIds = ['noto-tc', 'serif-tc', 'wenkai-tc', 'choco-tc', 'cactus-tc'];
for (const id of cutinTcIds) {
  check(`cutin 字典有 font.${id}`, cutinZh.has(`font.${id}`));
  check(`cutin 的 FONTS 有 ${id}`, cutinFonts.includes(`id: '${id}'`));
}
for (const m of cutinFonts.matchAll(/'([\w-]+)': '(https:\/\/fonts\.googleapis\.com\/css2\?[^']+)'/g)) {
  checkCss2Url(`cutin FONT_CSS ${m[1]}`, m[2]);
}
/* FONTS 裡宣告的 weight 就是實際畫圖時用的字重，必須也在 FONT_CSS 要得到。 */
const cutinWeights = [...cutinFonts.matchAll(/id: '([\w-]+)',[^\n]*family: '"([^"]+)"',\s*weight: (\d+)/g)];
check('cutin 解析出 11 套字型', cutinWeights.length === 11, `found ${cutinWeights.length}`);
for (const [, id, family, weight] of cutinWeights) {
  if (!TC_FAMILIES.includes(family)) continue;
  check(`cutin ${id} 的 weight ${weight} 存在於 ${family}`,
    TC_WEIGHTS[family].includes(Number(weight)),
    `可用: ${TC_WEIGHTS[family].join(', ')}`);
  /* 單一字重的字型不接受 :wght@，多字重的則必須指名畫圖時要用的那個字重。 */
  const css = cutinFonts.match(new RegExp(`'${id}': '([^']+)'`));
  const wantsAxis = TC_WEIGHTS[family].length > 1;
  check(`cutin ${id} 的 FONT_CSS 要求同一個字重`,
    !!css && css[1].includes(`wght@${weight}`) === wantsAxis,
    css ? css[1] : '(找不到 FONT_CSS)');
}

/* 上游的 vitest 會把 FONTS 逐一代進版面測試，字幅比存在測試檔自己的 RATIOS 表裡。
 * 加了字型卻忘記補這張表，stub 會拿到 undefined，整批測試變成 NaN 比較而全滅。
 * 那套測試需要 npm install，不在根目錄 npm test 的範圍內，所以在這裡靜態比對一次。 */
const cutinLayoutTest = read('vendor/cutin-maker/tests/layout.test.ts');
const ratioIds = [...cutinLayoutTest.matchAll(/^\s+'?([\w-]+)'?: [\d.]+,$/gm)].map(m => m[1]);
const noRatio = cutinWeights.map(m => m[1]).filter(id => !ratioIds.includes(id));
check('cutin 的每套字型在版面測試的 RATIOS 都有字幅比', noRatio.length === 0, `missing: ${noRatio.join(', ')}`);

/* status-bar：FONTS 表的 weights 陣列直接餵給 css2，錯一個就整批 import 失敗。 */
const sbFonts = read('tools/status-bar/presets.v1.js');
for (const m of sbFonts.matchAll(/family: "([^"]+)", weights: \[([\d, ]+)\]/g)) {
  if (!TC_FAMILIES.includes(m[1])) continue;
  const bad = m[2].split(',').map(w => Number(w.trim())).filter(w => !TC_WEIGHTS[m[1]].includes(w));
  check(`status-bar：${m[1]} 的 weights 都存在`, bad.length === 0,
    `不存在的字重: ${bad.join(', ')}（可用: ${TC_WEIGHTS[m[1]].join(', ')}）`);
}
const sbTcKeys = ['font.notosanstc', 'font.notoseriftc', 'font.wenkaitc', 'font.chocolatetc', 'font.cactustc'];
for (const locale of ['zh-TW', 'ja']) {
  const missing = sbTcKeys.filter(k => !sb.messages[locale][k]);
  check(`status-bar ${locale} 每套繁中字型都有標籤`, missing.length === 0, `missing: ${missing.join(', ')}`);
}

/* chat-window：字型清單與 status-bar 同一份（上游原始碼自己就這麼註明），
 * 同樣把 weights 直接餵給 css2，錯一個就整批 import 失敗。 */
const cwFonts = read('tools/chat-window/presets.v1.js');
for (const m of cwFonts.matchAll(/family: "([^"]+)", weights: \[([\d, ]+)\]/g)) {
  if (!TC_FAMILIES.includes(m[1])) continue;
  const bad = m[2].split(',').map(w => Number(w.trim())).filter(w => !TC_WEIGHTS[m[1]].includes(w));
  check(`chat-window：${m[1]} 的 weights 都存在`, bad.length === 0,
    `不存在的字重: ${bad.join(', ')}（可用: ${TC_WEIGHTS[m[1]].join(', ')}）`);
}
for (const locale of ['zh-TW', 'ja']) {
  const missing = sbTcKeys.filter(k => !cw.messages[locale][k]);
  check(`chat-window ${locale} 每套繁中字型都有標籤`, missing.length === 0, `missing: ${missing.join(', ')}`);
}
/* 兩個工具的字型清單必須逐一對得上——上游說是同一份，漂掉就不再是同一份。 */
const fontIds = src => [...src.matchAll(/^\s{4}(\w+): \{ label: "font\./gm)].map(m => m[1]);
check('chat-window 與 status-bar 的字型清單一致',
  fontIds(cwFonts).join(',') === fontIds(sbFonts).join(','),
  `chat-window: ${fontIds(cwFonts).length}, status-bar: ${fontIds(sbFonts).length}`);

/* collage-letter：@import 的字重，以及字型池與 @import 的一致性。 */
const clCss = read('tools/collage-letter/styles.css');
checkCss2Url('collage-letter @import', clCss);
const clApp = read('tools/collage-letter/app.js');
for (const family of TC_FAMILIES) {
  check(`collage-letter 的字型池有 ${family}`, clApp.includes(`{ name: '${family}'`));
  check(`collage-letter 的 @import 有 ${family}`, clCss.includes(family.replace(/ /g, '+')));
}

/* typewriter：四個分頁的字型選單都要有同一組繁中選項。 */
const twHtml = read('tools/typewriter/index.html');
for (const family of TC_FAMILIES) {
  const n = [...twHtml.matchAll(new RegExp(`<option value="${family}"`, 'g'))].length;
  check(`typewriter 四個選單都有 ${family}`, n === 4, `found ${n}`);
}
/* loadFont() 不帶字重，拿到的是各字型的預設字重（400）——五套都有 400 才行。 */
const twMissing400 = TC_FAMILIES.filter(f => !TC_WEIGHTS[f].includes(400));
check('typewriter 依賴的 400 字重五套都有', twMissing400.length === 0, `missing: ${twMissing400.join(', ')}`);

/* text-path：畫格線預覽與版面都要把繁中字型排在韓文字型前面。 */
const tpCss = read('tools/text-path/styles.css');
checkCss2Url('text-path @import', tpCss);
check('text-path 的 @import 有 Noto Sans TC', tpCss.includes('Noto+Sans+TC'));
check('text-path 繁中介面時繁中字型優先',
  /html\[lang\^="zh"\][\s\S]{0,120}'Noto Sans TC',\s*'Noto Sans KR'/.test(tpCss));
check('text-path 的格線預覽同時涵蓋繁中與韓文',
  read('tools/text-path/app.js').includes(`"Noto Sans TC", "Noto Sans KR"`));

/* ---- 首頁 ---- */
section('index.html');
const home = loadI18N(['assets/i18n.home.js']);
const homeZh = new Set(Object.keys(home.messages['zh-TW']));
const homeKo = new Set(Object.keys(home.messages.ko));
check('首頁字典定義了 app.title', homeZh.has('app.title'));
check('首頁 ko 涵蓋所有 zh-TW key',
  [...homeZh].every(k => homeKo.has(k)),
  `missing: ${[...homeZh].filter(k => !homeKo.has(k)).join(', ')}`);

const homeHtml = read('index.html');
const homeKeys = [...homeHtml.matchAll(/data-i18n(?:-html|-node|-title|-aria-label|-placeholder)?="([^"]+)"/g)].map(m => m[1]);
check('首頁標記僅引用已知 key',
  [...new Set(homeKeys)].every(k => homeZh.has(k)),
  `unknown: ${[...new Set(homeKeys)].filter(k => !homeZh.has(k)).join(', ')}`);
check('首頁無殘留韓文', !/[가-힣]/.test(homeHtml));
check('首頁 html lang 為 zh-Hant-TW', /<html[^>]*lang="zh-Hant-TW"/.test(homeHtml));

const homeTitleMatch = homeHtml.match(/<title>([^<]*)<\/title>/);
check('首頁 <title> 與 app.title 的 zh-TW 值一致',
  !!homeTitleMatch && homeTitleMatch[1] === home.messages['zh-TW']['app.title'],
  `<title>="${homeTitleMatch ? homeTitleMatch[1] : '(none)'}" app.title="${home.messages['zh-TW']['app.title']}"`);

/* assets/home.js 與 assets/home.css 不屬於任何工具的 checkTool()，
 * 韓文洩漏檢查需在此另外涵蓋，理由與各工具的 styles 掃描相同。 */
check('assets/home.js 無殘留韓文', !HANGUL.test(read('assets/home.js')));
check('assets/home.css 無殘留韓文', !HANGUL.test(read('assets/home.css')));

/* 14 個工具連結都要指得到。 */
const TOOLS = ['magic-circle', 'typewriter', 'text-path', 'collage-letter', 'emotion-maker',
  'loading-maker', 'foreground-frame', 'scene-transition', 'status-bar', 'cutin',
  'ccfolia-cropper', 'character-select', 'character-editor', 'chat-window'];
for (const name of TOOLS) {
  check(`連結 tools/${name}/ 有效`,
    homeHtml.includes(`tools/${name}/`) && exists(`tools/${name}/index.html`));
}

/* 每張卡片的授權徽章都要跟該工具目錄裡有沒有 LICENSE 對得上。徽章是手寫的，
 * 新增工具時很容易沿用上一張卡片而標錯（把未授權的標成 MIT 就是誤導）。
 * emotion-maker 另含 39 張圖像素材，故其徽章用 license.unlicensed.assets。 */
check('首頁字典有三種授權徽章',
  ['license.mit', 'license.unlicensed', 'license.unlicensed.assets'].every(k => homeZh.has(k)));
const homeCards = [...homeHtml.matchAll(/<li class="tool-card">([\s\S]*?)<\/li>/g)].map(m => m[1]);
check('首頁卡片數與工具數一致', homeCards.length === TOOLS.length,
  `cards: ${homeCards.length}, tools: ${TOOLS.length}`);
for (const card of homeCards) {
  const name = (card.match(/href="\.\/tools\/([^/]+)\//) || [])[1];
  const badge = (card.match(/class="badge [^"]*" data-i18n="([^"]+)"/) || [])[1];
  const expected = exists(`tools/${name}/LICENSE`)
    ? ['license.mit']
    : ['license.unlicensed', 'license.unlicensed.assets'];
  check(`首頁 ${name} 的授權徽章與目錄裡的 LICENSE 相符`,
    !!name && expected.includes(badge), `badge: ${badge}`);
}
check('首頁標示原作者出處',
  ['sotsotssi', 'shiki365', 'Taku-Taku-Taku', 'kimtaehee2018-maker', 'organon-torah']
    .every(a => homeHtml.includes(`github.com/${a}`)));

/* ---- 內嵌文字與 zh-TW 字典一致 ---- */
/* 六個頁面（五個工具＋首頁）在 script 執行前顯示的畫面，其 HTML 內嵌文字必須
 * 與該頁 zh-TW 字典值逐字相同——這正是頁面能在任何腳本執行前就正確顯示繁體中文
 * 的原因。目前其餘檢查只驗證標記引用的 key「存在」，從未比對內嵌文字本身是否
 * 等於字典值，兩者可能各自修改而悄悄分歧；一旦分歧，畫面會在 i18n 初始化時
 * 「閃字」：使用者先看到一個字串，隨即被換成字典裡的另一個字串。
 *
 * 只比對「簡單形式」的 data-i18n：屬性值就是 key，元素內容是不含巢狀標籤的
 * 純文字，例如 <h1 data-i18n="key">文字</h1>。刻意排除的僅剩兩者：
 *   - data-i18n-node：內容本身是巢狀標籤組成的結構，並非單一文字節點；
 *   - data-i18n-html：注入的是 HTML 片段而非純文字。
 * 這兩種情況下，正規表示式無法可靠取得「應比對的那段文字」，勉強比對只會
 * 產生假陽性或假陰性，因此不在此檢查範圍內。
 *
 * data-i18n-title / data-i18n-aria-label / data-i18n-placeholder 原先也被排除，
 * 理由是「regex 無法可靠讀取」——這個理由其實不成立：這三者鎖定的是同一標籤上
 * 的另一個屬性（title / aria-label / placeholder），屬性配對其實比對元素內文
 * 更容易可靠比對，兩者都在同一個開始標籤的字串內，順序不拘，直接取出比對即可。
 * 這三者改由下方獨立的「inline attribute vs zh-TW dictionary」檢查涵蓋。 */
section('inline text vs zh-TW dictionary');

/* 擷取 <tag ... data-i18n="key" ...>文字</tag>：
 * - `\bdata-i18n="` 前後以 [^>]* 允許任意數量、任意順序的其他屬性（包含
 *   同一元素上額外的 data-i18n-title 等變體），但literal "data-i18n=\""
 *   這個子字串不會出現在 "data-i18n-title=\"" 之類的變體屬性中，故不會誤取。
 * - 以反向參照 \1 要求收尾標籤與開頭標籤同名，確保 [^<]* 取到的文字沒有
 *   跨過巢狀標籤——若內容含巢狀標籤，[^<]* 會在遇到內層的 `<` 時停止，
 *   導致後面無法接上 `</同名標籤>`，該元素就不會被比對到（正確地略過，
 *   而不是取到錯誤的片段文字）。 */
const INLINE_TEXT_RE = /<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\sdata-i18n="([^"]+)"[^>]*>([^<]*)<\/\1>/g;

function checkInlineText(label, htmlPath, dictPaths, minCompared) {
  const html = read(htmlPath);
  const dict = loadI18N(dictPaths).messages['zh-TW'];
  let compared = 0;
  const mismatches = [];
  for (const m of html.matchAll(INLINE_TEXT_RE)) {
    const key = m[2];
    if (!(key in dict)) continue; /* 未知 key 已由其他檢查把關，這裡不重複報告 */
    compared += 1;
    const text = m[3].trim();
    if (text !== dict[key]) mismatches.push(`${key}: html="${text}" 字典="${dict[key]}"`);
  }
  check(`${label} 內嵌文字與 zh-TW 字典一致（比對了 ${compared} 個元素）`,
    mismatches.length === 0, mismatches.slice(0, 10).join('\n       '));
  /* 比對數量若遠低於預期，代表 regex 沒抓到東西，比「頁面本身沒問題」更值得懷疑。 */
  check(`${label} 比對數量達最低門檻 ${minCompared}`, compared >= minCompared, `got: ${compared}`);
}

checkInlineText('index.html', 'index.html', ['assets/i18n.home.js'], 15);
checkInlineText('tools/magic-circle', 'tools/magic-circle/index.html', ['tools/magic-circle/i18n.magic-circle.js'], 150);
checkInlineText('tools/typewriter', 'tools/typewriter/index.html', ['tools/typewriter/i18n.typewriter.js'], 150);
checkInlineText('tools/text-path', 'tools/text-path/index.html', ['tools/text-path/i18n.text-path.js'], 15);
checkInlineText('tools/collage-letter', 'tools/collage-letter/index.html', ['tools/collage-letter/i18n.collage-letter.js'], 15);
checkInlineText('tools/emotion-maker', 'tools/emotion-maker/index.html', ['tools/emotion-maker/i18n.emotion-maker.js'], 15);
checkInlineText('tools/loading-maker', 'tools/loading-maker/index.html', ['tools/loading-maker/i18n.loading-maker.js'], 200);
checkInlineText('tools/foreground-frame', 'tools/foreground-frame/index.html', ['tools/foreground-frame/i18n.foreground-frame.js'], 150);
checkInlineText('tools/scene-transition', 'tools/scene-transition/index.html', ['tools/scene-transition/i18n.scene-transition.js'], 50);
checkInlineText('tools/status-bar', 'tools/status-bar/index.html', ['tools/status-bar/i18n.status-bar.js'], 150);
checkInlineText('tools/chat-window', 'tools/chat-window/index.html', ['tools/chat-window/i18n.chat-window.js'], 150);
checkInlineText('tools/ccfolia-cropper', 'tools/ccfolia-cropper/index.html', ['tools/ccfolia-cropper/i18n.ccfolia-cropper.js'], 20);
checkInlineText('tools/character-select', 'tools/character-select/index.html', ['tools/character-select/i18n.character-select.js'], 170);

/* ---- 內嵌屬性與 zh-TW 字典一致 ---- */
/* data-i18n-title / data-i18n-aria-label / data-i18n-placeholder 各鎖定同一標籤上
 * 的 title / aria-label / placeholder 屬性；那個屬性的靜態值同樣必須與 zh-TW
 * 字典逐字相同，理由與上面的內嵌文字檢查一致（避免 script 執行前後「閃字」）。
 *
 * 做法：先用 ATTR_TAG_RE 逐一取出完整的開始標籤字串（例如
 * `<button ... data-i18n-title="k" title="文字" ...>`），標籤內的屬性順序不拘，
 * 兩個屬性都在同一段字串內，直接各自以 regex 取值再比較即可，不需要像內文
 * 檢查那樣處理巢狀標籤或反向參照。
 *
 * 每個屬性值的 regex 前面加上 (?<![-a-z])，是為了避免：
 *   - "title="  誤配到 "data-i18n-title=\"...\"" 尾端那段 "title=\"...\""
 *     （其前一個字元是連字號 "-"，會被此負向後顧排除）；
 *   - "aria-label=" 同理，避免誤配到 "data-i18n-aria-label=\"...\"" 尾端；
 *     這裡比對的是完整字面值 "aria-label="，而非鬆散的 "label="，因此也不會
 *     被其他帶有 "label" 的無關屬性誤配；
 *   - "placeholder=" 同理，避免誤配到 "data-i18n-placeholder=\"...\"" 尾端。
 * 三者皆與 data-i18n（不含 -title/-aria-label/-placeholder 後綴）的比對邏輯
 * 相同：literal 子字串 "title=\""／"aria-label=\""／"placeholder=\"" 不會出現
 * 在對應的 data-i18n-* 變體屬性名稱中間，只會出現在其「值」的部分，
 * 負向後顧排除的正是這種情況。
 *
 * data-i18n-node 與 data-i18n-html 依然不在此檢查範圍內：見上方內嵌文字檢查的
 * 說明，原因不變。 */
section('inline attribute vs zh-TW dictionary');

const ATTR_TAG_RE = /<[a-zA-Z][a-zA-Z0-9]*\b[^>]*>/g;
const ATTR_PAIRS = [
  { i18nAttr: /data-i18n-title="([^"]+)"/, valAttr: /(?<![-a-z])title="([^"]*)"/, name: 'title' },
  { i18nAttr: /data-i18n-aria-label="([^"]+)"/, valAttr: /(?<![-a-z])aria-label="([^"]*)"/, name: 'aria-label' },
  { i18nAttr: /data-i18n-placeholder="([^"]+)"/, valAttr: /(?<![-a-z])placeholder="([^"]*)"/, name: 'placeholder' }
];

function checkAttrPairs(label, htmlPath, dictPaths, minPairs) {
  const html = read(htmlPath);
  const dict = loadI18N(dictPaths).messages['zh-TW'];
  let compared = 0;
  const mismatches = [];
  for (const tagMatch of html.matchAll(ATTR_TAG_RE)) {
    const tag = tagMatch[0];
    for (const { i18nAttr, valAttr, name } of ATTR_PAIRS) {
      const keyM = tag.match(i18nAttr);
      if (!keyM) continue;
      const key = keyM[1];
      if (!(key in dict)) continue; /* 未知 key 已由其他檢查把關，這裡不重複報告 */
      compared += 1;
      const valM = tag.match(valAttr);
      const text = valM ? valM[1] : undefined;
      if (text !== dict[key]) {
        mismatches.push(`${name}[${key}]: html=${JSON.stringify(text)} 字典=${JSON.stringify(dict[key])}`);
      }
    }
  }
  check(`${label} 屬性內嵌值與 zh-TW 字典一致（比對了 ${compared} 組屬性）`,
    mismatches.length === 0, mismatches.slice(0, 10).join('\n       '));
  /* 比對數量若遠低於預期，代表 regex 沒抓到東西，比「頁面本身沒問題」更值得懷疑。 */
  check(`${label} 屬性比對數量達最低門檻 ${minPairs}`, compared >= minPairs, `got: ${compared}`);
}

checkAttrPairs('index.html', 'index.html', ['assets/i18n.home.js'], 1);
checkAttrPairs('tools/magic-circle', 'tools/magic-circle/index.html', ['tools/magic-circle/i18n.magic-circle.js'], 50);
checkAttrPairs('tools/typewriter', 'tools/typewriter/index.html', ['tools/typewriter/i18n.typewriter.js'], 5);
checkAttrPairs('tools/text-path', 'tools/text-path/index.html', ['tools/text-path/i18n.text-path.js'], 3);
checkAttrPairs('tools/collage-letter', 'tools/collage-letter/index.html', ['tools/collage-letter/i18n.collage-letter.js'], 5);
checkAttrPairs('tools/emotion-maker', 'tools/emotion-maker/index.html', ['tools/emotion-maker/i18n.emotion-maker.js'], 3);
checkAttrPairs('tools/loading-maker', 'tools/loading-maker/index.html', ['tools/loading-maker/i18n.loading-maker.js'], 10);
checkAttrPairs('tools/foreground-frame', 'tools/foreground-frame/index.html', ['tools/foreground-frame/i18n.foreground-frame.js'], 8);
checkAttrPairs('tools/scene-transition', 'tools/scene-transition/index.html', ['tools/scene-transition/i18n.scene-transition.js'], 2);
checkAttrPairs('tools/status-bar', 'tools/status-bar/index.html', ['tools/status-bar/i18n.status-bar.js'], 4);
checkAttrPairs('tools/chat-window', 'tools/chat-window/index.html', ['tools/chat-window/i18n.chat-window.js'], 15);
checkAttrPairs('tools/ccfolia-cropper', 'tools/ccfolia-cropper/index.html', ['tools/ccfolia-cropper/i18n.ccfolia-cropper.js'], 1);
checkAttrPairs('tools/cutin', 'tools/cutin/index.html', ['tools/cutin/i18n.cutin.js'], 1);
checkAttrPairs('tools/character-select', 'tools/character-select/index.html', ['tools/character-select/i18n.character-select.js'], 15);
checkAttrPairs('tools/character-editor', 'tools/character-editor/index.html', ['tools/character-editor/i18n.character-editor.js'], 1);

/* ---- 文件 ---- */
section('docs');
check('ATTRIBUTION.md 存在', exists('ATTRIBUTION.md'));
check('README.md 存在', exists('README.md'));
check('根目錄 LICENSE 存在', exists('LICENSE'));
check('.nojekyll 存在', exists('.nojekyll'));

const attribution = read('ATTRIBUTION.md');
for (const name of TOOLS) {
  check(`ATTRIBUTION.md 記載 ${name}`, attribution.includes(name));
}
for (const sha of ['de40a68', 'cf3ff36', 'b86cd28', 'ea08333', 'b455379', '615664b',
  'c24f0a2', '52426f5', '1670549', '7e9c70d', 'f149b4e', '883f48b', 'e1111d4', 'dda2ea9', '772d6c4']) {
  check(`ATTRIBUTION.md 記載來源 commit ${sha}`, attribution.includes(sha));
}
check('ATTRIBUTION.md 標明 emotion-maker 未授權',
  /emotion-maker[\s\S]{0,600}(未授權|無授權)/.test(attribution));
check('ATTRIBUTION.md 標明 loading-maker 未授權',
  /loading-maker[\s\S]{0,600}(未授權|無授權)/.test(attribution));
check('ATTRIBUTION.md 標明 ccfolia-cropper 未授權',
  /ccfolia-cropper[\s\S]{0,600}(未授權|無授權)/.test(attribution));
check('ATTRIBUTION.md 標明 character-select 未授權',
  /character-select[\s\S]{0,900}(未授權|無授權)/.test(attribution));
check('ATTRIBUTION.md 標明 character-editor 未授權',
  /character-editor[\s\S]{0,1200}(未授權|無授權)/.test(attribution));
check('ATTRIBUTION.md 說明解析錨點為何不翻譯',
  attribution.includes('editScreenText.ts'));
check('ATTRIBUTION.md 說明 chat-window 為何保留日文',
  /chat-window[\s\S]{0,600}mock\.v1\.js/.test(attribution) && attribution.includes('BCDice'));
/* cutin 需要建置，說明其原始碼位置與重建方式。 */
check('ATTRIBUTION.md 說明 cutin 的建置流程',
  attribution.includes('vendor/cutin-maker'));
check('README.md 說明兩個工具的建置流程',
  ['vendor/cutin-maker', 'vendor/ccfolia-character-editor'].every(p => read('README.md').includes(p)));

const pkg = JSON.parse(read('package.json'));
check('package.json 無執行期相依',
  !pkg.dependencies && !pkg.devDependencies);

process.exit(summary() ? 1 : 0);
