/**
 * 建置用的 Vite 外掛。
 *
 * - toolkitHtml：每個工具頁共用的 <head>（字型、配色、主題初始化）。
 * - collectNotices：記下實際打包進去的 npm 套件，用來產生 THIRD_PARTY_NOTICES.md。
 * - publishToRepo：把 web/dist 的產物搬到 repo 根目錄（next/<id>/、tools/<id>/、assets/build/）。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';
import { outputDir, type ToolEntry } from '../src/registry.ts';

const FONT_CSS =
  'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&display=swap';

/** 主題初始化：在第一次繪製前套用使用者選的深／淺色，避免閃爍。 */
const THEME_INIT =
  "try{var t=localStorage.getItem('trpg-toolkit:theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}";

export function toolkitHtml(): Plugin {
  return {
    name: 'toolkit-html',
    transformIndexHtml: {
      order: 'pre',
      handler() {
        return [
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

function noticesMarkdown(): string {
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
  ].join('\n');
}

/* ---------- 搬到 repo 根目錄 ---------- */

export interface PublishOptions {
  /** repo 根目錄 */
  repoRoot: string;
  /** Vite 的 outDir（web/dist） */
  distDir: string;
  /** 共用程式與樣式的資料夾（相對於 outDir 與 repo 根目錄，兩邊相同） */
  assetsDir: string;
  tools: readonly ToolEntry[];
}

function assertInside(root: string, target: string) {
  const rel = path.relative(root, target);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`拒絕寫入 repo 以外或根目錄本身：${target}`);
  }
}

/**
 * 建置成功後：
 * 1. 清空 repo 的 `assets/build/` 與 `next/`（只動這兩個資料夾）；
 * 2. 複製共用程式到 `assets/build/`；
 * 3. 依 registry 把每個工具頁複製到 `next/<id>/` 或 `tools/<id>/`（live 工具只覆寫建置產物，不刪資料夾內其他檔案）。
 *
 * 清空放在「確定這次建置成功」之後才做，建置失敗時不會留下半套產物。
 */
export function publishToRepo(opts: PublishOptions): Plugin {
  let failed = false;
  return {
    name: 'toolkit-publish',
    apply: 'build',
    buildEnd(error) {
      if (error) failed = true;
    },
    async closeBundle() {
      if (failed) return;
      const { repoRoot, distDir, assetsDir, tools } = opts;
      for (const tool of tools) {
        const html = path.join(distDir, 'tools', tool.id, 'index.html');
        if (!existsSync(html)) throw new Error(`找不到建置產物：${html}`);
      }
      const assetsTarget = path.join(repoRoot, assetsDir);
      const nextTarget = path.join(repoRoot, 'next');
      assertInside(repoRoot, assetsTarget);
      assertInside(repoRoot, nextTarget);
      if (path.basename(assetsTarget) !== 'build') throw new Error('assetsDir 必須是 assets/build');

      await rm(assetsTarget, { recursive: true, force: true });
      await rm(nextTarget, { recursive: true, force: true });

      await cp(path.join(distDir, assetsDir), assetsTarget, { recursive: true });
      await writeFile(path.join(assetsTarget, 'THIRD_PARTY_NOTICES.md'), noticesMarkdown());

      for (const tool of tools) {
        const target = path.join(repoRoot, outputDir(tool));
        assertInside(repoRoot, target);
        await mkdir(target, { recursive: true });
        await cp(path.join(distDir, 'tools', tool.id), target, { recursive: true });
      }
      this.info?.(`已輸出 ${tools.length} 個工具頁到 repo 根目錄`);
    },
  };
}
