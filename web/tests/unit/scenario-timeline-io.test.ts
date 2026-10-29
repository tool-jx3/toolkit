/**
 * 劇本時間表的輸出入（規格 F50～F54、F70～F76、3.2、3.7～3.9）：年表的分段與時間、純文字與 Markdown、
 * 列印文件、CSV 的匯出與讀入、資料的整理、匯出圖的畫面描述與 SVG。
 */
import { describe, expect, it } from 'vitest';
import { parseDelimited } from '@/core/csv';
import { printDocumentHtml } from '@/core/paged';
import {
  buildPicture,
  type Prim,
  pictureChars,
  pictureToSvg,
} from '@/tools/scenario-timeline/export/picture';
import {
  chronicle,
  chronicleHtml,
  chronicleMarkdown,
  chronicleText,
  mdEscape,
} from '@/tools/scenario-timeline/model/chronicle';
import {
  CsvHeaderError,
  eventsToCsv,
  parseEventsTable,
  parseGm,
  parseKind,
} from '@/tools/scenario-timeline/model/csv';
import { exampleDoc } from '@/tools/scenario-timeline/model/example';
import { estimateWidth } from '@/tools/scenario-timeline/model/measure';
import { dateValue } from '@/tools/scenario-timeline/model/time';
import {
  blankDoc,
  eventColor,
  newEvent,
  normalizeDoc,
  splitPeople,
  type TimelineDoc,
} from '@/tools/scenario-timeline/model/types';
import { visibleDoc } from '@/tools/scenario-timeline/model/visible';

const doc = exampleDoc();

