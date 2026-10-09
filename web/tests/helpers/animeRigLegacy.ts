/**
 * 2.5D 動態立繪（anime-rig）的單元測試要載入舊版的檔案（`tools/anime-rig/lib/`）並排比對。
 * 單元測試的型別沒有 Node（tsconfig.json），Node 的模組以動態 import 載入、自己標型別。
 * 舊版上線後已從 repo 刪除：改從 git 歷史（`LEGACY_COMMIT`）取出到暫存資料夾。
 * 取不到時（例如 CI 的淺層 clone 沒有那個 commit）`has` 是 false，比對的測試整組跳過。
 */

interface NodeFs {
  existsSync(p: string): boolean;
  readFileSync(p: string, enc: 'utf8'): string;
}
interface NodeModule {
  createRequire(url: string): (id: string) => unknown;
}
interface NodeOs {
  tmpdir(): string;
}
interface NodeFsExtra extends NodeFs {
  mkdtempSync(prefix: string): string;
  writeFileSync(p: string, data: string): void;
  rmSync(p: string, opts: { recursive: boolean; force: boolean }): void;
  renameSync(from: string, to: string): void;
}
interface NodeChildProcess {
  execFileSync(
    cmd: string,
    args: string[],
    opts: { cwd: string; encoding: 'utf8'; stdio: string[]; maxBuffer: number },
  ): string;
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

/** 舊版還在 repo 裡的最後一個 main commit（ATTRIBUTION.md「本站重寫的工具」表中的 commit） */
export const LEGACY_COMMIT = '6957b28';
const LEGACY_DIR = 'tools/anime-rig/lib/';

/**
 * 從 git 歷史取出舊版的 lib/ 到暫存資料夾（`<tmp>/anime-rig-legacy-<commit>/`，取過就沿用）；取不到時回傳 null。
 * 幾個測試檔同時取時，各自寫進自己的資料夾再改名，先改名的那份留下。
 */
async function fromGit(fs: NodeFsExtra): Promise<string | null> {
  const cp = await dyn<NodeChildProcess>('node:child_process');
  const os = await dyn<NodeOs>('node:os');
  const cached = `${os.tmpdir()}/anime-rig-legacy-${LEGACY_COMMIT}`;
  if (fs.existsSync(`${cached}/rigger.js`)) return `${cached}/`;
  const root = new URL('../../../', import.meta.url).pathname;
  const git = (...args: string[]) =>
    cp.execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    });
  try {
    const files = git('ls-tree', '--name-only', `${LEGACY_COMMIT}:${LEGACY_DIR}`)
      .split('\n')
      .filter(Boolean);
    if (!files.includes('rigger.js')) return null;
    const tmp = fs.mkdtempSync(`${cached}-`);
    for (const f of files)
      fs.writeFileSync(`${tmp}/${f}`, git('show', `${LEGACY_COMMIT}:${LEGACY_DIR}${f}`));
    try {
      fs.renameSync(tmp, cached);
    } catch {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    return fs.existsSync(`${cached}/rigger.js`) ? `${cached}/` : null;
  } catch {
    return null;
  }
}

export async function legacyEnv(): Promise<LegacyEnv> {
  const fs = await dyn<NodeFsExtra>('node:fs');
  const mod = await dyn<NodeModule>('node:module');
  const vm = await dyn<NodeVm>('node:vm');
  const inRepo = new URL(`../../../${LEGACY_DIR}`, import.meta.url).pathname;
  const dir = fs.existsSync(`${inRepo}rigger.js`) ? inRepo : ((await fromGit(fs)) ?? inRepo);
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
