/**
 * 場景轉換素材產生器：設定的規則（純函式）。
 * - 53 種效果的初始設定與「會出現的形狀設定」逐項對照附件 scene-transition.effects.json；
 * - 選取效果時哪些設定換掉、哪些保留（規格 4.5 的實測例子）；
 * - 依設定增減的欄位（F22）、數量的範圍（F15）、字級的初始值、存檔修正（F65、F66）、檔名（3.8）、換花紋（F21）。
 */
import { describe, expect, it } from 'vitest';
import { lineCenters, outlineColor } from '@/tools/scene-transition/caption';
import { EFFECTS, effectById, sampleCaption } from '@/tools/scene-transition/effects';
import { captionFontCss, FONT_IDS } from '@/tools/scene-transition/fonts';
import {
  applyEffect,
  DEFAULT_SETTINGS,
  effectLook,
  exportFileName,
  nextSeed,
  normalizeSettings,
  visibleFields,
} from '@/tools/scene-transition/model';
import {
  clampCount,
  defaultFontSize,
  RANGES,
  type Settings,
  snap,
} from '@/tools/scene-transition/settings';
import JSON_EFFECTS from '../../../docs/refactor/specs/scene-transition.effects.json';

// biome-ignore lint/suspicious/noExplicitAny: 附件 JSON 的欄位依效果不同
type Effect = any;
const J = JSON_EFFECTS as unknown as { 效果: Effect[] };

const MODE: Record<string, Settings['mode']> = {
  蓋上: 'cover',
  揭開: 'reveal',
  掃過: 'sweep',
  蓋上再揭開: 'roundtrip',
};
const CURVE: Record<string, Settings['curve']> = {
  慢進慢出: 'smoothstep',
  等速: 'linear',
  加速: 'quadIn',
  減速: 'quadOut',
  彈跳: 'bounceOut',
  明滅後蓋上: 'flicker',
  雷閃: 'lightning',
  心跳: 'heartbeat',
};
const DIR: Record<string, Settings['direction']> = {
  往右: 'right',
  往左: 'left',
  往下: 'down',
  往上: 'up',
  往右下: 'down-right',
  往左下: 'down-left',
  往右上: 'up-right',
  往左上: 'up-left',
};
const OPTION: Record<string, Record<string, string>> = {
  波浪邊: { 圓滑波: 'sine', 鋸齒: 'saw', 方波: 'square' },
  圖形: { 星形: 'star', 心形: 'heart', 菱形: 'diamond', 方形: 'square', 六角形: 'hexagon' },
  時鐘: { 順時針: 'clockwise', 左右對稱: 'symmetric' },
  格子: { 方形: 'square', 圓形: 'circle', 菱形: 'diamond' },
  暈染: { 沿方向: 'direction', 從中心: 'center' },
};
const ORDER: Record<string, Settings['order']> = {
  沿方向: 'direction',
  從中心: 'center',
  隨機: 'random',
  交錯分組: 'alternate',
};
const FONT: Record<string, string> = { 黑體: 'gothic', 明體: 'mincho', 等寬: 'mono' };
const POS: Record<string, Settings['textPos']> = { 正中央: 'center', 下方: 'bottom', 上方: 'top' };
const FIELD: Record<string, string> = {
  發光顏色: 'glowColor',
  第二顏色: 'color2',
  帶寬: 'bandWidth',
  方向: 'direction',
  形狀選項: 'option',
  數量: 'count',
  強度: 'strength',
  中心: 'center',
  軸向: 'axis',
  圓的比例: 'ellipse',
  方塊大小: 'blockSize',
  花紋編號: 'seed',
  出現順序: 'order',
};

/** 附件的初始設定 → 新版的設定值（只比對附件有寫的項目） */
function expected(e: Effect): Partial<Settings> {
  const s = e.初始設定;
  const out: Partial<Settings> = {
    mode: MODE[s.轉場方式],
    color: s.顏色,
    duration: s['動作時間（秒）'],
    hold: s['停留時間（秒）'],
    softness: s.邊緣柔和度,
    reach: s['推進比例（%）'],
    reverseOrder: s.反向順序,
    reversePlay: s.倒著播放,
    glow: s.邊緣發光,
    strobe: s.雙色閃換次數,
    loop: s.循環播放,
  };
  if (CURVE[s.速度曲線]) out.curve = CURVE[s.速度曲線];
  if (s.帶寬 !== undefined) out.bandWidth = s.帶寬;
  if (s.方向) out.direction = DIR[s.方向];
  if (s.形狀選項) out.option = OPTION[e.形狀][s.形狀選項];
  if (s.數量 !== undefined) out.count = s.數量;
  if (s.強度 !== undefined) out.strength = s.強度;
  if (s.中心) [out.centerX, out.centerY] = s.中心;
  if (s.發光顏色) out.glowColor = s.發光顏色;
  if (s.軸向) out.axis = s.軸向 === '上下' ? 'vertical' : 'horizontal';
  if (s.圓的比例) out.ellipse = s.圓的比例 === '橢圓';
  if (s['方塊大小（px）'] !== undefined) out.blockSize = s['方塊大小（px）'];
  if (s.花紋編號 !== undefined) out.seed = s.花紋編號;
  if (s.出現順序) out.order = ORDER[s.出現順序];
  if (s.第二顏色) out.color2 = s.第二顏色;
  if (s.字型) {
    out.font = FONT[s.字型];
    out.textColor = s.文字顏色;
    out.textPos = POS[s.字幕位置];
    out.outline = s.外框;
  }
  return out;
}

