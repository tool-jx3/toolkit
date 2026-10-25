/**
 * room-zip「讀入房間 ZIP」（F287～F299，規格 3.7）：
 * - 位置換算（整數中心換不回來的位置要保留原始值）、圖片檔頭的尺寸與動態判斷；
 * - 本工具匯出 → 讀入 → 模型相同、再匯出相同；
 * - CCFOLIA 格式的房間 ZIP（rich fixture）讀入後各欄位正確、沒有對應功能的資料再匯出時原樣寫回；
 * - 編輯後再匯出（改過的跟著改、沒動的維持原樣）；刪除素材時一併處理保留的欄位；
 * - 壞檔、不是房間 ZIP、版本不認得、專案檔：清楚的錯誤；
 * - 一步復原。
 */
import { describe, expect, it } from 'vitest';
import {
  buildRoomZip,
  centerToTopLeft,
  checkRoomZip,
  type RoomImageFile,
  readRoomZip,
} from '@/ccfolia';
import { encodePng } from '@/core/encode/png';
import { zipFiles } from '@/core/files';
import { createToolStore } from '@/core/storage';
import {
  addEffect,
  addPart,
  addPiece,
  addPieceFace,
  addScene,
  addTachie,
  assignCutin,
  createFromMaterials,
  ctxOf,
  deleteMaterials,
  finalize,
  setOverride,
  setTachieAppear,
  updateEffect,
  updatePart,
} from '@/tools/room-zip/actions';
import { buildRoomData } from '@/tools/room-zip/exportRoom';
import { materialLookup } from '@/tools/room-zip/geometry';
import { imageInfo } from '@/tools/room-zip/imageInfo';
import { brokenImages, materialUsages } from '@/tools/room-zip/materials';
import {
  createProject,
  createToolSettings,
  type Material,
  type Project,
  type ToolSettings,
} from '@/tools/room-zip/model';
import { exportRect, fitRect } from '@/tools/room-zip/rect';
import {
  assertRoomZipSize,
  describeReport,
  hasLost,
  importRoomZip,
  isProjectBlank,
  keptCounts,
  looksLikeRoomZip,
  ROOM_ZIP_MAX_BYTES,
  RoomImportError,
  type RoomImportResult,
  replaceUndoable,
  splitSceneText,
} from '@/tools/room-zip/roomImport';
import { sha, solidPng } from '../helpers/psdStudio';
import { type Json, roomFixture, TINY_GIF } from '../helpers/roomZipImport';

const SETTINGS = { noimage: false, noimageCount: 1, noimageZ: 45 };

/** 專案 → `__data.json`（playTime 固定） */
const dataOf = (p: Project) =>
  buildRoomData(p, { find: materialLookup(p.materials), settings: SETTINGS, now: 0 });

/** 讀入結果的圖片 → 匯出用的圖片清單 */
const imagesOf = (r: RoomImportResult): RoomImageFile[] =>
  r.images.map((i) => ({ name: i.name, type: i.mime, data: i.data }));

/** 專案 → 房間 ZIP（用讀入結果的圖片） */
function zipOf(p: Project, images: RoomImageFile[]) {
  return buildRoomZip(dataOf(p), images, { mtime: new Date(2026, 0, 1) });
}

describe('位置換算（3.7.4）', () => {
  it('工具自己的整數中心匯出再讀入：中心不變、不需要 origin', () => {
    for (let w = 1; w <= 12; w++) {
      for (let c = -30; c <= 30; c++) {
        const raw = centerToTopLeft({ x: c, y: c, width: w, height: w });
        const fit = fitRect(raw);
        expect(fit.origin, `中心 ${c} 寬 ${w}`).toBeUndefined();
        expect(fit.model).toEqual({ x: c, y: c, width: w, height: w });
      }
    }
  });

  it('任何左上角與大小：不論找不找得到整數中心，沒改過就匯出同樣的值', () => {
    const cases = [
      { x: 0, y: 0, width: 3, height: 3 },
      { x: 0, y: -1, width: 5, height: 1 },
      { x: 2.5, y: 1, width: 2, height: 2.5 },
      { x: -7, y: 3.25, width: 0.5, height: 4 },
      { x: 12, y: -20, width: 40, height: 30 },
      { x: -1, y: 0, width: 1, height: 7 },
    ];
    for (const raw of cases) {
      const fit = fitRect(raw);
      expect(exportRect(fit.model, fit.origin), JSON.stringify(raw)).toEqual(raw);
    }
  });

  it('奇數寬、左上 x＝0 沒有整數中心：記下原始值，改了位置才照工具的規則取整', () => {
    const raw = { x: 0, y: 0, width: 3, height: 3 };
    const fit = fitRect(raw);
    expect(fit.origin).toEqual(raw);
    expect(fit.model).toEqual({ x: 1.5, y: 1.5, width: 3, height: 3 });
    /* 只改 x：y 與大小維持原始值 */
    const moved = exportRect({ ...fit.model, x: 5 }, fit.origin);
    expect(moved).toEqual({
      x: centerToTopLeft({ ...fit.model, x: 5 }).x,
      y: 0,
      width: 3,
      height: 3,
    });
    /* 改了寬：寬跟著新值，高與 y 維持 */
    expect(exportRect({ ...fit.model, width: 4 }, fit.origin).width).toBe(4);
    expect(exportRect({ ...fit.model, width: 4 }, fit.origin).height).toBe(3);
  });

  it('小數大小：模型取整、沒改過時匯出原始值', () => {
    const fit = fitRect({ x: 1, y: 1, width: 2.5, height: 2 });
    expect(fit.model.width).toBe(3);
    expect(exportRect(fit.model, fit.origin).width).toBe(2.5);
    expect(exportRect({ ...fit.model, width: 6 }, fit.origin).width).toBe(6);
  });
});

