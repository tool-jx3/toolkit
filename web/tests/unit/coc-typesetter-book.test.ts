// @vitest-environment jsdom
/**
 * CoC 劇本排版工具：內文 → 紙面的 DOM（規格 3.4、3.5.2～3.5.6）、整本書（封面、目錄、頁碼、書眉、放不下的頁；3.1、3.4.5）、
 * 列印用 HTML（3.12）。分頁的量測用「字數」代替瀏覽器的排版（jsdom 沒有版面）。
 */
import { describe, expect, it } from 'vitest';
import { buildBook, cleanBook } from '@/tools/coc-typesetter/book';
import { BOOK_CSS, bookClass, PAPER_LAYOUT, THEMES } from '@/tools/coc-typesetter/bookCss';
import {
  blocksToHtml,
  parseDoc,
  specHtml,
  titleBlock,
  tocBlocks,
  toElement,
} from '@/tools/coc-typesetter/markup';
import { blankMeta, defaultSettings, type Meta, type Settings } from '@/tools/coc-typesetter/model';
import { docTitle, printHtml, printHtmlFileName } from '@/tools/coc-typesetter/output';
import { SAMPLE_META, SAMPLE_TEXT } from '@/tools/coc-typesetter/sample';

const el = (html: string) => toElement(html);
const meta = (p: Partial<Meta> = {}): Meta => ({ ...blankMeta(), items: [], ...p });

describe('區塊（3.5.2）', () => {
  it('一般 Markdown：每個區塊記自己的起始行', () => {
    const root = el(
      blocksToHtml('第一段\n\n- 甲\n- 乙\n\n| a | b |\n|---|---|\n| 1 | 2 |'.split('\n'), 0),
    );
    const kids = [...root.children];
    expect(kids.map((k) => `${k.tagName}@${k.getAttribute('data-line')}`)).toEqual([
      'P@0',
      'UL@2',
      'TABLE@5',
    ]);
  });

  it('一個換行就是換行（breaks）', () => {
    const root = el(blocksToHtml(['甲', '乙'], 0));
    expect(root.querySelector('p br')).not.toBeNull();
  });

  it('框：預設標籤、自訂標籤、巢狀、框裡的區塊記自己的行；沒有結尾時到最後', () => {
    const lines = [':::kp', '甲', ':::pl 資料卡', '乙', ':::', '丙', ':::', ':::warn', '丁'];
    const root = el(blocksToHtml(lines, 10));
    const [kp, warn] = [...root.children];
    expect(kp.className).toBe('box box-kp');
    expect(kp.getAttribute('data-line')).toBe('10');
    expect(kp.querySelector(':scope > .box-label')?.textContent).toBe('KP 資訊');
    const pl = kp.querySelector('.box-pl');
    expect(pl?.querySelector('.box-label')?.textContent).toBe('資料卡');
    expect(pl?.getAttribute('data-line')).toBe('12');
    expect(pl?.querySelector('p')?.getAttribute('data-line')).toBe('13');
    expect(kp.querySelector(':scope > .box-body > p:last-child')?.textContent).toBe('丙');
    expect(warn.className).toBe('box box-warn');
    expect(warn.querySelector('.box-label')?.textContent).toBe('注意');
    expect(warn.textContent).toContain('丁');
    for (const [kind, label] of [
      ['note', '補充'],
      ['pl', '公開資訊'],
    ]) {
      const b = el(blocksToHtml([`:::${kind}`, 'x', ':::'], 0)).firstElementChild;
      expect(b?.querySelector('.box-label')?.textContent).toBe(label);
    }
  });

  it('描述：連續的 > 行合成一個框，標籤「描述」', () => {
    const root = el(blocksToHtml(['> 甲', '>乙', '  > **丙**', '', '丁'], 0));
    const d = root.firstElementChild;
    expect(d?.className).toBe('desc');
    expect(d?.querySelector('.desc-label')?.textContent).toBe('描述');
    expect(d?.querySelector('.desc-body')?.textContent?.replace(/\s/g, '')).toBe('甲乙丙');
    expect(d?.querySelector('strong')?.textContent).toBe('丙');
    expect(root.children[1].getAttribute('data-line')).toBe('4');
  });

  it('檢定：標題＋到空行或標記行為止的結果', () => {
    const root = el(
      blocksToHtml(['▼【偵查】成功', '結果一', '| 表 |', '## 章', '▼ 沒有結果', '', '下一段'], 0),
    );
    const [j1, h2, j2, p] = [...root.children];
    expect(j1.className).toBe('judge');
    expect(j1.querySelector('.judge-title')?.textContent).toBe('【偵查】成功');
    expect(j1.querySelector('.judge-mark')?.textContent).toBe('▼');
    expect(j1.querySelector('.judge-body')?.textContent).toContain('結果一');
    expect(j1.querySelector('.judge-body')?.textContent).toContain('| 表 |');
    expect(h2.tagName).toBe('H2');
    expect(j2.querySelector('.judge-body')).toBeNull();
    expect(j2.getAttribute('data-line')).toBe('4');
    expect(p.getAttribute('data-line')).toBe('6');
  });

  it('換頁記號；程式碼區塊裡的標記不處理', () => {
    const root = el(blocksToHtml(['甲', '===換頁===', '```', ':::kp', '> x', '```', '乙'], 0));
    expect([...root.children].map((k) => k.className || k.tagName)).toEqual([
      'P',
      'pb',
      'PRE',
      'P',
    ]);
    expect(root.querySelector('pre')?.textContent).toContain(':::kp');
  });

  it('清理 HTML：腳本與事件屬性拿掉', () => {
    const root = el(
      blocksToHtml(['<script>alert(1)</script>', '<img src="x.png" onerror="alert(1)">'], 0),
    );
    expect(root.querySelector('script')).toBeNull();
    expect(root.querySelector('img')?.getAttribute('onerror')).toBeNull();
  });

  it('技能與理智檢定的標示（程式碼裡不處理）', () => {
    const root = el(
      blocksToHtml(['用【偵查】，SANc（0/1）', '`【不是】`', '', '**【粗體裡】**'], 0),
    );
    expect([...root.querySelectorAll('.skill')].map((s) => s.textContent)).toEqual([
      '【偵查】',
      '【粗體裡】',
    ]);
    expect(root.querySelector('.san')?.textContent).toBe('SANc（0/1）');
    expect(root.querySelector('code .skill')).toBeNull();
  });
});

