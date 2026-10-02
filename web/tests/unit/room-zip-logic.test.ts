/**
 * 房間 ZIP 產生器（room-zip）的純規則：匯入的用途推測與動態圖判斷、容量顯示、座標與立繪、全畫面演出、
 * 貼上建立場景、劇本文字分割、淡入淡出動態圖（附件 M02～M04 的影格數、播放次數、每格延遲、像素）、
 * 圖片加工（M06 的輸出尺寸、裁切正規化、雜訊）、合成圖製作器（預設值、對齊、均分、改大小、檔名）。
 */
import { describe, expect, it } from 'vitest';
import { ApngEncoder } from '@/core/encode';
import {
  addPart,
  addScene,
  addTachie,
  applyTachieBulk,
  createFromMaterials,
  ctxOf,
  deleteMaterials,
  duplicatePart,
  finalize,
  movePart,
  setTachieAppear,
  setTachieDefaultHeight,
  updatePart,
} from '@/tools/room-zip/actions';
import {
  editDefaults,
  editedSize,
  noiseTile,
  normalizeCrop,
  percentCrop,
  signRed,
} from '@/tools/room-zip/edit';
import {
  encodeFade,
  fadeDelays,
  fadeFileName,
  fadeFrame,
  fadeFrameCount,
  fadeSize,
  initialEndpoints,
  normalizeFadeMs,
  setEndpoint,
} from '@/tools/room-zip/fade';
import { fullEffectSize, tachieY } from '@/tools/room-zip/geometry';
import { alignLayers, makerFileName, newLayer, resizeLayer } from '@/tools/room-zip/maker';
import {
  brokenImages,
  formatKb,
  guessTag,
  isAnimatedImage,
  materialUsages,
  sizeTotals,
  toggleTag,
} from '@/tools/room-zip/materials';
import {
  createProject,
  createRoomDesign,
  createToolSettings,
  fieldSizeInput,
  type Material,
} from '@/tools/room-zip/model';
import {
  findMaterialByName,
  moveBefore,
  moveSelected,
  moveSelectedTo,
  renamePairs,
  sequenceLabel,
  splitCells,
} from '@/tools/room-zip/scenes';
import { storyAutoTitle, storyBulkEntries, storySingleTitle } from '@/tools/room-zip/story';
import RZ from '../../../docs/refactor/specs/room-zip.examples.json';
import { composeApng, parseApng } from '../helpers/png';

type Mat = {
  output: {
    apngFrames?: number;
    apngPlays?: number;
    frameDelays?: string[];
    width: number;
    height: number;
  };
};
const M = (id: string) =>
  (RZ as unknown as { materials: Record<string, Mat> }).materials[id].output;

const mat = (
  name: string,
  label: string,
  w: number,
  h: number,
  tags: Material['tags'] = ['other'],
): Material => ({
  name,
  label,
  tags,
  animated: false,
  originalName: `${label}.png`,
  mime: 'image/png',
  before: 100,
  after: 100,
  width: w,
  height: h,
});
const H = (c: string) => `${c.repeat(64)}.png`;

