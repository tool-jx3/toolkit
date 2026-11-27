/**
 * 斷面圖產生器（第二批）：CCFOLIA 房間 ZIP 的構成——盤面、場景、遮罩與偽裝的面板（編號、備註、一開始公開、位置）、
 * 切入的名稱、房間資料（共用的 `@/ccfolia` 寫進 ZIP 再讀回來比）、對照表（CSV 讀回來比）、自動結束用的無聲 MP3。
 */
import { describe, expect, it } from 'vitest';
import { readRoomZip, resolveRoomData } from '@/ccfolia';
import { buildRoomZip, checkRoomZip, packRoomImage, type RoomImageFile } from '@/ccfolia/roomZip';
import { createSilence } from '@/core/audio';
import { listMp3Frames, readMp3InfoTag } from '@/core/audio/mp3';
import { encodeMp3Loop } from '@/core/audio/mp3/encode';
import { parseCsv, toCsv, unguardFormula } from '@/core/csv';
import { planOf, worldOf } from '@/tools/cross-section/draw/scene';
import { blankDoc } from '@/tools/cross-section/model/factory';
import { sampleDoc } from '@/tools/cross-section/model/samples';
import {
  boardOf,
  cutinsOf,
  DEFAULT_ZIP,
  guideSpot,
  MUTE_CLIP,
  panelSpot,
  panelsOf,
  roomDataOf,
  scenesOf,
  tableRows,
  type ZipOptions,
  zipDoc,
} from '@/tools/cross-section/zip/plan';

const opts = (o: Partial<ZipOptions> = {}): ZipOptions => ({ ...DEFAULT_ZIP, ...o });

describe('盤面', () => {
  it('地圖本體在左 2、上 2 格；右邊至少 14 格、下面至少 10 格（或三分之一）；補成偶數；每格 48 px，太大時 32 px', () => {
    /* 空白的建築：世界 42 × 20 格 */
    const b = boardOf({ x: -4, y: -5, w: 42, h: 20 });
    expect(b).toMatchObject({ padL: 2, padT: 2, cols: 60, rows: 32, cell: 48, scale: 1 });
    expect(boardOf({ x: -4, y: -5, w: 42, h: 20 }, 2)).toMatchObject({
      cols: 60,
      fieldWidth: 120,
      fieldHeight: 64,
    });
    /* 10 節一列：寬 155 格 → 每格 32 px */
    const wide = boardOf({ x: -3, y: -2, w: 155, h: 16 });
    expect(wide.cols).toBe(2 + 155 + 53 + 0);
    expect(wide.cell).toBe(32);
  });

  it('面板的位置：CCFOLIA 的原點在盤面中央、x、y 是左上角；大棋子時位置與大小 ×2', () => {
    const b = boardOf({ x: -4, y: -5, w: 42, h: 20 });
    expect(panelSpot(b, { x: 0, y: 0, w: 16, h: 6 })).toEqual({
      x: -24,
      y: -9,
      width: 16,
      height: 6,
    });
    const big = boardOf({ x: -4, y: -5, w: 42, h: 20 }, 2);
    expect(panelSpot(big, { x: 0, y: 0, w: 16, h: 6 })).toEqual({
      x: -48,
      y: -18,
      width: 32,
      height: 12,
    });
    expect(guideSpot(b)).toEqual({ x: -28, y: -14, width: 28, height: 19 });
  });
});

describe('場景與切入', () => {
  it('4 個場景（＋淹水）；切入的名稱是「@」開頭，淹水的只在有淹水的場景時', () => {
    expect(scenesOf({ flood: false }).map((s) => s.name)).toEqual([
      '1 白天・平常',
      '2 夜・雨',
      '3 停電・緊急照明',
      '4 事件後',
    ]);
    expect(scenesOf({ flood: true })[4]).toMatchObject({
      name: '5 淹水',
      env: 'after',
      flood: true,
    });
    expect(cutinsOf({ flood: false }).map((c) => c.name)).toEqual([
      '@停電',
      '@緊急照明',
      '@事件發生',
    ]);
    expect(cutinsOf({ flood: true }).map((c) => c.name)).toContain('@淹水');
  });
});

