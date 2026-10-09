// @vitest-environment jsdom
/**
 * coc-sheet 的舊存檔搬移（規格 F60、F61、3.4）。夾具 fixtures/coc-sheet-legacy.json 是在舊版頁面
 * （tools/trpg-lab/coc7_Investigator_sheet.html，建置後的 web/dist）實際填寫、存檔後取出的 localStorage：
 * - 「調查員甲」：繁中介面；改過「玩家」欄名稱、改過「電腦使用」的標籤（0%）、在「催眠」按 Enter 插入「神學」、
 *   「機械維修」寫了「60/30」、上傳並裁切了頭像；
 * - 「調查員乙」：日文介面（標籤是日文、帶語言掛勾）；
 * - 自動儲存：乙改了名字（「佐藤（改）」），和兩份存檔都不同。
 */
import { describe, expect, it } from 'vitest';
import {
  AUTOSAVE_TITLE,
  legacyNumber,
  migrateLegacy,
  parseLegacySheet,
  sheetFingerprint,
  splitLabel,
} from '@/tools/coc-sheet/legacy';
import { newSheet, SKILL_CATALOG } from '@/tools/coc-sheet/model';
import { skillValue } from '@/tools/coc-sheet/rules';
import legacy from './fixtures/coc-sheet-legacy.json';

const saves = legacy.charasheet as Record<string, string>;
const A = () => parseLegacySheet(saves.調查員甲, '調查員甲');
const B = () => parseLegacySheet(saves.調查員乙, '調查員乙');