describe('章與探索點（F50、F51）', () => {
  it('## 依序編號（包括框裡的）、### 不編號；都有 id、列入目錄', () => {
    const d = parseDoc('## 一\n### 甲\n:::kp\n## 二\n:::\n# 大標\n#### 小\n## 三', meta());
    expect(d.headings.map((h) => `${h.level}:${h.num}:${h.text}:${h.id}`)).toEqual([
      '2:01:一:sec-1',
      '3::甲:sec-2',
      '2:02:二:sec-3',
      '2:03:三:sec-4',
    ]);
    const h2 = d.root.querySelector('#sec-4');
    expect(h2?.querySelector('.ch-no')?.textContent).toBe('03');
    expect(h2?.querySelector('.ch-tx')?.textContent).toBe('三');
    expect(h2?.getAttribute('data-num')).toBe('03');
  });

  it('字數與概要（項目與內容都有字的才排）', () => {
    const d = parseDoc(
      '## 章\n甲 乙',
      meta({
        items: [
          { key: 'a', value: ' ' },
          { key: 'b', value: 'c' },
        ],
      }),
    );
    expect(d.chars).toBe(5);
    expect(d.overview).toEqual([{ key: 'b', value: 'c' }]);
  });
});

describe('封面、標題區、概要、目錄（3.4）', () => {
  it('概要：超過 16 字或只有一項時佔整行；內容可以有 Markdown 與技能', () => {
    const one = el(specHtml([{ key: '項目', value: '短' }]));
    expect(one.querySelector('.spec-item')?.classList.contains('wide')).toBe(true);
    const two = el(
      specHtml([
        { key: 'A', value: '一二三四五六七八九十一二三四五六' },
        { key: 'B', value: '一二三四五六七八九十一二三四五六七' },
        { key: '<x>', value: '**粗**【偵查】' },
      ]),
    );
    expect(
      [...two.querySelectorAll('.spec-item')].map((x) => x.classList.contains('wide')),
    ).toEqual([false, true, false]);
    expect(two.querySelectorAll('dt')[2].textContent).toBe('<x>');
    expect(two.querySelector('strong')?.textContent).toBe('粗');
    expect(two.querySelector('.skill')?.textContent).toBe('【偵查】');
    expect(specHtml([])).toBe('');
  });

  it('標題區：標題（空白時「未命名劇本」）、副標題、作者', () => {
    const tb = titleBlock(parseDoc('', meta({ author: '某人' })));
    expect(tb.querySelector('.tb-title')?.textContent).toBe('未命名劇本');
    expect(tb.querySelector('.tb-sub')).toBeNull();
    expect(tb.querySelector('.tb-author')?.textContent).toBe('作者　某人');
  });

  it('目錄：標題「目錄」＋每個章、探索點一列（章的那一列不單獨留在頁尾）', () => {
    const items = tocBlocks(parseDoc('## 一\n### 甲\n## 二', meta()));
    expect(items[0].querySelector('.toc-tx')?.textContent).toBe('目錄');
    expect(items[0].hasAttribute('id')).toBe(false);
    expect(
      items.slice(1).map((a) => `${a.className}|${a.textContent}|${a.getAttribute('href')}`),
    ).toEqual([
      'toc-item lv2 kwn|01一00|#sec-1',
      'toc-item lv3|甲00|#sec-2',
      'toc-item lv2 kwn|02二00|#sec-3',
    ]);
  });
});

