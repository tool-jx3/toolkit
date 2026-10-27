/**
 * 團期行事曆的匯出入：
 * - JSON：本工具的往返；卓準備カレンダー、taku_calendar、跑團紀錄簿、交接資料的格式讀得進來；合併時識別碼不重複。
 * - iCal：本工具的往返（整天、多日、有時間、過午夜）；Google 日曆匯出的 .ics（UTC、整天的範圍、行事曆名稱、
 *   重複、取消、折行、跳脫、TZID、DURATION）；讀成場次／預定。
 * - 送到跑團紀錄簿、團報產生器的交接資料，以及紀錄簿那邊把它整理成一團（@/core/sessions）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearPendingLogImport,
  createReportImportItem,
  hoursBetween,
  LOG_PENDING_IMPORT_KEY,
  logRowFromImportItem,
  logStatusOf,
  PC_PLACEHOLDER,
  pairedPeople,
  readPendingLogImport,
  writePendingLogImport,
} from '@/core/sessions';
import {
  logImportItem,
  logPayload,
  reportFormat,
  reportPayload,
} from '@/tools/session-calendar/bridge';
import {
  convertKinds,
  escapeText,
  exportIcal,
  foldLine,
  parseDuration,
  parseIcal,
  parseIcalLines,
  unescapeText,
} from '@/tools/session-calendar/ical';
import {
  exportJsonText,
  ImportFormatError,
  mergeCpColors,
  mergeEntries,
  parseImportJson,
} from '@/tools/session-calendar/json';
import { type Entry, initialData, newEntry } from '@/tools/session-calendar/model';

const TODAY = '2026-10-27';

describe('JSON', () => {
  it('本工具：匯出再讀入，內容相同（範例標記拿掉）', () => {
    const data = initialData(TODAY);
    data.cpColors = [{ id: 'cp1', name: '阿樹×小鹿', c1: '#ff0000', c2: '#0000ff' }];
    const text = exportJsonText(data, new Date('2026-10-27T00:00:00Z'));
    const parsed = JSON.parse(text);
    expect(parsed).toMatchObject({ format: 'trpg-toolkit/session-calendar', version: 1 });
    expect(parsed.entries[0].sample).toBeUndefined();
    const batch = parseImportJson(text);
    expect(batch.format).toBe('self');
    expect(batch.entries).toEqual(
      data.entries.map((e) => {
        const c = { ...e };
        delete c.sample;
        return c;
      }),
    );
    expect(batch.cpColors).toEqual(data.cpColors);
    expect(batch.title).toBe('團期行事曆');
  });

  it('卓準備カレンダー的 JSON', () => {
    const kuma = {
      version: '0.13',
      exportedAt: '2026-10-24T00:00:00.000Z',
      sessions: [
        {
          id: 'session_1',
          source: 'manual',
          sourceCalendar: 'TRPG予定',
          scenario: '測試劇本',
          system: 'クトゥルフ神話TRPG',
          start: '2026-07-02T20:00',
          end: '23:00',
          gm: '某甲',
          format: 'オンライン',
          status: 'tentative',
          memo: '備註\n第二行',
          hashtags: ['TRPG', 'CoC'],
          players: [{ pl: 'P1', pc: 'C1' }],
          links: [{ label: 'CCFOLIA', url: 'https://example.com/' }],
          tasks: [
            {
              id: 't1',
              title: '準備',
              due: '2026-07-01',
              status: '期限切れ',
              done: false,
              order: 10,
            },
            { id: 't2', title: '已做', due: '2026-06-30', status: '完了', done: false, order: 20 },
          ],
        },
        { id: 'x', scenario: '壞的', start: 'nope' },
      ],
    };
    const b = parseImportJson(JSON.stringify(kuma));
    expect(b.format).toBe('kuma');
    expect(b.entries).toHaveLength(1);
    expect(b.entries[0]).toMatchObject({
      kind: 'session',
      title: '測試劇本',
      start: '2026-07-02',
      end: '2026-07-02',
      startTime: '20:00',
      endTime: '23:00',
      gm: '某甲',
      status: 'tentative',
      tags: ['TRPG', 'CoC'],
      calendar: 'TRPG予定',
      memo: '備註\n第二行',
    });
    expect(b.entries[0].tasks.map((t) => [t.title, t.done])).toEqual([
      ['準備', false],
      ['已做', true],
    ]);
    /* 陣列直接是場次也可以 */
    expect(parseImportJson(JSON.stringify(kuma.sessions)).format).toBe('kuma');
  });

  it('taku_calendar 的 JSON（標題當行事曆名稱、CP 色）', () => {
    const taku = {
      title: '我的團曆',
      events: [
        {
          id: 'e1',
          title: '旅行',
          memo: '',
          start: '2026-08-10',
          end: '2026-08-12',
          colorMode: 'gradient',
          color1: '#f08aa8',
          color2: '#d9547e',
        },
        {
          id: 'e2',
          title: '',
          memo: 'm',
          start: '2026-08-20',
          end: '2026-08-19',
          colorMode: 'solid',
          color1: '#123456',
        },
      ],
      cpColors: [{ id: 'c', name: 'A×B', c1: '#111111', c2: '#222222' }],
      exportedAt: '2026-10-20T00:00:00Z',
    };
    const b = parseImportJson(JSON.stringify(taku));
    expect(b.format).toBe('taku');
    expect(b.title).toBe('我的團曆');
    expect(b.entries[0]).toMatchObject({
      kind: 'plan',
      title: '旅行',
      start: '2026-08-10',
      end: '2026-08-12',
      calendar: '我的團曆',
      color: { mode: 'gradient', c1: '#f08aa8', c2: '#d9547e' },
    });
    expect(b.entries[1]).toMatchObject({
      start: '2026-08-19',
      end: '2026-08-20',
      color: { mode: 'solid', c1: '#123456' },
    });
    expect(b.cpColors).toEqual([{ id: 'c', name: 'A×B', c1: '#111111', c2: '#222222' }]);
    expect(parseImportJson(JSON.stringify(taku.events)).format).toBe('taku');
  });

  it('跑團紀錄簿的 JSON：每個日期一個場次，範例列略過', () => {
    const log = {
      rows: [
        {
          id: 'r1',
          date: '2026-05-01',
          dates: ['2026-05-01', '2026-05-08'],
          scenario: '長篇劇本',
          system: 'エモクロア',
          gm: 'GM甲',
          players: 'A、B',
          pc: 'a、b',
          status: '継続',
          note: 'n',
          hashtag: '#TRPG #長團',
          sessionUrl: 'https://example.com/log',
        },
        { id: 'r2', sample: true, date: '2026-05-02', dates: ['2026-05-02'], scenario: '範例' },
      ],
      columns: [],
    };
    const b = parseImportJson(JSON.stringify(log));
    expect(b.format).toBe('log');
    expect(b.entries.map((e) => e.start)).toEqual(['2026-05-01', '2026-05-08']);
    expect(b.entries[0]).toMatchObject({
      title: '長篇劇本',
      system: 'Emoklore',
      status: 'completed',
      calendar: '跑團紀錄簿',
      players: [
        { pl: 'A', pc: 'a' },
        { pl: 'B', pc: 'b' },
      ],
      tags: ['TRPG', '長團'],
      links: [{ label: '跑團紀錄', url: 'https://example.com/log' }],
    });
  });

  it('交接資料（items）', () => {
    const b = parseImportJson(
      JSON.stringify({
        source: 'session-log-tracker',
        version: '1.0',
        items: [
          {
            scenario: 'X',
            dates: ['2026-01-02'],
            latestDate: '2026-01-02',
            status: 'completed',
            players: [{ pl: 'p', pc: 'c' }],
          },
        ],
      }),
    );
    expect(b.format).toBe('bridge');
    expect(b.entries[0]).toMatchObject({
      title: 'X',
      start: '2026-01-02',
      status: 'completed',
      calendar: '跑團紀錄簿',
    });
  });

  it('看不懂的 JSON', () => {
    expect(() => parseImportJson('{')).toThrow(ImportFormatError);
    expect(() => parseImportJson('{"foo":1}')).toThrow(/看不懂/);
  });

  it('合併：識別碼重複時換新的，準備事項也是', () => {
    const a = initialData(TODAY).entries;
    const merged = mergeEntries(a, a, false);
    expect(merged).toHaveLength(a.length * 2);
    expect(new Set(merged.map((e) => e.id)).size).toBe(merged.length);
    const taskIds = merged.flatMap((e) => e.tasks.map((t) => t.id));
    expect(new Set(taskIds).size).toBe(taskIds.length);
    expect(mergeEntries(a, a.slice(0, 1), true)).toHaveLength(1);
    const cp = [{ id: 'a', name: 'n', c1: '#000000', c2: '#ffffff' }];
    expect(
      mergeCpColors(cp, [...cp, { id: 'a', name: 'm', c1: '#000000', c2: '#ffffff' }]),
    ).toHaveLength(2);
  });
});

