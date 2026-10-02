/**
 * 配布目標（匯出用途）：CCFOLIA 的切入演出、Discord 伺服器貼圖、Discord 訊息附件。
 * 容量上限、可用格式、固定尺寸、透明度支援是外部平台的事實（觀察日期 2026-10-01）；改版時只改這裡。
 *
 * - checkTarget：依目前的匯出設定列出錯誤／警告／資訊（IssueList 顯示）。
 * - nextShrinkStep：檔案超過上限時「自動縮小檔案」的下一步（每次只降一級，並說明降了什麼）。
 */

import { formatLimitBytes, usagePercent } from '../core/files';

export type TargetId = 'ccfolia-cutin' | 'discord-sticker' | 'discord-attachment';
export type TargetFormat = 'apng' | 'gif' | 'png';

export interface ExportTarget {
  id: TargetId;
  label: string;
  /** 容量上限（位元組） */
  maxBytes: number;
  /** 可用格式（第一個是預設） */
  formats: readonly TargetFormat[];
  /** 固定尺寸（尺寸不對會被平台退回）；null＝可改 */
  fixedSize: { width: number; height: number } | null;
  /** 預設尺寸、影格數、fps */
  defaultSize: { width: number; height: number };
  defaultFrames: number;
  defaultFps: number;
  /** 建議字數上限（實際顯示時字不會太小） */
  suggestedChars: number;
  /** 預設的 GIF 底色（null＝不合成） */
  gifMatte: string | null;
  /** full：可以用半透明（APNG）；binary：實際只會用到一階透明的 GIF */
  transparency: 'full' | 'binary';
  /** 在聊天或畫面上實際顯示的大小（px，自動加粗外框等的依據） */
  displaySize: number;
  observed: string;
}

/** Discord 暗色主題的聊天背景色 */
export const DISCORD_DARK_BG = '#313338';

export const EXPORT_TARGETS: Record<TargetId, ExportTarget> = {
  'ccfolia-cutin': {
    id: 'ccfolia-cutin',
    label: 'CCFOLIA 切入演出',
    maxBytes: 1_000_000,
    formats: ['apng', 'gif', 'png'],
    fixedSize: null,
    defaultSize: { width: 480, height: 480 },
    defaultFrames: 15,
    defaultFps: 20,
    suggestedChars: 20,
    gifMatte: null,
    transparency: 'full',
    displaySize: 480,
    observed: '2026-10-01',
  },
  'discord-sticker': {
    id: 'discord-sticker',
    label: 'Discord 伺服器貼圖',
    maxBytes: 512_000,
    formats: ['apng', 'png'],
    fixedSize: { width: 320, height: 320 },
    defaultSize: { width: 320, height: 320 },
    defaultFrames: 12,
    defaultFps: 20,
    suggestedChars: 8,
    gifMatte: null,
    transparency: 'full',
    displaySize: 160,
    observed: '2026-10-01',
  },
  'discord-attachment': {
    id: 'discord-attachment',
    label: 'Discord 訊息附件',
    maxBytes: 8_000_000,
    formats: ['gif', 'png'],
    fixedSize: null,
    defaultSize: { width: 720, height: 720 },
    defaultFrames: 30,
    defaultFps: 30,
    suggestedChars: 20,
    gifMatte: DISCORD_DARK_BG,
    transparency: 'binary',
    displaySize: 400,
    observed: '2026-10-01',
  },
};

export const TARGET_IDS: readonly TargetId[] = [
  'ccfolia-cutin',
  'discord-sticker',
  'discord-attachment',
];

export const TARGET_FORMAT_LABELS: Record<TargetFormat, string> = {
  apng: 'APNG',
  gif: 'GIF',
  png: 'PNG 靜態圖',
};

/** 寬 × 高 × 影格數的上限：超過 error 可能讓瀏覽器當掉；超過 warning 匯出很久 */
export const PIXEL_BUDGET = { error: 40_000_000, warning: 24_000_000 } as const;

/** 容量的顯示（規格 3.1.5）與百分比：共用 core/files 的實作 */
export { formatLimitBytes, usagePercent };

export type IssueLevel = 'error' | 'warning' | 'info';

export interface TargetIssue {
  level: IssueLevel;
  /** 條件代號（工具可以依代號換掉文字） */
  code:
    | 'format'
    | 'size'
    | 'gif-binary-alpha'
    | 'gif-matte-opaque'
    | 'pixels-error'
    | 'pixels-warning'
    | 'chars-target'
    | 'chars-font'
    | 'too-large';
  message: string;
}

export interface TargetCheckInput {
  format: TargetFormat;
  width: number;
  height: number;
  frames: number;
  /** GIF 底色（null＝不合成） */
  gifMatte?: string | null;
  /** 背景是透明的 */
  transparentBackground?: boolean;
  /** 字數（字素） */
  charCount?: number;
  /** 目前字型的建議字數 */
  fontSuggestedChars?: number;
  /** 上次匯出的大小（位元組；沒有匯出過時不給） */
  lastBytes?: number | null;
}

