/**
 * 圖片的排版（render.ts 的 layoutImages，量字寬用假的函式）：要哪幾張、寬度、字都在圖裡、內容越多越高、
 * 依程度的順序、頭像與預設的圓、名字放不下時縮小與「…」；配色的對比（主色的字、標籤的字、程度的字）。
 */
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '@/core/color';
import {
  ACCENT_SWATCHES,
  LEVELS,
  normalizeData,
  type ProfileData,
  THEMES,
} from '@/tools/pl-profile/model';
import {
  CARD_WIDTH,
  type CardImage,
  type DrawOp,
  ellipsize,
  exportScale,
  exportSize,
  imageText,
  layoutImages,
  MAX_IMAGE_PIXELS,
  MAX_IMAGE_SIDE,
  type MeasureFn,
  mixHex,
  paletteFor,
  THEME_BASES,
  wrapLines,
} from '@/tools/pl-profile/render';
import { OUT } from '@/tools/pl-profile/strings';
import { CATEGORIES } from '@/tools/pl-profile/topics';

/** 假的字寬：全形字＝字級，其他＝0.55 倍字級 */
const measure: MeasureFn = (s, f) =>
  Array.from(s).reduce((w, ch) => w + ((ch.codePointAt(0) ?? 0) < 0x250 ? 0.55 : 1) * f.size, 0);

const texts = (ops: DrawOp[]) => ops.flatMap((o) => (o.t === 'text' ? [o] : []));

function data(edit?: (d: ProfileData) => void): ProfileData {
  const d = normalizeData({
    profile: {
      nickname: '阿明',
      handle: '@aming',
      tagline: '喜歡慢慢調查的劇情派，請多指教！',
      systems: [
        { name: 'CoC 7 版', level: 'main', kp: true },
        { name: '忍神', level: 'often' },
        { name: 'Emoklore', level: 'want', note: '想找人帶' },
      ],
      styles: { picked: ['story', 'rp', 'horror'] },
      formats: { picked: ['text', 'voice'] },
      contacts: [{ kind: 'Discord', value: 'aming' }],
      memo: '第一次語音團，請多包涵。',
    },
    jirai: {
      levels: {
        'swarming-bugs': 'ng',
        'pc-death': 'ask',
        combat: 'love',
        'blood-wounds': 'like',
        'late-night': 'ok',
      },
      notes: { 'pc-death': '事前說一聲' },
      memo: '不確定的歡迎私訊',
    },
  });
  edit?.(d);
  return d;
}

