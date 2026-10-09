/* 靜態 smoke 檢查。以 `npm test` 執行。
 * 全站已改寫到 web/ 新框架（P10）：repo 裡只剩新框架的程式、文件與舊網址的轉址頁。
 * 新框架本身的檢查在 web/（lint、typecheck、單元測試、端對端測試）；這裡檢查 repo 的組成與文件。 */
import { check, section, summary, read, exists, listFiles } from './harness.mjs';

/* 日文只查平假名與片假名「字母」（漢字與中文重疊，不能當判準）。 */
const KANA = /[ぁ-ゖァ-ヺｦ-ﾝ]/;
const stripHtmlComments = src => src.replace(/<!--[\s\S]*?-->/g, '');

/* 轉址頁：繁中、不讓搜尋引擎收錄、meta refresh 與 location.replace 都指到同一個新網址、沒有外部程式。 */
function checkRedirect(file, target, { keepSearch = false } = {}) {
  const html = read(file);
  const js = keepSearch ? `location.replace('${target}' + location.search + location.hash)`
    : target.includes('#') || target.endsWith('.md') ? `location.replace('${target}')`
      : `location.replace('${target}' + location.hash)`;
  check(`${file} 轉到 ${target}`,
    /<html lang="zh-Hant-TW">/.test(html) && html.includes('<meta name="robots" content="noindex">')
    && html.includes(`<meta http-equiv="refresh" content="0; url=${target}">`) && html.includes(js)
    && html.includes(`href="${target}"`) && !/<script[^>]+src=/.test(html) && !KANA.test(stripHtmlComments(html)));
}

/* ---- TRPG 實驗室：舊網址的轉址頁 ---- */
/* 違法建築的 TRPG 實驗室已拆成六個新工具（G9、G10）。舊版的程式、樣式、字典與素材都刪了（舊版在 main commit
 * 6b497bd），每個舊網址留一個轉址頁；舊版存在瀏覽器裡的資料（同一個網域）由新版第一次開啟時讀進來。 */
section('tools/trpg-lab（轉址頁）');
const LAB = 'tools/trpg-lab';
const LAB_REDIRECTS = {
  'index.html': '../../#group-G9',
  'coc7_dice.html': '../coc-dice/', 'damage_sum.html': '../coc-dice/', 'coc_npc_token.html': '../coc-npc/',
  'coc7_Investigator_sheet.html': '../coc-sheet/',
  'grid_maker.html': '../grid-maker/', 'hex_maker.html': '../grid-maker/',
  'grid_ruler.html': '../range-ruler/', 'hex_ruler.html': '../range-ruler/',
  'third-party-licenses.html': '../../assets/build/THIRD_PARTY_NOTICES.md',
  'trpg_map_maker/map_list.html': '../../map-editor/',
};
for (const [page, target] of Object.entries(LAB_REDIRECTS)) checkRedirect(`${LAB}/${page}`, target);
/* 地圖編輯器的網址帶著 ?id=（地圖的 id；搬過來的地圖 id 不變）。 */
checkRedirect(`${LAB}/trpg_map_maker/map_editor.html`, '../../map-editor/', { keepSearch: true });
const labPages = [...Object.keys(LAB_REDIRECTS), 'trpg_map_maker/map_editor.html'].map(p => `${LAB}/${p}`).sort();
check('tools/trpg-lab 只剩轉址頁（舊版的程式、樣式、字典、素材與授權檔都刪了）',
  listFiles(LAB).join(',') === labPages.join(','), listFiles(LAB).filter(f => !labPages.includes(f)).join(', '));

/* ---- jizura ---- */
/* JIZURA 的原作者已提供官方繁中版（社群貢獻，上游 PR #6），合輯不收錄副本，首頁直接連到原站。
 * tools/jizura/ 只剩舊網址的轉址頁：依以前的語言設定跳到原站的對應版本，沒有 JavaScript 時導到繁中版。 */