describe('匯入：用途推測（F042）與動態圖判斷（2.）', () => {
  it('依寬高比依序判斷', () => {
    expect(guessTag(1200, 400)).toBe('frame');
    expect(guessTag(1200, 675)).toBe('fg');
    expect(guessTag(799, 450)).toBe('other');
    expect(guessTag(256, 256)).toBe('icon');
    expect(guessTag(513, 513)).toBe('other');
    expect(guessTag(600, 1200)).toBe('tachie');
    expect(guessTag(400, 600)).toBe('panel');
    expect(guessTag(0, 10)).toBe('other');
  });

  it('APNG 要在 IDAT 之前找到 acTL；GIF 一律算動態；WebP 看 ANIM 或 VP8X 的動畫旗標', async () => {
    const enc = new ApngEncoder({ width: 2, height: 2, fps: 10, mergeIdentical: false });
    await enc.addFrame(new Uint8ClampedArray(16).fill(255));
    await enc.addFrame(new Uint8ClampedArray(16));
    const apng = (await enc.finish()).bytes;
    expect(isAnimatedImage(apng, 'image/png')).toBe(true);
    expect(isAnimatedImage(apng, '', 'a.PNG')).toBe(true);
    /* MIME 與副檔名都不是 PNG 時不檢查 */
    expect(isAnimatedImage(apng, 'image/jpeg', 'a.jpg')).toBe(false);
    const still = new ApngEncoder({ width: 2, height: 2, fps: 10 });
    await still.addFrame(new Uint8ClampedArray(16));
    const one = (await still.finish()).bytes;
    expect(isAnimatedImage(one, 'image/png')).toBe(true); /* 編碼器一律寫 acTL */
    const plain = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 0, 0x49, 0x44, 0x41, 0x54, 0, 0, 0, 0, 0x61,
      0x63, 0x54, 0x4c,
    ]);
    expect(isAnimatedImage(plain, 'image/png')).toBe(false);
    expect(isAnimatedImage(new Uint8Array(4), 'image/gif')).toBe(true);
    const vp8x = new Uint8Array(40);
    vp8x.set([0x56, 0x50, 0x38, 0x58], 12);
    vp8x[20] = 0x02;
    expect(isAnimatedImage(vp8x, 'image/webp')).toBe(true);
    vp8x[20] = 0x10;
    expect(isAnimatedImage(vp8x, 'image/webp')).toBe(false);
  });

  it('容量顯示與合計（F046）', () => {
    expect(formatKb(1023)).toBe('1023 B');
    expect(formatKb(5752)).toBe('6 KB');
    expect(formatKb(1109008)).toBe('1.1 MB');
    expect(sizeTotals([{ ...mat('a', 'a', 1, 1), before: 1000, after: 250 }])).toEqual({
      before: 1000,
      after: 250,
      saved: 75,
    });
  });

  it('標籤全部取消時變成「其他」', () => {
    expect(toggleTag(['fg'], 'fg', false)).toEqual(['other']);
    expect(toggleTag(['fg'], 'icon', true)).toEqual(['fg', 'icon']);
  });
});

