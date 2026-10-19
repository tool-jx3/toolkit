/**
 * 劇本排版台 2026-10（上游 v3.8.0～v3.9.0）：情報區塊、手冊、變數（規格 1.13 F250～F260、3.9、3.16、5.1）。
 * 原作 v3.9.0 的原稿 scenario-editor-upstream-v390.json 是用原作的程式產生的（原作 origin/HEAD 298d6f4 的頁面裡
 * 以 newBlock／ensureHo／normalize 做出原稿，再 JSON.stringify(S, null, 1)，與原作「儲存」下載的內容相同；
 * 縮排由 Biome 重排，資料不變）。
 */
import { describe, expect, it } from 'vitest';
import {
  exportHtml,
  VARS_KEY_PREFIX,
  viewScript,
} from '../../src/tools/scenario-editor/exportHtml';
import { pageTitleOf } from '../../src/tools/scenario-editor/layout';
import { allBlocks, newBlock, space, TYPES } from '../../src/tools/scenario-editor/model/blocks';
import { copyBodyText, docCharCount } from '../../src/tools/scenario-editor/model/count';
import {
  blankDoc,
  DOC_FILE_VERSION,
  keepNotEmpty,
  makeBlock,
  normalizeDoc,
  renewIds,
} from '../../src/tools/scenario-editor/model/doc';
import { blockLabel } from '../../src/tools/scenario-editor/model/proc';
import { RICH_TYPES } from '../../src/tools/scenario-editor/model/rich';
import type { Block, Doc } from '../../src/tools/scenario-editor/model/types';
import {
  blockStrings,
  cleanVars,
  freshHandoutNumbers,
  isVarName,
  varCandidates,
  varList,
  varPlain,
  varView,
  wrapVarsHtml,
} from '../../src/tools/scenario-editor/model/vars';
import {
  blockHtml,
  footHtml,
  type RenderCtx,
  staticPageHtml,
} from '../../src/tools/scenario-editor/render/html';
import { PAPER_CSS } from '../../src/tools/scenario-editor/render/paperCss';
import { docFromFileText } from '../../src/tools/scenario-editor/session';
import {
  holdStatus,
  releaseStatus,
  say,
  statusHeld,
  ui,
} from '../../src/tools/scenario-editor/store';
import UPSTREAM_JSON from '../e2e/fixtures/scenario-editor-upstream-v390.json';

/** 每次都是新的複本（normalizeDoc 會整理巢狀的物件） */
const UPSTREAM = (): typeof UPSTREAM_JSON => JSON.parse(JSON.stringify(UPSTREAM_JSON));

const blk = (id: string, type: string, text = '', extra: Partial<Block> = {}) =>
  ({ id, type, cols: 2, text, ...extra }) as unknown as Block;

const doc = (blocks: Block[], vars: Doc['vars'] = []): Doc =>
  normalizeDoc({ title: '測試', blocks, vars });

const ctxOf = (d: Doc, over: Partial<RenderCtx> = {}): RenderCtx => ({
  doc: d,
  edit: true,
  pageOf: () => 1,
  total: 1,
  ...over,
});

/** 原作 v3.9.0 的做法（D8 的對照）：整份段落資料轉成 JSON 字串（略過 img、data）再找 */
function upstreamScan(d: Doc): { ho: string[]; cand: string[] } {
  const all = JSON.stringify(d.blocks, (k, v) => (k === 'img' || k === 'data' ? undefined : v));
  const ho = [...all.matchAll(/\{(HO\d{1,3})\}/g)].map((m) => m[1]);
  const reg = new Set(varList(d).map((v) => v.n));
  const cand: string[] = [];
  for (const m of all.matchAll(/\{([A-Za-z0-9_぀-ヿ一-鿿]{1,16})\}/g))
    if (!reg.has(m[1]) && !['title', 'page', 'total'].includes(m[1]) && !cand.includes(m[1]))
      cand.push(m[1]);
  return { ho: [...new Set(ho)], cand };
}

