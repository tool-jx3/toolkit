/**
 * 清單的動作：加入檔案（檢查、讀頁數與縮圖）、密碼、開始壓縮（依序一個一個）、取消、重試、移除、下載、ZIP。
 * PDF 的處理都在 core/pdf 的 Worker 裡：一個做壓縮（取消＝結束它），一個讀縮圖與前後比對的頁面（壓縮中也能用）。
 */
import { downloadBlob, formatBytes, readAsBytes, zipFiles } from '@/core/files';
import {
  createPdfClient,
  MAX_FILE_BYTES,
  MAX_FILES,
  type PdfClient,
  PdfError,
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

const readHead = async (file: File) => readAsBytes(file.slice(0, 1100));

/** 加入時的檢查：不合格的原因（合格時 null） */
async function rejectReason(file: File): Promise<string | null> {
  if (file.size === 0) return S.rejectEmpty;
  if (file.size > MAX_FILE_BYTES) {
    return S.rejectTooLarge(formatBytes(file.size), formatBytes(MAX_FILE_BYTES));
  }
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
    const bytes = await readAsBytes(it.file);
    const { info, thumb } = await viewer().probe(bytes, {
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
  useQueue.setState({ running: true, batch: { index: 0, total }, note: null });
  let done = 0;
  let kept = 0;
  let failed = 0;
  let index = 0;
  const processed = new Set<string>();
  try {
    for (;;) {
      if (!useQueue.getState().running) return;
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
      const outcome = await compressOne(next.id, settings, key);
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
    if (useQueue.getState().running) useQueue.setState({ running: false, batch: null });
  }
}

const workOf = (it: Item) => ({ state: it.state, key: it.key, errorKind: it.error?.kind ?? null });

async function compressOne(
  id: string,
  settings: ReturnType<typeof currentSettings>,
  key: string,
): Promise<'done' | 'kept' | 'error' | 'aborted'> {
  const it = getItem(id);
  if (!it) return 'error';
  patchItem(id, { state: 'running', progress: { stage: 'inspect' }, error: null });
  try {
    const bytes = await readAsBytes(it.file);
    const report = await jobs().compress(
      bytes,
      { settings, password: it.password, fileName: it.name },
      (p) => {
        if (getItem(id)?.state === 'running') patchItem(id, { progress: p });
      },
    );
    if (!getItem(id)) return 'error';
    const result = report.kept
      ? it.file
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
    if (err.kind === 'aborted') {
      if (getItem(id)) patchItem(id, { state: 'ready', progress: null });
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
