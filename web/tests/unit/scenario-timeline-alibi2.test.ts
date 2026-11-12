/**
 * 劇本時間表：參考 KIIN「事件タイムライン・アリバイ図面スタジオ」的第二批（規格 1.22～1.24、F131～F141、3.15～3.17）。
 * - 不在場證明空白、同席調書（證詞與真相、PL 與 GM）、時間切片、聚光、段階公開的狀態
 * - 匯出圖的樣式（紙、老舊、翻角、字體、圖框、格線、記號、空白、調書、聚光）與 A4 分頁的計算
 * - 不洩漏：PL 用與人物別的分析與輸出推不出真相、完全保密、GM 專用的東西；改藏起來的欄位時 PL 的結果不變
 */
import { describe, expect, it } from 'vitest';
import { wearPlan } from '@/core/paperWear';
import { CURL_PAD, OUTER_MARGIN, wearShapes } from '@/tools/scenario-timeline/export/paper';
import {
  buildPicture,
  drawPicture,
  type PanelSpec,
  type Picture,
  type Prim,
  pictureToSvg,
  splitPanel,
} from '@/tools/scenario-timeline/export/picture';
import {
  imageFileName,
  PANEL_FIT,
  panelSpec,
  pictureStyle,
  planPicture,
  planPicturePages,
  reportLabels,
  sliceLabels,
} from '@/tools/scenario-timeline/export/render';
import {
  alibiGaps,
  contactReport,
  durationText,
  gapRange,
  outsideTruth,
  overlapOf,
  personLanes,
  timeSlice,
} from '@/tools/scenario-timeline/model/alibi';
import { alibiReport, reportText, sliceReport } from '@/tools/scenario-timeline/model/alibiReport';
import { mysteryDoc } from '@/tools/scenario-timeline/model/exampleMystery';
import { collectFlags } from '@/tools/scenario-timeline/model/flags';
import { estimateWidth } from '@/tools/scenario-timeline/model/measure';
import {
  A4_RATIO,
  ABSORB,
  idealTrackWidth,
  pageLabel,
  planPages,
} from '@/tools/scenario-timeline/model/paging';
import {
  litIds,
  spotLanes,
  spotMatcher,
  spotOptions,
  validSpot,
} from '@/tools/scenario-timeline/model/spotlight';
import {
  clearUnlocks,
  lockables,
  setUnlocked,
  unlockCount,
} from '@/tools/scenario-timeline/model/stage';
import { readTime } from '@/tools/scenario-timeline/model/time';
import { normalizeDoc, type TimelineDoc } from '@/tools/scenario-timeline/model/types';
import { visibleDoc } from '@/tools/scenario-timeline/model/visible';

const t = (hhmm: string) => `第 1 天 ${hhmm}`;
const v = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** 分析用的測試資料：每個要藏的東西都是獨一無二的字串 */
function caseDoc(): TimelineDoc {
  const doc = normalizeDoc({
    title: '分析測試',
    mode: 'day',
    lanes: [
      { id: 'A', name: '人物甲', kind: 'character', color: '#4f7cff', parentId: '', gm: false },
      { id: 'B', name: '人物乙', kind: 'character', color: '#e0565b', parentId: '', gm: false },
      {
        id: 'C',
        name: '人物丙',
        kind: 'npc',
        color: '#2fa37a',
        parentId: '',
        gm: false,
        exit: { time: t('22:30'), label: '死亡' },
      },
      { id: 'P', name: '大廳泳道', kind: 'place', color: '#8a63d2', parentId: '', gm: false },
      { id: 'G', name: '黑手泳道', kind: 'character', color: '#d9902f', parentId: '', gm: true },
    ],
    events: [
      /* 甲：證詞在圖書室 21:00～22:00，真相 21:10～21:30 在祕密金庫 */
      {
        id: 'a1',
        title: '甲說在圖書室看書',
        kind: 'range',
        start: t('21:00'),
        end: t('22:00'),
        laneId: 'A',
        place: '圖書室',
        scope: 'alibi',
        truth: { title: '甲潛入金庫', start: t('21:10'), end: t('21:30'), place: '祕密金庫' },
      },
      /* 乙：圖書室 21:15～21:45（公開） */
      {
        id: 'b1',
        title: '乙在圖書室找書',
        kind: 'range',
        start: t('21:15'),
        end: t('21:45'),
        laneId: 'B',
        place: '圖書室',
      },
      /* 乙：完全保密 21:50～22:20 在祕密金庫 */
      {
        id: 'b2',
        title: '乙的密會',
        kind: 'range',
        start: t('21:50'),
        end: t('22:20'),
        laneId: 'B',
        place: '祕密金庫',
        gm: true,
      },
      /* 丙：伏字 20:00～20:40（證詞在大廳），真相在祕密金庫 */
      {
        id: 'c1',
        title: '丙的伏字表面',
        kind: 'range',
        start: t('20:00'),
        end: t('20:40'),
        laneId: 'C',
        place: '丙的伏字地點',
        scope: 'redacted',
        truth: { title: '丙的伏字真相', start: '', end: '', place: '祕密金庫' },
      },
      /* 黑手（GM 專用的泳道）：21:20 在祕密金庫 */
      {
        id: 'g1',
        title: '黑手的行動',
        kind: 'range',
        start: t('21:20'),
        end: t('21:40'),
        laneId: 'G',
        place: '祕密金庫',
      },
      /* 大廳（地點的泳道）的鐘響 */
      { id: 'p1', title: '大廳的鐘響', start: t('21:20'), laneId: 'P' },
      { id: 'bg', title: '晚會', kind: 'background', start: t('19:00'), end: t('23:00') },
    ],
    markers: [{ id: 'm1', label: '保密標記', time: t('22:40'), color: '#8a63d2', gm: true }],
    links: [{ id: 'k1', from: 'a1', to: 'b1', kind: 'cause', note: '', gm: true }],
  });
  if (!doc) throw new Error('bad');
  return doc;
}

const SECRETS = [
  '甲潛入金庫',
  '祕密金庫',
  '乙的密會',
  '丙的伏字表面',
  '丙的伏字地點',
  '丙的伏字真相',
  '黑手泳道',
  '黑手的行動',
  '保密標記',
];

