/**
 * 劇本時間表：參考 KIIN「事件タイムライン・アリバイ図面スタジオ」的第一批（規格 1.17～1.21、F116～F130、3.12～3.14）。
 * - 公開範圍的過濾：GM／全體公開／人物別、偽裝、伏字、完全保密、調查後公開、GM 專用的線與標記、退場時刻
 * - PL 用的輸出不洩漏真相（年表文字、Markdown、列印、進行表、圖片 SVG、看得到的資料本身）
 * - 第 N 天的標示（時刻、日程、倒數、階段）的讀寫、刻度、吸附、年表的段
 * - 時間的插入與縮短；專案檔的整理與往返；CSV 的公開範圍欄；範例
 */
import { describe, expect, it } from 'vitest';
import { parseDelimited } from '@/core/csv';
import { buildPicture, pictureToSvg } from '@/tools/scenario-timeline/export/picture';
import {
  exportDoc,
  imageFileName,
  POV_ALL,
  planPicture,
  textFileName,
} from '@/tools/scenario-timeline/export/render';
import { axisTicks, snapUnitFor } from '@/tools/scenario-timeline/model/axis';
import {
  chronicle,
  chronicleHtml,
  chronicleMarkdown,
  chronicleText,
  laneReport,
  laneReportMarkdown,
  laneReportText,
} from '@/tools/scenario-timeline/model/chronicle';
import {
  CSV_FACE_HEADERS,
  CSV_HEADERS,
  eventsToCsv,
  parseEventsTable,
} from '@/tools/scenario-timeline/model/csv';
import { exampleDoc } from '@/tools/scenario-timeline/model/example';
import { mysteryDoc } from '@/tools/scenario-timeline/model/exampleMystery';
import { layoutTimeline } from '@/tools/scenario-timeline/model/layout';
import { estimateWidth } from '@/tools/scenario-timeline/model/measure';
import {
  defaultSession,
  normalizeSession,
  parseSession,
  sessionText,
} from '@/tools/scenario-timeline/model/session';
import { planShift, shiftCount, shiftUnits } from '@/tools/scenario-timeline/model/shift';
import { formatLong, inputText, parseTime, readTime } from '@/tools/scenario-timeline/model/time';
import { normalizeDoc, type TimelineDoc } from '@/tools/scenario-timeline/model/types';
import {
  faceOf,
  hasSecrets,
  ownerId,
  povLanes,
  REDACTED,
  TRUTH_SUFFIX,
  visibleDoc,
} from '@/tools/scenario-timeline/model/visible';

const t = (hhmm: string) => `第 1 天 ${hhmm}`;

/** 公開範圍的測試資料：每個要藏的東西都是獨一無二的字串 */
function secretDoc(): TimelineDoc {
  const doc = normalizeDoc({
    title: '洩漏測試',
    mode: 'day',
    session: { style: 'clock', start: 1080, length: 360, phase: 60 },
    lanes: [
      { id: 'A', name: '人物甲', kind: 'character', color: '#4f7cff', parentId: '', gm: false },
      {
        id: 'B',
        name: '人物乙',
        kind: 'character',
        color: '#e0565b',
        parentId: '',
        gm: false,
        exit: { time: t('22:00'), label: '失蹤' },
      },
      { id: 'P', name: '大廳', kind: 'place', color: '#2fa37a', parentId: '', gm: false },
      {
        id: 'G',
        name: '幕後黑手泳道',
        kind: 'character',
        color: '#8a63d2',
        parentId: '',
        gm: true,
      },
    ],
    categories: [
      { id: 'c1', name: '伏字分類', color: '#123456' },
      { id: 'c2', name: '公開分類', color: '#654321' },
    ],
    events: [
      {
        id: 'a1',
        title: '證詞甲說在圖書室',
        kind: 'range',
        start: t('21:00'),
        end: t('22:00'),
        laneId: 'A',
        place: '圖書室',
        scope: 'alibi',
        truth: { title: '真相甲潛入金庫', start: t('21:10'), end: t('21:30'), place: '祕密金庫' },
        gmNote: 'GM筆記甲',
      },
      {
        id: 'a2',
        title: '伏字甲的表面',
        kind: 'range',
        start: t('22:00'),
        end: t('22:30'),
        laneId: 'A',
        place: '伏字甲地點',
        people: ['伏字甲人'],
        description: '伏字甲說明',
        categoryId: 'c1',
        color: '#abcdef',
        scope: 'redacted',
        truth: { title: '真相甲二', start: '', end: '', place: '真相甲二地點' },
      },
      {
        id: 'b1',
        title: '乙的證詞',
        kind: 'range',
        start: t('21:00'),
        end: t('21:30'),
        laneId: 'B',
        place: '餐廳',
        scope: 'alibi',
        revealed: true,
        truth: { title: '真相乙已查明', start: '', end: '', place: '查明的地點' },
      },
      {
        id: 'b2',
        title: '完全保密乙',
        start: t('21:40'),
        laneId: 'B',
        gm: true,
        scope: 'alibi',
        truth: { title: '保密乙的真相', start: '', end: '', place: '保密地點' },
      },
      { id: 'b3', title: '保密但查明', start: t('21:50'), laneId: 'B', gm: true, revealed: true },
      { id: 'g1', title: '黑手的行動', start: t('21:20'), laneId: 'G', revealed: true },
      {
        id: 'p1',
        title: '大廳的鐘響',
        start: t('22:10'),
        laneId: 'P',
        categoryId: 'c2',
      },
    ],
    markers: [
      { id: 'm1', label: '保密標記', time: t('23:00'), color: '#8a63d2', gm: true },
      { id: 'm2', label: '查明標記', time: t('23:10'), color: '#8a63d2', gm: true, revealed: true },
    ],
    links: [
      { id: 'k1', from: 'a1', to: 'p1', kind: 'cause', note: 'GM線說明', gm: true },
      {
        id: 'k2',
        from: 'b1',
        to: 'p1',
        kind: 'related',
        note: '查明的線',
        gm: true,
        revealed: true,
      },
    ],
  });
  if (!doc) throw new Error('bad');
  return doc;
}