describe('年表（F50、3.7）', () => {
  it('依日子分段、段裡寫時刻或期間', () => {
    const ch = chronicle(visibleDoc(doc, 'gm'), '（無標題）', '劇本時間表');
    expect(ch.title).toBe('黑水灣燈塔的三日');
    expect(ch.sections.map((s) => s.heading)).toEqual([
      '1925年3月5日（四）',
      '1925年3月11日（三）',
      '1925年3月12日（四）',
      '1925年3月13日（五）',
      '1925年3月14日（六）',
    ]);
    const d12 = ch.sections[2].rows;
    expect(d12.map((r) => [r.time, r.title])).toEqual([
      ['16:00', '抵達黑水灣車站'],
      ['18:00～3月14日 06:00', '濃霧'],
      ['19:00～21:00', '旅館晚餐'],
    ]);
    expect(ch.sections[0].rows[0].time).toBe('整天');
    /* 標記也列進去（排在同時間的事件後面） */
    const d13 = ch.sections[3].rows;
    expect(d13.find((r) => r.kind === 'marker')?.title).toBe('滿月');
    expect(ch.range).toBe('1925年3月5日（四）～1925年3月14日（六）08:00');
  });
  it('PL 版沒有 GM 專用、沒有筆記；只到目前進度時寫「進行中」', () => {
    const ch = chronicle(visibleDoc(doc, 'pl'), '（無標題）', '劇本時間表');
    const titles = ch.sections.flatMap((s) => s.rows.map((r) => r.title));
    expect(titles).not.toContain('第一次召喚儀式');
    expect(titles).not.toContain('信徒把霍爾帶進地下室');
    expect(ch.sections.flatMap((s) => s.rows).every((r) => !r.gmNote)).toBe(true);
    const d = { ...doc, progress: { on: true, time: '1925-03-12 20:00', plOnly: true } };
    const ch2 = chronicle(visibleDoc(d, 'pl'), '（無標題）', '劇本時間表');
    const dinner = ch2.sections.flatMap((s) => s.rows).find((r) => r.title === '旅館晚餐');
    expect(dinner?.time).toBe('19:00～（進行中）');
    expect(dinner?.ongoing).toBe(true);
  });
  it('第 N 天、架空年的分段', () => {
    const day: TimelineDoc = {
      ...blankDoc(),
      mode: 'day',
      events: [
        newEvent({ title: 'A', start: '第 1 天 09:00' }),
        newEvent({ title: 'B', kind: 'range', start: '第 1 天 22:00', end: '第 2 天 02:00' }),
        newEvent({ title: 'C', start: '第 2 天' }),
        newEvent({ title: 'D', kind: 'range', start: '第 2 天', end: '第 4 天' }),
      ],
    };
    const ch = chronicle(visibleDoc(day, 'gm'), '?', 'T');
    expect(ch.sections.map((s) => s.heading)).toEqual(['第 1 天', '第 2 天']);
    expect(ch.sections[0].rows.map((r) => r.time)).toEqual(['09:00', '22:00～第 2 天 02:00']);
    /* 只到日：時間點與期間的開始都寫「整天」 */
    expect(ch.sections[1].rows.map((r) => r.time)).toEqual(['整天', '整天～第 4 天']);
    const year: TimelineDoc = {
      ...blankDoc(),
      mode: 'year',
      era: '王國曆',
      events: [newEvent({ title: '戰爭', kind: 'range', start: '302', end: '310' })],
    };
    const cy = chronicle(visibleDoc(year, 'gm'), '?', 'T');
    expect(cy.sections[0].heading).toBe('王國曆 302 年');
    expect(cy.sections[0].rows[0].time).toBe('～王國曆 310 年');
  });
  it('純文字與 Markdown', () => {
    const gm = chronicle(visibleDoc(doc, 'gm'), '（無標題）', '劇本時間表');
    const text = chronicleText(gm, 'gm');
    expect(text.split('\n')[0]).toBe('黑水灣燈塔的三日〔GM 用〕');
    expect(text).toContain('■ 1925年3月12日（四）');
    expect(text).toContain('・16:00　抵達黑水灣車站〔調查員〕');
    expect(text).toContain('　　地點：黑水灣車站／相關角色：調查員');
    expect(text).toContain('・18:00～3月14日 06:00　濃霧〔背景〕');
    expect(text).toContain('　　〔GM 筆記〕被深潮會的信徒帶走。');
    expect(text).toContain('◆ 22:00　滿月（標記）');
    expect(text).toContain('〔GM 專用〕');
    const pl = chronicleText(chronicle(visibleDoc(doc, 'pl'), '（無標題）', '劇本時間表'), 'pl');
    expect(pl).not.toContain('GM');
    const md = chronicleMarkdown(gm, 'gm');
    expect(md.split('\n')[0]).toBe('# 黑水灣燈塔的三日（GM 用）');
    expect(md).toContain('## 1925年3月12日（四）');
    expect(md).toContain('- **16:00** 抵達黑水灣車站（調查員）');
    expect(md).toContain('  - **GM 筆記**：被深潮會的信徒帶走。調查員隔天早上才會發現他不見了。');
    expect(mdEscape('a*b_[c]')).toBe('a\\*b\\_\\[c\\]');
  });
  it('列印文件：跳脫、GM 筆記、頁邊界', () => {
    const d: TimelineDoc = {
      ...blankDoc(),
      title: '<危險>',
      events: [newEvent({ title: 'a&b', start: '1925-03-12', gmNote: '秘密' })],
    };
    const html = chronicleHtml(chronicle(visibleDoc(d, 'gm'), '?', 'T'), 'gm');
    expect(html).toContain('&lt;危險&gt;');
    expect(html).toContain('a&amp;b');
    expect(html).toContain('GM 筆記：秘密');
    const doc2 = printDocumentHtml({
      title: 't',
      css: '',
      pages: [html],
      size: { w: 210, h: 297 },
      pageMargin: '15mm',
    });
    expect(doc2).toContain('@page{size:210mm 297mm;margin:15mm}');
    expect(
      printDocumentHtml({ title: 't', css: '', pages: [], size: { w: 210, h: 297 } }),
    ).toContain('@page{size:210mm 297mm;margin:0}');
  });
});