describe('圖片檔頭（F291）', () => {
  it('PNG、APNG、GIF 的尺寸與動態', async () => {
    const png = await solidPng(37, 21, [1, 2, 3, 255]);
    expect(imageInfo(png, 'image/png')).toEqual({ width: 37, height: 21, animated: false });
    const { ballApng } = await import('../helpers/psdStudio');
    const apng = new Uint8Array(await ballApng());
    expect(imageInfo(apng, 'image/png')).toEqual({ width: 64, height: 48, animated: true });
    expect(imageInfo(TINY_GIF, 'image/gif')).toEqual({ width: 1, height: 1, animated: true });
  });

  it('JPEG 與三種 WebP 的尺寸（手做的最小檔頭）', () => {
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x01, 0x2c,
      0x02, 0x58, 0x01, 0x01, 0x11, 0x00,
    ]);
    expect(imageInfo(jpeg, 'image/jpeg')).toMatchObject({ width: 600, height: 300 });
    const riff = (chunk: string, body: number[]) =>
      new Uint8Array([
        0x52,
        0x49,
        0x46,
        0x46,
        0,
        0,
        0,
        0,
        0x57,
        0x45,
        0x42,
        0x50,
        ...[...chunk].map((c) => c.charCodeAt(0)),
        ...body,
      ]);
    /* VP8X：寬高各減 1 的 24 位元 */
    const vp8x = riff('VP8X', [10, 0, 0, 0, 0, 0, 0, 0, 99, 0, 0, 49, 0, 0, 0, 0, 0, 0]);
    expect(imageInfo(vp8x, 'image/webp')).toMatchObject({
      width: 100,
      height: 50,
      animated: false,
    });
    /* VP8L：簽名 0x2f，寬 −1 在低 14 位元，高 −1 接著 14 位元 */
    const w = 199;
    const h = 99;
    const bits = w | (h << 14);
    const vp8l = riff('VP8L', [
      0,
      0,
      0,
      0,
      0x2f,
      bits & 255,
      (bits >> 8) & 255,
      (bits >> 16) & 255,
      (bits >> 24) & 255,
      0,
      0,
      0,
      0,
    ]);
    expect(imageInfo(vp8l, 'image/webp')).toMatchObject({ width: 200, height: 100 });
    /* VP8（有損）：寬高在影格標頭之後各 14 位元 */
    const vp8 = riff(
      'VP8 ',
      [0, 0, 0, 0, 0, 0, 0, 0x9d, 0x01, 0x2a, 0x40, 0x01, 0xf0, 0x00, 0, 0, 0, 0],
    );
    expect(imageInfo(vp8, 'image/webp')).toMatchObject({ width: 320, height: 240 });
  });

  it('認不得的內容：尺寸 0', () => {
    expect(imageInfo(new Uint8Array(40), 'image/png')).toEqual({
      width: 0,
      height: 0,
      animated: false,
    });
  });
});