describe('iCal', () => {
  it('文字的跳脫與折行', () => {
    expect(escapeText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
    expect(unescapeText('a\\,b\\;c\\\\d\\ne\\Nf')).toBe('a,b;c\\d\ne\nf');
    const long = `SUMMARY:${'團'.repeat(40)}`;
    const folded = foldLine(long);
    for (const line of folded.split('\r\n'))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(parseIcalLines(folded)[0].value).toBe('團'.repeat(40));
    expect(parseDuration('PT2H30M')).toBe(150);
    expect(parseDuration('P1D')).toBe(1440);
  });

  it('本工具：匯出再讀入（整天、多日、有時間、過午夜），X-TRPG-CALENDAR 完整還原', () => {
    const entries: Entry[] = [
      newEntry('plan', '2026-11-01', {
        title: '多日, 預定',
        end: '2026-11-03',
        memo: '第一行\n第二行',
      }),
      newEntry('session', '2026-11-05', {
        title: '夜間團',
        startTime: '22:00',
        endTime: '02:00',
        gm: 'G',
      }),
      newEntry('session', '2026-11-07', {
        title: '下午團',
        startTime: '13:00',
        endTime: '17:00',
        status: 'tentative',
      }),
    ];
    const ics = exportIcal(entries, { title: '團曆', now: new Date('2026-10-27T00:00:00Z') });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261101');
    expect(ics).toContain('DTEND;VALUE=DATE:20261104');
    expect(ics).toContain('SUMMARY:多日\\, 預定');
    expect(ics).toContain('STATUS:TENTATIVE');
    expect(ics).toContain('X-WR-CALNAME:團曆');
    const back = parseIcal(ics);
    expect(back.entries).toEqual(entries);
    expect(back.restored.size).toBe(3);
  });

  it('本工具的 .ics 拿掉 X-TRPG-CALENDAR 之後（其他 App 的樣子）也讀得回日期與時間', () => {
    const entries: Entry[] = [
      newEntry('plan', '2026-11-01', { title: '多日', end: '2026-11-03' }),
      newEntry('session', '2026-11-05', { title: '夜間團', startTime: '22:00', endTime: '02:00' }),
    ];
    const ics = exportIcal(entries, { title: '' }).replace(
      /X-TRPG-CALENDAR:[^\r]*(\r\n [^\r]*)*\r\n/g,
      '',
    );
    expect(ics).not.toContain('X-TRPG');
    const back = parseIcal(ics, 'export');
    expect(
      back.entries.map((e) => [e.kind, e.title, e.start, e.end, e.startTime, e.endTime]),
    ).toEqual([
      ['plan', '多日', '2026-11-01', '2026-11-03', '', ''],
      ['session', '夜間團', '2026-11-05', '2026-11-05', '22:00', '02:00'],
    ]);
  });

  it('Google 日曆匯出的 .ics', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
      'VERSION:2.0',
      'X-WR-CALNAME:工作',
      'X-WR-TIMEZONE:Asia/Taipei',
      'BEGIN:VTIMEZONE',
      'TZID:Asia/Taipei',
      'BEGIN:STANDARD',
      'DTSTART:19700101T000000',
      'TZOFFSETFROM:+0800',
      'TZOFFSETTO:+0800',
      'END:STANDARD',
      'END:VTIMEZONE',
      'BEGIN:VEVENT',
      'DTSTART:20261102T013000Z',
      'DTEND:20261102T033000Z',
      'SUMMARY:開會\\, 週會',
      'DESCRIPTION:很長的說明文字很長的說明文字很長的說明文字很長的說明文字',
      ' 接續的一行',
      'LOCATION:會議室',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:提醒',
      'END:VALARM',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'DTSTART;VALUE=DATE:20261110',
      'DTEND;VALUE=DATE:20261113',
      'SUMMARY:出國',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'DTSTART;TZID=Asia/Tokyo:20261115T100000',
      'DURATION:PT1H',
      'SUMMARY:東京時間',
      'RRULE:FREQ=WEEKLY;COUNT=3',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'DTSTART:20261120T120000Z',
      'SUMMARY:取消了',
      'STATUS:CANCELLED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const r = parseIcal(ics, 'basic');
    expect(r.recurring).toBe(1);
    expect(r.skipped).toBe(1);
    const [meeting, trip, tokyo] = r.entries;
    /* 測試在 Asia/Taipei（tests/setup 或 TZ 環境變數）以外的時區時，UTC 的時間會換成那個時區 */
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(meeting).toMatchObject({ kind: 'session', title: '開會, 週會', calendar: '工作' });
    expect(meeting.memo).toBe(
      '很長的說明文字很長的說明文字很長的說明文字很長的說明文字接續的一行\n地點：會議室',
    );
    if (tz === 'Asia/Taipei') {
      expect([meeting.start, meeting.startTime, meeting.endTime]).toEqual([
        '2026-11-02',
        '09:30',
        '11:30',
      ]);
      expect([tokyo.start, tokyo.startTime, tokyo.endTime]).toEqual([
        '2026-11-15',
        '09:00',
        '10:00',
      ]);
    }
    expect(trip).toMatchObject({
      kind: 'plan',
      start: '2026-11-10',
      end: '2026-11-12',
      startTime: '',
    });
    /* 讀成：全部當預定／全部當場次 */
    expect(convertKinds(r.entries, r.restored, 'plan').map((e) => e.kind)).toEqual([
      'plan',
      'plan',
      'plan',
    ]);
    expect(convertKinds(r.entries, r.restored, 'session').map((e) => e.kind)).toEqual([
      'session',
      'session',
      'session',
    ]);
  });
});