describe('座標、立繪、演出（3.2.1、3.2.6、3.2.7）', () => {
  it('垂直位置：靠下、靠上、置中、指定位置（預設 L15、H18、D0 → 6）', () => {
    const room = createRoomDesign();
    expect(tachieY(room, 18, 0)).toBe(6);
    expect(tachieY({ ...room, tachieAlign: 'top' }, 18, 1)).toBe(25);
    expect(tachieY({ ...room, tachieAlign: 'center' }, 18, 2)).toBe(17);
    expect(tachieY({ ...room, tachieAlign: 'position' }, 12, 2)).toBe(7);
  });

  it('全畫面：900×800 蓋滿 → 40×36、拉伸 → 41×31、沒有圖 → 40×30、完整放入', () => {
    expect(fullEffectSize('cover', 40, 30, 900 / 800)).toEqual({
      x: 0,
      y: 0,
      width: 40,
      height: 36,
    });
    expect(fullEffectSize('stretch', 40, 30, 900 / 800)).toEqual({
      x: 0,
      y: 0,
      width: 41,
      height: 31,
    });
    expect(fullEffectSize('cover', 40, 30, null)).toEqual({ x: 0, y: 0, width: 40, height: 30 });
    expect(fullEffectSize('contain', 40, 30, 900 / 800)).toEqual({
      x: 0,
      y: 0,
      width: 34,
      height: 30,
    });
    expect(fullEffectSize('cover', 40, 30, 4)).toEqual({ x: 0, y: 0, width: 120, height: 30 });
  });

  it('D5：改立繪高度、抬升、基準線或對齊方式後重算已登場立繪的垂直位置（水平位置不變）', () => {
    const p = createProject();
    const tool = createToolSettings();
    p.materials.push(mat(H('a'), 'a', 600, 1200, ['tachie']));
    const ctx = ctxOf(p, tool);
    const tc = addTachie(p, { imageUrl: H('a') }, ctx);
    const s = addScene(p, 'S', null);
    setTachieAppear(p, s.id, tc.id, true, ctx);
    const m = p.scenes[0].markers[0];
    m.x = 7;
    expect([m.width, m.height, m.y]).toEqual([9, 18, 6]);
    tc.height = 10;
    finalize(p, ctx);
    expect([m.x, m.width, m.height, m.y]).toEqual([7, 5, 10, 10]);
    /* 手動改過的垂直位置在條件沒變時保留 */
    m.y = 3;
    finalize(p, ctx);
    expect(m.y).toBe(3);
    p.room.tachieBaseline = 10;
    finalize(p, ctx);
    expect(m.y).toBe(5);
    setTachieDefaultHeight(p, 12);
    finalize(p, ctx);
    expect([m.width, m.height, m.y]).toEqual([6, 12, 4]);
    expect(applyTachieBulk(p, 'dy', 1)).toBe(1);
    finalize(p, ctx);
    expect(m.y).toBe(3);
  });

  it('部件：固定長寬比、清單內上下移動只在同種類間交換、複製位置 +1', () => {
    const p = createProject();
    p.materials.push(mat(H('b'), 'b', 1200, 400));
    const ctx = ctxOf(p, createToolSettings());
    const a = addPart(p, { kind: 'marker', name: 'A' }, ctx);
    const panel = addPart(p, { kind: 'panel', name: 'P' }, ctx);
    const b = addPart(p, { kind: 'marker', name: 'B', imageUrl: H('b') }, ctx);
    expect([b.width, b.height]).toEqual([4, 1]);
    updatePart(p, b.id, { height: 3 }, ctx);
    expect([b.width, b.height]).toEqual([9, 3]);
    updatePart(p, b.id, { x: 2.5, y: -2.5 }, ctx);
    expect([b.x, b.y]).toEqual([3, -3]);
    expect(p.parts.map((x) => x.name)).toEqual(['B', 'P', 'A']);
    movePart(p, b.id, 1);
    expect(p.parts.map((x) => x.name)).toEqual(['A', 'P', 'B']);
    expect([panel.width, panel.height]).toEqual([37, 28]);
    const c = duplicatePart(p, a.id)!;
    expect([c.name, c.x, c.y, p.parts[0].id]).toEqual(['A 複本', 1, 1, c.id]);
  });

  it('D2：刪除素材時引用一併清掉；使用處清單；遺失圖片', () => {
    const p = createProject();
    p.materials.push(mat(H('c'), '夜景', 900, 800, ['fg']));
    const ctx = ctxOf(p, createToolSettings());
    createFromMaterials(p, 'scene', [H('c')], ctx);
    p.room.backgroundUrl = H('c');
    expect(materialUsages(p, H('c')).map((u) => u.label)).toEqual([
      '房間背景',
      '場景「夜景」的前景',
    ]);
    expect(brokenImages(p, () => false)).toEqual([
      { name: H('c'), uses: ['房間背景', '場景「夜景」的前景'] },
    ]);
    deleteMaterials(p, [H('c')]);
    expect(p.room.backgroundUrl).toBeNull();
    expect(p.scenes[0].foregroundUrl).toBeNull();
    expect(brokenImages(p, () => false)).toEqual([]);
  });

  it('盤面寬高欄（D13）：1 以上的整數，空白或無效時回到原值', () => {
    expect(fieldSizeInput('', 40)).toBe(40);
    expect(fieldSizeInput('-3', 40)).toBe(40);
    expect(fieldSizeInput('0', 30)).toBe(30);
    expect(fieldSizeInput('12.5', 30)).toBe(13);
  });
});