const SECRET_A = [
  '真相甲潛入金庫',
  '祕密金庫',
  '真相甲二',
  '真相甲二地點',
  '伏字甲的表面',
  '伏字甲地點',
  '伏字甲說明',
  '伏字甲人',
  '伏字分類',
];
const SECRET_GM = [
  '完全保密乙',
  '保密乙的真相',
  '保密地點',
  '幕後黑手泳道',
  '黑手的行動',
  'GM筆記甲',
  'GM線說明',
  '保密標記',
];
const OPENED = ['真相乙已查明', '查明的地點', '保密但查明', '查明的線', '查明標記'];

const MEAS = {
  item: (s: string) => estimateWidth(s, 12),
  small: (s: string) => estimateWidth(s, 11),
  major: (s: string) => estimateWidth(s, 11),
  lane: (s: string) => estimateWidth(s, 12),
  title: (s: string) => estimateWidth(s, 18),
};

/** 一個檢視的所有輸出（文字、Markdown、列印、進行表、SVG、看得到的資料） */
function allOutputs(doc: TimelineDoc, audience: 'gm' | 'pl', pov = ''): string[] {
  const v = visibleDoc(doc, audience, pov);
  const ch = chronicle(v, '（無標題）', '劇本時間表', { links: true });
  const rep = laneReport(ch, v, '主線', '（無標題）');
  const ex = {
    range: 'all' as const,
    from: '',
    to: '',
    width: 1600,
    title: true,
    legend: true,
    theme: 'light' as const,
    audience,
    format: 'png' as const,
    scale: 1,
    pov,
  };
  const plan = planPicture(doc, ex, null, {}, null, null, pov);
  if (!plan.ok) throw new Error(plan.error);
  return [
    /* 看得到的資料本身（分類的清單是整份的，和以前相同；圖例、篩選只列用到的） */
    JSON.stringify({
      events: v.events,
      truths: v.truths,
      lanes: v.lanes,
      markers: v.markers,
      links: v.links,
    }),
    chronicleText(ch, audience),
    chronicleMarkdown(ch, audience),
    chronicleHtml(ch, audience),
    laneReportText(rep, audience),
    laneReportMarkdown(rep, audience),
    pictureToSvg(plan.pic),
  ];
}

const leaks = (outs: string[], words: string[]) =>
  words.filter((w) => outs.some((o) => o.includes(w)));