describe('調查員甲（繁中介面）', () => {
  it('基本資料、屬性、移動力、自訂欄、HP／SAN／MP', () => {
    const { sheet: s } = A();
    expect(s.title).toBe('調查員甲');
    expect(s.info).toEqual({
      name: '林子安',
      player: '小明',
      occupation: '私家偵探',
      age: '42',
      sex: '男',
      residence: '台北',
      birthplace: '基隆',
    });
    expect(s.stats).toEqual({
      STR: 50,
      DEX: 65,
      INT: 70,
      CON: 55,
      APP: 45,
      POW: 60,
      SIZ: 70,
      EDU: 80,
    });
    expect(s.mov).toBe(7);
    expect(s.custom).toEqual({ title: '線索', text: '鑰匙（地下室）\n舊報紙' });
    expect(s.hp.max).toBe(12);
    expect(s.san).toMatchObject({ start: 60, max: 96 });
    expect(s.mp.max).toBe(12);
    expect(s.db).toBe('+1D4');
    expect(s.build).toBe(1);
  });

  it('技能：60 格的順序、種類、專長、插入的列、改過的標籤、技能值', () => {
    const { sheet: s } = A();
    expect(s.skills).toHaveLength(60);
    const row = (n: number) => s.skills[n - 1];
    expect(row(1)).toMatchObject({
      key: 'intimidate',
      kind: 'skill',
      name: '恐嚇',
      base: 15,
      value: 40,
    });
    expect(row(3)).toMatchObject({ key: 'medicine', value: null });
    expect(row(8)).toMatchObject({ key: 'dodge', base: 'DEX/2', value: 32 });
    expect(row(9)).toMatchObject({
      key: 'science',
      kind: 'specialty',
      name: '科學',
      specialty: '化學',
      base: 1,
      value: 31,
    });
    expect(row(10)).toMatchObject({ kind: 'custom', name: '藥學', value: 21 });
    expect(row(14)).toMatchObject({ key: 'mechRepair', value: 60 });
    expect(row(17)).toMatchObject({ kind: 'custom', name: '催眠', value: 15 });
    /* 在「催眠」按 Enter 插入的列（舊版還沒重新整理前不算困難／極限，新版照算） */
    expect(row(18)).toMatchObject({ kind: 'custom', name: '神學', value: 20 });
    expect(row(20)).toMatchObject({ key: 'cthulhuMythos', value: 3, checkable: false });
    expect(row(21)).toMatchObject({ key: 'artCraft', specialty: '攝影', value: 45 });
    /* 改過的標籤：名稱比對出鍵，初始值照改過的 */
    expect(row(26)).toMatchObject({ key: 'computerUse', name: '電腦使用', base: 0, value: null });
    expect(row(30)).toMatchObject({ key: 'firearmsRifle', name: '射擊（步槍／霰彈槍）', base: 25 });
    expect(row(33)).toMatchObject({ key: 'creditRating', value: 30, checkable: false });
    expect(row(51)).toMatchObject({ key: 'otherLanguage', specialty: '英語', value: 41 });
    expect(row(53)).toMatchObject({
      key: 'ownLanguage',
      base: 'EDU',
      specialty: '中文',
      value: 80,
    });
    expect(row(55)).toMatchObject({ key: 'spotHidden', value: 75 });
    /* 空白列裡寫的「馬術（5%）」拆成名稱與初始值 */
    expect(row(57)).toMatchObject({ kind: 'custom', name: '馬術', base: 5, value: 25 });
    expect(row(60)).toMatchObject({ kind: 'custom', name: '', value: null });
  });

  it('武器：空白列不搬，徒手的值照舊（手填 55）', () => {
    const { sheet: s } = A();
    expect(s.weapons).toHaveLength(2);
    expect(s.weapons[0]).toMatchObject({
      name: '徒手',
      skillId: null,
      value: 55,
      damage: '1D3 + DB',
      range: '─',
      attacks: '1',
      ammo: '─',
      malfunction: '─',
    });
    expect(s.weapons[1]).toMatchObject({
      name: '手槍（.38）',
      value: 45,
      damage: '1D10',
      range: '15m',
      attacks: '1（3）',
      ammo: '6',
      malfunction: '100',
    });
  });

  it('背景故事（每一格一行）、裝備（左欄 10 行再右欄）、資產、備註', () => {
    const { sheet: s } = A();
    expect(s.story.description).toBe(
      '身材瘦高，總是穿著洗到褪色的風衣，左手戴\n著一只停走的懷錶，說話時習慣先停頓一下再開口。',
    );
    expect(s.story.ideology).toBe('相信科學\n但不排斥迷信');
    expect(s.story.possessions).toBe('父親的懷錶');
    expect(s.story.encounters).toBe('深潛者');
    expect(s.story.people).toBe('');
    expect(s.gear.split('\n')).toEqual([
      '手電筒',
      '筆記本',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '左輪手槍',
    ]);
    expect(s.assets).toEqual({
      spending: '中等',
      cash: '$500',
      assets: '$5,000',
      other: '公寓一間',
    });
    expect(s.memo).toBe('第一行\n第二行');
  });

  it('頭像：520×640 的 PNG，id 是 SHA-256 的前 24 位十六進位（與 core/assets 相同）', async () => {
    const { sheet: s, portrait } = A();
    expect(portrait).not.toBeNull();
    const p = portrait as NonNullable<typeof portrait>;
    expect(p.mime).toBe('image/png');
    expect([p.width, p.height]).toEqual([520, 640]);
    const digest = new Uint8Array(
      await crypto.subtle.digest('SHA-256', p.bytes.slice() as Uint8Array<ArrayBuffer>),
    );
    const hex = [...digest].map((x) => x.toString(16).padStart(2, '0')).join('');
    expect(p.assetId).toBe(`a${hex.slice(0, 24)}`);
    expect(s.portrait).toEqual({
      assetId: p.assetId,
      crop: { x: 0, y: 0, width: 520, height: 640 },
    });
  });

  it('略過的內容：改過的欄位名稱、不是純數字的技能值', () => {
    expect(A().skipped).toEqual([
      '欄位名稱「PL」（玩家欄改過的名稱；新版的欄位名稱是固定的）',
      '技能「機械維修」的技能值「60/30」（只取 60）',
    ]);
  });

  it('沒有語言掛勾的舊存檔（較早的版本）：依標籤文字認出預設技能', () => {
    const stripped = saves.調查員甲.replace(/ data-i18n(-html)?="[^"]*"/g, '');
    const { sheet: s } = parseLegacySheet(stripped, '調查員甲');
    const { sheet: hooked } = A();
    expect(s.skills.map((k) => [k.key, k.name, k.base, k.specialty, k.value])).toEqual(
      hooked.skills.map((k) => [k.key, k.name, k.base, k.specialty, k.value]),
    );
    expect(s.weapons[0].name).toBe('徒手');
    expect(s.custom.title).toBe('線索');
  });
});

describe('調查員乙（日文介面）', () => {
  it('日文的預設標籤依掛勾換成繁中；值照搬；徒手沒有手填值以外的欄位照舊', () => {
    const { sheet: s, portrait, skipped } = B();
    expect(s.info.name).toBe('佐藤');
    expect(s.stats.STR).toBe(40);
    expect(s.skills[15]).toMatchObject({ key: 'fightingBrawl', name: '格鬥（鬥毆）', value: 50 });
    expect(s.skills[53]).toMatchObject({ key: 'spotHidden', name: '偵查', base: 25, value: 70 });
    expect(s.skills.map((k) => k.key)).toEqual(SKILL_CATALOG.map((r) => r.key));
    expect(s.weapons).toHaveLength(1);
    expect(s.weapons[0]).toMatchObject({ name: '徒手', value: 50 });
    expect(s.custom.title).toBe('自訂');
    expect(portrait).toBeNull();
    expect(skipped).toEqual([]);
  });
});

