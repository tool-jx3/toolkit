/**
 * CCFOLIA & 圖片調色工作室（psd-studio）：分流、名稱、畫布尺寸、播放次數、容量壓縮的搜尋、配置檢視（規格第 1～3 節）。
 * 附件 psd-studio.examples.json 的「檔名」「畫布尺寸」「APNG 循環設定的輸出」「PSD」「容量壓縮」逐字／逐值比對。
 */
import { describe, expect, it } from 'vitest';
import {
  type Attempt,
  COLOR_STEPS,
  formatMb,
  SCALE_STEPS,
  SKIP_COLOR_STEPS,
  SKIP_MIN_FRAMES,
  SKIP_SCALE_STEPS,
  savingPercent,
  searchCompression,
  skipFrames,
  targetBytes,
} from '@/tools/psd-studio/compress';
import {
  buildRoomLayout,
  hitPsd,
  hitRoom,
  localPoint,
  roomPanelRows,
  roomRoleRanks,
} from '@/tools/psd-studio/layout';
import {
  centerOffset,
  dispatchFiles,
  exportZipName,
  folderEntries,
  isGridAligned,
  loopCount,
  matchesSearch,
  originNameOf,
  padTo24,
  pngOutputName,
  psdLayerFileNames,
  resolvePlays,
  uniqueAssetName,
  validCanvasSize,
} from '@/tools/psd-studio/naming';
import EX from '../../../docs/refactor/specs/psd-studio.examples.json';

const E = EX as unknown as {
  檔名: Record<string, Record<string, string | string[]>>;
  畫布尺寸: { 全部補齊: { 前: string[]; 後: string[] } };
  APNG: { 循環設定的輸出: Record<string, Record<string, number> | string> };
  容量壓縮: { APNG: { 嘗試順序?: string[]; 結果: string }[] };
};

const f = (name: string, type = '', webkitRelativePath = '') =>
  ({ name, type, webkitRelativePath }) as File;

describe('分流（F06）', () => {
  it('第一個 .psd 或 .zip 只處理那一個；否則收集圖片、略過其他檔案；沒有圖片時 none', () => {
    expect(dispatchFiles([f('a.png', 'image/png'), f('b.ZIP'), f('c.psd')])).toMatchObject({
      kind: 'zip',
      file: { name: 'b.ZIP' },
    });
    expect(dispatchFiles([f('c.PSD'), f('b.zip')])).toMatchObject({ kind: 'psd' });
    const imgs = dispatchFiles([
      f('a.png'),
      f('筆記.txt', 'text/plain'),
      f('b.webp'),
      f('x', 'image/avif'),
    ]);
    expect(imgs.kind).toBe('images');
    if (imgs.kind === 'images')
      expect(imgs.files.map((x) => x.name)).toEqual(['a.png', 'b.webp', 'x']);
    expect(dispatchFiles([f('readme.txt', 'text/plain')])).toEqual({ kind: 'none' });
  });
});