describe('面板', () => {
  it('建築：每層由左往右編號（1F-01）、祕密區域另外編（S-01）；一開始公開的遮罩、無記名、PL 停留時的名字', () => {
    const d = sampleDoc('manor');
    const plan = planOf(d);
    const named = panelsOf(plan, opts());
    expect(named.map((p) => p.code)).toEqual([
      '2F-01',
      '2F-02',
      '1F-01',
      '1F-02',
      'B1F-01',
      'B1F-02',
      'B2F-01',
      'S-01',
    ]);
    expect(named[0]).toMatchObject({ kind: 'mask', memo: '2F-01 主臥室', label: '主臥室', z: 4 });
    expect(named.find((p) => p.code === '1F-01')?.open).toBe(true);
    expect(named.at(-1)).toMatchObject({ kind: 'camo', memo: 'S-01', name: '地下禮拜堂', z: 5 });
    expect(panelsOf(plan, opts({ anon: false })).at(-1)?.memo).toBe('S-01 地下禮拜堂');
    const blind = panelsOf(plan, opts({ blind: true, anon: false }));
    expect(blind.map((p) => p.memo)).toEqual(blind.map((p) => p.code));
    expect(blind.every((p) => p.label === '')).toBe(true);
    /* 「PL 用不寫名字」的區域只寫編號 */
    d.building.floors[0].rooms[0].hideName = true;
    expect(panelsOf(planOf(d), opts())[0]).toMatchObject({ memo: '2F-01', label: '' });
  });

  it('列車：「3車-A」；祕密區域與床下的祕密空間都是偽裝（床下排在後面）', () => {
    const d = sampleDoc('circus');
    const panels = panelsOf(planOf(d), opts());
    expect(
      panels
        .filter((p) => p.kind === 'mask')
        .map((p) => p.code)
        .slice(0, 4),
    ).toEqual(['1車-A', '1車-B', '2車-A', '2車-B']);
    expect(panels.filter((p) => p.kind === 'camo').map((p) => [p.code, p.name, p.place])).toEqual([
      ['S-01', '團長的密室', '6車'],
      ['S-02', '偷渡者的藏身處', '4車'],
    ]);
    /* 匯出時換排法：一列 */
    const single = planOf(zipDoc(d, 'single'));
    expect(worldOf(single).h).toBe(16);
    expect(worldOf(planOf(d)).h).toBe(30);
  });
});