describe('53 種效果（附件）', () => {
  it('效果數、編號、分類', () => {
    expect(EFFECTS).toHaveLength(53);
    expect(EFFECTS.map((e) => e.id)).toEqual(J.效果.map((e: Effect) => e.編號));
    const cats = new Map<string, string>();
    for (const e of J.效果 as Effect[]) cats.set(e.類別, effectById(e.編號).category);
    /* 附件的 9 個類別各自對到一個分類 */
    expect(new Set(cats.values()).size).toBe(9);
  });

  for (const e of J.效果 as Effect[]) {
    it(`${e.編號} ${e.名稱}：初始設定與會出現的形狀設定`, () => {
      const s = applyEffect(null, e.編號);
      const want = expected(e);
      /* 刻意差異（主控裁定）：E52 改成交替閃爍後完全蓋上 */
      if (e.編號 === 'E52') {
        expect(s.reach).toBe(100);
        expect(s.curve).toBe('smoothstep');
        delete want.reach;
      }
      for (const [k, v] of Object.entries(want)) {
        if (v === undefined) continue;
        expect(s[k as keyof Settings], k).toEqual(v);
      }
      /* 字幕效果：範例字幕（新版自編）、字級＝輸出高的 9% */
      if (e.初始設定.字幕) {
        expect(s.caption.length).toBeGreaterThan(0);
        expect(s.caption).toBe(sampleCaption(e.編號));
        expect(s.fontSize).toBe(66);
      } else expect(s.caption).toBe('');
      const fields = [...visibleFields(s)].sort();
      const ref = (e.會出現的形狀設定 as string[]).map((x) => FIELD[x]).sort();
      expect(fields).toEqual(ref);
      /* 形狀：E49～E51 有邊緣實心 */
      expect(!!effectById(e.編號).solidEdge).toBe(['E49', 'E50', 'E51'].includes(e.編號));
    });
  }
});

describe('依設定增減的欄位（F22）', () => {
  it('格子：出現順序改成從中心 → 方向消失、中心出現；隨機 → 花紋編號', () => {
    const s = applyEffect(null, 'E32');
    expect(visibleFields(s).has('direction')).toBe(true);
    const c = { ...s, order: 'center' as const };
    expect(visibleFields(c).has('direction')).toBe(false);
    expect(visibleFields(c).has('center')).toBe(true);
    const r = { ...s, order: 'random' as const };
    expect(visibleFields(r).has('seed')).toBe(true);
    expect(visibleFields({ ...s, order: 'alternate' as const }).has('direction')).toBe(false);
  });

  it('暈染：從中心 → 中心；沿方向 → 方向', () => {
    const s = applyEffect(null, 'E37');
    expect(visibleFields(s).has('direction')).toBe(true);
    const c = visibleFields({ ...s, option: 'center' });
    expect(c.has('direction')).toBe(false);
    expect(c.has('center')).toBe(true);
  });

  it('發光顏色、第二顏色（2 次以上才出現）、帶寬（掃過）', () => {
    const s = DEFAULT_SETTINGS;
    expect(visibleFields({ ...s, glow: true }).has('glowColor')).toBe(true);
    expect(visibleFields({ ...s, strobe: 1 }).has('color2')).toBe(false);
    expect(visibleFields({ ...s, strobe: 2 }).has('color2')).toBe(true);
    expect(visibleFields({ ...s, mode: 'sweep' }).has('bandWidth')).toBe(true);
    expect([...visibleFields(s)]).toEqual([]);
  });
});

