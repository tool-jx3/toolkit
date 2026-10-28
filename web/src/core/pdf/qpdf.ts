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
 *
 * 記憶體（大檔，量測見規格的「大檔實測」）：qpdf 的 wasm heap 幾乎不長（串流一段一段處理），檔案都在 JS 的記憶體裡。
 * - 輸入是 Uint8Array 時交給記憶體檔案系統「直接用」（`FS.write` 的 canOwn，不複製一份）；輸入是 Blob（使用者的 File）時，
 *   在 Worker 裡掛 WORKERFS 直接讀（FileReaderSync，一段一段讀，不整份讀進記憶體；Node 沒有 FileReaderSync，改成先讀進來）。
 * - 輸出用 `FS.readFile` 讀一次（它本來就是新的陣列，不再多複製）。
 * - 讀使用者的檔案失敗（手機的讀取權限過期：NotReadableError 等）丟 PdfError('unreadable')。
 */
import { isMemoryMessage, PdfError } from './errors';
import { withPassword, writesOutput } from './qpdfArgs';

export interface QpdfRun {
  /** 結束碼：0 成功、2 錯誤、3 只有警告 */
  code: number;
  /** 輸出的檔案（不寫檔的指令、失敗時 null；`outputAs: 'blob'` 時是 Blob） */
  out: Uint8Array | null;
  /** `outputAs: 'blob'` 時的輸出 */
  blob?: Blob | null;
  stdout: string;
  stderr: string;
}

export interface QpdfRunOptions {
  /** 打開要用的密碼（空字串或 null＝不給） */
  password?: string | null;
  /** 輸出時解密（有使用者密碼的檔案） */
  decrypt?: boolean;
  /**
   * 輸出存成 Blob（大檔流程）：從記憶體檔案系統一段一段讀出來交給 Blob，不再整份複製一份陣列
   * （`out` 是 null，結果在 `blob`）。
   */
  outputAs?: 'bytes' | 'blob';
}

/** 輸出存成 Blob 時一次讀多少（自訂） */
export const BLOB_OUTPUT_CHUNK = 4 * 1024 * 1024;

/** qpdf 的輸入：記憶體裡的位元組，或使用者的檔案（Blob／File；Worker 裡用 WORKERFS 直接讀） */
export type QpdfInput = Uint8Array | Blob;

export type QpdfRunner = (
  input: QpdfInput,
  args: readonly string[],
  options?: QpdfRunOptions,
) => Promise<QpdfRun>;

/** Emscripten 的檔案串流（只用到 FS.write 的參數） */
type FsStream = object;

/** Emscripten 模組（只用到的部分） */
export interface QpdfModule {
  FS: {
    writeFile(path: string, data: Uint8Array): void;
    readFile(path: string): Uint8Array;
    unlink(path: string): void;
    open(path: string, flags: string): FsStream;
    read(
      stream: FsStream,
      buffer: Uint8Array,
      offset: number,
      length: number,
      position: number,
    ): number;
    stat(path: string): { size: number };
    /** canOwn：記憶體檔案系統直接用這個陣列（不複製） */
    write(
      stream: FsStream,
      buffer: Uint8Array,
      offset: number,
      length: number,
      position: number,
      canOwn: boolean,
    ): number;
    close(stream: FsStream): void;
    mkdir(path: string): void;
    rmdir(path: string): void;
    mount(type: unknown, opts: { blobs: { name: string; data: Blob }[] }, mountpoint: string): void;
    unmount(mountpoint: string): void;
  };
  WORKERFS?: unknown;
  callMain(args: string[]): number;
}

/** Worker 裡能用 WORKERFS（要 FileReaderSync） */
export const canMountBlobs = (): boolean =>
  typeof (globalThis as { FileReaderSync?: unknown }).FileReaderSync === 'function';

/**
 * WORKERFS 一次從 Blob 讀多少：qpdf 經過 C 的 stdio 讀小塊（1 KB）時一次讀 64 KB 留著用；要的比這個大時直接讀那一段
 * （量過 qpdf 的讀法：大部分是大塊的讀取，1 KB 的讀取之間常常跳開，所以塊不用大；自訂）。
 */
export const BLOB_READ_BLOCK = 64 * 1024;

interface SyncReader {
  readAsArrayBuffer(blob: Blob): ArrayBuffer;
}
type WorkerfsRead = (
  stream: unknown,
  buffer: Uint8Array,
  offset: number,
  length: number,
  position: number,
) => number;

/**
 * 讓這個 qpdf 實例的 WORKERFS 一次讀一大塊、留著下一次用（只掛了 blob 這一個檔案）。
 * 換的是膠水程式裡 WORKERFS 的 stream_ops.read（這份建置的屬性名稱是 `qa`，版本固定 0.3.0）；
 * 找不到時（換了版本）不換，照原本的讀法（比較慢，結果一樣）。回傳有沒有換。
 */