const MEAS = {
  item: (s: string) => estimateWidth(s, 12),
  small: (s: string) => estimateWidth(s, 11),
  major: (s: string) => estimateWidth(s, 11),
  lane: (s: string) => estimateWidth(s, 12),
  title: (s: string) => estimateWidth(s, 18),
};

const ex = (o: Record<string, unknown> = {}) =>
  ({
    range: 'all',
    from: '',
    to: '',
    width: 1600,
    title: true,
    legend: true,
    theme: 'light',
    audience: 'pl',
    format: 'png',
    scale: 1,
    ...o,
  }) as never;

const leaks = (text: string, words: readonly string[]) => words.filter((w) => text.includes(w));

describe('不在場證明空白（F131）', () => {
  it('人物的泳道上沒有紀錄的時段（30 分以上；退場之後不算；地點的泳道不算）', () => {
    const doc = caseDoc();
    const gm = visibleDoc(doc, 'gm');
    /* 範圍：最早到最晚（含背景）19:00～23:00 */
    expect(gapRange(gm)).toEqual({ a: v('19:00'), b: v('23:00') });
    expect(personLanes(gm).map((l) => l.id)).toEqual(['A', 'B', 'C', 'G']);
    const gaps = alibiGaps(gm);
    const of = (id: string) => gaps.filter((g) => g.laneId === id).map((g) => [g.a, g.b]);
    /* 甲：19:00～21:00、22:00～23:00（真相在證詞裡面，不另外算空白） */
    expect(of('A')).toEqual([
      [v('19:00'), v('21:00')],
      [v('22:00'), v('23:00')],
    ]);
    /* 乙（GM：完全保密的密會也算紀錄）：19:00～21:15、21:45～21:50 太短不算、22:20～23:00 */
    expect(of('B')).toEqual([
      [v('19:00'), v('21:15')],
      [v('22:20'), v('23:00')],
    ]);
    /* 丙：退場 22:30 之後不算 */
    expect(of('C')).toEqual([
      [v('19:00'), v('20:00')],
      [v('20:40'), v('22:30')],
    ]);
    expect(of('P')).toEqual([]);
  });

  it('PL 用只從看得到的紀錄算（完全保密、GM 專用的泳道不算）', () => {
    const doc = caseDoc();
    const pl = visibleDoc(doc, 'pl');
    const gaps = alibiGaps(pl);
    expect(gaps.some((g) => g.laneId === 'G')).toBe(false);
    /* 乙的密會看不到：21:45～23:00 是空白 */
    expect(gaps.filter((g) => g.laneId === 'B').map((g) => [g.a, g.b])).toEqual([
      [v('19:00'), v('21:15')],
      [v('21:45'), v('23:00')],
    ]);
  });

  it('時間點把空白切開；架空年不算；長度的寫法', () => {
    const doc = normalizeDoc({
      mode: 'day',
      lanes: [
        { id: 'A', name: '甲', kind: 'character', color: '#4f7cff', parentId: '', gm: false },
      ],
      events: [
        { id: 'e1', title: '開始', start: t('18:00'), laneId: 'A' },
        { id: 'e2', title: '中間', start: t('19:00'), laneId: 'A' },
        { id: 'e3', title: '結束', start: t('21:20'), laneId: 'A' },
      ],
    }) as TimelineDoc;
    const gaps = alibiGaps(visibleDoc(doc, 'gm'));
    expect(gaps.map((g) => [g.a, g.b])).toEqual([
      [v('18:00'), v('19:00')],
      [v('19:00'), v('21:20')],
    ]);
    expect(durationText('day', 140)).toBe('2 小時 20 分');
    expect(durationText('day', 45)).toBe('45 分');
    expect(durationText('date', 1500)).toBe('1 天 1 小時');
    const year = normalizeDoc({ ...doc, mode: 'year', events: [] }) as TimelineDoc;
    expect(alibiGaps(visibleDoc(year, 'gm'))).toEqual([]);
  });
});

describe('同席調書（F132）', () => {
  it('證詞扣掉真相的時段', () => {
    const r = (a: number, b: number, point = false) =>
      ({ a, b, point, owner: 'x' }) as Parameters<typeof outsideTruth>[0];
    expect(outsideTruth(r(0, 60), [r(10, 30)]).map((x) => [x.a, x.b])).toEqual([
      [0, 10],
      [30, 60],
    ]);
    expect(outsideTruth(r(0, 60), [r(0, 60)])).toEqual([]);
    expect(outsideTruth(r(20, 20, true), [r(10, 30)])).toEqual([]);
    expect(outsideTruth(r(0, 60), [r(70, 80)]).map((x) => [x.a, x.b])).toEqual([[0, 60]]);
  });

  it('重疊的判斷：期間、時間點、結束那一刻不算', () => {
    const r = (a: number, b: number, point = false) =>
      ({ a, b, point }) as Parameters<typeof overlapOf>[0];
    expect(overlapOf(r(0, 60), r(30, 90))).toEqual({ a: 30, b: 60 });
    expect(overlapOf(r(0, 60), r(60, 90))).toBeNull();
    expect(overlapOf(r(30, 30, true), r(0, 60))).toEqual({ a: 30, b: 30 });
    expect(overlapOf(r(60, 60, true), r(0, 60))).toBeNull();
    expect(overlapOf(r(5, 5, true), r(5, 5, true))).toEqual({ a: 5, b: 5 });
  });

  it('PL 用只比證詞；GM 用另外比真相，標出矛盾與只在真相裡的', () => {
    const doc = caseDoc();
    const pl = contactReport(visibleDoc(doc, 'pl'));
    expect(pl.truth).toEqual([]);
    expect(pl.testimony).toEqual([
      { lanes: ['A', 'B'], place: '圖書室', a: v('21:15'), b: v('21:45') },
    ]);
    const gm = contactReport(visibleDoc(doc, 'gm'));
    /* 證詞的同席被甲的真相（21:10～21:30 在祕密金庫）推翻 */
    expect(gm.testimony).toHaveLength(1);
    expect(gm.testimony[0].conflict).toMatchObject({ laneId: 'A', place: '祕密金庫' });
    /*
     * 真相的同席（證詞的其他時段照證詞）：甲 × 黑手（祕密金庫 21:20～21:30，證詞沒有）、
     * 甲 × 乙（甲的真相之後回到圖書室 21:30～21:45，證詞也有）
     */
    const truth = gm.truth.map((c) => [c.lanes.join('×'), c.place, c.a, c.b, !!c.hidden]);
    expect(truth).toEqual([
      ['A×G', '祕密金庫', v('21:20'), v('21:30'), true],
      ['A×B', '圖書室', v('21:30'), v('21:45'), false],
    ]);
  });

  it('同一對、同一個地點、接著的時段併成一筆；地點的寫法不分全形半形與大小寫', () => {
    const doc = normalizeDoc({
      mode: 'day',
      lanes: [
        { id: 'A', name: '甲', kind: 'character', color: '#4f7cff', parentId: '', gm: false },
        { id: 'B', name: '乙', kind: 'character', color: '#e0565b', parentId: '', gm: false },
      ],
      events: [
        {
          id: 'a1',
          title: '一',
          kind: 'range',
          start: t('20:00'),
          end: t('20:30'),
          laneId: 'A',
          place: 'Hall',
        },
        {
          id: 'a2',
          title: '二',
          kind: 'range',
          start: t('20:30'),
          end: t('21:00'),
          laneId: 'A',
          place: 'Ｈａｌｌ',
        },
        {
          id: 'b1',
          title: '三',
          kind: 'range',
          start: t('20:10'),
          end: t('20:50'),
          laneId: 'B',
          place: 'hall ',
        },
      ],
    }) as TimelineDoc;
    const rep = contactReport(visibleDoc(doc, 'pl'));
    expect(rep.testimony).toEqual([
      { lanes: ['A', 'B'], place: 'Hall', a: v('20:10'), b: v('20:50') },
    ]);
  });
});