describe('名稱（F07、F94、F95、2.2、3.3；附件「檔名」）', () => {
  it('ZIP 檔名：原名_recolor.zip，特殊字元連續的一段換成一個「_」', () => {
    const names = E.檔名;
    expect(exportZipName(originNameOf(f(names.圖片模式.第一個檔案 as string)), 'images')).toBe(
      names.圖片模式.ZIP,
    );
    expect(exportZipName(originNameOf(f(names.特殊字元.檔名 as string)), 'images')).toBe(
      names.特殊字元.ZIP,
    );
    expect(exportZipName(originNameOf(f('a.png', 'image/png', '角色A/sub/a.png')), 'x')).toBe(
      names.資料夾.ZIP,
    );
    expect(exportZipName('images-only', 'x')).toBe(names.只有圖片的ZIP.ZIP);
    expect(exportZipName('test', 'x')).toBe(names.PSD.ZIP);
    expect(exportZipName('room', 'x')).toBe(names.房間.ZIP);
    expect(exportZipName(null, 'psd_layers')).toBe('psd_layers_recolor.zip');
    expect(exportZipName('  ', 'images')).toBe('images_recolor.zip');
  });

  it('同名時加「_1」「_2」（放在副檔名前，含路徑）', () => {
    const used = new Set<string>();
    expect(
      ['a.png', 'a.png', 'a.png', 'dir/a.png', 'noext', 'noext'].map((n) =>
        uniqueAssetName(n, used),
      ),
    ).toEqual(['a.png', 'a_1.png', 'a_2.png', 'dir/a.png', 'noext', 'noext_1']);
    expect(uniqueAssetName('dir.v2/x', new Set(['dir.v2/x']))).toBe('dir.v2/x_1');
  });

  it('PSD 圖層的檔名（附件「PSD」）：特殊字元換「_」、同名全部保留（第 7 節裁定）、空白名稱給預設名', () => {
    expect(
      psdLayerFileNames(['名稱/含:特殊*字元?', '重複', '重複', '', '重複_2'], (i) => `未命名 ${i}`),
    ).toEqual(['名稱_含_特殊_字元_.png', '重複.png', '重複_2.png', '未命名 4.png', '重複_2_2.png']);
  });

  it('靜態圖重新編碼成 PNG：副檔名改 .png（第 7 節裁定）；PNG、APNG 不變；保留資料夾', () => {
    expect(pngOutputName('dir/b.jpg')).toBe('dir/b.png');
    expect(pngOutputName('photo.JPEG')).toBe('photo.png');
    expect(pngOutputName('a.gif')).toBe('a.png');
    expect(pngOutputName('a.PNG')).toBe('a.PNG');
    expect(pngOutputName('x.apng')).toBe('x.apng');
    expect(pngOutputName('dir.v2/noext')).toBe('dir.v2/noext.png');
    expect(folderEntries('角色A/sub/b.png')).toEqual(['角色A/', '角色A/sub/']);
    expect(folderEntries('a.png')).toEqual([]);
  });

  it('搜尋：名稱（含路徑）或顯示名稱，不分大小寫', () => {
    expect(matchesSearch('SUB', '角色A/sub/a.png')).toBe(true);
    expect(matchesSearch('名稱/含', '名稱_含.png', '名稱/含')).toBe(true);
    expect(matchesSearch('zzz', 'a.png')).toBe(false);
    expect(matchesSearch('  ', 'a.png')).toBe(true);
  });
});

describe('畫布尺寸（F101～F103；附件「畫布尺寸」）', () => {
  it('補到 24 的倍數：附件「全部補齊」的前後', () => {
    const { 前, 後 } = E.畫布尺寸.全部補齊;
    前.forEach((s, i) => {
      const [w, h] = s.split(/[×（]/).map(Number);
      const t = padTo24(w, h);
      expect(`${t.width}×${t.height}`).toBe(後[i]);
    });
    expect(isGridAligned(48, 72)).toBe(true);
    expect(isGridAligned(50, 48)).toBe(false);
  });

  it('置中：差距 ÷ 2 無條件捨去（50×30 → 72×48 內容在 (11,9)；縮小是負的）', () => {
    expect(centerOffset(50, 30, 72, 48)).toEqual({ dx: 11, dy: 9 });
    expect(centerOffset(72, 48, 40, 20)).toEqual({ dx: -16, dy: -14 });
    expect(centerOffset(10, 10, 13, 13)).toEqual({ dx: 1, dy: 1 });
    expect(validCanvasSize(1, 1)).toBe(true);
    expect(validCanvasSize(0, 5)).toBe(false);
    expect(validCanvasSize(2.5, 5)).toBe(false);
  });
});