describe('選取效果時的設定變化（規格 4.5）', () => {
  it('換成效果的值；保留輸出尺寸、每秒格數、格式', () => {
    const prev: Settings = {
      ...applyEffect(null, 'E01'),
      size: '640x360',
      fps: 12,
      format: 'apng',
      softness: 200,
      color: '#123456',
    };
    const s = applyEffect(prev, 'E09');
    expect(s.size).toBe('640x360');
    expect(s.fps).toBe(12);
    expect(s.format).toBe('apng');
    expect(s.softness).toBe(25);
    expect(s.color).toBe('#000000');
    expect(s.effect).toBe('E09');
  });

  it('循環播放：保留使用者的選擇；選心跳暗角 → 開，從心跳暗角換走 → 關', () => {
    const a = { ...applyEffect(null, 'E01'), loop: true };
    expect(applyEffect(a, 'E09').loop).toBe(true);
    const hb = applyEffect(a, 'E39');
    expect(hb.loop).toBe(true);
    expect(applyEffect({ ...applyEffect(null, 'E01'), loop: false }, 'E39').loop).toBe(true);
    expect(applyEffect(hb, 'E01').loop).toBe(false);
  });

  it('字幕：等於前一個效果的範例才換掉（規格的三個實測例子）', () => {
    /* 在 E40 把字幕清空並改字型 → 換到 E41：字幕仍是空的、字型不變 */
    const e40 = { ...applyEffect(null, 'E40'), caption: '', font: 'kai' };
    const e41 = applyEffect(e40, 'E41');
    expect(e41.caption).toBe('');
    expect(e41.font).toBe('kai');
    /* 在 E09 打幾個空白 → 換到 E40：換成範例字幕與 E40 的設定 */
    const e09 = { ...applyEffect(null, 'E09'), caption: '   ', textColor: '#ff0000' };
    const to40 = applyEffect(e09, 'E40');
    expect(to40.caption).toBe(sampleCaption('E40'));
    expect(to40.textColor).toBe('#ffffff');
    expect(to40.font).toBe('gothic');
    /* 在 E42 改字級 → 換到 E21：字幕清空、字級回到 9% */
    const e42 = { ...applyEffect(null, 'E42'), fontSize: 120 };
    const to21 = applyEffect(e42, 'E21');
    expect(to21.caption).toBe('');
    expect(to21.fontSize).toBe(66);
    expect(to21.textPos).toBe('center');
    expect(to21.outline).toBe(false);
    /* 使用者自己打的字：字幕與五項樣式全部保留 */
    const own = {
      ...applyEffect(null, 'E40'),
      caption: '第二章',
      fontSize: 80,
      textPos: 'top' as const,
    };
    const kept = applyEffect(own, 'E48');
    expect(kept.caption).toBe('第二章');
    expect(kept.fontSize).toBe(80);
    expect(kept.textPos).toBe('top');
    expect(kept.font).toBe('gothic');
    /* 範例字幕換成新效果的（E48 為綠色等寬） */
    const e48 = applyEffect(applyEffect(null, 'E40'), 'E48');
    expect(e48.caption).toBe(sampleCaption('E48'));
    expect(e48.font).toBe('mono');
    expect(e48.textColor).toBe('#39ff88');
  });

  it('字級的初始值＝輸出高 × 9%，對齊到 2 px：720 → 66、1080 → 98、540 → 50、360 → 32', () => {
    expect([720, 1080, 540, 360].map(defaultFontSize)).toEqual([66, 98, 50, 32]);
    const big = applyEffect({ ...applyEffect(null, 'E01'), size: '1920x1080' }, 'E40');
    expect(big.fontSize).toBe(98);
  });

  it('數量夾在新形狀的範圍內；沒指定時 10', () => {
    expect(effectLook('E21').count).toBe(10);
    expect(clampCount('spiral', 10)).toBe(8);
    expect(clampCount('rain', 4)).toBe(8);
    expect(clampCount('interlace', 500)).toBe(180);
    expect(clampCount('flat', 10)).toBe(10);
  });
});

