/**
 * 文字演出產生器：SF 標題模式（2026-10-26，規格 1.18 F311～F335）。
 * 代碼自動產生、解碼字串、播放方式對應的時間與循環、各範本在 3 種比例下不出界、決定性、舊專案檔與範本檔讀入。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { batchByTemplates, batchKindOf, batchNames } from '@/tools/text-fx/batch';
import { sceneSource } from '@/tools/text-fx/exporter';
import { autoFileName } from '@/tools/text-fx/filename';
import { sfFontLoads } from '@/tools/text-fx/fonts';
import { settingsFromTemplate, TEMPLATES } from '@/tools/text-fx/library';
import {
  makeMine,
  normalizeMine,
  parseTemplatesFile,
  templatesFileText,
} from '@/tools/text-fx/mine';
import { HOLD } from '@/tools/text-fx/motion';
import { buildScene } from '@/tools/text-fx/scene';
import {
  baseSettings,
  fpsChoicesOf,
  MODES,
  normalizeSettings,
  playsOf,
  type Settings,
} from '@/tools/text-fx/settings';
import {
  introWindow,
  loopPhase,
  normalizeSf,
  SF_PLAYS,
  SF_RATIOS,
  SF_SCRAMBLE,
  SF_TEMPLATE_IDS,
  SF_WIDTHS,
  type SfTemplateId,
  sfAutoCode,
  sfCodeOf,
  sfDecode,
  sfFit,
  sfHeight,
  sfPlayOf,
  sfProgress,
  sfSizeOf,
  sfTiming,
} from '@/tools/text-fx/sf';
import { drawSfTemplate, sfBlockAt, sfFonts } from '@/tools/text-fx/sfDraw';
import {
  applyMine,
  applyTemplate,
  cfgOf,
  initialData,
  normalizeData,
  replaceAll,
  resetTemplate,
  saveMine,
  setMode,
  templateEntry,
  tplIdOf,
  updateCfg,
  useTfx,
} from '@/tools/text-fx/store';
import { joinText } from '@/tools/text-fx/strings';

const sfCfg = (patch: (c: Settings) => void = () => {}) => {
  const c = settingsFromTemplate('sf', TEMPLATES.sf[0]);
  patch(c);
  return normalizeSettings('sf', c);
};

/* ---------- 不需要畫布的記錄用 2D context：記下每個畫出來的點（畫布座標） ---------- */

type M = [number, number, number, number, number, number];
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const WIDE = /[⺀-鿿가-힯豈-﫿＀-￯]/;