/** 每頁最多放 cap 個字（區塊各算 2） */
function capFits(cap: number) {
  const weight = (n: Node): number => {
    if (n.nodeType === 3) return (n as Text).data.replace(/\s/g, '').length;
    if (n.nodeType !== 1) return 0;
    let w = /^(P|LI|TR|H\d|DIV|TABLE|A)$/.test((n as Element).tagName) ? 2 : 0;
    for (const c of n.childNodes) w += weight(c);
    return w;
  };
  return (body: HTMLElement) => weight(body) - 2 <= cap;
}

function book(text: string, m: Partial<Meta> = {}, s: Partial<Settings> = {}, cap = 200) {
  const stage = document.createElement('div');
  document.body.appendChild(stage);
  const d = parseDoc(text, meta(m));
  const res = buildBook(d, { ...defaultSettings(), ...s }, { stage, fits: capFits(cap) });
  const pages = [...res.book.querySelectorAll<HTMLElement>(':scope > .page')];
  return { res, pages };
}

describe('整本書（3.1、3.4、3.5.5）', () => {
  it('封面 → 目錄 → 本文；頁碼從封面算起，奇數頁在右（odd）', () => {
    const { res, pages } = book('## 一\n甲\n## 二\n乙', { title: '霧港' });
    expect(res.book.className).toBe('book paper-a5 theme-mono');
    expect(pages.map((p) => p.className)).toEqual([
      'page cover odd',
      'page toc-page even',
      'page odd',
      'page even',
    ]);
    expect(pages.map((p) => p.dataset.no)).toEqual(['1', '2', '3', '4']);
    expect(pages[0].querySelector('.page-foot')).toBeNull();
    expect(pages[0].querySelector('.cv-title')?.textContent).toBe('霧港');
    expect(pages[2].querySelector('.page-foot')?.textContent).toBe('3');
    expect(res.pages).toBe(4);
  });

  it('目錄的頁碼是標題所在的頁', () => {
    const { pages } = book('## 一\n甲\n### 地點\n## 二\n乙');
    const pg = [...pages[1].querySelectorAll('.toc-item .pg')].map((x) => x.textContent);
    expect(pg).toEqual(['3', '3', '4']);
  });

  it('沒有封面：本文最前面是標題區；沒有標題時不放目錄', () => {
    const { pages } = book('甲\n\n乙', {}, { cover: false });
    expect(pages).toHaveLength(1);
    expect(pages[0].querySelector('.page-body > .titleblock .tb-title')?.textContent).toBe(
      '未命名劇本',
    );
  });

  it('每章換頁關閉時章標題接在後面；換頁記號照樣換頁', () => {
    const { pages } = book(
      '## 一\n甲\n## 二\n乙\n\n===換頁===\n\n丙',
      {},
      { cover: false, toc: false, chapter: false },
    );
    expect(
      pages.map((p) => p.querySelector('.page-body')?.textContent?.replace(/\s/g, '')),
    ).toEqual(['未命名劇本01一甲02二乙', '丙']);
  });

  it('書眉：標題＋這一頁第一個章（沒有時沿用前一章）；目錄頁「目錄」；關閉時沒有書眉', () => {
    const { pages } = book(
      '## 一\n甲甲甲甲甲甲甲甲\n\n乙乙乙乙乙乙乙乙\n\n丙丙丙丙丙丙丙丙',
      { title: '**霧港**' },
      {},
      24,
    );
    const heads = pages.slice(1).map((p) => p.querySelector('.page-head')?.textContent);
    expect(heads[0]).toBe('霧港目錄');
    expect(heads[1]).toBe('霧港01一');
    expect(heads[2]).toBe('霧港01一');
    expect(pages[2].querySelector('.ph-chap b')?.textContent).toBe('01');
    const off = book('## 一\n甲', { title: '霧港' }, { header: false });
    expect(off.pages[2].querySelector('.page-head')).toBeNull();
    /* 沒有標題、還沒有章：不顯示書眉 */
    const none = book('甲', {}, { cover: false, toc: false });
    expect(none.pages[0].querySelector('.page-head')).toBeNull();
  });

  it('框接到下一頁：重複標籤並加「（續）」（只加一次）；描述重複標籤', () => {
    const long = Array.from({ length: 6 }, (_, i) => `第${i}段的內容寫得長一點`).join('\n\n');
    const { pages } = book(`:::kp 真相\n${long}\n:::`, {}, { cover: false, toc: false }, 40);
    const labels = pages.flatMap((p) =>
      [...p.querySelectorAll('.box-label')].map((l) => l.textContent),
    );
    expect(labels[0]).toBe('真相');
    expect(labels.slice(1).every((l) => l === '真相（續）')).toBe(true);
    expect(labels.length).toBeGreaterThan(2);
    const d = book(`> ${'描述的內容很長很長'.repeat(8)}`, {}, { cover: false, toc: false }, 40);
    const dl = d.pages.flatMap((p) =>
      [...p.querySelectorAll('.desc-label')].map((l) => l.textContent),
    );
    expect(dl.every((l) => l === '描述')).toBe(true);
    expect(d.pages.at(-1)?.querySelector('.desc')?.classList.contains('flow-cont')).toBe(true);
  });

  it('放不下的內容：照樣放、標成 overflow、計數', () => {
    const { res, pages } = book(
      `# ${'很長的標題'.repeat(10)}\n\n甲`,
      {},
      { cover: false, toc: false },
      30,
    );
    expect(res.over).toBe(1);
    expect(pages.filter((p) => p.classList.contains('overflow'))).toHaveLength(1);
  });

  it('範例劇本排得出來：6 章 7 個探索點，每章換頁', () => {
    const { res, pages } = book(SAMPLE_TEXT, SAMPLE_META, {}, 1200);
    expect(pages[0].querySelectorAll('.spec-item')).toHaveLength(6);
    const chapters = [...res.book.querySelectorAll('.page-body h2[id]')];
    expect(chapters).toHaveLength(6);
    for (const h of chapters) expect(h.closest('.page-body')?.firstElementChild).toBe(h);
  });
});

