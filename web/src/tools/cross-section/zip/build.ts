/**
 * 組成 CCFOLIA 房間 ZIP 與 KP 準備包（瀏覽器；按下匯出時才載入這個檔案）。
 *
 * 房間 ZIP（共用的 `@/ccfolia` 寫法：`__data.json`、`.token`、內容的 SHA-256 當檔名的圖；寫完用 `checkRoomZip` 自我檢查）：
 * - room：第一個場景的前景與背景、盤面的格數、前景「拉伸」（fill）。
 * - scenes：白天・平常、夜・雨、停電・緊急照明、事件後（＋淹水）。
 * - items（螢幕面板）：遮罩、祕密區域的偽裝、（選）KP 操作說明；全部固定位置、點了穿過去（locked、freezed）。
 * - effects（切入）：「@停電」「@緊急照明」「@事件發生」（＋「@淹水」）；聲音放不進房間 ZIP（沒有音效時會一直重播），
 *   KP 準備包附 2.6 秒的無聲 MP3，設成切入的音效就播一次自動結束。
 * KP 準備包：房間 ZIP、無聲 MP3、KP 操作說明圖（完整的對照）、對照表（CSV，UTF-8 BOM、防公式）。
 */
import { buildRoomZip, checkRoomZip, packRoomImage, type RoomImageFile } from '@/ccfolia/roomZip';
import { createSilence } from '@/core/audio';
import { encodeMp3 } from '@/core/audio/mp3';
import { toCsv } from '@/core/csv';
import { zipFiles } from '@/core/files';
import { ensureDocFonts, safeTitle } from '../draw/export';
import { planOf, worldOf } from '../draw/scene';
import type { SectionDoc } from '../model/types';
import { S } from '../strings';
import { encodeCutin } from './cutins';
import {
  boardCanvas,
  cropPng,
  drawScenePlate,
  ensureZipFonts,
  guidePng,
  maskPng,
  pngBytes,
  wallpaperPng,
  zipText,
} from './images';
import {
  type Board,
  boardOf,
  cutinsOf,
  type Panel,
  panelsOf,
  roomDataOf,
  SILENT_MP3,
  scenesOf,
  tableRows,
  type ZipOptions,
  zipDoc,
} from './plan';

export class ZipCheckError extends Error {}

export interface RoomZipResult {
  bytes: Uint8Array;
  fileName: string;
  board: Board;
  panels: Panel[];
  scenes: string[];
  cutins: string[];
  /** KP 操作說明（完整的對照） */
  guide: Uint8Array;
  /** 對照表 CSV */
  table: string;
}

export type Progress = (ratio: number, label: string) => void;

const abortIf = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException(S.zip.busy, 'AbortError');
};

/** 遮罩的霧要每間不一樣：編號換成數字 */
const seedOf = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