describe('公開範圍（F116～F120）：看得到什麼、看不到什麼', () => {
  const doc = secretDoc();

  it('GM 用：全部（真相另外一筆、證詞與伏字標出、調查後公開標出）', () => {
    const v = visibleDoc(doc, 'gm');
    expect(v.events.map((e) => e.id)).toEqual(['a1', 'a2', 'b1', 'b2', 'b3', 'g1', 'p1']);
    expect(v.truths?.map((x) => x.id)).toEqual([
      `a1${TRUTH_SUFFIX}`,
      `a2${TRUTH_SUFFIX}`,
      `b1${TRUTH_SUFFIX}`,
      `b2${TRUTH_SUFFIX}`,
    ]);
    const a1t = v.truths?.[0];
    expect(a1t).toMatchObject({
      truthOf: 'a1',
      title: '真相甲潛入金庫',
      kind: 'range',
      start: t('21:10'),
      end: t('21:30'),
      place: '祕密金庫',
      laneId: 'A',
    });
    /* 時間空白＝和證詞相同 */
    expect(v.truths?.[1]).toMatchObject({
      start: t('22:00'),
      end: t('22:30'),
      place: '真相甲二地點',
    });
    expect(v.events.find((e) => e.id === 'b1')?.opened).toBe(true);
    /* 調查後公開的完全保密事件：PL 看得到（GM 檢視不畫斜線） */
    expect(v.events.find((e) => e.id === 'b3')?.secret).toBe(false);
    expect(v.events.find((e) => e.id === 'b2')?.secret).toBe(true);
    expect(v.links.find((k) => k.id === 'k2')?.secret).toBe(false);
    expect(v.markers.find((m) => m.id === 'm2')?.secret).toBe(false);
    expect(hasSecrets(doc)).toBe(true);
  });

  it('全體公開：偽裝只有證詞（和公開的一樣）、伏字是「？？？」、完全保密拿掉、調查後公開看得到', () => {
    const v = visibleDoc(doc, 'pl');
    expect(v.events.map((e) => e.id)).toEqual(['a1', 'a2', 'b1', 'b3', 'p1']);
    const a1 = v.events[0];
    expect(a1).toMatchObject({ title: '證詞甲說在圖書室', place: '圖書室', gmNote: '' });
    /* 看起來和公開的事件一樣：沒有公開範圍的欄位 */
    expect('scope' in a1 || 'truth' in a1 || 'revealed' in a1 || 'masked' in a1).toBe(false);
    const a2 = v.events[1];
    expect(a2).toMatchObject({
      title: REDACTED,
      place: '',
      people: [],
      description: '',
      categoryId: '',
      color: '',
      masked: true,
      start: t('22:00'),
      end: t('22:30'),
      laneId: 'A',
    });
    expect('truth' in a2).toBe(false);
    expect(v.events[2]).toMatchObject({ opened: true, truth: { title: '真相乙已查明' } });
    expect(v.events[3]).toMatchObject({ title: '保密但查明', opened: true, gm: false });
    expect(v.truths?.map((x) => x.truthOf)).toEqual(['b1']);
    /* GM 專用的泳道上的事件：調查後公開也看不到 */
    expect(v.lanes.map((l) => l.id)).toEqual(['A', 'B', 'P']);
    expect(v.links.map((k) => k.id)).toEqual(['k2']);
    expect(v.markers.map((m) => m.id)).toEqual(['m2']);
    /* 退場時刻：所有檢視都看得到 */
    expect(v.lanes.find((l) => l.id === 'B')?.exit).toEqual({ time: t('22:00'), label: '失蹤' });
    expect(v.pov).toBe('');
  });

  it('人物別：全體公開＋本人的偽裝與伏字的真相；完全保密的連本人也看不到', () => {
    const a = visibleDoc(doc, 'pl', 'A');
    expect(a.pov).toBe('A');
    expect(a.events.find((e) => e.id === 'a1')).toMatchObject({
      scope: 'alibi',
      truth: { title: '真相甲潛入金庫' },
    });
    expect(a.events.find((e) => e.id === 'a2')).toMatchObject({
      title: '伏字甲的表面',
      place: '伏字甲地點',
    });
    expect(a.events.find((e) => e.id === 'a2')?.masked).toBeUndefined();
    expect(a.truths?.map((x) => x.truthOf)).toEqual(['a1', 'a2', 'b1']);
    const b = visibleDoc(doc, 'pl', 'B');
    expect(b.events.map((e) => e.id)).toEqual(['a1', 'a2', 'b1', 'b3', 'p1']);
    expect(b.events.find((e) => e.id === 'a2')?.masked).toBe(true);
    expect(b.truths?.map((x) => x.truthOf)).toEqual(['b1']);
    /* 指到 PL 看不到的泳道、不存在的泳道＝全體公開 */
    expect(visibleDoc(doc, 'pl', 'G').pov).toBe('');
    expect(visibleDoc(doc, 'pl', 'nope').pov).toBe('');
    /* GM 版不管人物別 */
    expect(visibleDoc(doc, 'gm', 'A').pov).toBe('');
    expect(povLanes(doc).map((l) => l.id)).toEqual(['A', 'B']);
  });

  it('PL 用的每一種輸出都找不到真相的文字、偽裝前的地點與 GM 專用的東西（調查後公開的除外）', () => {
    const pl = allOutputs(doc, 'pl');
    expect(leaks(pl, [...SECRET_A, ...SECRET_GM])).toEqual([]);
    expect(leaks(pl, OPENED)).toEqual(OPENED);
    const a = allOutputs(doc, 'pl', 'A');
    expect(leaks(a, SECRET_GM)).toEqual([]);
    expect(leaks(a, SECRET_A)).toEqual(SECRET_A);
    const b = allOutputs(doc, 'pl', 'B');
    expect(leaks(b, [...SECRET_A, ...SECRET_GM])).toEqual([]);
    /* GM 用：全部都有 */
    const gm = allOutputs(doc, 'gm');
    expect(leaks(gm, [...SECRET_A, ...SECRET_GM])).toEqual([...SECRET_A, ...SECRET_GM]);
  });

  it('只到目前進度：進度之後的退場、真相拿掉', () => {
    const d: TimelineDoc = { ...doc, progress: { on: true, time: t('21:15'), plOnly: true } };
    const v = visibleDoc(d, 'pl', 'A');
    expect(v.lanes.find((l) => l.id === 'B')?.exit).toBeUndefined();
    /* a1 的真相從 21:10 開始（進行中） */
    expect(v.truths?.find((x) => x.truthOf === 'a1')).toMatchObject({ ongoing: true });
    expect(v.events.some((e) => e.id === 'a2')).toBe(false);
    expect(visibleDoc(d, 'gm').lanes.find((l) => l.id === 'B')?.exit).toBeDefined();
  });

  it('真相那一筆的 id、事件的看起來', () => {
    expect(ownerId(`x1${TRUTH_SUFFIX}`)).toBe('x1');
    expect(ownerId('x1')).toBe('x1');
    expect(faceOf({ gm: true, scope: 'alibi' })).toBe('secret');
    expect(faceOf({ gm: false, scope: 'redacted' })).toBe('redacted');
    expect(faceOf({ gm: false })).toBe('public');
  });
});