describe('存檔修正與預設（F65、F66）', () => {
  it('沒有存檔、格式不對、效果不認得 → E01、1280 × 720、24、WebP', () => {
    for (const raw of [null, 'x', [], {}, { effect: 'E99' }]) {
      const s = normalizeSettings(raw);
      expect(s.effect).toBe('E01');
      expect(s.size).toBe('1280x720');
      expect(s.fps).toBe(24);
      expect(s.format).toBe('webp');
      expect(s.loop).toBe(false);
      expect(s.caption).toBe('');
      expect(s.hold).toBe(0.6);
    }
  });

  it('存下的值不在選單裡時改成第一個選項；數值夾在範圍內並對齊間隔；缺的用效果的初始設定', () => {
    const s = normalizeSettings({
      effect: 'E33',
      size: '999x1',
      fps: 60,
      mode: 'zoom',
      direction: 'left',
      option: 'triangle',
      count: 500,
      softness: 999,
      duration: 0.123,
      fontSize: 17,
      font: 'nope',
      color: 'red',
      glow: 'yes',
    });
    expect(s.effect).toBe('E33');
    expect(s.size).toBe('1280x720');
    expect(s.fps).toBe(24);
    expect(s.mode).toBe('cover');
    expect(s.direction).toBe('left');
    expect(s.option).toBe('square');
    expect(s.count).toBe(40);
    expect(s.softness).toBe(255);
    expect(s.duration).toBe(0.1);
    expect(s.fontSize).toBe(18);
    expect(s.font).toBe(FONT_IDS[0]);
    /* 缺的、壞掉的：E33 的初始設定 */
    expect(s.color).toBe('#000000');
    expect(s.glow).toBe(false);
    expect(s.hold).toBe(0.5);
  });

  it('正確的存檔原樣讀回', () => {
    const s = { ...applyEffect(null, 'E46'), seed: 1234, centerX: 0.25, size: '960x540' as const };
    expect(normalizeSettings(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});

describe('其他規則', () => {
  it('檔名：效果名稱＋倒著播放的後綴（E50 預設就有）', () => {
    expect(exportFileName(applyEffect(null, 'E01'), 'webp')).toBe('黑色淡出.webp');
    expect(exportFileName({ effect: 'E01', reversePlay: true }, 'png')).toBe(
      '黑色淡出（倒著播放）.png',
    );
    expect(exportFileName(applyEffect(null, 'E50'), 'webp')).toBe(
      '光線向上下展開（倒著播放）.webp',
    );
  });

  it('換花紋：1～9999、與目前不同', () => {
    let k = 0;
    const seq = [6 / 9999, 6 / 9999, 0.5];
    expect(nextSeed(7, () => seq[k++])).toBe(1 + Math.floor(0.5 * 9999));
    for (let i = 0; i < 200; i++) {
      const n = nextSeed(7);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(9999);
      expect(n).not.toBe(7);
    }
  });

  it('滑桿的對齊（從最小值起算，剛好在中間取較大者）', () => {
    expect(snap(0.72, RANGES.duration)).toBe(0.7);
    expect(snap(0.725, RANGES.duration)).toBe(0.75);
    expect(snap(65, RANGES.fontSize)).toBe(66);
    expect(snap(12, RANGES.bandWidth)).toBe(10);
    expect(snap(0.33, RANGES.center)).toBe(0.35);
  });

  it('字幕：外框顏色依亮度（#8c8c8c → 白框、#8d8d8d → 黑框）、行的位置', () => {
    expect(outlineColor('#8c8c8c')).toBe('#ffffff');
    expect(outlineColor('#8d8d8d')).toBe('#000000');
    expect(outlineColor('#ff0000')).toBe('#ffffff');
    expect(outlineColor('#00ff00')).toBe('#000000');
    expect(outlineColor('#ffff00')).toBe('#000000');
    expect(outlineColor('#0000ff')).toBe('#ffffff');
    expect(lineCenters({ text: 'a', height: 720, fontSize: 100, pos: 'center' })).toEqual([360]);
    expect(lineCenters({ text: 'a\nb', height: 720, fontSize: 100, pos: 'center' })).toEqual([
      287.5, 432.5,
    ]);
    expect(lineCenters({ text: 'a', height: 720, fontSize: 100, pos: 'bottom' })[0]).toBeCloseTo(
      590.4,
      6,
    );
    expect(lineCenters({ text: 'a', height: 720, fontSize: 100, pos: 'top' })[0]).toBeCloseTo(
      129.6,
      6,
    );
  });

  it('字型：電腦字型用繁中系統字型、Google 字型用固定字重＋後備字型', () => {
    expect(captionFontCss('gothic', '', 66)).toBe(
      '700 66px "Microsoft JhengHei", "微軟正黑體", "PingFang TC", "Heiti TC", "Noto Sans CJK TC", sans-serif',
    );
    expect(captionFontCss('custom', '  My Font ', 40)).toMatch(
      /^700 40px "My Font", "Microsoft JhengHei"/,
    );
    expect(captionFontCss('custom', '', 40)).toBe(captionFontCss('gothic', '', 40));
    expect(captionFontCss('klee', '', 50)).toMatch(/^600 50px "Klee One", /);
    expect(captionFontCss('share-tech', '', 50)).toMatch(/monospace$/);
    expect(
      FONT_IDS.filter((id) => !['gothic', 'mincho', 'kai', 'mono', 'custom'].includes(id)),
    ).toHaveLength(27);
  });
});