describe('書式（F250、F252、3.2.4）', () => {
  it('情報區塊 L、手冊 Y 在「插入」組的最後；欄內；間距 3／3、4／4', () => {
    const ins = TYPES.filter((t) => t.group === 'insert').map((t) => `${t.k}:${t.key}`);
    expect(ins.slice(-2)).toEqual(['info:L', 'handout:Y']);
    expect(newBlock('info').cols).toBe(2);
    expect(newBlock('handout').cols).toBe(2);
    expect(space('info')).toEqual({ t: 3, b: 3 });
    expect(space('handout')).toEqual({ t: 4, b: 4 });
    expect(PAPER_CSS).toContain('.bp-info{padding-top:3mm}');
    expect(PAPER_CSS).toContain('.t-handout{margin-bottom:4mm}');
    expect(RICH_TYPES).toEqual(expect.arrayContaining(['info', 'handout']));
  });
  it('情報區塊的標題語：沒寫＝「情報」、空字串＝不顯示；規則框照舊', () => {
    expect(blockLabel(blk('a', 'info'))).toBe('情報');
    expect(blockLabel(blk('a', 'info', '', { lb: '' }))).toBe('');
    expect(blockLabel(blk('a', 'proc'))).toBe('技能檢定');
  });
  it('新的手冊自動編號：還沒用的最小 HO 編號', () => {
    const d = blankDoc();
    d.blocks.push(makeBlock('handout'), makeBlock('handout'));
    keepNotEmpty(d);
    expect(d.blocks.filter((b) => b.type === 'handout').map((b) => b.ho?.no)).toEqual([
      'HO1',
      'HO2',
    ]);
    const h3 = makeBlock('handout');
    d.blocks.splice(0, 0, h3);
    keepNotEmpty(d);
    expect(h3.ho?.no).toBe('HO3');
  });
  it('編號不合規則的自動編號；重複的不改（同原作）', () => {
    const d = doc([
      blk('a', 'handout', '', { ho: { no: 'HO1', ttl: '' } }),
      blk('b', 'handout', '', { ho: { no: 'HO1', ttl: '' } }),
      blk('c', 'handout', '', { ho: { no: 'page', ttl: '' } }),
      blk('d', 'handout', '', { ho: { no: '有 空白', ttl: '' } }),
      blk('e', 'handout'),
    ]);
    expect(d.blocks.map((b) => b.ho?.no)).toEqual(['HO1', 'HO1', 'HO2', 'HO3', 'HO4']);
  });
  it('複製、貼上的手冊：編號重複就換新的（D3）', () => {
    const d = doc([blk('a', 'handout', '', { ho: { no: 'HO1', ttl: '常客' } })]);
    const c = renewIds(JSON.parse(JSON.stringify(d.blocks[0])));
    d.blocks.push(c);
    freshHandoutNumbers(d, [c]);
    expect(c.ho).toEqual({ no: 'HO2', ttl: '常客' });
    expect(d.blocks[0].ho?.no).toBe('HO1');
    /* 貼到沒有 HO1 的原稿：保留 */
    const e = doc([blk('x', 'desc', 'a')]);
    const p1 = renewIds(JSON.parse(JSON.stringify(d.blocks[0])));
    const p2 = renewIds(JSON.parse(JSON.stringify(d.blocks[0])));
    e.blocks.push(p1, p2);
    freshHandoutNumbers(e, [p1, p2]);
    expect([p1.ho?.no, p2.ho?.no]).toEqual(['HO1', 'HO2']);
    /* 彈出視窗裡的手冊也算 */
    const pop = blk('p', 'popup', '', {
      pop: {
        label: 'x',
        body: '',
        only: false,
        blocks: [blk('q', 'handout', '', { ho: { no: 'HO1', ttl: '' } })],
      },
    });
    const pc = renewIds(JSON.parse(JSON.stringify(pop)));
    d.blocks.push(pc);
    freshHandoutNumbers(d, [pc]);
    expect(pc.pop?.blocks?.[0].ho?.no).toBe('HO3');
  });
});