describe('房間資料與 ZIP', () => {
  it('共用的 @/ccfolia 寫進 ZIP、自我檢查通過；讀回來場景、螢幕面板（固定、穿透、一開始顯示與否）、切入都在', async () => {
    const d = sampleDoc('sanatorium');
    const o = opts({ flood: true, guide: true });
    const plan = planOf(d);
    const b = boardOf(worldOf(plan), o.token);
    const panels = panelsOf(plan, o);
    const scenes = scenesOf(o);
    const cuts = cutinsOf(o);
    /* 圖：每張內容不同的假 PNG（檔名是內容的 SHA-256） */
    let n = 0;
    const fake = async () => {
      n++;
      const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, n, n >> 8]);
      return packRoomImage(bytes, 'image/png');
    };
    const images: RoomImageFile[] = [];
    const pick = async () => {
      const img = await fake();
      images.push(img);
      return img.name;
    };
    const img = {
      scenes: [] as { fg: string; bg: string }[],
      panels: [] as string[],
      guide: await pick(),
      cutins: [] as string[],
    };
    for (const _ of scenes) img.scenes.push({ fg: await pick(), bg: await pick() });
    for (const _ of panels) img.panels.push(await pick());
    for (const _ of cuts) img.cutins.push(await pick());
    const data = roomDataOf(b, scenes, panels, cuts, img);
    const built = buildRoomZip(data, images, { level: 0 });
    expect(built.missing).toEqual([]);
    const check = await checkRoomZip(built.bytes);
    expect(check).toMatchObject({ ok: true, sceneCount: 5, imageCount: images.length });
    const read = readRoomZip(built.bytes);
    const r = resolveRoomData(read.json);
    if (!r.entities) throw new Error('entities');
    const ent = r.entities;
    expect(r.room).toMatchObject({
      fieldWidth: b.fieldWidth,
      fieldHeight: b.fieldHeight,
      fieldObjectFit: 'fill',
      foregroundUrl: img.scenes[0].fg,
    });
    const sc = Object.values(ent.scenes as Record<string, { name: string; foregroundUrl: string }>);
    expect(sc.map((s) => s.name)).toEqual(scenes.map((s) => s.name));
    const items = Object.values(
      ent.items as Record<
        string,
        {
          memo: string;
          z: number;
          active: boolean;
          locked: boolean;
          freezed: boolean;
          order: number;
        }
      >,
    ).sort((a, x) => a.order - x.order);
    expect(items).toHaveLength(panels.length + 1);
    expect(items.every((it) => it.locked && it.freezed)).toBe(true);
    const lobby = items.find((it) => it.memo.startsWith('1F-01'));
    expect(lobby).toMatchObject({ z: 4, active: false });
    expect(items.find((it) => it.memo === 'S-01')).toMatchObject({ z: 5, active: true });
    expect(items.at(-1)).toMatchObject({ z: 9, active: false, memo: 'KP 操作說明（要看時打開）' });
    const fx = Object.values(ent.effects as Record<string, { name: string; imageUrl: string }>);
    expect(fx.map((e) => e.name)).toEqual(['@停電', '@緊急照明', '@事件發生', '@淹水']);
  });

  it('對照表：CSV（UTF-8 BOM、防公式）讀回來逐欄相同', () => {
    const panels = panelsOf(planOf(sampleDoc('tower')), opts());
    const rows = tableRows(panels);
    expect(rows[0]).toEqual(['編號', '種類', '一開始', '位置', '名字', 'PL 停留時看到的字']);
    expect(rows.find((r) => r[0] === 'S-01')).toEqual([
      'S-01',
      '祕密的偽裝',
      '蓋著',
      '4F',
      '隱藏的寶庫',
      'S-01',
    ]);
    const csv = toCsv(rows, { bom: true, guard: true });
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(
      parseCsv(csv.slice(1).replaceAll('\r\n', '\n')).map((r) => r.map((c) => unguardFormula(c))),
    ).toEqual(rows);
  });

  it('沒有區域時沒有面板；空白的作品也組得出來', () => {
    const plan = planOf(blankDoc());
    expect(panelsOf(plan, opts()).every((p) => p.kind === 'mask')).toBe(true);
  });
});

describe('無聲 MP3', () => {
  it('2.6 秒（和切入一樣長）、44.1 kHz 單聲道 64 kbps；Info 標頭寫好延遲與填充，解出來剛好 2.6 秒', async () => {
    expect(MUTE_CLIP).toEqual({ seconds: 2.6, sampleRate: 44100, channels: 1, kbps: 64 });
    const bytes = await encodeMp3Loop(
      createSilence(MUTE_CLIP.seconds, { sampleRate: 44100, channels: 1 }),
      { kbps: 64 },
    );
    const frames = listMp3Frames(bytes);
    const tag = readMp3InfoTag(bytes);
    expect(frames[1].header).toMatchObject({ sampleRate: 44100, bitrate: 64 });
    if (!tag) throw new Error('info');
    const samples = tag.frames * 1152 - tag.delay - tag.padding;
    expect(samples / 44100).toBeCloseTo(2.6, 5);
    expect(bytes.byteLength).toBeLessThan(30_000);
  });
});
