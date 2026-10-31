/**
 * 建置用的 Vite 外掛。
 *
 * - toolkitHtml：每個工具頁共用的 <head>（字型、配色、主題初始化）。
 * - collectNotices：記下實際打包進去的 npm 套件，用來產生 THIRD_PARTY_NOTICES.md。
 * - assembleSite：把 web/dist 整理成整個網站（index.html、tools/<id>/、next/<id>/、assets/build/、舊網址的轉址頁）。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { copyFile, mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { getTool, outputDir, type ToolEntry } from '../src/registry.ts';

const FONT_CSS =
  'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&display=swap';

/** 主題初始化：在第一次繪製前套用使用者選的深／淺色，避免閃爍。 */
const THEME_INIT =
  "try{var t=localStorage.getItem('trpg-toolkit:theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}";

/** 首頁（web/src/index.html）在 Vite 裡的路徑 */
const HOME_PAGE = '/index.html';

export function toolkitHtml(): Plugin {
  return {
    name: 'toolkit-html',
    transformIndexHtml: {
      order: 'pre',
      handler(_html, ctx) {
        /* 重寫中（next）的頁面不讓搜尋引擎收錄；上線（live）後拿掉。首頁一律收錄。 */
        const id = /\/tools\/([^/]+)\/index\.html$/.exec(ctx.path)?.[1];
        const live = ctx.path === HOME_PAGE || (id ? getTool(id)?.status === 'live' : false);
        return [
          ...(live
            ? []
            : [
                {
                  tag: 'meta',
                  attrs: { name: 'robots', content: 'noindex' },
                  injectTo: 'head' as const,
                },
              ]),
          { tag: 'meta', attrs: { name: 'color-scheme', content: 'dark light' }, injectTo: 'head' },
          { tag: 'script', children: THEME_INIT, injectTo: 'head' },
          {
            tag: 'link',
            attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
            injectTo: 'head',
          },
          {
            tag: 'link',
            attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
            injectTo: 'head',
          },
          { tag: 'link', attrs: { rel: 'stylesheet', href: FONT_CSS }, injectTo: 'head' },
        ];
      },
    },
  };
}

/* ---------- 第三方授權清單 ---------- */

const bundledPackages = new Set<string>();
/**
 * 本站附帶的第三方檔案（例如 `core/fonts/files/<資料夾>/` 的字型）：被打包進去的檔案所在的資料夾有 `meta.json`
 * （`{ name, version, license, copyright?, url }`）與 `LICENSE.txt`（授權全文）時，列進通知檔。
 */
const bundledAssetDirs = new Set<string>();
const ASSET_META = 'meta.json';
const ASSET_LICENSE = 'LICENSE.txt';

function assetDirOf(id: string): string | null {
  const file = id.replace(/\\/g, '/').replace(/[?#].*$/, '');
  if (file.includes('/node_modules/') || !path.isAbsolute(file)) return null;
  const dir = path.dirname(file);
  return existsSync(path.join(dir, ASSET_META)) && existsSync(path.join(dir, ASSET_LICENSE))
    ? dir
    : null;
}

function packageDirOf(id: string): string | null {
  const norm = id.replace(/\\/g, '/');
  const idx = norm.lastIndexOf('/node_modules/');
  if (idx < 0) return null;
  const rest = norm.slice(idx + '/node_modules/'.length).split('/');
  const name = rest[0]?.startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0];
  if (!name) return null;
  return `${norm.slice(0, idx)}/node_modules/${name}`;
}

/** 主程式與 Worker 的建置都要掛上這個外掛，兩邊的套件才會都記到。 */
export function collectNotices(): Plugin {
  return {
    name: 'toolkit-collect-notices',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const item of Object.values(bundle)) {
        if (item.type !== 'chunk') continue;
        for (const id of item.moduleIds) {
          const dir = packageDirOf(id);
          if (dir) bundledPackages.add(dir);
          const asset = assetDirOf(id);
          if (asset) bundledAssetDirs.add(asset);
        }
      }
    },
  };
}

/**
 * 授權全文的補充（檔名＝套件名，scope 的「/」換成「__」）：
 * - 套件沒有附授權檔時，用這個檔當授權全文（例如 onnxruntime-web）；
 * - 套件附的授權檔不是授權全文時（例如 @breezystack/lamejs 只有一段 LAME 的說明），接在套件的授權檔後面
 *   （授權全文、原始碼的出處）。
 */
const SUPPLEMENTARY_LICENSES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'licenses');

/** 讀授權檔：換行一律 LF（有些套件的授權檔是 CRLF），去掉前後空白 */
function readText(file: string): string {
  return readFileSync(file, 'utf8').replace(/\r\n?/g, '\n').trim();
}

