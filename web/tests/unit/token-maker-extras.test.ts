/**
 * VTT 棋子產生器第二批的純計算：名字與徽章（文字、取色、吸附）、色彩調整、效果的開關、嵌進 PNG 的設定（本站與 token-workshop）、
 * 自訂外框的開口偵測（TokenForge 的做法）、預設外觀（套用、相同判斷、隨機）、自動配色、編號組與打包的檔名。
 */
import { describe, expect, it } from 'vitest';
import { readPngText, setPngText } from '../../src/core/encode';
import { encodePng } from '../../src/core/encode/png';
import { autoColor } from '../../src/tools/token-maker/autocolor';
import { detectInnerFromAlpha } from '../../src/tools/token-maker/custom';
import {
  EMBED_FORMAT,
  EMBED_KEYWORD,
  embedInPng,
  fromBase64,
  fromTokenWorkshop,
  readEmbedded,
  toBase64,
  twRleDecode,
  twRleEncode,
} from '../../src/tools/token-maker/embed';
import {
  adjustMatrix,
  applyAdjust,
  fxActive,
  portraitFx,
  seededRandom,
} from '../../src/tools/token-maker/fx';
import {
  badgeText,
  colorFrom,
  ink,
  labelText,
  lookColors,
  snapOverlay,
} from '../../src/tools/token-maker/labels';
import {
  allZipName,
  DEFAULT_FX,
  DEFAULT_LOOK,
  defaultAdjust,
  defaultView,
  type Look,
  newToken,
  normalizeLook,
  ratioText,
  setFileName,
  setJobs,
  setZipName,
  stamp,
  zipAllJobs,
} from '../../src/tools/token-maker/model';
import {
  applyPreset,
  EXAMPLE_PRESETS,
  presetFromLook,
  presetMatches,
  RING_FIELDS,
  RING_PRESETS,
  shufflePatch,
} from '../../src/tools/token-maker/presets';

const look = (p: Partial<Look> = {}): Look => normalizeLook({ ...DEFAULT_LOOK, ...p });
const img = { id: 'i1', name: 'goblin.png', width: 100, height: 100 };

describe('名字與徽章', () => {
  it('名字：顯示名字打開、名稱不是空白時才有（轉大寫）', () => {
    expect(labelText(look(), { name: 'Orc' })).toBe('');
    expect(labelText(look({ labelOn: true }), { name: ' Orc ' })).toBe('ORC');
    expect(labelText(look({ labelOn: true }), { name: '  ' })).toBe('');
  });

  it('徽章：顯示徽章打開才有；編號組的文字不管開關', () => {
    expect(badgeText(look({ badgeOn: true }), { badge: 'a1' })).toBe('A1');
    expect(badgeText(look({ badgeOn: false }), { badge: '3' })).toBe('');
    expect(badgeText(look({ badgeOn: false }), { badge: '' }, '7')).toBe('7');
  });

  it('顏色來源：第二色沒畫出來時用外框色；自動回傳 null；字色依底色深淺', () => {
    const plain = look({ frame: 'plain', color: '#112233', accent: '#ff0000' });
    expect(lookColors(plain).accent).toBe('#112233');
    const seg = look({ frame: 'segments', color: '#112233', accent: '#ff0000' });
    expect(lookColors(seg).accent).toBe('#ff0000');
    const ring = look({ frame: 'ring', accentOn: true, accent: '#00ff00' });
    expect(colorFrom('accent', '#000000', lookColors(ring))).toBe('#00ff00');
    expect(colorFrom('bg', '#000000', lookColors(look({ bgColor: '#abcdef' })))).toBe('#abcdef');
    expect(colorFrom('custom', '#123456', lookColors(ring))).toBe('#123456');
    expect(colorFrom('auto', '#123456', lookColors(ring))).toBeNull();
    expect(ink('#fcee0a')).toBe('#050507');
    expect(ink('#14050a')).toBe('#e8e8ee');
  });

  it('吸附：徽章吸到最近的角；名字牌吸到下方；離很遠時只吸中線；Alt 不吸', () => {
    expect(snapOverlay('badge', 'plate', 0.7, 0.8, false)).toEqual([0.74, 0.74]);
    expect(snapOverlay('badge', 'plate', -0.8, -0.7, false)).toEqual([-0.74, -0.74]);
    expect(snapOverlay('label', 'plate', 0.05, 0.75, false)).toEqual([0, 0.8]);
    expect(snapOverlay('label', 'plate', 0.03, 0.4, false)).toEqual([0, 0.4]);
    expect(snapOverlay('label', 'plate', 0.3, 0.4, false)).toEqual([0.3, 0.4]);
    expect(snapOverlay('badge', 'plate', 0.7, 0.8, true)).toEqual([0.7, 0.8]);
  });

  it('弧形文字：只看方向，每 45° 吸附，放回半徑 0.8', () => {
    const [x, y] = snapOverlay('label', 'arc', 0.05, -0.5, false);
    expect(Math.hypot(x, y)).toBeCloseTo(0.8, 3);
    expect(x).toBeCloseTo(0, 3);
    expect(y).toBeCloseTo(-0.8, 3);
    /* 離 45° 太遠（> 7°）時不吸 */
    const free = snapOverlay('label', 'arc', 0.5, 0.2, false);
    expect(Math.atan2(free[1], free[0])).toBeCloseTo(Math.atan2(0.2, 0.5), 3);
  });
});

