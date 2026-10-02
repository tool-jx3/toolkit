// @vitest-environment jsdom
/**
 * log-converter：規格的數值規則與工具自己的規則（分類 2.5、合併 F47、標題與檔名 3.2、圖片品質 3.8、
 * 名稱欄寬 3.3／3.4、分割 3.9、部落格貼文版 3.10、預覽區段 F74、插圖 3.7、淨化（第 5 節第 8 項）、
 * 載入與加入／移除／改名 F03～F10、F54）與第 5 節修正的各項。
 */
import { describe, expect, it } from 'vitest';
import { buildEntries, classifyMessage, type LogEntry } from '@/tools/log-converter/classify';
import {
  addLogFiles,
  autoChatTab,
  autoNarrator,
  cleanFileBase,
  FALLBACK_FILE_BASE,
  fileBaseFor,
  initialNameColors,
  type LegacySource,
  loadLogFiles,
  outputTitle,
  removeLogFile,
  renameChannel,
  type SourceMessage,
  sourceTabs,
  titleFromFileName,
  type V2Source,
} from '@/tools/log-converter/load';
import {
  effectiveTabColors,
  illustrationPosition,
  type LogChoices,
  prepareConversion,
} from '@/tools/log-converter/pipeline';
import {
  blogIdSuffix,
  clampPreviewStart,
  convertLog,
  displayWidth,
  novelNameColumnEm,
  previewSlice,
  renderDocument,
  renderPreview,
  splitEntries,
  timelineNameColumnEm,
  utf8Length,
} from '@/tools/log-converter/render';
import { fontSetup, styleSafe } from '@/tools/log-converter/render/common';
import { cleanInlineStyle, sanitizeLogHtml } from '@/tools/log-converter/sanitize';
import {
  COLOR_PRESETS,
  customSizeEstimate,
  DEFAULT_SETTINGS,
  fitWithin,
  type LcSettings,
  NAME_COLOR_POOL,
  normalizeSettings,
  qualitySpec,
  separatorText,
  splitRule,
} from '@/tools/log-converter/settings';
import { OUT } from '@/tools/log-converter/strings';
import LC from '../../../docs/refactor/specs/log-converter.examples.json';
import { extractLogBlocks } from '../helpers/logConverterExtract';

const SAMPLES = (LC as unknown as { 樣本日誌: Record<string, string> }).樣本日誌;
const LEGACY = '[小芋、阿和] 霧港燈塔 [main].html';

const msg = (p: Partial<SourceMessage>): SourceMessage => ({
  tab: 'main',
  channel: 'main',
  speaker: 'A',
  system: false,
  roll: '',
  html: 'x',
  rawHtml: 'x',
  avatar: null,
  ...p,
});

function legacySource(html: string, name = 'test.html'): LegacySource {
  const r = loadLogFiles([{ name, text: html }]);
  if (!r.ok || r.source.format !== 'legacy') throw new Error('x');
  return r.source;
}

const legacyHtml = (rows: [string, string, string][]) =>
  rows
    .map(
      ([tab, sp, body]) => `<p><span> [${tab}]</span><span>${sp}</span> : <span>${body}</span></p>`,
    )
    .join('');