describe('APNG 播放次數（F82、F88；附件「循環設定的輸出」）', () => {
  const ORIG = { ball: 3, loop0: 0 };
  const cases: Record<
    string,
    { g: [string, number]; a?: Partial<Record<'ball' | 'loop0', [string, number]>> }
  > = {
    '整體：照原檔': { g: ['keep', 1] },
    '整體：只播一次': { g: ['once', 1] },
    '整體：無限': { g: ['infinite', 1] },
    '整體：指定 5 次': { g: ['custom', 5] },
    '個別：ball 指定 7 次、loop0 照原檔（整體為指定 5 次）': {
      g: ['custom', 5],
      a: { ball: ['custom', 7], loop0: ['keep', 1] },
    },
    '整體：指定次數欄填 0': { g: ['custom', loopCount(0)] },
  };
  for (const [name, c] of Object.entries(cases)) {
    it(name, () => {
      const want = E.APNG.循環設定的輸出[name] as Record<string, number>;
      for (const [file, plays] of Object.entries(want)) {
        const key = file as 'ball' | 'loop0';
        const a = c.a?.[key] ?? ['global', 1];
        expect(
          resolvePlays(
            { mode: a[0] as 'global', count: a[1] },
            { mode: c.g[0] as 'keep', count: c.g[1] },
            ORIG[key],
          ),
        ).toBe(plays);
      }
    });
  }
  it('指定次數夾在 1～999；空白、不是數字當 1', () => {
    expect([
      loopCount(0),
      loopCount(''),
      loopCount('abc'),
      loopCount(1000),
      loopCount(12.7),
    ]).toEqual([1, 1, 1, 999, 12]);
  });
});

