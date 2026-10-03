// @vitest-environment jsdom
/**
 * core/paged 的流動分頁（flowPaginate）：用「字數＋每個區塊 2」當作頁面容量來代替瀏覽器的排版量測，
 * 驗證切開的規則（避頭尾、段落最後一行、換行、編號清單、表頭、標籤類、頁尾的標題、盡量不切開、換頁、空白頁）。
 */
import { describe, expect, it } from 'vitest';
import {
  FLOW_CLASSES,
  type FlowOptions,
  flowPaginate,
  KINSOKU_NO_END,
  KINSOKU_NO_START,
} from '@/core/paged';

const BLOCK = new Set(['P', 'LI', 'TR', 'H1', 'H2', 'H3', 'DIV', 'TABLE', 'UL', 'OL', 'HR']);

function weight(n: Node): number {
  if (n.nodeType === 3) return (n as Text).data.replace(/\s/g, '').length;
  if (n.nodeType !== 1) return 0;
  let w = BLOCK.has((n as Element).tagName) ? 2 : 0;
  for (const c of n.childNodes) w += weight(c);
  return w;
}

/** 頁面容量：內容的重量（不含 body 本身）≤ cap */
const capFits = (cap: number) => (body: HTMLElement) => weight(body) - 2 <= cap;

function run(html: string, cap: number, opts: Partial<FlowOptions> = {}) {
  const src = document.createElement('div');
  src.innerHTML = html;
  const bodies: HTMLElement[] = [];
  const res = flowPaginate([...src.children], {
    fits: capFits(cap),
    newPage: () => {
      const b = document.createElement('div');
      bodies.push(b);
      return b;
    },
    dropPage: () => {
      bodies.pop();
    },
    ...opts,
  });
  return {
    res,
    bodies,
    html: bodies.map((b) => b.innerHTML),
    text: bodies.map((b) => b.textContent),
  };
}

describe('避頭尾的字', () => {
  it('包含常見的中文標點', () => {
    for (const c of '、。，：；？！」』）】》…') expect(KINSOKU_NO_START).toContain(c);
    for (const c of '「『（【《') expect(KINSOKU_NO_END).toContain(c);
  });
});

describe('段落切開', () => {
  it('放得下的最長前段留在這一頁、其餘接到下一頁，字一個都不少', () => {
    const t = '一二三四五六七八九十'.repeat(5);
    const { bodies, text, res } = run(`<p>${t}</p>`, 22);
    expect(res.pages).toBe(3);
    expect(text.join('')).toBe(t);
    expect(text[0]).toHaveLength(20);
    const p0 = bodies[0].firstElementChild as HTMLElement;
    const p1 = bodies[1].firstElementChild as HTMLElement;
    expect(p0.classList.contains(FLOW_CLASSES.lastLine)).toBe(true);
    expect(p1.classList.contains(FLOW_CLASSES.cont)).toBe(true);
  });

  it('下一頁不以不能放在行首的標點開頭（退一個字）', () => {
    const { text } = run('<p>一二三四五六七八九。十一</p>', 11);
    expect(text[0]).toBe('一二三四五六七八');
    expect(text[1]).toBe('九。十一');
  });

  it('這一頁不以不能放在行尾的標點結尾', () => {
    const { text } = run('<p>一二三四五六七「八九」十</p>', 10);
    expect(text[0]).toBe('一二三四五六七');
    expect(text[1]).toBe('「八九」十');
  });

  it('切口的空白：下一頁的開頭去掉空白', () => {
    const { text } = run('<p>一二三四五六七八 　九十</p>', 10);
    expect(text[0]?.trim()).toBe('一二三四五六七八');
    expect(text[1]).toBe('九十');
  });

  it('段落裡有換行時，最後一個換行之後的那一行另外分成一段', () => {
    const { bodies } = run('<p>甲乙丙<br>丁戊己<br>庚辛壬癸子丑寅卯</p>', 12);
    const ps = [...bodies[0].querySelectorAll('p')];
    expect(ps).toHaveLength(2);
    expect(ps[0].classList.contains(FLOW_CLASSES.joined)).toBe(true);
    expect(ps[0].textContent).toBe('甲乙丙丁戊己');
    expect(ps[1].className).toBe(`${FLOW_CLASSES.lastLine} ${FLOW_CLASSES.cont}`);
    expect(ps[1].textContent).toBe('庚辛壬癸');
  });

  it('一個字都放不下時不切（整段送到下一頁）', () => {
    const { text } = run('<p>甲乙丙丁戊</p><p>一二三四五六七八九十</p>', 8);
    expect(text[0]).toBe('甲乙丙丁戊');
    expect(text[1]).toBe('一二三四五六');
  });
});