describe('layoutImages', () => {
  it('合成一張／分成兩張／只要自介卡／只要地雷表；寬 800', () => {
    const kinds = (images: ProfileData['look']['images']) =>
      layoutImages(
        data((d) => {
          d.look.images = images;
        }),
        measure,
      ).map((im) => [im.kind, im.width]);
    expect(kinds('combined')).toEqual([['combined', CARD_WIDTH]]);
    expect(kinds('split')).toEqual([
      ['profile', CARD_WIDTH],
      ['jirai', CARD_WIDTH],
    ]);
    expect(kinds('profile')).toEqual([['profile', CARD_WIDTH]]);
    expect(kinds('jirai')).toEqual([['jirai', CARD_WIDTH]]);
    expect(CARD_WIDTH).toBe(800);
  });

  it('所有的字都在圖的範圍內（左對齊的字不超出右邊）', () => {
    for (const group of ['level', 'category'] as const) {
      const [im] = layoutImages(
        data((d) => {
          d.look.group = group;
        }),
        measure,
      );
      for (const t of texts(im.ops)) {
        const w = measure(t.text, t.font);
        const left = t.align === 'left' ? t.x : t.align === 'center' ? t.x - w / 2 : t.x - w;
        expect(left, t.text).toBeGreaterThanOrEqual(0);
        expect(left + w, t.text).toBeLessThanOrEqual(CARD_WIDTH + 0.01);
        expect(t.y, t.text).toBeGreaterThan(0);
        expect(t.y, t.text).toBeLessThan(im.height);
      }
    }
  });

  it('內容越多越高；合成一張＝兩張的內容都在', () => {
    const [short] = layoutImages(
      data((d) => (d.profile.memo = '')),
      measure,
    );
    const [long] = layoutImages(
      data((d) => (d.profile.memo = '很長的文字。'.repeat(40))),
      measure,
    );
    expect(long.height).toBeGreaterThan(short.height);
    const [combined] = layoutImages(data(), measure);
    const all = texts(combined.ops).map((t) => t.text);
    expect(all).toContain('阿明');
    expect(all).toContain('阿明的地雷表');
    expect(all).toContain('想說的話');
  });

  it('依程度：ng、ask 在前，再來 love、like、ok；主題的補充接在名稱後面', () => {
    const [im] = layoutImages(
      data((d) => (d.look.images = 'jirai')),
      measure,
    );
    const all = texts(im.ops).map((t) => t.text);
    const heads = all.filter((t) => Object.values(OUT.levels).some((l) => t.endsWith(` ${l}`)));
    expect(heads).toEqual(['✕ 地雷', '？ 先問我', '★ 盡量來', '✓ 有就開心', '～ 沒差']);
    expect(all).toContain('PC 死亡（事前說一聲）');
    /* 依程度時沒有圖例（每一列的開頭就是程度） */
    const [cat] = layoutImages(
      data((d) => {
        d.look.images = 'jirai';
        d.look.group = 'category';
      }),
      measure,
    );
    const catTexts = texts(cat.ops).map((t) => t.text);
    expect(catTexts.filter((t) => t === '★ 盡量來').length).toBe(2);
    expect(catTexts).toContain('事前說一聲');
  });

  it('頭像：眼睛打開時有頭像（預設的圓用暱稱的第一個字）；關掉時沒有', () => {
    const [im] = layoutImages(data(), measure);
    const av = im.ops.find((o) => o.t === 'avatar');
    expect(av && av.t === 'avatar' ? av.initial : null).toBe('阿');
    const [off] = layoutImages(
      data((d) => (d.show.avatar = false)),
      measure,
    );
    expect(off.ops.some((o) => o.t === 'avatar')).toBe(false);
  });

  it('沒有填任何主題：寫「還沒有填任何主題。」；名字太長時縮小再加「…」', () => {
    const [im] = layoutImages(
      data((d) => {
        d.jirai.levels = {};
        d.jirai.memo = '';
        d.profile.nickname = '超級長的暱稱'.repeat(4);
      }),
      measure,
    );
    const all = texts(im.ops);
    expect(all.map((t) => t.text)).toContain(OUT.jiraiEmpty);
    /* 24 個全形字放不下 32 px：縮到 22 px（放得下，不加「…」） */
    const name = all.find((t) => t.text.startsWith('超級'));
    expect(name?.text).toBe('超級長的暱稱'.repeat(4));
    expect(name?.font.size).toBe(22);
    expect(ellipsize('abc', 1000, { size: 10, weight: 400 }, measure)).toBe('abc');
    expect(ellipsize('一二三四五六', 45, { size: 10, weight: 400 }, measure)).toBe('一二三…');
  });

  it('沒有空白的長英數字（自訂標籤、主題）逐字切開，不超出標籤與卡片', () => {
    const long = 'W'.repeat(20);
    const [im] = layoutImages(
      data((d) => {
        d.profile.styles.extra = [long];
        d.jirai.custom = [
          { id: 't1', cat: 'body', label: 'W'.repeat(24), level: 'ng', note: 'W'.repeat(40) },
        ];
      }),
      measure,
    );
    for (const t of texts(im.ops)) {
      if (t.align !== 'left') continue;
      expect(t.x + measure(t.text, t.font), t.text).toBeLessThanOrEqual(CARD_WIDTH - 36 + 0.5);
    }
    expect(wrapLines('W'.repeat(10), 50, { size: 10, weight: 400 }, measure)).toEqual([
      'WWWWWWWWW',
      'W',
    ]);
    /* 行尾的標點照舊可以掛出去 */
    expect(wrapLines('一二三四。', 40, { size: 10, weight: 400 }, measure)).toEqual(['一二三四。']);
  });

  it('面積上限：超過 1,600 萬像素或邊長 16,000 px 時降低倍率', () => {
    expect(exportScale({ width: 800, height: 3000 }, 2)).toBe(2);
    const tall = { width: 800, height: 12_000 };
    const s = exportScale(tall, 2);
    expect(s).toBeLessThan(2);
    const size = exportSize(tall, 2);
    expect(size.width * size.height).toBeLessThanOrEqual(MAX_IMAGE_PIXELS);
    expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(MAX_IMAGE_SIDE);
    expect(exportSize({ width: 800, height: 30_000 }, 1).height).toBeLessThanOrEqual(
      MAX_IMAGE_SIDE,
    );
    expect(MAX_IMAGE_PIXELS).toBe(16_000_000);
  });

  it('imageText：用到的字不重複', () => {
    const chars = imageText(layoutImages(data(), measure));
    expect(new Set(Array.from(chars)).size).toBe(Array.from(chars).length);
    expect(chars).toContain('雷');
  });
});

