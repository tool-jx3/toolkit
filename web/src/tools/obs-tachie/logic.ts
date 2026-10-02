/**
 * Discord 通話立繪產生器的規則（規格第 3 節）：繪製尺寸與名字的基準寬度、說話效果需要的邊距、
 * 名字的內容、下載檔名、圖片網址的處理方式。純函式（單元測試用）。
 */
import type { ImageUrlKind } from '@/ccfolia';
import { singleLine } from '@/core/css';
import { axesOf, type NameLabel, type Preset, type TachieUser } from './model';

export interface Size {
  width: number;
  height: number;
}

/* ---------- 尺寸 ---------- */

export interface Geometry {
  /** 繪製寬度（不知道時 null＝以圖片本身的大小） */
  drawW: number | null;
  /** 繪製高度（量得到圖片尺寸時才有） */
  drawH: number | null;
  /** 名字的基準寬度＝指定的寬度，否則量得到的實際寬度；都沒有時 null */
  baseW: number | null;
  /** 基準寬度來自圖片的實際寬度（換圖要重新輸出） */
  baseFromActual: boolean;
  /** 量得到實際尺寸（繪製尺寸寫死） */
  sized: boolean;
}

/**
 * 繪製尺寸（3.4.3）：量得到圖片實際尺寸時，W＝指定寬度（沒指定就是實際寬），
 * H＝W × 實際高 ÷ 實際寬（四捨五入，至少 1px）。量不到時只知道指定的寬度。
 */
export function geometry(p: Pick<Preset, 'width'>, natural: Size | null): Geometry {
  const w = p.width && p.width > 0 ? p.width : null;
  if (natural && natural.width > 0 && natural.height > 0) {
    const drawW = w ?? natural.width;
    const drawH = Math.max(1, Math.round((drawW * natural.height) / natural.width));
    return { drawW, drawH, baseW: drawW, baseFromActual: w === null, sized: true };
  }
  return { drawW: w, drawH: null, baseW: w, baseFromActual: false, sized: false };
}

/* ---------- 說話效果需要的邊距（F27） ---------- */

/** 外框光暈實際使用的寬度（0 以下當 1） */
export const glowW = (p: Pick<Preset, 'glowWidth'>): number => (p.glowWidth > 0 ? p.glowWidth : 1);

/**
 * 非中央的軸上，說話效果需要離來源邊緣多遠才不會被切掉：外框光暈開時＝⌈7 × 外框寬度⌉，
 * 錨點在上方且彈跳開時垂直再加彈跳高度。中央的軸回傳 null（不提示）。
 */
export function effectMargins(
  p: Pick<Preset, 'anchor' | 'glow' | 'glowWidth' | 'bounce' | 'bounceHeight'>,
): { x: number | null; y: number | null } {
  const { x, y } = axesOf(p.anchor);
  const glow = p.glow ? Math.ceil(7 * glowW(p)) : 0;
  return {
    x: x === 'center' ? null : glow,
    y: y === 'center' ? null : glow + (y === 'top' && p.bounce ? Math.max(0, p.bounceHeight) : 0),
  };
}

export type MarginHint = { kind: 'need' | 'warn'; value: number } | null;

/** 標籤旁的提示：所需為 0 時不顯示；距離小於所需時警告 */
export function marginHint(required: number | null, distance: number): MarginHint {
  if (required === null || required <= 0) return null;
  return { kind: distance < required ? 'warn' : 'need', value: required };
}

/* ---------- 名字 ---------- */

/** 名字的內容：畫面上的名字，空白時用備忘名稱；換行與控制字元換成空白、單行、去掉前後空白 */
export function nameText(u: Pick<TachieUser, 'memo' | 'name'> | null | undefined): string {
  if (!u) return '';
  return singleLine(u.name) || singleLine(u.memo);
}

/** 名字需要基準寬度嗎（對齊不是靠左，或字幕條鋪滿立繪寬度）（F59） */
export const labelNeedsBase = (l: Pick<NameLabel, 'align' | 'bar' | 'barWidth'>): boolean =>
  l.align !== 'left' || (l.bar && l.barWidth === 'fill');