describe('讀入 CCFOLIA 格式的房間 ZIP（F287～F298）', () => {
  it('房間設定、盤面、BGM 交叉淡化（與畫面相反）、舊式骰子、其餘欄位原樣記下', async () => {
    const fx = await roomFixture();
    const r = await importRoomZip(fx.zip, { fileName: 'x.zip' });
    const p = r.project;
    expect(p.name).toBe('整合測試房');
    expect(p.room).toMatchObject({
      fieldWidth: 20,
      fieldHeight: 12,
      backgroundUrl: fx.names.bg,
      foregroundUrl: fx.names.fg,
      bgmCrossfade: false,
      legacyDice: true,
    });
    const extra = p.room.extra as Json;
    expect(extra.messageChannels).toEqual(['メイン', '情報', '雑談', 'GM']);
    expect(extra.sceneId).toBe('s2');
    expect(extra.backgroundColor).toBe('#112233');
    expect(extra.mediaRef).toBe('bgm-1');
    expect(extra.markers).toBeUndefined();
    expect(extra.backgroundUrl).toBeUndefined();
  });

  it('沒有房間名稱時用檔名（去掉 .zip），再沒有就用預設名', async () => {
    const a = await roomFixture({ mutate: (j) => delete j.entities.room.name });
    expect((await importRoomZip(a.zip, { fileName: '我的房間.zip' })).project.name).toBe(
      '我的房間',
    );
    expect((await importRoomZip(a.zip)).project.name).toBe('讀入的房間');
  });

  it('圖片：SHA-256 命名、同內容合併、不轉檔、尺寸與動態、標籤與名稱', async () => {
    const fx = await roomFixture();
    const r = await importRoomZip(fx.zip);
    const mats = new Map(r.project.materials.map((m) => [m.name, m]));
    expect(mats.size).toBe(r.images.length);
    expect(mats.size).toBe(16);
    /* 位元組原樣（雜湊沒變） */
    for (const im of r.images) expect(`${sha(im.data)}.${im.name.split('.')[1]}`).toBe(im.name);
    expect(mats.get(fx.names.bg)).toMatchObject({
      width: 96,
      height: 72,
      mime: 'image/png',
      animated: false,
      label: '房間背景',
      before: fx.bytes.bg.length,
      after: fx.bytes.bg.length,
    });
    expect(mats.get(fx.names.apng)).toMatchObject({ animated: true, tags: ['effect'] });
    expect(mats.get(fx.names.gif)).toMatchObject({ animated: true, mime: 'image/gif', width: 1 });
    expect(mats.get(fx.names.linkless)?.label).toMatch(/^圖片\d+$/);
    expect(mats.get(fx.names.fg2)?.label).toBe('第一幕・前景');
    /* 沒被引用的圖也是素材 */
    expect(r.images.some((i) => i.name === fx.names.linkless)).toBe(true);
  });

  it('同內容的兩個檔案（不同路徑、非雜湊檔名）合併成一張，引用換成素材名稱', async () => {
    const data = await solidPng(20, 20, [7, 7, 7, 255]);
    const name = `${sha(data)}.png`;
    const zip = zipFiles([
      {
        name: '__data.json',
        data: JSON.stringify({
          meta: { version: '1.1.0' },
          entities: {
            room: {
              backgroundUrl: 'images/bg.png',
              foregroundUrl: './copy.PNG',
              fieldWidth: 8,
              fieldHeight: 6,
            },
            scenes: { a: { name: 'A', backgroundUrl: 'copy.png', foregroundUrl: null } },
            notes: { n: { name: '劇本', text: '', order: 1, iconUrl: 'images/bg.png' } },
          },
          resources: {},
        }),
      },
      { name: 'images/bg.png', data },
      { name: 'copy.PNG', data },
    ]);
    const r = await importRoomZip(zip);
    expect(r.images).toHaveLength(1);
    expect(r.project.materials).toHaveLength(1);
    expect(r.project.room.backgroundUrl).toBe(name);
    expect(r.project.room.foregroundUrl).toBe(name);
    expect(r.project.scenes[0].backgroundMode).toBe('room');
    /* 原樣保留的資料裡的圖片欄位也換成素材名稱 */
    expect(r.project.keep?.entities?.notes?.n).toMatchObject({ iconUrl: name });
  });

  it('共用標記：中心座標、奇數寬、小數位置保留原始值、沒有圖的標記放進保留', async () => {
    const fx = await roomFixture();
    const { project: p } = await importRoomZip(fx.zip);
    const m = (id: string) => p.parts.find((x) => x.id === id)!;
    expect(p.parts.filter((x) => x.kind === 'marker').map((x) => x.id)).toEqual(['m1', 'm2', 'm3']);
    expect(m('m1')).toMatchObject({
      x: -8,
      y: -4,
      width: 3,
      height: 3,
      z: 3,
      text: '標記',
      name: '標記',
    });
    expect(m('m1').origin).toBeUndefined();
    expect(m('m1').extra).toEqual({ angle: 0, locked: true, freezed: false, clickAction: null });
    expect(m('m2')).toMatchObject({ x: 1.5, y: 1.5, origin: { x: 0, y: 0, width: 3, height: 3 } });
    expect(m('m2').extra?.angle).toBe(45);
    expect(m('m3')).toMatchObject({ x: 3.5, y: 2.25, width: 2, height: 3 });
    expect(m('m3').origin).toEqual({ x: 2.5, y: 1, width: 2, height: 2.5 });
    expect(m('m1')).toMatchObject({ visible: true, locked: false, lockAspect: false });
    expect(Object.keys(p.keep?.roomMarkers ?? {})).toEqual(['m4']);
  });

  it('螢幕面板：依 order、備註＝盤面文字；牌堆的卡片與沒有圖的面板放進保留', async () => {
    const fx = await roomFixture();
    const { project: p } = await importRoomZip(fx.zip);
    const panels = p.parts.filter((x) => x.kind === 'panel');
    expect(panels.map((x) => x.id)).toEqual(['i2', 'i1']);
    expect(panels[1]).toMatchObject({ text: '寶箱', x: 2, y: 2, width: 3, height: 3, z: 5 });
    expect(panels[1].extra).toMatchObject({
      angle: 30,
      coverImageUrl: fx.names.cover,
      locked: false,
    });
    expect(panels[1].extra?.order).toBeUndefined();
    expect(Object.keys(p.keep?.entities?.items ?? {}).sort()).toEqual(['i3', 'i4']);
  });

  it('場景：名稱順序、背景模式（四種）、盤面、裁切、格線、切入的還原', async () => {
    const fx = await roomFixture();
    const { project: p } = await importRoomZip(fx.zip);
    expect(p.scenes.map((s) => s.name)).toEqual(['序章', '第一幕', '無背景', '前景同背景']);
    const [s1, s2, s3, s4] = p.scenes;
    expect(s1).toMatchObject({
      id: 's1',
      backgroundMode: 'room',
      foregroundUrl: null,
      backgroundUrl: null,
      fieldWidth: 20,
      autoCrop: true,
      displayGrid: false,
      text: '開場白',
      cutinId: 'e1',
    });
    expect(s2).toMatchObject({
      backgroundMode: 'image',
      backgroundUrl: fx.names.sceneBg,
      foregroundUrl: fx.names.fg2,
      fieldWidth: 30,
      fieldHeight: 20,
      autoCrop: false,
      displayGrid: true,
      text: '@不存在\n沒有這個切入',
      cutinId: null,
    });
    expect(s3.backgroundMode).toBe('none');
    expect(s4).toMatchObject({ backgroundMode: 'foreground', foregroundUrl: fx.names.fg2 });
    expect(s1.extra).toMatchObject({
      mediaRef: 'bgm-2',
      mediaName: '序章 BGM',
      gridSize: 1,
      locked: false,
    });
    expect(s2.extra).toMatchObject({ soundRef: 'snd-3' });
  });

  it('場景的面板：同 ID 的共用標記只差位置／圖片＝場景差異；沒有的共用標記＝本場景隱藏；其餘＝演出；空白的放進保留', async () => {
    const fx = await roomFixture();
    const { project: p, report } = await importRoomZip(fx.zip);
    const [s1, s2, s3] = p.scenes;
    expect(s1.overrides).toEqual({ m1: { x: -6 }, m3: { imageUrl: fx.names.markerA } });
    expect(s1.markers).toHaveLength(1);
    expect(s1.markers[0]).toMatchObject({
      id: 'x1',
      kind: 'free',
      x: 0,
      y: 0,
      width: 10,
      height: 6,
      z: 9,
      imageUrl: fx.names.effect,
      lockAspect: false,
    });
    expect(s1.markers[0].extra).toMatchObject({ angle: 15 });
    expect(p.keep?.sceneMarkers?.s1).toHaveProperty('x2');
    expect(s2.overrides).toEqual({
      m1: { hidden: true },
      m2: { hidden: true },
      m3: { hidden: true },
    });
    expect(s2.markers).toEqual([]);
    /* m2 的位置在這個場景是 (0,5)：x＝0 的奇數寬表示不出來 → 成為演出，共用標記隱藏，演出改用新 ID */
    expect(s3.overrides.m2).toEqual({ hidden: true });
    expect(s3.markers.map((m) => m.id)).toEqual(['m2~2']);
    expect(s3.markers[0].origin).toEqual({ x: 0, y: 5, width: 3, height: 3 });
    expect(report.sceneOnlyMarkers).toBe(2);
  });

  it('切入：有名稱或有圖的成為切入（帶音效欄位）；都沒有的放進保留', async () => {
    const fx = await roomFixture();
    const { project: p } = await importRoomZip(fx.zip);
    expect(p.cutins).toHaveLength(1);
    expect(p.cutins[0]).toMatchObject({ id: 'e1', name: '閃光', imageUrl: fx.names.effect });
    expect(p.cutins[0].extra).toMatchObject({ soundRef: 'snd-1', playTime: 123, soundVolume: 0.5 });
    expect(Object.keys(p.keep?.entities?.effects ?? {})).toEqual(['e2']);
  });

  it('棋子（角色）：名稱、備忘、HP／MP、圖示、差分、聊天面板；狀態、參數、位置等記在 extra', async () => {
    const fx = await roomFixture();
    const { project: p } = await importRoomZip(fx.zip);
    expect(p.pieces.map((x) => x.id)).toEqual(['c1', 'c2']);
    const c1 = p.pieces[0];
    expect(c1).toMatchObject({
      kind: 'normal',
      name: '艾琳',
      memo: '備忘',
      hp: '12',
      mp: '4',
      iconUrl: fx.names.icon,
      commands: '2d6\nCCB<=50 【偵查】',
    });
    expect(c1.faces).toHaveLength(1);
    expect(c1.faces[0]).toMatchObject({ label: '笑', iconUrl: fx.names.face });
    expect(c1.extra).toMatchObject({
      x: 3,
      active: true,
      color: '#ff0000',
      params: [{ label: 'STR', value: '13' }],
    });
    expect(c1.extra?.status).toHaveLength(3);
    expect(p.pieces[1]).toMatchObject({ hp: '', mp: '', iconUrl: fx.names.gif });
  });

  it('沒有對應功能的資料原樣保留：劇本文字、牌堆、存檔、快照、不認得的類別、meta', async () => {
    const fx = await roomFixture();
    const { project: p, report } = await importRoomZip(fx.zip);
    expect(p.keep?.meta).toEqual({ version: '1.1.0' });
    expect(p.keep?.entities?.notes).toEqual(fx.json.entities.notes);
    expect(p.keep?.entities?.decks).toEqual(fx.json.entities.decks);
    expect(p.keep?.entities?.savedatas).toEqual(fx.json.entities.savedatas);
    expect(p.keep?.entities?.snapshots).toEqual(fx.json.entities.snapshots);
    expect(p.keep?.entities?.extraKind).toEqual(fx.json.entities.extraKind);
    expect(report.kept).toMatchObject({
      notes: 2,
      decks: 1,
      savedatas: 1,
      snapshots: 1,
      items: 2,
      effects: 1,
      roomMarkers: 1,
      sceneMarkers: 1,
      other: ['extraKind'],
      fields: true,
    });
    expect(keptCounts(p.keep)).toMatchObject({ notes: 2, other: ['extraKind'] });
  });

  it('報告：件數、轉換、網址的圖、會少掉的東西', async () => {
    const fx = await roomFixture();
    const { report } = await importRoomZip(fx.zip);
    expect(report.counts).toEqual({
      materials: 16,
      scenes: 4,
      markers: 3,
      panels: 2,
      pieces: 2,
      cutins: 1,
    });
    expect(report.externalImages).toBe(1);
    expect(report.lost).toEqual({
      files: 1,
      images: [],
      missing: [],
      unlinked: 1,
      topFields: ['foo'],
    });
    expect(hasLost(report)).toBe(true);
    const d = describeReport(report);
    expect(d.counts).toContain('素材 16 張');
    expect(d.lost.join('\n')).toContain('1 個檔案不是房間資料');
    expect(d.lost.join('\n')).toContain('foo');
    expect(d.kept.join('、')).toContain('劇本文字 2');
  });

  it('圖片檔壞掉、引用的圖不在 ZIP 裡、網址：照實報告，網址原樣', async () => {
    const fx = await roomFixture({
      without: ['markerB'],
      extraFiles: [{ name: 'broken.png', data: new Uint8Array([1, 2, 3, 4]) }],
    });
    const { report, project: p } = await importRoomZip(fx.zip);
    expect(report.lost.images).toEqual(['broken.png']);
    const gone = `${'0'.repeat(63)}1.png`;
    expect(report.lost.missing).toEqual([gone]);
    expect(p.parts.find((x) => x.id === 'm3')?.imageUrl).toBe(gone);
    expect(brokenImages(p, () => false).length).toBeGreaterThan(0);
    expect(p.room.extra?.thumbnailUrl).toBe('https://example.com/thumb.png');
  });

  it('場景的切換文字：開頭的「@切入名稱」還原成指定切入（接回去和原文一樣才還原）', () => {
    const cutins = [{ id: 'c', name: 'A', imageUrl: null }];
    expect(splitSceneText('@A\n開場', cutins)).toEqual({ text: '開場', cutinId: 'c' });
    expect(splitSceneText('@A', cutins)).toEqual({ text: '', cutinId: 'c' });
    expect(splitSceneText('@B\n開場', cutins)).toEqual({ text: '@B\n開場', cutinId: null });
    expect(splitSceneText('開場\n@A', cutins)).toEqual({ text: '開場\n@A', cutinId: null });
    expect(splitSceneText('@A\r\n開場', cutins).cutinId).toBeNull();
    expect(splitSceneText('@A\n', cutins).cutinId).toBeNull();
  });
});