describe('年表、進行表、圖片（F122、F123）', () => {
  const doc = secretDoc();

  it('年表：〔證詞〕〔伏字〕〔調查後公開〕、〔真相〕的一行（時間不同時寫時間）、退場', () => {
    const gm = chronicleText(chronicle(visibleDoc(doc, 'gm'), '（無標題）', '劇本時間表'), 'gm');
    expect(gm).toContain('・21:00～22:00　證詞甲說在圖書室〔人物甲〕〔證詞〕\n');
    expect(gm).toContain('　　〔真相〕真相甲潛入金庫（21:10～21:30／地點：祕密金庫）\n');
    expect(gm).toContain('　　〔真相〕真相甲二（地點：真相甲二地點）\n');
    expect(gm).toContain('・21:00～21:30　乙的證詞〔人物乙〕〔證詞〕〔調查後公開〕\n');
    expect(gm).toContain('◇ 22:00　人物乙 退場（失蹤）\n');
    const pl = chronicleText(chronicle(visibleDoc(doc, 'pl'), '（無標題）', '劇本時間表'), 'pl');
    expect(pl).toContain('・21:00～22:00　證詞甲說在圖書室〔人物甲〕\n　　地點：圖書室\n');
    expect(pl).toContain(`・22:00～22:30　${REDACTED}〔人物甲〕\n`);
    const pov = chronicle(visibleDoc(doc, 'pl', 'A'), '（無標題）', '劇本時間表');
    expect(chronicleText(pov, 'pl').split('\n')[0]).toBe('洩漏測試〔人物甲 視角〕');
    expect(chronicleMarkdown(pov, 'pl').split('\n')[0]).toBe('# 洩漏測試（人物甲 視角）');
  });

  it('進行表（人物・地點別）：每條泳道一段、退場寫在段的標題、沒有紀錄的泳道', () => {
    const v = visibleDoc(doc, 'pl');
    const rep = laneReport(chronicle(v, '（無標題）', '劇本時間表'), v, '主線', '（無標題）');
    expect(rep.lanes.map((l) => l.name)).toEqual(['人物甲', '人物乙', '大廳']);
    const text = laneReportText(rep, 'pl');
    expect(text).toBe(
      [
        '洩漏測試',
        '21:00～23:10',
        '',
        '■ 人物甲',
        '・21:00～22:00　證詞甲說在圖書室',
        '　　地點：圖書室',
        `・22:00～22:30　${REDACTED}`,
        '',
        '■ 人物乙　22:00 退場（失蹤）',
        '・21:00～21:30　乙的證詞〔證詞〕〔調查後公開〕',
        '　　地點：餐廳',
        '　　〔真相〕真相乙已查明（地點：查明的地點）',
        '・21:50　保密但查明〔調查後公開〕',
        '',
        '■ 大廳',
        '・22:10　大廳的鐘響〔公開分類〕',
        '',
      ].join('\n'),
    );
    const empty = laneReport(
      chronicle(visibleDoc({ ...doc, events: [] }, 'pl'), '（無標題）', '劇本時間表'),
      visibleDoc({ ...doc, events: [] }, 'pl'),
      '主線',
      '（無標題）',
    );
    expect(laneReportText(empty, 'pl')).toContain('■ 大廳\n（沒有紀錄）\n');
    expect(laneReportMarkdown(rep, 'gm')).toContain('## 人物乙（22:00 退場（失蹤））');
  });

  it('列印：有真相、退場時才加樣式', () => {
    const ch = chronicle(visibleDoc(doc, 'gm'), '（無標題）', '劇本時間表');
    const html = chronicleHtml(ch, 'gm');
    expect(html).toContain(
      '<div class="truth">〔真相〕真相甲潛入金庫（21:10～21:30／地點：祕密金庫）</div>',
    );
    expect(html).toContain('<li class="exit">');
  });

  it('圖片：真相、伏字、退場、人物別的標題', () => {
    const pic = (aud: 'gm' | 'pl', pov = '') => {
      const v = visibleDoc(doc, aud, pov);
      return buildPicture({
        vdoc: v,
        range: { a: 1200, b: 1440 },
        width: 1200,
        title: true,
        legend: true,
        theme: 'light',
        collapsed: {},
        measures: MEAS,
        strings: {
          untitled: '（無標題）',
          main: '主線',
          fallbackTitle: '劇本時間表',
          gmUse: 'GM 用',
          progress: '目前進度',
          now: '現在',
          rangeText: '',
          ...(pov ? { pov: '人物甲 視角' } : {}),
          truth: '真相',
          alibi: '證詞',
          redacted: '伏字',
          opened: '查明',
          exit: '退場',
        },
        nowV: null,
      });
    };
    const gm = pictureToSvg(pic('gm'));
    expect(gm).toContain('>真相甲潛入金庫<');
    expect(gm).toContain('>證詞<');
    /* 退場的標籤在標記列（旗子），不壓到泳道裡的事件 */
    expect(gm).toContain('>人物乙 失蹤<');
    const pl = pictureToSvg(pic('pl'));
    expect(pl).toContain(`>${REDACTED}<`);
    /* 證詞的小標只有知道真相的（調查後公開的乙）才有 */
    expect(pl.split('>證詞<').length - 1).toBe(1);
    expect(pl).not.toContain('人物甲 視角');
    expect(pictureToSvg(pic('pl', 'A'))).toContain('>人物甲 視角<');
  });

  it('真相的列：同樣的開始時證詞在上、真相在下', () => {
    const v = visibleDoc(doc, 'gm');
    const lay = layoutTimeline(v, { k: 4, measure: MEAS.item, collapsed: {}, untitled: '' });
    const b1 = lay.items.find((x) => x.id === 'b1');
    const b1t = lay.items.find((x) => x.id === `b1${TRUTH_SUFFIX}`);
    expect(b1 && b1t && b1t.level > b1.level).toBe(true);
    expect(b1t?.row).toBe(b1?.row);
  });

  it('檔名：人物別加名稱、進行表', () => {
    expect(imageFileName(doc, 'pl', 'png', 'A')).toBe('洩漏測試_時間軸_人物甲.png');
    expect(imageFileName(doc, 'gm', 'svg', 'A')).toBe('洩漏測試_時間軸_GM.svg');
    expect(imageFileName(doc, 'pl', 'png')).toBe('洩漏測試_時間軸.png');
    expect(textFileName(doc, 'pl', 'txt', 'B', true)).toBe('洩漏測試_進行表_人物乙.txt');
    expect(textFileName(doc, 'gm', 'md', '', false)).toBe('洩漏測試_年表_GM.md');
    expect(POV_ALL).toBe('*');
    expect(exportDoc(doc, 'pl', null, 'A').pov).toBe('A');
  });
});

