/**
 * 清單的動作：加入檔案（檢查、讀頁數與縮圖）、密碼、開始壓縮（依序一個一個）、取消、重試、移除、下載、ZIP。
 * PDF 的處理都在 core/pdf 的 Worker 裡：一個做壓縮（取消＝結束它），一個讀縮圖與前後比對的頁面（壓縮中也能用）。
 *
 * 檔案在用到時才讀（拖放區 `readNow={false}`：一次選很多個大檔時不會全部讀進記憶體）。手機的相簿、雲端硬碟給的檔案，
 * 讀取權限過一陣子會失效（DESIGN.md 的 FileDrop），讀不到時那一列顯示「讀不到這個檔案，請重新選檔」（PdfError 'unreadable'）。
 *
 * 大檔（BIG_FILE_BYTES 以上）：不在主執行緒讀，把 File 本身交給 Worker（qpdf 用 WORKERFS 直接讀、pdf.js 分段讀），
 * 結果是 Blob；沒有變小時結果就是原本的 File（不複製）。上限依等級與裝置記憶體（`maxFileBytes`）。
 */
import { downloadBlob, formatBytes, readAsBytes, zipFiles } from '@/core/files';
import {
  BIG_FILE_BYTES,
  createPdfClient,
  isBigFile,
  MAX_FILES,
  maxFileBytes,
  missingPdfFeatures,
  PDF_LEVELS,
  type PdfClient,
  PdfError,
  type PdfLevel,
  type PdfSource,
  precheck,
  revivePdfError,
} from '@/core/pdf';
import { needsWork, outputName, settingsKey, summarize, zipEntryNames } from './logic';
import { currentSettings, getItem, type Item, patchItem, useQueue } from './store';
import { S } from './strings';

/** 清單縮圖的寬（px） */
export const THUMB_WIDTH = 160;

let jobClient: PdfClient | null = null;
let viewClient: PdfClient | null = null;

export const jobs = () => {
  jobClient ??= createPdfClient({ name: 'PDF 壓縮' });
  return jobClient;
};

export const viewer = () => {
  viewClient ??= createPdfClient({ name: 'PDF 預覽' });
  return viewClient;
};

let seq = 0;
const nextId = () => `pdf-${++seq}`;

/** 測試掛鉤（e2e 用 addInitScript 設 `globalThis.__pdfCompressTest`；正式環境沒有）：調低大檔門檻與上限 */
interface TestHooks {
  bigFileBytes?: number;
  maxFileBytes?: number;
}
const testHooks = (): TestHooks =>
  (globalThis as { __pdfCompressTest?: TestHooks }).__pdfCompressTest ?? {};

/** 裝置記憶體（GB；Chrome、Android 才有） */
const deviceMemory = (): number | null =>
  (globalThis.navigator as { deviceMemory?: number } | undefined)?.deviceMemory ?? null;

/** 走大檔流程的門檻 */
export const bigThreshold = (): number => testHooks().bigFileBytes ?? BIG_FILE_BYTES;

/** 這個等級、這台裝置能處理的最大檔案 */
export const levelLimit = (level: PdfLevel): number =>
  testHooks().maxFileBytes ?? maxFileBytes(level, deviceMemory());

/** 加入檔案時的上限（所有等級裡最大的） */
export const addLimit = (): number => Math.max(...PDF_LEVELS.map(levelLimit));

/** 交給 Worker 的來源：大檔是 File 本身（Worker 直接讀），其他讀成位元組 */
async function sourceOf(file: File): Promise<{ source: PdfSource; big: boolean }> {
  if (isBigFile(file.size, bigThreshold())) return { source: file, big: true };
  return { source: await readFile(file), big: false };
}

const readHead = async (file: File) => readAsBytes(file.slice(0, 1100));