class Recorder {
  m: M = [1, 0, 0, 1, 0, 0];
  private stack: Record<string, unknown>[] = [];
  globalAlpha = 1;
  globalCompositeOperation = 'source-over';
  fillStyle: unknown = '#000';
  strokeStyle: unknown = '#000';
  lineWidth = 1;
  lineCap = 'butt';
  lineJoin = 'miter';
  lineDashOffset = 0;
  font = '10px sans-serif';
  letterSpacing = '0px';
  textAlign = 'left';
  textBaseline = 'alphabetic';
  private path: [number, number][] = [];
  box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  log: string[] = [];
  /** 目前的裁切範圍（畫布座標）；裁切外的點不算畫出來 */
  clipBox = { x0: -Infinity, y0: -Infinity, x1: Infinity, y1: Infinity };
  private keys = [
    'm',
    'clipBox',
    'globalAlpha',
    'globalCompositeOperation',
    'fillStyle',
    'strokeStyle',
    'lineWidth',
    'lineCap',
    'lineJoin',
    'lineDashOffset',
    'font',
    'letterSpacing',
    'textAlign',
    'textBaseline',
  ] as const;
  save() {
    const self = this as unknown as Record<string, unknown>;
    this.stack.push(Object.fromEntries(this.keys.map((k) => [k, self[k]])));
  }
  restore() {
    const s = this.stack.pop();
    if (s) Object.assign(this, s);
  }
  setTransform(a: number, b = 0, c = 0, d = 1, e = 0, f = 0) {
    this.m = [a, b, c, d, e, f];
  }
  getTransform() {
    const [a, b, c, d, e, f] = this.m;
    return { a, b, c, d, e, f };
  }
  translate(x: number, y: number) {
    this.m = mul(this.m, [1, 0, 0, 1, x, y]);
  }
  scale(x: number, y: number) {
    this.m = mul(this.m, [x, 0, 0, y, 0, 0]);
  }
  rotate(r: number) {
    this.m = mul(this.m, [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]);
  }
  private tp(x: number, y: number): [number, number] {
    const m = this.m;
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  }
  private hit(raw: [number, number][], pad: number, what: string) {
    const cb = this.clipBox;
    const pts = raw.map(
      ([x, y]) =>
        [
          Math.min(cb.x1 + pad, Math.max(cb.x0 - pad, x)),
          Math.min(cb.y1 + pad, Math.max(cb.y0 - pad, y)),
        ] as [number, number],
    );
    for (const [x, y] of pts) {
      this.box.x0 = Math.min(this.box.x0, x - pad);
      this.box.y0 = Math.min(this.box.y0, y - pad);
      this.box.x1 = Math.max(this.box.x1, x + pad);
      this.box.y1 = Math.max(this.box.y1, y + pad);
    }
    this.log.push(
      `${what}:${this.globalCompositeOperation}:${this.globalAlpha.toFixed(4)}:${String(this.fillStyle)}:${pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')}`,
    );
  }
  private get unit() {
    return Math.hypot(this.m[0], this.m[1]);
  }
  beginPath() {
    this.path = [];
  }
  moveTo(x: number, y: number) {
    this.path.push(this.tp(x, y));
  }
  lineTo(x: number, y: number) {
    this.path.push(this.tp(x, y));
  }
  closePath() {}
  arc(x: number, y: number, r: number, a0: number, a1: number) {
    for (let i = 0; i <= 16; i++) {
      const a = a0 + ((a1 - a0) * i) / 16;
      this.path.push(this.tp(x + Math.cos(a) * r, y + Math.sin(a) * r));
    }
  }
  rect(x: number, y: number, w: number, h: number) {
    this.path.push(this.tp(x, y), this.tp(x + w, y), this.tp(x + w, y + h), this.tp(x, y + h));
  }
  clip() {
    const xs = this.path.map((p) => p[0]);
    const ys = this.path.map((p) => p[1]);
    const cb = this.clipBox;
    this.clipBox = {
      x0: Math.max(cb.x0, Math.min(...xs)),
      y0: Math.max(cb.y0, Math.min(...ys)),
      x1: Math.min(cb.x1, Math.max(...xs)),
      y1: Math.min(cb.y1, Math.max(...ys)),
    };
  }
  stroke() {
    this.hit(this.path, (this.lineWidth * this.unit) / 2, 'stroke');
  }
  fill() {
    this.hit(this.path, 0, 'fill');
  }
  fillRect(x: number, y: number, w: number, h: number) {
    this.hit(
      [this.tp(x, y), this.tp(x + w, y), this.tp(x + w, y + h), this.tp(x, y + h)],
      0,
      'rect',
    );
  }
  strokeRect(x: number, y: number, w: number, h: number) {
    this.hit(
      [this.tp(x, y), this.tp(x + w, y), this.tp(x + w, y + h), this.tp(x, y + h)],
      (this.lineWidth * this.unit) / 2,
      'srect',
    );
  }
  clearRect() {}
  setLineDash() {}
  drawImage() {}
  createLinearGradient() {
    return { addColorStop() {} };
  }
  measureText(s: string) {
    const size = Number(/([\d.]+)px/.exec(this.font)?.[1] ?? 10);
    const ls = Number.parseFloat(this.letterSpacing) || 0;
    let w = 0;
    for (const ch of s) w += (WIDE.test(ch) ? size : 0.62 * size) + ls;
    return { width: w };
  }
  strokeText(s: string, x: number, y: number) {
    this.fillText(s, x, y);
  }
  fillText(s: string, x: number, y: number) {
    const size = Number(/([\d.]+)px/.exec(this.font)?.[1] ?? 10);
    const w = this.measureText(s).width;
    const left = this.textAlign === 'center' ? x - w / 2 : this.textAlign === 'right' ? x - w : x;
    this.hit(
      [
        this.tp(left, y - 0.85 * size),
        this.tp(left + w, y - 0.85 * size),
        this.tp(left + w, y + 0.25 * size),
        this.tp(left, y + 0.25 * size),
      ],
      0,
      `text[${s}]`,
    );
  }
}

