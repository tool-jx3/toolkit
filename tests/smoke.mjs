/* 靜態 smoke 檢查。以 `npm test` 執行。 */
import { check, section, summary, loadI18N, read, exists, listFiles } from './harness.mjs';

/* ---- 引擎行為 ---- */
section('i18n engine');
const I18N = loadI18N();

check('預設語言為 zh-TW', I18N.locale === 'zh-TW', `got: ${I18N.locale}`);
check('註冊了 zh-TW、ko、ja 與 en 四種語言',
  Object.keys(I18N.locales).join(',') === 'zh-TW,ko,ja,en',
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
/* applyStaticDom() 需要真的 DOM，沙箱裡跑不到；掛勾有沒有接上改以原始碼確認。 */
check('引擎支援五種屬性掛勾',
  ['-title', '-aria-label', '-placeholder', '-alt', '-html']
    .every(suffix => read('assets/i18n.js').includes(`[data-i18n${suffix}]`)));
check('切換至未知語言回傳 false', I18N.setLocale('fr') === false);

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
/* html 與 shared 給多頁工具用：同一個目錄裡的每一頁各自檢查一次，shared 是
 * 各頁都先載入的共用字典（路徑相對於 dir）。 */
function checkTool({ dir, dict, html: page = 'index.html', shared = [], locale = 'ko', locales, scripts, styles = [], minHooks, allowSource = () => false, licence = true }) {
  section(page === 'index.html' ? dir : `${dir}/${page}`);
  const tool = loadI18N([...shared.map(f => `${dir}/${f}`), `${dir}/${dict}`]);
  const zh = new Set(Object.keys(tool.messages['zh-TW']));
  /* 大多數工具只有「繁中＋原文」兩種語言；room-zip 另外補了韓文，
   * 因此語言清單可以由呼叫端指定。 */
  const want = locales || ['zh-TW', locale];
  /* 原文洩漏的判準隨語言而異：韓文查諺文，日文查平假名與片假名——漢字
   * 與中文重疊，拿來當判準會把正常的譯文誤判為未翻譯。 */
  const SOURCE_CHARS = { ko: HANGUL, ja: KANA }[locale];
  /* 英文和程式碼用的是同一套字母，沒辦法靠字元類別判斷「原文沒翻到」；英文工具的
   * 洩漏檢查改由各工具自己的專節處理（見 battlemap）。 */

  check(`只載入 ${want.join('、')} 的字典`,
    Object.keys(tool.messages).filter(l => Object.keys(tool.messages[l]).length).join(',') === want.join(','),
    `got: ${Object.keys(tool.messages).filter(l => Object.keys(tool.messages[l]).length).join(',')}`);

  check('字典非空', zh.size > 0, `zh-TW keys: ${zh.size}`);
  check('定義了 app.title', zh.has('app.title'));

  const ph = v => [...new Set(String(v).match(/\{\d+\}/g) || [])].sort().join(',');
  for (const other of want.filter(l => l !== 'zh-TW')) {
    const keys = new Set(Object.keys(tool.messages[other]));
    const missing = [...zh].filter(k => !keys.has(k));
    const extra = [...keys].filter(k => !zh.has(k));
    check(`${other} 涵蓋所有 zh-TW key`, missing.length === 0, `missing: ${missing.join(', ')}`);
    check(`${other} 無多餘 key`, extra.length === 0, `unknown: ${extra.join(', ')}`);
    const badPh = [...zh].filter(k => ph(tool.messages['zh-TW'][k]) !== ph(tool.messages[other][k] ?? ''));
    check(`zh-TW 與 ${other} 的 {n} 佔位符一致`, badPh.length === 0, `mismatched: ${badPh.join(', ')}`);
  }

  const html = read(`${dir}/${page}`);
  const htmlKeys = [...html.matchAll(/data-i18n(?:-html|-node|-title|-aria-label|-placeholder|-alt)?="([^"]+)"/g)].map(m => m[1]);
  const unknownHtml = [...new Set(htmlKeys)].filter(k => !zh.has(k));
  check('標記僅引用已知 key', unknownHtml.length === 0, `unknown: ${unknownHtml.join(', ')}`);
  check(`標記帶有至少 ${minHooks} 個 i18n 掛勾`, htmlKeys.length >= minHooks, `found ${htmlKeys.length}`);

  check(`${page} 載入共用引擎`, html.includes('assets/i18n.js'));
  check(`${page} 載入自身字典`, html.includes(dict.split('/').pop()));
  for (const f of shared) check(`${page} 載入共用字典 ${f}`, html.includes(f.replace(/^(\.\.\/)+/, '')));
  check('html lang 為 zh-Hant-TW', /<html[^>]*lang="zh-Hant-TW"/.test(html));

  const titleMatch = html.match(/<title>([^<]*)<\/title>/);
  check('<title> 與 app.title 的 zh-TW 值一致',
    !!titleMatch && titleMatch[1] === tool.messages['zh-TW']['app.title'],
    `<title>="${titleMatch ? titleMatch[1] : '(none)'}" app.title="${tool.messages['zh-TW']['app.title']}"`);

  const leakedIn = (src, file) => !SOURCE_CHARS ? [] : src.split('\n')
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

  const htmlLeaked = leakedIn(html, page);
  check(`${page} 無殘留原文`, htmlLeaked.length === 0, report(htmlLeaked));

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
    'deco.v1.js', 'deco-extra.v1.js', 'effects.v1.js', 'icons.v1.js', 'zip.v1.js', 'pcfonts.v1.js'],
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
  scripts: ['app.v6.js', 'apng.v2.js', 'webp.v1.js', 'pcfonts.v1.js'],
  styles: ['styles.css'],
  minHooks: 140
});

/* 53 種預設集的說明以 T(p.descKey) 取得，key 存在資料裡，靜態掃描看不到。 */
section('tools/scene-transition presets');
const stApp = read('tools/scene-transition/app.v6.js');
const stPresetKeys = [...stApp
  .matchAll(/descKey: "(preset\.[\w-]+)"/g)].map(m => m[1]);
check('解析出 53 組預設集', stPresetKeys.length === 53, `found ${stPresetKeys.length}`);
for (const locale of ['zh-TW', 'ja']) {
  const missing = stPresetKeys.filter(k => !st.messages[locale][k]);
  check(`${locale} 每組預設集都有說明`, missing.length === 0, `missing: ${missing.join(', ')}`);
  /* 選單標籤取「：」前半段，因此每則說明都必須含全形冒號。 */
  const noColon = stPresetKeys.filter(k => !String(st.messages[locale][k]).includes('：'));
  check(`${locale} 每組預設集說明都有全形冒號`, noColon.length === 0, `missing: ${noColon.join(', ')}`);
}
/* 換預設集時，使用者自己打的字幕要留著、範例字幕要換掉。範例字幕跟著語言走，
 * 所以切換語言後，舊語言的範例字幕也得算範例，不然會被誤當成使用者輸入。 */
check('換預設集時，任何語言的範例字幕都算範例',
  stApp.includes('return !!key && Object.values(I18N.messages).some(dict => dict[key] === value);')
  && stApp.includes('const keepText = !first && !isSampleText(currentPreset, el.text.value.trim());'));
/* 狀態列是 JS 寫的（輸出尺寸、格數……）。掛了 data-i18n 的話，DOMContentLoaded 時
 * 引擎會把它蓋回「載入中…」，而且要等使用者動了設定才會再出現。 */
check('scene-transition 的狀態列不掛 data-i18n',
  /<p class="status" id="status">/.test(read('tools/scene-transition/index.html'))
  && !/data-i18n="[^"]*"[^>]*id="status"|id="status"[^>]*data-i18n=/.test(read('tools/scene-transition/index.html')));
check('切換語言時連同「設定會保留」的附註一起換',
  /I18N\.onChange\([\s\S]{0,300}descKey\) \+ keepNote\(\)/.test(stApp));
/* 形狀、群組、範例字幕等 key 寫在資料表裡（GROUPS／VARIANTS／COUNTS／AMOUNTS／textKey），
 * T('…') 的掃描看不到，另外抓出來確認兩種語言都有。 */
const stDataKeys = [...new Set([...stApp.matchAll(/"((?:presetGroup|variant|count|amount|hold)\.[\w.-]+|preset\.[\w-]+\.text)"/g)].map(m => m[1]))];
check('解析出資料表裡的字典 key', stDataKeys.length >= 40, `found ${stDataKeys.length}`);
for (const locale of ['zh-TW', 'ja']) {
  const missing = stDataKeys.filter(k => !st.messages[locale][k]);
  check(`${locale} 資料表裡的 key 都有譯文`, missing.length === 0, `missing: ${missing.join(', ')}`);
}
/* 字幕字型的 <optgroup label> 引擎管不到，改掛 data-label-key 由程式套；內嵌值要等於 zh-TW。 */
const stGroups = [...read('tools/scene-transition/index.html').matchAll(/<optgroup label="([^"]*)" data-label-key="([^"]+)">/g)];
check('字幕字型的群組標籤都有兩種語言、內嵌值等於 zh-TW', stGroups.length >= 6
  && stGroups.every(([, label, key]) => st.messages['zh-TW'][key] === label && st.messages.ja[key]), `groups: ${stGroups.length}`);
check('字幕字型清單有五套繁中字型', ['notosanstc', 'notoseriftc', 'wenkaitc', 'chocolatetc', 'cactustc']
  .every(k => new RegExp(`${k}: \\["[^"]+", \\d+, "tc\\w+"\\]`).test(stApp) && st.messages['zh-TW'][`font.${k}`]));