/** 參考 MIT、CC0、BSD-3-Clause 等開放授權的原作改寫的工具：原作的授權全文放在 `web/src/tools/<id>/UPSTREAM_LICENSE`，建置時併入通知檔。 */
const UPSTREAM_LICENSE = 'UPSTREAM_LICENSE';
/**
 * 參考了好幾個原作的工具：`web/src/tools/<id>/UPSTREAM_SOURCES.json`（`[{ "name", "url"? }]`）列出全部原作，
 * 通知檔的標題照這個寫（頁尾的靈感來源仍是 registry 的 inspiration）。沒有這個檔時標題用 inspiration。
 */
const UPSTREAM_SOURCES = 'UPSTREAM_SOURCES.json';

const sourceLink = (s: { name: string; url?: string }) =>
  s.url ? `[${s.name}](${s.url})` : s.name;

function upstreamNotices(tools: readonly ToolEntry[], srcToolsDir: string): string[] {
  const out: string[] = [];
  for (const tool of tools) {
    const file = path.join(srcToolsDir, tool.id, UPSTREAM_LICENSE);
    if (!existsSync(file)) continue;
    const body = readText(file);
    const sourcesFile = path.join(srcToolsDir, tool.id, UPSTREAM_SOURCES);
    const sources = existsSync(sourcesFile)
      ? (JSON.parse(readFileSync(sourcesFile, 'utf8')) as { name: string; url?: string }[])
      : null;
    const source = sources?.length
      ? sources.map(sourceLink).join('、')
      : tool.inspiration
        ? sourceLink(tool.inspiration)
        : '（未標示）';
    out.push(`### ${tool.id}（原作：${source}）\n\n\`\`\`\n${body}\n\`\`\``);
  }
  return out;
}

/** 本站附帶的第三方檔案（字型等）：表格的列與授權全文 */
function assetNotices(): { rows: string[]; texts: string[] } {
  const rows: string[] = [];
  const texts: string[] = [];
  for (const dir of [...bundledAssetDirs].sort()) {
    const meta = JSON.parse(readFileSync(path.join(dir, ASSET_META), 'utf8')) as {
      name: string;
      version?: string;
      license?: string;
      copyright?: string;
      url?: string;
    };
    rows.push(
      `| ${meta.name} | ${meta.version ?? ''} | ${meta.license ?? '（未標示）'} | ${meta.url ?? ''} |`,
    );
    const body = readText(path.join(dir, ASSET_LICENSE));
    const head = meta.copyright ? `${meta.copyright}\n\n` : '';
    texts.push(`### ${meta.name}\n\n\`\`\`\n${head}${body}\n\`\`\``);
  }
  return { rows, texts };
}

function noticesMarkdown(tools: readonly ToolEntry[] = [], srcToolsDir = ''): string {
  const rows: string[] = [];
  const texts: string[] = [];
  const seen = new Set<string>();
  for (const dir of [...bundledPackages].sort()) {
    const pkgFile = path.join(dir, 'package.json');
    if (!existsSync(pkgFile)) continue;
    const pkg = JSON.parse(readFileSync(pkgFile, 'utf8')) as {
      name: string;
      version: string;
      license?: string;
      homepage?: string;
      repository?: string | { url?: string };
    };
    const key = `${pkg.name}@${pkg.version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
    const url = (pkg.homepage || repo || '').replace(/^git\+/, '');
    rows.push(`| ${pkg.name} | ${pkg.version} | ${pkg.license ?? '（未標示）'} | ${url} |`);
    const licenseFile = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f));
    const extra = path.join(SUPPLEMENTARY_LICENSES, `${pkg.name.replace('/', '__')}.txt`);
    if (licenseFile) {
      const body = readText(path.join(dir, licenseFile));
      /* 套件的授權檔只是一段說明：build/licenses/<套件名>.txt 補上授權全文與原始碼的出處 */
      const more = existsSync(extra)
        ? `\n\n（套件附的授權檔只有上面這段；以下補上授權全文與原始碼的出處）\n\n\`\`\`\n${readText(extra)}\n\`\`\``
        : '';
      texts.push(`### ${key}\n\n\`\`\`\n${body}\n\`\`\`${more}`);
    } else {
      /* 套件沒有附授權檔（例如 onnxruntime-web）：用 build/licenses/<套件名>.txt 補上上游 repo 的授權全文 */
      if (existsSync(extra)) {
        const body = readText(extra);
        texts.push(
          `### ${key}（套件沒有附授權檔，以下為上游 repo 的授權全文）\n\n\`\`\`\n${body}\n\`\`\``,
        );
      }
    }
  }
  return [
    '# 第三方授權（THIRD_PARTY_NOTICES）',
    '',
    '本檔由 `web/` 建置時自動產生，列出打包進 `assets/build/` 的 npm 套件與其授權全文。請勿手動編輯。',
    '',
    '| 套件 | 版本 | 授權 | 網址 |',
    '|---|---|---|---|',
    ...rows,
    '',
    '## 授權全文',
    '',
    ...texts,
    '',
    ...(() => {
      const assets = assetNotices();
      return assets.rows.length
        ? [
            '## 本站附帶的字型與素材',
            '',
            '下列檔案隨網站一起提供（不從 CDN 載入），依其授權保留著作權聲明與授權全文。',
            '',
            '| 名稱 | 版本 | 授權 | 網址 |',
            '|---|---|---|---|',
            ...assets.rows,
            '',
            ...assets.texts,
            '',
          ]
        : [];
    })(),
    ...(() => {
      const upstream = srcToolsDir ? upstreamNotices(tools, srcToolsDir) : [];
      return upstream.length
        ? [
            '## 參考原作程式改寫的工具',
            '',
            '下列工具參考原作（MIT、CC0、BSD-3-Clause 等開放授權）的程式改寫，依原作授權保留其著作權聲明與授權全文。',
            '',
            ...upstream,
            '',
          ]
        : [];
    })(),
  ].join('\n');
}