/** 用記錄用的 context 畫一個範本，回傳畫出來的範圍與每一步的紀錄 */
function record(
  tpl: SfTemplateId,
  cfg: Settings,
  t: number,
  W = 1200,
  H = 400,
  ph?: { intro: number; outro: number },
) {
  const rec = new Recorder();
  const { s, ox, oy } = sfFit(W, H);
  rec.setTransform(s, 0, 0, s, ox, oy);
  const tm = sfTiming(cfg);
  const p = ph ?? sfProgress(tm, t);
  drawSfTemplate(tpl, {
    ctx: rec as unknown as CanvasRenderingContext2D,
    t,
    D: tm.D,
    intro: p.intro,
    outro: p.outro,
    main: '#eef4fb',
    accent: '#ff4458',
    title: cfg.text.trim(),
    sub: cfg.sub.trim(),
    code: sfCodeOf(cfg),
    num: cfg.sf!.num,
    fonts: sfFonts(cfg),
    scratch: null,
  });
  return rec;
}

describe('SF 標題：模式、範本與預設（F311～F314、F331）', () => {
  it('第四個模式；8 個範本；基礎預設 960×320、15 fps、登場→退場循環', () => {
    expect(MODES.map((m) => m[0])).toEqual(['title', 'long', 'caption', 'sf']);
    expect(MODES[3][1]).toBe('SF 標題');
    expect(TEMPLATES.sf.map((t) => t.name)).toEqual([
      '雷達掃描',
      '數據讀取',
      '警報橫幅',
      '識別吊牌',
      '勳章緞帶',
      '大字編號',
      '取景框',
      '指令視窗',
    ]);
    expect(TEMPLATES.sf.map((t) => t.id)).toEqual(SF_TEMPLATE_IDS);
    expect(SF_TEMPLATE_IDS).toEqual([
      'radar',
      'readout',
      'alert',
      'tag',
      'medal',
      'chapter',
      'viewfinder',
      'console',
    ]);
    const s = baseSettings('sf');
    expect([s.canvasW, s.canvasH, s.fps, s.loop, s.introOn, s.outroOn]).toEqual([
      960,
      320,
      15,
      'infinite',
      true,
      true,
    ]);
    expect(s.sf).toMatchObject({
      tpl: 'radar',
      code: '',
      glow: 4,
      grain: 2,
      scan: false,
      glitch: true,
      dur: 4,
      webpQuality: 80,
      latin: 'Orbitron',
      cjk: 'noto-sans-tc',
    });
    /* 其他模式沒有 sf 欄位 */
    expect('sf' in baseSettings('title')).toBe(false);
    expect(fpsChoicesOf('sf')).toEqual([10, 12, 15, 20, 24]);
    expect(fpsChoicesOf('title')).toEqual([12, 15, 20, 24, 30, 60]);
  });

  it('範本只換版面：文字、顏色、字型、效果、長度都保留；重設回到預設但保留尺寸與播放方式', () => {
    const prev = sfCfg((c) => {
      c.text = '自己的標題';
      c.sub = '副';
      c.canvasW = 1200;
      c.canvasH = 400;
      c.introOn = false;
      c.outroOn = false;
      c.loop = 'infinite';
      c.sf!.main = '#123456';
      c.sf!.glow = 9;
      c.sf!.dur = 6;
    });
    const memo = { title: {}, long: {}, caption: null };
    const e = templateEntry({ memo }, 'sf', 'console', prev);
    /* 版面只記在 s.sf.tpl 一處（R4） */
    expect('tpl' in e).toBe(false);
    expect(e.s.sf).toMatchObject({ tpl: 'console', main: '#123456', glow: 9, dur: 6 });
    expect([e.s.text, e.s.sub, e.s.canvasW, e.s.introOn]).toEqual([
      '自己的標題',
      '副',
      1200,
      false,
    ]);
    const r = templateEntry({ memo }, 'sf', 'medal', prev, { ignoreMemo: true });
    expect(r.s.sf).toMatchObject({ tpl: 'medal', main: '#eef4fb', glow: 4, dur: 4 });
    expect(r.s.text).toBe(TEMPLATES.sf[0].text);
    expect([r.s.canvasW, r.s.canvasH, r.s.introOn, r.s.outroOn, r.s.loop]).toEqual([
      1200,
      400,
      false,
      false,
      'infinite',
    ]);
  });

  it('自動檔名：標題開頭＋範本名稱（＋無登場／無退場／循環）', () => {
    const s = sfCfg();
    expect(autoFileName(s)).toBe('異常訊號_雷達掃描_循環');
    expect(autoFileName({ ...s, introOn: false, outroOn: false })).toBe(
      '異常訊號_雷達掃描_無登場_無退場_循環',
    );
    expect(autoFileName({ ...s, text: '', sub: '', loop: 'once', outroOn: false })).toBe(
      'SF標題_雷達掃描_無退場',
    );
  });
});