/* ---- status-bar ---- */
const sb = checkTool({
  dir: 'tools/status-bar',
  dict: 'i18n.status-bar.js',
  locale: 'ja',
  scripts: ['app.v1.js', 'presets.v1.js', 'css.v1.js', 'deco.v1.js',
    'model.v1.js', 'mock.v1.js', 'shapes.v1.js', 'items.v1.js', 'pcfonts.v1.js'],
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
/* 設計範本的名稱與說明同樣只以 key 存在資料裡。 */
const sbDesignKeys = [...sbPresets.matchAll(/label: "(design\.[\w-]+)", desc: "(design\.[\w.-]+)"/g)]
  .flatMap(m => [m[1], m[2]]);
check('presets.v1.js 解析出 10 組設計範本', sbDesignKeys.length === 20, `found ${sbDesignKeys.length / 2}`);
for (const locale of ['zh-TW', 'ja']) {
  const missing = sbDesignKeys.filter(k => !sb.messages[locale][k]);
  check(`${locale} 每組設計範本都有名稱與說明`, missing.length === 0, `missing: ${missing.join(', ')}`);
}
check('損壞演出的道具清單走字典', /const ITEM_TYPES = \[\s*\["none", "item\.none"\], \["gem", "item\.gem"\]/.test(sbPresets));

/* 狀態列會把目前狀態存成 {key, args} 再於語言切換時重繪，因此這些 key 只會以
 * 變數形式傳進 T()，靜態掃描看不到。掃 app.v1.js 的 status()／statusError()
 * 呼叫取得實際用到的集合，逐一確認兩語言都有譯文。 */
/* status-bar 的 css.v1.js 把 st.text 取名為 TX（T 留給全域的 i18n 函式）。
 * 收錄時改名改漏了 textShadow(T) 兩處，描邊設定整個失效——四個選項都產出
 * text-shadow: none，而且靜態檢查與型別都看不出來。這裡擋住同一類寫法：
 * 這個檔案裡的 T 只能被呼叫，不能當成值傳出去或取屬性。 */
const sbCss = read('tools/status-bar/css.v1.js');
const sbBareT = [...sbCss.matchAll(/(?<![\w.$])T(?!\s*\()(?![\w$])/g)]
  .map(m => sbCss.slice(Math.max(0, m.index - 40), m.index + 20).replace(/\n/g, ' '));
check('status-bar 的 css.v1.js 沒有把 T 當成值使用',
  sbBareT.length === 0, sbBareT.slice(0, 3).join(' / '));
/* deco.v1.js 的 belowList() 在上游用 T 當十位數，收錄時改名為 TN：同一個函式裡
 * 只要有人加一句 T(...)，就會拿數字去呼叫而當掉。 */
const sbDeco = read('tools/status-bar/deco.v1.js');
check('status-bar 的 deco.v1.js 沒有用 T 當變數名',
  !/\b(?:const|let|var)\s+T\b|[,{]\s*T\s*=/.test(sbDeco));

section('tools/status-bar status messages');
const sbApp = read('tools/status-bar/app.v1.js');
const sbStatusKeys = [...new Set([
  ...[...sbApp.matchAll(/\bstatus(?:Error)?\("([\w]+\.[\w.]+)"/g)].map(m => m[1]),
  'status.loading'
])];
check('解析出狀態列訊息 key', sbStatusKeys.length >= 12, `found ${sbStatusKeys.length}`);
/* 改了條的顯示名稱，「越少越損壞」裡每條的道具標題也要跟著換（上游 dab4fb9 修的就是這個 regex 少了反斜線）。 */
check('改條的顯示名稱時重繪道具清單',
  sbApp.includes('} else if (/^bars\\.\\d+\\.label$/.test(path)) {\n      renderItemList();')
  && /function renderItemList\(\)[\s\S]{0,200}T\("damage\.itemFor"/.test(sbApp));
for (const locale of ['zh-TW', 'ja']) {
  const missing = sbStatusKeys.filter(k => !sb.messages[locale][k]);
  check(`${locale} 狀態列訊息齊全`, missing.length === 0, `missing: ${missing.join(', ')}`);
}

/* ---- height-board ---- */
/* 這個工具的註解密度很高，而且多半是演算法與版面取捨的說明（Canvas 縮放、記憶體
 * 上限、.hboard 的檔案佈局、拖曳門檻、為什麼要 type="button"…），共 392 行。
 * 逐句轉譯的風險大於效益，比照 vendor/cutin-maker 的處理保留日文原文。
 *
 * 但「只有註解可以是日文」這件事要能被檢查，否則就等於放行。做法是把註解整段
 * 抹成空白（保留行結構）之後再掃一次：程式碼與標記裡只要出現假名就會被擋下。 */
function stripComments(src, kind) {
  const blank = text => text.replace(/[^\n]/g, ' ');
  let out = src;
  if (kind === 'html') out = out.replace(/<!--[\s\S]*?-->/g, blank);
  else {
    out = out.replace(/\/\*[\s\S]*?\*\//g, blank);
    if (kind === 'js') out = out.replace(/(^|[^:\\])\/\/[^\n]*/g, (m, p) => p + blank(m.slice(p.length)));
  }
  return out;
}

const HB_KINDS = { 'index.html': 'html', 'styles.css': 'css', 'app.js': 'js' };
const hbCode = Object.fromEntries(Object.entries(HB_KINDS)
  .map(([file, kind]) => [file, stripComments(read(`tools/height-board/${file}`), kind).split('\n')]));

const hb = checkTool({
  dir: 'tools/height-board',
  dict: 'i18n.height-board.js',
  locale: 'ja',
  scripts: ['app.js'],
  styles: ['styles.css'],
  minHooks: 70,
  /* 只放行「抹掉註解之後就沒有假名」的行。程式碼裡真的有日文就會落下。
   * 另外放行 font-family 裡的「HG丸ｺﾞｼｯｸM-PRO」——那是 Windows 的字型名稱，
   * 是要原樣寫給瀏覽器看的識別字，不是可翻譯的文字。 */
  allowSource: (line, lineNo, file) => {
    const code = hbCode[file];
    if (!code) return false;
    const rest = (code[lineNo - 1] || '').replace('HG丸ｺﾞｼｯｸM-PRO', '');
    return !KANA.test(rest);
  }
});

section('tools/height-board');
/* 上游頁面掛了 Google Analytics，收錄版整組移除；說明區與頁尾原本各有一句告知
 * 使用者這件事，留著就是在說一件本站不存在的事，因此一併拿掉。 */
for (const file of ['index.html', 'app.js', 'styles.css']) {
  check(`${file} 沒有存取分析的殘留`,
    !/googletagmanager|gtag\(|Google.{0,7}Analytics/.test(read(`tools/height-board/${file}`)));
}
/* 保留日文註解是刻意的，但僅限註解——這裡把規則本身也測一次，
 * 免得 stripComments 哪天失效，整個放行條件就變成空殼。 */
check('stripComments 會抹掉註解裡的假名',
  !KANA.test(stripComments('/* 日本語のコメント */ var a = 1', 'js')));
check('stripComments 不會抹掉程式碼裡的假名',
  KANA.test(stripComments('var a = "日本語のリテラル"; // メモ', 'js')));
check('height-board 保留 Windows 的字型名稱',
  read('tools/height-board/styles.css').includes('HG丸ｺﾞｼｯｸM-PRO'));
check('height-board 的註解確實還是日文（沒有被誤翻掉）',
  /[\u3041-\u3096\u30A1-\u30FA]/.test(read('tools/height-board/app.js')));

/* 狀態訊息記住 key 與參數，切語言時重寫。 */
const hbApp = read('tools/height-board/app.js');
check('狀態訊息以 key 呈現並在切換語言時重寫',
  hbApp.includes('function renderStatus()') && hbApp.includes('I18N.onChange('));
const hbKeys = [...new Set([
  ...[...hbApp.matchAll(/\bshowStatus\('([\w]+\.[\w]+)'/g)].map(m => m[1]),
  ...[...hbApp.matchAll(/\bT\('([\w]+\.[\w]+)'/g)].map(m => m[1])
])];
check('解析出 app.js 的 key', hbKeys.length >= 25, `found ${hbKeys.length}`);
for (const locale of ['zh-TW', 'ja']) {
  const missing = hbKeys.filter(k => !hb.messages[locale][k]);
  check(`${locale} app.js 的譯文齊全`, missing.length === 0, `missing: ${missing.join(', ')}`);
}

/* ---- portrait-size ---- */
const ps = checkTool({
  dir: 'tools/portrait-size',
  dict: 'i18n.portrait-size.js',
  locale: 'ja',
  scripts: ['app.js'],
  styles: ['styles.css'],
  minHooks: 40
});

section('tools/portrait-size');
/* 上游頁面掛了 Google Analytics，收錄版整組移除；說明區與頁尾原本各有一句告知
 * 使用者這件事，留著就是在說一件本站不存在的事，因此一併拿掉。 */
for (const file of ['index.html', 'app.js', 'styles.css']) {
  const src = read(`tools/portrait-size/${file}`);
  check(`${file} 沒有存取分析的殘留`,
    !/googletagmanager|gtag\(|Google Analytics/.test(src));
}
/* 狀態訊息記住 key 與參數，切語言時重寫；寫回字面字串就會停在舊語言。 */
const psApp = read('tools/portrait-size/app.js');
check('狀態訊息以 key 呈現並在切換語言時重寫',
  psApp.includes('function renderStatus()') && psApp.includes('I18N.onChange(renderStatus)'));
const psStatusKeys = [...new Set([...psApp.matchAll(/\bshowStatus\('([\w]+\.[\w]+)'/g)].map(m => m[1]))];
check('解析出狀態訊息 key', psStatusKeys.length >= 10, `found ${psStatusKeys.length}`);
for (const locale of ['zh-TW', 'ja']) {
  const missing = psStatusKeys.filter(k => !ps.messages[locale][k]);
  check(`${locale} 狀態訊息齊全`, missing.length === 0, `missing: ${missing.join(', ')}`);
}

/* ---- room-zip ---- */
/* 上游是一份 868 KB 的單一 HTML，收錄時拆成 index.html ＋ styles.css ＋ 五個
 * JS。其中 jszip.min.js 與 upng.js 是原樣保留的第三方函式庫，不參與 i18n。
 *
 * 註解比照 cutin 與 height-board 保留日文原文，所以同樣用 stripComments 的規則：
 * 抹掉註解之後，程式碼與標記裡只剩下「刻意留著的資料」才放行。 */
const RZ_KINDS = { 'index.html': 'html', 'styles.css': 'css', 'app.v1.js': 'js', 'core.v1.js': 'js', 'apng.v1.js': 'js' };
const rzCode = Object.fromEntries(Object.entries(RZ_KINDS)
  .map(([file, kind]) => [file, stripComments(read(`tools/room-zip/${file}`), kind).split('\n')]));

/* 這些日文是資料不是介面文字，翻掉會壞掉——理由見 ATTRIBUTION.md。
 * 放行條件是「抹掉這些字串之後，該行就沒有假名了」，所以清單以外的日文一律落下。 */
const RZ_KEPT = [
  /* 素材標籤的七個值與舊檔的「背景」。會寫進存檔、.ccproj 與 CSS class 名稱，
   * 程式本身也拿它們互相比對。顯示時一律經過 roleName()。 */
  '前景', '立ち絵', 'パネル', '枠', '駒アイコン', '演出', 'その他', '背景',
  /* 外部搜尋網址裡的佔位記號。使用者可以在工具設定裡自行編輯網址。 */
  '検索ワード',
  /* BOOTH 的搜尋關鍵字，是網址的一部分。 */
  'ココフォリア',
  /* 檔名是否「像是臨時名稱」的判斷式。比對的是使用者的檔名，不是介面文字。 */
  'スクリーンショット', '無題', '名称未設定', 'ダウンロード',
  /* CSV 匯入時辨識標題列用的字。 */
  'シーン名', '名前',
  /* CCFOLIA 房間預設的三個聊天頻道名（core.v1.js）。 */
  'メイン', '情報', '雑談',
];
/* KPDEF 的聊天面板預設內容整段保留（混著 BCDice 指令），以行號範圍放行。 */
const rzAppLines = read('tools/room-zip/app.v1.js').split('\n');
const rzKpdefStart = rzAppLines.findIndex(l => /^\tvar KPDEF = \{/.test(l));
const rzKpdefEnd = rzAppLines.findIndex((l, i) => i > rzKpdefStart && /^\t\}$/.test(l));

const rz = checkTool({
  dir: 'tools/room-zip',
  dict: 'i18n.room-zip.js',
  locale: 'ja',
  locales: ['zh-TW', 'ko', 'ja'],
  scripts: ['app.v1.js', 'core.v1.js', 'apng.v1.js'],
  styles: ['styles.css'],
  minHooks: 25,
  licence: false,
  allowSource: (line, lineNo, file) => {
    const code = rzCode[file];
    if (!code) return false;
    if (file === 'app.v1.js' && rzKpdefStart >= 0 && lineNo > rzKpdefStart && lineNo <= rzKpdefEnd + 1) return true;
    let rest = code[lineNo - 1] || '';
    for (const kept of RZ_KEPT) rest = rest.split(kept).join('');
    return !KANA.test(rest);
  }
});

section('tools/room-zip');
/* 上游的 Web 公開用 DEMO 外層整段不收：它每次開頁就無條件把 sample.ccproj
 * 蓋到現有專案上（loadSample()），做到一半重新整理就全沒了。 */
/* 比對的是抹掉註解之後的程式碼——說明「上游原本怎麼做」的註解留著沒問題。 */
for (const [file, needle] of [
  ['index.html', '__CCFOLIA_BUILD__'], ['index.html', 'demo-bar'],
  ['app.v1.js', '__CCFOLIA_BUILD__'], ['app.v1.js', 'IS_DEMO_BUILD'],
  ['app.v1.js', 'BUILD_CONFIG'], ['styles.css', 'demo-bar'], ['styles.css', 'demo-intro'],
]) {
  check(`${file} 沒有 DEMO 外層的殘留（${needle}）`, !rzCode[file].join('\n').includes(needle));
}
check('範例改成按了才載入', read('tools/room-zip/app.v1.js').includes('function loadSampleProject()'));
check('載入範例前會先問過', read('tools/room-zip/app.v1.js').includes('T("sample.confirm")'));
check('首頁有載入範例的按鈕', read('tools/room-zip/app.v1.js').includes('id="homeSample"'));

/* 範例檔照抄上游，格式要讀得出來才有意義。 */
const rzSample = JSON.parse(read('tools/room-zip/sample.ccproj'));
check('sample.ccproj 是這個工具的存檔格式', rzSample.format === 'ccfolia-room-zip-maker', `format: ${rzSample.format}`);
check('sample.ccproj 有場景與素材',
  Array.isArray(rzSample.scenes) && rzSample.scenes.length > 0 && Array.isArray(rzSample.images) && rzSample.images.length > 0);

/* 素材標籤是資料：ROLES 的每個值都要有對應的顯示名 key，顯示一律走 roleName()。 */
const rzApp = read('tools/room-zip/app.v1.js');
const rzRoles = (rzApp.match(/var ROLES = \[([^\]]*)\]/) || [])[1];
const rzRoleValues = [...(rzRoles || '').matchAll(/"([^"]+)"/g)].map(m => m[1]);
check('解析出 ROLES 的七個值', rzRoleValues.length === 7, `found ${rzRoleValues.length}`);
const rzRoleKeys = Object.fromEntries([...rzApp.matchAll(/^\t\t([^\s:]+): "(role\.[a-z]+)",$/gm)].map(m => [m[1], m[2]]));
check('ROLE_KEYS 涵蓋 ROLES 與舊檔的「背景」',
  [...rzRoleValues, '背景'].every(r => rzRoleKeys[r]),
  `missing: ${[...rzRoleValues, '背景'].filter(r => !rzRoleKeys[r]).join(', ')}`);
for (const locale of ['zh-TW', 'ko', 'ja']) {
  const missing = Object.values(rzRoleKeys).filter(k => !rz.messages[locale][k]);
  check(`${locale} 每個素材標籤都有譯名`, missing.length === 0, `missing: ${missing.join(', ')}`);
}
check('roleName() 只在顯示時才翻', rzApp.includes('function roleName(r)'));

/* 切語言時整個畫面會重畫，但在 IIFE 最外層就算好的常數不會——那種值會凍在
 * 第一次載入的語言。收錄時把六個這樣的常數改成函式或存 key，這裡防止復發。 */
/* 兩種寫法都要看：單行的 `var X = …T(…)…`，與以 `[` 或 `{` 結尾、
 * 直到同縮排的 `]`／`}` 為止的多行常數。 */
const rzTopLevelConst = [
  ...[...rzApp.matchAll(/^\tvar ([A-Z][A-Z0-9_]*) = (.*)$/gm)].filter(m => /\bT\(/.test(m[2])),
  ...[...rzApp.matchAll(/^\tvar ([A-Z][A-Z0-9_]*) = [[{]\n([\s\S]*?)\n\t[\]}]$/gm)].filter(m => /\bT\(/.test(m[2])),
].map(m => m[1]);
check('最外層沒有含 T() 的常數（那會凍在載入時的語言）',
  rzTopLevelConst.length === 0, `frozen: ${rzTopLevelConst.join(', ')}`);
check('語言切換會重畫整個畫面', rzApp.includes('I18N.onChange(function () { applyTheme(); render() })'));
check('語言切換器掛在工具列上', rzApp.includes('I18N.mountSwitcher(document.getElementById("localeSelect"))'));

/* 第三方函式庫原樣保留，授權標頭要在。 */
check('jszip.min.js 保留授權標頭', read('tools/room-zip/jszip.min.js').includes('Dual licenced under the MIT license or GPLv3'));
check('upng.js 保留授權標頭', read('tools/room-zip/upng.js').includes('Copyright (c) 2017 Photopea'));
check('有第三方函式庫的出處說明', exists('tools/room-zip/THIRD_PARTY_NOTICES.md'));
const rzNotices = read('tools/room-zip/THIRD_PARTY_NOTICES.md');
for (const lib of ['JSZip 3.10.1', 'upng-js 2.2.2', 'pako']) {
  check(`THIRD_PARTY_NOTICES 提到 ${lib}`, rzNotices.includes(lib));
}

/* 載入順序：引擎 → 字典 → 應用程式。字典檔在 app.v1.js 之前載入，
 * app.v1.js 才能在 top-level 直接呼叫 T()（預設專案名就是這樣來的）。 */
const rzHtml = read('tools/room-zip/index.html');
const rzOrder = ['jszip.min.js', 'upng.js', 'assets/i18n.js', 'i18n.room-zip.js', 'apng.v1.js', 'core.v1.js', 'app.v1.js']
  .map(f => rzHtml.indexOf(f));
check('index.html 的載入順序正確', rzOrder.every((at, i) => at >= 0 && (i === 0 || at > rzOrder[i - 1])), rzOrder.join(','));

/* ---- pair-maker ---- */
/* 合輯裡第一個有兩頁的工具：index.html 是版型選單，editor.html?id=<版型> 才是
 * 編輯畫面。checkTool() 只看 index.html，editor.html 在下面另外驗一遍。
 * 模組清單從目錄列出來而不是寫死，新增一支就會自動納入掃描。 */
const pmFiles = sub => listFiles(`tools/pair-maker/${sub}`).map(f => f.replace('tools/pair-maker/', ''));
const PM_SCRIPTS = [...pmFiles('js'), ...pmFiles('templates')];
const PM_TEMPLATES = ['2p-simple', '2p-pair1', 'pattern-header', '30p-pair', 'main-tweet',
  'textLog-simple', 'textLog-vert', 'textLog-hori', 'textLog-pair'];

const pm = checkTool({
  dir: 'tools/pair-maker',
  dict: 'i18n.pair-maker.js',
  scripts: PM_SCRIPTS,
  styles: pmFiles('css'),
  minHooks: 30,
  licence: false,
  /* 唯一放行的諺文：問題回報說明裡原作者的署名「배고픔」。那是名字，不是介面
   * 文字，三種語言都照原樣顯示。放行條件是「抹掉它之後這行就沒有諺文了」，
   * 因此其他地方的韓文一律照落。 */
  allowSource: (line, lineNo, file) =>
    file === 'index.html' && !HANGUL.test(line.split('배고픔').join(''))
});

section('tools/pair-maker');
check('掃描到 25 支模組', PM_SCRIPTS.length === 25, `found ${PM_SCRIPTS.length}`);

const pmIndex = read('tools/pair-maker/index.html');
const pmEditor = read('tools/pair-maker/editor.html');
const pmEditorJs = read('tools/pair-maker/js/editor.js');
const pmSimple = read('tools/pair-maker/templates/2p-simple.js');
/* 放行條件是單向的：署名被順手翻掉就該在這裡掉下來。 */
check('原作者的署名還在', pmIndex.includes('배고픔'));

/* editor.html 不在 checkTool() 的範圍內，同一套規則在這裡補齊。 */
const pmZh = new Set(Object.keys(pm.messages['zh-TW']));
const pmEditorKeys = [...pmEditor.matchAll(/data-i18n(?:-html|-node|-title|-aria-label|-placeholder|-alt)?="([^"]+)"/g)].map(m => m[1]);
check('editor.html 僅引用已知 key', pmEditorKeys.every(k => pmZh.has(k)),
  `unknown: ${pmEditorKeys.filter(k => !pmZh.has(k)).join(', ')}`);
check('editor.html 帶有至少 12 個 i18n 掛勾', pmEditorKeys.length >= 12, `found ${pmEditorKeys.length}`);
check('editor.html html lang 為 zh-Hant-TW', /<html[^>]*lang="zh-Hant-TW"/.test(pmEditor));
check('editor.html 無殘留韓文', !HANGUL.test(pmEditor));
/* 引擎與字典是一般 script，編輯器是 module（自動 defer），字典一定先到，
 * 所以版型模組可以在 top-level 直接呼叫 T()。 */
const pmOrder = ['assets/i18n.js', 'i18n.pair-maker.js', 'js/editor.js'].map(f => pmEditor.indexOf(f));
check('editor.html 的載入順序正確',
  pmOrder.every((at, i) => at >= 0 && (i === 0 || at > pmOrder[i - 1])), pmOrder.join(','));

/* 上游的站台識別、存取分析與兩個排版用的函式庫都不收。 */
for (const [file, src] of [['index.html', pmIndex], ['editor.html', pmEditor]]) {
  for (const needle of ['cloudflareinsights', 'docs.google.com/forms', 'justifiedGallery',
    'code.jquery.com', 'favicon', 'og:title', 'twitter:card']) {
    check(`${file} 沒有上游站台的殘留（${needle}）`, !src.includes(needle));
  }
}

/* 首頁卡片圖是這個工具自己算繪的空白版型預覽。上游那 29 張作品集樣張是別人的
 * 角色插圖，不散布；images/ 只留程式真的會去 new Image() 的四張底圖。 */
check('九個版型各有一支模組', PM_TEMPLATES.every(id => exists(`tools/pair-maker/templates/${id}.js`)));
check('九個版型各有一張預覽圖', PM_TEMPLATES.every(id => exists(`tools/pair-maker/previews/${id}.png`)));
const pmRegistry = read('tools/pair-maker/templates/registry.js');
check('registry 註冊的版型與清單一致',
  PM_TEMPLATES.every(id => pmRegistry.includes(`'${id}': () => import('./${id}.js')`))
  && [...pmRegistry.matchAll(/'([\w-]+)': \(\) => import\(/g)].length === PM_TEMPLATES.length);
const pmCardIds = [...pmIndex.matchAll(/editor\.html\?id=([\w-]+)/g)].map(m => m[1]);
check('首頁卡片與版型一一對應',
  pmCardIds.slice().sort().join(',') === PM_TEMPLATES.slice().sort().join(','), pmCardIds.join(','));
check('卡片圖只指向 previews/',
  [...pmIndex.matchAll(/<img[^>]+src="([^"]+)"/g)].every(m => m[1].startsWith('previews/')));
const pmImages = listFiles('tools/pair-maker/images').map(f => f.split('/').pop());
check('images/ 只留程式用得到的四張底圖',
  pmImages.join(',') === 'dark-theme.png,light-theme.png,theme-1.png,theme-2.png', pmImages.join(','));
/* 卡片圖的 alt 也要跟著語言走，所以共用引擎補了 data-i18n-alt 掛勾。 */
check('九張卡片圖都掛了 data-i18n-alt',
  [...pmIndex.matchAll(/<img[^>]+data-i18n-alt="/g)].length === PM_TEMPLATES.length);

/* v1.1.0 的文字記錄版型可以匯出 PDF。上游附了約 48 MB 的字型（PDF 用的四個字重與
 * 畫布用的 NotoSerifCJKKR.ttf），合輯不收：畫布改用 Google Fonts 的 Noto Serif KR，
 * PDF 在按下下載時才從 fonts.gstatic.com 抓完整的 TTF。PDF 函式庫本身（MIT）照收。 */
section('tools/pair-maker PDF export');
const pmSave = read('tools/pair-maker/js/SaveBtn.js');
check('pdf-lib 與 fontkit 及其授權檔都在',
  ['pdf-lib.min.js', 'fontkit.umd.min.js', 'pdf-lib-LICENSE.md', 'fontkit-LICENSE.txt']
    .every(f => exists(`tools/pair-maker/vendor/pdf/${f}`)));
const pmHeavy = listFiles('tools/pair-maker/vendor').filter(f => /\.ttf(\.zlib)?$|\/textlog\//.test(f));
check('不收上游附的大型字型檔', pmHeavy.length === 0, pmHeavy.join(', '));
const pmFontUrls = [...pmSave.matchAll(/https?:\/\/[^'"`\s]+\.ttf/g)].map(m => m[0]);
check('PDF 字型表有 12 個網址，全部指向 fonts.gstatic.com',
  pmFontUrls.length === 12 && pmFontUrls.every(u => u.startsWith('https://fonts.gstatic.com/s/')), `found ${pmFontUrls.length}`);
check('PDF 字型涵蓋明體與黑體的韓文、繁中版本',
  ['notoserifkr', 'notoseriftc', 'notosanskr', 'notosanstc'].every(f => pmFontUrls.some(u => u.includes(`/${f}/`))));
const pmTextLogs = ['textLog-simple', 'textLog-vert', 'textLog-hori', 'textLog-pair'];
check('文字記錄版型不再引用上游的 NotoSerifCJKKR',
  pmTextLogs.every(id => !stripComments(read(`tools/pair-maker/templates/${id}.js`)).includes('NotoSerifCJKKR')));
check('文字記錄版型切語言時重設畫布上的標籤',
  pmTextLogs.every(id => read(`tools/pair-maker/templates/${id}.js`).includes('I18N.onChange(applyCanvasLabels)')));
check('editor.html 載入畫布用的 Noto Serif KR', pmEditor.includes('Noto+Serif+KR'));

/* 切語言時要做的三件事：重建側邊欄清單、重跑版型結構、重算兩個收合鈕的標籤。 */
check('語言切換器掛在兩頁的工具列上',
  read('tools/pair-maker/js/script.js').includes("I18N.mountSwitcher(document.getElementById('localeSelect'))")
  && pmEditorJs.includes('I18N.mountSwitcher(document.getElementById("localeSelect"))'));
const pmOnChange = (pmEditorJs.match(/I18N\.onChange\([\s\S]*?\n  \}\);/) || [''])[0];
check('切語言時重建側邊欄的版型清單', pmOnChange.includes('loadTemplates()'));
check('切語言時重算收合鈕的標籤', pmOnChange.includes('syncToggleLabels()'));
check('切語言時重跑版型結構', pmOnChange.includes('"structure"'));
/* 側邊欄的版型名稱是 fetch("index.html") 讀原始標記讀出來的，照 key 翻才會
 * 跟著語言走；不先清空就會每切一次語言多長一份。 */
check('側邊欄的版型名稱照 key 翻',
  pmEditorJs.includes('element.dataset.i18n') && pmEditorJs.includes('key ? T(key)'));
check('重建清單前先清空', pmEditorJs.includes('list.replaceChildren()'));
/* 編輯頁的 <title> 要等 index.html 抓回來才知道，會跟引擎的 app.title 賽跑。 */
check('編輯頁的標題不會被 app.title 蓋掉', pmEditorJs.includes('currentPageTitle'));
/* 兩個收合鈕的 aria-label 跟著收合狀態走，掛上 data-i18n-aria-label 會讓切語言
 * 時一律寫回標記裡那一種狀態的字，所以刻意不掛，改由 syncToggleLabels() 重算。 */
for (const [cls, key] of [['sidebar-toggle', 'editor.010'], ['tools-toggle', 'runtime.001']]) {
  const tag = (pmEditor.match(new RegExp(`<button class="${cls}"[\\s\\S]*?>`)) || [''])[0];
  check(`${cls} 沒有掛 data-i18n-aria-label`, !!tag && !tag.includes('data-i18n-aria-label'));
  check(`${cls} 的靜態標籤與字典一致`, tag.includes(`aria-label="${pm.messages['zh-TW'][key]}"`), tag.trim());
}

/* 版型是 ES module，只會求值一次：最外層的常數若含 T()，就凍在第一次載入的
 * 語言（切語言時 store 的 'structure' 事件重跑的是函式，不會重新求值模組常數）。
 * 消費端（state.js／FormScript.js／registry.js）本來就同時吃陣列與函式，所以
 * 一律寫成函式。這裡防止復發：兩種寫法都要看——單行的 `const X = …T(…)…`，
 * 以及以 [ 或 { 結尾、直到頂格的 ] ／ } 為止的多行常數。 */
const pmFrozen = [];
for (const file of pmFiles('templates')) {
  const src = read(`tools/pair-maker/${file}`);
  for (const m of [
    ...src.matchAll(/^(?:export )?(?:const|let|var) ([A-Za-z_$][\w$]*) = (?!\(|function\b)(.*)$/gm),
    ...src.matchAll(/^(?:export )?(?:const|let|var) ([A-Za-z_$][\w$]*) = [[{]\n([\s\S]*?)\n[\]}];$/gm),
  ]) if (/\bT\(/.test(m[2])) pmFrozen.push(`${file.split('/').pop()}:${m[1]}`);
}
check('版型最外層沒有含 T() 的常數（那會凍在載入時的語言）',
  pmFrozen.length === 0, `frozen: ${pmFrozen.join(', ')}`);
/* 只建立一次、之後只切 hidden 的控制項，標籤要在切語言時重套一次。 */
for (const [file, fn] of [['js/stickers.js', 'applyStickerLabels'], ['js/KeyboardBar.js', 'applyBarLabels'],
  ['templates/30p-pair.js', 'applyCanvasLabels']]) {
  check(`${file} 切語言時重套只建立一次的標籤`,
    read(`tools/pair-maker/${file}`).includes(`I18N.onChange(${fn})`));
}
/* 上游在 1024px 以下把整塊側邊欄 display:none，語言切換器就在那塊裡面。 */
const pmEditorCss = read('tools/pair-maker/css/editor.css');
check('小螢幕沒有把整塊側邊欄藏掉',
  !/\.template-sidebar,\s*\.sidebar-toggle \{ display: none; \}/.test(pmEditorCss));
check('小螢幕只留下工具列', pmEditorCss.includes('.template-sidebar > :not(.toolkit-bar) { display: none; }'));

/* 署名與字型標籤含 T()，版型寫成函式，消費端就要會呼叫。 */
check('editor.js 會呼叫函式形態的署名', pmEditorJs.includes("typeof definition?.author === 'function'"));
check('FormScript 會呼叫函式形態的字型標籤',
  read('tools/pair-maker/js/FormScript.js').includes("typeof l==='function'?l():l"));

/* vendor/ 與上游一位元組不差，六套函式庫的授權條款與出處說明都要在。 */
check('有第三方函式庫的出處說明', exists('tools/pair-maker/THIRD_PARTY_NOTICES.md'));
const pmNotices = read('tools/pair-maker/THIRD_PARTY_NOTICES.md');
for (const [lib, licenceFile] of [
  ['Konva', 'Konva-LICENSE.txt'], ['Cropper.js', 'Cropper-LICENSE.txt'],
  ['Pickr', 'Pickr-LICENSE.txt'], ['fflate', 'fflate-LICENSE.txt'],
  ['Bootstrap Icons', 'Bootstrap-Icons-LICENSE.txt'], ['Pretendard', 'Pretendard-LICENSE.txt']]) {
  check(`保留 ${lib} 的授權條款`, exists(`tools/pair-maker/vendor/${licenceFile}`));
  check(`THIRD_PARTY_NOTICES 記載 ${lib}`, pmNotices.includes(lib) && pmNotices.includes(licenceFile));
}

/* ---- sotsotssi 的四個角色美術周邊工具 ---- */
/* 一批同時收錄、做法一致的小工具：純靜態、MIT、函式庫照上游走 CDN。
 * 共通的檢查寫成迴圈，各自的特別之處放在後面。 */
const SOTSOT_FOUR = [
  /* authorLink：上游在標題旁放了 @bb_uu_t 的連結。acrylic-goods 沒有——
   * 那個工具的署名只出現在燒進輸出圖片的浮水印上（見下方的 watermark 檢查）。 */
  { dir: 'tools/color-palette', dict: 'i18n.color-palette.js', minHooks: 25, inline: 20, attrs: 6, authorLink: true },
  { dir: 'tools/acrylic-goods', dict: 'i18n.acrylic-goods.js', minHooks: 50, inline: 35, attrs: 4, authorLink: false },
  { dir: 'tools/video-anim', dict: 'i18n.video-anim.js', minHooks: 60, inline: 50, attrs: 1, authorLink: true },
  { dir: 'tools/gif-combiner', dict: 'i18n.gif-combiner.js', minHooks: 25, inline: 20, attrs: 5, authorLink: true },
];
for (const t of SOTSOT_FOUR) {
  checkTool({ dir: t.dir, dict: t.dict, scripts: ['app.js'], styles: ['styles.css'], minHooks: t.minHooks });
}

section('sotsotssi 的四個角色美術周邊工具');
/* 上游把函式庫掛在 CDN 上，收錄版照舊（理由見 ATTRIBUTION）。既然不同捆，
 * 版本與出處就只剩 THIRD_PARTY_NOTICES.md 記著——漏記等於查不到來源。 */
const CDN_HOSTS = /https:\/\/(?:cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|esm\.sh|cdn\.tailwindcss\.com)[^"'`) ]*/g;
for (const t of SOTSOT_FOUR) {
  check(`${t.dir} 有第三方函式庫的出處說明`, exists(`${t.dir}/THIRD_PARTY_NOTICES.md`));
  const notices = read(`${t.dir}/THIRD_PARTY_NOTICES.md`);
  const urls = new Set();
  for (const f of ['index.html', 'app.js']) {
    for (const m of read(`${t.dir}/${f}`).matchAll(CDN_HOSTS)) urls.add(m[0]);
  }
  check(`${t.dir} 確實有 CDN 相依`, urls.size > 0, `found ${urls.size}`);
  const undocumented = [...urls].filter(u => {
    if (u.startsWith('https://cdn.tailwindcss.com')) return !notices.includes('cdn.tailwindcss.com');
    const m = u.match(/@(\d+\.\d+\.\d+)|\/(\d+\.\d+\.\d+)\/|\/(r\d+)\//);
    const version = m && (m[1] || m[2] || m[3]);
    return !version || !notices.includes(version);
  });
  check(`${t.dir} 的 CDN 相依都記在 THIRD_PARTY_NOTICES`, undocumented.length === 0,
    `未記載: ${undocumented.join(', ')}`);
  /* 切語言時，程式自己寫進畫面的文字要重寫一次；四個工具都靠 onChange 做這件事。 */
  const app = read(`${t.dir}/app.js`);
  check(`${t.dir} 掛了語言切換器`, app.includes("I18N.mountSwitcher(document.getElementById('localeSelect'))"));
  check(`${t.dir} 切語言時重寫程式畫出來的文字`, /I18N\.onChange\(\(\) => \{/.test(app));
  /* 原作者的 X 連結照 sotsotssi 其餘工具的做法保留（有的工具上游就沒有）。 */
  check(`${t.dir} ${t.authorLink ? '保留' : '本來就沒有'}原作者的連結`,
    read(`${t.dir}/index.html`).includes('https://x.com/bb_uu_t') === t.authorLink);
}

/* gif-combiner：gif.js 的 worker 在別的網域，要先抓成 Blob 才能當 workerScript。 */
const gcApp = read('tools/gif-combiner/app.js');
check('gif-combiner 把 gif.js 的 worker 包成 Blob（跨網域 CORS）',
  gcApp.includes('gif.worker.js') && gcApp.includes('URL.createObjectURL(blob)'));
check('gif-combiner 閒置時才重寫產生鈕的字',
  gcApp.includes("if (!generateBtn.disabled) generateBtn.innerText = T('gen.run')"));

/* color-palette：取色對話框關著時也要換掉那條狀態文字。 */
check('color-palette 切語言時連關著的對話框一起換',
  read('tools/color-palette/app.js').includes('render();\n    renderSwatches();'));

/* video-anim：結果卡上的數字要留著，換語言才排得出新句子。 */
const vaApp = read('tools/video-anim/app.js');
check('video-anim 把結果的數字記下來', vaApp.includes('state.lastResult = {'));
check('video-anim 用記下的數字重排結果卡', vaApp.includes('function applyResultLabels()'));

/* acrylic-goods：畫布上的浮水印是作者署名，走字典而不是寫死。 */
const agApp = read('tools/acrylic-goods/app.js');
check('acrylic-goods 的浮水印走字典', agApp.includes("ctx.fillText(T('watermark'), 390, 35)"));
const agDict = loadI18N(['tools/acrylic-goods/i18n.acrylic-goods.js']).messages;
for (const locale of ['zh-TW', 'ko']) {
  check(`acrylic-goods ${locale} 的浮水印保留原作者署名`,
    (agDict[locale]['watermark'] || '').includes('@bb_uu_t'), agDict[locale]['watermark']);
}
/* 工具自己那個「開源授權」對話框與 THIRD_PARTY_NOTICES 講的是同一批函式庫。 */
const agHtml = read('tools/acrylic-goods/index.html');
const agNotices = read('tools/acrylic-goods/THIRD_PARTY_NOTICES.md');
for (const lib of ['Three.js', 'Cannon.js', 'GIF.js', 'UPNG.js', 'Pako']) {
  check(`acrylic-goods 的授權對話框列了 ${lib}`, agHtml.includes(`<strong>${lib}</strong>`));
}
for (const lib of ['three.js', 'cannon.js', 'gif.js', 'upng-js', 'pako', 'GLTFExporter', 'OrbitControls']) {
  check(`acrylic-goods 的 THIRD_PARTY_NOTICES 列了 ${lib}`, agNotices.includes(lib));
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
  scripts: ['app.v1.js', 'presets.v1.js', 'css.v1.js', 'model.v1.js', 'mock.v1.js', 'pcfonts.v1.js'],
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

/* ---- message-box ---- */
/* 訊息框產生器（shiki365，chat-window 的姊妹工具）。刻意留著的日文與 chat-window 同一類：
 * mock.v1.js 照著重畫 CCFOLIA 的房間畫面，骰子結果是 BCDice 與 CCFOLIA 的實際輸出，
 * css.v1.js 的英文註解引用了 CCFOLIA 的 DOM 與設定名稱。清單釘死，兩個方向都要對得上。 */
const MB_KEPT_JA = {
  'mock.v1.js': ['ルームチャット', 'メッセージを入力', 'メッセージ', 'スキップ', '閉じる', 'スペシャル', 'シークレットダイス'],
  'presets.v1.js': ['決定的成功/スペシャル', '発言時キャラクターを表示しない', 'シークレットダイス'],
  'index.html': ['スペシャル'],
  'css.v1.js': ['メッセージ', '旧ダイス演出を利用する']
};
const mb = checkTool({
  dir: 'tools/message-box',
  dict: 'i18n.message-box.js',
  locale: 'ja',
  scripts: ['app.v1.js', 'presets.v1.js', 'css.v1.js', 'model.v1.js', 'mock.v1.js', 'pcfonts.v1.js'],
  styles: ['styles.css'],
  minHooks: 200,
  allowSource: (line, lineNo, file) => {
    const allowed = MB_KEPT_JA[file];
    if (!allowed) return false;
    return (line.match(CW_KANA_RUN) || []).filter(run => KANA.test(run))
      .every(run => allowed.some(keep => keep.includes(run)));
  }
});

section('tools/message-box kept Japanese');
for (const [file, keeps] of Object.entries(MB_KEPT_JA)) {
  const src = read(`tools/message-box/${file}`);
  for (const keep of keeps) check(`${file} 仍保留「${keep}」`, src.includes(keep));
}

section('tools/message-box preset keys');
const mbPresets = read('tools/message-box/presets.v1.js');
const mbListKeys = [
  ...[...mbPresets.matchAll(/\["[\w-]+", "([\w]+\.[\w.-]+)"\]/g)].map(m => m[1]),
  ...[...mbPresets.matchAll(/\[\d+, "([\w]+\.[\w.-]+)"\]/g)].map(m => m[1]),
  ...[...mbPresets.matchAll(/(?:label|desc|text|name): "([\w]+\.[\w.-]+)"/g)].map(m => m[1])
];
check('presets.v1.js 解析出清單 key', mbListKeys.length >= 100, `found ${mbListKeys.length}`);
for (const locale of ['zh-TW', 'ja']) {
  const missing = [...new Set(mbListKeys)].filter(k => !mb.messages[locale][k]);
  check(`${locale} 每個清單 key 都有譯文`, missing.length === 0, `missing: ${missing.join(', ')}`);
}
const MB_DESIGNS = ['standard', 'novel', 'letter', 'hud', 'horror', 'rpg', 'pop'];
check('七種範本都有兩種語言的名稱與說明', MB_DESIGNS.every(d => ['zh-TW', 'ja'].every(l =>
  mb.messages[l][`design.${d}`] && mb.messages[l][`design.${d}.desc`])));

section('tools/message-box status messages');
const mbApp = read('tools/message-box/app.v1.js');
/* 「已送出」的訊息依種類各一句完整的句子，放在 SENT_KEY 表裡，status("…") 的掃描看不到。 */
const mbSentKeys = [...mbApp.matchAll(/"(msg\.sent\.\w+)"/g)].map(m => m[1]);
const mbStatusKeys = [...new Set([
  ...[...mbApp.matchAll(/\bstatus(?:Error)?\("([\w]+\.[\w.]+)"/g)].map(m => m[1]),
  ...mbSentKeys, 'status.loading'
])];
check('解析出狀態列訊息 key（含七種「已送出」）', mbStatusKeys.length >= 25 && mbSentKeys.length >= 7, `found ${mbStatusKeys.length}`);
for (const locale of ['zh-TW', 'ja']) {
  const missing = mbStatusKeys.filter(k => !mb.messages[locale][k]);
  check(`${locale} 狀態列訊息齊全`, missing.length === 0, `missing: ${missing.join(', ')}`);
}
/* css.v1.js 把 st.text 取名為 T，全域 T() 會被蓋掉，一律走 TX()。 */
const mbCss = read('tools/message-box/css.v1.js');
check('css.v1.js 以 TX() 取譯文，避開被區域變數 T 蓋掉',
  mbCss.includes('const TX = (key, ...args) => window.T(key, ...args);') && !/[^.\w]T\((["'`])[a-zA-Z]/.test(mbCss));
const mbCssKeys = [...new Set([...mbCss.matchAll(/\bTX\("([\w]+\.[\w.]+)"/g)].map(m => m[1]))];
check('解析出產出 CSS 的註解 key', mbCssKeys.length >= 20, `found ${mbCssKeys.length}`);
for (const locale of ['zh-TW', 'ja']) {
  const missing = mbCssKeys.filter(k => !mb.messages[locale][k]);
  check(`${locale} 產出 CSS 的註解齊全`, missing.length === 0, `missing: ${missing.join(', ')}`);
}
/* 說明裡提到的姊妹工具連到合輯自己收的那份（兩邊互連），不連到作者站。 */
const mbDict = read('tools/message-box/i18n.message-box.js');
check('姊妹工具的連結指向合輯內的 chat-window', mbDict.includes('href="../chat-window/"')
  && !mbDict.includes('shiki365.github.io/chat-window-maker'));
check('chat-window 的說明連到合輯內的 message-box', read('tools/chat-window/i18n.chat-window.js').includes('href="../message-box/"'));
check('message-box 不收 favicon、OGP 圖與上游 README', ['favicon.svg', 'ogp.png', 'README.md'].every(f => !exists(`tools/message-box/${f}`)));

/* ---- obs-tachie（Discord 通話立繪產生器）---- */
/* 第三個需要建置的工具，做法同 character-editor：原始碼在 vendor/obs-tachie-generator，
 * 畫面全由 React 算繪，index.html 只有外殼的三個掛勾。上游是 MIT，LICENSE 照收。 */
const ot = checkTool({
  dir: 'tools/obs-tachie',
  dict: 'i18n.obs-tachie.js',
  locale: 'ja',
  scripts: [],
  styles: ['assets/index.css'],
  minHooks: 3
});
section('tools/obs-tachie build output');
const otZh = new Set(Object.keys(ot.messages['zh-TW']));
const OT_SHELL_KEYS = ['app.title', 'nav.home', 'lang.aria', 'noscript'];
const otSrc = listFiles('vendor/obs-tachie-generator/src')
  .filter(f => /\.tsx?$/.test(f) && !/\.test\./.test(f))
  .map(f => read(f))
  .join('\n');
const otUsed = [...otZh].filter(k => otSrc.includes(`'${k}'`) || otSrc.includes(`"${k}"`));
check('原始碼引用了字典中的大多數 key', otUsed.length >= 250, `found ${otUsed.length}`);
const otStale = [...otZh].filter(k => !otUsed.includes(k) && !OT_SHELL_KEYS.includes(k));
check('字典沒有原始碼用不到的 key', otStale.length === 0, `stale: ${otStale.join(', ')}`);
const otBundle = read('tools/obs-tachie/assets/app.js');
const otNotBuilt = otUsed.filter(k => !otBundle.includes(k));
check('建置產物是最新的（原始碼的 key 都在 bundle 裡）',
  otNotBuilt.length === 0, `missing from bundle: ${otNotBuilt.slice(0, 10).join(', ')}`);
check('bundle 無殘留假名', !KANA.test(otBundle));
/* 原始碼（不含測試）連註解都譯成了繁中，假名一個都不該有。 */
const otSrcKana = listFiles('vendor/obs-tachie-generator/src')
  .filter(f => /\.(tsx?|css)$/.test(f) && !/\.test\./.test(f))
  .filter(f => KANA.test(read(f)));
check('vendor 原始碼（測試以外）無假名', otSrcKana.length === 0, otSrcKana.join(', '));
check('上游 vitest 的 setup 會注入 ja 字典',
  read('vendor/obs-tachie-generator/src/test/setup.ts').includes('i18n.obs-tachie.js'));
/* 產出 CSS 的選擇器靠 Streamkit 的 class 前方一致與頭像網址比對，不能經過字典。 */
const otGen = read('vendor/obs-tachie-generator/src/lib/generateCss.ts');
check('產出 CSS 的 Streamkit 選擇器照上游',
  otGen.includes('Voice_avatarSpeaking__') && otGen.includes('avatars/'));
check('vite 以相對路徑輸出到 tools/obs-tachie',
  /base:\s*'\.\/'/.test(read('vendor/obs-tachie-generator/vite.config.ts'))
  && read('vendor/obs-tachie-generator/vite.config.ts').includes('tools/obs-tachie'));

/* shiki365 的三個 CSS 產生器替設定列的輸入元件從列標籤借 aria-label，上游只在綁定時借
 * 一次；合輯版在語言引擎換好標籤後（DOMContentLoaded）與每次切換語言時重借，讀螢幕
 * 軟體念出的欄位名才會跟畫面一致。 */
section('shiki365 borrowed aria-labels');
for (const tool of ['status-bar', 'chat-window', 'message-box']) {
  const app = read(`tools/${tool}/app.v1.js`);
  const relabel = (app.match(/function relabelUI\(\) \{[\s\S]*?\n  \}/) || [''])[0];
  check(`${tool}：借來的標籤會記上 data-auto-label`, app.includes('el.dataset.autoLabel = "1"')
    && app.includes('if (el.getAttribute("aria-label") && !el.dataset.autoLabel) return;'));
  check(`${tool}：切換語言與載入完成時重借標籤`, relabel.includes('refreshAutoLabels()')
    && app.includes('document.addEventListener("DOMContentLoaded", refreshAutoLabels)'));
}

/* ---- scenario-editor（劇本排版台）---- */
/* 上游 sedn14636361/trpg-scenario-editor 是 CC0 的單一 HTML（約 11,000 行），拆成
 * index.html／styles.css／app.js，NPC 卡的各系統資料表另外搬到 npc-data.js。
 * 刻意留著的日文有兩類，都是程式要比對、或原樣輸出給 CCFOLIA 的字串：
 *   1. app.js：CCFOLIA 棋子的指令與參數名（輸出與讀回共用）、讀入角色卡時的表頭別名、
 *      貼上原稿時推測段落種類的關鍵字。清單釘死。
 *   2. npc-data.js：能力值、技能、症候群等系統資料，整檔都是資料，會存進原稿也會
 *      輸出到 CCFOLIA。它只准有資料表，不准碰畫面。 */
const SE_KEPT_JA = ['ルーツ属性一致', 'シンドローム', 'コンボ', '正気度ロール', 'アイデア', 'ダメージ判定',
  'ふりがな', 'フリガナ', 'よみ', '読み', 'ヨミ', 'ルーツ', 'コンボ名', 'エフェクト名', '特殊ルール', 'ロール',
  'シーン', 'へ', 'に', '続く'];
const se = checkTool({
  dir: 'tools/scenario-editor',
  dict: 'i18n.scenario-editor.js',
  locale: 'ja',
  scripts: ['app.js', 'npc-data.js'],
  styles: ['styles.css'],
  minHooks: 220,
  allowSource: (line, n, file) => file === 'npc-data.js'
    || (file === 'app.js' && (line.match(CW_KANA_RUN) || []).filter(run => KANA.test(run)).every(run => SE_KEPT_JA.includes(run)))
});
section('tools/scenario-editor');
check('LICENSE 是上游的 CC0 原文', /CC0 1\.0 Universal/.test(read('tools/scenario-editor/LICENSE')));
const seApp = read('tools/scenario-editor/app.js');
for (const keep of SE_KEPT_JA) check(`app.js 仍保留「${keep}」`, seApp.includes(keep));
const seTKeys = [...new Set([...seApp.matchAll(/\bT\((['"`])([a-zA-Z][\w.]*)\1/g)].map(m => m[2]).filter(k => !k.endsWith('.')))];
check('app.js 以 T() 取用大量字串', seTKeys.length >= 600, `found ${seTKeys.length}`);
const seHtml = read('tools/scenario-editor/index.html');
const seOrder = ['assets/i18n.js', 'i18n.scenario-editor.js', 'npc-data.js', 'app.js'].map(f => seHtml.indexOf(f));
check('載入順序：引擎、字典、NPC 資料、主程式', seOrder.every((at, i) => at >= 0 && (i === 0 || at > seOrder[i - 1])), seOrder.join(','));
check('npc-data.js 只有資料表，不操作畫面', !/document\.|innerHTML|textContent/.test(read('tools/scenario-editor/npc-data.js')));
/* 這個工具刻意不連網：不准為了繁中字型加上 Google Fonts。 */
check('不載入任何網頁字型或外部資源',
  !/fonts\.googleapis|fonts\.gstatic|https?:\/\/(?!www\.w3\.org)/.test(seHtml + read('tools/scenario-editor/styles.css')));
check('紙面與介面的字型堆疊補上台灣系統字型', seApp.includes('Noto Serif TC') && seApp.includes('Microsoft JhengHei'));

/* ---- くま（TRPG WEBツール観測所）的六個工具 ---- */
/* 上游 kumachansteps/trpg-web-tools 沒有授權條款；站上的利用規約另外明文要求圖片、
 * 圖示素材不得轉載、再散布。所以這六個工具一張上游的圖都不收（範例圖由程式自己畫），
 * 也不該出現回報表單、存取分析與站台圖示。 */
const KUMA_TOOLS = ['bg-motion', 'icon-maker', 'session-log', 'session-report', 'variant-manager', 'scenario-cards'];
/* session-log 解析使用者匯入的日文試算表、團報與 CCFOLIA 紀錄，也把系統名、生還結果
 * 以上游的日文值存檔（兩種語言的 JSON 才能互讀）。這些字串刻意留著，清單釘死。 */
const SL_KEPT_JA = ['くま', 'エモクロア', 'マダミス', 'ロスト', '全ロスト', 'シノビガミ', 'インセイン', 'ダブルクロス',
  'ソード・ワールド', 'フタリソウサ', 'マルチシステム', 'ボイ', 'テキ', 'プレイ日', 'セッション日', 'シナリオ', 'シナリオ名',
  'タイトル', 'システム', 'システム名', 'ゲームシステム', 'ルール', 'ロール', 'キーパー', 'ゲームマスター', 'マスター', '回し手',
  'プレイヤー', 'メンバー', 'キャラ', 'キャラクター', 'キャラクター名', 'キャラ名', 'ステータス', 'プレイ時間', 'セッション時間',
  'メモ', 'ノート', 'コメント', '詳細メモ', '感想ネタバレ注意', 'キャンペーン', 'シリーズ', '親アイテム', 'ハッシュタグ', 'タグ',
  'エンディング', 'ルート', 'エンド', '生還ロスト', 'セッション', 'ログ', 'セッションリンク', '配布ページ', '感想リンク',
  'シナリオキー', '集計キー', 'はい', 'いいえ', 'マーダーミステリー', '新クトゥルフ神話', '新クトゥルフ', 'クトゥルフ神話',
  'ディーラー', 'クトゥルフ', 'さん', 'ｻﾝ', 'クリア', 'グッドエンド', 'ゲームクリア', 'した', 'クリティカル', 'ファンブル',
  'スペシャル', 'クローズ', 'まとめ', 'その', 'クロージング', 'オープニング', '中入り', 'フルスペック', 'ダイス', 'モブ',
  'エキストラ', 'サブ', 'バトル', 'ゲームマスタ', 'と', 'キャラシ作成会'];
/* session-report 只比對跑團紀錄簿送來的系統正規值與敬稱。 */
const SR_KEPT_JA = ['さん', '新クトゥルフ神話', 'エモクロア', 'マダミス', 'マーダーミステリー', 'クトゥルフ'];
const keptRuns = allowed => line => (line.match(CW_KANA_RUN) || []).filter(run => KANA.test(run))
  .every(run => allowed.includes(run) || allowed.some(keep => keep.includes(run)));
const KUMA = {
  'bg-motion': { scripts: ['js/main.js', 'js/shortcut.js'], styles: ['css/motion-maker-style.css'], locales: ['zh-TW', 'ko', 'ja'], hooks: 150, inline: 140, attrs: 7 },
  'icon-maker': { scripts: ['main.js'], styles: ['style.css'], hooks: 60, inline: 45, attrs: 8 },
  'session-log': { scripts: ['js/log_tool.js', 'js/shortcut.js'], styles: ['css/log_tool_style.css'], hooks: 125, inline: 90, attrs: 25,
    allow: (line, n, file) => file === 'js/log_tool.js' && keptRuns(SL_KEPT_JA)(line) },
  'session-report': { scripts: ['js/main.js', 'js/template.js'], styles: ['css/report_gen_style.css'], hooks: 90, inline: 65, attrs: 20,
    allow: (line, n, file) => file === 'js/main.js' && keptRuns(SR_KEPT_JA)(line) },
  'variant-manager': { scripts: ['js/main.js'], styles: ['css/style.css'], hooks: 40, inline: 30, attrs: 6 },
  'scenario-cards': { scripts: ['js/main.js', 'js/parser.js', 'js/render.js', 'js/shortcut.js'], styles: ['css/snippet_builder_style.css'], hooks: 30, inline: 18, attrs: 12 }
};
const kuma = {};
for (const name of KUMA_TOOLS) {
  const cfg = KUMA[name];
  kuma[name] = checkTool({
    dir: `tools/${name}`,
    dict: `i18n.${name}.js`,
    locale: 'ja',
    locales: cfg.locales,
    scripts: cfg.scripts,
    styles: cfg.styles,
    minHooks: cfg.hooks,
    allowSource: cfg.allow,
    licence: false
  });
  section(`tools/${name} (kuma)`);
  const files = listFiles(`tools/${name}`);
  check('沒有 LICENSE（上游未附授權條款）', !exists(`tools/${name}/LICENSE`));
  const images = files.filter(f => /\.(png|jpe?g|gif|webp|ico|svg)$/i.test(f));
  check('不收上游的任何圖片檔', images.length === 0, images.join(', '));
  const all = files.filter(f => /\.(html|js|css)$/.test(f)).map(f => read(f)).join('\n');
  check('沒有存取分析', !/gtag|googletagmanager|analytics\.js|ToolAnalytics/.test(all));
  check('沒有導向作者回報表單的按鈕', !all.includes('trpg-web-tools/report'));
  check('沒有引用作者站台的圖示', !/kuma_icon|kuma_ufo|assets\/img\//.test(all));
  check('頁首是合輯列', read(`tools/${name}/index.html`).includes('data-i18n="nav.home"'));
  /* 合輯版改過程式，問題回報不該送到原作者那裡。 */
  const dictSrc = read(`tools/${name}/i18n.${name}.js`);
  check('不請使用者把問題回報給原作者', !/不具合報告|問題回報|오류 제보/.test(dictSrc + read(`tools/${name}/index.html`)));
}
section('kuma kept Japanese');
const slSrc = read('tools/session-log/js/log_tool.js');
for (const keep of SL_KEPT_JA) check(`session-log 仍保留「${keep}」`, slSrc.includes(keep));
const srSrc = read('tools/session-report/js/main.js');
for (const keep of SR_KEPT_JA) check(`session-report 仍保留「${keep}」`, srSrc.includes(keep));
section('kuma dynamic keys');
/* bg-motion 的效果與圖片處理名稱以 `effect.${id}` 等方式組出來，靜態掃描看不到。 */
const bgHtml = read('tools/bg-motion/index.html');
const bgEffects = [...new Set([...bgHtml.matchAll(/data-effect="([^"]+)"/g)].map(m => m[1]))];
const bgFilters = [...new Set([...bgHtml.matchAll(/data-filter="([^"]+)"/g)].map(m => m[1]))];
check('bg-motion 解析出效果與圖片處理清單', bgEffects.length >= 20 && bgFilters.length >= 20,
  `effects ${bgEffects.length}, filters ${bgFilters.length}`);
for (const locale of ['zh-TW', 'ja', 'ko']) {
  const m = kuma['bg-motion'].messages[locale];
  const missing = [...bgEffects.filter(e => !m[`effect.${e}`]).map(e => `effect.${e}`),
    ...bgFilters.filter(f => !m[`filter.${f}`]).map(f => `filter.${f}`)];
  check(`bg-motion ${locale} 每個效果與圖片處理都有名稱`, missing.length === 0, `missing: ${missing.join(', ')}`);
}
const vmSrc = read('tools/variant-manager/js/main.js');
const vmIds = [...(vmSrc.match(/SUGGESTION_IDS = \[([\s\S]*?)\]/) || ['', ''])[1].matchAll(/'(\w+)'/g)].map(m => m[1]);
check('variant-manager 解析出 23 個差分名稱建議', vmIds.length === 23, `found ${vmIds.length}`);
for (const locale of ['zh-TW', 'ja']) {
  const missing = vmIds.filter(id => !kuma['variant-manager'].messages[locale][`suggest.${id}`]);
  check(`variant-manager ${locale} 每個建議名稱都有譯文`, missing.length === 0, `missing: ${missing.join(', ')}`);
}
/* scenario-cards 的狀態列訊息多半以 setStatus("status.x") 間接傳入。 */
const scKeys = [...new Set(['js/main.js', 'js/shortcut.js'].flatMap(f =>
  [...read(`tools/scenario-cards/${f}`).matchAll(/setStatus\(["']([\w.]+)["']/g)].map(m => m[1])))];
check('scenario-cards 解析出狀態列訊息 key', scKeys.length >= 20, `found ${scKeys.length}`);
for (const locale of ['zh-TW', 'ja']) {
  const missing = scKeys.filter(k => !kuma['scenario-cards'].messages[locale][k]);
  check(`scenario-cards ${locale} 狀態列訊息齊全`, missing.length === 0, `missing: ${missing.join(', ')}`);
}
/* 跑團紀錄簿的每一列可以直接送到團報產生器：連的是合輯裡的那一份。 */
check('session-log 連到合輯內的 session-report',
  slSrc.includes('../session-report/') && !slSrc.includes('session-report-generator'));

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

/* ---- trpg-lab（違法建築的 TRPG 實驗室）---- */
/* 合輯裡頁數最多的工具：一個目錄裝了 hub（index.html）、九個工具頁、第三方授權頁，
 * 以及 trpg_map_maker/ 底下的地圖清單與地圖編輯器。每頁一份字典，頁首、頁尾與說明
 * 視窗底下的授權連結等共用字串放在 i18n.trpg-lab.js，各頁先載入它。
 *
 * 上游的註解維持日文（map_editor.js 一檔就有上千行），理由與 height-board、room-zip
 * 相同；規則也相同：把註解抹成空白之後，程式碼與標記裡不准再出現假名。 */
const LAB = 'tools/trpg-lab';
const LAB_PAGES = [
  { html: 'index.html', scripts: ['index.js', 'common.js'], styles: ['index.css', 'common.css'], hooks: 23, inline: 10, attrs: 9 },
  { html: 'coc7_dice.html', scripts: ['coc7_dice.js'], styles: ['coc7_dice.css'], hooks: 42, inline: 7, attrs: 27 },
  { html: 'coc7_Investigator_sheet.html', scripts: ['coc7_Investigator_sheet.js'], styles: ['coc7_Investigator_sheet.css'], hooks: 140, inline: 135, attrs: 3 },
  { html: 'coc_npc_token.html', scripts: ['coc_npc_token.js'], styles: ['coc_npc_token.css'], hooks: 48, inline: 32, attrs: 4 },
  { html: 'damage_sum.html', scripts: ['damage_sum.js'], styles: ['damage_sum.css'], hooks: 9, inline: 7, attrs: 2, standalone: true },
  { html: 'grid_maker.html', scripts: ['grid_maker.js'], styles: ['grid_maker.css'], hooks: 71, inline: 68, attrs: 1 },
  { html: 'grid_ruler.html', scripts: ['grid_ruler.js'], styles: ['grid_ruler.css'], hooks: 69, inline: 64, attrs: 2 },
  { html: 'hex_maker.html', scripts: ['hex_maker.js'], styles: ['hex_maker.css'], hooks: 85, inline: 80, attrs: 1 },
  { html: 'hex_ruler.html', scripts: ['hex_ruler.js'], styles: ['hex_ruler.css'], hooks: 70, inline: 63, attrs: 2 },
  { html: 'third-party-licenses.html', scripts: [], styles: ['third-party-licenses.css'], hooks: 45, inline: 38, attrs: 4 },
  { html: 'trpg_map_maker/map_list.html', scripts: ['trpg_map_maker/map_list.js', 'trpg_map_maker/map_storage.js'],
    styles: ['trpg_map_maker/map_list.css'], hooks: 23, inline: 19, attrs: 1 },
  { html: 'trpg_map_maker/map_editor.html', scripts: ['trpg_map_maker/map_editor.js', 'trpg_map_maker/map_grid.js'],
    styles: ['trpg_map_maker/map_editor.css'], hooks: 350, inline: 247, attrs: 57 },
];
const labDict = page => page.html.replace(/[^/]+\.html$/, f => `i18n.${f.replace(/\.html$/, '')}.js`);
const labDicts = page => [...(page.standalone ? [] : [`${LAB}/i18n.trpg-lab.js`]), `${LAB}/${labDict(page)}`];

const LAB_KINDS = {};
for (const page of LAB_PAGES) {
  LAB_KINDS[page.html] = 'html';
  for (const f of page.scripts) LAB_KINDS[f] = 'js';
  for (const f of page.styles) LAB_KINDS[f] = 'css';
}
const labCode = Object.fromEntries(Object.entries(LAB_KINDS)
  .map(([file, kind]) => [file, stripComments(read(`${LAB}/${file}`), kind).split('\n')]));
const labAllow = (line, lineNo, file) => {
  const code = labCode[file];
  return !!code && !KANA.test(code[lineNo - 1] || '');
};

const labTools = LAB_PAGES.map(page => ({ page, tool: checkTool({
  dir: LAB,
  html: page.html,
  dict: labDict(page),
  shared: page.standalone ? [] : ['i18n.trpg-lab.js'],
  locale: 'ja',
  scripts: page.scripts,
  styles: page.styles,
  minHooks: page.hooks,
  allowSource: labAllow,
  licence: page.html === 'index.html'
}) }));

section('tools/trpg-lab');
const labFiles = listFiles(LAB).map(f => f.replace(`${LAB}/`, ''));
/* 上游只在 ihoukentiku.github.io 上載入 gtag；收錄版整組拿掉，連同只在說明分析的
 * 隱私權政策頁。 */
check('trpg-lab 沒有任何存取分析',
  !labFiles.some(f => /analytics|googlead|privacy-policy/.test(f))
  && !labFiles.filter(f => /\.(html|js)$/.test(f)).some(f => /gtag|googletagmanager|analytics\.js/.test(read(`${LAB}/${f}`))));
/* 作者在授權頁保留了自製素材的權利（間取り図 SVG、AI 生成的貼圖），擲骰音效出自
 * ニコニ・コモンズ；這些都不收。 */
const LAB_FLOORPLAN = ['fp-door', 'fp-door-large', 'fp-door-open', 'fp-door-double-open', 'bed_single', 'bed_double',
  'bed_queen', 'chair', 'toilet', 'table_4', 'table_chair_6', 'kitchen', 'window_single', 'window_double', 'stairs_straight'];
check('trpg-lab 不收作者保留權利的素材',
  !labFiles.some(f => f.startsWith('trpg_map_maker/patterns/') || /\.(webp|wav|mp3|ico)$/.test(f)
    || LAB_FLOORPLAN.some(n => f === `trpg_map_maker/decors/svg/${n}.svg`)));
check('trpg-lab 收了 56 個可再散布的裝飾 SVG',
  labFiles.filter(f => f.startsWith('trpg_map_maker/decors/svg/')).length === 56);
check('trpg-lab 各頁都走相對路徑（沒有指向站台根目錄的連結）',
  LAB_PAGES.every(p => !/(?:href|src)="\/(?!\/)/.test(read(`${LAB}/${p.html}`))));
/* 函式庫照上游走 CDN，版本與出處只剩 THIRD_PARTY_NOTICES.md 記著。 */
const labNotices = read(`${LAB}/THIRD_PARTY_NOTICES.md`);
const labCdn = new Set();
for (const page of LAB_PAGES) {
  for (const f of [page.html, ...page.scripts]) for (const m of read(`${LAB}/${f}`).matchAll(CDN_HOSTS)) labCdn.add(m[0]);
}
check('trpg-lab 確實有 CDN 相依', labCdn.size >= 6, `found ${labCdn.size}`);
const labUndocumented = [...labCdn].filter(u => {
  const m = u.match(/@(\d+\.\d+\.\d+)|\/(\d+\.\d+\.\d+)\//);
  const version = m && (m[1] || m[2]);
  return !version || !labNotices.includes(version);
});
check('trpg-lab 的 CDN 相依都有版本且記在 THIRD_PARTY_NOTICES', labUndocumented.length === 0,
  `未記載: ${labUndocumented.join(', ')}`);
/* 各工具頁是「整個視窗減掉頁首高度」的版面，合輯的回首頁連結與語言選單放在 lab 自己的頁首。 */
const labCommon = read(`${LAB}/common.js`);
check('trpg-lab 的頁首有回合輯首頁的連結',
  labCommon.includes("toolkitHome: new URL('../../', LAB_ROOT).href") && labCommon.includes('data-i18n="nav.home"'));
check('trpg-lab 的頁首掛了語言選單', labCommon.includes("I18N.mountSwitcher(document.getElementById('localeSelect'))"));
/* 次數也要對：說明視窗底下與頁尾各有一組授權連結與版權列，說明與主題按鈕各掛了 aria-label 與 title。 */
const LAB_HEADER_HOOKS = { 'lab.homeAria': 1, 'lab.logo': 1, 'lab.navAria': 1, 'nav.home': 1, 'lang.aria': 1,
  'lab.guide': 2, 'lab.twitter': 1, 'lab.theme': 2, 'lab.thirdParty': 2, 'lab.copyright': 2 };
const labHookMiss = Object.entries(LAB_HEADER_HOOKS)
  .filter(([k, n]) => [...labCommon.matchAll(new RegExp(`data-i18n(?:-[a-z-]+)?="${k.replace('.', '\\.')}"`, 'g'))].length !== n)
  .map(([k]) => k);
check('trpg-lab 的頁首文字切語言時由共用引擎重套（掛了 data-i18n）', labHookMiss.length === 0,
  `次數不對: ${labHookMiss.join(', ')}`);
check('trpg-lab 拿掉了隱私權政策的連結（那頁只在說明已移除的存取分析）', !labCommon.includes('privacyPolicy'));

/* 地圖編輯器：內建貼圖與格局圖 SVG 不收，登錄表也要清掉，否則挑選器會一直要 404。 */
const mapEditor = read(`${LAB}/trpg_map_maker/map_editor.js`);
const mapEditorCode = stripComments(mapEditor, 'js');
check('地圖編輯器沒有內建貼圖', /\nconst PATTERNS = \[\];/.test(mapEditor) && !/patterns\/(full|thumb)|\.webp'/.test(mapEditorCode));
const mapDecorFiles = [...mapEditorCode.matchAll(/type: 'svg', file: '([\w-]+\.svg)'/g)].map(m => m[1]);
check('地圖編輯器的裝飾登錄表剛好對上收錄的 56 個 SVG',
  mapDecorFiles.length === 56 && mapDecorFiles.every(f => labFiles.includes(`trpg_map_maker/decors/svg/${f}`)),
  `entries: ${mapDecorFiles.length}`);
check('地圖編輯器沒有格局圖（floorplan）分類', !/'floorplan'/.test(mapEditorCode));
/* 存檔裡引用了內建貼圖的，讀進來時換成上游本來的備用色，不去要那張圖。 */
check('地圖編輯器把舊存檔裡的內建貼圖換成單色', /function replaceRemovedPatterns\(/.test(mapEditor)
  && /replaceRemovedPatterns\(data\.canvas\);/.test(mapEditorCode)
  && /const REMOVED_PATTERN_COLORS = \{[\s\S]{0,600}grass: '#4a8c3f'[\s\S]{0,600}gravel: '#9a948a'/.test(mapEditor));
/* 上游把匯出面板的連結改寫成站台根目錄的 /hex_maker.html 等，收錄版要相對路徑。 */
check('地圖編輯器匯出面板的連結是相對路徑',
  mapEditor.includes("gridLink.href = isHex ? '../hex_maker.html' : '../grid_maker.html'")
  && mapEditor.includes("rulerLink.href = isHex ? '../hex_ruler.html' : '../grid_ruler.html'"));
/* 文字工具的字型清單加了五套繁中字型；optgroup 的 label 引擎管不到，改由 data-label-key 交給程式套。 */
const mapEditorHtml = read(`${LAB}/trpg_map_maker/map_editor.html`);
check('地圖編輯器的字型清單有五套繁中字型',
  ['Noto Sans TC', 'Noto Serif TC', 'LXGW WenKai TC', 'Chocolate Classical Sans', 'Cactus Classical Serif']
    .every(f => mapEditorHtml.includes(`<option value="${f}"`)));
const mapEditorDict = labTools.find(t => t.page.html === 'trpg_map_maker/map_editor.html').tool.messages;
const mapLabelKeys = [...mapEditorHtml.matchAll(/data-label-key="([^"]+)"/g)].map(m => m[1]);
check('地圖編輯器的 optgroup 標籤都有兩種語言的譯文', mapLabelKeys.length >= 6
  && mapLabelKeys.every(k => mapEditorDict['zh-TW'][k] && mapEditorDict.ja[k]), `keys: ${mapLabelKeys.length}`);
check('地圖編輯器切語言時重套 optgroup 標籤', /data-label-key/.test(mapEditor));

/* ---- jizura ---- */
/* JIZURA 的原作者已提供官方繁中版（社群貢獻，上游 PR #6），合輯不再收錄副本。
 * tools/jizura/ 只剩轉址頁：依共用的語言設定跳到原站的對應版本，沒有 JavaScript 時導到繁中版。 */
section('tools/jizura');
const JZ_BASE = 'https://852wa.github.io/JIZURA/';
const jzPage = read('tools/jizura/index.html');
check('不再收錄 JIZURA 的副本（vendor/jizura 與建置產物都移除了）',
  !exists('vendor/jizura') && listFiles('tools/jizura').sort().join(',') === 'tools/jizura/index.html,tools/jizura/ja/index.html');
check('轉址頁依共用的語言設定選原站版本', jzPage.includes("localStorage.getItem('trpg-toolkit-locale')")
  && jzPage.includes(`var BASE = '${JZ_BASE}';`)
  && jzPage.includes("var EDITION = { 'ja': '', 'ko': 'ko/', 'zh-TW': 'zh-hant/' };"));
check('沒有 JavaScript 時導到原站的繁中版', jzPage.includes(`<meta http-equiv="refresh" content="0; url=${JZ_BASE}zh-hant/">`));
check('轉址頁附上三種語言的手動連結與回合輯首頁的連結',
  [`${JZ_BASE}zh-hant/`, `${JZ_BASE}"`, `${JZ_BASE}ko/`].every(u => jzPage.includes(`href="${u.replace(/"$/, '')}"`))
  && jzPage.includes('<a class="back" href="../../">← TRPG Toolkit</a>') && !KANA.test(stripComments(jzPage, 'html').replace(/<a [^>]*lang="ja"[^>]*>[^<]*<\/a>/, '')));
check('舊的日文頁網址導到原站的日文版', read('tools/jizura/ja/index.html').includes(`location.replace('${JZ_BASE}')`));

/* ---- anime-rig ---- */
/* Anime2.5DRig：rigger.js 裡比對 PSD 圖層名稱的日文別名表（ALIAS_GROUPS），以及處理
 * Photoshop 自動命名（「のコピー」「レイヤー 1」「閉じ目2」）的幾行是解析用的資料，
 * 不是介面文字，原樣保留。只放行這幾處，其餘程式碼（連註解）都不准有假名。 */
const RIG = 'tools/anime-rig';
const rigRigger = read(`${RIG}/lib/rigger.js`).split('\n');
const rigAliasStart = rigRigger.findIndex(l => /^\s*var ALIAS_GROUPS = \{$/.test(l));
const rigAliasEnd = rigRigger.findIndex((l, i) => i > rigAliasStart && /^\s*\};$/.test(l));
const RIG_KEPT = ['のコピー', "'レイヤー 1'", '閉じ目)2$/', '"閉じ目2" select the long closed-eye variant'];
const rigAllow = (line, lineNo, file) => file === 'lib/rigger.js'
  && ((rigAliasStart >= 0 && lineNo - 1 > rigAliasStart && lineNo - 1 < rigAliasEnd) || RIG_KEPT.some(k => line.includes(k)));
const RIG_SCRIPTS = ['lib/app.js', 'lib/rigger.js', 'lib/runtime.js', 'lib/devices.js', 'lib/recorder.js',
  'lib/renderer.js', 'lib/obs-sync.js', 'lib/psd-worker.js', 'lib/face-features.js'];
const rig = checkTool({
  dir: RIG,
  dict: 'i18n.anime-rig.js',
  locale: 'ja',
  scripts: RIG_SCRIPTS,
  styles: ['lib/app.css'],
  minHooks: 150,
  allowSource: rigAllow
});
section('tools/anime-rig');
check('rigger.js 的圖層別名表還在（放行範圍有對到東西）',
  rigAliasStart > 0 && rigAliasEnd - rigAliasStart >= 25 && rigRigger[rigAliasStart + 1].includes('前髪'),
  `ALIAS_GROUPS: ${rigAliasStart}–${rigAliasEnd}`);
check('rigger.js 放行的四處 Photoshop 命名處理都還在', RIG_KEPT.every(k => rigRigger.some(l => l.includes(k))));
/* rigger.js、runtime.js 也在 worker 裡跑，用自己的 tr() 包裝；警告存成 {key, args}，顯示時才翻。 */
const rigZh = rig.messages['zh-TW'];
const rigLibKeys = ['lib/rigger.js', 'lib/runtime.js'].flatMap(f => [
  ...[...read(`${RIG}/${f}`).matchAll(/\btr\('([\w.]+)'/g)].map(m => m[1]),
  ...[...read(`${RIG}/${f}`).matchAll(/\bkey: '([\w.]+)'/g)].map(m => m[1])
]);
const rigLibMissing = [...new Set(rigLibKeys)].filter(k => !rigZh[k] && !k.endsWith('.'));
check('rigger.js／runtime.js 的訊息 key 都有定義', rigLibKeys.length >= 30 && rigLibMissing.length === 0,
  `found ${rigLibKeys.length}; missing: ${rigLibMissing.join(', ')}`);
check('rigger.js 不再拋出或推入寫死的字串',
  !/throw new Error\('|warnings\.push\('/.test(stripComments(read(`${RIG}/lib/rigger.js`), 'js')));
const rigRoles = [...read(`${RIG}/lib/rigger.js`).match(/var ROLE_LABELS = \{([\s\S]*?)\};/)[1].matchAll(/: '(\w+)'/g)].map(m => m[1]);
check('每個部件角色都有兩種語言的名稱（role.*）', rigRoles.length >= 29
  && rigRoles.every(r => rigZh[`role.${r}`] && rig.messages.ja[`role.${r}`]), `roles: ${rigRoles.length}`);
check('未知圖層的頭／身體分類有兩種語言的名稱', ['group.head', 'group.body'].every(k => rigZh[k] && rig.messages.ja[k]));
check('worker 由主執行緒拿到目前語言的字典', read(`${RIG}/lib/app.js`).includes("messages:Object.assign({},I18N.messages['zh-TW'],I18N.messages[I18N.locale])")
  && read(`${RIG}/lib/psd-worker.js`).includes('messages=ev.data.messages||{}'));
check('app.js 的區域變數 T 已改名，沒有遮蔽 i18n 的 T()', !/\bconst T\s*=/.test(read(`${RIG}/lib/app.js`)));
check('拖放提示改由 data-drop-label 依語言設定', read(`${RIG}/lib/app.css`).includes('content:attr(data-drop-label)')
  && read(`${RIG}/lib/app.js`).includes("dataset.dropLabel=T('stage.drop')"));
/* 範例 PSD 的圖畫權利屬於各自的作者；閉眼閉嘴原圖、OBS 中繼伺服器、測試與 MediaPipe 同捆檔都不收。 */
const rigFiles = listFiles(RIG).map(f => f.replace(`${RIG}/`, ''));
check('anime-rig 沒有任何 PSD 檔', !rigFiles.some(f => /\.psd$/i.test(f)));
check('anime-rig 不收 OBS 中繼伺服器、測試與 MediaPipe 同捆檔',
  !rigFiles.some(f => /obs_server|start_obs|^tests\/|package\.json|lib\/vendor\//.test(f)));
const rigApp = stripComments(read(`${RIG}/lib/app.js`), 'js');
const rigHtml = read(`${RIG}/index.html`);
check('頁面不再去抓範例 PSD、閉眼閉嘴原圖或 README.md',
  !/sample2?\.psd|data-sample|eye_close\.psd|mouth_close\.psd|'README\.md'/.test(rigApp + rigHtml));
check('使用說明兩種語言都在，由字典指定檔名', exists(`${RIG}/guide.zh-TW.md`) && exists(`${RIG}/guide.ja.md`)
  && rigZh['guide.file'] === 'guide.zh-TW.md' && rig.messages.ja['guide.file'] === 'guide.ja.md');
check('繁中使用說明沒有殘留假名（圖層別名與 Photoshop 命名除外）',
  read(`${RIG}/guide.zh-TW.md`).split('\n').filter(l => KANA.test(l))
    .every(l => /^\| `/.test(l) || /`[^`]*[ぁ-ゖァ-ヺ][^`]*`|「のコピー」/.test(l)));
check('OBS 區塊說明需要原作的本機伺服器，同步開關只在有中繼伺服器時顯示',
  /id="obsKit" data-i18n-html="obs\.kit"/.test(rigHtml) && /<div id="obsControls" hidden>/.test(rigHtml)
  && rigApp.includes("$('obsControls').hidden=!st.relay;$('obsKit').hidden=st.relay;")
  && rigZh['obs.kit'].includes('https://github.com/852wa/Anime2.5DRig'));
check('頁首有回合輯首頁的連結與語言選單', rigHtml.includes('<a class="tk-home" href="../../" data-i18n="nav.home">')
  && read(`${RIG}/lib/app.js`).includes("I18N.mountSwitcher($('langSwitch'))"));
/* MediaPipe 走 CDN：版本要與 THIRD_PARTY_NOTICES 對得上；ag-psd 是同捆的，版本也要記著。 */
const rigNotices = read(`${RIG}/THIRD_PARTY_NOTICES.md`);
const rigFm = (read(`${RIG}/lib/devices.js`).match(/const FM_VERSION='([\d.]+)'/) || [])[1];
check('MediaPipe 從 jsDelivr 載入，版本記在 THIRD_PARTY_NOTICES', !!rigFm && rigNotices.includes(rigFm)
  && read(`${RIG}/lib/devices.js`).includes("'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@'+FM_VERSION+'/'"));
check('同捆的 ag-psd 附上 MIT 授權', rigNotices.includes('ag-psd 31.0.2') && rigNotices.includes('Copyright (c) 2016 Agamnentzar'));

/* ---- coc-typesetter ---- */
/* CoC 劇本排版工具只收成繁體中文：沒有 i18n 引擎、沒有語言選單，劇本的標記語法與版面字型
 * 也改成中文。所以這裡不走 checkTool()，而是整份檔案（連註解）都不准有假名，並檢查語法與字型。 */
section('tools/coc-typesetter');
const COC = 'tools/coc-typesetter';
const cocHtml = read(`${COC}/index.html`), cocJs = read(`${COC}/app.js`), cocCss = read(`${COC}/styles.css`);
for (const [file, src] of [['index.html', cocHtml], ['app.js', cocJs], ['styles.css', cocCss]]) {
  const leaked = src.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => KANA.test(l));
  check(`${file} 沒有任何假名`, leaked.length === 0, leaked.slice(0, 5).map(([n, l]) => `L${n}: ${l.trim().slice(0, 60)}`).join('\n       '));
}
check('html lang 為 zh-Hant-TW，<title> 是繁中', /<html lang="zh-Hant-TW">/.test(cocHtml) && cocHtml.includes('<title>CoC 劇本排版工具</title>'));
check('只有繁中：沒有 i18n 引擎與語言選單', !/assets\/i18n\.js|mountSwitcher|langSwitch|localeSelect/.test(cocHtml + cocJs));
check('頁首有回合輯首頁的連結', cocHtml.includes('<a class="tk-home" href="../../">← TRPG Toolkit</a>'));
check('拿掉了 OG meta 與 description', !/property="og:|name="description"|name="twitter:/.test(cocHtml));
check('作者不明、未附授權：目錄裡沒有 LICENSE', !exists(`${COC}/LICENSE`));
/* 版面字型：上游是日文字型，收錄版換成 Noto Serif TC／Noto Sans TC（樣式、字型連結與預載清單三處要一致）。 */
check('沒有留下日文字型', !/Shippori|Zen Kaku|Noto (?:Sans|Serif) JP|Yu Mincho|Yu Gothic|Hiragino|Meiryo/.test(cocHtml + cocJs + cocCss));
check('紙面與介面用 Noto Serif TC／Noto Sans TC',
  cocHtml.includes('family=Noto+Serif+TC:wght@400;700&family=Noto+Sans+TC:wght@400;500;700')
  && cocHtml.includes('--serif:"Noto Serif TC"') && cocHtml.includes('--sans:"Noto Sans TC"')
  && cocJs.includes(`'400 12px "Noto Serif TC"'`) && cocJs.includes(`'700 12px "Noto Sans TC"'`));
/* 「儲存列印用 HTML」會複製這三個元素的內容，它們必須留在頁面裡。 */
check('紙面樣式、紙張設定與字型連結留在 index.html（匯出會複製）',
  ['<style id="page-style">', '<style id="book-css">', '<link id="font-link"'].every(t => cocHtml.includes(t))
  && ["$('#page-style').textContent", "$('#book-css').textContent", "$('#font-link').outerHTML"].every(t => cocJs.includes(t)));
check('匯出的 HTML 標成 zh-Hant-TW', cocJs.includes('<html lang="zh-Hant-TW">'));
/* 語法記號改成中文。 */
check('換頁記號是 ===換頁===', /const RE_PB=\/\^\\s\*=\+\\s\*換頁\\s\*=\+\\s\*\$\/;/.test(cocJs) && cocJs.includes("pb:'===換頁===\\n'"));
check('封面資訊的欄位是「標題／副標題／作者」', cocJs.includes("const COVER_KEYS=['標題','副標題','作者'];")
  && cocJs.includes("M={title:pick('標題'),subtitle:pick('副標題'),author:pick('作者')"));
const cocSan = (cocJs.match(/const RE_SAN_SRC='(.*)';/) || [])[1];
const cocSanRe = cocSan ? new RegExp(cocSan.replace(/\\\\/g, '\\'), 'g') : null;
const COC_SAN_YES = ['SANc（0/1d3）', 'SAN 檢定(1/1d6)', 'SAN值檢定（0/1）', '進行SC（0/1）', '理智檢定（1/1d4）'];
const COC_SAN_NO = ['DISC（1/2）', 'SANチェック（0/1）'];
check('理智檢定的幾種中文寫法都認得，也不會誤判英文單字',
  !!cocSanRe && COC_SAN_YES.every(t => (t.match(cocSanRe) || []).length === 1) && COC_SAN_NO.every(t => !t.match(cocSanRe)));
check('避頭尾標點沒有假名，補了中文括號', !KANA.test(cocJs.match(/const NO_START='(.*)';/)[1]) && cocJs.includes('〗') && cocJs.includes('〖'));
check('著重號是字下方的圓點（台灣慣例）', cocHtml.includes('text-emphasis:filled dot') && cocHtml.includes('text-emphasis-position:under right'));
/* 範例劇本是另寫的原創內容，不能帶到上游範例（港町、霧笛、燈塔）；各種格式都要用到，長度與上游相近。 */
const cocSample = (cocJs.match(/const SAMPLE_TEXT=`([\s\S]*?)`;/) || [])[1] || '';
check('範例劇本不是上游的範例', !!cocSample && !/霧笛|燈台|灯台|見本|汐見|潮見/.test(cocJs));
check('範例劇本用到所有格式', [':::warn', ':::note', ':::kp', ':::pl', '\n> ', '▼【', '===換頁===', 'SANc（', '| STR |', '\n## ', '\n### ']
  .every(t => cocSample.includes(t)));
const cocChars = cocSample.replace(/\s/g, '').length;
check('範例劇本的長度與上游相近（1,500～2,300 字）', cocChars >= 1500 && cocChars <= 2300, `${cocChars} 字`);
/* 函式庫照上游走 CDN，版本要記在 THIRD_PARTY_NOTICES。 */
const cocNotices = read(`${COC}/THIRD_PARTY_NOTICES.md`);
const cocCdn = [...cocHtml.matchAll(CDN_HOSTS)].map(m => m[0]);
check('coc-typesetter 的 CDN 相依都有版本且記在 THIRD_PARTY_NOTICES',
  cocCdn.length === 2 && cocCdn.every(u => { const v = (u.match(/@(\d+\.\d+\.\d+)/) || [])[1]; return v && cocNotices.includes(v); }),
  cocCdn.join(', '));
check('THIRD_PARTY_NOTICES 記下取得網址與作者不明', cocNotices.includes('https://scenario-tool-jade.vercel.app/coc-typesetter.html')
  && cocNotices.includes('沒有作者署名'));

/* ---- apng-wipe ---- */
/* 輕量轉場 APNG 產生器：作者與來源都不明，收成只有繁中（和 coc-typesetter 同樣的處理）。
 * 整份檔案不准有假名，不載入任何外部資源；APNG 編碼是上游自己寫的，檢查關鍵 chunk 都還在。 */
section('tools/apng-wipe');
const AW = 'tools/apng-wipe';
const awHtml = read(`${AW}/index.html`), awJs = read(`${AW}/app.js`), awCss = read(`${AW}/styles.css`);
for (const [file, src] of [['index.html', awHtml], ['app.js', awJs], ['styles.css', awCss]]) {
  const leaked = src.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => KANA.test(l));
  check(`${file} 沒有任何假名`, leaked.length === 0, leaked.slice(0, 5).map(([n, l]) => `L${n}: ${l.trim().slice(0, 60)}`).join('\n       '));
}
check('html lang 為 zh-Hant-TW，<title> 是繁中', /<html lang="zh-Hant-TW">/.test(awHtml) && awHtml.includes('<title>輕量轉場 APNG 產生器</title>'));
check('只有繁中：沒有 i18n 引擎與語言選單', !/assets\/i18n\.js|mountSwitcher|langSwitch|localeSelect/.test(awHtml + awJs));
check('頁首有回合輯首頁的連結', awHtml.includes('<a class="tk-home" href="../../">← TRPG Toolkit</a>'));
check('作者與來源不明、未附授權：目錄裡沒有 LICENSE', !exists(`${AW}/LICENSE`));
check('不載入任何外部資源', !/(?:src|href)="https?:|url\(\s*['"]?https?:|fetch\(/.test(awHtml + awCss + awJs));
check('沒有留下日文字型', !/Noto Sans JP|Yu Gothic|Hiragino|Meiryo/.test(awHtml + awCss));
check('APNG 編碼的關鍵 chunk 都在', ['IHDR', 'PLTE', 'tRNS', 'acTL', 'fcTL', 'IDAT', 'fdAT', 'IEND'].every(c => awJs.includes(`'${c}'`)));
check('存檔副檔名是 .png（APNG 規格建議的副檔名）', /a\.download=`transition-[^`]*deg\.png`;/.test(awJs) && !/deg\.apng/.test(awJs));
check('上游的三種預設尺寸照舊', ['[15,30]', '[30,15]', '[15,15]'].every(t => awJs.includes(t))
  && ['15×15px', '15×30px', '30×15px'].every(t => awHtml.includes(t)));
const awAngles = (awJs.match(/\['0°・向右'[^\]]*\]/) || [''])[0].match(/'[^']+'/g) || [];
check('八個角度的說明都是繁中', awAngles.length === 8 && awAngles.every(a => /向/.test(a)), `found ${awAngles.length}`);

/* ---- PC 字型挑選器 ---- */
/* pcfonts.v1.js 在三個工具底下各有一份，上游保證三份完全相同，收錄版也一樣。
 * 只改其中一份的話，另外兩個工具的對話框就會停在舊版本。 */
section('pcfonts.v1.js');
const PCFONT_TOOLS = ['foreground-frame', 'status-bar', 'chat-window', 'scene-transition', 'message-box'];
const pcfSources = PCFONT_TOOLS.map(t => read(`tools/${t}/pcfonts.v1.js`));
const pcfDiffer = PCFONT_TOOLS.filter((t, i) => pcfSources[i] !== pcfSources[0]);
check('各工具的 pcfonts.v1.js 完全相同', pcfDiffer.length === 0, `differs: ${pcfDiffer.join(', ')}`);
for (const tool of PCFONT_TOOLS) {
  const html = read(`tools/${tool}/index.html`);
  check(`${tool} 載入 pcfonts.v1.js`, /<script src="pcfonts\.v1\.js/.test(html));
  check(`${tool} 的字型欄有「從清單選」按鈕`, html.includes('data-pc-fonts'));
  /* 對話框是延遲建立的單例，切語言時要整個丟掉重建，否則裡面的文字會停在舊語言。 */
  check(`${tool} 的挑選器會在切換語言時重建`,
    read(`tools/${tool}/pcfonts.v1.js`).includes('I18N.onChange(() => {'));
}
/* 這三個工具的字典都要能餵飽同一份 pcfonts.v1.js。 */
/* 兩個 key 是以三元運算傳進 T() 的（refused ? … : …），掃 T(" 會漏掉，改抓字面常數。 */
const pcfKeys = [...new Set([...pcfSources[0].matchAll(/"(pcf\.[\w.]+)"/g)].map(m => m[1]))];
check('解析出挑選器的 key', pcfKeys.length >= 13, `found ${pcfKeys.length}`);
for (const [tool, dict] of [['foreground-frame', ff], ['status-bar', sb], ['chat-window', cw], ['scene-transition', st], ['message-box', mb]]) {
  for (const locale of ['zh-TW', 'ja']) {
    const missing = pcfKeys.filter(k => !dict.messages[locale][k]);
    check(`${tool} ${locale} 的挑選器譯文齊全`, missing.length === 0, `missing: ${missing.join(', ')}`);
  }
}
/* 樣張文字用「永」示範字型有沒有漢字，說明文也是這樣寫的。 */
for (const [tool, dict] of [['foreground-frame', ff], ['status-bar', sb], ['chat-window', cw], ['scene-transition', st], ['message-box', mb]]) {
  for (const locale of ['zh-TW', 'ja']) {
    check(`${tool} ${locale} 的樣張含「永」`, (dict.messages[locale]['pcf.sample'] || '').includes('永'));
  }
}

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
/* message-box：上游也註明與 status-bar 同一份字型清單。 */
const mbFonts = read('tools/message-box/presets.v1.js');
for (const m of mbFonts.matchAll(/family: "([^"]+)", weights: \[([\d, ]+)\]/g)) {
  if (!TC_FAMILIES.includes(m[1])) continue;
  const bad = m[2].split(',').map(w => Number(w.trim())).filter(w => !TC_WEIGHTS[m[1]].includes(w));
  check(`message-box：${m[1]} 的 weights 都存在`, bad.length === 0,
    `不存在的字重: ${bad.join(', ')}（可用: ${TC_WEIGHTS[m[1]].join(', ')}）`);
}
for (const locale of ['zh-TW', 'ja']) {
  const missing = sbTcKeys.filter(k => !mb.messages[locale][k]);
  check(`message-box ${locale} 每套繁中字型都有標籤`, missing.length === 0, `missing: ${missing.join(', ')}`);
}
check('message-box 與 status-bar 的字型清單一致',
  fontIds(mbFonts).join(',') === fontIds(sbFonts).join(','),
  `message-box: ${fontIds(mbFonts).length}, status-bar: ${fontIds(sbFonts).length}`);

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

/* pair-maker：字型清單在 2p-simple.js，五個版型裡有字型欄的兩個共用它
 * （main-tweet 只是把 Apple SD Gothic Neo 挪到最前面）；css2 的網址在
 * editor.html。清單、標籤與網址三者要同時有，少一樣就是選得到但套不上。 */
checkCss2Url('pair-maker editor.html', pmEditor);
for (const family of TC_FAMILIES) {
  check(`pair-maker 的字型清單有 ${family}`, pmSimple.includes(`'${family}',`));
  check(`pair-maker 的字型標籤有 ${family}`, pmSimple.includes(`'${family}': T(`));
  check(`pair-maker 的 css2 連結有 ${family}`, pmEditor.includes(family.replace(/ /g, '+')));
}
const pmTweet = read('tools/pair-maker/templates/main-tweet.js');
check('main-tweet 的字型清單沿用 2p-simple 的那一份',
  pmTweet.includes('fonts as sharedFonts') && pmTweet.includes('...sharedFonts.filter('));

/* text-path：畫格線預覽與版面都要把繁中字型排在韓文字型前面。 */
const tpCss = read('tools/text-path/styles.css');
checkCss2Url('text-path @import', tpCss);

/* trpg-lab：介面是繁中時改用 Noto Sans TC（common.css 依 <html lang> 切換），每頁的
 * Google Fonts 連結都要一起載入它，字重也要真的存在。 */
for (const page of LAB_PAGES) {
  const html = read(`${LAB}/${page.html}`);
  const links = [...html.matchAll(/href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"/g)].map(m => m[1].replace(/&amp;/g, '&'));
  check(`trpg-lab ${page.html} 載入 Noto Sans TC`, links.some(u => u.includes('family=Noto+Sans+TC')));
  links.forEach((u, i) => checkCss2Url(`trpg-lab ${page.html} 字型連結 ${i + 1}`, u));
}
check('trpg-lab 的介面字型在繁中時改用 Noto Sans TC',
  read(`${LAB}/common.css`).includes(":root:lang(zh) {\n    --font-main: 'Noto Sans TC', 'Noto Sans JP', sans-serif;"));
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
const homeKeys = [...homeHtml.matchAll(/data-i18n(?:-html|-node|-title|-aria-label|-placeholder|-alt)?="([^"]+)"/g)].map(m => m[1]);
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

/* 每個工具的連結都要指得到。 */
const TOOLS = ['magic-circle', 'typewriter', 'text-path', 'collage-letter', 'emotion-maker',
  'loading-maker', 'foreground-frame', 'scene-transition', 'status-bar', 'cutin',
  'ccfolia-cropper', 'character-select', 'character-editor', 'chat-window', 'portrait-size',
  'height-board', 'room-zip', 'pair-maker',
  'color-palette', 'acrylic-goods', 'video-anim', 'gif-combiner', 'trpg-lab', 'jizura', 'anime-rig', 'coc-typesetter', 'apng-wipe', 'message-box',
  'scenario-editor', 'obs-tachie', 'bg-motion', 'icon-maker', 'session-log', 'session-report', 'variant-manager', 'scenario-cards'];
for (const name of TOOLS) {
  check(`連結 tools/${name}/ 有效`,
    homeHtml.includes(`tools/${name}/`) && exists(`tools/${name}/index.html`));
}

/* 每張卡片的授權徽章都要跟該工具目錄裡有沒有 LICENSE 對得上。徽章是手寫的，
 * 新增工具時很容易沿用上一張卡片而標錯（把未授權的標成 MIT 就是誤導）。
 * emotion-maker 另含 39 張圖像素材，故其徽章用 license.unlicensed.assets。 */
const TOOLS_EXTERNAL = ['jizura'];
check('首頁的 JIZURA 卡片標示連到原站', /href="\.\/tools\/jizura\/"[\s\S]{0,1600}?data-i18n="license\.external"/.test(homeHtml));
check('首頁字典有四種授權徽章',
  ['license.mit', 'license.cc0', 'license.unlicensed', 'license.unlicensed.assets'].every(k => homeZh.has(k)));
const homeCards = [...homeHtml.matchAll(/<li class="tool-card">([\s\S]*?)<\/li>/g)].map(m => m[1]);
check('首頁卡片數與工具數一致', homeCards.length === TOOLS.length,
  `cards: ${homeCards.length}, tools: ${TOOLS.length}`);
for (const card of homeCards) {
  const name = (card.match(/href="\.\/tools\/([^/]+)\//) || [])[1];
  const badge = (card.match(/class="badge(?: [^"]*)?" data-i18n="([^"]+)"/) || [])[1];
  /* 不再收錄副本、改連到原作者網站的工具，徽章標「連到原站」。 */
  const expected = TOOLS_EXTERNAL.includes(name) ? ['license.external']
    : exists(`tools/${name}/LICENSE`)
    ? [/CC0 1\.0 Universal/.test(read(`tools/${name}/LICENSE`)) ? 'license.cc0' : 'license.mit']
    : ['license.unlicensed', 'license.unlicensed.assets'];
  check(`首頁 ${name} 的授權徽章與目錄裡的 LICENSE 相符`,
    !!name && expected.includes(badge), `badge: ${badge}`);
}
check('首頁標示原作者出處',
  ['sotsotssi', 'shiki365', 'Taku-Taku-Taku', 'kimtaehee2018-maker', 'organon-torah',
    'woolwag3338', 'johnko00', 'baegop157902', 'ihoukentiku', '852wa', 'max-enterme', 'sedn14636361', 'kumachansteps']
    .every(a => homeHtml.includes(`github.com/${a}`)));
/* coc-typesetter 的作者不明，至少要標出取得的網址。 */
check('首頁標示 coc-typesetter 的來源網址', homeHtml.includes('https://scenario-tool-jade.vercel.app/coc-typesetter.html'));
check('首頁說明兩個作者不明的工具', homeHtml.includes('（CoC 劇本排版工具與輕量轉場 APNG 產生器的作者不明）'));

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

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: '\u00a0' };
const decodeEntities = text => text.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, name) => ENTITIES[name]);

function checkInlineText(label, htmlPath, dictPaths, minCompared) {
  const html = read(htmlPath);
  const dict = loadI18N(dictPaths).messages['zh-TW'];
  let compared = 0;
  const mismatches = [];
  for (const m of html.matchAll(INLINE_TEXT_RE)) {
    const key = m[2];
    if (!(key in dict)) continue; /* 未知 key 已由其他檢查把關，這裡不重複報告 */
    compared += 1;
    /* data-i18n 走 textContent，所以要比的是瀏覽器算繪後的文字，不是原始標記。 */
    const text = decodeEntities(m[3].trim());
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
checkInlineText('tools/scene-transition', 'tools/scene-transition/index.html', ['tools/scene-transition/i18n.scene-transition.js'], 130);
checkInlineText('tools/message-box', 'tools/message-box/index.html', ['tools/message-box/i18n.message-box.js'], 130);
checkInlineText('tools/scenario-editor', 'tools/scenario-editor/index.html', ['tools/scenario-editor/i18n.scenario-editor.js'], 150);
checkInlineText('tools/obs-tachie', 'tools/obs-tachie/index.html', ['tools/obs-tachie/i18n.obs-tachie.js'], 2);
for (const name of KUMA_TOOLS) checkInlineText(`tools/${name}`, `tools/${name}/index.html`, [`tools/${name}/i18n.${name}.js`], KUMA[name].inline);
checkInlineText('tools/status-bar', 'tools/status-bar/index.html', ['tools/status-bar/i18n.status-bar.js'], 150);
checkInlineText('tools/chat-window', 'tools/chat-window/index.html', ['tools/chat-window/i18n.chat-window.js'], 150);
checkInlineText('tools/portrait-size', 'tools/portrait-size/index.html', ['tools/portrait-size/i18n.portrait-size.js'], 20);
checkInlineText('tools/height-board', 'tools/height-board/index.html', ['tools/height-board/i18n.height-board.js'], 25);
checkInlineText('tools/ccfolia-cropper', 'tools/ccfolia-cropper/index.html', ['tools/ccfolia-cropper/i18n.ccfolia-cropper.js'], 20);
checkInlineText('tools/character-select', 'tools/character-select/index.html', ['tools/character-select/i18n.character-select.js'], 170);
checkInlineText('tools/room-zip', 'tools/room-zip/index.html', ['tools/room-zip/i18n.room-zip.js'], 15);
/* pair-maker 有兩頁，兩頁都要比。 */
checkInlineText('tools/pair-maker', 'tools/pair-maker/index.html', ['tools/pair-maker/i18n.pair-maker.js'], 15);
checkInlineText('tools/pair-maker editor', 'tools/pair-maker/editor.html', ['tools/pair-maker/i18n.pair-maker.js'], 6);
checkInlineText('tools/anime-rig', 'tools/anime-rig/index.html', ['tools/anime-rig/i18n.anime-rig.js'], 110);
for (const t of SOTSOT_FOUR) {
  checkInlineText(t.dir, `${t.dir}/index.html`, [`${t.dir}/${t.dict}`], t.inline);
}
for (const page of LAB_PAGES) {
  checkInlineText(`${LAB}/${page.html}`, `${LAB}/${page.html}`, labDicts(page), page.inline);
}

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
  { i18nAttr: /data-i18n-placeholder="([^"]+)"/, valAttr: /(?<![-a-z])placeholder="([^"]*)"/, name: 'placeholder' },
  { i18nAttr: /data-i18n-alt="([^"]+)"/, valAttr: /(?<![-a-z])alt="([^"]*)"/, name: 'alt' }
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
checkAttrPairs('tools/scene-transition', 'tools/scene-transition/index.html', ['tools/scene-transition/i18n.scene-transition.js'], 10);
checkAttrPairs('tools/message-box', 'tools/message-box/index.html', ['tools/message-box/i18n.message-box.js'], 30);
checkAttrPairs('tools/scenario-editor', 'tools/scenario-editor/index.html', ['tools/scenario-editor/i18n.scenario-editor.js'], 68);
checkAttrPairs('tools/obs-tachie', 'tools/obs-tachie/index.html', ['tools/obs-tachie/i18n.obs-tachie.js'], 1);
for (const name of KUMA_TOOLS) checkAttrPairs(`tools/${name}`, `tools/${name}/index.html`, [`tools/${name}/i18n.${name}.js`], KUMA[name].attrs);
checkAttrPairs('tools/status-bar', 'tools/status-bar/index.html', ['tools/status-bar/i18n.status-bar.js'], 4);
checkAttrPairs('tools/chat-window', 'tools/chat-window/index.html', ['tools/chat-window/i18n.chat-window.js'], 15);
checkAttrPairs('tools/portrait-size', 'tools/portrait-size/index.html', ['tools/portrait-size/i18n.portrait-size.js'], 2);
checkAttrPairs('tools/height-board', 'tools/height-board/index.html', ['tools/height-board/i18n.height-board.js'], 20);
checkAttrPairs('tools/ccfolia-cropper', 'tools/ccfolia-cropper/index.html', ['tools/ccfolia-cropper/i18n.ccfolia-cropper.js'], 1);
checkAttrPairs('tools/cutin', 'tools/cutin/index.html', ['tools/cutin/i18n.cutin.js'], 1);
checkAttrPairs('tools/character-select', 'tools/character-select/index.html', ['tools/character-select/i18n.character-select.js'], 15);
checkAttrPairs('tools/character-editor', 'tools/character-editor/index.html', ['tools/character-editor/i18n.character-editor.js'], 1);
checkAttrPairs('tools/room-zip', 'tools/room-zip/index.html', ['tools/room-zip/i18n.room-zip.js'], 10);
checkAttrPairs('tools/pair-maker', 'tools/pair-maker/index.html', ['tools/pair-maker/i18n.pair-maker.js'], 9);
checkAttrPairs('tools/pair-maker editor', 'tools/pair-maker/editor.html', ['tools/pair-maker/i18n.pair-maker.js'], 6);
checkAttrPairs('tools/anime-rig', 'tools/anime-rig/index.html', ['tools/anime-rig/i18n.anime-rig.js'], 24);
for (const t of SOTSOT_FOUR) {
  checkAttrPairs(t.dir, `${t.dir}/index.html`, [`${t.dir}/${t.dict}`], t.attrs);
}
for (const page of LAB_PAGES) {
  checkAttrPairs(`${LAB}/${page.html}`, `${LAB}/${page.html}`, labDicts(page), page.attrs);
}

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
  '586b273', '9866858', 'dab4fb9', '7e9c70d', 'f149b4e', '883f48b', 'e1111d4', '549364f', '05f6331', 'fc05c98',
  '90f8442', 'a9a522c', 'aad63b1', '9c29866', 'c4aca96', '42c45f3', 'a6387e0',
  '75840e6', '8b1b1e2', '9fe67a6', '3aa7de8', 'd39f79e', '1b48bea', '7ddbd99', '772d6c4']) {
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
/* room-zip 拆掉了上游的 DEMO 外層，又刻意留下幾類日文資料，這些取捨要寫下來
 * 才查得到；只檢查有沒有 room-zip 這幾個字沒有意義，所以挑關鍵字。 */
check('ATTRIBUTION.md 說明 room-zip 移除了什麼',
  /room-zip[\s\S]{0,2000}loadSample\(\)/.test(attribution)
  && attribution.includes('通常ビルドには同封しない'));
check('ATTRIBUTION.md 說明 room-zip 為何保留日文資料',
  ['{検索ワード}', 'KPDEF', 'roleName()'].every(k => attribution.includes(k)));
check('ATTRIBUTION.md 說明 room-zip 的第三方函式庫',
  attribution.includes('tools/room-zip/THIRD_PARTY_NOTICES.md'));
/* pair-maker 不收上游的作品集樣張，也拆掉了存取分析與 Google 表單；
 * 這些取捨要寫下來才查得到，所以挑關鍵字而不是只看有沒有 pair-maker 幾個字。 */
check('ATTRIBUTION.md 說明 pair-maker 為何不收作品集樣張',
  /pair-maker[\s\S]{0,2500}作品集樣張/.test(attribution) && attribution.includes('justifiedGallery'));
check('ATTRIBUTION.md 說明 pair-maker 移除了存取分析與表單',
  ['static.cloudflareinsights.com', 'Google 表單'].every(k => attribution.includes(k)));
check('ATTRIBUTION.md 說明 pair-maker 的第三方函式庫',
  attribution.includes('tools/pair-maker/THIRD_PARTY_NOTICES.md'));
check('ATTRIBUTION.md 說明 pair-maker 為何保留原作者署名', attribution.includes('배고픔'));
check('ATTRIBUTION.md 說明版型常數為何要寫成函式',
  /pair-maker[\s\S]*ES module 只求值一次/.test(attribution) && attribution.includes('fontLabels'));
/* 四個新工具的函式庫沒有同捆，理由與出處要寫下來才查得到。 */
check('ATTRIBUTION.md 說明四個工具的函式庫為何走 CDN',
  /sotsotssi 的四個角色美術周邊工具[\s\S]{0,2500}沒有改成同捆/.test(attribution));
check('ATTRIBUTION.md 說明 acrylic-goods 的浮水印為何保留',
  attribution.includes('watermark') && /浮水印[\s\S]{0,300}@bb_uu_t/.test(attribution));
for (const dir of ['color-palette', 'acrylic-goods', 'video-anim', 'gif-combiner']) {
  check(`ATTRIBUTION.md 記載 ${dir} 的上游`, new RegExp(`\\| ${dir} \\| \\[sotsotssi/`).test(attribution));
}

check('ATTRIBUTION.md 說明哪些字刻意不跟著語言走',
  attribution.includes('initialState()') && /initialState\(\)[\s\S]{0,400}room-zip/.test(attribution));

/* cutin 需要建置，說明其原始碼位置與重建方式。 */
check('ATTRIBUTION.md 說明 cutin 的建置流程',
  attribution.includes('vendor/cutin-maker'));
check('README.md 說明三個工具的建置流程',
  ['vendor/cutin-maker', 'vendor/ccfolia-character-editor', 'vendor/obs-tachie-generator'].every(p => read('README.md').includes(p)));
/* ATTRIBUTION 與 README 之間的錨點連結：標題改了就會失效。 */
check('ATTRIBUTION.md 指向 README 建置段落的錨點仍然有效',
  attribution.includes('README.md#重新建置-cutincharacter-editor-與-obs-tachie')
  && read('README.md').includes('### 重新建置 cutin、character-editor 與 obs-tachie'));
check('README 指向 pcfonts 段落的錨點仍然有效',
  read('README.md').includes('ATTRIBUTION.md#五個工具共用的-pcfontsv1js')
  && attribution.includes('## 五個工具共用的 pcfonts.v1.js'));
check('ATTRIBUTION.md 說明 message-box 保留的 CCFOLIA 日文',
  /## message-box：同樣保留 CCFOLIA 畫面上的日文(?=[\s\S]*シークレットダイス)/.test(attribution));
check('ATTRIBUTION.md 說明 jizura 改為連到原作者網站的官方繁中版',
  /## jizura：JIZURA 字面（連到原站）(?=[\s\S]*Zaious)(?=[\s\S]*zh-hant\/)/.test(attribution));
check('ATTRIBUTION.md 說明 coc-typesetter 的來源、未授權與只收繁中',
  /\| coc-typesetter \| \[scenario-tool-jade\.vercel\.app\]\([^)]+\)（作者不明[^|]*\| 2026-09-26 取得 \| \*\*未授權\*\* \|/.test(attribution)
  && attribution.includes('## 未授權的十五個工具') && /## coc-typesetter：CoC 劇本排版工具(?=[\s\S]*===換頁===)(?=[\s\S]*不存在的四樓)/.test(attribution));
check('README.md 把 coc-typesetter 與 apng-wipe 列為未授權', /`coc-typesetter` 與 `apng-wipe` 則連作者都不明/.test(read('README.md')));
check('ATTRIBUTION.md 說明 apng-wipe 的來源不明、未授權與副檔名的改動',
  /\| apng-wipe \| 作者與來源都不明[^|]*\| 2026-09-26 取得 \| \*\*未授權\*\* \|/.test(attribution)
  && /## apng-wipe：輕量轉場 APNG 產生器(?=[\s\S]*`\.apng` 改成 `\.png`)/.test(attribution));
check('ATTRIBUTION.md 說明 anime-rig 不收範例 PSD、OBS 中繼伺服器與 MediaPipe 同捆檔',
  /## anime-rig：Anime2\.5DRig[\s\S]*sample\.psd[\s\S]*obs_server\.py/.test(attribution)
  && /## anime-rig[\s\S]*lib\/vendor\/face_mesh/.test(attribution));

const pkg = JSON.parse(read('package.json'));
check('package.json 無執行期相依',
  !pkg.dependencies && !pkg.devDependencies);

process.exit(summary() ? 1 : 0);