describe('讀入 → 再匯出：沒動過的資料原樣寫回（F297）', () => {
  it('每一類都和原本相同（只差場景面板改用新 ID 的一處）；ZIP 通過自我檢查', async () => {
    const fx = await roomFixture();
    const r = await importRoomZip(fx.zip);
    const built = zipOf(r.project, imagesOf(r));
    expect(built.missing).toEqual([]);
    const out = built.data;
    const orig = fx.json;
    const e = out.entities as unknown as Json;
    const o = orig.entities as Json;
    expect(e.room).toEqual(o.room);
    expect(e.items).toEqual(o.items);
    expect(e.decks).toEqual(o.decks);
    expect(e.notes).toEqual(o.notes);
    expect(e.characters).toEqual(o.characters);
    expect(e.effects).toEqual(o.effects);
    expect(e.savedatas).toEqual(o.savedatas);
    expect(e.snapshots).toEqual(o.snapshots);
    expect(e.extraKind).toEqual(o.extraKind);
    expect(e.scenes.s1).toEqual(o.scenes.s1);
    expect(e.scenes.s2).toEqual(o.scenes.s2);
    expect(e.scenes.s4).toEqual(o.scenes.s4);
    /* s3：m2 成為演出，改用新 ID，內容相同 */
    const m2 = o.scenes.s3.markers.m2;
    expect(e.scenes.s3).toEqual({ ...o.scenes.s3, markers: { 'm2~2': m2 } });
    expect(out.meta).toEqual({ version: '1.1.0' });
    expect(Object.keys(out.resources).sort()).toEqual(Object.keys(orig.resources).sort());
    const check = await checkRoomZip(built.bytes);
    expect(check.problems).toEqual([]);
    expect(check.sceneCount).toBe(4);
    expect(check.characterCount).toBe(2);
  });

  it('再讀一次（ZIP → 專案 → ZIP → 專案）：專案內容相同', async () => {
    const fx = await roomFixture();
    const r1 = await importRoomZip(fx.zip);
    const built = zipOf(r1.project, imagesOf(r1));
    const r2 = await importRoomZip(built.bytes, { fileName: 'again.zip' });
    expect(r2.project.parts).toEqual(r1.project.parts);
    expect(r2.project.scenes).toEqual(
      r1.project.scenes.map((s) => ({ ...s, markers: s.markers.map((m) => ({ ...m })) })),
    );
    expect(
      r2.project.pieces.map((p) => ({ ...p, faces: p.faces.map((f) => ({ ...f, id: '' })) })),
    ).toEqual(
      r1.project.pieces.map((p) => ({ ...p, faces: p.faces.map((f) => ({ ...f, id: '' })) })),
    );
    expect(r2.project.keep).toEqual(r1.project.keep);
    expect(r2.project.room).toEqual(r1.project.room);
  });

  it('套用中的場景：讀入時的那個場景還在就維持；刪掉了改第一個；讀入時沒有套用就維持沒有', async () => {
    const fx = await roomFixture();
    const { project } = await importRoomZip(fx.zip);
    expect(dataOf(project).entities.room.sceneId).toBe('s2');
    const removed = structuredClone(project);
    removed.scenes = removed.scenes.filter((s) => s.id !== 's2');
    expect(dataOf(removed).entities.room.sceneId).toBe('s1');
    const none = await importRoomZip(
      (await roomFixture({ mutate: (j) => (j.entities.room.sceneId = null) })).zip,
    );
    expect(dataOf(none.project).entities.room.sceneId).toBeNull();
  });

  it('沒有讀入資料的專案：輸出沒有多出任何欄位（保留機制不影響一般匯出）', () => {
    const p = createProject('x');
    const d = dataOf(p);
    expect(Object.keys(d.entities)).toEqual([
      'room',
      'items',
      'decks',
      'notes',
      'characters',
      'effects',
      'scenes',
      'savedatas',
      'snapshots',
    ]);
    expect(d.meta).toEqual({ version: '1.1.0' });
    expect(d.entities.notes).toEqual({});
  });
});