describe('讀入原作 v3.8 以後的原稿（F260、3.1.3）', () => {
  it('原作 v3.9.0 的原稿（原作的程式產生）：書式、標題語、編號、題名、變數都保留', () => {
    const d = normalizeDoc(UPSTREAM());
    expect(d.title).toBe('霧之館（變數）');
    expect(d.blocks.map((b) => b.type)).toEqual([
      'h1',
      'desc',
      'info',
      'info',
      'info',
      'handout',
      'handout',
      'popup',
    ]);
    expect(d.blocks.slice(2, 5).map((b) => blockLabel(b))).toEqual(['情報', '情報：信', '']);
    expect(d.blocks[5].ho).toEqual({ no: 'HO1', ttl: '古書店的常客', rec: '', def: '' });
    expect(d.blocks[6].ho?.no).toBe('HO2');
    expect(d.blocks[7].pop?.blocks?.[0].type).toBe('info');
    expect(d.vars).toEqual([
      { n: 'KP', def: '守秘人', note: 'KP 的名字' },
      { n: 'title', def: 'x', note: '保留字（不算）' },
    ]);
    /* 內文一字不少 */
    for (const [i, b] of UPSTREAM().blocks.entries()) expect(d.blocks[i].text).toBe(b.text);
  });
  it('存檔後再讀：資料不變（本站的專案檔版本 2）', () => {
    const d = normalizeDoc(UPSTREAM());
    expect(DOC_FILE_VERSION).toBe(2);
    const file = JSON.stringify({
      format: 'trpg-toolkit-project',
      tool: 'scenario-editor',
      version: DOC_FILE_VERSION,
      savedAt: '2026-10-19T00:00:00.000Z',
      data: d,
    });
    const again = docFromFileText(file);
    expect(again).toEqual(d);
    /* 原作的原稿檔直接開也一樣 */
    expect(docFromFileText(JSON.stringify(UPSTREAM()))).toEqual(d);
  });
  it('原作 v3.8.0 的手冊（推薦技能、還沒填時的顯示、PC 名稱欄）：資料保留、def 是預設值（D2）', () => {
    const v380 = {
      title: 'v3.8.0',
      vars: [{ n: ' KP ', def: '', note: '' }, { n: '' }, { n: 'KP', def: '重複' }],
      blocks: [
        {
          id: 'h',
          type: 'handout',
          text: '本文',
          ho: { no: 'HO1', ttl: '常客', rec: '〈圖書館〉', def: '探索者A', pc: true },
        },
      ],
    };
    const d = normalizeDoc(v380);
    expect(d.blocks[0].ho).toEqual({
      no: 'HO1',
      ttl: '常客',
      rec: '〈圖書館〉',
      def: '探索者A',
      pc: true,
    });
    expect(d.vars).toEqual([{ n: 'KP', def: '', note: '' }]);
    expect(varList(d).map((v) => [v.n, v.def])).toEqual([
      ['HO1', '探索者A'],
      ['KP', ''],
    ]);
    const again = normalizeDoc(JSON.parse(JSON.stringify(d)));
    expect(again.blocks[0].ho).toEqual(d.blocks[0].ho);
    /* 推薦技能不顯示（同原作 v3.9.0） */
    const html = blockHtml(d.blocks[0], ctxOf(d), { cols: 1, pull: 0, top: true });
    expect(html).not.toContain('〈圖書館〉');
    expect(html).toContain('<span class="ho-n">HO1</span><span class="ho-t">常客</span>');
  });
  it('2026-10 以前的原稿（專案檔版本 1）照常讀：沒有變數', () => {
    const v1 = JSON.stringify({
      format: 'trpg-toolkit-project',
      tool: 'scenario-editor',
      version: 1,
      savedAt: '2026-10-01T00:00:00.000Z',
      data: { title: '舊', blocks: [{ type: 'desc', text: '{HO1}' }] },
    });
    const d = docFromFileText(v1);
    expect(d.vars).toEqual([]);
    expect(d.blocks[0].text).toBe('{HO1}');
    expect(cleanVars('x')).toEqual([]);
    expect(normalizeDoc({ blocks: [] }).vars).toEqual([]);
  });
});