describe('代碼與解碼（F316、F324）', () => {
  it('代碼留空時依標題雜湊產生，同一個標題永遠相同；有填時用填的', () => {
    const a = sfAutoCode('異常訊號');
    expect(a).toMatch(/^[A-HJ-NP-Z]{2}-[0-9A-F]{4}·\d{2}$/);
    expect(sfAutoCode('異常訊號')).toBe(a);
    expect(sfAutoCode('  異常訊號 ')).toBe(a);
    expect(sfAutoCode('另一個標題')).not.toBe(a);
    expect(sfAutoCode('')).toBe(sfAutoCode('SF'));
    const s = sfCfg((c) => {
      c.text = '異常訊號';
    });
    expect(sfCodeOf(s)).toBe(a);
    expect(sfCodeOf({ ...s, sf: { ...s.sf!, code: ' NX-01 ' } })).toBe('NX-01');
  });

  it('解碼：進度之前的字定下來，後面最多 4 個亂碼（空白照留），每秒換 24 次', () => {
    const str = 'NIGHT SHIFT';
    expect(sfDecode(str, 1, 0.3)).toBe(str);
    expect(sfDecode(str, 0, 0.3)).toBe('');
    const d = sfDecode(str, 0.4, 0.3);
    /* 11 字 × 0.4 → 前 4 個字定下來＋4 個亂碼，第 6 個（空白）照留 */
    expect(Array.from(d)).toHaveLength(8);
    expect(d.slice(0, 4)).toBe('NIGH');
    expect(d[5]).toBe(' ');
    for (const ch of [d[4], d[6], d[7]]) expect(SF_SCRAMBLE).toContain(ch);
    expect(sfDecode(str, 0.4, 0.3)).toBe(d);
    /* 同一個 1/24 秒裡不變，下一個 1/24 秒換（決定性：只看時間） */
    expect(sfDecode(str, 0.4, 0.3 + 0.01)).toBe(d);
    const later = [1, 2, 3, 4].map((k) => sfDecode(str, 0.4, 0.3 + k / 24));
    expect(later.some((x) => x !== d)).toBe(true);
    /* 中文：依字數 */
    expect(
      Array.from(sfDecode('異常訊號', 0.5, 1))
        .slice(0, 2)
        .join(''),
    ).toBe('異常');
  });
});