describe('貼上建立場景、勾選移動、批次改名（3.2.13、F178、F056、F059）', () => {
  it('Tab 優先、CSV 引號與 "" 跳脫', () => {
    expect(splitCells('a,"b,c",d')).toEqual(['a', 'b,c', 'd']);
    expect(splitCells('a,"say ""hi""",x')).toEqual(['a', 'say "hi"', 'x']);
    expect(splitCells('a\t"b,c"\td')).toEqual(['a', '"b,c"', 'd']);
  });

  it('素材查找：去副檔名、不分大小寫、雜湊檔名主體、名稱包含', () => {
    const list = [mat(H('d'), 'Forest Night', 1, 1), mat(H('e'), '夜景', 1, 1)];
    expect(findMaterialByName(list, 'forest night.PNG')).toBe(H('d'));
    expect(findMaterialByName(list, 'd'.repeat(64))).toBe(H('d'));
    expect(findMaterialByName(list, '夜')).toBe(H('e'));
    expect(findMaterialByName(list, '')).toBeNull();
  });

  it('一起上移／下移碰到頭尾就不動、移到最前／最後、拖曳整組移到目標前', () => {
    const l = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
    const ids = (x: { id: string }[]) => x.map((y) => y.id).join('');
    expect(ids(moveSelected(l, new Set(['a', 'c']), -1))).toBe('acbd');
    expect(ids(moveSelected(l, new Set(['b', 'd']), 1))).toBe('acbd');
    expect(ids(moveSelectedTo(l, new Set(['c', 'd']), 'top'))).toBe('cdab');
    expect(ids(moveBefore(l, new Set(['c', 'd']), 'a'))).toBe('cdab');
  });

  it('批次改名逐行對應、依序編號', () => {
    expect(renamePairs(' 新A \n\nb\n', ['a', 'b', 'c'])).toEqual([
      [0, '新A'],
      [2, 'b'],
    ]);
    expect(sequenceLabel('圖', 1, 2, 0)).toBe('圖01');
    expect(sequenceLabel('', 9, 1, 2)).toBe('11');
  });
});

describe('劇本文字（3.4）', () => {
  it('自動標題：第一個非空白行，# 開頭取其後，否則前 10 個字；整段空白＝預設名＋序號', () => {
    expect(storyAutoTitle('\n  # 第一章 \n本文', 1)).toBe('第一章');
    expect(storyAutoTitle('一二三四五六七八九十十一', 1)).toBe('一二三四五六七八九十');
    expect(storyAutoTitle('  \n ', 3)).toBe('段落3');
    expect(storySingleTitle('  ', '開頭', 2)).toBe('開頭');
  });

  it('批次：分隔字串、空白行分割、# 標題移除、全空白段不登錄', () => {
    const text = '# 序\n本文一\n---\n\n本文二\r\n --- \n#\n';
    expect(storyBulkEntries(text, false, '---')).toEqual([
      { title: '序', body: '本文一' },
      { title: '本文二', body: '\n本文二' },
      { title: '#', body: '#\n' },
    ]);
    expect(storyBulkEntries('a\n\nb', true, '')).toEqual([
      { title: 'a', body: 'a' },
      { title: 'b', body: 'b' },
    ]);
  });
});