describe('送到跑團紀錄簿、團報產生器', () => {
  const s = newEntry('session', '2026-11-05', {
    id: 'sess1',
    title: '霧港',
    system: 'CoC 7版',
    gm: '白鷺',
    format: '線上・語音',
    status: 'scheduled',
    startTime: '20:00',
    endTime: '23:30',
    players: [
      { pl: '阿樹', pc: '林曉舟' },
      { pl: '小鹿', pc: '程雨' },
    ],
    links: [
      { label: 'CCFOLIA', url: 'https://ccfolia.com/rooms/x' },
      { label: '空的', url: '' },
    ],
    tags: ['TRPG'],
    memo: '備註',
  });

  it('交接資料（格式照原作，多帶時間）', () => {
    const p = logPayload(s, 1_700_000_000_000);
    expect(p).toMatchObject({ source: 'session-check-calendar', version: '1.0' });
    expect(p.items[0]).toMatchObject({
      id: 'calendar_import_1700000000000',
      sourceCalendarId: 'sess1',
      scenario: '霧港',
      dates: ['2026-11-05'],
      latestDate: '2026-11-05',
      sessionCount: 1,
      status: 'scheduled',
      startTime: '20:00',
      endTime: '23:30',
    });
    const multi = logImportItem({ ...s, end: '2026-11-06' });
    expect(multi.dates).toEqual(['2026-11-05', '2026-11-06']);
  });

  it('紀錄簿把它整理成一團', () => {
    const row = logRowFromImportItem(logImportItem(s));
    expect(row).toMatchObject({
      date: '2026-11-05',
      dates: ['2026-11-05'],
      scenario: '霧港',
      system: 'CoC 7版',
      gm: '白鷺',
      players: '阿樹、小鹿',
      pc: '林曉舟、程雨',
      status: '予定',
      time: '3.5',
      note: '備註',
      hashtag: '#TRPG',
      format: '線上・語音',
      media: [{ type: 'link', url: 'https://ccfolia.com/rooms/x', caption: 'CCFOLIA' }],
    });
    expect(logStatusOf('completed')).toBe('完結');
    expect(logStatusOf('延續')).toBe('継続');
    expect(hoursBetween('22:00', '01:30')).toBe('3.5');
    expect(hoursBetween('', '01:30')).toBe('');
    /* 系統的別名 */
    expect(
      logRowFromImportItem({ system: 'クトゥルフ神話TRPG', dates: ['2026-01-01'] }).system,
    ).toBe('CoC 6版');
  });

  it('PL 與 PC 一一對應：PC 空白時佔位、只有 PC 的排最後、PL 欄不放佔位', () => {
    expect(PC_PLACEHOLDER).toBe('—');
    expect(
      pairedPeople([
        { pl: '阿樹', pc: '林曉舟' },
        { pl: '小鹿', pc: '' },
        { pl: '貓又', pc: '沈墨' },
      ]),
    ).toEqual({ players: '阿樹、小鹿、貓又', pcs: '林曉舟、—、沈墨' });
    /* 最後面連續空白的 PC 不寫 */
    expect(
      pairedPeople([
        { pl: 'A', pc: 'a' },
        { pl: 'B', pc: '' },
      ]),
    ).toEqual({ players: 'A、B', pcs: 'a' });
    /* 只有 PC 的排最後：紀錄簿配對成（A,a）（C,—）（空白,b） */
    const r = pairedPeople([
      { pl: 'A', pc: 'a' },
      { pl: '', pc: 'b' },
      { pl: 'C', pc: '' },
    ]);
    expect(r).toEqual({ players: 'A、C', pcs: 'a、—、b' });
    const row = logRowFromImportItem({
      dates: ['2026-01-01'],
      players: [
        { pl: '阿樹', pc: '林曉舟' },
        { pl: '小鹿', pc: '' },
        { pl: '貓又', pc: '沈墨' },
      ],
    });
    expect([row.players, row.pc]).toEqual(['阿樹、小鹿、貓又', '林曉舟、—、沈墨']);
  });

  describe('瀏覽器儲存空間', () => {
    afterEach(() => vi.unstubAllGlobals());
    it('寫入、讀取、損壞、刪除', () => {
      const store = new Map<string, string>();
      vi.stubGlobal('localStorage', {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
      });
      expect(readPendingLogImport()).toBeNull();
      expect(writePendingLogImport(logPayload(s))).toBe(true);
      expect(store.has(LOG_PENDING_IMPORT_KEY)).toBe(true);
      const read = readPendingLogImport();
      expect(read !== null && read !== 'broken' && read.items[0].scenario).toBe('霧港');
      store.set(LOG_PENDING_IMPORT_KEY, '{bad');
      expect(readPendingLogImport()).toBe('broken');
      clearPendingLogImport();
      expect(store.size).toBe(0);
    });
  });

  it('團報產生器（跑團紀錄簿送出時的同一種格式）', () => {
    const p = reportPayload(s, 1_700_000_000_000);
    expect(p).toMatchObject({ source: 'session-check-calendar', version: '1.0' });
    const item = p.items[0];
    expect(Object.keys(item).sort()).toEqual(
      Object.keys(createReportImportItem({ id: 'x', date: '', dates: [] })).sort(),
    );
    expect(item).toMatchObject({
      scenario: '霧港',
      format: 'voice',
      status: 'ongoing',
      players: [
        { pl: '阿樹', pc: '林曉舟', characterUrl: '' },
        { pl: '小鹿', pc: '程雨', characterUrl: '' },
      ],
      links: [{ label: 'CCFOLIA', url: 'https://ccfolia.com/rooms/x' }],
      hashtags: ['TRPG'],
    });
    expect(reportFormat('線上・半文字')).toBe('semi-text');
    expect(reportFormat('文字團')).toBe('text');
    expect(reportFormat('面團')).toBe('');
  });
});