describe('第 N 天的標示（F124～F127）', () => {
  const ses = (style: 'clock' | 'schedule' | 'countdown' | 'phase') => defaultSession(style);

  it('時刻：開始時刻起的 24 小時寫 HH:MM，範圍外照第 N 天；讀 HH:MM 取開始時刻之後的', () => {
    const s = ses('clock');
    expect(sessionText(s, 18 * 60)).toBe('18:00');
    expect(sessionText(s, 1440 + 90)).toBe('01:30');
    expect(sessionText(s, 17 * 60)).toBeNull();
    expect(sessionText(s, 1440 + 18 * 60)).toBeNull();
    expect(parseSession(s, '01:30')).toEqual({ ok: true, v: 1440 + 90 });
    expect(parseSession(s, '19:00')).toEqual({ ok: true, v: 19 * 60 });
    expect(parseSession(s, '25:30')).toEqual({ ok: true, v: 1440 + 90 });
    expect(parseSession(s, '翌 17:00')).toEqual({ ok: true, v: 1440 + 17 * 60 });
    expect(parseSession(s, '第 1 天 18:00')).toBeNull();
    expect(parseSession(s, '48:00')).toMatchObject({ ok: false });
  });

  it('日程：早午晚夜（06:00 換日），不在段的開頭加時刻', () => {
    const s = ses('schedule');
    expect(sessionText(s, 360)).toBe('第 1 天 早');
    expect(sessionText(s, 18 * 60)).toBe('第 1 天 晚');
    expect(sessionText(s, 1440)).toBe('第 1 天 夜');
    expect(sessionText(s, 1440 + 360)).toBe('第 2 天 早');
    expect(sessionText(s, 8 * 60 + 30)).toBe('第 1 天 早 08:30');
    expect(parseSession(s, '第 2 天 晚')).toEqual({ ok: true, v: 1440 + 18 * 60 });
    expect(parseSession(s, 'Day1 夜')).toEqual({ ok: true, v: 1440 });
    expect(parseSession(s, 'D1 早上')).toEqual({ ok: true, v: 360 });
    expect(parseSession(s, '第1天下午')).toEqual({ ok: true, v: 720 });
    expect(parseSession(s, '第 1 天 夜 02:15')).toEqual({ ok: true, v: 1440 + 135 });
    expect(parseSession(s, '第 1 天 早 13:00')).toMatchObject({ ok: false });
    expect(parseSession(s, '第 3 天')).toBeNull();
  });

  it('倒數：T-0＝開始時刻＋時間幅', () => {
    const s = ses('countdown');
    expect(sessionText(s, 24 * 60 - 90)).toBe('T-01:30');
    expect(sessionText(s, 24 * 60 + 15)).toBe('T+00:15');
    expect(sessionText(s, 18 * 60)).toBe('T-06:00');
    expect(parseSession(s, 'T-01:30')).toEqual({ ok: true, v: 24 * 60 - 90 });
    expect(parseSession(s, 'T-90m')).toEqual({ ok: true, v: 24 * 60 - 90 });
    expect(parseSession(s, 'T+15分')).toEqual({ ok: true, v: 24 * 60 + 15 });
    expect(parseSession(s, 'T-1h30m')).toEqual({ ok: true, v: 24 * 60 - 90 });
    expect(parseSession(s, 'T-0')).toEqual({ ok: true, v: 24 * 60 });
    expect(parseSession(s, 'T90')).toMatchObject({ ok: false });
  });

  it('階段：從開始時刻起每段一個階段', () => {
    const s = { ...ses('phase'), phase: 30 };
    expect(sessionText(s, 18 * 60)).toBe('階段 1');
    expect(sessionText(s, 19 * 60)).toBe('階段 3');
    expect(sessionText(s, 19 * 60 + 15)).toBe('階段 3 +15 分');
    expect(parseSession(s, '階段 3')).toEqual({ ok: true, v: 19 * 60 });
    expect(parseSession(s, 'Phase 3 +15')).toEqual({ ok: true, v: 19 * 60 + 15 });
    expect(parseSession(s, '第 2 幕')).toEqual({ ok: true, v: 18 * 60 + 30 });
    expect(parseSession(s, '階段 1 +30 分')).toMatchObject({ ok: false });
  });

  it('不失去精度：顯示的寫法讀回來是同一個位置（四種標示、-2～3 天每 7 分）', () => {
    for (const style of ['clock', 'schedule', 'countdown', 'phase'] as const) {
      const s = { ...ses(style), start: 17 * 60 + 45, length: 200, phase: 45 };
      const ctx = { era: '', session: s };
      for (let v = -2 * 1440; v < 3 * 1440; v += 7) {
        const text = formatLong('day', { v, p: 'minute' }, ctx);
        const r = parseTime('day', text, ctx);
        expect(r.ok && r.tv.v, `${style} ${v} ${text}`).toBe(v);
        expect(
          inputText(
            'day',
            `第 ${Math.floor(v / 1440) + 1} 天 ${String(Math.floor((((v % 1440) + 1440) % 1440) / 60)).padStart(2, '0')}:${String(((v % 60) + 60) % 60).padStart(2, '0')}`,
            ctx,
          ),
        ).toBe(text);
      }
    }
  });

  it('只到日的時間照第 N 天；存檔照舊是第 N 天的標準寫法', () => {
    const ctx = { era: '', session: ses('countdown') };
    expect(formatLong('day', { v: 1440, p: 'day' }, ctx)).toBe('第 2 天');
    const doc = normalizeDoc({
      mode: 'day',
      session: { style: 'phase' },
      events: [{ start: '階段 2', title: 'x' }],
    });
    expect(doc?.events[0].start).toBe('第 1 天 19:00');
    expect(doc?.session).toEqual({ style: 'phase', start: 1080, length: 360, phase: 60 });
  });

  it('整理：認不得的標示拿掉；只有第 N 天才有；數值夾在範圍裡', () => {
    expect(normalizeSession({ style: 'x' })).toBeNull();
    expect(normalizeSession({ style: 'countdown', start: 5000, length: 1, phase: 99999 })).toEqual({
      style: 'countdown',
      start: 1439,
      length: 15,
      phase: 1440,
    });
    expect(
      normalizeDoc({ mode: 'date', session: { style: 'clock' }, events: [] })?.session,
    ).toBeUndefined();
    expect('snap' in (normalizeDoc({ mode: 'year', snap: 15, events: [] }) ?? {})).toBe(false);
    expect(normalizeDoc({ mode: 'date', snap: 30, events: [] })?.snap).toBe(30);
    expect(normalizeDoc({ mode: 'date', snap: 7, events: [] })?.snap).toBeUndefined();
  });

  it('刻度：倒數寫 T-、日程寫早午晚夜、階段寫階段 N；吸附對齊到起點', () => {
    const measure = (s: string) => estimateWidth(s, 11);
    const cd = { era: '', session: ses('countdown') };
    const a = axisTicks('day', 1080, 1440, 1000 / 360, measure, cd);
    expect(a.minor.some((x) => x.label === 'T-01:00' && x.v === 1380)).toBe(true);
    expect(a.major).toEqual([{ v: 1440, label: 'T-0' }]);
    const sc = { era: '', session: ses('schedule') };
    const b = axisTicks('day', 0, 3 * 1440, 900 / (3 * 1440), measure, sc);
    expect(b.step.unit).toBe('slot');
    expect(b.minor.find((x) => x.v === 1080)?.label).toBe('晚');
    expect(b.major.find((x) => x.v === 360)?.label).toBe('第 1 天');
    expect(b.snap).toEqual({ kind: 'min', n: 360, o: 360 });
    const ph = { era: '', session: { ...ses('phase'), start: 1090, phase: 40 } };
    const c = axisTicks('day', 1000, 1600, 1200 / 600, measure, ph);
    expect(c.step).toEqual({ unit: 'phase', n: 1 });
    expect(c.minor.find((x) => x.v === 1090)?.label).toBe('階段 1');
    expect(c.minor.find((x) => x.v === 1130)?.label).toBe('階段 2');
    expect(c.snap).toEqual({ kind: 'min', n: 10, o: 1090 });
    /* 時刻：刻度和第 N 天相同 */
    const ck = axisTicks('day', 1080, 1440, 1000 / 360, measure, {
      era: '',
      session: ses('clock'),
    });
    expect(ck).toEqual(axisTicks('day', 1080, 1440, 1000 / 360, measure, ''));
  });

  it('固定的吸附（F128）：日期時間、第 N 天的任何刻度都吸附到 n 分', () => {
    expect(snapUnitFor('date', { unit: 'day', n: 2 }, { era: '', snap: 15 })).toEqual({
      kind: 'min',
      n: 15,
    });
    expect(snapUnitFor('day', { unit: 'minute', n: 5 }, { era: '', snap: 60 })).toEqual({
      kind: 'min',
      n: 60,
    });
    expect(snapUnitFor('year', { unit: 'year', n: 10 }, { era: '', snap: 60 })).toEqual({
      kind: 'year',
      n: 2,
    });
  });

  it('年表：日程每天一段、倒數不分段、階段每個階段一段', () => {
    const base = normalizeDoc({
      title: 'x',
      mode: 'day',
      events: [
        { id: 'e1', title: '甲', start: t('19:00') },
        { id: 'e2', title: '乙', kind: 'range', start: t('20:00'), end: '第 2 天 07:00' },
      ],
    }) as TimelineDoc;
    const text = (style: 'schedule' | 'countdown' | 'phase') =>
      chronicleText(chronicle(visibleDoc({ ...base, session: ses(style) }, 'pl'), '', 'x'), 'pl');
    expect(text('schedule')).toBe(
      'x\n第 1 天 晚 19:00～第 2 天 早 07:00\n\n■ 第 1 天\n・晚 19:00　甲\n・晚 20:00～第 2 天 早 07:00　乙\n',
    );
    expect(text('countdown')).toBe(
      'x\nT-05:00～T+07:00\n\n・T-05:00　甲\n・T-04:00～T+07:00　乙\n',
    );
    expect(text('phase')).toBe(
      'x\n階段 2～階段 14\n\n■ 階段 2\n・甲\n\n■ 階段 3\n・～階段 14　乙\n',
    );
  });
});