describe('時間切片（F133）', () => {
  it('GM 用照真相放（寫出證詞的地點），PL 用只放證詞的地點', () => {
    const doc = caseDoc();
    const L = sliceLabels();
    const gm = timeSlice(visibleDoc(doc, 'gm'), v('21:25'), L);
    const room = (s: typeof gm, place: string) => s.rooms.find((r) => r.place === place);
    expect(room(gm, '祕密金庫')?.people.map((p) => [p.laneId, p.truth, p.claimed])).toEqual([
      ['A', true, '圖書室'],
      ['G', false, undefined],
    ]);
    expect(room(gm, '祕密金庫')?.together).toBe(true);
    expect(room(gm, '圖書室')?.people.map((p) => p.laneId)).toEqual(['B']);
    expect(room(gm, '大廳泳道')).toBeUndefined();
    const pl = timeSlice(visibleDoc(doc, 'pl'), v('21:25'), L);
    expect(pl.rooms.map((r) => r.place)).toEqual(['圖書室']);
    expect(room(pl, '圖書室')?.people.map((p) => p.laneId)).toEqual(['A', 'B']);
    expect(room(pl, '圖書室')?.together).toBe(true);
    expect(pl.unknown).toEqual(['人物丙']);
    expect(pl.backgrounds).toEqual(['晚會']);
  });

  it('伏字＝地點不明、「？？？」；退場之後列在退場；地點的泳道寫在那個地點', () => {
    const doc = caseDoc();
    const L = sliceLabels();
    const pl = timeSlice(visibleDoc(doc, 'pl'), v('20:10'), L);
    expect(pl.rooms).toEqual([
      {
        place: '',
        people: [{ laneId: 'C', name: '人物丙', title: '？？？', truth: false, masked: true }],
        events: [],
        together: false,
      },
    ]);
    const late = timeSlice(visibleDoc(doc, 'pl'), v('22:35'), L);
    expect(late.exited).toEqual([{ name: '人物丙', label: '死亡' }]);
    const bell = timeSlice(visibleDoc(doc, 'gm'), v('21:20'), L);
    expect(bell.rooms.find((r) => r.place === '大廳泳道')?.events).toEqual(['大廳的鐘響']);
  });

  it('切片的文字（卡片、所在不明、進行中）', () => {
    const doc = caseDoc();
    const rep = sliceReport(visibleDoc(doc, 'pl'), v('21:25'), sliceLabels());
    expect(rep.blocks[0]).toEqual({
      heading: '＠圖書室（同席）',
      together: true,
      lines: [{ text: '・人物甲：甲說在圖書室看書' }, { text: '・人物乙：乙在圖書室找書' }],
    });
    expect(rep.footer.map((l) => l.text)).toEqual(['所在不明：人物丙', '進行中：晚會']);
  });
});

