// @vitest-environment jsdom
/**
 * log-converter 的 EPUB 電子書（2026-10，規格 F104～F113、3.13、5. D 項）：
 * ZIP 結構（mimetype 第一個、不壓縮）、OPF／nav／NCX／XHTML 都能被 XML 解析、manifest 與 spine 一致、
 * 分章（不分章、依分頁、依標記、依則數）、章節順序與內容、XHTML 的跳脫與淨化、直排、封面、字型檔、
 * 角色顏色、識別碼、大日誌（2 萬則）、設定的讀回（資料版本 2）。
 */
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '@/core/color';
import { unzipFiles, zipFiles } from '@/core/files';
import type { LogEntry } from '@/tools/log-converter/classify';
import {
  buildEpub,
  EPUB_FILE_LIMIT,
  type EpubInput,
  type EpubMedia,
  epubIdentifier,
  epubInputFrom,
  epubSettingsOf,
  fontFormatOf,
  planChapters,
  readableOnWhite,
} from '@/tools/log-converter/epub/book';
import {
  htmlToPlainText,
  htmlToXhtml,
  stripInvalidXml,
  xmlAttr,
  xmlText,
} from '@/tools/log-converter/epub/xhtml';
import { loadLogFiles, sourceTabs } from '@/tools/log-converter/load';
import { type LogChoices, prepareConversion } from '@/tools/log-converter/pipeline';
import { convertLog } from '@/tools/log-converter/render';
import {
  DEFAULT_SETTINGS,
  type LcSettings,
  normalizeSettings,
  SETTINGS_VERSION,
} from '@/tools/log-converter/settings';
import LC from '../../../docs/refactor/specs/log-converter.examples.json';

const SAMPLES = (LC as unknown as { 樣本日誌: Record<string, string> }).樣本日誌;
const LEGACY = '[小芋、阿和] 霧港燈塔 [main].html';
const NOW = new Date(Date.UTC(2026, 9, 15, 8, 9, 10, 456));
const NS = {
  opf: 'http://www.idpf.org/2007/opf',
  dc: 'http://purl.org/dc/elements/1.1/',
  xhtml: 'http://www.w3.org/1999/xhtml',
  ops: 'http://www.idpf.org/2007/ops',
  ncx: 'http://www.daisy.org/z3986/2005/ncx/',
  container: 'urn:oasis:names:tc:opendocument:xmlns:container',
};

const NO_MEDIA: EpubMedia = { images: [], illustrations: [], cover: null, fontFile: null };

const choices = (p: Partial<LogChoices> = {}): LogChoices => ({
  title: '霧港燈塔',
  subtitle: '',
  summary: '',
  narrator: null,
  chatTab: null,
  nameColors: {},
  hiddenTabs: [],
  tabStyles: {},
  useLogImages: true,
  ...p,
});

/** 和介面相同的流程：載入 → 轉換 → 整理成 EPUB 的輸入 */
function inputFor(
  files: { name: string; text: string }[],
  s: Partial<LcSettings> = {},
  c: Partial<LogChoices> = {},
  media: EpubMedia = NO_MEDIA,
): EpubInput {
  const r = loadLogFiles(files);
  if (!r.ok) throw new Error('empty');
  const settings = { ...DEFAULT_SETTINGS, epubMode: true, ...s };
  const conv = prepareConversion(
    r.source,
    settings,
    choices({ narrator: 'GM', chatTab: 'other', ...c }),
    { profileImages: {}, messageImages: {} },
    [],
  );
  const result = convertLog(conv.entries, conv.options, conv.rule, conv.fileBase);
  return epubInputFrom(
    result.options,
    conv.entries,
    sourceTabs(r.source),
    epubSettingsOf(settings),
    media,
    NOW,
  );
}

const legacyInput = (s: Partial<LcSettings> = {}, c: Partial<LogChoices> = {}, m = NO_MEDIA) =>
  inputFor([{ name: LEGACY, text: SAMPLES[LEGACY] }], s, c, m);

interface Book {
  bytes: Uint8Array;
  names: string[];
  text: (name: string) => string;
  xml: (name: string) => Document;
  opf: Document;
  /** spine 依序的 XHTML 路徑（OEBPS/ 之下） */
  spine: string[];
  /** 章節檔（OEBPS/text/…）依 spine 順序 */
  chapters: string[];
  nav: Document;
}

const parseXml = (text: string, name: string): Document => {
  const doc = new DOMParser().parseFromString(
    text,
    name.endsWith('.xhtml') ? 'application/xhtml+xml' : 'application/xml',
  );
  const err = doc.getElementsByTagName('parsererror');
  if (err.length) throw new Error(`${name} 不是格式正確的 XML：${err[0].textContent}`);
  return doc;
};