describe('色彩調整與效果', () => {
  it('預設值是單位矩陣；亮度 50% 減半；飽和度 0 變灰', () => {
    const m = adjustMatrix(defaultAdjust());
    expect(m.map((v) => Math.round(v * 1000) / 1000)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);
    const px = {
      data: new Uint8ClampedArray([200, 100, 50, 255, 9, 9, 9, 0]),
      width: 2,
      height: 1,
    };
    applyAdjust(px, { ...defaultAdjust(), bright: 50 });
    expect(Array.from(px.data.slice(0, 4))).toEqual([100, 50, 25, 255]);
    /* 透明的像素不動 */
    expect(Array.from(px.data.slice(4))).toEqual([9, 9, 9, 0]);
    const gray = { data: new Uint8ClampedArray([255, 0, 0, 255]), width: 1, height: 1 };
    applyAdjust(gray, { ...defaultAdjust(), sat: 0 });
    expect(Math.abs(gray.data[0] - gray.data[1])).toBeLessThanOrEqual(1);
    expect(Math.abs(gray.data[1] - gray.data[2])).toBeLessThanOrEqual(1);
  });

  it('疊加時照 CSS filter 一步一步夾值（亮度 200% 後對比 50%：先夾到 255 再算）', () => {
    const px = { data: new Uint8ClampedArray([200, 200, 200, 255]), width: 1, height: 1 };
    applyAdjust(px, { ...defaultAdjust(), bright: 200, contrast: 50 });
    /* 合成一個矩陣的話是 200 × 2 × 0.5 ＋ 63.75 → 255 */
    expect(px.data[0]).toBe(191);
    /* ED 的疊加案例（亮度 120、對比 130、飽和度 140、色相 30）：每一步都在 0～255 裡 */
    const a = { data: new Uint8ClampedArray([240, 200, 160, 255]), width: 1, height: 1 };
    applyAdjust(a, { bright: 120, contrast: 130, sat: 140, hue: 30 });
    for (const v of a.data.slice(0, 3)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });

  it('效果：總開關關掉時什麼都不做；單色色調變灰', () => {
    expect(fxActive(DEFAULT_FX)).toBe(false);
    expect(fxActive({ ...DEFAULT_FX, on: true, scan: true })).toBe(true);
    const px = { data: new Uint8ClampedArray([255, 0, 0, 255]), width: 1, height: 1 };
    portraitFx(px, { ...DEFAULT_FX, tone: 'mono' }, '#ffffff', '#000000', 't1');
    expect(Array.from(px.data)).toEqual([255, 0, 0, 255]);
    portraitFx(
      px,
      { ...DEFAULT_FX, on: true, tone: 'mono', toneMix: 100 },
      '#ffffff',
      '#000000',
      't1',
    );
    expect(Math.abs(px.data[0] - px.data[1])).toBeLessThanOrEqual(2);
  });

  it('決定性的亂數：同一個種子同一串', () => {
    const a = seededRandom('t1:3');
    const b = seededRandom('t1:3');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(seededRandom('t2:3')()).not.toBe(seededRandom('t1:3')());
  });
});

describe('嵌進 PNG 的設定', () => {
  const tiny = async () => encodePng(new Uint8Array(4 * 4 * 4).fill(255), 4, 4);

  it('本站：iTXt 的 JSON 存得回來（外觀、棋子、圖片與遮罩的位元組）', async () => {
    const png = await tiny();
    const l = look({ frame: 'gear', color: '#123456', labelOn: true });
    const imageBytes = Uint8Array.from([1, 2, 3, 250]);
    const maskBytes = Uint8Array.from([9, 8, 7]);
    const out = embedInPng(png, {
      look: l,
      token: {
        name: '哥布林',
        badge: '2',
        view: { x: 0.1, y: -0.2, zoom: 1.5, rotate: 10, flip: true },
        popOn: false,
        adjust: { bright: 120, contrast: 90, sat: 100, hue: 5 },
      },
      image: { name: 'goblin.webp', type: 'image/webp', bytes: imageBytes },
      mask: { width: 30, height: 40, bytes: maskBytes },
    });
    const text = readPngText(out, EMBED_KEYWORD);
    expect(JSON.parse(text ?? '{}').format).toBe(EMBED_FORMAT);
    const e = readEmbedded(out, look());
    expect(e?.source).toBe('toolkit');
    expect(e?.look.frame).toBe('gear');
    expect(e?.look.color).toBe('#123456');
    expect(e?.token).toEqual({
      name: '哥布林',
      badge: '2',
      view: { x: 0.1, y: -0.2, zoom: 1.5, rotate: 10, flip: true },
      popOn: false,
      adjust: { bright: 120, contrast: 90, sat: 100, hue: 5 },
    });
    expect(e?.image.name).toBe('goblin.webp');
    expect(Array.from(e?.image.bytes ?? [])).toEqual([1, 2, 3, 250]);
    expect(e?.mask).toEqual({ kind: 'png', width: 30, height: 40, bytes: maskBytes });
  });

  it('沒有嵌設定、內容壞掉的 PNG：null', async () => {
    const png = await tiny();
    expect(readEmbedded(png, look())).toBeNull();
    const bad = setPngText(png, EMBED_KEYWORD, '{"format":"x"}');
    expect(readEmbedded(bad, look())).toBeNull();
    expect(readEmbedded(Uint8Array.from([1, 2, 3]), look())).toBeNull();
  });

  it('base64 與 token-workshop 的遮罩編碼（交錯的 0／1 長度）來回一致', () => {
    const u = Uint8Array.from({ length: 70000 }, (_, i) => (i * 7) % 256);
    expect(Array.from(fromBase64(toBase64(u)))).toEqual(Array.from(u));
    const m = new Uint8Array(500);
    m.fill(255, 3, 200);
    m.fill(255, 450, 500);
    expect(Array.from(twRleDecode(twRleEncode(m), 500))).toEqual(Array.from(m));
  });

  it('token-workshop 的 PNG（tkWs chunk）對應到本站的設定', async () => {
    const settings = {
      formula: 'chain',
      color: '#b87333',
      colorKey: 'Copper',
      accent: '#222222',
      width: 0.14,
      count: 30,
      depth: 0.4,
      lineW: 0.08,
      tex: 'marble',
      texAmt: 0.7,
      texDens: 1.5,
      texRot: Math.PI / 2,
      seed: 42,
      lAng: Math.PI,
      lInt: 0.5,
      bgOn: false,
      autoFit: false,
      pad: 0.1,
      feather: 1,
      shadow: 0.3,
      ix: 0.2,
      iy: -0.1,
      zoom: 1.3,
      rot: Math.PI / 6,
      flip: -1,
      popOn: true,
    };
    const m = new Uint8Array(4 * 4);
    m.fill(255, 0, 8);
    const meta = new TextEncoder().encode(
      JSON.stringify({
        app: 'token-workshop',
        img: { type: 'image/jpeg' },
        mask: { w: 4, h: 4, rle: toBase64(twRleEncode(m)) },
        settings,
      }),
    );
    const imgBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
    const data = new Uint8Array(4 + meta.length + imgBytes.length);
    new DataView(data.buffer).setUint32(0, meta.length);
    data.set(meta, 4);
    data.set(imgBytes, 4 + meta.length);
    /* 自己組一個 tkWs chunk 插在 IEND 前面（CRC 不檢查） */
    const png = await tiny();
    const chunk = new Uint8Array(12 + data.length);
    new DataView(chunk.buffer).setUint32(0, data.length);
    chunk.set(new TextEncoder().encode('tkWs'), 4);
    chunk.set(data, 8);
    const out = new Uint8Array(png.length + chunk.length);
    out.set(png.subarray(0, png.length - 12));
    out.set(chunk, png.length - 12);
    out.set(png.subarray(png.length - 12), png.length - 12 + chunk.length);
    const e = readEmbedded(out, look());
    expect(e?.source).toBe('token-workshop');
    expect(e?.look).toMatchObject({
      frame: 'chain',
      color: '#b87333',
      colorKey: 'copper',
      width: 14,
      depth: 40,
      texture: 'stone',
      texAmount: 70,
      texScale: 150,
      texRotate: 90,
      texSeed: 42,
      lightAngle: 180,
      lightStrength: 50,
      bg: 'none',
      autoMargin: false,
      margin: 10,
      shadow: 30,
    });
    expect(e?.token.view.zoom).toBeCloseTo(1.3);
    expect(e?.token.view.rotate).toBeCloseTo(30);
    expect(e?.token.view.flip).toBe(true);
    expect(Array.from(e?.image.bytes ?? [])).toEqual(Array.from(imgBytes));
    expect(e?.image.type).toBe('image/jpeg');
    expect(e?.mask?.kind).toBe('pixels');
    if (e?.mask?.kind === 'pixels') expect(Array.from(e.mask.data)).toEqual(Array.from(m));
  });

  it('token-workshop 的外框名稱不認得時回到單純；沒有的欄位用目前的外觀', () => {
    const base = look({ width: 9, glow: 'all' });
    const r = fromTokenWorkshop({ formula: '???' }, base);
    expect(r.look.frame).toBe('plain');
    expect(r.look.width).toBe(9);
    expect(r.look.glow).toBe('off');
    expect(r.view).toEqual(defaultView());
  });
});

describe('自訂外框的開口半徑（TokenForge）', () => {
  const ring =
    (inner: number, outer = 250) =>
    (x: number, y: number) => {
      const d = Math.hypot(x - 256, y - 256);
      return d >= inner && d <= outer ? 255 : 0;
    };
  it('環的內緣：第 90 百分位＋4 px', () => {
    expect(detectInnerFromAlpha(ring(180)) * 256).toBeGreaterThanOrEqual(183);
    expect(detectInnerFromAlpha(ring(180)) * 256).toBeLessThanOrEqual(186);
  });
  it('中心不透明、找到的方向不到一半：200 ÷ 256', () => {
    expect(detectInnerFromAlpha(() => 255)).toBeCloseTo(200 / 256);
    expect(detectInnerFromAlpha((x) => (x > 400 ? 255 : 0))).toBeCloseTo(200 / 256);
  });
});

describe('預設外觀', () => {
  it('token-workshop 18 組、eidolon-ui 範例 5 組，名字不重複', () => {
    expect(RING_PRESETS).toHaveLength(18);
    expect(EXAMPLE_PRESETS).toHaveLength(5);
    const names = [...RING_PRESETS, ...EXAMPLE_PRESETS].map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('外框的預設只換外框的欄位；套用後判斷為相同', () => {
    const cur = look({ bg: 'none', labelOn: true, glow: 'all' });
    const p = RING_PRESETS[0];
    const next = applyPreset(cur, p);
    expect(next.bg).toBe('none');
    expect(next.labelOn).toBe(true);
    expect(next.glow).toBe('all');
    for (const k of Object.keys(p.patch)) expect(RING_FIELDS).toContain(k);
    expect(presetMatches(next, p)).toBe(true);
    expect(presetMatches(cur, p)).toBe(false);
  });

  it('範例換整組外觀（含效果）；我的預設存整組外觀', () => {
    const boss = EXAMPLE_PRESETS.find((p) => p.id === 'boss');
    expect(boss).toBeDefined();
    const next = applyPreset(look(), boss as (typeof EXAMPLE_PRESETS)[number]);
    expect(next.frame).toBe('arcs');
    expect(next.fx.on).toBe(true);
    expect(next.fx.vig).toBe(true);
    const mine = presetFromLook('m1', '我的', next, {
      sizeChoice: 400,
      customSize: 300,
      format: 'png',
    });
    expect(presetMatches(next, mine)).toBe(true);
    expect(mine.output?.sizeChoice).toBe(400);
  });

  it('隨機：每次都是合法的浮雕環外觀', () => {
    const rand = seededRandom('shuffle');
    for (let i = 0; i < 30; i++) {
      const l = applyPreset(look(), { id: 's', name: '', kind: 'ring', patch: shufflePatch(rand) });
      expect(l).toEqual(normalizeLook(l));
      expect([
        'plain',
        'gear',
        'scallop',
        'facet',
        'segments',
        'rope',
        'chain',
        'braid',
        'moire',
        'studs',
        'gems',
        'thorns',
        'flames',
        'tally',
        'twin',
        'scales',
      ]).toContain(l.frame);
    }
  });
});

describe('自動配色', () => {
  /* 64 × 64：灰色背景、中間大塊的紅色、角落小塊的藍色 */
  const pic = () => {
    const w = 64;
    const data = new Uint8ClampedArray(w * w * 4);
    for (let y = 0; y < w; y++)
      for (let x = 0; x < w; x++) {
        const c =
          Math.hypot(x - 32, y - 32) < 18
            ? [210, 30, 30]
            : x > 50 && y < 12
              ? [20, 60, 230]
              : [128, 128, 128];
        data.set([...c, 255], (y * w + x) * 4);
      }
    return { data, width: w, height: w };
  };
  it('外框色挑大塊的鮮豔色（紅）；第二色避開外框色（藍）', () => {
    const frame = autoColor(pic(), 'frame', '#d9a521', '#d9a521', 0);
    expect(frame).toMatch(/^#[0-9a-f]{6}$/);
    const n = Number.parseInt((frame as string).slice(1), 16);
    expect((n >> 16) & 255).toBeGreaterThan(((n >> 8) & 255) + 60);
    const accent = autoColor(pic(), 'accent', frame as string, '#2b2d33', 0);
    const a = Number.parseInt((accent as string).slice(1), 16);
    expect(a & 255).toBeGreaterThan((a >> 16) & 255);
  });
  it('同一個種子結果相同（第一次取分數最高的）', () => {
    expect(autoColor(pic(), 'frame', '#d9a521', '#d9a521', 0)).toBe(
      autoColor(pic(), 'frame', '#d9a521', '#d9a521', 0),
    );
  });
  it('完全透明的圖：找不到', () => {
    const w = 16;
    const data = new Uint8ClampedArray(w * w * 4);
    expect(autoColor({ data, width: w, height: w }, 'frame', '#d9a521', '#d9a521', 0)).toBeNull();
  });
});

describe('選取比例的文字', () => {
  it('10% 以下一位小數、0.1% 以下寫「0.1% 以下」', () => {
    expect(ratioText(0.0005)).toBe('0.1% 以下');
    expect(ratioText(0.038)).toBe('3.8%');
    expect(ratioText(0.5)).toBe('50%');
    expect(ratioText(1)).toBe('100%');
  });
});

describe('打包與編號組的檔名', () => {
  const t = { ...newToken('t1', img), name: '哥布林' };
  it('編號補零到張數的位數；ZIP 名稱', () => {
    expect(setFileName(t, 3, 12, 400, 'png')).toBe('哥布林_03_400.png');
    expect(setFileName(t, 3, 4, 280, 'webp')).toBe('哥布林_3_280.webp');
    expect(setZipName(t, 12, 400)).toBe('哥布林_編號組12_400.zip');
    expect(stamp(new Date(2026, 9, 29, 8, 5))).toBe('20261029-0805');
    expect(allZipName(512, new Date(2026, 9, 29, 8, 5))).toBe('棋子_20261029-0805_512.zip');
  });
  it('編號組：同一個棋子 × N，徽章 1～N；全部打包略過沒有圖片的', () => {
    const jobs = setJobs(t, 3, 256, 'png');
    expect(jobs.map((j) => [j.badge, j.name])).toEqual([
      ['1', '哥布林_1_256.png'],
      ['2', '哥布林_2_256.png'],
      ['3', '哥布林_3_256.png'],
    ]);
    const all = zipAllJobs(
      [t, newToken('t2'), { ...newToken('t3', { ...img, name: 'orc.png' }) }],
      256,
      'png',
    );
    expect(all.map((j) => j.name)).toEqual(['哥布林_256.png', 'orc_256.png']);
  });
});