describe('時間的插入與縮短（F129）', () => {
  const base = () =>
    normalizeDoc({
      mode: 'day',
      lanes: [
        {
          id: 'L',
          name: 'L',
          kind: 'character',
          color: '#4f7cff',
          parentId: '',
          gm: false,
          exit: { time: t('22:00'), label: '' },
        },
      ],
      events: [
        { id: 'before', title: 'b', start: t('19:00') },
        { id: 'cross', title: 'c', kind: 'range', start: t('19:30'), end: t('20:30') },
        { id: 'after', title: 'a', kind: 'range', start: t('20:00'), end: t('21:00') },
        { id: 'whole', title: 'w', start: '第 2 天' },
        {
          id: 'alibi',
          title: 'x',
          start: t('20:15'),
          laneId: 'L',
          scope: 'alibi',
          truth: { title: 't', start: t('19:45'), end: t('20:45'), place: '' },
        },
        {
          id: 'same',
          title: 's',
          start: t('20:10'),
          scope: 'alibi',
          truth: { title: 't2', start: '', end: t('21:00'), place: '' },
        },
      ],
      markers: [{ id: 'm', label: 'm', time: t('23:00'), color: '#8a63d2', gm: false }],
      progress: { on: true, time: t('20:00'), plOnly: false },
      session: { style: 'countdown', start: 1080, length: 360, phase: 60 },
    }) as TimelineDoc;

  it('插入：基準之後開始的往後挪（含基準）；跨過基準的不動；只到日的照自己的寫法；退場、標記、進度、T-0', () => {
    const d = base();
    const p = planShift(d, 20 * 60, 30);
    const ev = (id: string) => p.events.find((e) => e.id === id);
    expect(ev('before')?.start).toBe(t('19:00'));
    expect(ev('cross')).toMatchObject({ start: t('19:30'), end: t('20:30') });
    expect(ev('after')).toMatchObject({ start: t('20:30'), end: t('21:30') });
    expect(ev('whole')?.start).toBe('第 2 天');
    /* 證詞在基準之後、真相寫了開始（在基準之前）：真相不動 */
    expect(ev('alibi')).toMatchObject({
      start: t('20:45'),
      truth: { start: t('19:45'), end: t('20:45') },
    });
    /* 真相沒寫開始（跟著證詞）：結束一起移動 */
    expect(ev('same')).toMatchObject({ start: t('20:40'), truth: { start: '', end: t('21:30') } });
    expect(p.markers[0].time).toBe(t('23:30'));
    expect(p.progressTime).toBe(t('20:30'));
    expect(p.lanes[0].exit?.time).toBe(t('22:30'));
    expect(p.sessionLength).toBe(390);
    expect(p.moved).toBe(6);
    expect(p.aligned).toBe(0);
    expect(shiftCount(d, 20 * 60)).toBe(7);
  });

  it('縮短：往前縮；只到日的照自己的寫法對齊（位移 1 天時才動）', () => {
    const d = base();
    const p = planShift(d, 20 * 60, -1440);
    expect(p.events.find((e) => e.id === 'whole')?.start).toBe('第 1 天');
    expect(p.events.find((e) => e.id === 'after')).toMatchObject({
      start: '第 0 天 20:00',
      end: '第 0 天 21:00',
    });
    const q = planShift(d, 20 * 60, -30);
    expect(q.events.find((e) => e.id === 'whole')?.start).toBe('第 2 天');
    expect(q.events.find((e) => e.id === 'after')).toMatchObject({
      start: t('19:30'),
      end: t('20:30'),
    });
    expect(q.sessionLength).toBe(330);
  });

  it('單位：日期時間、第 N 天是分、時、天；架空年是年（有月份時加日，寫到時刻時加分、時）', () => {
    expect(
      shiftUnits({ mode: 'date', calendar: { months: [], weekdays: [], weekStart: 0 } }).map(
        (u) => u.v,
      ),
    ).toEqual([1, 60, 1440]);
    expect(
      shiftUnits({ mode: 'year', calendar: { months: [], weekdays: [], weekStart: 0 } }).map(
        (u) => u.id,
      ),
    ).toEqual(['year']);
    expect(
      shiftUnits({
        mode: 'year',
        calendar: {
          months: [{ id: 'a', name: 'a', days: 30 }],
          weekdays: [],
          weekStart: 0,
          clock: true,
        },
      }).map((u) => u.id),
    ).toEqual(['min', 'hour', 'day', 'year']);
  });

  it('架空年：一次幾年；位移 0 時不動', () => {
    const d = normalizeDoc({
      mode: 'year',
      events: [{ id: 'e', title: 'e', start: '302' }],
    }) as TimelineDoc;
    expect(planShift(d, 300, 5).events[0].start).toBe('307');
    expect(planShift(d, 303, 5).events[0].start).toBe('302');
    expect(planShift(d, 300, 0).moved).toBe(0);
  });
});

