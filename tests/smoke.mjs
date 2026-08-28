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
 * scripts: 需掃描的 JS 檔名陣列；minHooks: 標記中 i18n 掛勾的最低數量；
 * allowHangul(line, lineNo, file): 回傳 true 表示該行允許出現韓文。 */
function checkTool({ dir, dict, scripts, minHooks, allowHangul = () => false, licence = true }) {
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

  /* emotion-maker 無原始 LICENSE，該工具傳入 licence: false。 */
  if (licence) check('保留原始 LICENSE', exists(`${dir}/LICENSE`));
  return tool;
}

/* ---- magic-circle ---- */
const mc = checkTool({
  dir: 'tools/magic-circle',
  dict: 'i18n.magic-circle.js',
  scripts: ['app.js'],
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
/* emotion-maker 的韓文為資料 ID，非顯示文字：MANIFEST 的 id、
 * PRESETS 的部件引用、以及結構常數。tag 已改為 i18n key，不在白名單內。
 * "피부"/"얼굴 틀"（膚色／臉型的 base id）在 MANIFEST 之外，仍以字面值出現於
 * layerSrcs()／drawFace() 兩處（baseSrc("피부") 與 IMG.base["얼굴 틀"] 等），
 * 故另外加入白名單，涵蓋這兩處合法的資料參照。 */
const EM_ID_LINE = /\bid:\s*"[^"]*"|"눈"|"눈썹"|"입"|"꾸밈"|"피부"|"얼굴 틀"|\bCATS\b|\bSINGLE\b|\bDECO\b|\bDRAW_SINGLE\b|\bcustomParts\b|\bnewDraft\b/;

const em = checkTool({
  dir: 'tools/emotion-maker',
  dict: 'i18n.emotion-maker.js',
  scripts: ['app.js'],
  minHooks: 40,
  licence: false,
  allowHangul: (line, n, file) => file === 'app.js' && EM_ID_LINE.test(line)
});

/* emotion-maker 無原始 LICENSE，checkTool 的該項檢查會失敗；
 * 以 ATTRIBUTION.md 標示取代（見 Task 8）。此處單獨確認其確實沒有。 */
section('tools/emotion-maker licence');
check('emotion-maker 無原始 LICENSE（未授權，於 ATTRIBUTION.md 標示）',
  !exists('tools/emotion-maker/LICENSE'));

/* 資產完整性：MANIFEST 每個 file 對應的 PNG 必須存在。 */
section('tools/emotion-maker assets');
const emApp = read('tools/emotion-maker/app.js');
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

/* 五個工具連結都要指得到。 */
const TOOLS = ['magic-circle', 'typewriter', 'text-path', 'collage-letter', 'emotion-maker'];
for (const name of TOOLS) {
  check(`連結 tools/${name}/ 有效`,
    homeHtml.includes(`tools/${name}/`) && exists(`tools/${name}/index.html`));
}

check('首頁標示 emotion-maker 的未授權狀態',
  homeZh.has('license.unlicensed') && homeHtml.includes('license.unlicensed'));
check('首頁標示原作者出處', homeHtml.includes('github.com/sotsotssi'));

process.exit(summary() ? 1 : 0);