async function open(input: EpubInput): Promise<Book> {
  const bytes = await buildEpub(input);
  const files = unzipFiles(bytes);
  const map = new Map(files.map((f) => [f.name, f.data]));
  const text = (name: string) => {
    const d = map.get(name);
    if (!d) throw new Error(`沒有 ${name}`);
    return new TextDecoder('utf-8', { fatal: true }).decode(d);
  };
  const xml = (name: string) => parseXml(text(name), name);
  const opf = xml('OEBPS/content.opf');
  const items = new Map(
    [...opf.getElementsByTagNameNS(NS.opf, 'item')].map((it) => [
      it.getAttribute('id')!,
      it.getAttribute('href')!,
    ]),
  );
  const spine = [...opf.getElementsByTagNameNS(NS.opf, 'itemref')].map(
    (r) => items.get(r.getAttribute('idref')!)!,
  );
  return {
    bytes,
    names: files.map((f) => f.name),
    text,
    xml,
    opf,
    spine,
    chapters: spine.filter((h) => h.startsWith('text/')).map((h) => `OEBPS/${h}`),
    nav: xml('OEBPS/nav.xhtml'),
  };
}

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (u16(b, o) | (u16(b, o + 2) << 16)) >>> 0;
const ascii = (b: Uint8Array, from: number, to: number) =>
  String.fromCharCode(...b.subarray(from, to));

/** 章節檔裡的區塊種類（依出現順序） */
function blockKinds(doc: Document): string[] {
  const out: string[] = [];
  for (const el of doc.querySelectorAll('body > *')) {
    const c = el.getAttribute('class') ?? '';
    if (el.localName === 'h1') out.push('章名');
    else if (c.includes('narr')) out.push('旁白');
    else if (c.includes('dlg')) out.push('對話');
    else if (c.includes('sys')) out.push('擲骰');
    else if (c.includes('chat')) out.push('閒聊');
    else if (c.includes('scene')) out.push('場景分隔');
    else if (c.includes('ill')) out.push('插圖');
    else out.push(`?${el.localName}.${c}`);
  }
  return out;
}

const navLabels = (b: Book) =>
  [...b.nav.querySelectorAll('nav#toc li > a')].map((a) => a.textContent);

