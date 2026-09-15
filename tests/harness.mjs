/* 共用測試工具。無外部相依。 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

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

/* 在沙箱中載入引擎與零到多個字典檔，回傳該沙箱的 I18N。
 * 每次呼叫都是全新的沙箱，因此各工具的字典互不污染。 */
export function loadI18N(dictPaths = []) {
  const noop = () => {};
  const context = {
    window: {},
    navigator: { languages: ['zh-TW'], language: 'zh-TW' },
    localStorage: { getItem: () => null, setItem: noop },
    document: {
      documentElement: { lang: '' },
      title: '',
      querySelectorAll: () => [],
      createTextNode: () => ({}),
      addEventListener: noop
    },
    Node: { TEXT_NODE: 3 },
    console
  };
  vm.createContext(context);
  vm.runInContext(read('assets/i18n.js'), context, { filename: 'assets/i18n.js' });
  for (const path of dictPaths) {
    vm.runInContext(read(path), context, { filename: path });
  }
  return context.window.I18N;
}
