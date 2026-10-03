/**
 * 劇本排版台的 PDF（F233）用到的共用模組：TrueType 子集（core/fonts/subset）、Google Fonts 的子集下載（core/fonts）、
 * 補字（core/paged/pdf 的 googleSubsetFallback），以及子集嵌入 PDF 後字形完整（pdf-lib 內建子集的缺字問題）。
 * 用容器裡的系統字型（IPAGothic、DejaVu、文泉驛正黑）；沒有這些字型的環境略過。
 */
import * as fontkitModule from '@pdf-lib/fontkit';
import { PDFDocument } from 'pdf-lib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchGoogleFontSubset, fontUrlsFromCss } from '../../src/core/fonts';
import { pathToContours, type SubsetSourceFont, ttfSubset } from '../../src/core/fonts/subset';
import {
  googleSubsetFallback,
  PdfFontError,
  SUBSET_FALLBACK,
  SUBSET_FONT_ERROR,
} from '../../src/core/paged/pdf';
import { pdfPageTexts } from '../helpers/pdf';

const fontkit = ((fontkitModule as unknown as { default?: typeof fontkitModule }).default ??
  fontkitModule) as typeof fontkitModule;

/* 單元測試的型別沒有 Node（tsconfig.json），讀系統字型檔的兩個函式自己標型別 */
const FS = 'node:fs';
const { existsSync, readFileSync } = (await import(/* @vite-ignore */ FS)) as {
  existsSync: (p: string) => boolean;
  readFileSync: (p: string) => Uint8Array;
};

const IPAG = '/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf';
const DEJAVU = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const DEJAVU_SERIF = '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf';
const WQY = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc';
const haveFonts = [IPAG, DEJAVU, DEJAVU_SERIF, WQY].every((f) => existsSync(f));

type Fk = SubsetSourceFont & {
  numGlyphs: number;
  characterSet: number[];
  head: { indexToLocFormat: number };
};
function load(file: string): Fk {
  const raw = fontkit.create(readFileSync(file)) as unknown as { fonts?: unknown[] };
  return (raw.fonts?.[0] ?? raw) as Fk;
}
const fromBytes = (b: Uint8Array) => fontkit.create(b) as unknown as Fk;
const cps = (s: string) => [...s].map((c) => c.codePointAt(0) ?? 0);
type Cmd = { command: string; args: number[] };
const commands = (f: SubsetSourceFont, ch: string) =>
  f.glyphForCodePoint(ch.codePointAt(0) ?? 0).path.commands as Cmd[];
const round = (c: readonly Cmd[]) =>
  c.map((x) => `${x.command}:${x.args.map((v) => Math.round(v)).join(',')}`);

describe('pathToContours', () => {
  it('moveTo／lineTo／二次曲線 → 輪廓（座標取整數、去掉回到起點的重複點）', () => {
    expect(
      pathToContours([
        { command: 'moveTo', args: [0.4, 0] },
        { command: 'lineTo', args: [100, 0] },
        { command: 'quadraticCurveTo', args: [150.6, 50, 100, 100] },
        { command: 'lineTo', args: [0, 0] },
        { command: 'closePath', args: [] },
      ]),
    ).toEqual([
      [
        { x: 0, y: 0, on: true },
        { x: 100, y: 0, on: true },
        { x: 151, y: 50, on: false },
        { x: 100, y: 100, on: true },
      ],
    ]);
  });
  it('三次曲線（CFF 外框）不支援', () => {
    expect(() =>
      pathToContours([
        { command: 'moveTo', args: [0, 0] },
        { command: 'bezierCurveTo', args: [1, 1, 2, 2, 3, 3] },
      ]),
    ).toThrow();
  });
});

describe.runIf(haveFonts)('ttfSubset（TrueType 子集）', () => {
  it('只收用到的字：外框、寬度與原字型相同；loca 長格式；沒有的字略過', () => {
    const src = load(IPAG);
    const text = '検覚撃渉歳霧中洋館AB「」';
    const sub = fromBytes(ttfSubset(src, [...cps(text), 0x1f600]));
    expect(sub.numGlyphs).toBe(new Set(cps(text)).size + 1);
    expect(sub.head.indexToLocFormat).toBe(1);
    for (const ch of text) {
      const cp = ch.codePointAt(0) ?? 0;
      expect(sub.hasGlyphForCodePoint(cp), ch).toBe(true);
      expect(sub.glyphForCodePoint(cp).advanceWidth, ch).toBe(
        src.glyphForCodePoint(cp).advanceWidth,
      );
      expect(round(commands(sub, ch)), ch).toEqual(round(commands(src, ch)));
    }
    expect(sub.hasGlyphForCodePoint(0x1f600)).toBe(false);
    expect(sub.hasGlyphForCodePoint(cps('人')[0])).toBe(false);
    expect(sub.unitsPerEm).toBe(src.unitsPerEm);
    expect(sub.hhea.ascent).toBe(src.hhea.ascent);
  });

  it('整個嵌入 PDF 後，每個字形都有外框、能還原文字（pdf-lib 內建子集在 CJK 字型會缺字）', async () => {
    const src = load(WQY);
    const text = '風見惺技能能力等級判定知力霧中洋館鳴感ABCxyz（）「」、。';
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit as unknown as Parameters<PDFDocument['registerFontkit']>[0]);
    const font = await doc.embedFont(ttfSubset(src, cps(text)), { subset: false });
    const page = doc.addPage([600, 200]);
    [...text].forEach((ch, i) => {
      page.drawText(ch, { x: 10 + i * 14, y: 100, size: 12, font });
    });
    const back = await PDFDocument.load(await doc.save());
    const [p] = pdfPageTexts(back);
    expect(p.text).toBe(text);
    expect(p.blank).toEqual([]);
  });
});

