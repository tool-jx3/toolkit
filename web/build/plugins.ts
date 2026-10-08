/**
 * 建置用的 Vite 外掛。
 *
 * - toolkitHtml：每個工具頁共用的 <head>（字型、配色、主題初始化）。
 * - collectNotices：記下實際打包進去的 npm 套件，用來產生 THIRD_PARTY_NOTICES.md。
 * - assembleSite：把 web/dist 整理成整個網站（index.html、tools/<id>/、next/<id>/、assets/build/、還沒重寫的舊版檔案）。
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
        }
      }
    },
  };
}

/** 沒有附授權檔的套件，授權全文補在這裡（檔名＝套件名，scope 的「/」換成「__」） */
const SUPPLEMENTARY_LICENSES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'licenses');

/** 參考 MIT／CC0 原作改寫的工具：原作的授權全文放在 `web/src/tools/<id>/UPSTREAM_LICENSE`，建置時併入通知檔。 */
const UPSTREAM_LICENSE = 'UPSTREAM_LICENSE';

function upstreamNotices(tools: readonly ToolEntry[], srcToolsDir: string): string[] {
  const out: string[] = [];
  for (const tool of tools) {
    const file = path.join(srcToolsDir, tool.id, UPSTREAM_LICENSE);
    if (!existsSync(file)) continue;
    const body = readFileSync(file, 'utf8').trim();
    const source = tool.inspiration
      ? tool.inspiration.url
        ? `[${tool.inspiration.name}](${tool.inspiration.url})`
        : tool.inspiration.name
      : '（未標示）';
    out.push(`### ${tool.id}（原作：${source}）\n\n\`\`\`\n${body}\n\`\`\``);
  }
  return out;
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
    if (licenseFile) {
      const body = readFileSync(path.join(dir, licenseFile), 'utf8').trim();
      texts.push(`### ${key}\n\n\`\`\`\n${body}\n\`\`\``);
    } else {
      /* 套件沒有附授權檔（例如 onnxruntime-web）：用 build/licenses/<套件名>.txt 補上上游 repo 的授權全文 */
      const extra = path.join(SUPPLEMENTARY_LICENSES, `${pkg.name.replace('/', '__')}.txt`);
      if (existsSync(extra)) {
        const body = readFileSync(extra, 'utf8').trim();
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
      const upstream = srcToolsDir ? upstreamNotices(tools, srcToolsDir) : [];
      return upstream.length
        ? [
            '## 參考原作程式改寫的工具',
            '',
            '下列工具參考原作（MIT／CC0）的程式改寫，依原作授權保留其著作權聲明與授權全文。',
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
  /** repo 根目錄（舊版工具的原始檔從這裡複製） */
  repoRoot: string;
  /** Vite 的 outDir（web/dist）：建置完就是整個網站，CI 把它推到 gh-pages 分支 */
  distDir: string;
  /** 共用程式與樣式的資料夾（相對於 outDir） */
  assetsDir: string;
  tools: readonly ToolEntry[];
  /**
   * 還沒重寫成新版、直接照原樣上線的檔案或資料夾（相對於 repo 根目錄，網站上的路徑相同），
   * 例如舊版工具 `tools/trpg-lab` 與它用的 `assets/i18n.js`。
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
 * 3. 從 repo 複製還沒重寫的舊版檔案（staticPaths），不能蓋掉建置產物；
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
          if (existsSync(target)) throw new Error(`舊版檔案會蓋掉建置產物：${file}`);
          await mkdir(path.dirname(target), { recursive: true });
          await copyFile(path.join(repoRoot, file), target);
          copied++;
        }
      }
      await writeFile(path.join(distDir, '.nojekyll'), '');
      this.info?.(
        `網站已組好（${path.relative(repoRoot, distDir)}/）：首頁、${tools.length} 個工具頁、${copied} 個舊版檔案`,
      );
    },
  };
}
