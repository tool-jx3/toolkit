// @vitest-environment jsdom
/**
 * log-converter：附件 36 組「日誌樣本＋設定→輸出結構」逐組重跑（規格 3.12 第 1 項）。
 * 比對載入後的選單與自動選擇、轉換結果、預覽區段、下載的檔名與 ZIP 內容，以及每個 HTML 抽出的區塊
 * （種類、順序、名稱、文字行、斜體、對齊、名稱欄寬、頭像／插圖的識別、分頁標籤、閒聊摘要…）與名稱顏色。
 * 計算後的顏色、圖片的格式與尺寸在 e2e（Chromium）比；這裡的頭像沒有經過 canvas 重新編碼。
 * 依第 7 節裁定修正的案例（L01 等的系統訊息順序、L13、L24、L25）比的是修正後的預期，見 helpers/logConverterCases.ts。
 */
import { describe, expect, it } from 'vitest';
import {
  autoChatTab,
  autoNarrator,
  channelDisplayName,
  initialNameColors,
  type LogSource,
  loadLogFiles,
  renameChannel,
  sourceAvatars,
  sourceMainAvatars,
  sourceSpeakers,
  sourceTabs,
  titleFromFileName,
  type V2Source,
} from '@/tools/log-converter/load';
import { type IllustrationItem, prepareConversion } from '@/tools/log-converter/pipeline';
import {
  blogPage,
  convertLog,
  downloadNames,
  previewSlice,
  renderDocument,
  utf8Length,
} from '@/tools/log-converter/render';
import { DEFAULT_SETTINGS, type LcSettings } from '@/tools/log-converter/settings';
import { S } from '@/tools/log-converter/strings';
import LC from '../../../docs/refactor/specs/log-converter.examples.json';
import {
  caseSetup,
  expectedFor,
  type LcAttachment,
  type LcCase,
  normalizeBlocks,
  rgbToHex,
} from '../helpers/logConverterCases';
import { extractLogBlocks } from '../helpers/logConverterExtract';

const ATT = LC as unknown as LcAttachment;

interface Prepared {
  source: LogSource;
  notices: string[];
  settings: LcSettings;
  loadedTitle: { title: string; subtitle: string };
  result: ReturnType<typeof convertLog>;
  entries: ReturnType<typeof prepareConversion>['entries'];
}

const NOTICE_TEXT = (n: {
  kind: string;
  first?: string;
  rest?: number;
  excluded?: number;
  count?: number;
}) =>
  n.kind === 'legacy-one'
    ? S.notices.legacyOne(n.first!, n.rest!)
    : n.kind === 'mixed'
      ? S.notices.mixed(n.excluded!)
      : S.notices.multiAll(n.count!);