const choices = (p: Partial<LogChoices> = {}): LogChoices => ({
  title: 'T',
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

function convertHtml(
  html: string,
  s: Partial<LcSettings> = {},
  c: Partial<LogChoices> = {},
  images = { profileImages: {}, messageImages: {} } as {
    profileImages: Record<string, string>;
    messageImages: Record<string, string>;
  },
) {
  const src = legacySource(html);
  const conv = prepareConversion(src, { ...DEFAULT_SETTINGS, ...s }, choices(c), images, []);
  return { conv, result: convertLog(conv.entries, conv.options, conv.rule, conv.fileBase) };
}

const blocksOf = (html: string) =>
  extractLogBlocks(false, new DOMParser().parseFromString(html, 'text/html')).區塊;

describe('訊息分類（2.5）', () => {
  const o = { narrator: 'GM', chatTab: 'other' };
  it('舊格式：閒聊 → 旁白（旁白角色的擲骰也算旁白）→ 系統 → 對話', () => {
    expect(classifyMessage('legacy', msg({ tab: 'other', speaker: 'GM' }), o)).toBe('chat');
    expect(classifyMessage('legacy', msg({ speaker: 'GM', rawHtml: '1D100' }), o)).toBe(
      'narration',
    );
    expect(classifyMessage('legacy', msg({ speaker: 'system' }), o)).toBe('system');
    expect(classifyMessage('legacy', msg({ rawHtml: '我要擲 2d6 看看' }), o)).toBe('system');
    expect(classifyMessage('legacy', msg({ rawHtml: '1D100&lt;=60' }), o)).toBe('system');
    /* CCFOLIA 把「<」寫成實體，所以「cc<=」實際上不會命中 */
    expect(classifyMessage('legacy', msg({ rawHtml: 'cc&lt;=40 小寫指令' }), o)).toBe('dialogue');
    expect(classifyMessage('legacy', msg({ rawHtml: 'cc<=40' }), o)).toBe('system');
    expect(classifyMessage('legacy', msg({}), { narrator: 'GM', chatTab: null })).toBe('dialogue');
  });

  it('新格式：系統列或有擲骰結果 → 系統（不論發言者）→ 閒聊 → 旁白 → 對話', () => {
    expect(classifyMessage('v2', msg({ speaker: 'GM', roll: '(1D100) ＞ 42' }), o)).toBe('system');
    expect(classifyMessage('v2', msg({ tab: 'other', roll: 'x' }), o)).toBe('system');
    expect(classifyMessage('v2', msg({ system: true, speaker: 'system' }), o)).toBe('system');
    expect(classifyMessage('v2', msg({ tab: 'other', speaker: 'GM' }), o)).toBe('chat');
    expect(classifyMessage('v2', msg({ speaker: 'GM', rawHtml: '1D100' }), o)).toBe('narration');
    expect(classifyMessage('v2', msg({ rawHtml: '2d6' }), o)).toBe('dialogue');
  });

  it('合併同人連續對話（F47）：只合併同一位、同一個分頁、連續的對話；序號以合併後計算；頭像用第一則的', () => {
    const list = [
      msg({ speaker: 'A', html: '1', avatar: 'a1' }),
      msg({ speaker: 'A', html: '2', avatar: 'a2' }),
      msg({ speaker: 'A', html: '3', tab: 'info' }),
      msg({ speaker: 'GM', html: '4' }),
      msg({ speaker: 'GM', html: '5' }),
      msg({ speaker: 'A', html: '6', tab: 'other' }),
      msg({ speaker: 'A', html: '7', tab: 'other' }),
    ];
    const e = buildEntries('v2', list, { narrator: 'GM', chatTab: 'other', merge: true });
    expect(e.map((x) => [x.num, x.kind, x.lines])).toEqual([
      [1, 'dialogue', ['1', '2']],
      [2, 'dialogue', ['3']],
      [3, 'narration', ['4']],
      [4, 'narration', ['5']],
      [5, 'chat', ['6']],
      [6, 'chat', ['7']],
    ]);
    expect(e[0].avatar).toBe('a1');
    expect(buildEntries('v2', list, { narrator: 'GM', chatTab: null, merge: false })).toHaveLength(
      7,
    );
  });
});

describe('載入時帶入的值（F11、F16、F19、F32）與檔名（3.2）', () => {
  it('舊格式從檔名帶入標題與副標題', () => {
    expect(titleFromFileName(LEGACY)).toEqual({ title: '霧港燈塔', subtitle: '小芋、阿和' });
    expect(titleFromFileName('legacy-short.html')).toEqual({ title: 'legacy-short', subtitle: '' });
    expect(titleFromFileName('a ] b [ c.HTML')).toEqual({ title: 'b', subtitle: '' });
  });

  it('閒聊分頁：依序比對「잡담」「閒聊」「雜談」「雑談」，都沒有時選 other，否則不指定', () => {
    expect(autoChatTab(['main', '雑談', '閒聊'])).toBe('閒聊');
    expect(autoChatTab(['잡담', '閒聊'])).toBe('잡담');
    expect(autoChatTab(['main', 'other'])).toBe('other');
    expect(autoChatTab(['main', 'info'])).toBeNull();
  });

  it('旁白角色：有 GM 就選 GM，否則用預設的 GM 選項（第 5 節第 1 項修正）', () => {
    expect(autoNarrator(['林曉雨', 'GM', '陳志明'])).toBe('GM');
    expect(autoNarrator(['丙', '甲'])).toBeNull();
  });

  it('名稱顏色：日誌記錄的顏色（舊格式讀段落顏色，第 5 節第 11 項）；沒有時依出現順序輪流給 5 色', () => {
    const src = legacySource(
      `<p style="color:#123456"><span>[main]</span><span>A</span> : <span>x</span></p>` +
        legacyHtml([
          ['main', 'B', 'y'],
          ['main', 'C', 'z'],
        ]),
    );
    expect(initialNameColors(src)).toEqual({
      A: '#123456',
      B: NAME_COLOR_POOL[1],
      C: NAME_COLOR_POOL[2],
    });
  });

  it('檔名主體的清理', () => {
    expect(cleanFileBase('  a/b:c**d  ')).toBe('a_b_c_d');
    expect(cleanFileBase('___')).toBe(FALLBACK_FILE_BASE);
    expect(cleanFileBase('霧港燈塔 第一夜')).toBe('霧港燈塔 第一夜');
  });

  it('檔名主體：標題 → 新格式的房間名稱 → 檔名（去掉 .html、不清理）；標題空白時從檔名主體取「]…[」', () => {
    const legacy = legacySource(SAMPLES[LEGACY], LEGACY);
    expect(fileBaseFor('霧港燈塔', legacy)).toBe('霧港燈塔');
    expect(fileBaseFor('', legacy)).toBe('[小芋、阿和] 霧港燈塔 [main]');
    expect(outputTitle('', '[小芋、阿和] 霧港燈塔 [main]', OUT.defaultTitle)).toBe('霧港燈塔');
    expect(outputTitle('', 'legacy-short', OUT.defaultTitle)).toBe('跑團日誌');
    expect(outputTitle('  標題 ', 'x', OUT.defaultTitle)).toBe('  標題 ');
    const v2 = loadLogFiles([{ name: 'a.html', text: SAMPLES['霧港燈塔 [all].html'] }]);
    if (!v2.ok) throw new Error('x');
    expect(fileBaseFor('', v2.source)).toBe('霧港燈塔');
    expect(outputTitle('', '霧港燈塔', OUT.defaultTitle)).toBe('跑團日誌');
  });
});

describe('載入、加入、移除、改名（F03～F10、F54）', () => {
  it('舊格式只用第一個檔（F03）；混選只用新格式（F05）；多個全分頁檔只採用一份（F06）；讀不到訊息（F10）', () => {
    const r1 = loadLogFiles([
      { name: 'a.html', text: SAMPLES['legacy-short.html'] },
      { name: 'b.html', text: SAMPLES['legacy-edge.html'] },
    ]);
    expect(r1.ok && r1.notices).toEqual([{ kind: 'legacy-one', first: 'a.html', rest: 1 }]);
    const r2 = loadLogFiles(
      ['霧港燈塔 [all].html', '霧港燈塔 [all]-副本.html', 'legacy-short.html'].map((n) => ({
        name: n,
        text: SAMPLES[n],
      })),
    );
    expect(r2.ok && r2.notices).toEqual([
      { kind: 'mixed', excluded: 1 },
      { kind: 'multi-all', count: 2 },
    ]);
    const empty =
      '<article class="message" data-channel="main"><p class="message-text"> </p></article>';
    expect(loadLogFiles([{ name: 'e.html', text: empty }])).toEqual({ ok: false, error: 'empty' });
    /* 舊格式沒有任何訊息時不報錯，轉換出只有標題的檔案 */
    const { result } = convertHtml('<p>nothing</p>');
    expect(result.pages).toHaveLength(1);
    expect(blocksOf(result.pages[0])).toEqual([]);
  });

  const v2Files = (names: string[]) => names.map((n) => ({ name: n, text: SAMPLES[n] }));

  it('加入檔案（F08）：只收新格式、重複（分頁組合與則數相同）的略過；移除到一個都不剩回到未載入（F09）', () => {
    const r = loadLogFiles(v2Files(['霧港燈塔 [main].html', '霧港燈塔 [info].html']));
    if (!r.ok) throw new Error('x');
    const src = r.source as V2Source;
    expect(addLogFiles(src, v2Files(['legacy-short.html']))).toMatchObject({
      ok: false,
      reason: 'mismatch',
    });
    expect(addLogFiles(src, v2Files(['霧港燈塔 [main].html']))).toMatchObject({
      ok: false,
      reason: 'duplicate',
      skipped: 1,
    });
    const added = addLogFiles(
      src,
      v2Files(['霧港燈塔 [other].html', '霧港燈塔 [main].html', 'legacy-short.html']),
    );
    expect(added).toMatchObject({ ok: true, added: 1, skipped: 1, excluded: 1 });
    if (!added.ok) throw new Error('x');
    expect(added.source.files.map((f) => f.name)).toEqual([
      '霧港燈塔 [main].html',
      '霧港燈塔 [info].html',
      '霧港燈塔 [other].html',
    ]);
    const one = removeLogFile(added.source, 0)!;
    expect(one.files).toHaveLength(2);
    expect(removeLogFile(removeLogFile(one, 0)!, 0)).toBeNull();
  });

  it('改名（F54）：清空＝用代碼；同名時合併；加入檔案後改過的名稱保留（第 5 節第 9 項）', () => {
    const r = loadLogFiles(v2Files(['霧港燈塔 [main].html', '霧港燈塔 [秘密].html']));
    if (!r.ok) throw new Error('x');
    let src = r.source as V2Source;
    expect(sourceTabs(src)).toEqual(['メイン', '秘密頻道']);
    src = renameChannel(src, 'Xk3pQ9aZ', '密談').source;
    expect(sourceTabs(src)).toEqual(['メイン', '密談']);
    expect(src.messages.find((m) => m.channel === 'Xk3pQ9aZ')!.tab).toBe('密談');
    const blank = renameChannel(src, 'Xk3pQ9aZ', '  ');
    expect(blank.to).toBe('Xk3pQ9aZ');
    const merged = renameChannel(src, 'Xk3pQ9aZ', 'メイン').source;
    expect(sourceTabs(merged)).toEqual(['メイン']);
    const added = addLogFiles(src, v2Files(['霧港燈塔 [info].html']));
    if (!added.ok) throw new Error('x');
    expect(sourceTabs(added.source)).toContain('密談');
  });
});

describe('圖片品質（3.8、F28）', () => {
  it('預設：最小 100／WebP／0.6、標準 150／WebP／0.75、較高畫質 200／JPEG／0.85、原圖不縮放 PNG', () => {
    expect(qualitySpec('low')).toEqual({ maxSide: 100, quality: 0.6, format: 'image/webp' });
    expect(qualitySpec('medium')).toEqual({ maxSide: 150, quality: 0.75, format: 'image/webp' });
    expect(qualitySpec('high')).toEqual({ maxSide: 200, quality: 0.85, format: 'image/jpeg' });
    expect(qualitySpec('original')).toMatchObject({
      maxSide: Number.POSITIVE_INFINITY,
      format: 'image/png',
    });
  });

  it('自訂：64＋x%×236 四捨五入；x ≤ 80 WebP、x > 80 JPEG；品質 0.4＋x%×0.55', () => {
    expect(qualitySpec('custom', 0)).toEqual({ maxSide: 64, quality: 0.4, format: 'image/webp' });
    expect(qualitySpec('custom', 30)).toMatchObject({ maxSide: 135, format: 'image/webp' });
    expect(qualitySpec('custom', 30).quality).toBeCloseTo(0.565);
    expect(qualitySpec('custom', 80)).toMatchObject({ maxSide: 253, format: 'image/webp' });
    expect(qualitySpec('custom', 85)).toMatchObject({ maxSide: 265, format: 'image/jpeg' });
    expect(qualitySpec('custom', 100).maxSide).toBe(300);
    expect(qualitySpec('custom', 100).quality).toBeCloseTo(0.95);
  });

  it('自訂滑桿的約略容量', () => {
    const at = (x: number) => customSizeEstimate(x);
    expect([0, 15, 20, 30, 35, 50, 55, 70, 75, 85, 90, 100].map(at)).toEqual([
      '約 1 KB',
      '約 1 KB',
      '約 3 KB',
      '約 3 KB',
      '約 8 KB',
      '約 8 KB',
      '約 15 KB',
      '約 15 KB',
      '約 25 KB',
      '約 25 KB',
      '約 40 KB',
      '約 40 KB',
    ]);
  });

  it('只縮小不放大，長邊＝上限（另一邊四捨五入）', () => {
    expect(fitWithin(200, 260, 100)).toEqual({ width: 77, height: 100 });
    expect(fitWithin(200, 260, 150)).toEqual({ width: 115, height: 150 });
    expect(fitWithin(120, 160, 150)).toEqual({ width: 113, height: 150 });
    expect(fitWithin(96, 96, 150)).toEqual({ width: 96, height: 96 });
    expect(fitWithin(320, 180, 800)).toEqual({ width: 320, height: 180 });
    expect(fitWithin(1000, 500, 800)).toEqual({ width: 800, height: 400 });
    expect(fitWithin(900, 900, 800)).toEqual({ width: 800, height: 800 });
    expect(fitWithin(1200, 900, Number.POSITIVE_INFINITY)).toEqual({ width: 1200, height: 900 });
  });
});

describe('名稱欄寬（3.3、3.4）、分隔（F50）', () => {
  const e = (speaker: string, kind: LogEntry['kind'] = 'dialogue', num = 1): LogEntry => ({
    num,
    kind,
    tab: 'main',
    speaker,
    lines: ['x'],
    avatar: null,
  });

  it('時間軸：顯示寬度 × 0.55 無條件進位；只算對話的發言者；沒有對話時以 10 計', () => {
    expect(displayWidth('蘇菲亞・范德比爾特三世')).toBe(22);
    expect(displayWidth('GM')).toBe(2);
    expect(displayWidth('A b')).toBe(2.5);
    expect(displayWidth('한국')).toBe(4);
    expect(displayWidth('ＡＢ')).toBe(4);
    expect(timelineNameColumnEm([e('蘇菲亞・范德比爾特三世'), e('GM')], false)).toBe(13);
    expect(timelineNameColumnEm([e('GM'), e('陳志明')], false)).toBe(4);
    expect(timelineNameColumnEm([e('很長很長很長很長很長的名字', 'chat')], false)).toBe(6);
    /* 名稱過長時換行：欄寬上限 10 個全形字 */
    expect(timelineNameColumnEm([e('蘇菲亞・范德比爾特三世')], true)).toBe(11);
  });

  it('小說：所有發言者（含 system 與閒聊的人）名稱的最大字數；沒有發言者時 5', () => {
    expect(
      novelNameColumnEm(
        [e('GM'), e('system', 'system'), e('蘇菲亞・范德比爾特三世', 'chat')],
        false,
      ),
    ).toBe(11);
    expect(novelNameColumnEm([e('KP'), e('王大同')], false)).toBe(3);
    expect(novelNameColumnEm([], false)).toBe(5);
    expect(novelNameColumnEm([e('蘇菲亞・范德比爾特三世')], true)).toBe(10);
  });

  it('接續版面的分隔：空格＝半形空白；自訂＝文字＋半形空白（空白時「:」，最多 3 字）', () => {
    expect(separatorText('space', '：')).toBe(' ');
    expect(separatorText('custom', '：')).toBe('： ');
    expect(separatorText('custom', '')).toBe(': ');
    expect(separatorText('custom', '>>>>')).toBe('>>> ');
  });
});

describe('分割（3.9）、預覽區段（F74）', () => {
  const entries = (n: number): LogEntry[] =>
    Array.from({ length: n }, (_, i) => ({
      num: i + 1,
      kind: 'dialogue' as const,
      tab: 'main',
      speaker: 'A',
      lines: [`第 ${i + 1} 則`],
      avatar: null,
    }));
  const o = convertHtml(SAMPLES[LEGACY]).conv.options;

  it('數值範圍：依則數／依大小 1～100000 的整數（其他＝不分割）；固定檔數 2～1000（其他＝2）', () => {
    const r = (p: Partial<LcSettings>) => splitRule({ ...DEFAULT_SETTINGS, ...p });
    expect(r({ splitMethod: 'count', splitCount: 0 })).toEqual({ method: 'none', value: 0 });
    expect(r({ splitMethod: 'count', splitCount: 100001 })).toEqual({ method: 'none', value: 0 });
    expect(r({ splitMethod: 'count', splitCount: 2.5 })).toEqual({ method: 'none', value: 0 });
    expect(r({ splitMethod: 'count', splitCount: 5 })).toEqual({ method: 'count', value: 5 });
    expect(r({ splitMethod: 'size', splitSizeKb: 100000 })).toEqual({
      method: 'size',
      value: 100000,
    });
    expect(r({ splitMethod: 'files', splitFiles: 1 })).toEqual({ method: 'files', value: 2 });
    expect(r({ splitMethod: 'files', splitFiles: 1001 })).toEqual({ method: 'files', value: 2 });
    expect(r({ splitMethod: 'files', splitFiles: 7 })).toEqual({ method: 'files', value: 7 });
  });

  it('依則數、固定檔數（每檔＝總則數 ÷ n 無條件進位，檔數可能少於 n）', () => {
    const sizes = (rule: Parameters<typeof splitEntries>[1], n: number) =>
      splitEntries(entries(n), rule, o).map((p) => p.length);
    expect(sizes({ method: 'count', value: 5 }, 17)).toEqual([5, 5, 5, 2]);
    expect(sizes({ method: 'files', value: 3 }, 17)).toEqual([6, 6, 5]);
    expect(sizes({ method: 'files', value: 4 }, 17)).toEqual([5, 5, 5, 2]);
    expect(sizes({ method: 'files', value: 5 }, 4)).toEqual([1, 1, 1, 1]);
    expect(sizes({ method: 'files', value: 3 }, 0)).toEqual([0]);
  });

  it('依大小：每檔不超過上限（單則超過除外）、下一則放不進去才換檔、順序與內容完整', () => {
    const list = entries(300);
    const limit = 12 * 1024;
    const parts = splitEntries(list, { method: 'size', value: 12 }, o);
    expect(parts.length).toBeGreaterThan(2);
    expect(parts.flat().map((x) => x.num)).toEqual(list.map((x) => x.num));
    const total = parts.length;
    parts.forEach((p, i) => {
      const size = utf8Length(renderDocument(p, o, { mode: 'page', part: i + 1, total }));
      expect(size).toBeLessThanOrEqual(limit);
      if (i + 1 < total) {
        /* 換檔判斷用最壞情況的頁碼位數（頁碼還沒定），所以用同樣的量法 */
        const big = list.length;
        const more = utf8Length(
          renderDocument([...p, parts[i + 1][0]], o, { mode: 'page', part: big, total: big }),
        );
        expect(more).toBeGreaterThan(limit);
      }
    });
    /* 單一則就超過時它自己一檔 */
    const huge = entries(3);
    huge[1] = { ...huge[1], lines: ['字'.repeat(4000)] };
    expect(splitEntries(huge, { method: 'size', value: 4 }, o).map((p) => p.length)).toEqual([
      1, 1, 1,
    ]);
  });

  it('UTF-8 位元組數', () => {
    for (const s of ['abc', '霧港燈塔', '🎲 dice', 'é', ''])
      expect(utf8Length(s)).toBe(new TextEncoder().encode(s).length);
  });

  it('預覽區段的修正：小於 1 或不是數字當成 1；超過總則數時改成「總則數 − 則數 + 1」（不小於 1）', () => {
    expect(clampPreviewStart(5000, 1200, 300)).toBe(901);
    expect(clampPreviewStart(0, 1200, 300)).toBe(1);
    expect(clampPreviewStart(Number.NaN, 1200, 300)).toBe(1);
    expect(clampPreviewStart(50, 17, 500)).toBe(1);
    expect(clampPreviewStart(5000, 1200, 0)).toBe(1);
    expect(previewSlice(entries(1200), { start: 5000, limit: 300 })).toMatchObject({
      start: 901,
      last: 1200,
    });
    const all = previewSlice(entries(17), { start: 3, limit: 0 });
    expect(all.slice).toHaveLength(17);
  });
});

describe('輸出', () => {
  const html = legacyHtml([
    ['main', 'GM', '開場'],
    ['main', 'A', '「你好」'],
    ['other', 'B', '閒聊一'],
    ['main', 'system', '[ A ] HP : 1 → 0'],
    ['other', 'B', '閒聊二'],
    ['main', 'A', '她低聲說：***'],
    ['main', 'GM', '***'],
  ]);

  it('小說：系統訊息先把閒聊組輸出（第 5 節第 3 項）；「***」只有整則是「***」才是場景分隔（第 5 節第 15 項）', () => {
    const { result } = convertHtml(html, { style: 'novel' }, { narrator: 'GM', chatTab: 'other' });
    const kinds = blocksOf(result.pages[0]).map((b) => b.種類);
    expect(kinds).toEqual([
      '旁白',
      '對話',
      '閒聊（摺疊）',
      '擲骰',
      '閒聊（摺疊）',
      '對話',
      '場景分隔',
    ]);
    const blocks = blocksOf(result.pages[0]);
    expect(blocks[5]).toMatchObject({ 名稱: 'A', 行: ['她低聲說：***'] });
  });

  it('預覽才帶訊息序號；下載一律不含；通知列、閒聊沒有序號；獨立區塊只在每則的第一行', () => {
    const { conv, result } = convertHtml(
      html,
      { style: 'ccfolia', narrationMode: 'block' },
      { narrator: 'GM', chatTab: 'other', tabStyles: { main: 'notice' } },
    );
    expect(result.pages[0]).not.toContain('data-log-num');
    const preview = renderPreview(conv.entries, conv.options, true);
    /* main 是通知框：GM、A 的訊息都是通知列（沒有序號）；系統訊息照常有序號 */
    expect([...preview.matchAll(/data-log-num="(\d+)"/g)].map((m) => m[1])).toEqual(['4']);
    const block = convertHtml(
      legacyHtml([
        ['main', 'GM', 'a<br>b'],
        ['main', 'GM', 'c'],
      ]),
      {
        style: 'ccfolia',
        narrationMode: 'block',
      },
      { narrator: 'GM' },
    );
    const p2 = renderPreview(block.conv.entries, block.conv.options, true);
    expect(p2).toContain('<div data-log-num="1">a<br>b</div><div data-log-num="2">c</div>');
    expect(blocksOf(block.result.pages[0])).toMatchObject([
      { 種類: '旁白列', 名稱顯示: false, 行: ['a', 'b', 'c'] },
    ]);
  });

  it('不輸出的分頁：訊息與它們才用到的頭像都不嵌入；同一張圖只嵌一次（3.8）', () => {
    const src = legacyHtml([
      ['main', 'A', '一'],
      ['main', 'A', '二'],
      ['secret', 'B', '三'],
      ['main', 'C', '四'],
    ]);
    const { result } = convertHtml(
      src,
      { style: 'timeline' },
      { hiddenTabs: ['secret'] },
      {
        profileImages: {
          A: 'data:image/png;base64,AAAA',
          B: 'data:image/png;base64,BBBB',
          C: 'data:image/png;base64,AAAA',
        },
        messageImages: {},
      },
    );
    const page = result.pages[0];
    expect(page.match(/background-image:url\(/g)).toHaveLength(1);
    expect(page).not.toContain('BBBB');
    expect(page).not.toContain('三');
  });

  it('插圖：以全域訊息序號插在正確的那一檔（第 5 節第 6 項）；空白、0、負數、非數字不插入', () => {
    expect(['', '0', '-1', 'abc', '3', ' 8 ', '2.5'].map(illustrationPosition)).toEqual([
      null,
      null,
      null,
      null,
      3,
      8,
      null,
    ]);
    const rows = Array.from(
      { length: 12 },
      (_, i) => ['main', 'A', `第${i + 1}則`] as [string, string, string],
    );
    const src = legacySource(legacyHtml(rows));
    const conv = prepareConversion(
      src,
      { ...DEFAULT_SETTINGS, splitMethod: 'count', splitCount: 5 },
      choices(),
      { profileImages: {}, messageImages: {} },
      [3, 8].map((p, i) => ({
        id: String(i),
        position: String(p),
        source: 'url' as const,
        fileData: '',
        fileName: '',
        url: `https://example.com/${p}.png`,
        size: 'medium' as const,
        align: 'center' as const,
      })),
    );
    const result = convertLog(conv.entries, conv.options, conv.rule, conv.fileBase);
    expect(
      result.pages.map((p) => [...p.matchAll(/example\.com\/(\d+)\.png/g)].map((m) => m[1])),
    ).toEqual([['3'], ['8'], []]);
  });

  it('分頁配色只在 2 個以上分頁、開啟時作用；沒改過的是淺灰文字、透明背景', () => {
    const s = { tabColorsEnabled: true, tabColors: { a: { text: '#ffffff', bg: '#000000' } } };
    expect(effectiveTabColors(s, ['a'])).toBeNull();
    expect(effectiveTabColors({ ...s, tabColorsEnabled: false }, ['a', 'b'])).toBeNull();
    expect(effectiveTabColors(s, ['a', 'b'])).toEqual({
      a: { text: '#ffffff', bg: '#000000' },
      b: { text: '#e2e6ea', bg: null },
    });
  });

  it('部落格貼文版（3.10）：沒有文件宣告與 html／head／body／title；樣式全部限定在容器內；後綴固定而且每檔不同', () => {
    const { result } = convertHtml(SAMPLES[LEGACY], {
      style: 'timeline',
      splitMethod: 'count',
      splitCount: 9,
    });
    const suffix = blogIdSuffix(result.fileBase, 1);
    expect(suffix).toBe(blogIdSuffix(result.fileBase, 1));
    expect(suffix).not.toBe(blogIdSuffix(result.fileBase, 2));
    expect(suffix).toMatch(/^[0-9a-z]{6}$/);
    const frag = renderDocument(result.parts[0], result.options, {
      mode: 'blog',
      part: 1,
      total: 2,
      idSuffix: suffix,
    });
    expect(frag.startsWith('<meta charset="UTF-8">\n<style>')).toBe(true);
    expect(frag).toBe(frag.trim());
    for (const re of [/<!DOCTYPE/i, /<html[\s>]/, /<head[\s>]/, /<body[\s>]/, /<title>/])
      expect(frag).not.toMatch(re);
    const css = /<style>([\s\S]*?)<\/style>/.exec(frag)![1];
    for (const rule of css.split('}').filter((r) => r.includes('{')))
      for (const sel of rule.slice(0, rule.indexOf('{')).split(','))
        expect(sel.trim().startsWith(`#lc-log-${suffix}`)).toBe(true);
    expect(frag).toContain(`<div id="lc-log-${suffix}"`);
    expect(frag).toContain(`href="#lc-ic-${suffix}-book"`);
  });
});

describe('字型（F34、F35）', () => {
  it('網址 → 樣式表連結；@import → 連結；@font-face → 放進樣式；名稱加不加引號都可以（第 5 節第 5 項）', () => {
    expect(fontSetup('', '').link).toContain('Noto+Sans+TC');
    expect(fontSetup('https://fonts.googleapis.com/css2?family=Noto+Serif+TC', '').link).toBe(
      'https://fonts.googleapis.com/css2?family=Noto+Serif+TC',
    );
    expect(fontSetup("@import url('https://x.test/a.css');", '').link).toBe('https://x.test/a.css');
    const face = fontSetup("@font-face { font-family: 'Mine'; src: url(a.woff2); }", 'Mine');
    expect(face).toMatchObject({ link: null });
    expect(face.faceCss).toContain('@font-face');
    expect(fontSetup('', "'Noto Serif TC'").serif.startsWith('"Noto Serif TC",')).toBe(true);
    expect(fontSetup('', 'Noto Serif TC').sans.startsWith('"Noto Serif TC",')).toBe(true);
    expect(styleSafe('@font-face{}</style><script>')).toBe('@font-face{}<\\/style><script>');
  });
});

describe('淨化（第 5 節第 8 項）', () => {
  it('舊格式內容：留排版標籤，去掉指令碼、事件屬性與危險的樣式', () => {
    expect(sanitizeLogHtml('<b>粗體</b> 與 <i>斜體</i><br>下一行')).toBe(
      '<b>粗體</b> 與 <i>斜體</i><br>下一行',
    );
    expect(sanitizeLogHtml('a<script>alert(1)</script>b')).toBe('ab');
    expect(sanitizeLogHtml('<span onclick="x()">點</span>')).toBe('<span>點</span>');
    expect(sanitizeLogHtml('<img src=x onerror="alert(1)">圖')).toBe('圖');
    expect(sanitizeLogHtml('<a href="javascript:x">連結</a>')).toBe('連結');
    expect(
      sanitizeLogHtml(
        '<span style="color: red; position: fixed; background-image: url(x)">字</span>',
      ),
    ).toBe('<span style="color: red">字</span>');
    expect(cleanInlineStyle('color: red; background-color: url(x); font-weight: bold')).toBe(
      'color: red; font-weight: bold',
    );
  });

  it('標題、名稱一律跳脫', () => {
    const { result } = convertHtml(
      legacyHtml([['main', '&lt;b&gt;X&lt;/b&gt;', '內容']]),
      { style: 'ccfolia' },
      { title: '<i>標題</i>', subtitle: '<img src=x>' },
    );
    const page = result.pages[0];
    expect(page).toContain('&lt;i&gt;標題&lt;/i&gt;');
    expect(page).toContain('&lt;b&gt;X&lt;/b&gt;');
    expect(page).not.toContain('<img src=x>');
  });
});

describe('設定（F57、F61、F93）', () => {
  it('讀回時修正：看不懂的值用預設值；選單顯示的預設與實際顏色一致（第 5 節第 7 項）', () => {
    const s = normalizeSettings({
      style: 'bogus',
      fontSize: 99,
      splitFiles: 5000,
      colorPreset: COLOR_PRESETS[2].id,
      palette: { ...COLOR_PRESETS[0].palette },
      subNarrators: [{ speaker: 'A', style: 'nope' }, { speaker: 'A' }, { speaker: 3 }],
      tabColors: { x: { text: 'red', bg: '#ABCDEF' } },
    });
    expect(s.style).toBe('novel');
    expect(s.fontSize).toBe(17);
    expect(s.splitFiles).toBe(2);
    expect(s.colorPreset).toBe('custom');
    expect(s.subNarrators).toEqual([{ speaker: 'A', style: 'italic-narration', color: '#a0a7b4' }]);
    expect(s.tabColors).toEqual({ x: { text: '#e2e6ea', bg: '#abcdef' } });
    expect(
      normalizeSettings({ colorPreset: 'ocean', palette: COLOR_PRESETS[4].palette }).colorPreset,
    ).toBe('ocean');
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    /* 預設的配色預設與 9 色一致 */
    expect(DEFAULT_SETTINGS.palette).toEqual(
      COLOR_PRESETS.find((p) => p.id === DEFAULT_SETTINGS.colorPreset)!.palette,
    );
    expect(COLOR_PRESETS).toHaveLength(11);
  });
});