describe('播放方式、時間與循環（F323、F326、F327、F330）', () => {
  it('三種播放方式對應到登場、退場開關與循環；其他組合是自訂', () => {
    expect(SF_PLAYS.map((p) => [p.id, p.introOn, p.outroOn, p.loop])).toEqual([
      ['full', true, true, 'infinite'],
      ['once', true, false, 'once'],
      ['idle', false, false, 'infinite'],
    ]);
    expect(sfPlayOf(baseSettings('sf'))).toBe('full');
    expect(sfPlayOf({ introOn: true, outroOn: false, loop: 'once' })).toBe('once');
    expect(sfPlayOf({ introOn: false, outroOn: false, loop: 'infinite' })).toBe('idle');
    expect(sfPlayOf({ introOn: false, outroOn: true, loop: 'infinite' })).toBeNull();
    expect(sfPlayOf({ introOn: true, outroOn: true, loop: 'count' })).toBeNull();
  });

  it('時間軸：登場＝min(1.6, 0.45×長度)、退場＝最後 0.4 秒；關掉時沒有', () => {
    const t4 = sfTiming(sfCfg());
    expect(t4).toMatchObject({ D: 4, Ti: 1.6, To: 0.4 });
    expect(sfTiming(sfCfg((c) => (c.sf!.dur = 2))).Ti).toBeCloseTo(0.9, 9);
    expect(sfProgress(t4, 0.8)).toEqual({ intro: 0.5, outro: 0 });
    expect(sfProgress(t4, 3.8).outro).toBeCloseTo(0.5, 9);
    const idle = sfTiming(
      sfCfg((c) => {
        c.introOn = false;
        c.outroOn = false;
      }),
    );
    expect(idle).toMatchObject({ Ti: 0, To: 0 });
    expect(sfProgress(idle, 0)).toEqual({ intro: 1, outro: 0 });
    expect(sfProgress(idle, 3.99)).toEqual({ intro: 1, outro: 0 });
  });

  it('場景：一頁的登場／停留／退場、代表畫面、總長；循環時匯出不取結尾那一格', () => {
    const full = buildScene(sfCfg(), { paint: false });
    expect([full.W, full.H, full.duration, full.repTime]).toEqual([960, 320, 4, 1.6]);
    expect(full.phases.map((p) => [p.kind, p.a, p.b])).toEqual([
      ['intro', 0, 1.6],
      ['hold', 1.6, 3.6],
      ['outro', 3.6, 4],
    ]);
    expect(full.seamless).toBe(true);
    expect(sceneSource(full).loop).toBe(true);
    expect(playsOf(full.cfg)).toBe(0);
    expect(full.isBlankAt(4)).toBe(true);
    expect(full.isBlankAt(2)).toBe(false);

    const once = buildScene(
      sfCfg((c) => {
        c.outroOn = false;
        c.loop = 'once';
      }),
      { paint: false },
    );
    expect(once.phases.map((p) => p.kind)).toEqual(['intro', 'hold']);
    expect(once.isBlankAt(4)).toBe(false);
    expect(playsOf(once.cfg)).toBe(1);
    expect(once.seamless).toBe(true);

    const idle = buildScene(
      sfCfg((c) => {
        c.introOn = false;
        c.outroOn = false;
        c.sf!.dur = 6.5;
      }),
      { paint: false },
    );
    expect([idle.duration, idle.repTime, idle.instant]).toEqual([6.5, 0, true]);
    expect(idle.phases.filter((p) => p.b > p.a).map((p) => p.kind)).toEqual(['hold']);

    /* 播放一次又有退場：最後一格取在結尾（全透明） */
    const fadeOnce = buildScene(
      sfCfg((c) => (c.loop = 'once')),
      { paint: false },
    );
    expect(fadeOnce.seamless).toBe(false);
    expect('loop' in sceneSource(fadeOnce)).toBe(false);
    /* 既有模式的匯出來源不受影響（沒有 loop 欄位） */
    expect('loop' in sceneSource(buildScene(baseSettings('title'), { paint: false }))).toBe(false);
  });

  it('一個循環的相位無縫接回；元件的登場時段（緩停）', () => {
    expect(loopPhase(0, 4, 1)).toBe(0);
    expect(loopPhase(4, 4, 1)).toBe(0);
    expect(loopPhase(1, 4, 2)).toBeCloseTo(0.5, 9);
    expect(introWindow(0.1, 0.2, 0.4)).toBe(0);
    expect(introWindow(0.6, 0.2, 0.4)).toBe(1);
    expect(introWindow(0.4, 0.2, 0.4)).toBeCloseTo(0.875, 9);
  });

  it('故障用文字演出的雜訊效果：登場＝雜訊干擾、停留＝偶爾雜訊、退場＝雜訊斷訊（F323）', () => {
    const cfg = sfCfg();
    const S = 64;
    /* 登場一開始最強，之後減弱 */
    expect(sfBlockAt(cfg, 0, S).glitch).toBe(1);
    expect(sfBlockAt(cfg, 0.5, S).glitch).toBeLessThan(sfBlockAt(cfg, 0.1, S).glitch);
    expect(sfBlockAt(cfg, 1.2, S).glitch).toBe(0);
    /* 停留中：和「偶爾雜訊」完全相同（每 1.7 秒一下，這裡 2.55～2.69 秒） */
    const pulse = HOLD.glitchPulse.block!;
    for (const t of [2, 2.6, 3.3]) {
      const ref = { glitch: 0, dx: 0 } as Parameters<typeof pulse>[0];
      pulse(ref, t, { S, P: 1, seed: 777, vertical: false });
      expect(sfBlockAt(cfg, t, S).glitch).toBe(ref.glitch);
    }
    expect(sfBlockAt(cfg, 2.6, S).glitch).toBeGreaterThan(0.4);
    expect(sfBlockAt(cfg, 2, S).glitch).toBe(0);
    /* 退場：雜訊越來越強、淡出；故障關掉時只留淡出與閃斷 */
    const late = sfBlockAt(cfg, 3.95, S);
    expect(late.glitch).toBeGreaterThan(0.5);
    expect(late.alpha).toBeLessThan(0.5);
    const off = sfCfg((c) => {
      c.sf!.glitch = false;
    });
    for (const t of [0, 0.3, 2.6, 3.7, 3.95]) {
      const b = sfBlockAt(off, t, S);
      expect(b.glitch).toBe(0);
      expect(b.dx).toBe(0);
    }
    expect(sfBlockAt(off, 3.95, S).alpha).toBe(late.alpha);
    expect(sfBlockAt(off, 1, S).alpha).toBe(1);
    /* 縮圖（停留中的樣子）：沒有登場、退場 */
    expect(sfBlockAt(cfg, 0, S, undefined, true).glitch).toBe(0);
  });
});

