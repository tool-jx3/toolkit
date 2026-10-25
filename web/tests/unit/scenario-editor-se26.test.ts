/**
 * 劇本排版台 2026-10 跟進（上游 v3.10～v3.26）第一批：儲存選單（命名的版本）、每頁的紙色與花紋、
 * 匯出 HTML 的浮動視窗與「→ 附錄」「↩ 回到」、場景轉換連到標題、文字大小（pt）（規格 1.14 F261～F276、3.17、5.2）。
 * 原作 v3.26.0 的原稿 scenario-editor-upstream-v326.json 是用原作的程式產生的（origin/HEAD 5048f6d 的頁面裡
 * 以 newBlock／normalize 做出原稿、setTextPt 設文字大小、改頁面的 bg，再 JSON.stringify(S, null, 1)）。
 * 「原作的結果」的數值也是在同一個頁面裡量的（readablePaper、generalColorName、ptMigrate、sceneTargetOf）。
 */
import { describe, expect, it } from 'vitest';
import { exportHtml } from '../../src/tools/scenario-editor/exportHtml';
import { addGen, GEN_MAX, type WorkGen } from '../../src/tools/scenario-editor/library';
import { findBlock } from '../../src/tools/scenario-editor/model/blocks';
import { blankDoc, normalizeDoc } from '../../src/tools/scenario-editor/model/doc';
import {
  curPt,
  migrateLegacySizes,
  natPt,
  PT_LIST,
  ptRound,
  ptSummary,
  ptsIn,
  stepPt,
  typeEm,
} from '../../src/tools/scenario-editor/model/fontSize';
import {
  colorName,
  contrastGrade,
  inkContrast,
  PAPER_MOODS,
  PAPERS,
  PATTERNS,
  type PaperMood,
  pagePaper,
  paperFromMood,
  paperName,
  patternName,
  readablePaper,
} from '../../src/tools/scenario-editor/model/paper';
import {
  headingChoices,
  headNames,
  sceneLinks,
  sceneNames,
  sceneTargetOf,
} from '../../src/tools/scenario-editor/model/scene';
import {
  blockMarks,
  rubyHtmlWithComments,
  setMarkColor,
  setMarkPt,
  tidyMarks,
} from '../../src/tools/scenario-editor/model/text';
import type { Block, Doc } from '../../src/tools/scenario-editor/model/types';
import {
  blockHtml,
  pageStyleAttr,
  type RenderCtx,
  staticPageHtml,
} from '../../src/tools/scenario-editor/render/html';
import { PAPER_CSS } from '../../src/tools/scenario-editor/render/paperCss';
import { docFromFileText } from '../../src/tools/scenario-editor/session';
import UP326_JSON from '../e2e/fixtures/scenario-editor-upstream-v326.json';
import UP390_JSON from '../e2e/fixtures/scenario-editor-upstream-v390.json';

const UP326 = (): typeof UP326_JSON => JSON.parse(JSON.stringify(UP326_JSON));

const blk = (id: string, type: string, text = '', extra: Partial<Block> = {}) =>
  ({ id, type, cols: 2, text, ...extra }) as unknown as Block;

const docOf = (blocks: Block[], extra: Partial<Doc> = {}): Doc =>
  normalizeDoc({ title: '測試', blocks, ...extra });

const ctxOf = (d: Doc, over: Partial<RenderCtx> = {}): RenderCtx => ({
  doc: d,
  edit: false,
  pageOf: () => 1,
  total: 1,
  ...over,
});

const byId = (d: Doc, id: string): Block => {
  const f = findBlock(d, id);
  if (!f) throw new Error(id);
  return f.b;
};

/* ---------- F262：命名的版本 ---------- */