/** 讀整個檔案；讀不到（NotReadableError 等）時丟 PdfError('unreadable') */
export async function readFile(file: Blob): Promise<Uint8Array> {
  try {
    return await readAsBytes(file);
  } catch (e) {
    throw new PdfError('unreadable', e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  }
}

/**
 * 這一輪的編號：取消時加一。讀檔、壓縮回來之後編號不一樣了，表示中途按了取消（或已經開始了新的一輪），
 * 結果丟掉、不改那一列（開始後馬上取消，檔案還在讀時的競爭）。
 */
let generation = 0;

/** 加入時的檢查：不合格的原因（合格時 null） */
async function rejectReason(file: File): Promise<string | null> {
  if (file.size === 0) return S.rejectEmpty;
  const limit = addLimit();
  if (file.size > limit) return S.rejectTooLarge(formatBytes(file.size), formatBytes(limit));
  try {
    const head = await readHead(file);
    /* 只看檔頭（大小另外看過了）：precheck 對前 1100 位元組做同樣的檢查 */
    precheck(head);
    return null;
  } catch (e) {
    if (e instanceof PdfError && e.kind === 'not-pdf') return S.rejectNotPdf;
    return S.rejectRead;
  }
}

/** 加入檔案（不合格的不加入，合成一則狀態） */
export async function addFiles(files: readonly File[]): Promise<void> {
  const missing = missingPdfFeatures();
  if (missing.length) {
    useQueue.setState({ note: { tone: 'danger', text: S.unsupported(missing.join('、')) } });
    return;
  }
  const accepted: Item[] = [];
  const problems: string[] = [];
  let room = MAX_FILES - useQueue.getState().items.length;
  for (const file of files) {
    const why = await rejectReason(file);
    if (why) {
      problems.push(S.rejected(file.name, why));
      continue;
    }
    if (room <= 0) {
      problems.push(S.tooManyFiles(MAX_FILES));
      break;
    }
    room--;
    accepted.push({
      id: nextId(),
      file,
      name: file.name || 'PDF.pdf',
      size: file.size,
      pages: null,
      version: null,
      encrypted: false,
      missingFonts: [],
      thumb: null,
      password: null,
      passwordWrong: false,
      state: 'probing',
      progress: null,
      result: null,
      report: null,
      level: null,
      key: null,
      error: null,
    });
  }
  if (accepted.length) useQueue.setState((q) => ({ items: [...q.items, ...accepted] }));
  const text = [accepted.length ? S.added(accepted.length) : S.addedNone, ...problems].join('\n');
  useQueue.setState({
    note: {
      tone: problems.length ? (accepted.length ? 'warning' : 'danger') : 'success',
      text,
    },
  });
  for (const it of accepted) await probe(it.id);
}

/** 讀頁數、加密與第一頁的縮圖 */
async function probe(id: string, password: string | null = null): Promise<void> {
  const it = getItem(id);
  if (!it) return;
  try {
    const { source } = await sourceOf(it.file);
    const { info, thumb, missingFonts } = await viewer().probe(source, {
      password,
      fileName: it.name,
      thumbWidth: THUMB_WIDTH,
    });
    if (!getItem(id)) {
      thumb?.bitmap.close();
      return;
    }
    if (info.needsPassword) {
      patchItem(id, { state: 'password', encrypted: true, version: info.version });
      return;
    }
    getItem(id)?.thumb?.close();
    patchItem(id, {
      state: 'ready',
      pages: info.pages,
      version: info.version,
      encrypted: info.encrypted,
      missingFonts,
      thumb: thumb?.bitmap ?? null,
      password,
      passwordWrong: false,
    });
  } catch (e) {
    const err = revivePdfError(e);
    if (err.kind === 'wrong-password') {
      patchItem(id, { state: 'password', passwordWrong: true });
      return;
    }
    if (err.kind === 'aborted') return;
    patchItem(id, { state: 'error', error: { kind: err.kind, detail: err.detail } });
  }
}

export async function submitPassword(id: string, password: string): Promise<void> {
  if (!password) return;
  patchItem(id, { passwordWrong: false });
  await probe(id, password);
}

/** 開始壓縮：依序處理還沒用目前設定壓過的檔案；處理中加入的檔案、改了設定之後的檔案也會接著處理 */
export async function startAll(): Promise<void> {
  if (useQueue.getState().running) return;
  const key0 = settingsKey(currentSettings());
  const total = useQueue.getState().items.filter((it) => needsWork(workOf(it), key0)).length;
  if (!total) return;
  const gen = ++generation;
  const live = () => gen === generation && useQueue.getState().running;
  useQueue.setState({ running: true, batch: { index: 0, total }, note: null });
  let done = 0;
  let kept = 0;
  let failed = 0;
  let index = 0;
  const processed = new Set<string>();
  try {
    for (;;) {
      if (!live()) return;
      const settings = currentSettings();
      const key = settingsKey(settings);
      const next = useQueue
        .getState()
        .items.find((it) => !processed.has(it.id) && needsWork(workOf(it), key));
      if (!next) break;
      processed.add(next.id);
      index++;
      const remaining = useQueue
        .getState()
        .items.filter((it) => !processed.has(it.id) && needsWork(workOf(it), key)).length;
      useQueue.setState({ batch: { index, total: index + remaining } });
      const outcome = await compressOne(next.id, settings, key, live);
      if (outcome === 'aborted') return;
      if (outcome === 'done') done++;
      else if (outcome === 'kept') kept++;
      else failed++;
    }
    useQueue.setState({
      note: {
        tone: failed ? 'warning' : 'success',
        text: S.finished(done, kept, failed),
      },
    });
  } finally {
    if (gen === generation && useQueue.getState().running) {
      useQueue.setState({ running: false, batch: null });
    }
  }
}

const workOf = (it: Item) => ({ state: it.state, key: it.key, errorKind: it.error?.kind ?? null });

async function compressOne(
  id: string,
  settings: ReturnType<typeof currentSettings>,
  key: string,
  live: () => boolean,
): Promise<'done' | 'kept' | 'error' | 'aborted'> {
  const it = getItem(id);
  if (!it) return 'error';
  patchItem(id, { state: 'running', progress: { stage: 'inspect' }, error: null });
  try {
    /* 這個等級、這台裝置的上限（換等級可能就可以） */
    const limit = levelLimit(settings.level);
    if (it.size > limit) throw new PdfError('too-large', String(limit));
    const { source, big } = await sourceOf(it.file);
    /* 讀檔的時候按了取消 */
    if (!live()) return 'aborted';
    const report = await jobs().compress(
      source,
      { settings, password: it.password, fileName: it.name, big },
      (p) => {
        if (live() && getItem(id)?.state === 'running') patchItem(id, { progress: p });
      },
    );
    if (!live()) return 'aborted';
    if (!getItem(id)) return 'error';
    /*
     * 小檔：保留原檔時也用讀出來的位元組（原本的 File 之後可能讀不到）。
     * 大檔：Worker 傳回 Blob（沒有變小時就是原本的 File），不複製。
     */
    const result =
      report.bytes instanceof Blob
        ? report.bytes
        : new Blob([report.bytes as BlobPart], { type: 'application/pdf' });
    const summary = summarize(report);
    patchItem(id, {
      state: report.kept ? 'kept' : 'done',
      progress: null,
      result,
      report: summary,
      level: settings.level,
      key,
      pages: report.pages || it.pages,
      missingFonts: report.missingFonts.length ? report.missingFonts : it.missingFonts,
    });
    useQueue.setState({
      announce: report.kept
        ? S.announceKept(it.name)
        : S.announceDone(
            it.name,
            formatBytes(report.originalBytes),
            formatBytes(report.outputBytes),
          ),
    });
    return report.kept ? 'kept' : 'done';
  } catch (e) {
    const err = revivePdfError(e);
    if (err.kind === 'aborted' || !live()) {
      /* 取消已經把這一列改回等待；新的一輪可能已經在處理它，不要再動 */
      return 'aborted';
    }
    if (err.kind === 'password' || err.kind === 'wrong-password') {
      patchItem(id, {
        state: 'password',
        passwordWrong: err.kind === 'wrong-password',
        progress: null,
      });
      return 'error';
    }
    /* 記憶體不足：結束這個 Worker（放掉它的記憶體），下一個檔案用新的 Worker */
    if (err.kind === 'memory') jobs().cancel();
    patchItem(id, {
      state: 'error',
      progress: null,
      level: settings.level,
      key,
      error: { kind: err.kind, detail: err.detail },
    });
    return 'error';
  }
}

/** 取消：結束壓縮的 Worker；處理中的回到等待 */
export function cancelAll(): void {
  if (!useQueue.getState().running) return;
  generation++;
  useQueue.setState({ running: false, batch: null, note: { tone: 'info', text: S.cancelled } });
  jobs().cancel();
  for (const it of useQueue.getState().items) {
    if (it.state === 'running') patchItem(it.id, { state: 'ready', progress: null });
  }
}

/** 重試一列（錯誤之後）：回到等待並開始 */
export async function retry(id: string): Promise<void> {
  const it = getItem(id);
  if (!it) return;
  /* 讀不出頁數（加入時就失敗）：重新讀一次 */
  if (it.pages === null && !it.report) {
    patchItem(id, { state: 'probing', error: null });
    await probe(id, it.password);
    if (getItem(id)?.state !== 'ready') return;
  } else {
    patchItem(id, { state: 'ready', error: null, key: null });
  }
  await startAll();
}

export function removeItem(id: string): void {
  const it = getItem(id);
  if (!it || it.state === 'running') return;
  it.thumb?.close();
  useQueue.setState((q) => ({ items: q.items.filter((x) => x.id !== id) }));
}

export function clearAll(): void {
  if (useQueue.getState().running) return;
  for (const it of useQueue.getState().items) it.thumb?.close();
  useQueue.setState({ items: [], note: null, announce: '' });
}

export function downloadOne(id: string): void {
  const it = getItem(id);
  if (!it?.result) return;
  downloadBlob(it.result, outputName(it.name, it.state === 'kept'));
}

/** 完成的檔案（壓縮的與保留原檔的） */
export function finishedItems(items: readonly Item[]): Item[] {
  return items.filter((it) => (it.state === 'done' || it.state === 'kept') && it.result);
}

export async function downloadZip(): Promise<void> {
  const list = finishedItems(useQueue.getState().items);
  if (!list.length) return;
  const names = zipEntryNames(list.map((it) => ({ name: it.name, kept: it.state === 'kept' })));
  const entries = await Promise.all(
    list.map(async (it, i) => ({
      name: names[i],
      data: await readAsBytes(it.result!),
      level: 0 as const,
    })),
  );
  const zip = zipFiles(entries, { level: 0 });
  downloadBlob(new Blob([zip], { type: 'application/zip' }), S.zipName);
}