describe('聚光（F134）', () => {
  it('選項只有這個檢視看得到的；指到沒有的值＝沒有聚光', () => {
    const doc = caseDoc();
    const labels = {
      none: '全部',
      truth: '真相',
      lane: (n: string) => `泳道：${n}`,
      place: (n: string) => `地點：${n}`,
      untitled: '（無標題）',
    };
    const pl = visibleDoc(doc, 'pl');
    const opts = spotOptions(pl, labels);
    expect(opts.map((o) => o.label).join('|')).not.toMatch(/祕密金庫|黑手|truth|真相/);
    expect(validSpot(pl, 'place:祕密金庫')).toBe('');
    expect(validSpot(pl, 'lane:G')).toBe('');
    expect(validSpot(pl, 'truth')).toBe('');
    expect(validSpot(pl, 'place:圖書室')).toBe('place:圖書室');
    const gm = visibleDoc(doc, 'gm');
    expect(spotOptions(gm, labels).some((o) => o.value === 'place:祕密金庫')).toBe(true);
    expect(validSpot(gm, 'truth')).toBe('truth');
  });

  it('泳道（含相關角色）、地點（含真相的地點）、真相；時間切片', () => {
    const doc = caseDoc();
    const gm = visibleDoc(doc, 'gm');
    expect([...(litIds(gm, 'lane:A', null) ?? [])].sort()).toEqual(['a1', 'a1::truth']);
    expect([...(spotLanes(gm, 'lane:A') ?? [])]).toEqual(['A']);
    expect([...(litIds(gm, 'place:祕密金庫', null) ?? [])].sort()).toEqual([
      'a1::truth',
      'b2',
      'c1::truth',
      'g1',
    ]);
    expect([...(litIds(gm, 'truth', null) ?? [])].sort()).toEqual([
      'a1',
      'a1::truth',
      'b2',
      'c1',
      'c1::truth',
    ]);
    /* 時間切片 21:25：那一刻正在進行的（背景也算） */
    expect([...(litIds(gm, '', v('21:25')) ?? [])].sort()).toEqual([
      'a1',
      'a1::truth',
      'b1',
      'bg',
      'g1',
    ]);
    expect(litIds(gm, '', null)).toBeNull();
    const withPeople = normalizeDoc({
      ...doc,
      events: [
        ...doc.events,
        { id: 'x', title: '提到甲', start: t('21:00'), laneId: 'B', people: ['人物甲'] },
      ],
    }) as TimelineDoc;
    const m = spotMatcher(visibleDoc(withPeople, 'gm'), 'lane:A');
    expect(m?.(visibleDoc(withPeople, 'gm').events.find((e) => e.id === 'x') as never)).toBe(true);
  });
});

describe('段階公開（F135）', () => {
  it('可以公開的東西；公開後 PL 看得到；全部回到初始只清掉進行中的', () => {
    const doc = mysteryDoc();
    const list = lockables(doc, '（無標題）');
    expect(list.map((x) => [x.kind, x.id, x.face, x.revealed])).toEqual([
      ['event', 'mx-xu-break', 'redacted', false],
      ['link', 'mx-k3', 'link', false],
      ['event', 'mx-jiang-room', 'alibi', false],
      ['event', 'mx-wei-stand', 'alibi', true],
      ['link', 'mx-k1', 'link', false],
      ['link', 'mx-k2', 'link', true],
      ['event', 'mx-lin-log', 'secret', false],
    ]);
    expect(setUnlocked(doc, 'event', 'mx-jiang-room', true)).toBe(true);
    expect(setUnlocked(doc, 'event', 'mx-jiang-room', true)).toBe(false);
    setUnlocked(doc, 'event', 'mx-lin-log', true);
    setUnlocked(doc, 'link', 'mx-k1', true);
    expect(unlockCount(doc)).toBe(3);
    const pl = visibleDoc(doc, 'pl');
    expect(pl.truths?.map((x) => x.id)).toContain('mx-jiang-room::truth');
    expect(pl.events.find((e) => e.id === 'mx-lin-log')?.opened).toBe(true);
    expect(pl.links.map((k) => k.id)).toContain('mx-k1');
    /* PL 版：知道真相的（公開了的）才留著公開範圍的欄位，其他的拿掉（和 revealed 一樣） */
    expect(pl.events.filter((e) => e.unlocked).map((e) => e.id)).toEqual(['mx-jiang-room']);
    expect(clearUnlocks(doc)).toBe(3);
    expect(unlockCount(doc)).toBe(0);
    /* 準備時的調查後公開不動 */
    expect(doc.events.find((e) => e.id === 'mx-wei-stand')?.revealed).toBe(true);
    expect(visibleDoc(doc, 'pl').truths?.map((x) => x.id)).toEqual(['mx-wei-stand::truth']);
  });

  it('專案檔：unlocked 照讀、沒用時沒有這個欄位；GM 專用泳道上的事件不列', () => {
    const doc = mysteryDoc();
    setUnlocked(doc, 'event', 'mx-xu-break', true);
    setUnlocked(doc, 'marker', 'mx-police', true);
    const back = normalizeDoc(JSON.parse(JSON.stringify(doc))) as TimelineDoc;
    expect(back.events.find((e) => e.id === 'mx-xu-break')?.unlocked).toBe(true);
    expect(back.markers[0].unlocked).toBe(true);
    expect(JSON.stringify(normalizeDoc(mysteryDoc()))).not.toContain('unlocked');
    const caseD = caseDoc();
    expect(lockables(caseD, '（無標題）').some((x) => x.id === 'g1')).toBe(false);
  });
});

describe('A4 自動分頁（F141）', () => {
  it('一頁放得下時一頁；切在格線上、盡量不切過期間；剩下不到 1.28 頁時併進最後一頁', () => {
    const range = { a: 0, b: 1000 };
    expect(planPages({ range, k: 1, laneW: 140, height: 400, bars: [], cuts: [] })).toEqual([
      range,
    ]);
    const track = idealTrackWidth(140, 400);
    expect(track).toBe(960 - 140);
    const wide = { a: 0, b: 4000 };
    const cuts = Array.from({ length: 81 }, (_, i) => i * 50);
    const pages = planPages({ range: wide, k: 1, laneW: 140, height: 400, bars: [], cuts });
    expect(pages[0].a).toBe(0);
    expect(pages[pages.length - 1].b).toBe(4000);
    for (let i = 1; i < pages.length; i++) expect(pages[i].a).toBe(pages[i - 1].b);
    for (const p of pages.slice(0, -1)) expect(cuts).toContain(p.b);
    const last = pages[pages.length - 1];
    expect(last.b - last.a).toBeLessThanOrEqual(track * ABSORB + 1e-6);
    /* 理想的切點（820）切過一個期間時，改切在旁邊沒有期間的格線 */
    const avoid = planPages({
      range: wide,
      k: 1,
      laneW: 140,
      height: 400,
      bars: [{ a: 790, b: 860 }],
      cuts,
    });
    expect(avoid[0].b === 750 || avoid[0].b >= 860).toBe(true);
    expect(pageLabel(1, 3)).toBe('第 01／03 頁');
  });

  it('分頁的圖：同樣的比例尺、頁碼、調書只在最後一頁；檔名加頁數', () => {
    const doc = mysteryDoc();
    const r = planPicturePages(
      doc,
      ex({ width: 6000, paging: 'a4', panel: 'report', audience: 'gm' }),
      null,
      {},
      null,
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.pages.length).toBeGreaterThan(2);
    const svgs = r.pages.map((p) => pictureToSvg(p.pic));
    expect(svgs[0]).toContain(`第 01／${String(r.pages.length).padStart(2, '0')} 頁`);
    expect(svgs[0]).not.toContain('不在場證明・接觸調書');
    expect(svgs[svgs.length - 1]).toContain('不在場證明・接觸調書');
    const off = planPicturePages(
      doc,
      ex({ width: 6000, paging: 'a4', pageNum: false }),
      null,
      {},
      null,
    );
    if (!off.ok) throw new Error(off.error);
    expect(pictureToSvg(off.pages[0].pic)).not.toContain('頁');
    expect(imageFileName(doc, 'pl', 'png', '', 2)).toBe('紅幕劇場的首演之夜_時間軸_p02.png');
  });
});