describe('變數清單（F254、F256、3.16）', () => {
  it('名稱的規則', () => {
    for (const n of ['HO1', 'KP', 'pc_2', '守秘人', 'きみ', 'カナ'])
      expect(isVarName(n), n).toBe(true);
    for (const n of ['', 'title', 'page', 'total', 'a b', 'a'.repeat(17), 'Ｋ', '{x}', '-'])
      expect(isVarName(n), n).toBe(false);
  });
  it('手冊 → 登錄的 → 原稿裡寫到的 HO＋數字；HO 依數字排在前面；同名一次；保留字與不合規則的不算', () => {
    const d = doc(
      [
        blk('a', 'desc', '{HO10} {HO3} {KP} {SAN}'),
        blk('b', 'handout', '', { ho: { no: 'HO2', ttl: '常客' } }),
        blk('c', 'handout', '', { ho: { no: 'PC', ttl: '' } }),
      ],
      [
        { n: 'KP', def: '守秘人', note: 'GM' },
        { n: 'HO2', def: '登錄的', note: '' },
        { n: 'page', def: '', note: '' },
        { n: 'NPC1', def: '', note: '' },
      ],
    );
    expect(varList(d).map((v) => `${v.n}:${v.src}:${v.def}`)).toEqual([
      'HO2:ho:',
      'HO3:auto:',
      'HO10:auto:',
      'PC:ho:',
      'KP:reg:守秘人',
      'NPC1:reg:',
    ]);
    expect(varList(d)[0].note).toBe('手冊「常客」的 PC');
    expect(varCandidates(d)).toEqual(['SAN']);
  });
  it('看所有文字欄位（巢狀的段落、表格、NPC 卡、彈出視窗），略過 data URL；與原作的做法結果相同（D8）', () => {
    const d = normalizeDoc({
      title: 't',
      blocks: [
        { id: 'i', type: 'image', img: 'data:image/png;base64,{HO9}{IMG}', cap: '{CAP}' },
        {
          id: 't',
          type: 'table',
          tbl: {
            name: '{TBL}',
            cells: [
              ['項目', '內容'],
              ['1', '{HO4}與{CELL}'],
            ],
          },
        },
        { id: 'n', type: 'npc', npc: { sys: 'coc', name: '{NPC}', memo: '{HO5}' } },
        {
          id: 'p',
          type: 'popup',
          pop: { label: '{POP}', blocks: [{ id: 'q', type: 'info', text: '{INNER}' }] },
        },
        { id: 'f', type: 'desc', text: '{title}{page}{total}' },
      ],
    });
    expect(varList(d).map((v) => v.n)).toEqual(['HO4', 'HO5']);
    expect(varCandidates(d)).toEqual(['CAP', 'TBL', 'CELL', 'NPC', 'POP', 'INNER']);
    const up = upstreamScan(d);
    expect(new Set(varList(d).map((v) => v.n))).toEqual(new Set(up.ho));
    expect(new Set(varCandidates(d))).toEqual(new Set(up.cand));
    expect(blockStrings(d).some((s) => s.startsWith('data:'))).toBe(false);
  });
  it('原作 v3.9.0 的原稿：變數與沒登錄的名稱', () => {
    const d = normalizeDoc(UPSTREAM());
    expect(varList(d).map((v) => `${v.n}:${v.src}`)).toEqual([
      'HO1:ho',
      'HO2:ho',
      'HO3:auto',
      'KP:reg',
    ]);
    expect(varCandidates(d)).toEqual(['SAN', '場所']);
    const up = upstreamScan(d);
    expect(new Set(varCandidates(d))).toEqual(new Set(up.cand));
  });
});