describe('容量壓縮的搜尋（3.6、3.7；第 7 節裁定）', () => {
  /** 檔案大小的模型：尺寸比例的平方 × 色數的對數；跳格減半 */
  const model = (base: number) => (a: { scale: number; colors: number | null; skip: boolean }) =>
    Promise.resolve(
      Math.round(
        base *
          a.scale *
          a.scale *
          (a.colors === null ? 1.4 : Math.log2(a.colors) / 8) *
          (a.skip ? 0.5 : 1),
      ),
    );

  it('已在目標內：無損、不減色（第 7 節裁定）', async () => {
    const r = await searchCompression({
      target: 1000,
      frames: 6,
      allowSkip: true,
      attempt: model(500),
    });
    expect(r.attempt).toEqual({ scale: 1, colors: null, skip: false });
    expect(r.over).toBe(false);
    expect(r.tried).toHaveLength(1);
  });

  it('結果與舊版「依序試、第一個放得下的」相同，但試的次數少很多（附件 1000×1000 → 70%、96 色）', async () => {
    /* 舊版的嘗試順序（附件）落在 70%、96 色：用一個會落在那裡的模型 */
    const sizes = new Map<string, number>([]);
    const attempt = (a: { scale: number; colors: number | null; skip: boolean }) => {
      const s =
        a.colors === null
          ? 9e9
          : a.scale > 0.7
            ? 3e6
            : a.scale === 0.7 && a.colors > 96
              ? 2.2e6
              : 1.9e6;
      sizes.set(`${a.scale}|${a.colors}`, s);
      return Promise.resolve(s);
    };
    const r = await searchCompression({
      target: targetBytes(2),
      frames: 5,
      allowSkip: true,
      attempt,
    });
    expect(r.attempt).toEqual({ scale: 0.7, colors: 96, skip: false });
    const oldOrder = (
      E.容量壓縮.APNG.find((x) => x.嘗試順序 && x.嘗試順序.length > 1)?.嘗試順序 ?? []
    ).map((t) => {
      const m = /(\d+)% (\d+) 色/.exec(t)!;
      return { scale: Number(m[1]) / 100, colors: Number(m[2]) };
    });
    expect(oldOrder.at(-1)).toEqual({ scale: 0.7, colors: 96 });
    expect(r.tried.length).toBeLessThan(oldOrder.length);
  });

  it('同一個尺寸裡找「放得下的最多色數」；都不行就跳格；還是不行用 40%、32 色並標記超過', async () => {
    const r = await searchCompression({
      target: 400,
      frames: 6,
      allowSkip: true,
      attempt: model(4000),
    });
    expect(r.attempt.skip).toBe(false);
    expect(r.size).toBeLessThanOrEqual(400);
    /* 線性搜尋同一個模型，第一個放得下的組合 */
    let first: { scale: number; colors: number } | null = null;
    for (const scale of SCALE_STEPS) {
      for (const colors of COLOR_STEPS) {
        if (!first && (await model(4000)({ scale, colors, skip: false })) <= 400)
          first = { scale, colors };
      }
    }
    expect(r.attempt).toEqual({ ...first, skip: false });

    const skip = await searchCompression({
      target: 800,
      frames: 6,
      allowSkip: true,
      attempt: model(10000),
    });
    expect(skip.attempt.skip).toBe(true);
    const noSkip = await searchCompression({
      target: 10,
      frames: 6,
      allowSkip: false,
      attempt: model(10000),
    });
    expect(noSkip.attempt).toEqual({ scale: 0.4, colors: 32, skip: false });
    expect(noSkip.over).toBe(true);
    const few = await searchCompression({
      target: 800,
      frames: 5,
      allowSkip: true,
      attempt: model(10000),
    });
    expect(few.attempt.skip).toBe(false);
  });

  /** 舊版的順序：一個一個試，第一個放得下的就用（第 7 節：已在目標內的無損優先） */
  async function linearFirstFit(
    size: (a: Attempt) => number,
    target: number,
    frames: number,
    allowSkip: boolean,
  ): Promise<Attempt> {
    const lossless = { scale: 1, colors: null, skip: false };
    if (size(lossless) <= target) return lossless;
    for (const scale of SCALE_STEPS)
      for (const colors of COLOR_STEPS)
        if (size({ scale, colors, skip: false }) <= target) return { scale, colors, skip: false };
    if (allowSkip && frames >= SKIP_MIN_FRAMES)
      for (const scale of SKIP_SCALE_STEPS)
        for (const colors of SKIP_COLOR_STEPS)
          if (size({ scale, colors, skip: true }) <= target) return { scale, colors, skip: true };
    return { scale: 0.4, colors: 32, skip: false };
  }

  it('中小型檔：照舊版先試 256 色，放得下就結束（無損＋一次減色）', async () => {
    /* 附件 400×400 雜訊 5 格：無損約 2.68 MB、256 色約 0.77 MB；目標 2.0 MB */
    const tried: string[] = [];
    const limits: number[] = [];
    const r = await searchCompression({
      target: targetBytes(2),
      frames: 5,
      allowSkip: true,
      onTry: (a) => tried.push(`${a.scale}/${a.colors ?? 'x'}`),
      attempt: (a, limit) => {
        limits.push(limit);
        return Promise.resolve(
          a.colors === null
            ? 2_805_317
            : Math.round(803_404 * a.scale ** 2 * (Math.log2(a.colors) / 8)),
        );
      },
    });
    expect(r.attempt).toEqual({ scale: 1, colors: 256, skip: false });
    expect(tried).toEqual(['1/x', '1/256']);
    /* 試編時可以在超過目標後放棄 */
    expect(limits).toEqual([targetBytes(2), targetBytes(2)]);
  });

  it('大檔：預估連 32 色都放不下時先試 32 色，放不下就換尺寸（1000×1000 → 80%、32 色只要 5 次）', async () => {
    /* 雜訊的大小模型：像素數 × log2(色數)；無損約 17.5 MB */
    const size = (a: Attempt) =>
      a.colors === null
        ? 17_500_000
        : Math.round(5_100_000 * a.scale ** 2 * (Math.log2(a.colors) / 8));
    const tried: string[] = [];
    const r = await searchCompression({
      target: targetBytes(2),
      frames: 5,
      allowSkip: true,
      onTry: (a) => tried.push(`${a.scale}/${a.colors ?? 'x'}`),
      attempt: (a) => Promise.resolve(size(a)),
    });
    expect(r.attempt).toEqual(await linearFirstFit(size, targetBytes(2), 5, true));
    expect(r.attempt).toEqual({ scale: 0.8, colors: 32, skip: false });
    expect(tried).toEqual(['1/x', '1/32', '0.9/32', '0.8/32', '0.8/48']);
  });

  it('各種大小模型：結果都與舊版的順序相同（跳格、保底也一樣），而且試的次數不多於舊版', async () => {
    let seed = 7;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let n = 0; n < 300; n++) {
      const base = 2e5 + rand() * 4e7;
      const power = 1.4 + rand() * 1.2;
      const colorExp = 0.5 + rand() * 1.5;
      const ratio = 0.25 + rand() * 0.6;
      const frames = rand() < 0.5 ? 5 : 10;
      const allowSkip = rand() < 0.7;
      const target = targetBytes([4.8, 2, 10][n % 3]);
      const size = (a: Attempt) =>
        Math.round(
          a.colors === null
            ? base / ratio
            : base *
                a.scale ** power *
                (Math.log2(a.colors) / 8) ** colorExp *
                (a.skip ? Math.ceil(frames / 2) / frames : 1),
        );
      let calls = 0;
      let fallbackFull = false;
      const r = await searchCompression({
        target,
        frames,
        allowSkip,
        attempt: (a, limit) => {
          calls++;
          const s = size(a);
          if (limit === Number.POSITIVE_INFINITY) fallbackFull = true;
          /* 超過目標的提早放棄：回傳比實際小的估計（仍大於目標） */
          return Promise.resolve(s > limit ? Math.max(limit + 1, Math.round(s * 0.8)) : s);
        },
      });
      const want = await linearFirstFit(size, target, frames, allowSkip);
      expect(r.attempt, `模型 #${n}`).toEqual(want);
      expect(r.over).toBe(size(want) > target);
      if (r.over) {
        expect(fallbackFull).toBe(true);
        expect(r.size).toBe(size(want));
      }
      const linearCalls =
        1 +
        (r.attempt.colors === null
          ? 0
          : SCALE_STEPS.length * COLOR_STEPS.length +
            (allowSkip && frames >= SKIP_MIN_FRAMES
              ? SKIP_SCALE_STEPS.length * SKIP_COLOR_STEPS.length
              : 0));
      expect(calls).toBeLessThanOrEqual(linearCalls);
    }
  });

  it('跳格：留第 1、3、5…格，延遲＝自己＋下一格（100 ms → 200 ms）', () => {
    expect(skipFrames(['a', 'b', 'c', 'd', 'e'], [100, 100, 50, 0, 70])).toEqual({
      frames: ['a', 'c', 'e'],
      delays: [200, 50, 140],
    });
  });

  it('1 MB＝1,048,576 位元組；試算卡的格式（F81）', () => {
    expect(targetBytes(4.8)).toBeCloseTo(5033164.8, 1);
    expect(formatMb(803672)).toBe('0.77 MB');
    expect(savingPercent(2_747_000, 803_672)).toBe('70.7');
    expect(savingPercent(700, 900)).toBe('0.0');
  });
});