describe('Google Fonts 的子集下載', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fontUrlsFromCss：依出現順序、不重複，引號可有可無', () => {
    expect(
      fontUrlsFromCss(
        "@font-face{src:url(https://a/1) format('woff2')}@font-face{src:url('https://a/2')}@font-face{src:url(\"https://a/1\")}",
      ),
    ).toEqual(['https://a/1', 'https://a/2']);
  });

  it('fetchGoogleFontSubset：最接近的字重、text= 分批、目錄外的字型不指定字重、錯誤時丟出', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (u: string) => {
        urls.push(u);
        if (u.includes('css2'))
          return new Response(`@font-face{src:url(https://f/${urls.length})}`, { status: 200 });
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      }),
    );
    const files = await fetchGoogleFontSubset('Noto Serif JP', 650, '検覚撃', { maxChars: 2 });
    expect(files).toHaveLength(2);
    expect(urls[0]).toBe(
      `https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@600&display=swap&text=${encodeURIComponent('検覚')}`,
    );
    expect(urls[2]).toContain(`text=${encodeURIComponent('撃')}`);
    urls.length = 0;
    await fetchGoogleFontSubset('Noto Sans Symbols 2', 700, '☑');
    expect(urls[0]).toBe(
      `https://fonts.googleapis.com/css2?family=Noto+Sans+Symbols+2&display=swap&text=${encodeURIComponent('☑')}`,
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 })),
    );
    await expect(fetchGoogleFontSubset('Noto Serif JP', 400, '検')).rejects.toThrow('HTTP 500');
  });
});

describe.runIf(haveFonts)('googleSubsetFallback（補字）', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** 假的 Google Fonts：日文字型只有漢字、符號字型只有 ☑☐、Noto Sans 只有 ‣ */
  function fakeGoogle(asked: string[]) {
    const fonts: Record<string, [string, string]> = {
      'Noto Serif JP': [IPAG, '検覚撃渉歳'],
      'Noto Sans JP': [IPAG, '検覚撃渉歳'],
      'Noto Sans Symbols 2': [DEJAVU, '☑☐'],
      'Noto Sans': [DEJAVU_SERIF, '‣'],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (u: string) => {
        const url = new URL(u);
        if (url.host === 'fonts.googleapis.com') {
          const fam = (url.searchParams.get('family') ?? '').replace(/:.*/, '');
          const text = url.searchParams.get('text') ?? '';
          asked.push(`${fam}|${text}`);
          return new Response(
            `@font-face{src:url(https://fonts.gstatic.com/x?fam=${encodeURIComponent(fam)}&text=${encodeURIComponent(text)})}`,
          );
        }
        const [file, has] = fonts[url.searchParams.get('fam') ?? ''];
        const text = [...(url.searchParams.get('text') ?? '')].filter((c) => has.includes(c));
        return new Response(new Blob([ttfSubset(load(file), cps(text.join(''))).slice()]));
      }),
    );
  }

  it('依序試：前一個字型沒有的字才向下一個字型要；都沒有的字略過', async () => {
    const asked: string[] = [];
    fakeGoogle(asked);
    const srcs = await googleSubsetFallback()({
      text: '検☑‣😀',
      generic: 'serif',
      weight: 700,
    });
    expect(asked).toEqual(['Noto Serif JP|検☑‣😀', 'Noto Sans Symbols 2|☑‣😀', 'Noto Sans|‣😀']);
    expect(srcs.map((s) => [s.family, s.weight])).toEqual([
      ['Noto Serif JP', 700],
      ['Noto Sans Symbols 2', 700],
      ['Noto Sans', 700],
    ]);
    const got = await Promise.all(srcs.map(async (s) => fromBytes(await s.load())));
    expect(got[0].hasGlyphForCodePoint(cps('検')[0])).toBe(true);
    expect(got[1].hasGlyphForCodePoint(cps('☑')[0])).toBe(true);
    expect(got[2].hasGlyphForCodePoint(cps('‣')[0])).toBe(true);
  });

  it('黑體類用 Noto Sans JP；日文字型就收齊時不再下載別的字型', async () => {
    const asked: string[] = [];
    fakeGoogle(asked);
    expect(SUBSET_FALLBACK.sans[0]).toBe('Noto Sans JP');
    const srcs = await googleSubsetFallback()({ text: '渉歳', generic: 'sans', weight: 400 });
    expect(asked).toEqual(['Noto Sans JP|渉歳']);
    expect(srcs).toHaveLength(1);
  });

  it('下載失敗時丟 PdfFontError（說明原因）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const p = googleSubsetFallback()({ text: '検', generic: 'serif', weight: 400 });
    await expect(p).rejects.toBeInstanceOf(PdfFontError);
    await expect(p).rejects.toThrow(SUBSET_FONT_ERROR);
  });
});