describe('顯示預設值（F257）', () => {
  const d = doc(
    [
      blk('h', 'h1', '{HO1}的夢'),
      blk('a', 'desc', '{HO1}看見{KP}；{SAN}照舊。'),
      blk('i', 'info', '｜古書《こしょ》給{HO1}\n- 條列{KP}\n\n'),
      blk('o', 'handout', '本文{HO1}', { ho: { no: 'HO1', ttl: '常客', def: '探索者' } }),
    ],
    [{ n: 'KP', def: '<守秘人>', note: '' }],
  );
  const view = varView(d);
  it('包成 tvar（預設值或名稱；跳脫），沒登錄的照原樣', () => {
    const html = blockHtml(d.blocks[1], ctxOf(d), { cols: 1, pull: 0, top: false });
    expect(html).toContain(
      '<span class="tvar unset" data-v="HO1">探索者</span>看見<span class="tvar unset" data-v="KP">&lt;守秘人&gt;</span>；{SAN}照舊。',
    );
  });
  it('只包文字：屬性值、SVG、script、style 不動；重複呼叫結果相同', () => {
    const src =
      '<a title="{HO1}" data-t="{KP}">{HO1}</a><svg><text>{HO1}</text></svg><script>{KP}</script><style>.x{KP}</style>{KP}';
    const out = wrapVarsHtml(src, view);
    expect(out).toBe(
      '<a title="{HO1}" data-t="{KP}"><span class="tvar unset" data-v="HO1">探索者</span></a><svg><text>{HO1}</text></svg><script>{KP}</script><style>.x{KP}</style><span class="tvar unset" data-v="KP">&lt;守秘人&gt;</span>',
    );
    expect(wrapVarsHtml(out, view)).toBe(out);
    expect(wrapVarsHtml('{HO1}', null)).toBe('{HO1}');
  });
  it('情報區塊：標題語、巢狀書式；手冊：編號＋題名、內文', () => {
    const info = blockHtml(d.blocks[2], ctxOf(d), { cols: 1, pull: 0, top: false });
    expect(info).toContain('class="b t-info"');
    expect(info).toContain('<div class="blb">情報</div>');
    expect(info).toContain('<ruby>古書<rp>（</rp><rt>こしょ</rt><rp>）</rp></ruby>');
    expect(info).toContain('<ul class="ls ls-disc">');
    expect(info).not.toContain('tabindex');
    const ho = blockHtml(d.blocks[3], ctxOf(d), { cols: 1, pull: 0, top: false });
    expect(ho).toContain(
      '<div class="ho-h"><span class="ho-n">HO1</span><span class="ho-t">常客</span></div>',
    );
    expect(ho).toContain('本文<span class="tvar unset" data-v="HO1">探索者</span>');
  });
  it('頁面、頁尾、目錄、頁面一覽的標題也顯示預設值', () => {
    const byId = new Map(allBlocks(d).map((b) => [b.id, b]));
    const d2 = { ...d, foot: { num: true, text: '{KP} 著', from: 1 } };
    const page = staticPageHtml(0, ['h', 'a'], ctxOf(d2, { edit: false }), byId);
    expect(page).toContain('<span class="tvar unset" data-v="HO1">探索者</span>的夢');
    expect(footHtml(0, 1, d2)).toContain(
      '<span class="tvar unset" data-v="KP">&lt;守秘人&gt;</span> 著',
    );
    expect(pageTitleOf(d, ['h'])).toBe('探索者的夢');
    expect(varPlain('{HO1}{SAN}', view)).toBe('探索者{SAN}');
  });
  it('沒有變數的原稿：輸出與以前相同（不包任何東西）', () => {
    const plain = doc([blk('a', 'desc', '{SAN}與{HO}')]);
    expect(varView(plain)).toBeNull();
    expect(
      blockHtml(plain.blocks[0], ctxOf(plain), { cols: 1, pull: 0, top: false }),
    ).not.toContain('tvar');
  });
  it('列印與 PDF 用一般的文字顏色（pv-print、@media print；深色底的規則也蓋過）', () => {
    expect(PAPER_CSS).toContain(
      '.pv-print .tvar,.pv-print .tvar.unset,.pv-print .t-h1 .tvar.unset,.pv-print .rh1 .tvar.unset,.pv-print .pop-btn .tvar.unset{color:inherit;border-bottom:0}',
    );
    expect(PAPER_CSS).toContain(
      '@media print{.tvar,.tvar.unset,.t-h1 .tvar,.rh1 .tvar,.pop-btn .tvar,.t-h1 .tvar.unset,.rh1 .tvar.unset,.pop-btn .tvar.unset{color:inherit;border-bottom:0}}',
    );
    /* 列印的規則在深色底的規則之後（同樣的權重時後面的優先） */
    expect(PAPER_CSS.indexOf('.pv-print .tvar,')).toBeGreaterThan(
      PAPER_CSS.indexOf('.t-h1 .tvar,.rh1 .tvar,.pop-btn .tvar{'),
    );
  });
  it('墨色底上的變數（7.3）：填了值跟著底色的文字色＋虛線底線；還沒填的淡色；按鈕滑鼠移上去時亮一點', () => {
    expect(PAPER_CSS).toContain(
      '.t-h1 .tvar,.rh1 .tvar,.pop-btn .tvar{color:inherit;border-bottom:1px dashed currentColor}',
    );
    expect(PAPER_CSS).toContain(
      '.t-h1 .tvar.unset,.rh1 .tvar.unset,.pop-btn .tvar.unset{color:#9a8e74;border-bottom:1px dotted #b9ab8c}',
    );
    expect(PAPER_CSS).toContain(
      '.pop-btn:hover .tvar.unset{color:#ebe3d2;border-bottom-color:#ebe3d2}',
    );
    /* 對比：淡褐在墨底、亮淡色在朱底都 ≥ 4.5:1 */
    const lum = (h: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => {
        const v = Number.parseInt(h.slice(i, i + 2), 16) / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: string, b: string) => {
      const [x, y] = [lum(a), lum(b)];
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    expect(ratio('#9a8e74', '#23201c')).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#ebe3d2', '#a8331f')).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#f7f3ea', '#23201c')).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#f7f3ea', '#a8331f')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('匯出 HTML（F258、F259、3.9）', () => {
  const d = normalizeDoc(UPSTREAM());
  const ids = d.blocks.map((b) => b.id);
  const html = exportHtml({ doc: d, pages: [ids], from: 0, to: 0 });
  it('按一下複製的內文：注音只留本文字、結尾的換行去掉、變數維持 {名稱}', () => {
    expect(copyBodyText(d.blocks[2])).toBe(
      '古書的扉頁寫著「給{HO1}」。\n- {KP}正看著你\n> 技能：〈圖書館〉',
    );
    expect(html).toContain(
      `<script type="text/plain" class="outdata" id="cp${d.blocks[2].id}">古書的扉頁寫著「給{HO1}」。\n- {KP}正看著你\n> 技能：〈圖書館〉</script>`,
    );
    const pid = d.blocks[7].pop?.blocks?.[0].id;
    expect(html).toContain(`id="cp${pid}">彈出視窗裡的情報：{HO1}</script>`);
    expect(html.match(/class="outdata" id="cp/g)).toHaveLength(6);
  });
  it('框可以 Tab 到、有提示；有提示列', () => {
    expect(html).toContain('class="b t-info" tabindex="0" title="按一下複製內文"');
    expect(html).toContain('class="b t-handout" tabindex="0" title="按一下複製內文"');
    expect(html).toContain('<div id="cpToast" role="status" aria-live="polite"></div>');
    expect(html).toContain('.t-info,.t-handout{cursor:copy');
  });
  it('登場人物欄：每個變數一列（提示文字＝預設值或名稱、說明）', () => {
    const vx = html.slice(html.indexOf('<div id="vx">'), html.indexOf('<button id="tocMask"'));
    expect(vx).toContain('<h2>登場人物（變數）</h2>');
    expect(
      [...vx.matchAll(/data-v="([^"]+)" placeholder="([^"]*)"/g)].map((m) => `${m[1]}=${m[2]}`),
    ).toEqual(['HO1=HO1', 'HO2=HO2', 'HO3=HO3', 'KP=守秘人']);
    expect(vx).toContain('<small id="vxn0">手冊「古書店的常客」的 PC</small>');
    expect(vx).toContain('<small id="vxn3">KP 的名字</small>');
    expect(html.indexOf('<div id="vx">')).toBeGreaterThan(html.indexOf('<nav id="nav"><h1>'));
  });
  it('全文的 {名稱} 已包好；只剩資料、目錄原文與沒登錄的名稱是 {…}（D6）', () => {
    const body = html.slice(
      html.indexOf('<main id="doc">'),
      html.indexOf('<script type="text/plain"'),
    );
    expect(body).not.toMatch(/\{(HO\d|KP)\}/);
    expect(body).toContain('{SAN}');
    expect(body).toContain('<span class="tvar unset" data-v="HO1">HO1</span>的手記');
    expect(html).toContain('<span class="nvt" data-t="第一章 {HO1}的夢">');
    expect(html).toContain('<nav id="nav"><h1>霧之館（變數）</h1>');
  });
  it('腳本：記值的鍵、替換複製的文字', () => {
    expect(html).toContain(JSON.stringify(`${VARS_KEY_PREFIX}霧之館（變數）`));
    expect(VARS_KEY_PREFIX).toBe('trpg-toolkit:scenario-editor:vars:');
    expect(html).toContain('copyText(VT(d.textContent));');
    expect(html).toContain('copyText(VT(src.textContent));');
    expect(html).toContain('new RegExp("\\\\{(HO1|HO2|HO3|KP)\\\\}",\'g\')');
  });
  it('沒有情報區塊、手冊、變數時：腳本與閱覽頁的樣式與以前相同', () => {
    const plain = normalizeDoc({ title: 'x', blocks: [{ id: 'a', type: 'desc', text: '{SAN}' }] });
    const h = exportHtml({ doc: plain, pages: [['a']], from: 0, to: 0 });
    for (const s of [
      'id="vx"',
      'cpToast',
      'tvar unset',
      'copyBlock',
      'VT(',
      VARS_KEY_PREFIX,
      'cursor:copy',
    ])
      expect(h, s).not.toContain(s);
    const base = viewScript({ vars: null, key: '', copy: false });
    expect(h).toContain(`<script>${base}</script>`);
    expect(base).toContain('copyText(d.textContent);');
  });
  it('只有情報區塊（沒有變數）：可以複製，不放登場人物欄', () => {
    const only = normalizeDoc({ title: 'x', blocks: [{ id: 'a', type: 'info', text: '線索' }] });
    const h = exportHtml({ doc: only, pages: [['a']], from: 0, to: 0 });
    expect(h).toContain('copyText(src.textContent);');
    expect(h).not.toContain('id="vx"');
    expect(h).toContain('id="cpa">線索</script>');
  });
});

describe('字數與其他', () => {
  it('情報區塊、手冊的內文算字數（標題語、編號、題名不算，同原作）', () => {
    const d = doc([
      blk('i', 'info', '甲乙', { lb: '很長的標題語' }),
      blk('o', 'handout', '丙', { ho: { no: 'HO1', ttl: '題名' } }),
    ]);
    expect(docCharCount(d)).toBe(3);
  });
});

describe('狀態列：欄位還錯著時的錯誤（7.3）', () => {
  it('holdStatus 的訊息標記成 hold；releaseStatus 只放開同一個欄位的；之後的一般訊息照常取代', () => {
    holdStatus('ho-no:a', '名稱不合規則');
    expect(statusHeld()).toBe(true);
    expect(ui().status).toMatchObject({ text: '名稱不合規則', tone: 'err', hold: 'ho-no:a' });
    releaseStatus('ho-no:b');
    expect(statusHeld()).toBe(true);
    releaseStatus('ho-no:a');
    expect(statusHeld()).toBe(false);
    expect(ui().status?.text).toBe('名稱不合規則');
    holdStatus('var:0', 'x');
    say('已新增「手冊」');
    expect(statusHeld()).toBe(false);
  });
});