describe('列印用 HTML（3.12）', () => {
  it('檔名：拿掉 * _ `、Windows 不能用的字與空白換成 _、空白時「劇本」', () => {
    expect(printHtmlFileName('**霧港** 的 光/第一部')).toBe('霧港_的_光_第一部_列印用.html');
    expect(printHtmlFileName('')).toBe('劇本_列印用.html');
    expect(docTitle('_ _')).toBe(' ');
  });

  it('內容：@page、樣式、只有紙面、拿掉編輯用的東西、沒有腳本', () => {
    const { res } = book('## 一\n甲', { title: 'A&B <霧>' }, { paper: 'B5' });
    res.book.querySelector('.page-body > *')?.classList.add('is-cursor');
    const html = printHtml({ title: 'A&B <霧>', paper: 'B5', book: res.book });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<html lang="zh-Hant-TW">');
    expect(html).toContain('<title>A&amp;B &lt;霧&gt;</title>');
    expect(html).toContain('@page{size:182mm 257mm;margin:0}');
    expect(html).toContain('fonts.googleapis.com/css2?family=Noto+Serif+TC');
    expect(html).not.toContain('data-line');
    expect(html).not.toContain('is-cursor');
    expect(html).not.toContain('<script');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    /* 封面、目錄、本文 */
    expect(doc.querySelectorAll('.book > .page')).toHaveLength(3);
    expect(doc.querySelector('.book')?.className).toBe('book paper-b5 theme-mono');
    /* 畫面上的 book 不受影響 */
    expect(res.book.querySelector('[data-line]')).not.toBeNull();
    expect(cleanBook(res.book).querySelector('[data-line]')).toBeNull();
  });
});

describe('紙面的樣式', () => {
  it('紙張的版面與舊版相同（3.2）', () => {
    expect(PAPER_LAYOUT).toEqual({
      A5: { top: 18, bottom: 18, side: 16, fontPt: 9, head: 9 },
      B5: { top: 22, bottom: 21, side: 19, fontPt: 9.5, head: 11 },
      A4: { top: 25, bottom: 23, side: 22, fontPt: 10.5, head: 12 },
    });
    expect(BOOK_CSS).toContain(
      '.book.paper-a5{--pw:148mm;--ph:210mm;--mt:18mm;--mb:18mm;--ms:16mm;--fs:9pt;--hd:9mm}',
    );
    expect(BOOK_CSS).toContain('line-height:1.8');
  });

  it('三種配色都定義了同一組角色；黑白只用灰階', () => {
    const keys = Object.keys(THEMES.mono).sort();
    for (const t of Object.values(THEMES)) expect(Object.keys(t).sort()).toEqual(keys);
    for (const v of Object.values(THEMES.mono)) {
      const m = /^#(..)(..)(..)$/.exec(v);
      expect(m && m[1] === m[2] && m[2] === m[3], v).toBe(true);
    }
    expect(bookClass('A4', 'night')).toBe('book paper-a4 theme-night');
  });
});