/** 一張內容很滿的資料（每個程度、補充、系統的四種程度、年齡、成人向都有） */
function fullData(
  theme: ProfileData['look']['theme'],
  accent: string,
  group: 'level' | 'category',
) {
  const levels: Record<string, string> = {};
  const notes: Record<string, string> = {};
  let i = 0;
  for (const c of CATEGORIES)
    for (const t of c.topics) {
      levels[t.key] = LEVELS[i % LEVELS.length];
      notes[t.key] = `補充${i}`;
      i += 1;
    }
  return normalizeData({
    profile: {
      nickname: '阿明',
      handle: '@aming',
      tagline: '請多指教',
      age: 'adult',
      plExp: 'veteran',
      kpExp: 'new',
      expNote: '三年',
      avatarCredit: '小青',
      systems: (['main', 'often', 'played', 'want'] as const).map((level, k) => ({
        name: `系統${k}`,
        level,
        kp: k % 2 === 0,
        note: '補充',
      })),
      styles: { picked: ['story'], extra: ['慢熱'] },
      schedule: { picked: ['wdnight'] },
      scheduleNote: '11 點前',
      contacts: [{ kind: 'Discord', value: 'aming' }],
      memo: '想說的話',
    },
    show: { age: true },
    jirai: { levels, notes, adult: true, memo: '補充說明' },
    look: { theme, accent, images: 'split', group, notes: true, scale: 1 },
  });
}

/** 文字畫在哪個底色上：文字的點落在之前畫的、最後一個有填色的方塊裡（沒有時是圖的底色） */
function backgroundUnder(im: CardImage, op: Extract<DrawOp, { t: 'text' }>): string {
  const x = op.align === 'left' ? op.x + 4 : op.align === 'right' ? op.x - 4 : op.x;
  let bg = im.background;
  for (const o of im.ops) {
    if (o === op) break;
    if (o.t === 'rect' && o.fill && x >= o.x && x <= o.x + o.w && op.y >= o.y && op.y <= o.y + o.h)
      bg = o.fill;
  }
  return bg;
}

describe('每個字的對比（排版出來的每一個文字指令）', () => {
  const accents = [...ACCENT_SWATCHES, '#ffffff', '#000000', '#ffff00', '#808080', '#00ffff'];
  it('每種配色 × 主色 × 列法：小字 ≥ 4.5、大字（≥ 18.66 px 粗體或 ≥ 24 px）≥ 3；頭像的字 ≥ 3', () => {
    const fails: string[] = [];
    for (const theme of THEMES)
      for (const accent of accents)
        for (const group of ['level', 'category'] as const)
          for (const im of layoutImages(fullData(theme, accent, group), measure))
            for (const op of im.ops) {
              if (op.t === 'avatar') {
                const r = contrastRatio(op.color, op.fill);
                if (r < 3) fails.push(`${theme} ${accent} 頭像的字 ${r.toFixed(2)}`);
                continue;
              }
              if (op.t !== 'text') continue;
              const large = (op.font.size >= 18.66 && op.font.weight === 700) || op.font.size >= 24;
              const r = contrastRatio(op.color, backgroundUnder(im, op));
              if (r < (large ? 3 : 4.5))
                fails.push(`${theme} ${accent} ${group}「${op.text}」${r.toFixed(2)}`);
            }
    expect(fails.slice(0, 20)).toEqual([]);
  });
});

describe('配色', () => {
  it('每種配色 × 每個主色：標題字對卡片 ≥ 4.5、標籤上的字 ≥ 4.5、主色實心底上的字 ≥ 4.5', () => {
    for (const theme of THEMES)
      for (const accent of [...ACCENT_SWATCHES, '#ffffff', '#000000', '#ffff00']) {
        const p = paletteFor(theme, accent);
        expect(contrastRatio(p.accentText, p.card), `${theme} ${accent}`).toBeGreaterThanOrEqual(
          4.5,
        );
        expect(contrastRatio(p.ink, p.accentSoft), `${theme} ${accent}`).toBeGreaterThanOrEqual(
          4.4,
        );
        expect(contrastRatio(p.onAccent, p.accent), `${theme} ${accent}`).toBeGreaterThanOrEqual(3);
        expect(
          contrastRatio(p.accentOnSoft, p.accentSoft),
          `${theme} ${accent}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
  });

  it('程度的標籤：實心底上的字 ≥ 4.5；淡底上放卡片的字 ≥ 4.5；底色上的灰字 ≥ 4.5', () => {
    for (const theme of THEMES) {
      const p = paletteFor(theme, ACCENT_SWATCHES[0]);
      for (const lv of Object.values(p.levels)) {
        expect(contrastRatio(lv.pillText, lv.pill), theme).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(p.ink, lv.soft), theme).toBeGreaterThanOrEqual(4.5);
      }
      expect(
        contrastRatio(THEME_BASES[theme].muted, THEME_BASES[theme].card),
        theme,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(THEME_BASES[theme].muted, THEME_BASES[theme].bg),
        theme,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('mixHex：0＝原色、1＝目標色', () => {
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
});