/** 依用途檢查目前的設定（錯誤不擋匯出，只是提醒） */
export function checkTarget(target: ExportTarget, s: TargetCheckInput): TargetIssue[] {
  const out: TargetIssue[] = [];
  const fmt = TARGET_FORMAT_LABELS[s.format];
  if (!target.formats.includes(s.format))
    out.push({
      level: 'error',
      code: 'format',
      message: `${target.label}不接受 ${fmt}；可用的格式：${target.formats.map((f) => TARGET_FORMAT_LABELS[f]).join('、')}。`,
    });
  if (
    target.fixedSize &&
    (s.width !== target.fixedSize.width || s.height !== target.fixedSize.height)
  )
    out.push({
      level: 'error',
      code: 'size',
      message: `${target.label}的尺寸必須正好是 ${target.fixedSize.width} × ${target.fixedSize.height}（目前 ${s.width} × ${s.height}），否則會被退回。`,
    });
  if (
    target.transparency === 'binary' &&
    s.format === 'gif' &&
    !s.gifMatte &&
    s.transparentBackground !== false
  )
    out.push({
      level: 'warning',
      code: 'gif-binary-alpha',
      message: 'GIF 的透明只有全透明與不透明兩種，半透明的外框邊緣會變得粗糙；建議合成底色。',
    });
  if (target.transparency === 'full' && s.format === 'gif' && s.gifMatte)
    out.push({
      level: 'info',
      code: 'gif-matte-opaque',
      message: '合成底色後整張不再透明，放到地圖上會是一整塊方形的底。',
    });
  const pixels = s.width * s.height * Math.max(1, s.format === 'png' ? 1 : s.frames);
  if (pixels > PIXEL_BUDGET.error)
    out.push({
      level: 'error',
      code: 'pixels-error',
      message: '尺寸 × 影格數太大，可能讓瀏覽器當掉；請縮小尺寸或減少影格。',
    });
  else if (pixels > PIXEL_BUDGET.warning)
    out.push({
      level: 'warning',
      code: 'pixels-warning',
      message: '尺寸 × 影格數很大，匯出會花比較久，部分裝置可能做不完。',
    });
  if (s.charCount !== undefined && s.charCount > target.suggestedChars)
    out.push({
      level: 'warning',
      code: 'chars-target',
      message: `字數超過 ${target.label}的建議（${target.suggestedChars} 字），實際顯示時每個字會太小。`,
    });
  if (
    s.charCount !== undefined &&
    s.fontSuggestedChars !== undefined &&
    s.charCount > s.fontSuggestedChars
  )
    out.push({
      level: 'warning',
      code: 'chars-font',
      message: `這個字型建議 ${s.fontSuggestedChars} 字以內。`,
    });
  if (s.lastBytes != null && s.lastBytes > target.maxBytes)
    out.push({
      level: 'error',
      code: 'too-large',
      message: `上次匯出的大小 ${formatLimitBytes(s.lastBytes)} 超過${target.label}的上限 ${formatLimitBytes(target.maxBytes)}。`,
    });
  return out;
}

/** 建議字數：用途與字型兩者較小的那個 */
export function suggestedChars(target: ExportTarget, fontSuggested?: number): number {
  return fontSuggested !== undefined
    ? Math.min(target.suggestedChars, fontSuggested)
    : target.suggestedChars;
}

/* ---------- 自動縮小檔案 ---------- */

export interface ShrinkState {
  format: TargetFormat;
  /** 色數（0＝無損；GIF 不受影響） */
  colors: number;
  frames: number;
  width: number;
  height: number;
  /** 放射速度線的條數（沒有這個特效時不給或 null） */
  lines?: number | null;
}

export interface ShrinkStep {
  patch: Partial<ShrinkState>;
  /** 這一步降了什麼（例如「色數 256 → 128」） */
  description: string;
}

/**
 * 自動縮小的下一步（每次只做第一個符合的步驟；都不符合時回傳 null＝已無可再降的項目）：
 * 1. 色數（APNG、PNG）：無損先改成 256 色；大於 128 降到 128；大於 64 降到 64。GIF 跳過。
 * 2. 影格數（動畫）大於 10：減 3，但不少於 10。
 * 3. 放射速度線大於 16 條：乘 0.7 四捨五入，但不少於 16。
 * 4. 不是固定尺寸、短邊大於 240：寬高各乘 0.8 四捨五入。
 */
export function nextShrinkStep(target: ExportTarget, s: ShrinkState): ShrinkStep | null {
  if (s.format !== 'gif') {
    if (s.colors === 0) return { patch: { colors: 256 }, description: '色數 無損 → 256 色' };
    if (s.colors > 128) return { patch: { colors: 128 }, description: `色數 ${s.colors} → 128 色` };
    if (s.colors > 64) return { patch: { colors: 64 }, description: `色數 ${s.colors} → 64 色` };
  }
  if (s.format !== 'png' && s.frames > 10) {
    const frames = Math.max(10, s.frames - 3);
    return { patch: { frames }, description: `影格數 ${s.frames} → ${frames} 格` };
  }
  if (s.lines != null && s.lines > 16) {
    const lines = Math.max(16, Math.round(s.lines * 0.7));
    return { patch: { lines }, description: `放射速度線 ${s.lines} → ${lines} 條` };
  }
  if (!target.fixedSize && Math.min(s.width, s.height) > 240) {
    const width = Math.round(s.width * 0.8);
    const height = Math.round(s.height * 0.8);
    return {
      patch: { width, height },
      description: `尺寸 ${s.width} × ${s.height} → ${width} × ${height}`,
    };
  }
  return null;
}