describe('圖面的樣式（F136～F140）', () => {
  const base = () => planPicture(mysteryDoc(), ex(), null, {}, null);

  it('沒用新設定時 pictureStyle 是 undefined（畫法和改版前相同）', () => {
    const doc = mysteryDoc();
    const vd = visibleDoc(doc, 'pl');
    expect(pictureStyle(doc, vd, ex())).toBeUndefined();
    expect(
      pictureStyle(doc, vd, ex({ paper: 'none', grid: true, titleFont: 'sans', panel: 'none' })),
    ).toBeUndefined();
    const a = base();
    const b = planPicture(doc, ex({ paper: 'none', grid: true }), null, {}, null);
    if (!a.ok || !b.ok) throw new Error('bad');
    expect(pictureToSvg(b.pic)).toBe(pictureToSvg(a.pic));
  });

  it('紙的樣式：紙的顏色、紙翻角與落影（外側透明）、污漬與摺痕', () => {
    const doc = mysteryDoc();
    const a = base();
    const r = planPicture(doc, ex({ paper: 'parchment', age: 60, seed: 7 }), null, {}, null);
    if (!a.ok || !r.ok) throw new Error('bad');
    expect(r.pic.width).toBe(a.pic.width + OUTER_MARGIN * 2);
    expect(r.pic.height).toBe(a.pic.height + OUTER_MARGIN * 2 + CURL_PAD);
    expect(r.pic.background).toBe('transparent');
    const svg = pictureToSvg(r.pic);
    expect(svg).toContain('#ecdcb6');
    expect(svg).toContain('feDropShadow');
    expect(svg).toContain('radialGradient');
    /* 同樣的種子同樣的污漬；換種子不同 */
    const again = planPicture(doc, ex({ paper: 'parchment', age: 60, seed: 7 }), null, {}, null);
    const other = planPicture(doc, ex({ paper: 'parchment', age: 60, seed: 8 }), null, {}, null);
    if (!again.ok || !other.ok) throw new Error('bad');
    expect(pictureToSvg(again.pic)).toBe(svg);
    expect(pictureToSvg(other.pic)).not.toBe(svg);
    /* 不透明：外側填底色 */
    const solid = planPicture(doc, ex({ paper: 'noir', transparent: false }), null, {}, null);
    if (!solid.ok) throw new Error('bad');
    expect(solid.pic.background).toBe('#17191d');
    /* 沒有翻角：不加外側的留白 */
    const flat = planPicture(doc, ex({ paper: 'draft', curl: false, age: 0 }), null, {}, null);
    if (!flat.ok) throw new Error('bad');
    expect(flat.pic.width).toBe(a.pic.width);
    expect(pictureToSvg(flat.pic)).not.toContain('feDropShadow');
  });

  it('污漬與摺痕的配置和 floor-plan 共用（同一個種子同樣的配置）', () => {
    const plan = wearPlan(4242);
    expect(plan.stains.length).toBeGreaterThanOrEqual(3);
    expect(plan.folds[0].o).toBe('h');
    const shapes = wearShapes({ x: 0, y: 0, w: 1000, h: 600 }, 4242, 0.5, false);
    const drops = plan.stains.reduce((n, s) => n + s.drops.length, 0);
    expect(shapes.length).toBe(plan.stains.length + drops + plan.folds.length * 2);
    expect(wearShapes({ x: 0, y: 0, w: 1000, h: 600 }, 4242, 0, false)).toEqual([]);
  });

  it('標題的字體、圖框、時間格線、記號的說明', () => {
    const doc = mysteryDoc();
    const serif = planPicture(doc, ex({ titleFont: 'serif' }), null, {}, null);
    if (!serif.ok) throw new Error('bad');
    expect(pictureToSvg(serif.pic)).toContain(`font-family="'Noto Serif TC'`);
    const framed = planPicture(doc, ex({ frame: true }), null, {}, null);
    const a = base();
    if (!framed.ok || !a.ok) throw new Error('bad');
    expect(framed.pic.width).toBe(a.pic.width + 32);
    const noGrid = planPicture(doc, ex({ grid: false }), null, {}, null);
    if (!noGrid.ok) throw new Error('bad');
    /* 時間格線關掉：直的格線只畫在刻度那兩排（不到泳道的底） */
    const bottom = String(a.pic.height - 48);
    const tall = (svg: string) =>
      (svg.match(new RegExp(`<line [^>]*y1="76"[^>]*y2="${bottom}"`, 'g')) ?? []).length;
    expect(tall(pictureToSvg(a.pic))).toBeGreaterThan(5);
    expect(tall(pictureToSvg(noGrid.pic))).toBe(0);
    const marks = planPicture(doc, ex({ marks: true, audience: 'gm' }), null, {}, null);
    if (!marks.ok) throw new Error('bad');
    const svg = pictureToSvg(marks.pic);
    expect(svg).toContain('證詞（真相另外寫）');
    expect(svg).toContain('退場之後');
    expect(svg).toContain('GM 專用');
  });

  it('不在場證明空白、調書、時間切片的面板、聚光的淡化', () => {
    const doc = caseDoc();
    const r = planPicture(
      doc,
      ex({ audience: 'gm', gaps: true, panel: 'report', focus: true }),
      null,
      {},
      null,
      null,
      '',
      { spot: 'lane:A', sliceTime: null },
    );
    if (!r.ok) throw new Error('bad');
    const svg = pictureToSvg(r.pic);
    expect(svg).toContain('空白 2 小時');
    expect(svg).toContain('不在場證明・接觸調書（GM 用：證詞與真相）');
    expect(svg).toContain('矛盾');
    expect(svg).toContain('opacity="0.25"');
    const slice = planPicture(
      doc,
      ex({ audience: 'pl', panel: 'slice', focus: true }),
      null,
      {},
      null,
      null,
      '',
      { spot: '', sliceTime: t('21:25') },
    );
    if (!slice.ok) throw new Error('bad');
    const s2 = pictureToSvg(slice.pic);
    expect(s2).toContain('時間切片：第 1 天 21:25');
    expect(s2).toContain('切片 第 1 天 21:25');
    expect(s2).toContain('＠圖書室（同席）');
  });

  it('canvas 的畫法：群組的位移與淡化、填色的路徑（漸層、落影）', () => {
    const r = planPicture(
      mysteryDoc(),
      ex({ paper: 'slate', age: 40, frame: true }),
      null,
      {},
      null,
    );
    if (!r.ok) throw new Error('bad');
    const calls: string[] = [];
    const grad = { addColorStop: () => undefined };
    const ctx = new Proxy({ globalAlpha: 1 } as Record<string, unknown>, {
      get(target, prop) {
        if (prop === 'getTransform') return () => ({ a: 2, b: 0 });
        if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => grad;
        if (prop in target) return target[prop as string];
        return (...args: unknown[]) => calls.push(`${String(prop)}:${args.length}`);
      },
      set(target, prop, value) {
        if (prop === 'shadowBlur') calls.push(`shadowBlur=${value}`);
        target[prop as string] = value;
        return true;
      },
    });
    (globalThis as { Path2D?: unknown }).Path2D = class {};
    drawPicture(ctx as unknown as CanvasRenderingContext2D, r.pic);
    expect(calls).toContain('translate:2');
    /* 落影的模糊照倍率換算（9 × 2） */
    expect(calls).toContain('shadowBlur=18');
  });
});