describe('尺寸（F328）：比例 3:1、2:1、16:9 × 寬 640、800、960、1200', () => {
  it('高＝寬 ÷ 比例取偶數；畫面尺寸對回比例與寬度', () => {
    const table = SF_RATIOS.map(([id, , r]) => [id, SF_WIDTHS.map((w) => sfHeight(w, r))]);
    expect(table).toEqual([
      ['3:1', [214, 266, 320, 400]],
      ['2:1', [320, 400, 480, 600]],
      ['16:9', [360, 450, 540, 674]],
    ]);
    expect(sfSizeOf(800, 266)).toEqual({ ratio: '3:1', width: 800 });
    expect(sfSizeOf(1200, 674)).toEqual({ ratio: '16:9', width: 1200 });
    expect(sfSizeOf(1000, 333)).toBeNull();
  });

  const long = sfCfg((c) => {
    /* 標題 40 字、副文字 60 字（輸入欄的上限） */
    c.text = '超長的標題'.repeat(8);
    c.sub = '這是一段很長的副文字，用來確認放不下的時候會縮小。'.repeat(3).slice(0, 60);
    c.sf!.code = '代碼也可以很長的二十四個字元ABCDEFGHIJKLM';
    c.sf!.num = '9999';
  });
  const latin = sfCfg((c) => {
    c.text = 'W'.repeat(40);
    c.sub = 'M'.repeat(60);
  });
  const phases = [
    { intro: 0.05, outro: 0 },
    { intro: 0.3, outro: 0 },
    { intro: 0.6, outro: 0 },
    { intro: 1, outro: 0 },
    { intro: 1, outro: 0.6 },
  ];

  it('8 個範本（短標題、長標題、英文長標題、沒有副文字）都畫在 1200 × 400 的設計空間裡', () => {
    const plain = sfCfg((c) => (c.sub = ''));
    for (const id of SF_TEMPLATE_IDS) {
      for (const cfg of [sfCfg(), long, latin, plain]) {
        for (const ph of phases) {
          for (const t of [0.3, 1.1, 2.2, 3.7]) {
            const b = record(id, cfg, t, 1200, 400, ph).box;
            const tag = `${id} ${cfg.text.slice(0, 4)} intro=${ph.intro} t=${t}`;
            expect(b.x0, tag).toBeGreaterThanOrEqual(0);
            expect(b.y0, tag).toBeGreaterThanOrEqual(0);
            expect(b.x1, tag).toBeLessThanOrEqual(1200);
            expect(b.y1, tag).toBeLessThanOrEqual(400);
          }
        }
      }
    }
  });

  it('每個範本在 3 種比例、4 種寬度下都不出界（置中縮放）', () => {
    for (const [, , r] of SF_RATIOS) {
      for (const w of SF_WIDTHS) {
        const h = sfHeight(w, r);
        const { s, ox, oy } = sfFit(w, h);
        expect(ox).toBeGreaterThanOrEqual(0);
        expect(oy).toBeGreaterThanOrEqual(0);
        expect(ox * 2 + 1200 * s).toBeCloseTo(w, 6);
        for (const id of SF_TEMPLATE_IDS) {
          const b = record(id, long, 2.2, w, h, { intro: 1, outro: 0 }).box;
          const tag = `${id} ${w}×${h}`;
          expect(b.x0, tag).toBeGreaterThanOrEqual(0);
          expect(b.y0, tag).toBeGreaterThanOrEqual(0);
          expect(b.x1, tag).toBeLessThanOrEqual(w + 1e-6);
          expect(b.y1, tag).toBeLessThanOrEqual(h + 1e-6);
        }
      }
    }
  });
});

describe('決定性（F334、text-fx 4.2）', () => {
  it('同一組設定、同一個時間點，每個範本的每一步都相同', () => {
    for (const id of SF_TEMPLATE_IDS) {
      for (const t of [0.2, 0.9, 1.7, 2.65, 3.75]) {
        const a = record(id, sfCfg(), t).log;
        const b = record(id, sfCfg(), t).log;
        expect(a.length, id).toBeGreaterThan(t < 1 ? 0 : 10);
        expect(b).toEqual(a);
      }
    }
  });

  it('停留中的動作會動（不同時間點畫面不同），一個循環後接回原樣', () => {
    const cfg = sfCfg();
    for (const id of SF_TEMPLATE_IDS) {
      const at = (t: number) =>
        record(id, cfg, t, 1200, 400, { intro: 1, outro: 0 }).log.join('\n');
      expect(at(1.7), id).not.toBe(at(2.9));
      const a = at(0.5).split('\n');
      const b = at(4.5).split('\n');
      const i = a.findIndex((x, k) => x !== b[k]);
      expect(i < 0 ? '' : `${a[i]}\n${b[i]}`, id).toBe('');
    }
  });
});