section('tools/jizura（轉址頁）');
const JZ_BASE = 'https://852wa.github.io/JIZURA/';
const jzPage = read('tools/jizura/index.html');
check('不收錄 JIZURA 的副本', !exists('vendor/jizura')
  && listFiles('tools/jizura').join(',') === 'tools/jizura/index.html,tools/jizura/ja/index.html');
check('轉址頁依以前的語言設定選原站版本', jzPage.includes("localStorage.getItem('trpg-toolkit-locale')")
  && jzPage.includes(`var BASE = '${JZ_BASE}';`)
  && jzPage.includes("var EDITION = { 'ja': '', 'ko': 'ko/', 'zh-TW': 'zh-hant/' };"));
check('沒有 JavaScript 時導到原站的繁中版', jzPage.includes(`<meta http-equiv="refresh" content="0; url=${JZ_BASE}zh-hant/">`));
check('轉址頁附上三種語言的手動連結與回合輯首頁的連結',
  [`${JZ_BASE}zh-hant/`, `${JZ_BASE}"`, `${JZ_BASE}ko/`].every(u => jzPage.includes(`href="${u.replace(/"$/, '')}"`))
  && jzPage.includes('<a class="back" href="../../">← TRPG Toolkit</a>')
  && !KANA.test(stripHtmlComments(jzPage).replace(/<a [^>]*lang="ja"[^>]*>[^<]*<\/a>/, '')));
check('舊的日文頁網址導到原站的日文版', read('tools/jizura/ja/index.html').includes(`location.replace('${JZ_BASE}')`));

/* ---- repo 的組成 ---- */
/* 網站由 web/ 建置在 web/dist/，CI（.github/workflows/deploy.yml）推到 gh-pages 分支發布；repo 裡不放建置產物。
 * 首頁的內容與連結由 web/tests/e2e/home.spec.ts 檢查。 */
section('repo 的組成');
check('repo 裡沒有建置產物（首頁、assets/build、next、.nojekyll）',
  !exists('index.html') && !exists('assets/build') && !exists('next') && !exists('.nojekyll'));
const deployYml = exists('.github/workflows/deploy.yml') ? read('.github/workflows/deploy.yml') : '';
check('CI 建置並推到 gh-pages', deployYml.includes('npm run build') && /push[^\n]*gh-pages/.test(deployYml));
const buildPlugins = read('web/build/plugins.ts');
check('建置時產生 THIRD_PARTY_NOTICES 與 .nojekyll', buildPlugins.includes("'THIRD_PARTY_NOTICES.md'") && buildPlugins.includes("'.nojekyll'"));
check('網站只照原樣複製轉址頁（tools/trpg-lab、tools/jizura）',
  /const STATIC_PATHS = \['tools\/trpg-lab', 'tools\/jizura'\];/.test(read('web/vite.config.ts')));
const homeSrc = read('web/src/index.html');
check('首頁的原始檔只有繁中', /<html lang="zh-Hant-TW">/.test(homeSrc) && !homeSrc.includes('assets/i18n.js'));
/* 舊的語言切換引擎與字典（assets/i18n.js、各工具的 i18n.*.js）、舊版首頁都已刪除。 */
const repoTools = listFiles('tools');
check('舊的語言切換引擎、字典與舊版首頁都已刪除',
  !exists('assets') && !repoTools.some(f => /\/i18n\.[^/]*\.js$/.test(f)));
check('tools/ 只剩轉址頁（HTML）', repoTools.every(f => f.endsWith('.html')), repoTools.filter(f => !f.endsWith('.html')).join(', '));
check('不再收錄需要建置的上游專案（vendor/）', !exists('vendor'));
/* 首頁列出的舊版工具（還沒重寫完）連結要指得到；全部重寫完時清單是空的。 */
const homeEntriesSrc = read('web/src/home/entries.ts');
const LEGACY_LINKS = [...homeEntriesSrc.split('export const EXTERNAL')[0].matchAll(/href: '\.\/tools\/([^/]+)\/'/g)].map(m => m[1]);
for (const name of LEGACY_LINKS) check(`首頁的舊版工具 tools/${name}/ 存在`, exists(`tools/${name}/index.html`));
check('首頁沒有列出已經刪掉的 TRPG 實驗室舊版', !LEGACY_LINKS.includes('trpg-lab'));

