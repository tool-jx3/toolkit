/**
 * 立繪切入產生器：資料的整理（舊版／壞掉的存檔、專案檔往返）、名稱與檔名、ROUND 編號、VS 的組合、房間的切入名稱。
 */
import { describe, expect, it } from 'vitest';
import {
  createProjectFile,
  parseProject,
  parseProjectBytes,
  serializeProjectZip,
} from '@/core/storage';
import { fontCoverageNote } from '@/tools/char-cutin/fonts';
import {
  type Actor,
  CUT_KINDS,
  cleanDoc,
  DOC_VERSION,
  defaultDoc,
  defaultStyle,
  MYSTERY,
  moveActor,
  rivalActor,
  TOOL_ID,
} from '@/tools/char-cutin/model';
import {
  batchEntries,
  canLeadVersus,
  nameFromFile,
  roomZipFileName,
  roundTag,
  singleFileName,
  triggerName,
  uniqueNames,
  withRoundTags,
  zipEntryName,
  zipFileName,
} from '@/tools/char-cutin/names';

const actor = (id: string, name: string, extra: Partial<Actor> = {}): Actor => ({
  id,
  image: `a${id}`,
  name,
  tag: '',
  quote: '',
  scale: 100,
  eyeY: 20,
  eyeX: 50,
  headLen: 0.4,
  color: null,
  ...extra,
});