describe('CSV（F75、F76、3.9）', () => {
  it('匯出：表頭、BOM、依時間排、完整資料（含 GM 欄）', () => {
    const csv = eventsToCsv(doc);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const rows = parseDelimited(csv.slice(1));
    expect(rows[0]).toEqual([
      '標題',
      '種類',
      '開始',
      '結束',
      '泳道',
      '地點',
      '相關角色',
      '分類',
      '顏色',
      'GM 專用',
      '說明',
      'GM 筆記',
    ]);
    expect(rows[1][0]).toBe('委託信寄出');
    const rite = rows.find((r) => r[0] === '第一次召喚儀式');
    expect(rite?.slice(1, 5)).toEqual([
      '期間',
      '1925-03-11 23:00',
      '1925-03-12 01:00',
      '司祭 以利亞・諾頓',
    ]);
    expect(rows.find((r) => r[0] === '信徒把霍爾帶進地下室')?.[9]).toBe('是');
    expect(rows).toHaveLength(doc.events.length + 1);
  });
  it('來回：匯出再讀入，欄位相同', () => {
    const r = parseEventsTable(eventsToCsv(doc).slice(1), doc);
    expect(r.errors).toEqual([]);
    expect(r.lanes).toEqual([]);
    expect(r.categories).toEqual([]);
    const strip = (e: TimelineDoc['events'][number]) => ({ ...e, id: '' });
    const sorted = [...doc.events].sort((a, b) =>
      a.start < b.start ? -1 : a.start > b.start ? 1 : 0,
    );
    expect(r.events.map(strip)).toEqual(sorted.map(strip));
  });
  it("防公式注入：文字欄加 '、時間欄不動；讀回逐欄相同", () => {
    const base = blankDoc();
    const ev = (over: Partial<TimelineDoc['events'][number]>) =>
      newEvent({ start: '1925-03-12 10:00', ...over });
    const f: TimelineDoc = {
      ...base,
      lanes: [{ id: 'l', name: '=泳道', kind: 'other', color: '#4f7cff', parentId: '', gm: false }],
      categories: [{ id: 'c', name: '+分類', color: '#2fa37a' }],
      events: [
        ev({ title: '=1+1', laneId: 'l', categoryId: 'c', place: '@地點', people: ['-甲', '乙'] }),
        ev({ title: '\t=tab', start: '1925-03-12 11:00', description: '=HYPERLINK("x","y")' }),
        ev({ title: "'=已經有引號", start: '1925-03-12 12:00', gmNote: '-1' }),
        ev({ title: "'普通引號", start: '1925-03-12 13:00' }),
      ],
    };
    const csv = eventsToCsv(f).slice(1);
    const rows = parseDelimited(csv);
    expect(rows[1].slice(0, 8)).toEqual([
      "'=1+1",
      '時間點',
      '1925-03-12 10:00',
      '',
      "'=泳道",
      "'@地點",
      "'-甲、乙",
      "'+分類",
    ]);
    expect(rows[2][0]).toBe("'\t=tab");
    expect(rows[2][10]).toBe('\'=HYPERLINK("x","y")');
    expect(rows[3][0]).toBe("''=已經有引號");
    expect(rows[3][11]).toBe("'-1");
    expect(rows[4][0]).toBe("'普通引號");
    const back = parseEventsTable(csv, f);
    expect(back.lanes).toEqual([]);
    expect(back.categories).toEqual([]);
    const strip = (e: TimelineDoc['events'][number]) => ({ ...e, id: '' });
    expect(back.events.map(strip)).toEqual(f.events.map(strip));
    // 年份模式：負的年份（時間欄）不加 '
    const y: TimelineDoc = {
      ...base,
      mode: 'year',
      events: [newEvent({ title: '-古代', start: '-500', kind: 'range', end: '-400' })],
    };
    const yr = parseDelimited(eventsToCsv(y).slice(1));
    expect(yr[1].slice(0, 4)).toEqual(["'-古代", '期間', '-500', '-400']);
    expect(parseEventsTable(eventsToCsv(y).slice(1), y).events[0]).toMatchObject({
      title: '-古代',
      start: '-500',
      end: '-400',
    });
  });
  it('貼上試算表：引號包住、含換行或引號的格讀成一格', () => {
    const tsv =
      '標題\t開始\t說明\n事件甲\t1925-03-12 10:00\t"第一行\n第二行"\n事件乙\t1925-03-12 11:00\t"含""引號""的說明"\n';
    const r = parseEventsTable(tsv, doc);
    expect(r.errors).toEqual([]);
    expect(r.events.map((e) => [e.title, e.start, e.description])).toEqual([
      ['事件甲', '1925-03-12 10:00', '第一行\n第二行'],
      ['事件乙', '1925-03-12 11:00', '含"引號"的說明'],
    ]);
  });
  it('讀入：英文表頭、TSV、種類推斷、新泳道與分類、看不懂的列', () => {
    const tsv = [
      'title\tstart\tend\tgroup\tcategory\tgm\tcolor',
      '開場\t1925-03-12 10:00\t\t調查員\t\t\t',
      '調查\t1925/3/12 13:00\t1925/3/12 15:30\t新的泳道\t新分類\tY\t#ABC',
      '壞掉\t明天\t\t\t\t\t',
      '倒過來\t1925-03-12 10:00\t1925-03-12 09:00\t\t\t\t',
      '',
    ].join('\n');
    const r = parseEventsTable(tsv, doc);
    expect(r.total).toBe(4);
    expect(r.events.map((e) => [e.title, e.kind, e.start, e.end])).toEqual([
      ['開場', 'point', '1925-03-12 10:00', ''],
      ['調查', 'range', '1925-03-12 13:00', '1925-03-12 15:30'],
    ]);
    expect(r.events[0].laneId).toBe('pc');
    expect(r.lanes.map((l) => l.name)).toEqual(['新的泳道']);
    expect(r.events[1].laneId).toBe(r.lanes[0].id);
    expect(r.categories.map((c) => c.name)).toEqual(['新分類']);
    expect(r.events[1].gm).toBe(true);
    expect(r.events[1].color).toBe('#aabbcc');
    expect(r.errors.map((e) => e.row)).toEqual([4, 5]);
    expect(r.errors[0].message).toContain('看不懂');
    expect(r.errors[1].message).toBe('結束要比開始晚');
  });
  it('沒有「開始」欄時是錯誤；種類與 GM 的寫法', () => {
    expect(() => parseEventsTable('名稱,地點\na,b', doc)).toThrow(CsvHeaderError);
    expect(parseKind('Box')).toBe('point');
    expect(parseKind('區間')).toBe('range');
    expect(parseKind('')).toBeNull();
    expect(parseKind('?')).toBe('bad');
    expect(['是', '1', 'TRUE', '✓', 'y'].every(parseGm)).toBe(true);
    expect(['否', '0', '', 'no'].some(parseGm)).toBe(false);
  });
  it('第 N 天的事件表', () => {
    const day = { ...blankDoc(), mode: 'day' as const };
    const r = parseEventsTable('標題,開始,結束\n夜襲,3 22:00,第4天1:00', day);
    expect(r.events[0]).toMatchObject({
      kind: 'range',
      start: '第 3 天 22:00',
      end: '第 4 天 01:00',
    });
  });
});

