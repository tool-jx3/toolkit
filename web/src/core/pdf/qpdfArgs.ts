/**
 * qpdf 的參數（純函式）。每個參數都在 @neslinesli93/qpdf-wasm 0.3.0（qpdf 12.2.0）實際跑過
 * （tests/unit/core-pdf-qpdf.test.ts）；QC 的原作用的是 qpdf 12.4.2，用到的參數 12.2.0 都接受。
 */

/** 每一次產生檔案都加：不印例行的警告；只有警告（可以修好的小問題）時結束碼當成 0 */
export const QPDF_COMMON = ['--no-warn', '--warning-exit-0'] as const;

/** 結構壓縮（QC 的 structural）：物件串流、zlib 9、沒壓縮的串流用 Flate 壓、重新壓已經是 Flate 的串流 */
export function structuralArgs(): string[] {
  return [
    ...QPDF_COMMON,
    '--object-streams=generate',
    `--compression-level=${clampLevel(9)}`,
    '--stream-data=compress',
    '--decode-level=generalized',
    '--recompress-flate',
  ];
}

/** 快速網頁檢視（QC 的 linearize 候選：有時候比較小） */
export function linearizeArgs(): string[] {
  return [...QPDF_COMMON, '--linearize'];
}

/** 攤平：每個物件都放在最上層、串流原樣保留（給 pdf-lib 讀、找影像用；QC 的 flatten） */
export function normalizeArgs(): string[] {
  return [...QPDF_COMMON, '--object-streams=disable', '--stream-data=preserve'];
}

/** 檢查（不寫檔；qpdf 的 --check 也會解開 DCT 影像，壞掉的 JPEG 會被抓到） */
export const CHECK_ARGS = ['--check'] as const;

/** 頁數 */
export const NPAGES_ARGS = ['--show-npages'] as const;

/** 檢視：加密狀態與頁數（JSON） */
export const INSPECT_ARGS = ['--json=latest', '--json-key=encrypt', '--json-key=pages'] as const;

/** 不寫輸出檔的指令 */
export function writesOutput(args: readonly string[]): boolean {
  return !args.some((a) => a === '--check' || a === '--show-npages' || a.startsWith('--json'));
}

export function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 9;
  return Math.min(9, Math.max(0, Math.round(level)));
}

/** 加上密碼：密碼寫在 qpdf 的記憶體檔案系統裡，以檔名傳入（不出現在參數裡）；要輸出時一併解密 */
export function withPassword(
  args: readonly string[],
  passwordFile: string | null,
  decrypt: boolean,
): string[] {
  const out = [...args];
  if (passwordFile) out.push(`--password-file=${passwordFile}`);
  if (decrypt && writesOutput(args)) out.push('--decrypt');
  return out;
}

/** `--json` 的輸出整理成檢視結果 */
export interface QpdfInspect {
  encrypted: boolean;
  /** 打開要密碼（有使用者密碼、而且沒給對） */
  needsPassword: boolean;
  /** 只有擁有者密碼（權限設定），不用密碼就能打開 */
  restricted: boolean;
  pages: number | null;
}

export function parseInspectJson(stdout: string): QpdfInspect | null {
  const start = stdout.indexOf('{');
  if (start < 0) return null;
  let json: {
    encrypt?: {
      encrypted?: boolean;
      userpasswordmatched?: boolean;
      ownerpasswordmatched?: boolean;
    };
    pages?: unknown[];
  };
  try {
    json = JSON.parse(stdout.slice(start));
  } catch {
    return null;
  }
  const enc = json.encrypt ?? {};
  const encrypted = enc.encrypted === true;
  const userOk = enc.userpasswordmatched === true;
  return {
    encrypted,
    needsPassword: encrypted && !userOk && enc.ownerpasswordmatched !== true,
    restricted: encrypted && userOk,
    pages: Array.isArray(json.pages) ? json.pages.length : null,
  };
}

/** qpdf 訊息裡的暫存檔名（`/in_3.pdf`）換成使用者的檔名、去掉程式名稱 */
export function cleanDiagnostic(text: string, fileName: string): string {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^For help:/i.test(l) && !/--help=/.test(l))
    .map((l) =>
      l
        .replace(/^(?:(?:\.\/)?this\.program|qpdf|\S+\.(?:m?js|ts)):\s/, '')
        .replace(/\/?\bin_\d+\.pdf\b/g, fileName),
    )
    .join('\n');
}

/** 第一行有意義的訊息 */
export function firstDiagnostic(text: string): string | null {
  for (const raw of text.split('\n')) {
    const l = raw.trim();
    if (!l || /^For help:/i.test(l) || /--help=/.test(l) || /^[[{"}\]]/.test(l)) continue;
    return l;
  }
  return null;
}