describe('淡入淡出動態圖（3.3.2、附件 M02～M04）', () => {
  it('時間正規化、影格數、每格延遲', () => {
    expect(normalizeFadeMs(1.2)).toBe(1000);
    expect(normalizeFadeMs(9)).toBe(4000);
    expect(normalizeFadeMs(Number.NaN)).toBe(500);
    expect(fadeFrameCount(500)).toBe(6);
    expect(fadeFrameCount(4000)).toBe(15);
    for (const id of ['M02', 'M03', 'M04']) {
      const m = M(id);
      const ms = id === 'M02' ? 1000 : id === 'M03' ? 2000 : 4000;
      expect(fadeFrameCount(ms)).toBe(m.apngFrames);
      expect(fadeDelays(ms, fadeFrameCount(ms)).map((d) => `${d}/1000`)).toEqual(m.frameDelays);
    }
  });

  it('開始與結束的連動（F096、F097）', () => {
    expect(initialEndpoints(true)).toEqual({ start: 'image', end: 'transparent' });
    expect(initialEndpoints(false)).toEqual({ start: 'transparent', end: 'color' });
    expect(setEndpoint({ start: 'image', end: 'transparent' }, 'end', 'image', true)).toEqual({
      start: 'transparent',
      end: 'image',
    });
    expect(setEndpoint({ start: 'transparent', end: 'color' }, 'start', 'color', false)).toEqual({
      start: 'color',
      end: 'transparent',
    });
    expect(setEndpoint({ start: 'transparent', end: 'color' }, 'start', 'image', false)).toEqual({
      start: 'transparent',
      end: 'color',
    });
  });

  it('檔名與大小', () => {
    expect(fadeFileName('t3_square_256.png', { start: 'image', end: 'transparent' })).toBe(
      't3_square_256_淡出.png',
    );
    expect(fadeFileName(null, { start: 'transparent', end: 'color' })).toBe('單色淡變_淡入.png');
    expect(fadeSize({ width: 1200, height: 675 })).toEqual({ width: 1024, height: 576 });
    expect(fadeSize(null)).toEqual({ width: 128, height: 128 });
  });

  it('圖片↔顏色的混合公式', () => {
    const src = new Uint8ClampedArray([200, 100, 0, 128]);
    const px = fadeFrame({ start: 'image', end: 'color' }, src, 1, 1, '#000000', 0.5);
    const sa = 128 / 255;
    const a = 0.5 + sa * 0.5;
    expect(Array.from(px)).toEqual([
      Math.round((200 * sa * 0.5) / a),
      Math.round((100 * sa * 0.5) / a),
      0,
      Math.round(a * 255),
    ]);
  });

  it('M02：圖片 → 透明 1 秒＝12 格、播放 1 次；最後一格完全透明', async () => {
    const W = 16;
    const src = new Uint8ClampedArray(W * W * 4);
    for (let y = 2; y < 14; y++)
      for (let x = 2; x < 14; x++) src.set([220, 60, 60, 255], (y * W + x) * 4);
    const r = await encodeFade({
      start: 'image',
      end: 'transparent',
      source: src,
      width: W,
      height: W,
      color: '#000000',
      ms: 1000,
      loop: false,
    });
    const info = parseApng(r.bytes);
    expect(info.numFrames).toBe(M('M02').apngFrames);
    expect(info.numPlays).toBe(1);
    expect(info.frames.map((f) => `${f.delayNum}/${f.delayDen}`)).toEqual(M('M02').frameDelays);
    const frames = composeApng(info);
    expect(Array.from(frames[0].subarray((8 * W + 8) * 4, (8 * W + 8) * 4 + 4))).toEqual([
      220, 60, 60, 255,
    ]);
    expect(Array.from(frames[0].subarray(0, 4))).toEqual([0, 0, 0, 0]);
    expect(frames[frames.length - 1].every((v, i) => i % 4 !== 3 || v === 0)).toBe(true);
  });

  it('M03：沒有原圖、透明 → 紅色 2 秒循環＝15 格、播放 0 次、128×128；第一格透明、最後一格紅色', async () => {
    const r = await encodeFade({
      start: 'transparent',
      end: 'color',
      source: null,
      width: 128,
      height: 128,
      color: '#ff0000',
      ms: 2000,
      loop: true,
    });
    const info = parseApng(r.bytes);
    expect([info.ihdr.width, info.ihdr.height, info.numFrames, info.numPlays]).toEqual([
      128, 128, 15, 0,
    ]);
    expect(info.frames.map((f) => `${f.delayNum}/${f.delayDen}`)).toEqual(M('M03').frameDelays);
    const frames = composeApng(info);
    /* 完全透明（RGB 保留顏色；瀏覽器讀出來是 0,0,0,0） */
    expect(frames[0][3]).toBe(0);
    expect(Array.from(frames[14].subarray(0, 4))).toEqual([255, 0, 0, 255]);
  });
});

describe('圖片加工（3.3.4、附件 M06）', () => {
  it('M06：1200×675 裁掉左 100 px、轉 90° → 675×1100', () => {
    expect(editedSize(1200, 675, { ...editDefaults(), cropLeft: 100, rotate: 90 })).toEqual({
      width: 675,
      height: 1100,
    });
    expect(editedSize(1200, 675, { ...editDefaults(), rotate: 180 })).toEqual({
      width: 1200,
      height: 675,
    });
  });

  it('裁切正規化：保留的寬高至少 8 px（原圖更小則為原圖大小），正在改的那一邊讓步', () => {
    const q = normalizeCrop(
      { ...editDefaults(), cropLeft: 70, cropRight: 30 },
      100,
      50,
      'cropLeft',
    );
    expect([q.cropLeft, q.cropRight]).toEqual([62, 30]);
    const r = normalizeCrop({ ...editDefaults(), cropLeft: 70, cropRight: 30 }, 100, 50);
    expect([r.cropLeft, r.cropRight]).toEqual([70, 22]);
    expect(normalizeCrop({ ...editDefaults(), cropTop: 9 }, 5, 5).cropTop).toBe(0);
  });

  it('簽章像素（紅色值 +17 繞回）、快速裁切的百分比換算（D6）、雜訊圖樣每次相同', () => {
    expect(signRed(250)).toBe(11);
    expect(percentCrop(1200, 675, { left: 40, right: 0, top: 10, bottom: 0 })).toEqual({
      cropLeft: 480,
      cropRight: 0,
      cropTop: 68,
      cropBottom: 0,
    });
    expect(noiseTile(7)).toEqual(noiseTile(7));
    expect(noiseTile(7)).not.toEqual(noiseTile(8));
  });
});