export async function buildRoom(
  source: SectionDoc,
  o: ZipOptions,
  progress: Progress = () => {},
  signal?: AbortSignal,
): Promise<RoomZipResult> {
  const doc = zipDoc(source, o.arrange);
  const plan = planOf(doc);
  const b = boardOf(worldOf(plan), o.token);
  const panels = panelsOf(plan, o);
  const scenes = scenesOf(o);
  const cuts = cutinsOf(o);
  progress(0.02, S.zip.steps.fonts);
  await ensureDocFonts(doc);
  await ensureZipFonts(zipText(panels, doc.title));
  const images: RoomImageFile[] = [];
  const add = async (bytes: Uint8Array): Promise<string> => {
    const img = await packRoomImage(bytes, 'image/png');
    images.push(img);
    return img.name;
  };

  /* 場景 */
  const sceneImages: { fg: string; bg: string }[] = [];
  for (const [i, sd] of scenes.entries()) {
    abortIf(signal);
    progress(0.05 + (0.45 * i) / scenes.length, S.zip.steps.scenes(i + 1, scenes.length));
    const c = boardCanvas(doc, plan, b, sd.env, sd.flood, 'reveal');
    drawScenePlate(c, doc, b, sd);
    sceneImages.push({
      fg: await add(await pngBytes(c)),
      bg: await add(await wallpaperPng(sd.key)),
    });
  }

  /* 螢幕面板：遮罩、祕密區域的偽裝（PL 用・白天的圖逐像素裁下來） */
  progress(0.55, S.zip.steps.panels);
  const pl = boardCanvas(doc, plan, b, 'day', false, 'player');
  const panelImages: string[] = [];
  for (const p of panels) {
    abortIf(signal);
    const bytes =
      p.kind === 'camo'
        ? await cropPng(pl, b, p.rect)
        : await maskPng(o.mask, p.rect, b.cell, p.code, p.label, seedOf(p.code));
    panelImages.push(await add(bytes));
  }
  const sceneNames = scenes.map((s) => s.name);
  const cutNames = cuts.map((c) => c.name);
  const guideImage = o.guide
    ? await add(
        await guidePng({
          title: doc.title,
          board: b,
          scenes: sceneNames,
          cutins: cutNames,
          panels,
          safe: true,
          inRoom: true,
        }),
      )
    : null;

  /* 切入 */
  const cutImages: string[] = [];
  for (const [i, cut] of cuts.entries()) {
    abortIf(signal);
    progress(0.65 + (0.25 * i) / cuts.length, S.zip.steps.cutins(i + 1, cuts.length));
    cutImages.push(await add(await encodeCutin(cut.kind, signal)));
  }

  progress(0.92, S.zip.steps.pack);
  const data = roomDataOf(b, scenes, panels, cuts, {
    scenes: sceneImages,
    panels: panelImages,
    guide: guideImage,
    cutins: cutImages,
  });
  const built = buildRoomZip(data, images, { level: 0 });
  progress(0.96, S.zip.steps.check);
  const check = await checkRoomZip(built.bytes);
  if (!check.ok || built.missing.length) throw new ZipCheckError(S.zip.checkFailed);
  const guide = await guidePng({
    title: doc.title,
    board: b,
    scenes: sceneNames,
    cutins: cutNames,
    panels,
    safe: false,
    inRoom: o.guide,
  });
  progress(1, S.zip.steps.pack);
  return {
    bytes: built.bytes,
    fileName: S.zip.roomName(safeTitle(doc.title), o.blind),
    board: b,
    panels,
    scenes: sceneNames,
    cutins: cutNames,
    guide,
    table: toCsv(tableRows(panels), { bom: true, guard: true }),
  };
}

/** 自動結束用的無聲 MP3（2.6 秒、44.1 kHz 單聲道 64 kbps；和切入一樣長） */
export function silentMp3(signal?: AbortSignal): Promise<Uint8Array> {
  const { seconds, sampleRate, channels, kbps } = SILENT_MP3;
  return encodeMp3(createSilence(seconds, { sampleRate, channels }), { kbps }, { signal });
}

/** KP 準備包：房間 ZIP、無聲 MP3、KP 操作說明圖、對照表 */
export function packOf(title: string, r: RoomZipResult, mp3: Uint8Array): Uint8Array {
  const t = safeTitle(title);
  return zipFiles(
    [
      { name: r.fileName, data: r.bytes, level: 0 },
      { name: S.zip.mp3Name, data: mp3, level: 0 },
      { name: S.zip.guideName(t), data: r.guide, level: 0 },
      { name: S.zip.tableName(t), data: r.table },
    ],
    {},
  );
}

/** 只要說明圖（不畫場景） */
export async function guideOnly(source: SectionDoc, o: ZipOptions): Promise<Uint8Array> {
  const doc = zipDoc(source, o.arrange);
  const plan = planOf(doc);
  const b = boardOf(worldOf(plan), o.token);
  const panels = panelsOf(plan, o);
  await ensureZipFonts(zipText(panels, doc.title));
  return guidePng({
    title: doc.title,
    board: b,
    scenes: scenesOf(o).map((s) => s.name),
    cutins: cutinsOf(o).map((c) => c.name),
    panels,
    safe: false,
    inRoom: o.guide,
  });
}