/* ---- 重寫上線的工具（web/ 新框架）---- */
/* 依 docs/refactor 的流程重寫、對等驗證後上線的工具：程式在 web/src/tools/<id>/，建置後在網站的 tools/<id>/。
 * 清單從 web/src/registry.ts 讀。 */
section('重寫上線的工具');
const registrySrc = read('web/src/registry.ts');
const registryEntries = registrySrc.split(/\n  \{\n/).slice(1).map(block => ({
  id: (block.match(/id: '([^']+)'/) || [])[1],
  live: /status: 'live'/.test(block)
}));
const REWRITTEN = registryEntries.filter(e => e.live).map(e => e.id);
check('registry 解析出已上線的工具', REWRITTEN.length >= 40, REWRITTEN.join(', '));
const readme = read('README.md');
const attribution = read('ATTRIBUTION.md');
for (const id of REWRITTEN) {
  check(`repo 裡沒有 tools/${id}/（舊版已刪、建置產物不提交）`, !exists(`tools/${id}`));
  const page = read(`web/src/tools/${id}/index.html`);
  check(`web/src/tools/${id}/index.html 只有繁中（沒有 i18n 引擎）`, /<html lang="zh-Hant-TW">/.test(page) && !page.includes('assets/i18n.js'));
  check(`web/src/tools/${id}/ 有原始碼與 strings.ts`, exists(`web/src/tools/${id}/App.tsx`) && exists(`web/src/tools/${id}/strings.ts`));
  check(`docs/refactor/specs/${id}.md 有對等驗證紀錄`, /## 6\. 對等驗證紀錄[\s\S]*\| F0*1 \| (?:✅|⚠️|通過)/.test(read(`docs/refactor/specs/${id}.md`)));
  check(`README.md 把 ${id} 列在重寫的工具`, new RegExp(`\\| \`${id}\` \\|`).test(readme.split('## 本站重寫的工具')[1] || ''));
  check(`ATTRIBUTION.md 把 ${id} 列在靈感來源`, new RegExp(`\\| \`${id}\` \\|`).test(attribution.split('## 本站重寫的工具（靈感來源）')[1] || ''));
}

/* ---- 文件 ---- */
section('docs');
check('ATTRIBUTION.md、README.md、LICENSE 存在', exists('ATTRIBUTION.md') && exists('README.md') && exists('LICENSE'));
const licence = read('LICENSE');
check('LICENSE 涵蓋整個 repo（web/ 新框架、無塵室開發的 text-fx、文件、測試、轉址頁）',
  licence.includes('`web/` framework') && licence.includes('text-fx') && licence.includes('redirect pages'));
/* 收錄過副本的上游 commit 留在 ATTRIBUTION（舊版的出處）。 */
for (const sha of ['d39f79e', '1b48bea', '7ddbd99']) {
  check(`ATTRIBUTION.md 記載上游的 commit ${sha}`, attribution.includes(sha));
}
check('ATTRIBUTION.md 說明 jizura 連到原作者網站的官方繁中版',
  /## jizura：JIZURA 字面（連到原站）(?=[\s\S]*Zaious)(?=[\s\S]*zh-hant\/)/.test(attribution));
check('ATTRIBUTION.md 說明 TRPG 實驗室的作者保留權利的素材不收',
  /間取り図[\s\S]*dice_sound\.wav/.test(attribution));
check('README.md 沒有語言切換的說明（只有繁體中文）', !readme.includes('## 語言') && !readme.includes('trpg-toolkit-locale'));

const pkg = JSON.parse(read('package.json'));
check('package.json 無執行期相依', !pkg.dependencies && !pkg.devDependencies);

process.exit(summary() ? 1 : 0);