describe('讀入後編輯再匯出（F297）', () => {
  async function load() {
    const fx = await roomFixture();
    const r = await importRoomZip(fx.zip);
    return { fx, r, p: structuredClone(r.project) as Project };
  }

  it('改過的跟著改、沒動的維持原樣', async () => {
    const { fx, p } = await load();
    p.scenes[0].name = '序章（改）';
    p.scenes[0].text = '新的開場';
    const m3 = p.parts.find((x) => x.id === 'm3')!;
    m3.x = 6;
    const c1 = p.pieces[0];
    c1.hp = '20';
    c1.memo = '新的備忘';
    const out = dataOf(p).entities as unknown as Json;
    const o = fx.json.entities as Json;
    expect(out.scenes.s1.name).toBe('序章（改）');
    expect(out.scenes.s1.text).toBe('@閃光\n新的開場');
    /* m3：x 改了，照工具的規則取整；y、大小維持小數的原始值 */
    expect(out.room.markers.m3.x).toBe(centerToTopLeft({ x: 6, y: 2.25, width: 2, height: 3 }).x);
    expect(out.room.markers.m3.y).toBe(1);
    expect(out.room.markers.m3.height).toBe(2.5);
    /* 沒動的標記完全相同 */
    expect(out.room.markers.m2).toEqual(o.room.markers.m2);
    /* 角色：HP 改了，SAN、MP 維持；備忘跟著改；位置等欄位維持 */
    expect(out.characters.c1.status).toEqual([
      { label: 'HP', value: 20, max: 20 },
      { label: 'SAN', value: 50, max: 99 },
      { label: 'MP', value: 4, max: 4 },
    ]);
    expect(out.characters.c1.memo).toBe('新的備忘');
    expect(out.characters.c1.x).toBe(3);
    expect(out.scenes.s2).toEqual(o.scenes.s2);
  });

  it('HP 沒改過維持 { value 7, max 12 }；清空 MP 拿掉那一欄；新增 HP 放在最前面', async () => {
    const { p } = await load();
    expect(dataOf(p).entities.characters.c1.status).toEqual([
      { label: 'HP', value: 7, max: 12 },
      { label: 'SAN', value: 50, max: 99 },
      { label: 'MP', value: 4, max: 4 },
    ]);
    p.pieces[0].mp = '';
    expect(
      (dataOf(p).entities.characters.c1.status as { label: string }[]).map((s) => s.label),
    ).toEqual(['HP', 'SAN']);
    p.pieces[1].hp = '9';
    expect(dataOf(p).entities.characters.c2.status).toEqual([{ label: 'HP', value: 9, max: 9 }]);
  });

  it('刪除部件、場景、棋子：不再出現；套用中的場景被刪掉改第一個', async () => {
    const { p } = await load();
    p.parts = p.parts.filter((x) => x.id !== 'm2' && x.id !== 'i1');
    p.scenes = p.scenes.filter((s) => s.id !== 's2');
    p.pieces = p.pieces.filter((x) => x.id !== 'c2');
    const out = dataOf(p).entities as unknown as Json;
    expect(Object.keys(out.room.markers).sort()).toEqual(['m1', 'm3', 'm4']);
    expect(Object.keys(out.items).sort()).toEqual(['i2', 'i3', 'i4']);
    expect(Object.keys(out.scenes)).toEqual(['s1', 's3', 's4']);
    expect(Object.keys(out.characters)).toEqual(['c1']);
    expect(out.room.sceneId).toBe('s1');
  });

  it('刪除素材：一併清掉保留欄位裡的引用（頭像、面板背面、牌堆、劇本文字），不會匯出出 ZIP 裡沒有的圖', async () => {
    const { fx, r, p } = await load();
    const names = [fx.names.cover, fx.names.deepIcon, fx.names.noteIcon];
    expect(materialUsages(p, fx.names.cover)).toHaveLength(1);
    expect(materialUsages(p, fx.names.deepIcon).map((u) => u.label)).toEqual([
      '讀入的房間資料（原樣保留的欄位）',
    ]);
    deleteMaterials(p, names);
    const out = dataOf(p).entities as unknown as Json;
    expect(out.items.i1.coverImageUrl).toBeNull();
    expect(out.decks.d1.backImageUrl).toBeNull();
    expect(out.notes.n1.iconUrl).toBeNull();
    expect(out.extraKind.z1.iconUrl).toBeNull();
    const built = zipOf(p, imagesOf(r));
    expect(built.missing).toEqual([]);
    expect((await checkRoomZip(built.bytes)).problems).toEqual([]);
  });

  it('保留欄位引用的圖片沒有資料時算遺失圖片（匯出前要處理）', async () => {
    const { fx, p } = await load();
    const have = new Set(p.materials.map((m) => m.name));
    have.delete(fx.names.deepIcon);
    const broken = brokenImages(p, (n) => have.has(n));
    expect(broken.map((b) => b.name)).toEqual([fx.names.deepIcon]);
  });

  it('放掉保留的資料：匯出沒有它們', async () => {
    const { p } = await load();
    delete p.keep;
    const out = dataOf(p).entities as unknown as Json;
    expect(out.notes).toEqual({});
    expect(out.decks).toEqual({});
    expect(out.extraKind).toBeUndefined();
    expect(Object.keys(out.items).sort()).toEqual(['i1', 'i2']);
    expect(Object.keys(out.room.markers).sort()).toEqual(['m1', 'm2', 'm3']);
  });
});