describe('存到瀏覽器：自己留的版本（F262、3.17.1）', () => {
  const autos = (n: number, t0 = 1): WorkGen[] =>
    Array.from({ length: n }, (_, i) => ({ t: t0 + i, size: 10 }));
  it('自動的版本最多 10 份，超過時刪最舊的', () => {
    const r = addGen(autos(GEN_MAX), { t: 99, size: 1 });
    expect(r.drop.map((g) => g.t)).toEqual([1]);
    expect(r.gens).toHaveLength(GEN_MAX);
    expect(r.gens.at(-1)?.t).toBe(99);
  });
  it('自己留的版本不算進 10 份，也不會被擠掉', () => {
    const named: WorkGen = { t: 0, size: 5, name: '第一章', keep: true };
    let gens: WorkGen[] = [named, ...autos(GEN_MAX)];
    const r = addGen(gens, { t: 50, size: 1 });
    expect(r.drop.map((g) => g.t)).toEqual([1]);
    expect(r.gens[0]).toBe(named);
    expect(r.gens.filter((g) => !g.keep)).toHaveLength(GEN_MAX);
    /* 自己留的可以超過 10 份 */
    gens = autos(GEN_MAX);
    for (let i = 0; i < 12; i++) gens = addGen(gens, { t: 100 + i, size: 1, keep: true }).gens;
    expect(gens).toHaveLength(GEN_MAX + 12);
  });
});

/* ---------- F264～F266：紙色與花紋 ---------- */

