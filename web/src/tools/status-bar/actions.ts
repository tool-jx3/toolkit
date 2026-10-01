/**
 * 需要預覽框量測的動作：算來源大小（範例時以「範例名稱」與「10 個字的名稱」取較大值）、
 * 產生要匯出的 CSS、複製角色的網址與 CSS。
 */
import { copyText } from '@/core/files';
import type { CssPreviewFrameHandle } from '@/ui';
import { buildStatusBarCss, type CssTarget } from './css';
import { type Box, estimateSourceSize } from './geometry';
import { characterSourceUrl, cssTargetFor } from './logic';
import { type Character, type Settings, TEN_CHAR_NAME } from './settings';
import { setStatus, usePreview } from './store';
import { S } from './strings';
import { templateById } from './templates';

let frame: CssPreviewFrameHandle | null = null;

/** 預覽框掛上／卸下時登記 */
export function registerFrame(h: CssPreviewFrameHandle | null): void {
  frame = h;
}

export const templateNameOf = (s: Settings): string | null =>
  templateById(s.templateId)?.name ?? null;

/** 預覽與量測用的 CSS（開頭說明不寫來源大小） */
export function previewCss(s: Settings, target: CssTarget): string {
  return buildStatusBarCss(s, target, { templateName: templateNameOf(s) });
}

/** 匯出用的完整 CSS（開頭說明寫入來源大小） */
export function exportCss(s: Settings, target: CssTarget, size: Box): string {
  return buildStatusBarCss(s, target, { templateName: templateNameOf(s), size });
}

const maxBox = (a: Box, b: Box | null): Box =>
  b ? { width: Math.max(a.width, b.width), height: Math.max(a.height, b.height) } : a;

/**
 * 這個對象的來源大小：在預覽框裡套用它的 CSS 量 #root；範例時再以 10 個字的名稱量一次，取寬高的較大值。
 * 預覽框還沒準備好時用估算值。
 */
export function measureTarget(s: Settings, target: CssTarget): Box {
  const est = estimateSourceSize(s, { name: target.name });
  const measure = (t: CssTarget) => frame?.measureWith(previewCss(s, t)) ?? null;
  const own = measure(target);
  if (!own) return est;
  if (!target.example) return own;
  return maxBox(own, measure({ ...target, name: TEN_CHAR_NAME }));
}

export async function copyCharacterUrl(s: Settings, c: Character): Promise<void> {
  const url = characterSourceUrl(c, s.room);
  if (!url) {
    setStatus(S.chars.urlMissing, 'danger');
    return;
  }
  const ok = await copyText(url);
  if (ok) setStatus(S.chars.urlCopied(c.name || S.chars.unnamed), 'success');
  else setStatus(S.chars.urlCopyFailed, 'danger');
}

/** 把預覽切到這個角色，複製寫入其名稱與顏色的 CSS（F90） */
export async function copyCharacterCss(s: Settings, c: Character): Promise<void> {
  usePreview.getState().patch({ target: c.id });
  const target = cssTargetFor(s, c);
  const size = measureTarget(s, target);
  const css = exportCss(s, target, size);
  const ok = await copyText(css);
  if (ok) setStatus(S.export.copied(S.export.charWho(c.name), size.width, size.height), 'success');
  else setStatus(S.chars.copyFailed, 'danger');
}