export function bufferWorkerfsReads(mod: QpdfModule, blob: Blob, reader: SyncReader): boolean {
  const ops = (mod.WORKERFS as { qa?: { read?: WorkerfsRead } } | undefined)?.qa;
  if (!ops || typeof ops.read !== 'function') return false;
  let start = 0;
  let block: Uint8Array | null = null;
  ops.read = (_stream, buffer, offset, length, position) => {
    if (position >= blob.size || length <= 0) return 0;
    if (length >= BLOB_READ_BLOCK) {
      const data = new Uint8Array(
        reader.readAsArrayBuffer(blob.slice(position, position + length)),
      );
      buffer.set(data, offset);
      return data.length;
    }
    /* 不在這一塊裡（或跨到下一塊）：從這個位置重新讀一塊 */
    if (!block || position < start || position + length > start + block.length) {
      start = position;
      block = new Uint8Array(
        reader.readAsArrayBuffer(blob.slice(start, Math.min(blob.size, start + BLOB_READ_BLOCK))),
      );
    }
    const n = Math.min(length, start + block.length - position);
    buffer.set(block.subarray(position - start, position - start + n), offset);
    return n;
  };
  return true;
}

/** 讀使用者檔案的錯誤（權限過期、檔案被移走） */
export const isReadError = (message: string): boolean =>
  /NotReadableError|NotFoundError|could not be read|permission problems/i.test(message);

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

/** 記憶體檔案系統裡的檔案一段一段讀出來組成 Blob（每段交給 Blob 之後就放掉） */
function readAsBlob(mod: QpdfModule, path: string): Blob {
  const size = mod.FS.stat(path).size;
  const parts: Blob[] = [];
  const s = mod.FS.open(path, 'r');
  try {
    for (let pos = 0; pos < size; pos += BLOB_OUTPUT_CHUNK) {
      const chunk = new Uint8Array(Math.min(BLOB_OUTPUT_CHUNK, size - pos));
      mod.FS.read(s, chunk, 0, chunk.length, pos);
      parts.push(new Blob([chunk as BlobPart]));
    }
  } finally {
    mod.FS.close(s);
  }
  return new Blob(parts, { type: 'application/pdf' });
}

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
    /* Node（沒有 FileReaderSync）：Blob 先讀進來 */
    let source: QpdfInput = input;
    if (source instanceof Blob && !canMountBlobs()) {
      try {
        source = new Uint8Array(await source.arrayBuffer());
      } catch (e) {
        throw new PdfError(
          'unreadable',
          e instanceof Error ? `${e.name}: ${e.message}` : String(e),
        );
      }
    }
    let mod: QpdfModule;
    try {
      mod = await f({ noInitialRun: true, locateFile: () => loc });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new PdfError(isMemoryMessage(msg) ? 'memory' : 'internal', msg);
    }
    const n = ++seq;
    const mountDir = source instanceof Blob ? `/blob_${n}` : null;
    const inFile = mountDir ? `${mountDir}/in.pdf` : `/in_${n}.pdf`;
    const outFile = `/out_${n}.pdf`;
    const password = options.password ? `/pw_${n}` : null;
    const output = writesOutput(args);
    const stdout: string[] = [];
    const stderr: string[] = [];
    let mounted = false;
    try {
      if (mountDir && source instanceof Blob) {
        const Reader = (globalThis as unknown as { FileReaderSync: new () => SyncReader })
          .FileReaderSync;
        bufferWorkerfsReads(mod, source, new Reader());
        mod.FS.mkdir(mountDir);
        mod.FS.mount(mod.WORKERFS, { blobs: [{ name: 'in.pdf', data: source }] }, mountDir);
        mounted = true;
      } else if (source instanceof Uint8Array) {
        /* canOwn：記憶體檔案系統直接用這個陣列（qpdf 只讀，不會改到） */
        const s = mod.FS.open(inFile, 'w');
        try {
          mod.FS.write(s, source, 0, source.length, 0, true);
        } finally {
          mod.FS.close(s);
        }
      }
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
        const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        if (isMemoryMessage(msg)) throw new PdfError('memory', msg);
        if (isReadError(msg)) throw new PdfError('unreadable', msg);
        stderr.push(msg);
        code = 2;
      }
      let out: Uint8Array | null = null;
      let blob: Blob | null = null;
      if (output && (code === 0 || code === 3)) {
        try {
          if (options.outputAs === 'blob') {
            blob = readAsBlob(mod, outFile);
          } else {
            /* readFile 本來就是新的陣列（不在 WebAssembly 的記憶體裡），不再多複製 */
            out = mod.FS.readFile(outFile);
          }
        } catch (e) {
          const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
          if (isMemoryMessage(msg)) throw new PdfError('memory', msg);
          out = null;
          blob = null;
        }
      }
      return {
        code,
        out,
        ...(options.outputAs === 'blob' ? { blob } : {}),
        stdout: stdout.join('\n'),
        stderr: stderr.join('\n'),
      };
    } finally {
      for (const p of [mountDir ? null : inFile, output ? outFile : null, password]) {
        if (!p) continue;
        try {
          mod.FS.unlink(p);
        } catch {
          /* 沒有建立 */
        }
      }
      if (mounted && mountDir) {
        try {
          mod.FS.unmount(mountDir);
          mod.FS.rmdir(mountDir);
        } catch {
          /* 已經卸載 */
        }
      }
    }
  };
}