describe('專案檔與自動儲存（版本 4）', () => {
  it('新的欄位只有用了才有；整理掉看不懂的', () => {
    const d = normalizeDoc({
      mode: 'date',
      lanes: [
        { id: 'l', name: 'l', exit: { time: '看不懂' } },
        {
          id: 'm',
          name: 'm',
          exit: { time: '1925-03-12 21:00', label: '死亡死亡死亡死亡死亡死亡死亡死亡' },
        },
      ],
      events: [
        {
          id: 'a',
          title: 'a',
          start: '1925-03-12',
          scope: 'x',
          truth: { title: '', start: '', end: '', place: '' },
          revealed: 'yes',
        },
        {
          id: 'b',
          title: 'b',
          start: '1925-03-12',
          scope: 'redacted',
          truth: { title: '真', start: '看不懂', end: '1925-03-13', place: '倉庫' },
          revealed: true,
        },
      ],
      markers: [{ id: 'm', label: 'm', time: '1925', revealed: true }],
      links: [{ id: 'k', from: 'a', to: 'b', gm: true, revealed: true }],
    }) as TimelineDoc;
    expect('exit' in d.lanes[0]).toBe(false);
    expect(d.lanes[1].exit).toEqual({
      time: '1925-03-12 21:00',
      label: '死亡死亡死亡死亡死亡死亡',
    });
    expect(Object.keys(d.events[0]).some((k) => ['scope', 'truth', 'revealed'].includes(k))).toBe(
      false,
    );
    expect(d.events[1]).toMatchObject({
      scope: 'redacted',
      truth: { title: '真', start: '', end: '1925-03-13', place: '倉庫' },
      revealed: true,
    });
    expect(d.markers[0].revealed).toBe(true);
    expect(d.links[0].revealed).toBe(true);
  });

  it('存了再讀：逐欄位相同（範例與推理劇本的範例）', () => {
    for (const doc of [exampleDoc(), mysteryDoc()]) {
      const once = normalizeDoc(JSON.parse(JSON.stringify(doc)));
      const twice = normalizeDoc(JSON.parse(JSON.stringify(once)));
      expect(twice).toEqual(once);
    }
  });

  it('沒用新功能的專案：整理後沒有新的欄位（和第三批的資料逐欄位相同）', () => {
    const d = normalizeDoc(JSON.parse(JSON.stringify(exampleDoc()))) as TimelineDoc;
    expect('session' in d || 'snap' in d).toBe(false);
    expect(d.lanes.some((l) => 'exit' in l)).toBe(false);
    expect(d.events.some((e) => 'scope' in e || 'truth' in e || 'revealed' in e)).toBe(false);
    expect(d.markers.some((m) => 'revealed' in m) || d.links.some((k) => 'revealed' in k)).toBe(
      false,
    );
  });
});

