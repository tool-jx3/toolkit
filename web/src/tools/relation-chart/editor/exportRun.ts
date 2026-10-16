/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 匯出的執行（匯出對話框與再次匯出共用；原作 askExportOptions 的 silent 分支）：
 * 挑分頁 → 收圖片與字型（含角色資訊與世界觀裡的圖）→ 壓縮頭像（互動網頁、勾了才做）→ 打包 → 下載，並記住這次的設定。
 */
import { downloadBlob, safeFileName } from '@/core/files';
import { buildGif, buildVideo } from '../export/anim';
import { buildExport, defaultExportBase, type ExportFormat } from '../export/outputs';
import { slimAvatars } from '../export/slim';
import { loreOf } from '../model/lore';
import { richImageIds } from '../model/normalize';
import { dataUris, drawnImageIds } from '../state/images';
import {
  activeIndex,
  type ExportScope,
  type LastExport,
  projectNow,
  setPrefs,
  syncProject,
  usePrefs,
} from '../state/store';
import { flushRichEditors } from './RichEditor';

/** 這次要匯出的分頁索引（沒有角色的不匯出） */
export function pickIndexes(scope: ExportScope, picked: ReadonlySet<number>): number[] {
  syncProject();
  const p = projectNow();
  const all = p.sheets.map((_, i) => i).filter((i) => p.sheets[i].chars.length > 0);
  if (p.sheets.length <= 1 || scope === 'cur') return all.filter((i) => i === activeIndex(p));
  if (scope === 'all') return all;
  return all.filter((i) => picked.has(i));
}

export async function prepare(idx: readonly number[], transparent: boolean) {
  flushRichEditors();
  syncProject();
  const p = projectNow();
  const sheets = idx.map((i) => p.sheets[i]);
  /* 圖、頭像框、用到的匯入字型、角色資訊與世界觀裡的圖 */
  const ids = new Set(drawnImageIds(p, idx));
  const fontRefs = new Set<string>([p.font, ...sheets.flatMap((s) => s.chars.map((c) => c.font))]);
  for (const f of p.fonts) if (fontRefs.has(`f:${f.id}`)) ids.add(f.id);
  const libIds = new Set(sheets.flatMap((s) => s.chars.map((c) => c.lib)));
  for (const e of p.library)
    if (libIds.has(e.id)) for (const id of richImageIds(e.info)) ids.add(id);
  for (const s of sheets) for (const id of richImageIds(loreOf(p.sheets, s).html)) ids.add(id);
  const uris = await dataUris(ids);
  return {
    sheets,
    allSheets: p.sheets,
    font: p.font,
    labels: p.labels,
    uris,
    transparent,
    fonts: p.fonts,
    frames: p.frames,
    library: p.library,
    radarTpls: p.radarTpls,
  };
}

export interface ExportChecks {
  transparent: boolean;
  slim: boolean;
  embed: boolean;
}

/** 補間的偏好（這台瀏覽器；GIF／影片、互動網頁的動畫照編輯畫面的設定畫） */
export const tweenPrefs = () => {
  const p = usePrefs.getState().data;
  return { tweenOff: p.tweenOff, flip: p.flipAnim, noteFade: p.noteFade };
};

/**
 * GIF／影片（目前分頁；第五批）：補間 → 每一格 → 編碼。download＝直接下載（再次匯出）；
 * 對話框用共用匯出區的結果卡下載。記住這次的格式（再次匯出）。
 */
export async function runAnimExport(
  kind: 'gif' | 'video',
  name: string,
  ctx: { signal?: AbortSignal; onProgress?: (ratio: number, label?: string) => void } = {},
  download = true,
) {
  const p = projectNow();
  const idx = activeIndex(p);
  const input = await prepare([idx], false);
  const sheet = input.sheets[0];
  const run = {
    signal: ctx.signal,
    onProgress: (r: number, l: string) => ctx.onProgress?.(r, l),
    tween: tweenPrefs(),
  };
  const r =
    kind === 'gif' ? await buildGif(sheet, input, run) : await buildVideo(sheet, input, run);
  const fileName = `${safeFileName(name, { fallback: '關係圖' })}.${r.ext}`;
  if (download) downloadBlob(r.blob, fileName);
  setPrefs({
    exportFormat: kind,
    lastExport: {
      fmt: kind,
      scope: 'cur',
      checks: { transparent: false, slim: false, embed: false },
    },
  });
  return { ...r, fileName };
}

/** 匯出並下載；回傳檔名 */
export async function runExport(
  fmt: ExportFormat,
  scope: ExportScope,
  idx: readonly number[],
  checks: ExportChecks,
  name?: string,
): Promise<string> {
  const input = await prepare(idx, checks.transparent);
  const html = fmt === 'html';
  const slim =
    html && checks.slim ? await slimAvatars(input.sheets, input.uris, checks.embed) : null;
  const out = await buildExport(
    fmt,
    {
      ...input,
      viewer: html
        ? { embed: checks.embed, slim: slim ?? undefined, tween: tweenPrefs() }
        : undefined,
    },
    name?.trim() || defaultExportBase(fmt, input.sheets, checks.transparent),
  );
  downloadBlob(out.blob, out.fileName);
  const p = projectNow();
  const last: LastExport = { fmt, scope, checks: { ...checks } };
  if (scope === 'some') last.sheetIds = idx.map((i) => p.sheets[i].id);
  setPrefs({ lastExport: last });
  return out.fileName;
}
