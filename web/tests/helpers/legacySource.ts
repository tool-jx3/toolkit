/**
 * 和舊版並排比對的單元測試要讀舊版的原始檔。舊版上線後已從 repo 刪除，改從 git 歷史取回：
 * 檔案還在工作目錄時讀工作目錄，不在時讀 `git show <commit>:<path>`。
 * CI 是淺層 clone，`.github/workflows/deploy.yml` 會先把這些 commit 取回（`git fetch --depth=1 origin <sha>`）。
 * 單元測試的型別沒有 Node（tsconfig.json），Node 的模組以動態 import 載入、自己標型別。
 */

interface NodeFs {
  existsSync(p: string): boolean;
  readFileSync(p: string, enc: 'utf8'): string;
}
interface NodeChildProcess {
  execFileSync(
    cmd: string,
    args: string[],
    opts: { cwd: string; encoding: 'utf8'; stdio: string[]; maxBuffer: number },
  ): string;
}

/** trpg-lab（擲骰、NPC、網格、量尺、角色卡、地圖編輯器）還在 repo 裡的最後一個 main commit */
export const TRPG_LAB_COMMIT = '6b497bd363545620c4b44963a3dc8ded2e9a2d13';

const dyn = <T>(name: string): Promise<T> => import(/* @vite-ignore */ name) as Promise<T>;

/**
 * 舊版的檔案原文（`path` 相對於 repo 根目錄）。工作目錄沒有、git 歷史也取不到時丟出說明怎麼取回的錯誤
 * （比對的測試不該默默略過）。
 */
export async function legacySource(path: string, commit = TRPG_LAB_COMMIT): Promise<string> {
  const fs = await dyn<NodeFs>('node:fs');
  const root = new URL('../../../', import.meta.url).pathname;
  if (fs.existsSync(`${root}${path}`)) return fs.readFileSync(`${root}${path}`, 'utf8');
  const cp = await dyn<NodeChildProcess>('node:child_process');
  try {
    return cp.execFileSync('git', ['show', `${commit}:${path}`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    throw new Error(
      `取不到舊版的 ${path}：工作目錄沒有，git 歷史裡也沒有 ${commit.slice(0, 7)}（淺層 clone 時先 git fetch --depth=1 origin ${commit}）`,
    );
  }
}
