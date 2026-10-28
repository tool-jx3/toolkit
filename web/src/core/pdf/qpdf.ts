/**
 * qpdf（@neslinesli93/qpdf-wasm：qpdf 12.2.0 編成 WebAssembly，Apache-2.0；包裝 ISC）的執行器。
 * Worker 與 Node（單元測試）都能用：怎麼載入膠水程式與 wasm 由呼叫端給（`createQpdfRunner`）。
 *
 * 這一份 Emscripten 建置的特性（QC 的原作也記錄過同樣的事，這裡實測 12.2.0）：
 * - 不理會 `Module.print`／`printErr`：qpdf 的輸出直接寫到 console，而且膠水程式在**第一次執行時**就把
 *   `console.log`／`console.error` 綁住。所以要先換上攔截用的 console，再以 `import()` 載入膠水程式。
 * - 一個實例跑完 `callMain` 之後的狀態不可靠（qpdf 的全域記錄器、`--json` 不能用第二次），每次都開新的實例。
 * - 不支援 `wasmBinary`／`instantiateWasm`，只能用 `locateFile` 指定 wasm 的位置：Worker 先把 wasm 讀成 blob: 網址，
 *   之後每個實例都從記憶體讀（只下載一次）。
 * - 在 Node 執行時，結束碼會寫到 `process.exitCode`：跑完要改回原本的值（不然測試程式會以失敗結束）。
 * - 密碼寫在 qpdf 的記憶體檔案系統，以 `--password-file` 傳入，不出現在參數裡；暫存檔在 finally 刪掉。
 */
import { isMemoryMessage, PdfError } from './errors';
import { withPassword, writesOutput } from './qpdfArgs';

export interface QpdfRun {
  /** 結束碼：0 成功、2 錯誤、3 只有警告 */
  code: number;
  /** 輸出的檔案（不寫檔的指令、失敗時 null） */
  out: Uint8Array | null;
  stdout: string;
  stderr: string;
}

export interface QpdfRunOptions {
  /** 打開要用的密碼（空字串或 null＝不給） */
  password?: string | null;
  /** 輸出時解密（有使用者密碼的檔案） */
  decrypt?: boolean;
}

export type QpdfRunner = (
  input: Uint8Array,
  args: readonly string[],
  options?: QpdfRunOptions,
) => Promise<QpdfRun>;

/** Emscripten 模組（只用到的部分） */
export interface QpdfModule {
  FS: {
    writeFile(path: string, data: Uint8Array): void;
    readFile(path: string): Uint8Array;
    unlink(path: string): void;
  };
  callMain(args: string[]): number;
}

export type QpdfFactory = (options: {
  noInitialRun: boolean;
  locateFile: (file: string, prefix: string) => string;
}) => Promise<QpdfModule>;

export interface QpdfRunnerOptions {
  /** 載入膠水程式（一定要用 `import()`，見檔頭） */
  loadFactory: () => Promise<QpdfFactory>;
  /** wasm 的位置（網址或 Node 的路徑）；第一次執行時才呼叫 */
  wasmLocation: () => Promise<string> | string;
}

/* ---------- 攔截 console ---------- */

let sinkOut: string[] | null = null;
let sinkErr: string[] | null = null;
let captureInstalled = false;

function installConsoleCapture(): void {
  if (captureInstalled) return;
  captureInstalled = true;
  const c = globalThis.console;
  const log = c.log.bind(c);
  const error = c.error.bind(c);
  const warn = c.warn.bind(c);
  const text = (parts: unknown[]) => parts.map((p) => String(p)).join(' ');
  c.log = (...parts: unknown[]) => {
    if (sinkOut) sinkOut.push(text(parts));
    else log(...parts);
  };
  c.error = (...parts: unknown[]) => {
    if (sinkErr) sinkErr.push(text(parts));
    else error(...parts);
  };
  c.warn = (...parts: unknown[]) => {
    if (sinkErr) sinkErr.push(text(parts));
    else warn(...parts);
  };
}

interface NodeProcessLike {
  exitCode?: number | string | null;
}

/** callMain 是同步的：執行中不會有別的程式插進來，切換攔截的目標是安全的 */
function callCaptured(mod: QpdfModule, argv: string[], out: string[], err: string[]): number {
  const proc = (globalThis as { process?: NodeProcessLike }).process;
  const exitCode = proc?.exitCode;
  const prevOut = sinkOut;
  const prevErr = sinkErr;
  sinkOut = out;
  sinkErr = err;
  try {
    return mod.callMain(argv);
  } finally {
    sinkOut = prevOut;
    sinkErr = prevErr;
    if (proc) proc.exitCode = exitCode;
  }
}

let seq = 0;

export function createQpdfRunner({ loadFactory, wasmLocation }: QpdfRunnerOptions): QpdfRunner {
  let factory: Promise<QpdfFactory> | null = null;
  let location: Promise<string> | null = null;
  const ready = async () => {
    installConsoleCapture();
    factory ??= loadFactory();
    location ??= Promise.resolve(wasmLocation());
    const [f, loc] = await Promise.all([factory, location]);
    return { f, loc };
  };

  return async (input, args, options = {}) => {
    const { f, loc } = await ready();
    let mod: QpdfModule;
    try {
      mod = await f({ noInitialRun: true, locateFile: () => loc });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new PdfError(isMemoryMessage(msg) ? 'memory' : 'internal', msg);
    }
    const n = ++seq;
    const inFile = `/in_${n}.pdf`;
    const outFile = `/out_${n}.pdf`;
    const password = options.password ? `/pw_${n}` : null;
    const output = writesOutput(args);
    const stdout: string[] = [];
    const stderr: string[] = [];
    try {
      mod.FS.writeFile(inFile, input);
      if (password && options.password) {
        mod.FS.writeFile(password, new TextEncoder().encode(options.password));
      }
      const argv = withPassword(args, password, !!options.decrypt);
      argv.push(inFile);
      if (output) argv.push(outFile);
      let code: number;
      try {
        code = callCaptured(mod, argv, stdout, stderr);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (isMemoryMessage(msg)) throw new PdfError('memory', msg);
        stderr.push(msg);
        code = 2;
      }
      let out: Uint8Array | null = null;
      if (output && (code === 0 || code === 3)) {
        try {
          /* 複製一份：不要把 WebAssembly 的記憶體交出去 */
          out = mod.FS.readFile(outFile).slice();
        } catch {
          out = null;
        }
      }
      return { code, out, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
    } finally {
      for (const p of [inFile, output ? outFile : null, password]) {
        if (!p) continue;
        try {
          mod.FS.unlink(p);
        } catch {
          /* 沒有建立 */
        }
      }
    }
  };
}