describe('配置檢視（F22、F28、F30；第 7 節裁定）', () => {
  const json = {
    entities: {
      room: {
        backgroundUrl: 'bg.png',
        foregroundUrl: 'fg.png',
        fieldWidth: 20,
        fieldHeight: 10,
        markers: { m: { x: -2, y: -1, width: 2, height: 2, imageUrl: 'mk.png', text: '門' } },
      },
      items: {
        a: { x: 0, y: 0, z: 9, width: 4, height: 2, angle: 90, imageUrl: 'it.png' },
        b: { x: 5, y: 5, imageUrl: 'missing.png' },
      },
      characters: { c: { name: '艾琳', iconUrl: 'ic.png', faces: [{ iconUrl: 'face.png' }] } },
      scenes: { s: { backgroundUrl: 'scene.png' } },
    },
  };
  const assets = [
    'bg.png',
    'fg.png',
    'mk.png',
    'it.png',
    'ic.png',
    'face.png',
    'scene.png',
    'x.png',
  ].map((name, i) => ({ id: `id${i}`, name }));
  const layout = buildRoomLayout(json, assets);

  it('背景最下、前景最上、其餘依 z（缺的用 CCFOLIA 的預設值）；找不到圖的略過', () => {
    expect(layout.field).toEqual({ width: 20, height: 10 });
    expect(layout.objects.map((o) => o.kind)).toEqual([
      'background',
      'character',
      'marker',
      'item',
      'foreground',
    ]);
    const bg = layout.objects[0];
    expect([bg.x, bg.y, bg.width, bg.height]).toEqual([-10, -5, 20, 10]);
    const marker = layout.objects.find((o) => o.kind === 'marker')!;
    expect([marker.z, marker.name]).toEqual([2, '門']);
    expect(layout.objects.find((o) => o.kind === 'character')!.name).toBe('艾琳');
    expect(layout.hasObjects).toBe(true);
    expect(buildRoomLayout({ entities: {} }, assets).hasObjects).toBe(false);
  });

  it('點擊：考慮旋轉、看不見的不算、透明處穿透', () => {
    const item = layout.objects.find((o) => o.kind === 'item')!;
    /* 4×2 的物件轉 90°：中心 (2,1)，佔 x 1～3、y −1～3 */
    expect(localPoint(item, 2, 2.8)).not.toBeNull();
    expect(localPoint(item, 3.8, 1)).toBeNull();
    const all = () => true;
    const opaque = () => 255;
    expect(hitRoom(layout.objects, 2, 2.8, all, opaque)?.kind).toBe('foreground');
    const noFg = (id: string) => id !== 'id1';
    expect(hitRoom(layout.objects, 2, 2.8, noFg, opaque)?.kind).toBe('item');
    const fgClear = (id: string) => (id === 'id1' ? 0 : 255);
    expect(hitRoom(layout.objects, 2, 2.8, all, fgClear)?.kind).toBe('item');
    expect(hitRoom(layout.objects, 9.5, 4.5, noFg, opaque)?.kind).toBe('background');
  });

  it('面板：物件 z 大的在上，接著列出沒被物件引用的圖', () => {
    const rows = roomPanelRows(layout, assets);
    expect(rows.map((r) => r.kind)).toEqual([
      'foreground',
      'item',
      'marker',
      'character',
      'background',
      'asset',
      'asset',
      'asset',
    ]);
    expect(rows.slice(5).map((r) => r.assetId)).toEqual(['id5', 'id6', 'id7']);
  });

  it('排序「在房間中的角色」', () => {
    const ranks = roomRoleRanks(json, assets);
    const order = [...assets]
      .sort((a, b) => ranks.get(a.id)! - ranks.get(b.id)!)
      .map((a) => a.name);
    expect(order).toEqual([
      'bg.png',
      'fg.png',
      'mk.png',
      'it.png',
      'ic.png',
      'face.png',
      'scene.png',
      'x.png',
    ]);
  });

  it('PSD 的點擊：由上到下第一個看得見、不透明的圖層', () => {
    const list = [
      { id: 'top', left: 100, top: 100, width: 50, height: 50 },
      { id: 'body', left: 40, top: 50, width: 100, height: 150 },
      { id: 'bg', left: 0, top: 0, width: 320, height: 240 },
    ];
    const all = () => true;
    expect(hitPsd(list, 120, 120, all, () => 255)?.id).toBe('top');
    expect(
      hitPsd(
        list,
        120,
        120,
        (id) => id !== 'top',
        () => 255,
      )?.id,
    ).toBe('body');
    expect(hitPsd(list, 120, 120, all, (id) => (id === 'top' ? 0 : 255))?.id).toBe('body');
    expect(hitPsd(list, 300, 10, all, () => 255)?.id).toBe('bg');
    expect(hitPsd(list, 400, 10, all, () => 255)).toBeNull();
  });
});