describe('不洩漏（第五批的每一種輸出）', () => {
  /** PL 用、人物別的所有新輸出（調書文字、切片文字〔每 10 分〕、聚光的選項、匯出圖：空白、調書、切片、記號、聚光） */
  function plOutputs(doc: TimelineDoc, pov = ''): string[] {
    const vd = visibleDoc(doc, 'pl', pov);
    const outs: string[] = [];
    outs.push(reportText('調書', alibiReport(vd, reportLabels())));
    outs.push(JSON.stringify(alibiGaps(vd)));
    outs.push(JSON.stringify(contactReport(vd)));
    for (let m = v('19:00'); m <= v('23:00'); m += 10) {
      const rep = sliceReport(vd, m, sliceLabels());
      outs.push(reportText('切片', rep.blocks, rep.footer));
    }
    outs.push(
      JSON.stringify(
        spotOptions(vd, {
          none: '',
          truth: '真相',
          lane: (n) => n,
          place: (n) => n,
          untitled: '',
        }),
      ),
    );
    for (const spot of ['', 'truth', 'lane:A', 'place:祕密金庫', 'place:圖書室'])
      for (const panel of ['report', 'slice'] as const) {
        const r = planPicture(
          doc,
          ex({
            audience: 'pl',
            pov,
            gaps: true,
            marks: true,
            panel,
            focus: true,
            paper: 'parchment',
            age: 50,
          }),
          null,
          {},
          null,
          null,
          pov,
          { spot, sliceTime: t('21:25') },
        );
        if (!r.ok) throw new Error(r.error);
        outs.push(pictureToSvg(r.pic));
        const pg = planPicturePages(
          doc,
          ex({ audience: 'pl', pov, width: 5000, paging: 'a4', panel, gaps: true }),
          null,
          {},
          null,
          null,
          pov,
          { spot, sliceTime: t('21:25') },
        );
        if (!pg.ok) throw new Error(pg.error);
        for (const p of pg.pages) outs.push(pictureToSvg(p.pic));
      }
    outs.push(JSON.stringify(panelSpec(doc, vd, 'report', null)));
    return outs;
  }

  it('全體公開：0 筆', () => {
    const outs = plOutputs(caseDoc()).join('\n');
    expect(leaks(outs, SECRETS)).toEqual([]);
  });

  it('人物別：本人看得到自己的真相，看不到別人的', () => {
    const outA = plOutputs(caseDoc(), 'A').join('\n');
    expect(outA).toContain('甲潛入金庫');
    expect(
      leaks(
        outA,
        SECRETS.filter((w) => w !== '甲潛入金庫' && w !== '祕密金庫'),
      ),
    ).toEqual([]);
    const outC = plOutputs(caseDoc(), 'C').join('\n');
    expect(outC).toContain('丙的伏字真相');
    expect(leaks(outC, ['甲潛入金庫', '乙的密會', '黑手的行動', '保密標記'])).toEqual([]);
  });

  it('改藏起來的東西（真相的時間與地點、完全保密的時間、GM 專用泳道上的事件、GM 標記）時，PL 的分析與輸出不變', () => {
    const doc = caseDoc();
    const moved = caseDoc();
    const a1 = moved.events.find((e) => e.id === 'a1');
    if (a1?.truth) {
      a1.truth.start = t('19:05');
      a1.truth.end = t('22:55');
      a1.truth.place = '圖書室';
    }
    const b2 = moved.events.find((e) => e.id === 'b2');
    if (b2) {
      b2.start = t('19:00');
      b2.end = t('23:00');
      b2.place = '圖書室';
    }
    const g1 = moved.events.find((e) => e.id === 'g1');
    if (g1) {
      g1.start = t('18:00');
      g1.end = t('23:59');
      g1.place = '圖書室';
    }
    const c1 = moved.events.find((e) => e.id === 'c1');
    if (c1) c1.place = '圖書室';
    moved.markers[0].time = t('18:00');
    expect(plOutputs(moved)).toEqual(plOutputs(doc));
  });

  it('PL 檢視的段階公開：公開之前和沒有那個事件時一樣；公開之後才出現', () => {
    const doc = caseDoc();
    const before = plOutputs(doc).join('\n');
    expect(before).not.toContain('乙的密會');
    setUnlocked(doc, 'event', 'b2', true);
    const after = plOutputs(doc).join('\n');
    expect(after).toContain('乙的密會');
    clearUnlocks(doc);
    expect(plOutputs(doc).join('\n')).toBe(before);
  });
});

