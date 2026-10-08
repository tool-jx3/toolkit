/**
 * 2.5D 動態立繪（anime-rig）的單元測試要載入舊版的檔案（`tools/anime-rig/lib/`）並排比對。
 * 單元測試的型別沒有 Node（tsconfig.json），Node 的模組以動態 import 載入、自己標型別。
 * 舊版的檔案不在時（上線、刪除舊版之後）`has` 是 false，比對的測試整組跳過。
 */

interface NodeFs {
  existsSync(p: string): boolean;
  readFileSync(p: string, enc: 'utf8'): string;
}
interface NodeModule {
  createRequire(url: string): (id: string) => unknown;
}
interface NodeVm {
  createContext(sandbox: object): object;
  runInContext(code: string, ctx: object): unknown;
}

export interface LegacyEnv {
  /** 舊版的檔案在不在 */
  has: boolean;
  /** 載入舊版的檔案（rigger.js、runtime.js…；CommonJS） */
  load<T = unknown>(file: string): T;
  /** 讀舊版的檔案原文 */
  read(file: string): string;
  vm: NodeVm;
}

const dyn = <T>(name: string): Promise<T> => import(/* @vite-ignore */ name) as Promise<T>;

export async function legacyEnv(): Promise<LegacyEnv> {
  const fs = await dyn<NodeFs>('node:fs');
  const mod = await dyn<NodeModule>('node:module');
  const vm = await dyn<NodeVm>('node:vm');
  const dir = new URL('../../../tools/anime-rig/lib/', import.meta.url).pathname;
  const require = mod.createRequire(import.meta.url);
  return {
    has: fs.existsSync(`${dir}rigger.js`) && fs.existsSync(`${dir}app.js`),
    load: <T>(file: string) => require(`${dir}${file}`) as T,
    read: (file: string) => fs.readFileSync(`${dir}${file}`, 'utf8'),
    vm,
  };
}

/** 兩段位元組是否完全相同 */
export function sameBytes(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