function prepareCase(c: LcCase): Prepared {
  const setup = caseSetup(ATT, c);
  const loaded = loadLogFiles(c.輸入檔.map((name) => ({ name, text: ATT.樣本日誌[name] })));
  if (!loaded.ok) throw new Error(`${c.編號} 載入失敗`);
  let source = loaded.source;
  const loadedTitle =
    source.format === 'legacy'
      ? titleFromFileName(source.fileName)
      : { title: source.merged.roomName ?? '', subtitle: '' };
  const tabsAtLoad = sourceTabs(source);
  for (const [code, name] of Object.entries(setup.renames))
    source = renameChannel(source as V2Source, code, name).source;
  const tabs = sourceTabs(source);
  const settings: LcSettings = { ...DEFAULT_SETTINGS, style: setup.style, ...setup.settings };
  const initial = initialNameColors(source);
  const nameColors =
    setup.nameColors === 'compare' ? { ...initial, ...ATT.比對用配色.名稱顏色 } : initial;
  const uploads: Record<string, string> = {};
  for (const [speaker, u] of Object.entries(setup.uploads))
    uploads[speaker] = u.kind === 'file' ? ATT.樣本圖片[u.image] : u.url;
  const profileImages = { ...sourceMainAvatars(source), ...uploads };
  const messageImages = Object.fromEntries(sourceAvatars(source).map((a) => [a, a]));
  const illustrations: IllustrationItem[] = setup.illustrations.map((it, i) => ({
    id: String(i),
    position: it.position,
    source: it.source,
    fileData: it.image ? ATT.樣本圖片[it.image] : '',
    fileName: it.image ?? '',
    url: it.url ?? '',
    size: it.size,
    align: it.align,
  }));
  const conv = prepareConversion(
    source,
    settings,
    {
      title: setup.title ?? loadedTitle.title,
      subtitle: setup.subtitle ?? loadedTitle.subtitle,
      summary: setup.summary ?? '',
      narrator: setup.narrator ?? autoNarrator(sourceSpeakers(source)),
      chatTab: setup.chatTab === null ? null : autoChatTab(tabsAtLoad),
      nameColors,
      hiddenTabs: setup.hiddenTabs,
      tabStyles:
        setup.tabStyles === 'all-label'
          ? Object.fromEntries(tabs.map((t) => [t, 'label' as const]))
          : setup.tabStyles,
      useLogImages: setup.useLogImages ?? true,
    },
    { profileImages, messageImages },
    illustrations,
  );
  const result = convertLog(conv.entries, conv.options, conv.rule, conv.fileBase);
  return {
    source,
    notices: loaded.notices.map(NOTICE_TEXT),
    settings,
    loadedTitle,
    result,
    entries: conv.entries,
  };
}

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');

/** 下載按鈕 → 檔案在轉換結果裡的位置 */
function locate(d: LcCase['下載'][number]): {
  kind: 'page' | 'blog' | 'zip' | 'blogzip';
  index: number;
} {
  if (d.按鈕 === '全部打包（ZIP）') return { kind: 'zip', index: -1 };
  if (d.按鈕.startsWith('部落格貼文版・全部打包')) return { kind: 'blogzip', index: -1 };
  const m = /第 (\d+) 檔/.exec(d.按鈕);
  const index = m ? Number(m[1]) - 1 : 0;
  return { kind: d.部落格貼文版 ? 'blog' : 'page', index };
}