describe('資料的整理（3.2）', () => {
  it('看不懂的拿掉、不對的期間改成時間點、上層只有一層、id 不重複', () => {
    const raw = {
      title: 'T',
      mode: 'date',
      lanes: [
        { id: 'a', name: 'A', parentId: '' },
        { id: 'b', name: 'B', parentId: 'a' },
        { id: 'c', name: 'C', parentId: 'b' },
        { id: 'a', name: '重複', parentId: 'zzz' },
      ],
      categories: [{ id: 'k', name: 'K', color: 'red' }],
      events: [
        { id: 'e1', title: 'ok', start: '1925/3/12 9:00', laneId: 'c', categoryId: 'k' },
        { id: 'e2', title: 'bad', start: '明天' },
        { id: 'e3', title: 'range', kind: 'range', start: '1925-03-12', end: '1925-03-01' },
        { id: 'e1', title: 'dup', start: '1925', laneId: 'nope', people: 'A、B，A' },
      ],
      markers: [{ id: 'm', label: 'M', time: 'xx' }],
      progress: { on: true, time: '' },
    };
    const d = normalizeDoc(raw);
    expect(d).not.toBeNull();
    if (!d) return;
    expect(d.lanes.map((l) => [l.name, l.parentId])).toEqual([
      ['A', ''],
      ['B', 'a'],
      ['C', ''],
      ['重複', ''],
    ]);
    expect(d.lanes[3].id).not.toBe('a');
    expect(d.categories[0].color).toBe('#4f7cff');
    expect(d.events.map((e) => e.title)).toEqual(['ok', 'range', 'dup']);
    expect(d.events[0].start).toBe('1925-03-12 09:00');
    expect(d.events[1]).toMatchObject({ kind: 'point', end: '' });
    expect(d.events[2].id).not.toBe('e1');
    expect(d.events[2].laneId).toBe('');
    expect(d.events[2].people).toEqual(['A', 'B']);
    expect(d.markers).toEqual([]);
    expect(d.progress.on).toBe(false);
    expect(normalizeDoc(null)).toBeNull();
    expect(normalizeDoc('x')).toBeNull();
  });
  it('範例本身整理後不變', () => {
    expect(normalizeDoc(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });
  it('相關角色的分隔與顏色的順序', () => {
    expect(splitPeople('甲、乙，丙,丁／戊/甲')).toEqual(['甲', '乙', '丙', '丁', '戊']);
    const e = doc.events.find((x) => x.id === 'ex-dinner');
    expect(e && eventColor(doc, e)).toBe('#2b9fc2');
    const e2 = doc.events.find((x) => x.id === 'ex-arrive');
    expect(e2 && eventColor(doc, e2)).toBe('#4f7cff');
  });
});

describe('匯出的圖（3.8）', () => {
  const measures = {
    item: (t: string) => estimateWidth(t, 12),
    small: (t: string) => estimateWidth(t, 11),
    lane: (t: string) => estimateWidth(t, 12),
    title: (t: string) => estimateWidth(t, 18),
  };
  const strings = {
    untitled: '（無標題）',
    main: '主線',
    fallbackTitle: '劇本時間表',
    gmUse: 'GM 用',
    progress: '目前進度',
    now: '現在',
    rangeText: '範圍',
  };
  const texts = (list: Prim[]): string[] =>
    list.flatMap((p) => (p.t === 'clip' ? texts(p.children) : p.t === 'text' ? [p.text] : []));
  const range = { a: dateValue(1925, 3, 4), b: dateValue(1925, 3, 15) };
  const build = (audience: 'gm' | 'pl', extra: Partial<Parameters<typeof buildPicture>[0]> = {}) =>
    buildPicture({
      vdoc: visibleDoc(doc, audience),
      range,
      width: 1600,
      title: true,
      legend: true,
      theme: 'light',
      collapsed: {},
      measures,
      strings,
      nowV: null,
      ...extra,
    });
  it('PL 用沒有 GM 的東西；GM 用有「GM 用」與斜線', () => {
    const pl = texts(build('pl').prims);
    expect(pl).toContain('黑水灣燈塔的三日');
    expect(pl).toContain('抵達黑水灣車站');
    expect(pl).not.toContain('第一次召喚儀式');
    expect(pl).not.toContain('GM 用');
    expect(pl).not.toContain('深潮會');
    const gmPic = build('gm');
    const gm = texts(gmPic.prims);
    expect(gm).toContain('GM 用');
    expect(gm).toContain('深潮會');
    expect(gm).toContain('GM');
    expect(gmPic.width).toBe(1600);
    expect(gmPic.height).toBeGreaterThan(build('pl').height);
  });
  it('圖例只有用到的分類；沒有標題時從刻度開始', () => {
    const pl = texts(build('pl').prims);
    expect(pl).toContain('線索');
    expect(pl).not.toContain('危險');
    const noTitle = build('pl', { title: false, legend: false });
    expect(noTitle.height).toBeLessThan(build('pl').height);
    expect(texts(noTitle.prims)).not.toContain('線索');
  });
  it('只畫範圍裡的事件', () => {
    const p = build('gm', { range: { a: dateValue(1925, 3, 13), b: dateValue(1925, 3, 14) } });
    const t = texts(p.prims);
    expect(t).not.toContain('委託信寄出');
    expect(t).toContain('調查燈塔');
  });
  it('SVG：標題、跳脫、剪裁、字型', () => {
    const pic = build('gm');
    const svg = pictureToSvg(pic, '@font-face{}');
    expect(svg.startsWith('<?xml')).toBe(true);
    expect(svg).toContain('<title>黑水灣燈塔的三日</title>');
    expect(svg).toContain('<clipPath id="c1">');
    expect(svg).toContain('@font-face{}');
    expect(svg).toContain(`width="${pic.width}" height="${pic.height}"`);
    const chars = pictureChars(pic);
    expect(chars.get(700)?.has('黑')).toBe(true);
    const d: TimelineDoc = {
      ...blankDoc(),
      title: 'a<b>&"c"',
      events: [newEvent({ start: '1925' })],
    };
    const svg2 = pictureToSvg(
      buildPicture({
        vdoc: visibleDoc(d, 'pl'),
        range: { a: dateValue(1924), b: dateValue(1927) },
        width: 800,
        title: true,
        legend: true,
        theme: 'dark',
        collapsed: {},
        measures,
        strings,
        nowV: null,
      }),
    );
    expect(svg2).toContain('a&lt;b&gt;&amp;&quot;c&quot;');
    expect(svg2).toContain('#111827');
  });
});