describe('本工具匯出 → 讀入 → 模型相同、再匯出相同（F287）', () => {
  const tool: ToolSettings = createToolSettings();

  interface Real {
    material: Material;
    image: RoomImageFile;
  }
  async function real(
    label: string,
    w: number,
    h: number,
    rgb: [number, number, number],
  ): Promise<Real> {
    const px = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) px.set([rgb[0], rgb[1], (rgb[2] + (i % 7)) % 256, 255], i * 4);
    const data = new Uint8Array(await encodePng(px, w, h));
    const name = `${sha(data)}.png`;
    return {
      material: {
        name,
        label,
        tags: ['other'],
        animated: false,
        originalName: `${label}.png`,
        mime: 'image/png',
        before: data.length,
        after: data.length,
        width: w,
        height: h,
      },
      image: { name, type: 'image/png', data },
    };
  }

  async function ownProject() {
    const bg = await real('書房', 160, 90, [200, 120, 60]);
    const fg = await real('前景', 200, 120, [60, 160, 200]);
    const hero = await real('主角', 90, 220, [90, 90, 200]);
    const mark = await real('標記', 40, 40, [10, 200, 10]);
    const board = await real('看板', 80, 40, [200, 10, 10]);
    const all = [bg, fg, hero, mark, board];
    const p = createProject('自己的房間');
    p.materials.push(...all.map((x) => x.material));
    p.room.fieldWidth = 30;
    p.room.fieldHeight = 20;
    p.room.backgroundUrl = bg.material.name;
    p.room.foregroundUrl = fg.material.name;
    p.room.legacyDice = true;
    p.room.bgmCrossfade = false;
    const c = () => ctxOf(p, tool);
    const m1 = addPart(p, { kind: 'marker', name: '橫幅', imageUrl: mark.material.name }, c());
    updatePart(p, m1.id, { x: 3, y: -4, width: 5 }, c());
    const m2 = addPart(p, { kind: 'marker', name: '角落' }, c());
    updatePart(
      p,
      m2.id,
      { imageUrl: board.material.name, x: -9, y: 7, width: 6, text: '說明' },
      c(),
    );
    const pn = addPart(p, { kind: 'panel', name: '看板' }, c());
    updatePart(p, pn.id, { imageUrl: board.material.name, text: '備註' }, c());
    const hidden = addPart(p, { kind: 'marker', name: '沒圖' }, c());
    expect(hidden.imageUrl).toBeNull();
    const [s1id] = createFromMaterials(p, 'scene', [bg.material.name], c());
    const s2 = addScene(p, '第二幕', fg.material.name);
    const s3 = addScene(p, '第三幕', null);
    const s1 = p.scenes[0];
    s1.backgroundMode = 'foreground';
    s1.foregroundUrl = fg.material.name;
    s1.autoCrop = false;
    s1.displayGrid = true;
    s2.backgroundMode = 'image';
    s2.backgroundUrl = hero.material.name;
    s3.backgroundMode = 'none';
    s3.fieldWidth = 25;
    setOverride(p, s2.id, m1.id, { x: -5, y: 2, width: 7, height: 4, z: 25 });
    setOverride(p, s2.id, m2.id, { imageUrl: mark.material.name });
    setOverride(p, s3.id, m1.id, { hidden: true });
    const cut = assignCutin(p, s1id, 'new');
    expect(cut).not.toBeNull();
    if (cut) {
      cut.name = '閃光';
      cut.imageUrl = mark.material.name;
    }
    s1.text = '開場白';
    s2.text = '兩行\n的文字';
    const t = addTachie(
      p,
      { character: '主角', expression: '微笑', imageUrl: hero.material.name },
      c(),
    );
    finalize(p, c());
    setTachieAppear(p, s1id, t.id, true, c());
    const e1 = addEffect(p, s2.id, null, c())!;
    updateEffect(p, s2.id, e1.id, { imageUrl: fg.material.name }, c());
    const e2 = addEffect(p, s2.id, null, c())!;
    updateEffect(
      p,
      s2.id,
      e2.id,
      { kind: 'free', text: '看這裡', x: 4, y: -3, width: 5, height: 3 },
      c(),
    );
    const piece = addPiece(p, 'normal');
    Object.assign(piece, {
      name: '店員',
      iconUrl: hero.material.name,
      hp: '10',
      mp: '5',
      commands: '1d100',
      memo: '備忘',
    });
    addPieceFace(p, piece.id);
    Object.assign(piece.faces[0], { label: '生氣', iconUrl: mark.material.name });
    addPiece(p, 'enemy');
    finalize(p, c());
    return { p, images: all.map((x) => x.image) };
  }

  /** 模型裡「會輸出」的部分 */
  function model(p: Project) {
    return {
      name: p.name,
      room: {
        ...p.room,
        placeholders: undefined,
        defaults: undefined,
        tachieAlign: undefined,
        tachieBaseline: undefined,
        tachieHeight: undefined,
        tachieX: undefined,
        extra: undefined,
      },
      /* 讀入時共用標記排在螢幕面板前面（各自維持原順序） */
      parts: [
        ...p.parts.filter((x) => x.kind === 'marker'),
        ...p.parts.filter((x) => x.kind === 'panel'),
      ]
        .filter((x) => x.imageUrl)
        .map(({ id, kind, imageUrl, x, y, width, height, z, text }) => ({
          id,
          kind,
          imageUrl,
          x,
          y,
          width,
          height,
          z,
          text,
        })),
      scenes: p.scenes.map((s) => ({
        id: s.id,
        name: s.name,
        foregroundUrl: s.foregroundUrl,
        backgroundMode: s.backgroundMode,
        backgroundUrl: s.backgroundMode === 'image' ? s.backgroundUrl : null,
        fieldWidth: s.fieldWidth,
        fieldHeight: s.fieldHeight,
        autoCrop: s.autoCrop,
        displayGrid: s.displayGrid,
        text: s.text,
        cutinId: s.cutinId,
        overrides: Object.fromEntries(
          Object.entries(s.overrides).map(([k, v]) => [k, { ...v, locked: undefined }]),
        ),
      })),
      cutins: p.cutins.map(({ id, name, imageUrl }) => ({ id, name, imageUrl })),
      pieces: p.pieces.map((x) => ({
        id: x.id,
        name: x.name,
        iconUrl: x.iconUrl,
        hp: x.hp,
        mp: x.mp,
        memo: x.memo,
        commands: x.commands,
        faces: x.faces.map((f) => ({ label: f.label, iconUrl: f.iconUrl })),
      })),
      materials: p.materials.map((m) => m.name).sort(),
    };
  }

  it('模型相同（素材、房間、部件、場景與差異、切入、棋子），再匯出的 __data.json 完全相同', async () => {
    const { p, images } = await ownProject();
    const built = zipOf(p, images);
    expect((await checkRoomZip(built.bytes)).problems).toEqual([]);
    const r = await importRoomZip(built.bytes, { fileName: '自己的房間.zip' });
    const back = r.project;
    const a = JSON.parse(JSON.stringify(model(p)));
    const b = JSON.parse(JSON.stringify(model(back)));
    /* 素材：匯出只收用到的圖，其餘不在 ZIP 裡 */
    const used = new Set(Object.keys(built.data.resources));
    a.materials = a.materials.filter((n: string) => used.has(n));
    expect(b.name).toBe('自己的房間');
    b.name = a.name;
    expect(b).toEqual(a);
    /* 立繪的登場成為演出；除此之外再匯出完全相同 */
    expect(dataOf(back)).toEqual(dataOf(p));
    expect(back.scenes[0].markers.map((m) => m.kind)).toEqual(['free']);
    /* 沒有圖的部件不在 ZIP 裡，所以讀回來也沒有；沒有保留的資料 */
    expect(back.parts.length).toBe(p.parts.filter((x) => x.imageUrl).length);
    expect(keptCounts(back.keep)).toMatchObject({ items: 0, roomMarkers: 0, sceneMarkers: 0 });
  });

  it('兩次來回的 ZIP 內容（__data.json、圖片）相同', async () => {
    const { p, images } = await ownProject();
    const first = zipOf(p, images);
    const r = await importRoomZip(first.bytes);
    const second = zipOf(r.project, imagesOf(r));
    const a = readRoomZip(first.bytes);
    const b = readRoomZip(second.bytes);
    expect(b.json).toEqual(a.json);
    expect(b.images.map((i) => i.path).sort()).toEqual(a.images.map((i) => i.path).sort());
  });
});