describe('其他', () => {
  it('第一批的範例：GM 用的時間切片照真相放（服裝師在天橋），PL 用在服裝間', () => {
    const doc = mysteryDoc();
    const at = readTime('day', t('21:40'), doc)?.v ?? 0;
    const gm = timeSlice(visibleDoc(doc, 'gm'), at, sliceLabels());
    expect(gm.rooms.find((r) => r.people.some((p) => p.laneId === 'mx-jiang'))?.place).toBe(
      '舞台上方的天橋',
    );
    const pl = timeSlice(visibleDoc(doc, 'pl'), at, sliceLabels());
    expect(pl.rooms.find((r) => r.people.some((p) => p.laneId === 'mx-jiang'))?.place).toBe(
      '服裝間',
    );
  });

  it('buildPicture 不給 style 與給空的 style 一樣', () => {
    const doc = mysteryDoc();
    const vd = visibleDoc(doc, 'pl');
    const input = {
      vdoc: vd,
      range: { a: v('19:00'), b: v('23:00') },
      width: 1200,
      title: true,
      legend: true,
      theme: 'light' as const,
      collapsed: {},
      measures: MEAS,
      strings: {
        untitled: '（無標題）',
        main: '主線',
        fallbackTitle: '劇本時間表',
        gmUse: 'GM 用',
        progress: '目前進度',
        now: '現在',
        rangeText: '範圍',
      },
      nowV: null,
    };
    const a: Picture = buildPicture(input);
    const b: Picture = buildPicture({ ...input, style: {} });
    expect(pictureToSvg(b)).toBe(pictureToSvg(a));
    const kinds = (list: Prim[]): string[] =>
      list.flatMap((p) =>
        p.t === 'clip' || p.t === 'group' ? [p.t, ...kinds(p.children)] : [p.t],
      );
    expect(kinds(a.prims)).not.toContain('group');
  });
});