/** 名字顯示開著、需要基準寬度、卻沒有基準寬度（對齊寫不進輸出） */
export const alignLost = (p: Pick<Preset, 'label'>, g: Pick<Geometry, 'baseW'>): boolean =>
  p.label.show && labelNeedsBase(p.label) && g.baseW === null;

/* ---------- 下載檔名（3.5） ---------- */

/**
 * `streamkit-<主幹>.css`：主幹＝人的備忘名稱（空白時用 ID）＋「-」＋預設集名稱（空白時用 preset）。
 * 去掉前後空白；連續的「文字、數字、. _ - 以外的字元」換成一個「_」；去掉開頭與結尾的「_」；結果空白時用 streamkit。
 */
export function cssFileName(user: Pick<TachieUser, 'id' | 'memo'>, presetName: string): string {
  return `streamkit-${cssFileStem(user, presetName)}.css`;
}

export function cssFileStem(user: Pick<TachieUser, 'id' | 'memo'>, presetName: string): string {
  const who = user.memo.trim() || user.id;
  const what = presetName.trim() || 'preset';
  const stem = `${who}-${what}`
    .trim()
    .replace(/[^\p{L}\p{M}\p{N}._-]+/gu, '_')
    .replace(/^_+|_+$/g, '');
  return stem || 'streamkit';
}

/* ---------- 圖片網址的處理方式（3.3） ---------- */

export type UrlMode = 'auto' | 'direct' | 'embed';

/** data：直接採用（嵌入）；keep：保留網址；fetch：下載轉 data URI（失敗時保留網址並警告） */
export type UrlPlan = 'data' | 'keep' | 'fetch';

export function urlPlan(kind: ImageUrlKind, mode: UrlMode): UrlPlan {
  if (kind === 'data') return 'data';
  if (mode === 'direct') return 'keep';
  if (mode === 'embed') return 'fetch';
  return kind === 'direct' ? 'keep' : 'fetch';
}

/** 結果訊息的種類（介面依此組出文字） */
export type UrlOutcome =
  | { how: 'data' | 'direct' | 'embedded' | 'expiringEmbedded' | 'otherEmbedded'; warn: null }
  | { how: 'direct'; warn: 'expiring' | 'other' | null }
  | { how: 'direct'; warn: 'embedFailed' | 'expiringFailed' | 'otherFailed'; reason: string };

/** 依網址種類、處理方式與下載結果，決定「已設定（方式）」與後面接的警告 */
export function urlOutcome(
  kind: ImageUrlKind,
  mode: UrlMode,
  fetched: { ok: true } | { ok: false; reason: string } | null,
): UrlOutcome {
  const plan = urlPlan(kind, mode);
  if (plan === 'data') return { how: 'data', warn: null };
  if (plan === 'keep') {
    if (kind === 'expiring') return { how: 'direct', warn: 'expiring' };
    if (kind === 'other') return { how: 'direct', warn: 'other' };
    return { how: 'direct', warn: null };
  }
  if (fetched?.ok) {
    if (mode === 'auto' && kind === 'expiring') return { how: 'expiringEmbedded', warn: null };
    if (mode === 'auto' && kind === 'other') return { how: 'otherEmbedded', warn: null };
    return { how: 'embedded', warn: null };
  }
  const reason = fetched && !fetched.ok ? fetched.reason : '';
  if (mode === 'auto' && kind === 'expiring')
    return { how: 'direct', warn: 'expiringFailed', reason };
  if (mode === 'auto' && kind === 'other') return { how: 'direct', warn: 'otherFailed', reason };
  return { how: 'direct', warn: 'embedFailed', reason };
}

/* ---------- 預覽的狀態 ---------- */

export type PreviewStatus = 'quiet' | 'speaking' | 'awayShown' | 'awayHidden';

export function previewStatus(inChannel: boolean, speaking: boolean, hideAway: boolean) {
  if (!inChannel) return hideAway ? 'awayHidden' : 'awayShown';
  return speaking ? 'speaking' : 'quiet';
}
