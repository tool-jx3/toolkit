/* 靜態 smoke 檢查。以 `npm test` 執行。 */
import { check, section, summary, loadI18N, read, exists } from './harness.mjs';

/* ---- 引擎行為 ---- */
section('i18n engine');
const I18N = loadI18N();

check('預設語言為 zh-TW', I18N.locale === 'zh-TW', `got: ${I18N.locale}`);
check('註冊了 zh-TW 與 ko 兩種語言',
  Object.keys(I18N.locales).join(',') === 'zh-TW,ko',
  `got: ${Object.keys(I18N.locales).join(',')}`);
check('每種語言都有顯示名稱與 lang 屬性',
  Object.values(I18N.locales).every(m => m.label && m.lang));
check('初始字典為空', Object.keys(I18N.messages['zh-TW']).length === 0);

I18N.register({ 'zh-TW': { greet: '你好 {0}', only: '僅繁中' }, ko: { greet: '안녕 {0}' } });
check('register() 併入 zh-TW', I18N.t('greet') === '你好 {0}');
check('t() 代入位置參數', I18N.t('greet', '世界') === '你好 世界');
check('未知 key 回傳 key 本身', I18N.t('no.such.key') === 'no.such.key');

check('setLocale() 切換成功', I18N.setLocale('ko') === true);
check('切換後查得 ko 值', I18N.t('greet', '세계') === '안녕 세계');
check('ko 缺 key 時退回 zh-TW', I18N.t('only') === '僅繁中');
check('切換至相同語言回傳 false', I18N.setLocale('ko') === false);
check('切換至未知語言回傳 false', I18N.setLocale('en') === false);

let notified = null;
I18N.onChange(locale => { notified = locale; });
I18N.setLocale('zh-TW');
check('onChange 監聽器收到通知', notified === 'zh-TW', `got: ${notified}`);

I18N.register({ 'zh-TW': { second: '第二份' } });
check('register() 可多次呼叫且不覆蓋既有內容',
  I18N.t('second') === '第二份' && I18N.t('greet') === '你好 {0}');

/* ---- 各工具共用檢查 ---- */
const HANGUL = /[가-힣]/;

/* dir: 'tools/magic-circle'；dict: 字典檔名；
 * scripts: 需掃描的 JS 檔名陣列；styles: 需掃描韓文洩漏的 CSS 檔名陣列
 * （不檢查 T() key 引用，CSS 本來就不會呼叫 T()）；
 * minHooks: 標記中 i18n 掛勾的最低數量；
 * allowHangul(line, lineNo, file): 回傳 true 表示該行允許出現韓文。 */
function checkTool({ dir, dict, scripts, styles = [], minHooks, allowHangul = () => false, licence = true }) {
  section(dir);
  const tool = loadI18N([`${dir}/${dict}`]);
  const zh = new Set(Object.keys(tool.messages['zh-TW']));
  const ko = new Set(Object.keys(tool.messages.ko));

  check('僅註冊 zh-TW 與 ko 兩種語言',
    Object.keys(tool.messages).join(',') === 'zh-TW,ko',
    `got: ${Object.keys(tool.messages).join(',')}`);

  check('字典非空', zh.size > 0, `zh-TW keys: ${zh.size}`);
  check('定義了 app.title', zh.has('app.title'));

  const missingKo = [...zh].filter(k => !ko.has(k));
  const extraKo = [...ko].filter(k => !zh.has(k));
  check('ko 涵蓋所有 zh-TW key', missingKo.length === 0, `missing: ${missingKo.join(', ')}`);
  check('ko 無多餘 key', extraKo.length === 0, `unknown: ${extraKo.join(', ')}`);

  const ph = v => [...new Set(String(v).match(/\{\d+\}/g) || [])].sort().join(',');
  const badPh = [...zh].filter(k => ph(tool.messages['zh-TW'][k]) !== ph(tool.messages.ko[k] ?? ''));
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
    .filter(([n, line]) => HANGUL.test(line) && !allowHangul(line, n, file));
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
    check(`${file} 無殘留韓文`, leaked.length === 0, report(leaked));
  }

  const htmlLeaked = leakedIn(html, 'index.html');
  check('index.html 無殘留韓文', htmlLeaked.length === 0, report(htmlLeaked));

  for (const file of styles) {
    const src = read(`${dir}/${file}`);
    const leaked = leakedIn(src, file);
    check(`${file} 無殘留韓文`, leaked.length === 0, report(leaked));
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
  allowHangul: (line, lineNo, file) => {
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
    return /a-zA-Z0-9가-힣/.test(line);
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
  allowHangul: (line, n, file) => file === 'app.js' && emLineAllowsHangul(line)
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

/* 五個工具連結都要指得到。 */
const TOOLS = ['magic-circle', 'typewriter', 'text-path', 'collage-letter', 'emotion-maker'];
for (const name of TOOLS) {
  check(`連結 tools/${name}/ 有效`,
    homeHtml.includes(`tools/${name}/`) && exists(`tools/${name}/index.html`));
}

check('首頁標示 emotion-maker 的未授權狀態',
  homeZh.has('license.unlicensed') && homeHtml.includes('license.unlicensed'));
check('首頁標示原作者出處', homeHtml.includes('github.com/sotsotssi'));

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
for (const sha of ['de40a68', 'cf3ff36', 'b86cd28', 'ea08333', 'b455379', '772d6c4']) {
  check(`ATTRIBUTION.md 記載來源 commit ${sha}`, attribution.includes(sha));
}
check('ATTRIBUTION.md 標明 emotion-maker 未授權',
  /emotion-maker[\s\S]{0,600}(未授權|無授權)/.test(attribution));

const pkg = JSON.parse(read('package.json'));
check('package.json 無執行期相依',
  !pkg.dependencies && !pkg.devDependencies);

process.exit(summary() ? 1 : 0);
