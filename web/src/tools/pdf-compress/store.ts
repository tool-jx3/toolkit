/**
 * 狀態：
 * - useSettings：等級與進階設定（存在瀏覽器，F13）。
 * - useQueue：這次開頁的檔案清單、進度與結果（不存：PDF 與密碼都不留在瀏覽器裡）。
 */
import { create } from 'zustand';
import {
  DEFAULT_ADVANCED,
  DEFAULT_LEVEL,
  DPI_RANGE,
  PDF_LEVELS,
  type PdfAdvanced,
  type PdfErrorKind,
  type PdfLevel,
  type Progress,
  QUALITY_RANGE,
  type ResolvedSettings,
  resolveSettings,
} from '@/core/pdf';
import { createToolStore } from '@/core/storage';
import type { ItemState, ReportSummary } from './logic';

export const TOOL_ID = 'pdf-compress';

export interface Settings {
  level: PdfLevel;
  advanced: PdfAdvanced;
}

export const DEFAULT_SETTINGS: Settings = {
  level: DEFAULT_LEVEL,
  advanced: { ...DEFAULT_ADVANCED },
};

export const useSettings = createToolStore<Settings>(TOOL_ID, DEFAULT_SETTINGS);

/* 存檔裡的值不合法時（被改壞、舊版本）修正一次 */
{
  const d = useSettings.getState().data;
  const inRange = (v: unknown, r: { min: number; max: number }) =>
    v === null || (typeof v === 'number' && v >= r.min && v <= r.max);
  if (
    !PDF_LEVELS.includes(d.level) ||
    !inRange(d.advanced?.quality, QUALITY_RANGE) ||
    !inRange(d.advanced?.dpi, DPI_RANGE)
  ) {
    useSettings.getState().patch({
      level: PDF_LEVELS.includes(d.level) ? d.level : DEFAULT_LEVEL,
      advanced: {
        ...DEFAULT_ADVANCED,
        ...d.advanced,
        quality: inRange(d.advanced?.quality, QUALITY_RANGE) ? d.advanced.quality : null,
        dpi: inRange(d.advanced?.dpi, DPI_RANGE) ? d.advanced.dpi : null,
      },
    });
  }
}

export function currentSettings(): ResolvedSettings {
  const d = useSettings.getState().data;
  return resolveSettings(d.level, d.advanced);
}

/* ---------- 清單 ---------- */

export interface ItemError {
  kind: PdfErrorKind;
  /** qpdf 等引擎的原文 */
  detail: string;
}

export interface Item {
  id: string;
  file: File;
  name: string;
  size: number;
  pages: number | null;
  version: string | null;
  encrypted: boolean;
  /** 沒有內嵌的中日韓字型（加入時或壓縮後才知道；預覽會缺字） */
  missingFonts: string[];
  thumb: ImageBitmap | null;
  password: string | null;
  passwordWrong: boolean;
  state: ItemState;
  progress: Progress | null;
  /** 結果（保留原檔時是原檔本身） */
  result: Blob | null;
  report: ReportSummary | null;
  /** 壓縮（或失敗）時的等級 */
  level: PdfLevel | null;
  /** 壓縮（或失敗）時的設定指紋 */
  key: string | null;
  error: ItemError | null;
}

export interface Queue {
  items: Item[];
  running: boolean;
  /** 這一輪的第幾個／共幾個 */
  batch: { index: number; total: number } | null;
  /** 狀態列（批次的結果、取消、加入了幾個） */
  note: { tone: 'info' | 'success' | 'warning' | 'danger' | 'progress'; text: string } | null;
  /** 給螢幕閱讀器的完成訊息 */
  announce: string;
}

export const useQueue = create<Queue>(() => ({
  items: [],
  running: false,
  batch: null,
  note: null,
  announce: '',
}));

export function patchItem(id: string, patch: Partial<Item>): void {
  useQueue.setState((q) => ({
    items: q.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
  }));
}

export function getItem(id: string): Item | undefined {
  return useQueue.getState().items.find((it) => it.id === id);
}
