/**
 * 批次匯出（P11 新增）：一次匯出多個，結果交給共用匯出區的多檔結果（全部下載、打包成 ZIP）。
 *
 * - 每一行各一個（標語、字幕）：主文字的每一個非空行各做一個，副文字照用；副文字的行數跟主文字一樣（兩行以上）時依行配對。
 * - 每一頁各一個（長文）：依空白行分頁，每一頁各做一個（不管「空白行＝換頁」開關）。
 * - 勾選的範本：目前模式的內建範本與我的範本，各自用範本的設定與文字（內建範本有記住的文字時用記住的），
 *   畫面尺寸、登場與退場開關照目前的設定（同套用範本）；我的範本只保留畫面尺寸（同套用我的範本）。
 * 檔名：`<序號>_<自動檔名>`（序號 2 位數，超過 99 個時 3 位數）；填了檔名時 `<檔名>_<序號>`。
 */
import type { AnimationExportFormat } from '@/core/timeline';
import type { ExportBatchOutput, ExportOutput } from '@/ui';
import { runExport } from './exporter';
import { autoFileName, sanitizeName } from './filename';
import { TEMPLATES } from './library';
import type { MyTemplate } from './mine';
import { deepClone, type Mode, type Settings, splitPages } from './settings';
import { mineEntry, type TfxData, templateEntry } from './store';

export type BatchKind = 'off' | 'lines' | 'templates';

export interface BatchItem {
  cfg: Settings;
  /** 清單與進度顯示用的名稱（行的文字或範本名稱） */
  label: string;
}

const nonEmptyLines = (text: string) =>
  String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

/** 每一行（長文：每一頁）各一個 */
export function batchByLines(cfg: Settings): BatchItem[] {
  if (cfg.mode === 'long') {
    return splitPages(cfg.text, true).map((page) => {
      const c = deepClone(cfg);
      c.text = page;
      return { cfg: c, label: page.split('\n')[0].trim() };
    });
  }
  const lines = nonEmptyLines(cfg.text);
  const subs = nonEmptyLines(cfg.sub);
  const pair = lines.length > 1 && subs.length === lines.length;
  return lines.map((line, i) => {
    const c = deepClone(cfg);
    c.text = line;
    if (pair) c.sub = subs[i];
    return { cfg: c, label: line };
  });
}

/** 範本的選取鍵：內建 `b:<id>`、我的範本 `m:<id>` */
export const builtinKey = (id: string) => `b:${id}`;
export const mineKey = (id: string) => `m:${id}`;

/** 這個模式可以勾的範本（內建依原本的順序，接著是我的範本） */
export function batchChoices(
  mode: Mode,
  mine: readonly MyTemplate[],
): { key: string; name: string; group: string }[] {
  return [
    ...TEMPLATES[mode].map((t) => ({ key: builtinKey(t.id), name: t.name, group: t.group })),
    ...mine
      .filter((t) => t.mode === mode)
      .map((t) => ({ key: mineKey(t.id), name: t.name.trim() || '未命名範本', group: '我的範本' })),
  ];
}

/** 勾選的範本各一個（依清單的順序；已經不存在的略過） */
export function batchByTemplates(
  d: TfxData,
  picked: readonly string[],
  mine: readonly MyTemplate[],
): BatchItem[] {
  const mode = d.mode;
  const cur = d.modes[mode];
  const set = new Set(picked);
  const out: BatchItem[] = [];
  for (const t of TEMPLATES[mode]) {
    if (!set.has(builtinKey(t.id))) continue;
    out.push({ cfg: templateEntry(d, mode, t.id, cur.s).s, label: t.name });
  }
  for (const t of mine) {
    if (t.mode !== mode || !set.has(mineKey(t.id))) continue;
    out.push({ cfg: mineEntry(cur, t.s, mode, t.id).s, label: t.name.trim() || '未命名範本' });
  }
  return out;
}

/** 每個檔案的檔名主體 */
export function batchNames(items: readonly BatchItem[], manual: string): string[] {
  const w = items.length > 99 ? 3 : 2;
  const base = manual ? sanitizeName(manual.replace(/\.(png|gif|webp|zip)$/i, '')) : '';
  return items.map((it, i) => {
    const n = String(i + 1).padStart(w, '0');
    return base ? sanitizeName(`${base}_${n}`) : sanitizeName(`${n}_${autoFileName(it.cfg)}`);
  });
}

/** 打包成 ZIP 的檔名主體：填了檔名時「<檔名>_批次」；依行「<自動檔名>_批次」；依範本「文字演出_範本批次」 */
export function batchZipName(kind: BatchKind, cfg: Settings, manual: string): string {
  if (manual) return sanitizeName(`${manual.replace(/\.(png|gif|webp|zip)$/i, '')}_批次`);
  return kind === 'templates' ? '文字演出_範本批次' : sanitizeName(`${autoFileName(cfg)}_批次`);
}

export interface RunBatchOptions {
  items: readonly BatchItem[];
  names: readonly string[];
  zipName: string;
  /** 結果上方的說明（例如「每一行各一個，共 3 個」） */
  summary: string;
  format: AnimationExportFormat;
  fps: number;
  plays: number;
  scale: number;
  quantize: boolean;
  signal: AbortSignal;
  onProgress: (ratio: number, label?: string) => void;
}

/** 依序匯出每一個；有一個失敗就停下來，錯誤訊息標出是第幾個 */
export async function runBatch(o: RunBatchOptions): Promise<ExportBatchOutput> {
  const n = o.items.length;
  const files: ExportOutput[] = [];
  for (let i = 0; i < n; i++) {
    if (o.signal.aborted) throw new DOMException('已取消', 'AbortError');
    const it = o.items[i];
    const tag = `第 ${i + 1}／${n} 個（${it.label}）`;
    try {
      const { result: _r, ...out } = await runExport({
        cfg: it.cfg,
        format: o.format,
        fps: o.fps,
        plays: o.plays,
        scale: o.scale,
        quantize: o.quantize,
        name: o.names[i],
        pausedAt: null,
        signal: o.signal,
        onProgress: (ratio, label) =>
          o.onProgress((i + Math.min(1, Math.max(0, ratio))) / n, label ? `${tag}・${label}` : tag),
      });
      files.push(out);
    } catch (e) {
      if ((e instanceof DOMException && e.name === 'AbortError') || o.signal.aborted) throw e;
      throw new Error(`${tag}：${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { files, zipName: o.zipName, details: [{ label: '批次', value: o.summary }] };
}