describe('清單、表格、標籤類', () => {
  it('編號清單接到下一頁時從接續的號碼開始；切開的項目不佔新號碼', () => {
    const items = Array.from({ length: 4 }, (_, i) => `<li>第${i + 1}項的內容</li>`).join('');
    const { bodies } = run(`<ol>${items}</ol>`, 23);
    const ol1 = bodies[1].querySelector('ol');
    const firstLi = ol1?.querySelector('li');
    /* 第 1 頁：第 1、2 項與第 3 項的前半；下一頁第一項是第 3 項的後半（不佔新號碼），接著是第 4 項 */
    expect(bodies[0].querySelectorAll('li')).toHaveLength(3);
    expect(firstLi?.classList.contains(FLOW_CLASSES.cont)).toBe(true);
    expect(ol1?.getAttribute('start')).toBe('3');
    expect(ol1?.querySelectorAll('li')).toHaveLength(2);
  });

  it('表格接到下一頁時重複表頭', () => {
    const rows = Array.from({ length: 6 }, (_, i) => `<tr><td>第${i + 1}列</td></tr>`).join('');
    const { bodies } = run(
      `<table><thead><tr><th>標題</th></tr></thead><tbody>${rows}</tbody></table>`,
      30,
    );
    expect(bodies.length).toBeGreaterThan(1);
    for (const b of bodies) expect(b.querySelector('thead')?.textContent).toBe('標題');
    const all = bodies.flatMap((b) => [...b.querySelectorAll('td')].map((td) => td.textContent));
    expect(all).toEqual(Array.from({ length: 6 }, (_, i) => `第${i + 1}列`));
  });

  it('只放得下標籤時整個區塊不切（標籤類不算內容）', () => {
    const isChrome = (n: Node) => n.nodeType === 1 && (n as Element).classList.contains('label');
    const { bodies } = run(
      '<p>甲乙丙丁戊己</p><div class="box"><div class="label">標籤</div><p>一二三四五六七八九十</p></div>',
      13,
      { isChrome },
    );
    expect(bodies[0].querySelector('.box')).toBeNull();
    expect(bodies[1].querySelector('.box .label')?.textContent).toBe('標籤');
  });

  it('afterSplit 在內建處理之後呼叫（例如重複標籤）', () => {
    const isChrome = (n: Node) => n.nodeType === 1 && (n as Element).classList.contains('label');
    const { bodies } = run(
      '<div class="box"><div class="label">框</div><p>一二三四五六七八九十</p><p>甲乙丙丁戊己庚辛壬癸</p></div>',
      18,
      {
        isChrome,
        afterSplit: (rest, part) => {
          const l = part.querySelector(':scope > .label');
          if (l && !rest.querySelector(':scope > .label')) {
            const c = l.cloneNode(true) as Element;
            c.append('（續）');
            rest.prepend(c);
          }
        },
      },
    );
    expect(bodies[1].querySelector('.label')?.textContent).toBe('框（續）');
  });
});

describe('區塊的位置', () => {
  it('頁尾的標題跟著下一個區塊到下一頁', () => {
    const { bodies } = run('<p>一二三四五六七八</p><h2>標題</h2><hr><p>甲乙丙</p>', 14, {
      atomic: (el) => ['H2', 'HR'].includes(el.tagName),
    });
    expect(bodies[0].textContent).toBe('一二三四五六七八');
    expect(bodies[1].firstElementChild?.tagName).toBe('H2');
  });

  it('盡量不切開：下一頁放得下就整個送過去，放不下才切', () => {
    const avoidBreak = (el: Element) => el.classList.contains('box');
    const a = run('<p>一二三四五六</p><div class="box"><p>甲乙丙丁戊己庚辛</p></div>', 14, {
      avoidBreak,
    });
    expect(a.bodies[0].querySelector('.box')).toBeNull();
    expect(a.bodies[1].querySelector('.box')?.textContent).toBe('甲乙丙丁戊己庚辛');
    const b = run('<p>一二三四五六</p><div class="box"><p>甲乙丙丁戊己庚辛壬癸子丑</p></div>', 14, {
      avoidBreak,
    });
    expect(b.bodies[0].querySelector('.box')).not.toBeNull();
  });

  it('換頁記號與 breakBefore：這一頁已有內容才換', () => {
    const { text } = run(
      '<div class="pb"></div><h2>一</h2><p>甲</p><div class="pb"></div><div class="pb"></div><h2>二</h2><p>乙</p>',
      100,
      { isBreak: (el) => el.classList.contains('pb'), breakBefore: (el) => el.tagName === 'H2' },
    );
    expect(text).toEqual(['一甲', '二乙']);
  });

  it('空的區塊跳過；最後一頁是空的就拿掉', () => {
    const { res, bodies } = run('<p>甲</p><p> </p><div></div><hr>', 100);
    expect(res.pages).toBe(1);
    expect(bodies[0].children).toHaveLength(2);
  });

  it('一頁放不下的不可切開區塊照樣放，之後換頁', () => {
    const { bodies } = run('<h2>非常非常長的標題文字</h2><p>甲乙</p>', 5);
    expect(bodies[0].textContent).toBe('非常非常長的標題文字');
    expect(bodies[1].textContent).toBe('甲乙');
  });
});