/* ---------- 組成整個網站 ---------- */

export interface SiteOptions {
  /** repo 根目錄（照原樣上線的靜態檔從這裡複製） */
  repoRoot: string;
  /** Vite 的 outDir（web/dist）：建置完就是整個網站，CI 把它推到 gh-pages 分支 */
  distDir: string;
  /** 共用程式與樣式的資料夾（相對於 outDir） */
  assetsDir: string;
  tools: readonly ToolEntry[];
  /**
   * 還沒重寫成新版、直接照原樣上線的檔案或資料夾（相對於 repo 根目錄，網站上的路徑相同），
   * 例如舊網址的轉址頁 `tools/trpg-lab`、`tools/jizura`。
   */
  staticPaths: readonly string[];
}

function assertInside(root: string, target: string) {
  const rel = path.relative(root, target);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`拒絕寫入 ${root} 以外或根目錄本身：${target}`);
  }
}

/** 列出資料夾（或單一檔案）裡所有檔案，路徑相對於 base */
function listFiles(base: string, rel: string): string[] {
  const full = path.join(base, rel);
  if (!statSync(full).isDirectory()) return [rel];
  return readdirSync(full).flatMap((name) => listFiles(base, path.join(rel, name)));
}

/**
 * 建置成功後把 web/dist 整理成整個網站（和 GitHub Pages 上的路徑相同）：
 * 1. 首頁在 `index.html`，已上線的工具在 `tools/<id>/`，重寫中的工具搬到 `next/<id>/`（都在根目錄下兩層，相對路徑不變）；
 * 2. 共用程式在 `assets/build/`，另外產生 `assets/build/THIRD_PARTY_NOTICES.md`；
 * 3. 從 repo 照原樣複製靜態檔（staticPaths：舊網址的轉址頁），不能蓋掉建置產物；
 * 4. `.nojekyll`：GitHub Pages 不要跑 Jekyll（否則 `next/_gallery/` 這種底線開頭的路徑不會發布）。
 *
 * 不會寫入 repo 的其他地方；建置產物不提交，由 CI（.github/workflows/deploy.yml）建置後推到 gh-pages 分支。
 */
export function assembleSite(opts: SiteOptions): Plugin {
  let failed = false;
  return {
    name: 'toolkit-site',
    apply: 'build',
    buildEnd(error) {
      if (error) failed = true;
    },
    async closeBundle() {
      if (failed) return;
      const { repoRoot, distDir, assetsDir, tools, staticPaths } = opts;
      for (const html of [
        path.join(distDir, 'index.html'),
        ...tools.map((tool) => path.join(distDir, 'tools', tool.id, 'index.html')),
      ]) {
        if (!existsSync(html)) throw new Error(`找不到建置產物：${html}`);
      }

      for (const tool of tools) {
        if (tool.status === 'live') continue;
        const target = path.join(distDir, outputDir(tool));
        assertInside(distDir, target);
        await mkdir(path.dirname(target), { recursive: true });
        await rename(path.join(distDir, 'tools', tool.id), target);
      }

      await writeFile(
        path.join(distDir, assetsDir, 'THIRD_PARTY_NOTICES.md'),
        noticesMarkdown(tools, path.join(repoRoot, 'web', 'src', 'tools')),
      );

      let copied = 0;
      for (const rel of staticPaths) {
        assertInside(repoRoot, path.join(repoRoot, rel));
        if (!existsSync(path.join(repoRoot, rel)))
          throw new Error(`找不到要照原樣上線的檔案：${rel}`);
        for (const file of listFiles(repoRoot, rel)) {
          const target = path.join(distDir, file);
          assertInside(distDir, target);
          if (existsSync(target)) throw new Error(`照原樣複製的檔案會蓋掉建置產物：${file}`);
          await mkdir(path.dirname(target), { recursive: true });
          await copyFile(path.join(repoRoot, file), target);
          copied++;
        }
      }
      await writeFile(path.join(distDir, '.nojekyll'), '');
      this.info?.(
        `網站已組好（${path.relative(repoRoot, distDir)}/）：首頁、${tools.length} 個工具頁、${copied} 個照原樣複製的檔案（轉址頁）`,
      );
    },
  };
}
