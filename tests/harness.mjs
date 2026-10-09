/* 共用測試工具。無外部相依。 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const read = rel => readFileSync(join(root, rel), 'utf8');
export const exists = rel => existsSync(join(root, rel));

/* 遞迴列出目錄下所有檔案，回傳相對於 repo 根目錄的路徑（可直接餵給 read()）。 */
export function listFiles(rel) {
  const out = [];
  (function walk(dir) {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const next = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(next);
      else out.push(next);
    }
  })(rel);
  return out.sort();
}

let failures = 0;

export function section(name) {
  console.log(`\n${name}`);
}

export function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ''}`);
  }
}

export function summary() {
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  return failures;
}