describe('紙的顏色（F265、3.17.3）', () => {
  it('和墨色的對比不到 7:1 時，色相不變、調亮到 7:1（與原作 v3.26 的結果相同）', () => {
    expect(readablePaper('#336699')).toBe('#88b0d7');
    expect(readablePaper('#000000')).toBe('#ababab');
    expect(readablePaper('#f7f3ea')).toBe('#f7f3ea');
    expect(readablePaper('#c08080')).toBe('#d0a0a0');
    expect(readablePaper('#7fbf7f')).toBe('#7fbf7f');
    expect(readablePaper('red')).toBe('#f7f3ea');
    for (const c of ['#336699', '#000000', '#c08080'])
      expect(inkContrast(readablePaper(c))).toBeGreaterThanOrEqual(7);
  });
  it('10 色的按鈕都在 7:1 以上；名稱是一般的色名', () => {
    expect(PAPERS).toHaveLength(10);
    for (const p of PAPERS) {
      expect(inkContrast(p.c)).toBeGreaterThanOrEqual(7);
      expect(paperName(p.c)).toBe(p.name);
    }
    /* 原作 generalColorName：青、グレー、クリーム、ピンク、緑 */
    expect(colorName('#88b0d7')).toBe('藍');
    expect(colorName('#ababab')).toBe('灰');
    expect(colorName('#f7f3ea')).toBe('奶油色');
    expect(colorName('#d0a0a0')).toBe('粉紅');
    expect(colorName('#7fbf7f')).toBe('綠');
    expect(colorName('#fbe9ee')).toBe('淡粉紅');
    expect(colorName('#ffffff')).toBe('白');
    expect(paperName('#88b0d7')).toBe('藍');
  });
  it('對比的等級', () => {
    expect([7, 6.9, 4.5, 3, 2.9].map(contrastGrade)).toEqual(['AAA', 'AA', 'AA', 'A', '—']);
  });
  it('隨機配色：氣氛的色相範圍裡的淡色，一定在 7:1 以上', () => {
    const seq = [0, 0.5, 0.999];
    for (const mood of Object.keys(PAPER_MOODS) as PaperMood[])
      for (const a of seq)
        for (const b of seq) {
          let k = 0;
          const c = paperFromMood(mood, () => [a, b][k++ % 2]);
          expect(c).toMatch(/^#[0-9a-f]{6}$/);
          expect(inkContrast(c)).toBeGreaterThanOrEqual(7);
        }
  });
  it('頁面實際的紙色：沒有指定時米白；上下色帶是淡灰', () => {
    expect(pagePaper({ preset: 'none' })).toBe('#f7f3ea');
    expect(pagePaper({ preset: 'bg-band2' })).toBe('#f1efea');
    expect(pagePaper({ preset: 'bg-band2', color: '#F8ECE9' })).toBe('#f8ece9');
    expect(pagePaper({ preset: 'none', color: 'oops' })).toBe('#f7f3ea');
  });
});

describe('花紋與頁面的樣式（F264、3.17.2）', () => {
  it('9 種可以選（素色、紙紋＋原作的 7 種）；舊原稿的花紋照樣有名稱', () => {
    expect(PATTERNS.map((p) => p.k)).toEqual([
      'none',
      'bg-paper',
      'bg-grid5',
      'bg-dot5',
      'bg-aged',
      'bg-washi',
      'bg-frame',
      'bg-corner',
      'bg-band2',
    ]);
    expect(patternName('bg-washi')).toBe('和紙');
    expect(patternName('bg-fog')).toBe('霧');
    expect(patternName('bg-grid')).toBe('方格（舊）');
  });
  it('紙面樣式有 7 種新花紋（只畫在 .pg-bg）、飾邊跟著間距', () => {
    for (const k of ['bg-grid5', 'bg-dot5', 'bg-aged', 'bg-washi', 'bg-corner', 'bg-band2'])
      expect(PAPER_CSS).toContain(`.pg-bg.${k}{`);
    expect(PAPER_CSS).toContain('.pg-bg.bg-frame::before{');
    expect(PAPER_CSS).toContain(
      'inset:calc(min(4mm,var(--mv,18mm)*.45)) calc(min(4mm,var(--mh,16mm)*.45))',
    );
    expect(PAPER_CSS).toContain('--cs:calc(min(11mm,min(var(--mv,18mm),var(--mh,16mm))*.75))');
    expect(PAPER_CSS).toContain('--bh:calc(min(5mm,var(--mv,18mm)*.3))');
    expect(PAPER_CSS).toContain('.pg.bg-band2{--paper:#f1efea}');
  });
  it('頁面的 style：紙色 --paper、飾邊的花紋帶間距；都沒有時不加（舊原稿的輸出不變）', () => {
    const d = blankDoc();
    const pg = (preset: string, color?: string) => ({
      id: 'x',
      cols: 1 as const,
      bg: { preset, img: null, fit: 'cover' as const, opa: 35, color },
    });
    expect(pageStyleAttr(pg('bg-paper'), d)).toBe('');
    expect(pageStyleAttr(pg('bg-washi', ''), d)).toBe('');
    expect(pageStyleAttr(pg('bg-washi', '#f8ece9'), d)).toBe(' style="--paper:#f8ece9;"');
    expect(pageStyleAttr(pg('bg-frame'), { padV: 10, padH: 12 })).toBe(
      ' style="--mv:10mm;--mh:12mm;"',
    );
    expect(pageStyleAttr(pg('bg-corner', '#88b0d7'), d)).toBe(
      ' style="--mv:18mm;--mh:16mm;--paper:#88b0d7;"',
    );
  });
  it('紙面的頁面、附錄頁都帶上紙色', () => {
    const d = docOf(
      [
        blk('a', 'desc', '一'),
        blk('p', 'popup', '', {
          pop: { label: 'X', body: '', only: false, blocks: [blk('pa', 'desc', '內容')] },
        } as Partial<Block>),
      ],
      {
        pages: [
          {
            id: 'q',
            cols: 1,
            bg: { preset: 'bg-frame', img: null, fit: 'cover', opa: 35, color: '#e9f0f3' },
          },
        ],
      } as Partial<Doc>,
    );
    const html = staticPageHtml(0, ['a', 'p'], ctxOf(d), new Map(d.blocks.map((b) => [b.id, b])));
    expect(html).toContain(
      '<div class="pg bg-frame" style="--mv:18mm;--mh:16mm;--paper:#e9f0f3;">',
    );
    const ex = exportHtml({ doc: d, pages: [['a', 'p']], from: 0, to: 0 });
    expect(ex).toContain(
      '<div class="pg pg-appx bg-frame" style="--mv:18mm;--mh:16mm;--paper:#e9f0f3;">',
    );
  });
});

/* ---------- F273～F275：文字大小 ---------- */

describe('文字大小：裝飾（F274、3.17.5）', () => {
  it('顏色與大小是分開的裝飾：上色不會拿掉大小，反之亦然', () => {
    const b = blk('a', 'desc', '一二三四五六');
    setMarkPt(b, 1, 4, 18);
    setMarkColor(b, 2, 5, '#a8331f');
    expect(blockMarks(b)).toEqual([
      { a: 1, b: 4, col: '', bold: false, pt: 18 },
      { a: 2, b: 5, col: '#a8331f', bold: false },
    ]);
    setMarkPt(b, 3, 6, null);
    expect(blockMarks(b)).toEqual([
      { a: 1, b: 3, col: '', bold: false, pt: 18 },
      { a: 2, b: 5, col: '#a8331f', bold: false },
    ]);
    setMarkColor(b, 0, 6, '');
    expect(blockMarks(b)).toEqual([{ a: 1, b: 3, col: '', bold: false, pt: 18 }]);
  });
  it('重疊的裝飾合在一起畫：顏色＋大小', () => {
    const b = blk('a', 'desc', '一二三四五');
    b.mk = tidyMarks([
      { a: 1, b: 3, col: '', bold: false, pt: 18 },
      { a: 2, b: 4, col: '#a8331f', bold: false },
    ]);
    expect(rubyHtmlWithComments(b)).toBe(
      '一<span style="font-size:18pt;">二</span><span style="color:#a8331f;font-size:18pt;">三</span><span style="color:#a8331f;">四</span>五',
    );
  });
  it('只有顏色的裝飾，形狀與以前相同（舊原稿不變）', () => {
    expect(tidyMarks([{ a: 0, b: 2, col: '#123456', bold: false }])).toEqual([
      { a: 0, b: 2, col: '#123456', bold: false },
    ]);
  });
});

describe('文字大小：段落（F273、F275、3.17.5）', () => {
  const d = docOf([
    blk('t', 'title', '主標題'),
    blk('h1', 'h1', '標題'),
    blk('cv', 'cover', '封面'),
    blk('n', 'note', '注釋'),
    blk('d', 'desc', '一二三四', { pt: 14 } as Partial<Block>),
    blk('tb', 'table', '', {
      tbl: {
        head: true,
        rowhead: false,
        capOn: true,
        out: '',
        outMode: 'roll',
        look: 'grid',
        name: '',
        dice: '',
        rows: 1,
        ncol: 1,
        cb: { '0,0': [blk('c', 'desc', '格')] },
      },
    } as Partial<Block>),
  ]);
  it('書式本來的大小＝所在位置的大小 × 書式的倍率（封面、版權頁、橫線也算；D17）', () => {
    expect(natPt(d, byId(d, 't'))).toBeCloseTo(26);
    expect(natPt(d, byId(d, 'h1'))).toBeCloseTo(16);
    expect(natPt(d, byId(d, 'cv'))).toBeCloseTo(29);
    expect(natPt(d, byId(d, 'n'))).toBeCloseTo(8.6);
    expect(
      typeEm({ type: 'proc', bx: { ln: 'dash', bar: false, fill: true, sm: true, col: 'aka' } }),
    ).toBe(0.95);
    expect(typeEm({ type: 'colophon' })).toBe(0.76);
    expect(typeEm({ type: 'hr' })).toBe(0.78);
    /* 儲存格：表格的大小 × 0.92（格線） */
    expect(natPt(d, byId(d, 'c'))).toBeCloseTo(9.2);
    expect(curPt(d, byId(d, 'd'))).toBe(14);
  });
  it('5～72、0.5 一階；Ctrl＋Shift＋> ／ < 依 Word 的字級清單', () => {
    expect([3, 10.26, 10.3, 100].map(ptRound)).toEqual([5, 10.5, 10.5, 72]);
    expect(PT_LIST).toEqual([8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72]);
    expect(stepPt(10, 1)).toBe(10.5);
    expect(stepPt(9.2, 1)).toBe(10);
    expect(stepPt(9.2, -1)).toBe(9);
    expect(stepPt(72, 1)).toBeNull();
    expect(stepPt(8, -1)).toBeNull();
  });
  it('大小混在一起時「—」（上游 v3.24.0）', () => {
    const b = byId(d, 'd');
    expect([...ptsIn(d, b, 0, 4)]).toEqual([14]);
    b.mk = [{ a: 1, b: 2, col: '', bold: false, pt: 20 }];
    expect([...ptsIn(d, b, 0, 4)].sort()).toEqual([14, 20]);
    expect(ptSummary(ptsIn(d, b, 0, 4))).toEqual({ value: null, mixed: true });
    expect(ptSummary(ptsIn(d, b, 1, 2))).toEqual({ value: 20, mixed: false });
    expect(ptSummary(new Set())).toEqual({ value: null, mixed: false });
    b.mk = [];
  });
  it('紙面：段落的 font-size 寫在內容上（pt）', () => {
    const html = blockHtml(byId(d, 'd'), ctxOf(d), { cols: 1, pull: 0, top: true });
    expect(html).toContain('class="b t-desc" style="font-size:14pt;"');
    expect(blockHtml(byId(d, 'h1'), ctxOf(d), { cols: 1, pull: 0, top: true })).not.toContain(
      'font-size',
    );
  });
  it('原作 v3.17～v3.20 的倍率換成當時的 pt（與原作 v3.26 讀檔的結果相同）', () => {
    const old = normalizeDoc({
      title: '舊倍率',
      base: 10,
      pages: [{ id: 'q1', bg: { preset: 'none' }, cols: 1 }],
      blocks: [
        { id: 'o1', type: 'h2', text: '標題', cols: 2, fs: 1.5 },
        {
          id: 'o2',
          type: 'desc',
          text: '一二三四五',
          cols: 2,
          mk: [{ a: 1, b: 3, sz: 2, col: '' }],
        },
        {
          id: 'o3',
          type: 'note',
          text: '注釋',
          cols: 2,
          fs: 0.75,
          mk: [{ a: 0, b: 1, sz: 1.2, col: '#a8331f' }],
        },
        { id: 'o4', type: 'desc', text: '沒改', cols: 2, fs: 1 },
      ],
    });
    expect(byId(old, 'o1').pt).toBe(19.5);
    expect(byId(old, 'o1').fs).toBeUndefined();
    expect(byId(old, 'o2').mk).toEqual([{ a: 1, b: 3, col: '', bold: false, pt: 20 }]);
    expect(byId(old, 'o3').pt).toBe(6.5);
    expect(byId(old, 'o3').mk).toEqual([{ a: 0, b: 1, col: '#a8331f', bold: false, pt: 7.5 }]);
    expect(byId(old, 'o4').pt).toBeUndefined();
    expect('fs' in byId(old, 'o4')).toBe(false);
  });
  it('倍率：彈出視窗裡＝內文字級、儲存格裡＝表格的大小 × 0.92', () => {
    const list = [
      {
        id: 'tb',
        type: 'table',
        fs: 2,
        tbl: {
          look: 'grid',
          cb: {
            '0,0': [{ id: 'c', type: 'desc', text: '格', mk: [{ a: 0, b: 1, sz: 1.5, col: '' }] }],
          },
        },
      },
      { id: 'p', type: 'popup', pop: { blocks: [{ id: 'pa', type: 'h1', fs: 1.5 }] } },
    ] as unknown as Block[];
    migrateLegacySizes(list, 10, 10);
    expect(list[0].pt).toBe(20);
    expect(list[0].tbl?.cb['0,0'][0].mk).toEqual([{ a: 0, b: 1, col: '', bold: false, pt: 27.5 }]);
    expect(list[1].pop?.blocks?.[0].pt).toBe(24);
  });
});

/* ---------- F270、F271：場景轉換 ---------- */

describe('場景轉換連到標題（F270、F271、3.17.4）', () => {
  it('目的地名稱：日文的寫法照原作、另外認繁中的寫法（D14）', () => {
    expect(sceneNames('書房へ移行')).toEqual(['書房']);
    expect(sceneNames('→ 書斎へ移動する。')).toEqual(['書斎']);
    expect(sceneNames('シーン3『書斎』へ')).toEqual(['シーン3『書斎』', '書斎']);
    expect(sceneNames('シーン移行：大廳')).toEqual(['大廳']);
    expect(sceneNames('→ 前往大廳')).toEqual(['大廳']);
    expect(sceneNames('移動到「地下室」')).toEqual(['「地下室」', '地下室']);
    expect(sceneNames('場景 3：書房')).toEqual(['場景 3：書房', '書房']);
    expect(sceneNames('｜書房《しょさい》へ')).toEqual(['書房']);
    expect(headNames('場景 2「大廳」')).toEqual(['場景 2「大廳」', '大廳']);
  });
  it('與原作 v3.26 相同：完全相同才連、之後最近的優先、「跳到的標題」優先', () => {
    const d = normalizeDoc(UP326());
    const t = (id: string) => sceneTargetOf(d, byId(d, id))?.id ?? null;
    /* 原作：sc1 null（不認繁中）、sc2 h1a、sc3 h1b、sc4（跳到的標題「大廳」）h1b */
    expect(t('sc2')).toBe('h1a');
    expect(t('sc3')).toBe('h1b');
    expect(t('sc4')).toBe('h1b');
    expect(t('sc1')).toBe('h1b');
    const e = docOf([
      blk('a', 'h2', '書房'),
      blk('s', 'scene', '前往書房'),
      blk('b', 'h3', '書房'),
      blk('c', 'h1', '書房的抽屜'),
      blk('x', 'scene', '前往廚房'),
    ]);
    expect(sceneTargetOf(e, byId(e, 's'))?.id).toBe('b');
    expect(sceneTargetOf(e, byId(e, 'x'))).toBeNull();
    byId(e, 'x').jump = '書房的抽屜';
    expect(sceneTargetOf(e, byId(e, 'x'))?.id).toBe('c');
    expect(headingChoices(e)).toEqual(['書房', '書房的抽屜']);
    expect([...sceneLinks(e, (id) => id !== 'b')]).toEqual([['x', 'c']]);
  });
});

/* ---------- F268、F269：匯出 HTML 的浮動視窗與列印用的連結 ---------- */

describe('匯出 HTML：浮動視窗、「→ 附錄」「↩ 回到」、場景轉換（F268～F270、3.9）', () => {
  const pop = (id: string, label: string, only = false) =>
    blk(id, 'popup', '', {
      pop: { label, body: '', only, blocks: [blk(`${id}c`, 'desc', `${label}的內容`)] },
    } as Partial<Block>);
  const d = docOf(
    [
      blk('h', 'h1', '書房'),
      blk('d', 'desc', '本文\n＠證詞'),
      pop('p1', '抽屜'),
      blk('s', 'scene', '前往大廳'),
      blk('br', 'break'),
      blk('h2', 'h1', '大廳'),
      blk('d2', 'desc', '＠抽屜'),
      pop('p2', '證詞', true),
      blk('s2', 'scene', '回到書房'),
    ],
    { foot: { num: true, text: '', from: 0 } },
  );
  const pages = [
    ['h', 'd', 'p1', 's'],
    ['h2', 'd2', 's2'],
  ];
  it('按鈕後面的「→ 附錄」：連到附錄、依彈出視窗編號；附錄的每一節有「↩ 回到」（頁碼照紙面）', () => {
    const html = exportHtml({ doc: d, pages, from: 0, to: 1 });
    expect(html).toContain(
      '<button type="button" class="pop-btn has-plink" data-popopen="p2"><span class="pop-ic">▤ </span>證詞</button><a class="pop-plink" href="#apxp2" id="prp2-1">→ 附錄「證詞」</a>',
    );
    expect(html).toContain('id="prp1-1">→ 附錄「抽屜」</a>');
    expect(html).toContain('id="prp1-2">→ 附錄「抽屜」</a>');
    expect(html).toContain(
      '<div class="b t-h2" id="apxp1">抽屜</div><div class="ap-backs"><a class="ap-back" href="#prp1-1">↩ 回到 P.0</a><a class="ap-back" href="#prp1-2">↩ 回到 P.1</a></div>',
    );
    expect(html).toContain(
      '<div class="b t-h2" id="apxp2">證詞</div><div class="ap-backs"><a class="ap-back" href="#prp2-1">↩ 回到 P.0</a></div>',
    );
    /* 浮動視窗的內容裡沒有連結 */
    const pw = html.slice(html.indexOf('<div class="popbody"'));
    expect(pw).not.toContain('pop-plink');
    expect(html).toContain('<div class="popbody" id="popp1" hidden><div class="pw-t">抽屜</div>');
    expect(html).not.toContain('popOv');
  });
  it('場景轉換連到範圍內的標題；範圍外的不連', () => {
    const all = exportHtml({ doc: d, pages, from: 0, to: 1 });
    expect(all).toContain('<a class="scene-link" href="#bh2">前往大廳</a>');
    expect(all).toContain('<a class="scene-link" href="#bh">回到書房</a>');
    expect(all).toContain('<div id="bh2" class="b t-h1"');
    const one = exportHtml({ doc: d, pages, from: 0, to: 0 });
    expect(one).not.toContain('scene-link" href="#bh2"');
  });
  it('不顯示頁碼時從 P.1 算', () => {
    const e = { ...d, foot: { num: false, text: '', from: 5 } };
    expect(exportHtml({ doc: e, pages, from: 0, to: 1 })).toContain('↩ 回到 P.1</a>');
  });
  it('紙面樣式：畫面上看不到連結，列印與模擬列印（.pv-print）時按鈕換成連結', () => {
    expect(PAPER_CSS).toContain('.pop-plink,.ap-backs{display:none}');
    expect(PAPER_CSS).toContain('.pv-print .pop-btn.has-plink{display:none!important}');
    expect(PAPER_CSS).toContain('@media print{.pop-btn.has-plink{display:none!important}');
  });
  it('編輯畫面的紙面沒有連結', () => {
    const h = blockHtml(byId(d, 'p1'), ctxOf(d, { edit: true }), { cols: 1, pull: 0, top: false });
    expect(h).not.toContain('pop-plink');
    expect(h).toContain('class="pop-btn" data-popopen="p1"');
  });
});

/* ---------- F276：舊原稿與原作 v3.26 的原稿 ---------- */

describe('讀入：舊原稿照常、原作 v3.26 的紙色與文字大小（F276、3.1.3）', () => {
  it('原作 v3.26 的原稿：紙色、花紋、段落與文字的大小、跳到的標題', () => {
    const d = normalizeDoc(UP326());
    expect(d.pages.map((p) => [p.bg.preset, p.bg.color])).toEqual([
      ['bg-washi', '#f8ece9'],
      ['bg-frame', ''],
      ['bg-band2', ''],
      ['bg-corner', '#88b0d7'],
    ]);
    expect(byId(d, 'd2').pt).toBe(14);
    expect(byId(d, 'd2').mk).toEqual([
      { a: 2, b: 4, col: '', bold: false, pt: 18 },
      { a: 2, b: 4, col: '#a8331f', bold: false },
    ]);
    expect(byId(d, 'h2a').pt).toBe(20);
    expect(byId(d, 'd3').pt).toBe(13);
    expect(byId(d, 'h1a').pt).toBeUndefined();
    expect(byId(d, 'sc4').jump).toBe('大廳');
  });
  it('v3.9 時的原稿（原作與本站）沒有新欄位，讀進來不多出東西', () => {
    const d = normalizeDoc(JSON.parse(JSON.stringify(UP390_JSON)));
    for (const p of d.pages) expect('color' in p.bg).toBe(false);
    const walk = (l: Block[]): void => {
      for (const b of l) {
        expect(b.pt).toBeUndefined();
        expect(b.jump).toBeUndefined();
        for (const m of b.mk ?? []) expect(m.pt).toBeUndefined();
      }
    };
    walk(d.blocks);
    const file = JSON.stringify({
      format: 'trpg-toolkit-project',
      tool: 'scenario-editor',
      version: 2,
      savedAt: '2026-10-19T00:00:00.000Z',
      data: { ...blankDoc(), title: '版本 2' },
    });
    const e = docFromFileText(file);
    expect(e.title).toBe('版本 2');
    expect(e.pages[0].bg).toEqual({ preset: 'bg-paper', img: null, fit: 'cover', opa: 35 });
  });
  it('紙色不是 #rrggbb 的當成沒有指定；段落的大小夾在 5～72', () => {
    const d = normalizeDoc({
      title: 'x',
      pages: [{ id: 'a', bg: { preset: 'none', color: 'blue' }, cols: 1 }],
      blocks: [
        { id: 'b', type: 'desc', text: 'x', pt: 100 },
        { id: 'c', type: 'desc', text: 'x', pt: 0 },
      ],
    });
    expect(d.pages[0].bg.color).toBe('');
    expect(byId(d, 'b').pt).toBe(72);
    expect('pt' in byId(d, 'c')).toBe(false);
  });
});