describe('合成圖製作器（3.3.3、F107、F113、F114、F116）', () => {
  it('新元素的位置與預設值（附件 M05 的圖層）', () => {
    const rect = newLayer('rect', 0);
    const circle = newLayer('circle', 1);
    expect([
      rect.x,
      rect.y,
      (rect as { width: number }).width,
      (rect as { height: number }).height,
    ]).toEqual([80, 70, 220, 140]);
    expect([circle.x, circle.y]).toEqual([92, 82]);
    const t = newLayer('text', 0);
    expect(t).toMatchObject({
      fontSize: 64,
      weight: 700,
      color: '#ffffff',
      align: 'left',
      lineHeight: 1.25,
      letterSpacing: 0,
      stroke: true,
      strokeColor: '#000000',
      strokeWidth: 4,
    });
    expect(newLayer('image', 2, { name: 'x', width: 300, height: 200 })).toMatchObject({
      width: 300,
      height: 200,
      lockAspect: true,
    });
  });

  it('對齊與均分（頭尾不動）', () => {
    const a = { ...newLayer('rect', 0), id: 'a', x: 0, y: 0 };
    const b = { ...newLayer('rect', 0), id: 'b', x: 100, y: 50 };
    const c = { ...newLayer('rect', 0), id: 'c', x: 400, y: 10 };
    const bounds = {
      a: { x: 0, y: 0, width: 50, height: 10 },
      b: { x: 100, y: 50, width: 50, height: 10 },
      c: { x: 400, y: 10, width: 100, height: 10 },
    };
    expect(alignLayers([a, b, c], bounds, 'left')).toEqual({
      a: { x: 0, y: 0 },
      b: { x: 0, y: 50 },
      c: { x: 0, y: 10 },
    });
    expect(alignLayers([a, b, c], bounds, 'distribute-x')).toEqual({
      a: { x: 0, y: 0 },
      b: { x: 200, y: 50 },
      c: { x: 400, y: 10 },
    });
    expect(alignLayers([a, b], bounds, 'distribute-x')).toEqual({});
  });

  it('拖角改大小：對角固定、最小 8 px；圖片固定比例以變化較大的一邊為準', () => {
    const r = { ...newLayer('rect', 0), x: 10, y: 10 } as ReturnType<typeof newLayer> & {
      width: number;
      height: number;
    };
    expect(
      resizeLayer(
        { layer: r, bounds: { x: 10, y: 10, width: 220, height: 140 }, corner: 'nw' },
        300,
        10,
      ),
    ).toEqual({ width: 8, height: 130, x: 222, y: 20 });
    const im = { ...newLayer('image', 0, { name: 'x', width: 200, height: 100 }), x: 0, y: 0 };
    expect(
      resizeLayer(
        { layer: im, bounds: { x: 0, y: 0, width: 200, height: 100 }, corner: 'se' },
        100,
        10,
      ),
    ).toEqual({ width: 300, height: 150, x: 0, y: 0 });
  });

  it('檔名：留空時「合成圖_年月日_時分」', () => {
    expect(makerFileName('', new Date(2026, 9, 2, 8, 5))).toBe('合成圖_20261002_0805.webp');
    expect(makerFileName('mk')).toBe('mk.webp');
    expect(makerFileName('a/b.webp')).toBe('a_b.webp');
  });
});
