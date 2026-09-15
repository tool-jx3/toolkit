// 同梱物のライセンス全文を public/licenses/ に集める。
//
// 【TRPG Toolkit 収録時の変更点】
// 上流は @fontsource で6書体を同梱していた（＝再配布に当たるため OFL 全文の
// 同梱が必須だった）。この合輯では書体を Google Fonts から読み込むので
// @fontsource は依存から外してあり、node_modules から書体のライセンスを
// 集める処理もここから外した。
// public/licenses/OFL.txt と fonts.txt は収録時点の内容のまま残してある
// （「このツールについて」からリンクしている、どの書体を使っているかの記録）。
// このスクリプトが走ってもその2つは書き換えない。
import { cp, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const OUT = 'public/licenses';

const OSS_PKGS = ['react', 'react-dom', 'upng-js', 'gifenc', 'vite', 'tailwindcss'];

async function licenseOf(pkg) {
  for (const name of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license']) {
    const p = `node_modules/${pkg}/${name}`;
    if (existsSync(p)) return readFile(p, 'utf8');
  }
  return null;
}

await mkdir(OUT, { recursive: true });

for (const pkg of OSS_PKGS) {
  const text = await licenseOf(pkg);
  if (text) await cp(`node_modules/${pkg}/${(await fileNameOf(pkg)) ?? 'LICENSE'}`, `${OUT}/${pkg.replace('/', '-')}.txt`);
}

async function fileNameOf(pkg) {
  for (const name of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license']) {
    if (existsSync(`node_modules/${pkg}/${name}`)) return name;
  }
  return null;
}

console.log(`[licenses] ${OUT} に出力しました`);