describe('設定修正、舊專案檔與範本檔（F333）', () => {
  it('不認得的值改回預設、數值夾在範圍裡', () => {
    expect(
      normalizeSf({
        tpl: 'nope',
        main: 'red',
        accent: '#ABCDEF',
        latin: 'Comic Sans',
        cjk: 'nope',
        glow: 99,
        grain: -3,
        dur: 7.3,
        webpQuality: 12,
        code: 'x'.repeat(40),
        num: '123456',
        scan: 'yes',
      }),
    ).toMatchObject({
      tpl: 'radar',
      main: '#eef4fb',
      accent: '#abcdef',
      latin: 'Orbitron',
      cjk: 'noto-sans-tc',
      glow: 10,
      grain: 0,
      dur: 7.5,
      webpQuality: 50,
      code: 'x'.repeat(24),
      num: '1234',
      scan: false,
    });
    const s = normalizeSettings('sf', { fps: 30, sf: { dur: 1 } });
    expect([s.fps, s.sf!.dur]).toEqual([15, 2]);
    /* 其他模式帶了 sf 欄位時拿掉 */
    expect('sf' in normalizeSettings('title', { sf: { tpl: 'medal' } })).toBe(false);
  });

  it('舊的存檔／專案檔沒有 SF 標題：補上預設，其他模式照舊', () => {
    const old = {
      mode: 'caption',
      modes: { caption: { tpl: 'day', s: { text: '舊的' } } },
      memo: { title: {}, long: {}, caption: null },
      names: { title: '', long: '', caption: '舊檔名' },
    };
    const d = normalizeData(old);
    expect(d.mode).toBe('caption');
    expect(d.modes.caption.s.text).toBe('舊的');
    expect(tplIdOf({ mode: 'sf', modes: d.modes })).toBe('radar');
    expect('tpl' in d.modes.sf).toBe(false);
    expect(d.modes.sf.s.sf).toEqual(baseSettings('sf').sf);
    expect(d.names).toEqual({ title: '', long: '', caption: '舊檔名', sf: '' });
    /* 不認得的模式改回標語；SF 的存檔缺欄位時補上 */
    expect(normalizeData({ mode: 'nope' }).mode).toBe('title');
    /* 舊資料另外帶的 tpl 不用：版面以設定裡的 sf.tpl 為準（R4） */
    const m = normalizeData({
      mode: 'sf',
      modes: { sf: { tpl: 'medal', s: { sf: { tpl: 'chapter' } } } },
    });
    expect(m.mode).toBe('sf');
    expect(m.modes.sf.s.sf).toMatchObject({ tpl: 'chapter', glow: 4, dur: 4 });
    expect(tplIdOf(m)).toBe('chapter');
    expect('tpl' in m.modes.sf).toBe(false);
    expect(normalizeData(null)).toEqual(initialData());
  });

  it('範本檔：SF 標題的我的範本可以寫出、讀回；舊的範本檔照讀', () => {
    const s = sfCfg((c) => {
      c.text = '我的 SF';
      c.sf!.tpl = 'alert';
      c.sf!.accent = '#00ff88';
    });
    const item = makeMine([], 'sf', s, '警告');
    const text = templatesFileText([item]);
    const back = parseTemplatesFile(text);
    expect(back.templates).toHaveLength(1);
    expect(back.templates[0].mode).toBe('sf');
    expect(back.templates[0].s.sf).toMatchObject({ tpl: 'alert', accent: '#00ff88' });
    expect(normalizeMine({ items: [item] }).items[0].s.sf?.tpl).toBe('alert');
    const oldFile = JSON.stringify({
      format: 'trpg-toolkit:text-fx-templates',
      version: 1,
      templates: [
        {
          name: '舊的',
          mode: 'title',
          settings: settingsFromTemplate('title', TEMPLATES.title[0]),
        },
      ],
    });
    const r = parseTemplatesFile(oldFile);
    expect(r.templates[0].mode).toBe('title');
    expect('sf' in r.templates[0].s).toBe(false);
  });
});