describe('cleanDoc', () => {
  it('空的、不是物件的存檔 → 預設', () => {
    expect(cleanDoc(undefined)).toEqual(defaultDoc());
    expect(cleanDoc('壞掉')).toEqual(defaultDoc());
    expect(cleanDoc([])).toEqual(defaultDoc());
  });

  it('預設：六種型、斬入、重擊字「反擊」、謎之剪影「？？？」、WebP 640 × 360、透明、重複、綠幕的綠', () => {
    const d = defaultDoc();
    expect(Object.keys(d.styles)).toEqual([...CUT_KINDS]);
    expect(d.kind).toBe('strike');
    expect(d.impactText).toBe('反擊');
    expect(d.rival).toBe(MYSTERY);
    expect(d.mysteryName).toBe('？？？');
    expect(d.out).toEqual({
      format: 'webp',
      size: 'small',
      videoSize: '720',
      background: 'clear',
      color: '#00b140',
      once: false,
      triggerPrefix: '@',
    });
    /* 橫掠的名字用明體、速度 0.9；重擊字預設思源宋體 Black（繁中完整） */
    expect(d.styles.glide.nameFont.family).toBe('Noto Serif TC');
    expect(d.styles.glide.pace).toBe(0.9);
    expect(d.styles.impact.impactFont).toEqual({
      source: 'google',
      family: 'Noto Serif TC',
      weight: 900,
    });
  });

  it('數值夾在範圍內、壞的演員丟掉、重複的 id 只留第一個、色碼轉小寫、對手找不到時回到謎之剪影', () => {
    const d = cleanDoc({
      kind: 'versus',
      rival: 'nobody',
      impactText: '一二三四五六七八',
      actors: [
        { ...actor('x1', '艾莉絲'), scale: 999, eyeY: -5, eyeX: 120, color: '#ABCDEF' },
        { ...actor('x1', '重複') },
        { id: 'bad id!', image: 'a1', name: 'x' },
        { ...actor('x2', '名字太長了名字太長了名字太長了名字太長了'), color: 'red' },
        null,
      ],
      styles: {
        strike: { main: '#FF0000', pace: 9, zoom: 1, nameFont: { source: 'evil', family: 'x' } },
        impact: { impact: { x: 999, gaps: [5, 0, 0, 200, 0, 0, 0] } },
      },
      out: {
        format: 'gif',
        size: 'large',
        background: 'color',
        color: 'nope',
        once: true,
        triggerPrefix: ' ！！一二三四五六七八 ',
      },
    });
    expect(d.actors.map((a) => a.id)).toEqual(['x1', 'x2']);
    expect(d.actors[0]).toMatchObject({ scale: 200, eyeY: 0, eyeX: 95, color: '#abcdef' });
    expect(Array.from(d.actors[1].name)).toHaveLength(16);
    expect(d.actors[1].color).toBeNull();
    expect(d.rival).toBe(MYSTERY);
    expect(d.impactText).toBe('一二三四五六');
    expect(d.styles.strike).toMatchObject({ main: '#ff0000', pace: 1.5, zoom: 40 });
    expect(d.styles.strike.nameFont).toEqual(defaultStyle('strike').nameFont);
    expect(d.styles.impact.impact).toMatchObject({ x: 60, gaps: [5, 0, 0, 80] });
    expect(d.out).toEqual({
      format: 'webp',
      size: 'large',
      videoSize: '720',
      background: 'color',
      color: '#00b140',
      once: true,
      triggerPrefix: '！！一二三四五六',
    });
    /* 開頭可以空白（不會被補回「@」） */
    expect(cleanDoc({ out: { triggerPrefix: '' } }).out.triggerPrefix).toBe('');
  });

  it('整理過的資料再整理一次不變', () => {
    const d = cleanDoc({ actors: [actor('a', '甲', { color: '#123456' })], kind: 'lift' });
    expect(cleanDoc(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });
});

describe('專案檔（版本 1）', () => {
  it('JSON 與 ZIP（立繪在 files/）存了再讀，資料逐欄相同', () => {
    const d = cleanDoc({
      actors: [actor('a', '艾莉絲', { tag: 'ROUND 01', quote: '上吧', color: '#3366ff' })],
      kind: 'impact',
      impactText: '爆擊',
    });
    const json = JSON.stringify(createProjectFile(TOOL_ID, DOC_VERSION, d));
    const back = parseProject(json, TOOL_ID);
    expect(back.version).toBe(1);
    expect(cleanDoc(back.data)).toEqual(d);
    const zip = serializeProjectZip(TOOL_ID, DOC_VERSION, d, [
      { name: 'aa.png', data: new Uint8Array([1, 2, 3]) },
    ]);
    const parsed = parseProjectBytes(new Uint8Array(zip), TOOL_ID);
    expect(cleanDoc(parsed.data)).toEqual(d);
    expect([...parsed.files.keys()]).toEqual(['aa.png']);
  });

  it('別的工具的專案檔不開', () => {
    const json = JSON.stringify(createProjectFile('cutin', 1, {}));
    expect(() => parseProject(json, TOOL_ID)).toThrow(/其他工具/);
  });
});

describe('清單', () => {
  it('排序', () => {
    const list = [actor('a', 'A'), actor('b', 'B'), actor('c', 'C')];
    expect(moveActor(list, 0, 2).map((a) => a.id)).toEqual(['b', 'c', 'a']);
    expect(moveActor(list, 2, 0).map((a) => a.id)).toEqual(['c', 'a', 'b']);
    expect(moveActor(list, 0, 9).map((a) => a.id)).toEqual(['a', 'b', 'c']);
  });

  it('ROUND 編號：由上而下 ROUND 01、02…（100 以上照實際位數）', () => {
    expect(roundTag(0)).toBe('ROUND 01');
    expect(roundTag(9)).toBe('ROUND 10');
    expect(roundTag(99)).toBe('ROUND 100');
    expect(withRoundTags([actor('a', 'A'), actor('b', 'B')]).map((a) => a.tag)).toEqual([
      'ROUND 01',
      'ROUND 02',
    ]);
  });
});

describe('名稱與檔名', () => {
  it('檔名 → 名字：去掉副檔名與開頭的編號', () => {
    expect(nameFromFile('01_艾莉絲.png')).toBe('艾莉絲');
    expect(nameFromFile('2-黑川.webp')).toBe('黑川');
    expect(nameFromFile('003 Bob.png')).toBe('Bob');
    expect(nameFromFile('12.png')).toBe('名字');
    expect(nameFromFile('No.7_劍士.png')).toBe('No.7_劍士');
  });

  it('一人：「NN_名字_型.副檔名」；ZIP 裡「NN_名字.副檔名」；ZIP「立繪切入_型_N人.zip」', () => {
    expect(singleFileName(0, '艾莉絲', 'strike', 'webp')).toBe('01_艾莉絲_斬入.webp');
    expect(singleFileName(11, 'a/b:c', 'versus', 'png')).toBe('12_a_b_c_VS.png');
    expect(singleFileName(2, '   ', 'gaze', 'mp4')).toBe('03_未命名_眼部特寫.mp4');
    expect(zipEntryName(4, '黑川', 'png')).toBe('05_黑川.png');
    expect(zipFileName('impact', 3)).toBe('立繪切入_重擊_3人.zip');
    expect(roomZipFileName('lift')).toBe('立繪切入_升起_CCFOLIA房間.zip');
  });

  it('VS：全員匯出時拿掉對手，序號照清單；對手不能當左邊', () => {
    const actors = [actor('a', 'A'), actor('b', 'B'), actor('c', 'C')];
    const d = { actors, kind: 'versus' as const, rival: 'b' };
    expect(batchEntries(d).map((e) => [e.index, e.hero.id])).toEqual([
      [0, 'a'],
      [2, 'c'],
    ]);
    expect(rivalActor(d)?.name).toBe('B');
    expect(canLeadVersus(d, 'b')).toBe(false);
    expect(canLeadVersus(d, 'a')).toBe(true);
    /* 謎之剪影、或不是 VS 時全部都做 */
    expect(batchEntries({ ...d, rival: MYSTERY })).toHaveLength(3);
    expect(batchEntries({ ...d, kind: 'strike' })).toHaveLength(3);
    expect(canLeadVersus({ ...d, kind: 'strike' }, 'b')).toBe(true);
  });

  it('房間的切入名稱：開頭（預設「@」）＋名字；VS 是「開頭＋名字VS對手」；開頭可以空白；重複時加 2、3', () => {
    expect(triggerName(actor('a', '艾莉絲'), 'strike', '')).toBe('@艾莉絲');
    expect(triggerName(actor('a', '艾莉絲'), 'strike', '', '')).toBe('艾莉絲');
    expect(triggerName(actor('a', '艾莉絲'), 'strike', '', '#')).toBe('#艾莉絲');
    expect(triggerName(actor('a', '艾莉絲'), 'versus', '？？？')).toBe('@艾莉絲VS？？？');
    expect(triggerName(actor('a', '艾莉絲'), 'versus', ' ', '')).toBe('艾莉絲VS');
    expect(triggerName(actor('a', ''), 'gaze', '')).toBe('@未命名');
    expect(uniqueNames(['甲', '乙', '甲', '甲'])).toEqual(['甲', '乙', '甲2', '甲3']);
    expect(uniqueNames(['@甲', '@甲'])).toEqual(['@甲', '@甲2']);
  });

  it('不含繁中的 Google 字型（日文、韓文、只有英數字）時提醒；繁中字型、電腦字型不提醒', () => {
    expect(fontCoverageNote({ source: 'google', family: 'Yuji Boku', weight: 400 })).toBe(
      '這個字型是日文字型，缺的繁體字會用黑體代替。',
    );
    expect(fontCoverageNote({ source: 'google', family: 'Jua', weight: 400 })).toMatch(/韓文字型/);
    expect(fontCoverageNote({ source: 'google', family: 'Cinzel', weight: 400 })).toMatch(
      /只有英數字的字型/,
    );
    expect(fontCoverageNote({ source: 'google', family: 'Noto Serif TC', weight: 900 })).toBeNull();
    expect(fontCoverageNote({ source: 'google', family: 'Chiron Hei HK', weight: 400 })).toBeNull();
    expect(fontCoverageNote({ source: 'local', family: 'MS Gothic', weight: 400 })).toBeNull();
  });
});