describe('附件 36 組', () => {
  for (const c of ATT.案例) {
    it(`${c.編號}：${c.說明}`, () => {
      const exp = expectedFor(c);
      const p = prepareCase(c);
      const { source, result } = p;

      /* 載入後（F11、F16、F19、F07、F06） */
      const a = c.載入後;
      expect(p.loadedTitle).toEqual({ title: a.標題, subtitle: a.副標題 });
      expect(sourceSpeakers(source)).toEqual(a.旁白角色選單);
      expect(autoNarrator(a.旁白角色選單) ?? 'GM').toBe(exp.narrator);
      const fresh = loadLogFiles(c.輸入檔.map((name) => ({ name, text: ATT.樣本日誌[name] })));
      if (!fresh.ok) throw new Error('x');
      expect(sourceTabs(fresh.source)).toEqual(a.閒聊分頁選單);
      expect(autoChatTab(sourceTabs(fresh.source))).toBe(a.閒聊分頁);
      if (a.檔案提示) expect(p.notices.join(' ')).toContain(S.notices.multiAll(2));
      else expect(p.notices).toEqual([]);
      if (a.已載入檔案) {
        const v2 = fresh.source as V2Source;
        expect(
          v2.files.map((f) => ({
            檔名: f.name,
            則數: f.log.messages.length,
            分頁: f.log.channels.map((ch) => channelDisplayName(v2, ch)),
          })),
        ).toEqual(a.已載入檔案);
      } else expect(fresh.source.format).toBe('legacy');

      /* 轉換結果、預覽區段（F69、F73） */
      const total = result.pages.length;
      /* 依大小分割的切點不比（新版的 HTML 大小不同，第 7 節裁定），條件在最後檢查 */
      if (c.編號 !== 'L20')
        expect(total > 1 ? `完成（分割成 ${total} 個檔案）` : '完成').toBe(c.轉換結果);
      const range = previewSlice(p.entries, { start: 1, limit: 500 });
      expect({ 起: range.start, 迄: range.last, 共: p.entries.length }).toEqual(exp.range);

      /* 下載（F76～F80、3.2、3.9、3.10） */
      const names = downloadNames(result.fileBase, total);
      const fontSize = p.settings.fontSize;
      for (const d of c.下載) {
        if (c.編號 === 'L20') break;
        const loc = locate(d);
        if (loc.kind === 'zip') {
          expect(names.zip).toBe(d.檔名);
          expect(result.pages.map((_, i) => names.page(i))).toEqual(d.ZIP內容);
          continue;
        }
        if (loc.kind === 'blogzip') {
          expect(names.blogZip).toBe(d.檔名);
          expect(result.pages.map((_, i) => names.blog(i))).toEqual(d.ZIP內容);
          continue;
        }
        const html = loc.kind === 'blog' ? blogPage(result, loc.index) : result.pages[loc.index];
        expect(loc.kind === 'blog' ? names.blog(loc.index) : names.page(loc.index)).toBe(d.檔名);
        expect(html).not.toContain('data-log-num');
        const got = extractLogBlocks(false, parse(html));
        expect({ title: got.page.title, lang: got.page.lang }).toEqual({
          title: d.頁面!.title,
          lang: d.頁面!.lang,
        });
        expect({
          標題: got.標題區.標題,
          副標題: got.標題區.副標題,
          摘要: got.標題區.摘要,
        }).toEqual({ 標題: d.標題區!.標題, 副標題: d.標題區!.副標題, 摘要: d.標題區!.摘要 });

        const expected = exp.blocks(d)!;
        const o = { colors: false, fontSize };
        expect(normalizeBlocks(got.區塊, o, 'actual')).toEqual(
          normalizeBlocks(expected, o, 'expected'),
        );

        /* 名稱顏色（使用者指定的值，3.6） */
        if (!exp.colorless) {
          const named = (bs: Record<string, unknown>[]) =>
            bs
              .flatMap((b) => (b.種類 === '分頁區段' ? (b.內容 as Record<string, unknown>[]) : [b]))
              .filter((b) => ['對話', '旁白列'].includes(String(b.種類)))
              .map((b) => [b.名稱, b.名稱顏色]);
          const want = named(expected).map(([n, col]) => [n, rgbToHex(String(col))]);
          expect(named(got.區塊)).toEqual(want);
        }
      }

      if (c.編號 === 'L20') {
        /* 每檔不超過上限（單則超過除外）、順序與內容完整、每則只出現一次、下一則放不進去才換檔。
           附件的 10 KB 之外再用 3 KB 試一次，確定真的分成多檔。 */
        for (const kb of [10, 3]) {
          const r = convertLog(
            p.entries,
            result.options,
            { method: 'size', value: kb },
            result.fileBase,
          );
          const limit = kb * 1024;
          const n = r.pages.length;
          expect(r.parts.flat().map((e) => e.num)).toEqual(p.entries.map((e) => e.num));
          r.pages.forEach((html, i) => {
            if (r.parts[i].length > 1) expect(utf8Length(html)).toBeLessThanOrEqual(limit);
            if (i + 1 < n) {
              const withNext = [...r.parts[i], r.parts[i + 1][0]];
              const size = utf8Length(
                renderDocument(withNext, r.options, { mode: 'page', part: i + 1, total: n }),
              );
              expect(size).toBeGreaterThan(limit);
            }
          });
          if (kb === 3) {
            expect(n).toBeGreaterThan(1);
            const names = downloadNames(r.fileBase, n);
            expect(names.page(0)).toBe('霧港燈塔_part1.html');
            const first = extractLogBlocks(false, parse(r.pages[0]));
            expect(first.page.title).toBe('霧港燈塔 (Part 1)');
            expect(first.標題區.標題).toBe('霧港燈塔 #1');
            expect(first.區塊.at(-1)).toEqual({ 種類: '頁尾', 文字: `第 1 頁，共 ${n} 頁` });
          }
        }
      }
    });
  }
});