describe('一次匯出多個、字型（F332、F319）', () => {
  it('勾選的範本：同一組文字與樣式套上每個版面；SF 沒有「每一行各一個」', () => {
    const d = initialData();
    d.mode = 'sf';
    d.modes.sf.s.text = '同一個標題';
    d.modes.sf.s.sf!.main = '#ff00aa';
    const items = batchByTemplates(d, ['b:radar', 'b:console'], []);
    expect(items.map((it) => [it.label, it.cfg.sf!.tpl, it.cfg.text, it.cfg.sf!.main])).toEqual([
      ['雷達掃描', 'radar', '同一個標題', '#ff00aa'],
      ['指令視窗', 'console', '同一個標題', '#ff00aa'],
    ]);
    expect(batchNames(items, '')).toEqual([
      '01_同一個標題_雷達掃描_循環',
      '02_同一個標題_指令視窗_循環',
    ]);
    expect(batchKindOf('lines', 'sf')).toBe('off');
    expect(batchKindOf('templates', 'sf')).toBe('templates');
    expect(batchKindOf('lines', 'title')).toBe('lines');
  });

  it('字型：英文字型的 700／800／900、等寬小字、中文字型；像素字型用本站附帶的字型檔', () => {
    const loads = sfFontLoads(sfCfg());
    expect(loads.map((l) => `${l.family}:${l.weight}`)).toEqual([
      'Orbitron:700',
      'Orbitron:800',
      'Orbitron:900',
      'Share Tech Mono:400',
      'Noto Sans TC:400',
      'Noto Sans TC:700',
      'Noto Sans TC:800',
      'Noto Sans TC:900',
    ]);
    expect(loads[0].text).toContain('異常訊號');
    const pixel = sfFontLoads(
      sfCfg((c) => {
        c.sf!.latin = 'Michroma';
        c.sf!.cjk = 'cubic-11';
      }),
    );
    expect(pixel.map((l) => `${l.family}:${l.weight}:${l.bundled ?? ''}`)).toEqual([
      'Michroma:400:',
      'Share Tech Mono:400:',
      'Cubic 11:400:cubic-11',
    ]);
    expect(sfFonts(sfCfg()).title(900, 48)).toBe('900 48px "Orbitron", "Noto Sans TC", sans-serif');
    expect(sfFonts(sfCfg()).mono(15)).toBe('400 15px "Share Tech Mono", "Noto Sans TC", monospace');
  });
});

describe('狀態：切到 SF 標題、套範本、重設', () => {
  beforeEach(() => replaceAll(initialData()));

  it('模式各自保留設定；套用範本保留文字；改文字不寫進其他模式的記憶', () => {
    setMode('sf');
    expect(useTfx.getState().data.mode).toBe('sf');
    updateCfg((c) => {
      c.text = '新的';
      c.sf!.glow = 7;
    });
    applyTemplate('tag');
    const d = useTfx.getState().data;
    expect(tplIdOf(d)).toBe('tag');
    expect(cfgOf(d).text).toBe('新的');
    expect(cfgOf(d).sf).toMatchObject({ tpl: 'tag', glow: 7 });
    expect(d.memo).toEqual({ title: {}, long: {}, caption: null });
    resetTemplate();
    expect(cfgOf(useTfx.getState().data).sf).toMatchObject({ tpl: 'tag', glow: 4 });
    expect(cfgOf(useTfx.getState().data).text).toBe('異常訊號');
    /* 我的範本：版面跟著範本走（資訊列、重設都用它） */
    applyTemplate('chapter');
    const mine = saveMine('大字版');
    applyTemplate('radar');
    applyMine(mine.id);
    expect(tplIdOf(useTfx.getState().data)).toBe('chapter');
    expect(cfgOf(useTfx.getState().data).sf?.tpl).toBe('chapter');
    setMode('title');
    expect(cfgOf(useTfx.getState().data).text).toBe('戰鬥開始');
  });
});

describe('介面文字的中英文空白（R7）', () => {
  it('中文與英文、數字相鄰時加半形空白，其他照接', () => {
    expect(joinText('切換到', 'SF 標題')).toBe('切換到 SF 標題');
    expect(joinText('切換到', '標語')).toBe('切換到標語');
    expect(joinText('SF 標題', '範本')).toBe('SF 標題範本');
    expect(joinText('標語', '範本')).toBe('標語範本');
    expect(joinText('第', '3', '頁')).toBe('第 3 頁');
    expect(joinText('', 'A')).toBe('A');
  });
});