describe('壞檔與不是房間 ZIP（F289）：丟 RoomImportError，說明清楚', () => {
  const fail = async (bytes: Uint8Array) => {
    try {
      await importRoomZip(bytes);
    } catch (e) {
      expect(e).toBeInstanceOf(RoomImportError);
      return e as RoomImportError;
    }
    throw new Error('應該要丟錯');
  };

  it('不是 ZIP（文字、空檔、被截斷的 ZIP）', async () => {
    expect((await fail(new TextEncoder().encode('{"hello":1}'))).code).toBe('not-zip');
    expect((await fail(new Uint8Array(0))).code).toBe('not-zip');
    const fx = await roomFixture();
    expect((await fail(fx.zip.slice(0, 60))).code).toBe('not-zip');
    expect((await fail(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).code).toBe('not-zip');
  });

  it('ZIP 裡沒有房間資料、資料不是 JSON、資料看不出是房間', async () => {
    const png = await solidPng(8, 8, [1, 1, 1, 255]);
    const e1 = await fail(
      zipFiles([
        { name: 'a.png', data: png },
        { name: 'note.txt', data: 'x' },
      ]),
    );
    expect(e1.code).toBe('no-data');
    expect(e1.message).toContain('找不到房間資料');
    const e2 = await fail(zipFiles([{ name: '__data.json', data: '{ 壞掉的' }]));
    expect(e2.code).toBe('bad-json');
    const e3 = await fail(zipFiles([{ name: '__data.json', data: '{"hello": 1}' }]));
    expect(e3.code).toBe('not-room');
    const e4 = await fail(zipFiles([{ name: '__data.json', data: '[1,2,3]' }]));
    expect(e4.code).toBe('not-room');
  });

  it('版本不認得：說出版本；1.x 都收；沒有 meta 也收', async () => {
    const mk = async (meta: unknown) =>
      zipFiles([
        {
          name: '__data.json',
          data: JSON.stringify({
            ...(meta === undefined ? {} : { meta }),
            entities: { room: {}, scenes: {} },
            resources: {},
          }),
        },
      ]);
    const e = await fail(await mk({ version: '2.0.0' }));
    expect(e.code).toBe('version');
    expect(e.message).toContain('2.0.0');
    expect((await importRoomZip(await mk({ version: '1.9.3' }))).project.scenes).toEqual([]);
    expect((await importRoomZip(await mk(undefined))).project.keep).toBeUndefined();
  });

  it('本工具的專案檔（project.json＋files/）：請用開啟專案檔', async () => {
    const zip = zipFiles([
      {
        name: 'project.json',
        data: JSON.stringify({ format: 'trpg-toolkit-project', tool: 'room-zip', data: {} }),
      },
      { name: 'files/a.png', data: new Uint8Array([1]) },
    ]);
    const e = await fail(zip);
    expect(e.code).toBe('project-file');
    expect(e.message).toContain('專案檔');
    expect(looksLikeRoomZip(zip)).toBe(false);
  });

  it('分辨是不是房間 ZIP', async () => {
    const fx = await roomFixture();
    expect(looksLikeRoomZip(fx.zip)).toBe(true);
    expect(looksLikeRoomZip(new TextEncoder().encode('{}'))).toBe(false);
    expect(looksLikeRoomZip(zipFiles([{ name: 'a.txt', data: 'x' }]))).toBe(false);
  });
});

describe('讀入的容錯（5. 容易做壞的地方）', () => {
  const mk = (entities: unknown, extra: Record<string, unknown> = {}) =>
    zipFiles([
      {
        name: '__data.json',
        data: JSON.stringify({ meta: { version: '1.1.0' }, entities, resources: {}, ...extra }),
      },
    ]);

  it('檔案太大：讀檔之前就擋下（assertRoomZipSize）', () => {
    expect(() => assertRoomZipSize(ROOM_ZIP_MAX_BYTES)).not.toThrow();
    try {
      assertRoomZipSize(ROOM_ZIP_MAX_BYTES + 1);
      throw new Error('應該要丟錯');
    } catch (e) {
      expect(e).toBeInstanceOf(RoomImportError);
      expect((e as RoomImportError).code).toBe('too-large');
      expect((e as Error).message).toContain('400 MB');
    }
  });

  it('__proto__ 之類的鍵不會污染物件、也不會丟錯', async () => {
    const zip = mk(
      JSON.parse(
        '{"room":{"__proto__":{"polluted":1},"fieldWidth":9,"fieldHeight":9,"markers":{"__proto__":{"imageUrl":"x.png","x":0,"y":0}}},' +
          '"scenes":{"__proto__":{"name":"壞"},"s":{"name":"好","__proto__":{"a":1}}},' +
          '"notes":{"__proto__":{"name":"壞"},"n":{"name":"好"}},"__proto__":{"x":{}}}',
      ),
    );
    const r = await importRoomZip(zip);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(r.project.scenes.map((s) => s.name)).toEqual(['好']);
    expect(r.project.parts).toEqual([]);
    expect(Object.keys(r.project.keep?.entities?.notes ?? {})).toEqual(['n']);
    const out = dataOf(r.project).entities as unknown as Json;
    expect(Object.keys(out.scenes)).toEqual(['s']);
  });

  it('容器是陣列（ID 用物件的 id 欄位或索引）、資料包在 data 底下、meta.version 是數字 1', async () => {
    const zip = zipFiles([
      {
        name: 'data.json',
        data: JSON.stringify({
          data: {
            meta: { version: 1 },
            entities: {
              room: { fieldWidth: 10, fieldHeight: 8 },
              scenes: [
                { id: 'a', name: 'A', order: 2 },
                { name: 'B', order: 1 },
              ],
              characters: [{ name: '甲' }],
            },
          },
        }),
      },
    ]);
    const r = await importRoomZip(zip);
    expect(r.project.scenes.map((s) => [s.id, s.name])).toEqual([
      ['1', 'B'],
      ['a', 'A'],
    ]);
    expect(r.project.pieces[0].name).toBe('甲');
    expect(r.project.room.fieldWidth).toBe(10);
  });

  it('標記與螢幕面板同 ID：部件 ID 不重複；order 不是整數、缺少、同值都排得出順序', async () => {
    const img = await solidPng(8, 8, [5, 5, 5, 255]);
    const name = `${sha(img)}.png`;
    const zip = zipFiles([
      {
        name: '__data.json',
        data: JSON.stringify({
          entities: {
            room: { markers: { a: { x: 0, y: 0, width: 2, height: 2, imageUrl: name } } },
            items: {
              a: { x: 1, y: 1, width: 2, height: 2, imageUrl: name, order: 2.5 },
              b: { x: 2, y: 2, width: 2, height: 2, imageUrl: name },
              c: { x: 3, y: 3, width: 2, height: 2, imageUrl: name, order: 1 },
              d: { x: 4, y: 4, width: 2, height: 2, imageUrl: name, order: 1 },
            },
            scenes: { s: { name: 'S', order: 'abc' }, t: { name: 'T', order: 1 } },
          },
        }),
      },
      { name, data: img },
    ]);
    const r = await importRoomZip(zip);
    expect(r.project.parts.map((p) => p.id)).toEqual(['a', 'c', 'd', 'a~2', 'b']);
    expect(r.project.scenes.map((s) => s.name)).toEqual(['T', 'S']);
  });

  it('ZIP 裡的資料夾與其他資料夾裡的資料檔、圖片在子資料夾', async () => {
    const img = await solidPng(8, 8, [6, 6, 6, 255]);
    const zip = zipFiles([
      { name: '房間/', data: new Uint8Array(0) },
      {
        name: '房間/room.json',
        data: JSON.stringify({
          entities: { room: { backgroundUrl: 'pics/bg.png', fieldWidth: 5, fieldHeight: 5 } },
        }),
      },
      { name: '房間/pics/bg.png', data: img },
    ]);
    const r = await importRoomZip(zip);
    expect(r.project.room.backgroundUrl).toBe(`${sha(img)}.png`);
    expect(r.report.lost.missing).toEqual([]);
    expect(r.report.lost.files).toBe(0);
  });
});

describe('一步復原（F290）', () => {
  it('換掉專案記成一步：復原回到換掉之前、重做回到讀入的；連續變更的合併不會把這一步併掉', () => {
    const store = createToolStore<{ n: number }>(
      'room-zip-test',
      { n: 0 },
      { persist: false, coalesceMs: 800 },
    );
    store.getState().update((d) => {
      d.n = 1;
    });
    /* 0.8 秒內緊接著換掉 */
    replaceUndoable(store, { n: 99 });
    expect(store.getState().data.n).toBe(99);
    expect(store.temporal.getState().pastStates.length).toBe(2);
    store.temporal.getState().undo();
    expect(store.getState().data.n).toBe(1);
    store.temporal.getState().redo();
    expect(store.getState().data.n).toBe(99);
  });

  it('空的專案不必確認；有內容才要', async () => {
    const fx = await roomFixture();
    const r = await importRoomZip(fx.zip);
    expect(isProjectBlank(createProject())).toBe(true);
    expect(isProjectBlank(r.project)).toBe(false);
    const p = createProject();
    p.keep = { meta: { version: '1.1.0' } };
    expect(isProjectBlank(p)).toBe(false);
  });
});