describe('migrateLegacy', () => {
  it('自動儲存和存檔都不同：加一張「自動儲存的角色卡」在最前面、設為目前的角色卡', () => {
    const m = migrateLegacy(JSON.stringify(saves), legacy.autosave);
    expect(m).not.toBeNull();
    const r = m as NonNullable<typeof m>;
    expect(r.sheets.map((s) => [s.title, s.info.name])).toEqual([
      [AUTOSAVE_TITLE, '佐藤（改）'],
      ['調查員甲', '林子安'],
      ['調查員乙', '佐藤'],
    ]);
    expect(r.currentId).toBe(r.sheets[0].id);
    expect(r.portraits).toHaveLength(1);
    expect(r.skipped.map((x) => x.title)).toEqual(['調查員甲']);
    expect(new Set(r.sheets.map((s) => s.id)).size).toBe(3);
  });

  it('自動儲存和某個存檔相同：不另外加，目前的角色卡就是那一張', () => {
    const m = migrateLegacy(JSON.stringify(saves), saves.調查員乙);
    expect(m?.sheets.map((s) => s.title)).toEqual(['調查員甲', '調查員乙']);
    expect(m?.currentId).toBe(m?.sheets[1].id);
  });

  it('只有自動儲存；空白的角色卡不搬；壞掉的資料', () => {
    const only = migrateLegacy(null, legacy.autosave);
    expect(only?.sheets.map((s) => s.title)).toEqual([AUTOSAVE_TITLE]);
    const blank = saves.調查員乙
      .replace(/>佐藤</, '><')
      .replace(/>40</g, '><')
      .replace(/>70</g, '><')
      .replace(/>50</g, '><');
    expect(migrateLegacy('{}', blank)).toBeNull();
    /* 空白的具名存檔也不搬（7.1）；全部空白時沒有東西可以搬 */
    const withBlank = migrateLegacy(JSON.stringify({ 空白: blank, ...saves }), null);
    expect(withBlank?.sheets.map((s) => s.title)).toEqual(['調查員甲', '調查員乙']);
    expect(withBlank?.currentId).toBe(withBlank?.sheets[0].id);
    expect(migrateLegacy(JSON.stringify({ 空白: blank }), blank)).toBeNull();
    expect(migrateLegacy('not json', null)).toBeNull();
    expect(migrateLegacy('[1,2]', '')).toBeNull();
    expect(migrateLegacy(JSON.stringify({ 壞的: 5 }), null)).toBeNull();
  });

  it('搬來的角色卡和新角色卡的結構相同（fingerprint 可以比較）', () => {
    expect(sheetFingerprint(parseLegacySheet(saves.調查員乙, 'x').sheet)).not.toBe(
      sheetFingerprint(newSheet('')),
    );
  });

  it('搬來的「科學（化學）」等技能值（手動值）照用', () => {
    const { sheet } = A();
    expect(skillValue(sheet.skills[8], sheet.stats)).toBe(31);
    /* 沒有手填的預設技能：自動＝初始值 */
    expect(skillValue(sheet.skills[2], sheet.stats)).toBe(1);
  });
});

describe('小工具', () => {
  it('splitLabel：最後一組括號是初始值', () => {
    expect(splitLabel('恐嚇（15%）')).toEqual({ name: '恐嚇', base: 15 });
    expect(splitLabel('格鬥（鬥毆）（25%）')).toEqual({ name: '格鬥（鬥毆）', base: 25 });
    expect(splitLabel('威圧 (15%)')).toEqual({ name: '威圧', base: 15 });
    expect(splitLabel('閃避（DEX×½）')).toEqual({ name: '閃避', base: 'DEX/2' });
    expect(splitLabel('母國語 (EDU%)')).toEqual({ name: '母國語', base: 'EDU' });
    expect(splitLabel('格鬥（鬥毆）')).toEqual({ name: '格鬥（鬥毆）', base: null });
    expect(splitLabel('')).toEqual({ name: '', base: null });
  });

  it('legacyNumber：開頭的整數、負數當 0、全形數字', () => {
    expect(legacyNumber('')).toEqual({ value: null, exact: true });
    expect(legacyNumber('50')).toEqual({ value: 50, exact: true });
    expect(legacyNumber('60/30')).toEqual({ value: 60, exact: false });
    expect(legacyNumber('-5')).toEqual({ value: 0, exact: true });
    expect(legacyNumber('５０')).toEqual({ value: 50, exact: true });
    expect(legacyNumber('abc')).toEqual({ value: null, exact: false });
  });
});