describe('第五批驗證後的修正（2026-11-12）', () => {
  /** 圖裡所有的字（群組、剪裁裡的也算） */
  const texts = (list: Prim[]): Extract<Prim, { t: 'text' }>[] =>
    list.flatMap((p) =>
      p.t === 'text' ? [p] : p.t === 'clip' || p.t === 'group' ? texts(p.children) : [],
    );
  const hm = (x: number) =>
    `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;

  it('範例的同席：證詞的同席被真相推翻（矛盾）、只在真相裡的（證詞沒有）；PL 用只比證詞', () => {
    const doc = mysteryDoc();
    const gm = contactReport(visibleDoc(doc, 'gm'));
    expect(gm.testimony).toEqual([
      {
        lanes: ['mx-xu', 'mx-wei'],
        place: '下舞台',
        a: v('21:35'),
        b: v('21:35'),
        conflict: {
          laneId: 'mx-wei',
          place: '後門',
          a: v('21:30'),
          b: v('21:40'),
          title: '溜到後門抽菸，回來時看到維修通道的門半開著',
        },
      },
    ]);
    expect(gm.truth).toEqual([
      { lanes: ['mx-he', 'mx-xu'], place: '二樓包廂', a: v('20:42'), b: v('20:55'), hidden: true },
    ]);
    for (const pov of ['', 'mx-xu', 'mx-wei', 'mx-jiang']) {
      const vd = visibleDoc(doc, 'pl', pov);
      expect(contactReport(vd)).toEqual({
        audience: 'pl',
        testimony: [{ lanes: ['mx-xu', 'mx-wei'], place: '下舞台', a: v('21:35'), b: v('21:35') }],
        truth: [],
      });
      expect(JSON.stringify(vd)).not.toContain('一直看到自己在下舞台');
    }
  });

  it('矛盾只看真相與完全保密的：同一個人另一筆證詞在別的地點不算', () => {
    const lanes = [
      { id: 'A', name: '甲', kind: 'character', color: '#4f7cff', parentId: '', gm: false },
      { id: 'B', name: '乙', kind: 'character', color: '#e0565b', parentId: '', gm: false },
    ];
    const events = [
      {
        id: 'a1',
        title: '甲在舞台',
        kind: 'range',
        start: t('21:00'),
        end: t('22:00'),
        laneId: 'A',
        place: '舞台',
      },
      { id: 'a2', title: '甲下場', start: t('21:30'), laneId: 'A', place: '下舞台' },
      {
        id: 'b1',
        title: '乙待命',
        kind: 'range',
        start: t('21:00'),
        end: t('22:00'),
        laneId: 'B',
        place: '下舞台',
      },
    ];
    const plain = normalizeDoc({ mode: 'day', lanes, events }) as TimelineDoc;
    const c = contactReport(visibleDoc(plain, 'gm')).testimony;
    expect(c).toEqual([{ lanes: ['A', 'B'], place: '下舞台', a: v('21:30'), b: v('21:30') }]);
    /* 乙完全保密的密會（21:25～21:35 在後門）推翻 */
    const secret = normalizeDoc({
      mode: 'day',
      lanes,
      events: [
        ...events,
        {
          id: 'b2',
          title: '乙的密會',
          kind: 'range',
          start: t('21:25'),
          end: t('21:35'),
          laneId: 'B',
          place: '後門',
          gm: true,
        },
      ],
    }) as TimelineDoc;
    expect(contactReport(visibleDoc(secret, 'gm')).testimony[0].conflict).toMatchObject({
      laneId: 'B',
      place: '後門',
    });
  });

  it('A4 分頁：剛好在切點上的時間點（含圓點與標題）不會被切開', () => {
    const make = (extra: string | null) =>
      normalizeDoc({
        mode: 'day',
        lanes: [
          { id: 'A', name: '甲', kind: 'character', color: '#4f7cff', parentId: '', gm: false },
        ],
        events: [
          { id: 's', title: '開始', start: t('18:00'), laneId: 'A' },
          { id: 'e', title: '結束', start: t('23:00'), laneId: 'A' },
          ...(extra
            ? [{ id: 'x', title: '剛好在切點上的時間點', start: t(extra), laneId: 'A' }]
            : []),
        ],
      }) as TimelineDoc;
    const opts = ex({ width: 6000, paging: 'a4' });
    const before = planPicturePages(make(null), opts, null, {}, null);
    if (!before.ok) throw new Error(before.error);
    expect(before.pages.length).toBeGreaterThan(2);
    const cut = before.pages[1].range.b;
    const after = planPicturePages(make(hm(cut)), opts, null, {}, null);
    if (!after.ok) throw new Error(after.error);
    expect(after.pages[1].range.b).not.toBe(cut);
    const on = after.pages.filter((p) => pictureToSvg(p.pic).includes('剛好在切點上的時間點'));
    expect(on).toHaveLength(1);
  });

  it('A4 分頁：剩下不到兩頁時對半切（最後一頁不會只剩一小段）', () => {
    const track = idealTrackWidth(140, 400);
    for (const len of [1.35, 1.6, 1.95]) {
      const range = { a: 0, b: Math.round(track * len) };
      const cuts = Array.from({ length: 200 }, (_, i) => i * 10);
      const pages = planPages({ range, k: 1, laneW: 140, height: 400, bars: [], cuts });
      expect(pages).toHaveLength(2);
      for (const p of pages) expect(p.b - p.a).toBeGreaterThanOrEqual(range.b * 0.4 - 10);
    }
  });

  it('A4 分頁：每一頁都是橫的；調書放不進最後一頁時另外成一頁（頁數算在裡面）', () => {
    const doc = mysteryDoc();
    let separate = 0;
    for (const audience of ['gm', 'pl'])
      for (const width of [1600, 2400, 3000, 3600, 6000, 9000]) {
        const r = planPicturePages(
          doc,
          ex({ width, paging: 'a4', panel: 'report', audience }),
          null,
          {},
          null,
        );
        if (!r.ok) throw new Error(r.error);
        const n = r.pages.length;
        const svgs = r.pages.map((p) => pictureToSvg(p.pic));
        r.pages.forEach((p, i) => {
          expect(p.pic.height, `${audience} ${width} 第 ${i + 1} 頁`).toBeLessThanOrEqual(
            (p.pic.width / A4_RATIO) * PANEL_FIT,
          );
          expect(svgs[i]).toContain(pageLabel(i + 1, n));
        });
        const withPanel = svgs.filter((s) => s.includes('不在場證明・接觸調書'));
        expect(withPanel.length).toBeGreaterThanOrEqual(1);
        /* 只有調書的頁沒有泳道 */
        if (!withPanel[0].includes('舞台監督 林佩芸')) separate++;
        expect(svgs.indexOf(withPanel[0])).toBe(n - withPanel.length);
      }
    expect(separate).toBeGreaterThan(0);
  });

  it('調書太高時切成好幾段：每段不超過上限、塊的順序不變、後面的段標題加「（續）」', () => {
    const spec: PanelSpec = {
      title: '時間切片：第 1 天 21:00',
      layout: 'cards',
      blocks: Array.from({ length: 12 }, (_, i) => ({
        heading: `＠地點 ${i + 1}`,
        lines: Array.from({ length: 4 }, (_, j) => ({ text: `・人物 ${j + 1}：做某件事` })),
      })),
      footer: [{ text: '所在不明：人物丙' }],
    };
    expect(splitPanel(spec, 900, MEAS.small, 10000, '（續）')).toEqual([spec]);
    const parts = splitPanel(spec, 900, MEAS.small, 260, '（續）');
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0].title).toBe(spec.title);
    for (const p of parts.slice(1)) expect(p.title).toBe(`${spec.title}（續）`);
    expect(parts.flatMap((p) => p.blocks)).toEqual(spec.blocks);
    expect(parts.slice(0, -1).every((p) => !p.footer?.length)).toBe(true);
    expect(parts[parts.length - 1].footer).toEqual(spec.footer);
  });

  it('時間切片的標籤是標記列的旗子（不在泳道裡）；空白的字不壓在貫穿的線上', () => {
    const doc = caseDoc();
    const vd = visibleDoc(doc, 'gm');
    const flags = collectFlags(vd, { progress: '目前進度', now: '現在' }, null, {
      v: v('21:25'),
      label: '切片 21:25',
      color: '#000',
    });
    expect(flags.find((f) => f.kind === 'slice')).toMatchObject({
      v: v('21:25'),
      label: '切片 21:25',
    });
    const r = planPicture(
      doc,
      ex({ audience: 'gm', panel: 'slice', focus: true }),
      null,
      {},
      null,
      null,
      '',
      { spot: '', sliceTime: t('21:25') },
    );
    if (!r.ok) throw new Error('bad');
    const all = texts(r.pic.prims);
    const label = all.find((x) => x.text === '切片 第 1 天 21:25');
    const lane = all.find((x) => x.text === '人物甲');
    if (!label || !lane) throw new Error('no text');
    expect(label.y).toBeLessThan(lane.y - 10);
    /* 甲的空白（19:00～21:00）中間有標記時不寫字（框照畫） */
    const gapText = (d: TimelineDoc) => {
      const p = planPicture(d, ex({ audience: 'gm', gaps: true }), null, {}, null);
      if (!p.ok) throw new Error('bad');
      return texts(p.pic.prims).some((x) => x.text === '空白 2 小時');
    };
    expect(gapText(doc)).toBe(true);
    const marked = caseDoc();
    marked.markers.push({ id: 'm2', label: '鐘', time: t('20:00'), color: '#8a63d2', gm: false });
    expect(gapText(marked)).toBe(false);
  });
});