describe('ZIP 結構（3.13.1）', () => {
  it('mimetype 是第一個檔、不壓縮、沒有額外欄位與資料描述；其餘依序', async () => {
    const b = await open(legacyInput());
    const z = b.bytes;
    expect(u32(z, 0)).toBe(0x04034b50);
    expect(u16(z, 6) & 0x08).toBe(0);
    expect(u16(z, 8)).toBe(0);
    expect(u32(z, 18)).toBe(20);
    expect(u32(z, 22)).toBe(20);
    expect(u16(z, 26)).toBe(8);
    expect(u16(z, 28)).toBe(0);
    expect(ascii(z, 30, 38)).toBe('mimetype');
    expect(ascii(z, 38, 58)).toBe('application/epub+zip');
    expect(b.names.slice(0, 3)).toEqual([
      'mimetype',
      'META-INF/container.xml',
      'OEBPS/content.opf',
    ]);
    expect(b.names).toEqual([
      'mimetype',
      'META-INF/container.xml',
      'OEBPS/content.opf',
      'OEBPS/nav.xhtml',
      'OEBPS/toc.ncx',
      'OEBPS/style.css',
      'OEBPS/title.xhtml',
      'OEBPS/text/c001-01.xhtml',
    ]);
    const container = b.xml('META-INF/container.xml');
    const rootfile = container.getElementsByTagNameNS(NS.container, 'rootfile')[0];
    expect(rootfile.getAttribute('full-path')).toBe('OEBPS/content.opf');
    expect(rootfile.getAttribute('media-type')).toBe('application/oebps-package+xml');
  });

  it('所有 XML（OPF、nav、NCX、XHTML、container）都格式正確；manifest 與 ZIP 的檔一一對應；spine 都在 manifest 裡', async () => {
    const b = await open(
      legacyInput({ epubChapters: 'tab', epubAuthor: '小芋 & 阿和', epubWriting: 'vertical' }),
    );
    for (const name of b.names)
      if (/\.(xhtml|opf|ncx|xml)$/.test(name)) expect(() => b.xml(name), name).not.toThrow();
    const items = [...b.opf.getElementsByTagNameNS(NS.opf, 'item')];
    const hrefs = items.map((it) => `OEBPS/${it.getAttribute('href')}`);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    const inZip = b.names.filter(
      (n) => !['mimetype', 'META-INF/container.xml', 'OEBPS/content.opf'].includes(n),
    );
    expect([...hrefs].sort()).toEqual([...inZip].sort());
    const ids = new Set(items.map((it) => it.getAttribute('id')));
    for (const ref of b.opf.getElementsByTagNameNS(NS.opf, 'itemref'))
      expect(ids.has(ref.getAttribute('idref'))).toBe(true);
    const nav = items.filter((it) => it.getAttribute('properties') === 'nav');
    expect(nav.map((it) => it.getAttribute('href'))).toEqual(['nav.xhtml']);
    const types = Object.fromEntries(
      items.map((it) => [it.getAttribute('href'), it.getAttribute('media-type')]),
    );
    expect(types['toc.ncx']).toBe('application/x-dtbncx+xml');
    expect(types['style.css']).toBe('text/css');
    expect(types['title.xhtml']).toBe('application/xhtml+xml');
    /* 每個 XHTML：lang、xml:lang、不是空白的 title、樣式表 */
    for (const name of b.names.filter((n) => n.endsWith('.xhtml'))) {
      const doc = b.xml(name);
      const html = doc.documentElement;
      expect(html.namespaceURI).toBe(NS.xhtml);
      expect(html.getAttribute('lang')).toBe('zh-Hant');
      expect(html.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang')).toBe('zh-Hant');
      expect(doc.querySelector('title')?.textContent?.trim()).not.toBe('');
      expect(doc.querySelector('link[rel="stylesheet"]')).not.toBeNull();
      expect(
        b.text(name).startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>'),
      ).toBe(true);
      expect(b.text(name)).not.toMatch(/<script/i);
    }
  });
});

describe('套件文件與導覽（3.13.1、3.13.6、F105）', () => {
  it('metadata：識別碼、書名、語言、作者、說明、修改時間', async () => {
    const b = await open(legacyInput({ epubAuthor: '小芋 & 阿和' }, { summary: '霧中的燈塔' }));
    const pkg = b.opf.documentElement;
    expect(pkg.getAttribute('version')).toBe('3.0');
    const uid = pkg.getAttribute('unique-identifier')!;
    const ident = b.opf.getElementById(uid) ?? b.opf.querySelector(`[id="${uid}"]`);
    expect(ident?.textContent).toMatch(
      /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    const dc = (n: string) => [...b.opf.getElementsByTagNameNS(NS.dc, n)].map((e) => e.textContent);
    expect(dc('title')).toEqual(['霧港燈塔']);
    expect(dc('language')).toEqual(['zh-Hant']);
    expect(dc('creator')).toEqual(['小芋 & 阿和']);
    expect(dc('description')).toEqual(['霧中的燈塔']);
    const modified = [...b.opf.getElementsByTagNameNS(NS.opf, 'meta')].find(
      (m) => m.getAttribute('property') === 'dcterms:modified',
    );
    expect(modified?.textContent).toBe('2026-10-15T08:09:10Z');
    /* NCX 的 uid 與識別碼相同 */
    const ncx = b.xml('OEBPS/toc.ncx');
    const uidMeta = [...ncx.getElementsByTagNameNS(NS.ncx, 'meta')].find(
      (m) => m.getAttribute('name') === 'dtb:uid',
    );
    expect(uidMeta?.getAttribute('content')).toBe(ident?.textContent);
    /* 書名頁 */
    const title = b.xml('OEBPS/title.xhtml');
    expect(title.querySelector('h1')?.textContent).toBe('霧港燈塔');
    expect(title.body.textContent).toContain('小芋 & 阿和');
    expect(title.body.textContent).toContain('霧中的燈塔');
  });

  it('沒有作者、摘要時不寫；書名只有空白時用預設標題', async () => {
    const b = await open(legacyInput({}, { title: '   ' }));
    expect(b.opf.getElementsByTagNameNS(NS.dc, 'creator')).toHaveLength(0);
    expect(b.opf.getElementsByTagNameNS(NS.dc, 'description')).toHaveLength(0);
    expect(b.opf.getElementsByTagNameNS(NS.dc, 'title')[0].textContent).toBe('跑團日誌');
  });

  it('識別碼：同一份日誌與書名每次相同（匯出時間不影響）；換書名或內容就不同', () => {
    const a = legacyInput();
    const later = { ...a, modified: new Date(Date.UTC(2027, 0, 1)) };
    expect(epubIdentifier(later)).toBe(epubIdentifier(a));
    expect(epubIdentifier({ ...a, author: '別人' })).toBe(epubIdentifier(a));
    expect(epubIdentifier({ ...a, title: '別的書' })).not.toBe(epubIdentifier(a));
    expect(epubIdentifier({ ...a, entries: a.entries.slice(1) })).not.toBe(epubIdentifier(a));
  });

  it('spine：書名頁 → 目錄頁（2 章以上）→ 各章；不分章時沒有目錄頁、目錄只有一項（書名）', async () => {
    const single = await open(legacyInput());
    expect(single.spine).toEqual(['title.xhtml', 'text/c001-01.xhtml']);
    expect(navLabels(single)).toEqual(['霧港燈塔']);
    /* landmarks 只連到 spine 裡的檔（目錄頁不在 spine 時沒有 toc 這一項） */
    expect(
      [...single.nav.querySelectorAll('nav#landmarks a')].map((a) =>
        a.getAttributeNS(NS.ops, 'type'),
      ),
    ).toEqual(['bodymatter']);
    const tabs = await open(legacyInput({ epubChapters: 'tab' }));
    expect(tabs.spine).toEqual([
      'title.xhtml',
      'nav.xhtml',
      'text/c001-01.xhtml',
      'text/c002-01.xhtml',
      'text/c003-01.xhtml',
    ]);
    const links = [...tabs.nav.querySelectorAll('nav#toc a')].map((a) => a.getAttribute('href'));
    expect(links).toEqual(['text/c001-01.xhtml', 'text/c002-01.xhtml', 'text/c003-01.xhtml']);
    /* landmarks：目錄、本文 */
    const marks = [...tabs.nav.querySelectorAll('nav#landmarks a')].map((a) =>
      a.getAttributeNS(NS.ops, 'type'),
    );
    expect(marks).toEqual(['toc', 'bodymatter']);
    /* NCX 一章一個 navPoint */
    const points = [...tabs.xml('OEBPS/toc.ncx').getElementsByTagNameNS(NS.ncx, 'navPoint')];
    expect(points.map((p) => p.getAttribute('playOrder'))).toEqual(['1', '2', '3']);
    expect(points.map((p) => p.getElementsByTagNameNS(NS.ncx, 'text')[0].textContent)).toEqual([
      'main',
      'info',
      'other',
    ]);
  });
});

describe('章節內容（3.13.3、3.13.4、F113）', () => {
  it('不分章：與網頁小說相同的分類與順序（閒聊組、系統訊息、場景分隔）；沒有章名', async () => {
    const b = await open(legacyInput());
    expect(b.chapters).toEqual(['OEBPS/text/c001-01.xhtml']);
    const doc = b.xml(b.chapters[0]);
    expect(blockKinds(doc)).toEqual([
      '旁白',
      '旁白',
      '對話',
      '對話',
      '擲骰',
      '旁白',
      '旁白',
      '對話',
      '閒聊',
      '擲骰',
      '場景分隔',
      '擲骰',
      '對話',
      '對話',
      '旁白',
      '對話',
    ]);
    const dlg = [...doc.querySelectorAll('p.dlg')];
    expect(dlg[0].querySelector('.name')?.textContent).toBe('林曉雨');
    expect(dlg[0].textContent).toBe('林曉雨：「有人在嗎？」');
    /* 合併前的 & 與換行 */
    expect(dlg[3].textContent).toBe('陳志明：我把日誌收進防水袋 & 背起來。');
    expect(dlg[5].innerHTML).toContain('「等等，樓上有聲音。」<br');
    /* 閒聊：摺疊時有標題（則數）、每則「名稱：內容」 */
    const chat = doc.querySelector('div.chat')!;
    expect(chat.querySelector('.chat-title')?.textContent).toBe('閒聊訊息（2 則）');
    expect([...chat.querySelectorAll('p:not(.chat-title)')].map((p) => p.textContent)).toEqual([
      '小芋：這團好冷 www',
      '阿和：我去泡個麵 5 分鐘',
    ]);
    /* 系統訊息：名稱（system → 系統）＋內容 */
    const sys = [...doc.querySelectorAll('div.sys')];
    expect(sys[1].querySelector('.sys-name')?.textContent).toBe('系統');
    expect(sys[1].querySelector('.sys-body')?.textContent).toBe('[ 陳志明 ] SAN : 48 → 45');
    expect(doc.querySelector('p.scene')?.textContent).toBe('***');
    expect(doc.querySelector('h1')).toBeNull();
  });

  it('依分頁：每個輸出的分頁一章（依出現順序），不輸出的分頁不成章；章名在第一個檔的開頭', async () => {
    const b = await open(legacyInput({ epubChapters: 'tab' }, { hiddenTabs: ['info'] }));
    expect(navLabels(b)).toEqual(['main', 'other']);
    const main = b.xml(b.chapters[0]);
    expect(main.querySelector('body > h1')?.textContent).toBe('main');
    expect(blockKinds(main)[0]).toBe('章名');
    expect(main.body.textContent).not.toContain('航海日誌最後一頁');
    const other = b.xml(b.chapters[1]);
    expect(blockKinds(other)).toEqual(['章名', '閒聊']);
  });

  it('依標記：從含標記的那一則開新章；章名取第一行（30 字）；整則只有章名時不重複；閒聊不比對', async () => {
    const b = await open(
      legacyInput({ epubChapters: 'marker', epubMarkers: '  線索 \n\n泡個麵\n樓上有聲音' }),
    );
    expect(navLabels(b)).toEqual([
      '開頭',
      '【線索】航海日誌最後一頁寫著：「別讓燈熄了」。',
      '「等等，樓上有聲音。」',
    ]);
    const second = b.xml(b.chapters[1]);
    /* 整則只有章名：不再出現在內文 */
    expect(second.querySelectorAll('p.narr')[0]?.textContent).not.toContain('【線索】');
    /* 第二行還有內容：照常出現 */
    const third = b.xml(b.chapters[2]);
    expect(blockKinds(third)).toEqual(['章名', '對話']);
    /* 沒有任何一則符合：同不分章 */
    const none = await open(legacyInput({ epubChapters: 'marker', epubMarkers: '不存在的字' }));
    expect(navLabels(none)).toEqual(['霧港燈塔']);
    expect(none.xml(none.chapters[0]).querySelector('h1')).toBeNull();
  });

  it('依標記：超過 30 字的章名截斷加「…」，那一則照常出現', () => {
    const long = 'A'.repeat(40);
    const text = `<p><span> [main]</span><span>GM</span> : <span>${long}</span></p><p><span> [main]</span><span>B</span> : <span>x</span></p>`;
    const input = inputFor(
      [{ name: 'x.html', text }],
      { epubChapters: 'marker', epubMarkers: 'AAA' },
      {},
    );
    const plan = planChapters(input);
    expect(plan.map((c) => c.title)).toEqual([`${'A'.repeat(30)}…`]);
    expect(plan[0].skip.size).toBe(0);
  });

  it('依則數：每 n 則一章，章名「第 a～b 則」', async () => {
    const b = await open(legacyInput({ epubChapters: 'count', epubChapterSize: 5 }));
    expect(navLabels(b)).toEqual(['第 1～5 則', '第 6～10 則', '第 11～15 則', '第 16～17 則']);
  });

  it('系統訊息隱藏、閒聊完全隱藏、閒聊全部顯示（沒有標題）、不顯示數量', async () => {
    const hidden = await open(legacyInput({ hideSystem: true, chatMode: 'hide' }));
    const kinds = blockKinds(hidden.xml(hidden.chapters[0]));
    expect(kinds).not.toContain('擲骰');
    expect(kinds).not.toContain('閒聊');
    const shown = await open(legacyInput({ chatMode: 'show' }));
    expect(shown.xml(shown.chapters[0]).querySelector('.chat-title')).toBeNull();
    const noCount = await open(legacyInput({ showChatCount: false }));
    expect(noCount.xml(noCount.chapters[0]).querySelector('.chat-title')?.textContent).toBe(
      '閒聊訊息',
    );
  });

  it('副旁白：旁白（斜體）、對話（斜體）、旁白（指定顏色，調深）', async () => {
    const b = await open(
      legacyInput({
        subNarrators: [
          { speaker: '林曉雨', style: 'italic-narration', color: '#a0a7b4' },
          { speaker: '陳志明', style: 'italic-dialogue', color: '#a0a7b4' },
          { speaker: '蘇菲亞・范德比爾特三世', style: 'colored-narration', color: '#ffffff' },
        ],
      }),
    );
    const doc = b.xml(b.chapters[0]);
    const narr = [...doc.querySelectorAll('p.narr')];
    expect(narr.some((p) => p.classList.contains('it') && p.textContent === '「有人在嗎？」')).toBe(
      true,
    );
    const colored = narr.find((p) => p.textContent === '「讓我看看那盞燈。」')!;
    const color = /color:\s*(#[0-9a-f]{6})/.exec(colored.getAttribute('style') ?? '')![1];
    expect(contrastRatio(color, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    const dlg = [...doc.querySelectorAll('p.dlg')].find((p) =>
      p.textContent?.startsWith('陳志明'),
    )!;
    expect(dlg.querySelector('.it')?.textContent).toBe('「這字跡……是老鄭的。」');
  });

  it('角色顏色：名稱文字（太淺的調深）、色塊、不使用', async () => {
    const colors = { 林曉雨: '#ffffff', 陳志明: '#123456' };
    const text = await open(legacyInput({}, { nameColors: colors }));
    const names = [...text.xml(text.chapters[0]).querySelectorAll('p.dlg .name')];
    const lin = names.find((n) => n.textContent === '林曉雨')!;
    const c = /color:\s*(#[0-9a-f]{6})/.exec(lin.getAttribute('style') ?? '')![1];
    expect(contrastRatio(c, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(names.find((n) => n.textContent === '陳志明')!.getAttribute('style')).toBe(
      'color:#123456',
    );
    const mark = await open(legacyInput({ epubNameColor: 'mark' }, { nameColors: colors }));
    const m = mark.xml(mark.chapters[0]).querySelector('p.dlg .mark')!;
    expect(m.textContent).toBe('■');
    expect(m.getAttribute('style')).toMatch(/^color:#[0-9a-f]{6}$/);
    expect(
      mark.xml(mark.chapters[0]).querySelector('p.dlg .name')?.getAttribute('style'),
    ).toBeNull();
    const none = await open(legacyInput({ epubNameColor: 'none' }, { nameColors: colors }));
    expect(none.text(none.chapters[0])).not.toMatch(/style="color/);
  });

  it('插圖：放進 images/，依大小與對齊；網址插圖不放', async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
    const media: EpubMedia = {
      ...NO_MEDIA,
      images: [{ bytes: png, mime: 'image/png' }],
      illustrations: [{ position: 3, image: 0, size: 'small', align: 'right' }],
    };
    const b = await open(legacyInput({}, {}, media));
    expect(b.names).toContain('OEBPS/images/ill-001.png');
    const doc = b.xml(b.chapters[0]);
    expect(blockKinds(doc).slice(0, 4)).toEqual(['旁白', '旁白', '對話', '插圖']);
    const img = doc.querySelector('div.ill img')!;
    expect(img.getAttribute('src')).toBe('../images/ill-001.png');
    expect(img.getAttribute('alt')).toBe('插圖');
    expect(img.getAttribute('class')).toBe('ill-small');
    expect(doc.querySelector('div.ill')?.getAttribute('class')).toBe('ill ill-right');
  });
});

describe('排版方向、封面、字型（3.13.5、F108、F109、F111）', () => {
  it('直排：writing-mode、由右往左翻頁、Kindle 的 primary-writing-mode', async () => {
    const b = await open(legacyInput({ epubWriting: 'vertical' }));
    expect(
      b.opf.getElementsByTagNameNS(NS.opf, 'spine')[0].getAttribute('page-progression-direction'),
    ).toBe('rtl');
    const meta = [...b.opf.getElementsByTagNameNS(NS.opf, 'meta')].find(
      (m) => m.getAttribute('name') === 'primary-writing-mode',
    );
    expect(meta?.getAttribute('content')).toBe('vertical-rl');
    const css = b.text('OEBPS/style.css');
    expect(css).toMatch(/writing-mode:\s*vertical-rl/);
    expect(css).toMatch(/-epub-writing-mode:\s*vertical-rl/);
    const h = await open(legacyInput());
    expect(
      h.opf.getElementsByTagNameNS(NS.opf, 'spine')[0].hasAttribute('page-progression-direction'),
    ).toBe(false);
    expect(h.text('OEBPS/style.css')).not.toMatch(/vertical-rl/);
  });

  it('封面：cover-image、封面頁在 spine 第一個、EPUB 2 的 meta cover', async () => {
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
    const b = await open(
      legacyInput({}, {}, { ...NO_MEDIA, cover: { bytes: jpg, mime: 'image/jpeg' } }),
    );
    const item = [...b.opf.getElementsByTagNameNS(NS.opf, 'item')].find(
      (it) => it.getAttribute('properties') === 'cover-image',
    )!;
    expect(item.getAttribute('href')).toBe('images/cover.jpg');
    expect(item.getAttribute('media-type')).toBe('image/jpeg');
    const meta = [...b.opf.getElementsByTagNameNS(NS.opf, 'meta')].find(
      (m) => m.getAttribute('name') === 'cover',
    );
    expect(meta?.getAttribute('content')).toBe(item.getAttribute('id'));
    expect(b.spine[0]).toBe('cover.xhtml');
    expect(b.xml('OEBPS/cover.xhtml').querySelector('img')?.getAttribute('src')).toBe(
      'images/cover.jpg',
    );
    const marks = [...b.nav.querySelectorAll('nav#landmarks a')].map((a) =>
      a.getAttributeNS(NS.ops, 'type'),
    );
    expect(marks[0]).toBe('cover');
    expect([...unzipFiles(b.bytes)].find((f) => f.name === 'OEBPS/images/cover.jpg')!.data).toEqual(
      jpg,
    );
  });

  it('字型：明體／黑體的字型堆疊；嵌入字型檔時 @font-face 放在最前面', async () => {
    const serif = await open(legacyInput());
    expect(serif.text('OEBPS/style.css')).toMatch(/font-family:[^;]*"Noto Serif TC"[^;]*serif/);
    const sans = await open(legacyInput({ epubFont: 'sans' }));
    expect(sans.text('OEBPS/style.css')).toMatch(/font-family:[^;]*"Noto Sans TC"[^;]*sans-serif/);
    const ttf = new Uint8Array([0, 1, 0, 0, 0, 9, 0, 0]);
    const b = await open(
      legacyInput({}, {}, { ...NO_MEDIA, fontFile: { bytes: ttf, format: 'ttf' } }),
    );
    const item = [...b.opf.getElementsByTagNameNS(NS.opf, 'item')].find(
      (it) => it.getAttribute('href') === 'fonts/book.ttf',
    );
    expect(item?.getAttribute('media-type')).toBe('font/ttf');
    const css = b.text('OEBPS/style.css');
    expect(css).toMatch(/@font-face\s*\{[^}]*src:\s*url\("fonts\/book\.ttf"\)/);
    expect(css).toMatch(/font-family:\s*"LogBook",/);
  });

  it('字型檔以檔頭辨認', () => {
    const b = (...xs: number[]) => new Uint8Array([...xs, 0, 0, 0, 0]);
    expect(fontFormatOf(b(0, 1, 0, 0))).toBe('ttf');
    expect(fontFormatOf(b(0x74, 0x72, 0x75, 0x65))).toBe('ttf');
    expect(fontFormatOf(b(0x4f, 0x54, 0x54, 0x4f))).toBe('otf');
    expect(fontFormatOf(b(0x77, 0x4f, 0x46, 0x46))).toBe('woff');
    expect(fontFormatOf(b(0x77, 0x4f, 0x46, 0x32))).toBe('woff2');
    expect(fontFormatOf(b(0x50, 0x4b, 3, 4))).toBeNull();
    expect(fontFormatOf(new Uint8Array([0, 1]))).toBeNull();
  });
});

describe('XHTML 的跳脫與淨化（3.13.2、5. D3）', () => {
  const wellFormed = (frag: string) =>
    parseXml(`<div xmlns="http://www.w3.org/1999/xhtml">${frag}</div>`, 'frag.xml');

  it('文字與屬性跳脫；拿掉 XML 不允許的字元；Tab、換行保留', () => {
    expect(xmlText('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
    expect(xmlAttr('"x" & \'y\'')).toBe('&quot;x&quot; &amp; &#39;y&#39;');
    expect(stripInvalidXml('a\u0000b\u0008c\u000bd\u001fe\u007ff\u0085g￾h￿i')).toBe('abcdefghi');
    expect(stripInvalidXml('t\tn\nr\r\nx')).toBe('t\tn\nr\nx');
    /* 落單的代理字元拿掉，完整的 emoji 保留 */
    expect(stripInvalidXml('😀😀\ud83dx\ude00y')).toBe('😀😀xy');
  });

  it('舊格式的 HTML 片段轉成格式正確的 XHTML', () => {
    const cases: [string, string][] = [
      ['a<br>b<BR/>c', 'a<br/>b<br/>c'],
      ['<b>粗</b> 與 <i>斜</i>', '<b>粗</b> 與 <i>斜</i>'],
      ['&nbsp;x&amp;y&lt;z&gt;&quot;&#39;&#x1F600;&hellip;', ' x&amp;y&lt;z&gt;"\'😀…'],
      ['&unknown; &#0; &#xD800;', '&amp;unknown;  '],
      ['<strike>刪</strike><big>大</big>', '<s>刪</s><span>大</span>'],
      ['<font color="#ff0000">紅</font>', '<span style="color: #ff0000">紅</span>'],
      ['<font color="red;background:url(x)">紅</font>', '<span>紅</span>'],
      [
        '<ruby><rb>漢</rb><rp>(</rp><rt>かん</rt><rp>)</rp></ruby>',
        '<ruby>漢<rp>(</rp><rt>かん</rt><rp>)</rp></ruby>',
      ],
      ['<span style="color: red; position: fixed">x</span>', '<span style="color: red">x</span>'],
      ['<span onclick="x()" class="y">x</span>', '<span>x</span>'],
      ['<b>沒關<i>上', '<b>沒關<i>上</i></b>'],
      ['多</b>出來', '多出來'],
      ['<div>區塊</div><img src=x onerror=y>', '區塊'],
      ['<script>alert(1)</script>後', '後'],
      ['a < b 3<4', 'a &lt; b 3&lt;4'],
      ['<!-- 註解 -->文', '文'],
      ['控制\u0001字元\ud800', '控制字元'],
      ['<b title="a"b">x</b>', '<b>x</b>'],
    ];
    for (const [input, out] of cases) {
      expect(htmlToXhtml(input), input).toBe(out);
      expect(() => wellFormed(htmlToXhtml(input)), input).not.toThrow();
    }
  });

  it('新格式的內容（跳脫過的純文字＋<br>）', () => {
    const v2 = '「&lt;秘密&gt;」 &amp; &quot;引號&quot; &#39;單引號&#39;<br>第二行 🎲';
    expect(htmlToXhtml(v2)).toBe('「&lt;秘密&gt;」 &amp; "引號" \'單引號\'<br/>第二行 🎲');
  });

  it('純文字（標記比對、章名）：br 換成換行、去掉標籤、解開字元參照', () => {
    expect(htmlToPlainText('<b>第一章</b>&nbsp;霧<br>第二行&amp;')).toBe('第一章 霧\n第二行&');
  });

  it('隨機片段一律格式正確', () => {
    const parts = [
      '<b>',
      '</b>',
      '<i>',
      '</i>',
      '<br>',
      '&amp;',
      '&',
      '<',
      '>',
      '"',
      "'",
      '&#x0;',
      '\u0002',
      '\ud83d',
      '😀',
      '<span style="color:red">',
      '</span>',
      '<font color=blue>',
      '</font>',
      '<x-y>',
      '</p>',
      '<!--',
      '-->',
      'あ',
      ' ',
      '\n',
      '&nbsp;',
      '&#12354;',
    ];
    let seed = 42;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let k = 0; k < 300; k++) {
      let s = '';
      for (let i = 0; i < 12; i++) s += parts[Math.floor(rnd() * parts.length)];
      expect(() => wellFormed(htmlToXhtml(s)), JSON.stringify(s)).not.toThrow();
    }
  });

  it('日誌裡的特殊字元匯出後仍是合法的 XHTML（舊格式與新格式）', async () => {
    const weird =
      'A &amp; B &lt;tag&gt; 😀 \u0001\u000b 落單\ud800 &hellip; <u>底線</u> <font color="#00ff00">綠</font>';
    const legacy = `<p><span> [main]</span><span>K&lt;P&gt;\u0007 "&amp;"</span> : <span>${weird}</span></p>`;
    const b = await open(inputFor([{ name: 'w.html', text: legacy }], { epubChapters: 'tab' }));
    for (const name of b.names.filter((n) => /\.(xhtml|opf|ncx)$/.test(n)))
      expect(() => b.xml(name), name).not.toThrow();
    const doc = b.xml(b.chapters[0]);
    const p = doc.querySelector('p.dlg')!;
    expect(p.querySelector('.name')?.textContent).toBe('K<P> "&"');
    expect(p.textContent).toContain('A & B <tag> 😀  落單 … 底線 綠');
    const v2 = await open(
      inputFor(
        [{ name: '霧港燈塔 [秘密].html', text: SAMPLES['霧港燈塔 [秘密].html'] }],
        {},
        { title: '秘密' },
      ),
    );
    expect(v2.xml(v2.chapters[0]).body.textContent).toContain('(1D100) ＞ 42');
  });
});

describe('角色顏色的調整（5. D6）', () => {
  it('對比不到 4.5:1 才調深；色相不變；本來就夠深的不動', () => {
    for (const c of ['#ffffff', '#e0e0e0', '#ffeb3b', '#88ccff', '#e91e63', '#aaaaaa']) {
      const out = readableOnWhite(c)!;
      expect(out).toMatch(/^#[0-9a-f]{6}$/);
      expect(contrastRatio(out, '#ffffff'), c).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(out, '#ffffff'), c).toBeLessThan(5.2);
    }
    expect(readableOnWhite('#123456')).toBe('#123456');
    expect(readableOnWhite('#2196F3'.toLowerCase())).not.toBe('#2196f3');
    const [r, g, b] = [1, 3, 5].map((i) =>
      Number.parseInt(readableOnWhite('#ffeb3b')!.slice(i, i + 2), 16),
    );
    expect(r).toBeGreaterThan(b);
    expect(g).toBeGreaterThan(b);
    expect(readableOnWhite('not-a-color')).toBeNull();
  });
});

/** 大日誌用的「則」（不經過載入，直接組出分類後的結果） */
function synthetic(n: number, line: (i: number) => string): LogEntry[] {
  const who = ['GM', '林曉雨', '陳志明'];
  return Array.from({ length: n }, (_, k) => ({
    num: k + 1,
    kind: k % 3 === 0 ? ('narration' as const) : ('dialogue' as const),
    tab: 'main',
    speaker: who[k % 3],
    lines: [line(k + 1)],
    avatar: null,
  }));
}

describe('大日誌（5. D8）', () => {
  it('2 萬則：每則只出現一次、依序；章節檔不超過大小上限（另加一個區塊）', async () => {
    const input = {
      ...legacyInput(),
      entries: synthetic(20000, (i) => `第 ${i} 則訊息，霧越來越濃。`),
    };
    const t0 = performance.now();
    const bytes = await buildEpub(input);
    const ms = performance.now() - t0;
    const files = unzipFiles(bytes).filter((f) => f.name.startsWith('OEBPS/text/'));
    expect(files.length).toBeGreaterThan(5);
    let next = 1;
    for (const f of files) {
      expect(f.data.length).toBeLessThan(EPUB_FILE_LIMIT + 4096);
      const text = new TextDecoder().decode(f.data);
      for (const m of text.matchAll(/第 (\d+) 則訊息/g)) {
        expect(Number(m[1])).toBe(next);
        next += 1;
      }
    }
    expect(next).toBe(20001);
    console.info(
      `2 萬則 EPUB：${ms.toFixed(0)} ms、${(bytes.length / 1024).toFixed(0)} KB、${files.length} 個章節檔`,
    );
  });

  it('分段讓出：主執行緒產生時每個章節檔之後呼叫 pause，進度單調遞增到 1', async () => {
    const input = { ...legacyInput(), entries: synthetic(6000, (i) => `${'字'.repeat(20)}${i}`) };
    let pauses = 0;
    const progress: number[] = [];
    await buildEpub(input, {
      pause: async () => {
        pauses += 1;
      },
      onProgress: (p) => progress.push(p),
    });
    expect(pauses).toBeGreaterThan(1);
    expect(progress.at(-1)).toBe(1);
    for (let i = 1; i < progress.length; i++)
      expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1]);
  });
});

describe('設定（F104～F110、資料版本 2）', () => {
  it('預設值、讀回時修正；版本 1 的存檔沒有 EPUB 設定時用預設值', () => {
    expect(SETTINGS_VERSION).toBe(2);
    expect(DEFAULT_SETTINGS).toMatchObject({
      epubMode: false,
      epubAuthor: '',
      epubChapters: 'single',
      epubMarkers: '',
      epubChapterSize: 500,
      epubWriting: 'horizontal',
      epubFont: 'serif',
      epubNameColor: 'text',
    });
    const v1 = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
    for (const k of Object.keys(v1)) if (k.startsWith('epub')) delete v1[k];
    expect(normalizeSettings(v1)).toEqual(DEFAULT_SETTINGS);
    const s = normalizeSettings({
      epubMode: true,
      epubAuthor: 3,
      epubChapters: 'bogus',
      epubMarkers: '第一天\n第二天',
      epubChapterSize: 0,
      epubWriting: 'vertical',
      epubFont: 'sans',
      epubNameColor: 'mark',
    });
    expect(s).toMatchObject({
      epubMode: true,
      epubAuthor: '',
      epubChapters: 'single',
      epubMarkers: '第一天\n第二天',
      epubChapterSize: 500,
      epubWriting: 'vertical',
      epubFont: 'sans',
      epubNameColor: 'mark',
    });
    expect(epubSettingsOf(s)).toEqual({
      author: '',
      chapters: 'single',
      markers: ['第一天', '第二天'],
      chapterSize: 500,
      writing: 'vertical',
      font: 'sans',
      nameColor: 'mark',
    });
  });
});

describe('共用 ZIP：每個檔可以有自己的壓縮等級（core/files）', () => {
  it('level 0 的檔不壓縮，其他照預設壓縮', () => {
    const big = 'x'.repeat(5000);
    const z = zipFiles([
      { name: 'a.txt', data: big, level: 0 },
      { name: 'b.txt', data: big },
    ]);
    expect(u16(z, 8)).toBe(0);
    expect(u32(z, 18)).toBe(5000);
    const files = unzipFiles(z);
    expect(files.map((f) => f.name)).toEqual(['a.txt', 'b.txt']);
    expect(z.length).toBeLessThan(5000 + 5000);
  });
});