describe('CSV（F75 的公開範圍欄）', () => {
  it('沒用時欄位照舊；用了時最後面加六欄；匯出再讀入逐欄相同', () => {
    const plain = eventsToCsv(normalizeDoc(exampleDoc()) as TimelineDoc);
    expect(plain.slice(1).split('\r\n')[0]).toBe(CSV_HEADERS.join(','));
    const doc = secretDoc();
    const csv = eventsToCsv(doc);
    const rows = parseDelimited(csv.slice(1));
    expect(rows[0]).toEqual([...CSV_HEADERS, ...CSV_FACE_HEADERS]);
    const a1 = rows.find((r) => r[0] === '證詞甲說在圖書室');
    expect(a1?.slice(12)).toEqual([
      '偽裝',
      '真相甲潛入金庫',
      t('21:10'),
      t('21:30'),
      '祕密金庫',
      '否',
    ]);
    const back = parseEventsTable(csv.slice(1), doc);
    expect(back.errors).toEqual([]);
    const get = (title: string) => back.events.find((e) => e.title === title);
    expect(get('證詞甲說在圖書室')).toMatchObject({
      scope: 'alibi',
      truth: { title: '真相甲潛入金庫', start: t('21:10'), end: t('21:30'), place: '祕密金庫' },
    });
    expect(get('乙的證詞')).toMatchObject({ scope: 'alibi', revealed: true });
    expect(get('大廳的鐘響')).not.toHaveProperty('scope');
    expect(get('保密但查明')).toMatchObject({ gm: true, revealed: true });
  });

  it('真相的欄防公式注入；看不懂的公開範圍不收', () => {
    const doc = secretDoc();
    doc.events[0].truth = { title: '=HYPERLINK("x")', start: '', end: '', place: '+1' };
    const csv = eventsToCsv(doc);
    expect(csv).toContain(`'=HYPERLINK`);
    const back = parseEventsTable(csv.slice(1), doc);
    expect(back.events[0].truth?.title).toBe('=HYPERLINK("x")');
    const bad = parseEventsTable('標題,開始,公開範圍\nx,第 1 天,什麼\n', doc);
    expect(bad.errors).toEqual([{ row: 2, message: '看不懂公開範圍「什麼」' }]);
  });
});

describe('推理劇本的範例（F130）', () => {
  it('五個人物、一個地點；偽裝、伏字、完全保密、調查後公開、退場、時刻的標示、背景都有用到', () => {
    const d = normalizeDoc(mysteryDoc()) as TimelineDoc;
    expect(d.title).toBe('紅幕劇場的首演之夜');
    expect(d.session).toEqual({ style: 'clock', start: 1080, length: 300, phase: 60 });
    expect(d.lanes.filter((l) => l.kind !== 'place')).toHaveLength(5);
    expect(d.lanes.find((l) => l.exit)?.exit).toEqual({ time: t('21:47'), label: '死亡' });
    const faces = new Set(d.events.map(faceOf));
    expect([...faces].sort()).toEqual(['alibi', 'public', 'redacted', 'secret']);
    expect(d.events.some((e) => e.revealed)).toBe(true);
    expect(d.events.filter((e) => e.kind === 'background')).toHaveLength(3);
    expect(d.links.some((k) => k.gm && !k.revealed)).toBe(true);
    expect(d.links.some((k) => k.gm && k.revealed)).toBe(true);
    /* 偽裝的真相時間、地點和證詞不同 */
    const alibi = d.events.find((e) => e.id === 'mx-jiang-room');
    expect(alibi?.truth?.place).not.toBe(alibi?.place);
    expect(alibi?.truth?.start).not.toBe(alibi?.start);
    /* PL 版看不到服裝師的真相；服裝師的人物別看得到 */
    const truth = '解開沙袋配重的繩結';
    expect(JSON.stringify(visibleDoc(d, 'pl'))).not.toContain(truth);
    expect(JSON.stringify(visibleDoc(d, 'pl', 'mx-jiang'))).toContain(truth);
    /* 主演的 GM 筆記（小魏拜託他作證；第五批補的同席，2026-11-12）PL 看不到 */
    for (const pov of ['', 'mx-xu', 'mx-wei'])
      expect(JSON.stringify(visibleDoc(d, 'pl', pov))).not.toContain('一直看到自己在下舞台');
    expect(readTime('day', d.events[0].start, d)?.v).toBe(19 * 60 + 30);
  });
});
