/**
 * 舊版角色卡（tools/trpg-lab/coc7_Investigator_sheet.html）的存檔搬移（規格 F48～F50、3.4）。
 *
 * 舊版把整個角色卡的 HTML（`main.innerHTML`）存進 localStorage：
 * - `coc7_charasheet`：`{ 存檔名稱: HTML }`（「儲存」）
 * - `coc7_autosave`：HTML（輸入後 1 秒自動儲存）
 * 這裡用 DOMParser 讀那段 HTML（不執行任何腳本、不放進頁面），依元素的位置與 class 取出每個欄位的值。
 * 標籤上有舊版語言引擎的掛勾（`data-i18n="sheet.skill.<鍵>"`）時依鍵對應預設技能（不論存檔時是繁中或日文），
 * 沒有掛勾（使用者改寫過）時讀文字：「名稱（初始值）」。
 */
import { sha256Sync } from '@/core/files';
import {
  CATALOG_BY_KEY,
  INFO_KEYS,
  newSheet,
  newSkill,
  newWeapon,
  SHEET_CUSTOM_TITLE,
  type Sheet,
  type Skill,
  type SkillBase,
  type SkillKind,
  STAT_KEYS,
  STORY_KEYS,
  type StatKey,
  type StoryKey,
  type Weapon,
} from './model';
import { DEFAULTS, S, SHEET, SKILL_NAMES } from './strings';

export const LEGACY_SAVES_KEY = 'coc7_charasheet';
export const LEGACY_AUTOSAVE_KEY = 'coc7_autosave';
/** 自動儲存的內容和存檔都不同時，另外加的那張角色卡的名稱 */
export const AUTOSAVE_TITLE: string = S.migrate.autosaveTitle;

/** 舊版字典裡的技能標籤（繁中、日文；用來認出沒有掛勾的預設技能） */
const LEGACY_SKILL_LABELS: Readonly<Record<string, readonly string[]>> = {
  intimidate: ['恐嚇（15%）', '威圧 (15%)'],
  fastTalk: ['話術（5%）', '言いくるめ (5%)'],
  medicine: ['醫學（1%）', '医学 (1%)'],
  driveAuto: ['汽車駕駛（20%）', '運転(自動車) (20%)'],
  firstAid: ['急救（30%）', '応急手当 (30%)'],
  occult: ['神秘學（5%）', 'オカルト (5%)'],
  stealth: ['潛行（20%）', '隠密 (20%)'],
  dodge: ['閃避（DEX×½）', '回避 (DEX×½)'],
  science: ['科學（1%）', '科学 (1%)'],
  locksmith: ['鎖匠（1%）', '鍵開け (1%)'],
  appraise: ['估價（5%）', '鑑定 (5%)'],
  mechRepair: ['機械維修（10%）', '機械修理 (10%)'],
  listen: ['聆聽（20%）', '聞き耳 (20%)'],
  fightingBrawl: ['格鬥（鬥毆）（25%）', '近接戦闘(格闘) (25%)'],
  cthulhuMythos: ['克蘇魯神話（0%）', 'クトゥルフ神話 (0%)'],
  artCraft: ['藝術／手藝（5%）', '芸術／製作 (5%)'],
  accounting: ['會計（5%）', '経理 (5%)'],
  archaeology: ['考古學（1%）', '考古学 (1%)'],
  computerUse: ['電腦使用（5%）', 'コンピューター (5%)'],
  survival: ['生存（10%）', 'サバイバル (10%)'],
  naturalWorld: ['博物學（10%）', '自然 (10%)'],
  firearmsHandgun: ['射擊（手槍）（20%）', '射撃(拳銃) (20%)'],
  firearmsRifle: ['射擊（步槍／霰彈槍）（25%）', '射撃(ﾗｲﾌﾙ/ｼｮｯﾄｶﾞﾝ) (25%)'],
  heavyMachinery: ['操作重型機械（1%）', '重機械操作 (1%)'],
  creditRating: ['信用評級（0%）', '信用 (0%)'],
  psychology: ['心理學（10%）', '心理学 (10%)'],
  anthropology: ['人類學（1%）', '人類学 (1%)'],
  swim: ['游泳（20%）', '水泳 (20%)'],
  psychoanalysis: ['精神分析（1%）', '精神分析 (1%)'],
  persuade: ['說服（10%）', '説得 (10%)'],
  pilot: ['駕駛（1%）', '操縦 (1%)'],
  jump: ['跳躍（20%）', '跳躍 (20%)'],
  track: ['追蹤（10%）', '追跡 (10%)'],
  sleightOfHand: ['妙手（10%）', '手さばき (10%)'],
  elecRepair: ['電氣維修（10%）', '電気修理 (10%)'],
  electronics: ['電子學（1%）', '電子工学 (1%)'],
  throw: ['投擲（20%）', '投擲 (20%)'],
  climb: ['攀爬（20%）', '登攀 (20%)'],
  libraryUse: ['圖書館使用（20%）', '図書館 (20%)'],
  navigate: ['導航（10%）', 'ナビゲート (10%)'],
  disguise: ['喬裝（5%）', '変装 (5%)'],
  law: ['法律（5%）', '法律 (5%)'],
  otherLanguage: ['外語（1%）', 'ほかの言語 (1%)'],
  ownLanguage: ['母語（EDU%）', '母国語 (EDU%)'],
  charm: ['魅惑（15%）', '魅惑 (15%)'],
  spotHidden: ['偵查（25%）', '目星 (25%)'],
  history: ['歷史（5%）', '歴史 (5%)'],
};

/** 舊版基本資料欄的標籤（繁中、日文） */
const LEGACY_INFO_LABELS: Readonly<Record<string, readonly string[]>> = {
  name: ['姓名', '名前'],
  player: ['玩家', 'プレイヤー'],
  occupation: ['職業', '職業'],
  age: ['年齡', '年齢'],
  sex: ['性別', '性別'],
  residence: ['居住地', '住所'],
  birthplace: ['出生地', '出身'],
};
const LEGACY_WEAPON_UNARMED = ['徒手', '素手'];
const LEGACY_CUSTOM_TITLES = ['自訂', 'カスタム'];

/** 比對用：NFKC（全形括號、半形片假名）、拿掉空白 */
const norm = (s: string) => s.normalize('NFKC').replace(/\s+/g, '');

const LABEL_TO_KEY = new Map<string, string>();
const NAME_TO_KEY = new Map<string, string>();
for (const [key, labels] of Object.entries(LEGACY_SKILL_LABELS)) {
  for (const l of labels) {
    LABEL_TO_KEY.set(norm(l), key);
    const n = splitLabel(l).name;
    if (n) NAME_TO_KEY.set(norm(n), key);
  }
  NAME_TO_KEY.set(norm(SKILL_NAMES[key] ?? ''), key);
}

/** 「名稱（初始值）」→ 名稱、初始值（最後一組括號是初始值時；看不懂的初始值當成名稱的一部分） */
export function splitLabel(text: string): { name: string; base: SkillBase } {
  const t = text.replace(/\s+/g, ' ').trim();
  const m = t.match(/^(.*?)\s*[（(]([^（）()]*)[）)]\s*$/s);
  if (m) {
    /* 名稱裡也有括號（「格鬥（鬥毆）（25%）」）：取最後一組 */
    const last = t.match(/^(.*)[（(]([^（）()]*)[）)]\s*$/s);
    const name = (last?.[1] ?? m[1]).trim();
    const base = parseBase(last?.[2] ?? m[2]);
    if (base !== undefined && name) return { name, base };
  }
  return { name: t, base: null };
}

/** 初始值的寫法：「15%」「15」→ 15、「DEX×½」→ DEX/2、「EDU%」→ EDU；看不懂 → undefined */
function parseBase(s: string): SkillBase | undefined {
  const t = s.normalize('NFKC').replace(/\s+/g, '').toUpperCase();
  const n = t.match(/^(\d{1,3})%?$/);
  if (n) return Number(n[1]);
  if (/^DEX(×|X|\*)?(½|1\/2)$/.test(t) || t === 'DEX/2') return 'DEX/2';
  if (/^EDU%?$/.test(t)) return 'EDU';
  return undefined;
}

/** 舊版數字欄的讀法：開頭的整數（可有正負號），負數當 0；全形數字先轉半形 */
export function legacyNumber(text: string): { value: number | null; exact: boolean } {
  const t = text.normalize('NFKC').trim();
  if (!t) return { value: null, exact: true };
  const m = t.match(/^[-+]?\d+/);
  if (!m) return { value: null, exact: false };
  return { value: Math.max(0, Number.parseInt(m[0], 10)), exact: m[0] === t };
}

/** 一串元素的文字 → 多行文字（每個元素一行；去掉結尾的空行） */
function lines(els: Iterable<Element>): string {
  const out = [...els].map((e) => (e.textContent ?? '').replace(/\n/g, ' '));
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out.join('\n');
}

const text = (el: Element | null | undefined) => (el?.textContent ?? '').trim();

/** i18n 掛勾的鍵（data-i18n 或 data-i18n-html） */
const hook = (el: Element | null | undefined) =>
  el?.getAttribute('data-i18n') ?? el?.getAttribute('data-i18n-html') ?? null;

export interface LegacyPortrait {
  /** data URL 的位元組 */
  bytes: Uint8Array;
  mime: string;
  width: number;
  height: number;
  /** 依內容算出的資產 id（與 core/assets 的 assetIdFor 相同：SHA-256 前 24 位十六進位） */
  assetId: string;
}

export interface LegacySheet {
  sheet: Sheet;
  portrait: LegacyPortrait | null;
  /** 沒有搬過來的內容（給使用者看的說明） */
  skipped: string[];
}

function base64Bytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** PNG 的寬高（IHDR）；不是 PNG 時 null */
function pngSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 24 || b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47)
    return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { width: dv.getUint32(16), height: dv.getUint32(20) };
}

const hex = (bytes: Uint8Array) => [...bytes].map((x) => x.toString(16).padStart(2, '0')).join('');

function readPortrait(doc: Document): LegacyPortrait | null {
  const src = doc.querySelector('#img-container img')?.getAttribute('src') ?? '';
  const m = src.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!m?.[2]) return null;
  try {
    const bytes = base64Bytes(m[3]);
    /* 舊版用 Fabric 裁成 520×640 的 PNG（高解析度螢幕上可能是兩倍） */
    const size = pngSize(bytes) ?? { width: 520, height: 640 };
    return {
      bytes,
      mime: m[1] || 'image/png',
      ...size,
      assetId: `a${hex(sha256Sync(bytes).slice(0, 12))}`,
    };
  } catch {
    return null;
  }
}

/** 預設技能的名稱、初始值（依鍵） */
function catalogSkill(key: string): { name: string; base: SkillBase; checkable: boolean } {
  const row = CATALOG_BY_KEY.get(key);
  return {
    name: SKILL_NAMES[key] ?? key,
    base: row?.base ?? null,
    checkable: row?.checkable ?? true,
  };
}

/** 一個技能的標籤 → 鍵、名稱、初始值 */
function readSkillLabel(label: Element | null): {
  key: string | null;
  name: string;
  base: SkillBase;
  checkable: boolean;
} {
  const h = hook(label);
  const hooked = h?.startsWith('sheet.skill.') ? h.slice('sheet.skill.'.length) : null;
  if (hooked && CATALOG_BY_KEY.has(hooked)) return { key: hooked, ...catalogSkill(hooked) };
  const raw = text(label);
  const exact = LABEL_TO_KEY.get(norm(raw));
  if (exact) return { key: exact, ...catalogSkill(exact) };
  const { name, base } = splitLabel(raw);
  const key = NAME_TO_KEY.get(norm(name)) ?? null;
  return { key, name, base, checkable: key ? catalogSkill(key).checkable : true };
}

/**
 * 解析一份舊版角色卡的 HTML。`label` 是說明裡用的名稱（存檔名稱）。
 * `parse` 預設用瀏覽器的 DOMParser（text/html：不執行腳本、圖片不載入）。
 */
export function parseLegacySheet(
  html: string,
  title: string,
  parse: (html: string) => Document = (h) => new DOMParser().parseFromString(h, 'text/html'),
): LegacySheet {
  const doc = parse(`<!doctype html><html><body><main>${html}</main></body></html>`);
  const sheet = newSheet(title);
  const skipped: string[] = [];
  const skip = (what: string) => skipped.push(what);
  const pages = doc.querySelectorAll('.a4-sheet');
  const p1 = pages[0] ?? doc;
  const p2 = pages[1] ?? doc;

  /* 基本資料：依序 7 欄 */
  const infoRows = [...p1.querySelectorAll('.investigator-info label')];
  INFO_KEYS.forEach((key, i) => {
    const label = infoRows[i];
    const value = label?.nextElementSibling;
    sheet.info[key] = text(value);
    if (label && !hook(label)) {
      const t = text(label);
      if (!LEGACY_INFO_LABELS[key].includes(t)) skip(S.migrate.label(t, SHEET.info[key]));
    }
  });

  /* 屬性：依標籤（STR…EDU） */
  const numberOf = (el: Element | null | undefined, what: string): number | null => {
    const raw = text(el);
    const r = legacyNumber(raw);
    if (!r.exact)
      skip(
        r.value === null ? S.migrate.notNumber(what, raw) : S.migrate.partial(what, raw, r.value),
      );
    return r.value;
  };
  for (const box of p1.querySelectorAll('.abilitie-grid .abilitie')) {
    const key = text(box.querySelector('label')).toUpperCase() as StatKey;
    if (!STAT_KEYS.includes(key)) continue;
    sheet.stats[key] = numberOf(box.querySelector('.abilitie-regular'), key);
  }
  sheet.mov = numberOf(p1.querySelector('.mov'), SHEET.mov);

  /* 自訂欄 */
  const customBox = p1.querySelector('.custom-box');
  if (customBox) {
    const head = customBox.firstElementChild;
    const t = text(head);
    sheet.custom.title = hook(head) || LEGACY_CUSTOM_TITLES.includes(t) ? SHEET_CUSTOM_TITLE : t;
    sheet.custom.text = lines(customBox.querySelectorAll('span'));
  }

  /* 生命值、理智、魔法值 */
  sheet.hp.max = numberOf(p1.querySelector('.max-hp'), `${SHEET.hp}${SHEET.max}`);
  sheet.san.start = numberOf(p1.querySelector('.start-san'), `${SHEET.san}${SHEET.start}`);
  sheet.san.max = numberOf(p1.querySelector('.max-san'), `${SHEET.san}${SHEET.max}`);
  sheet.mp.max = numberOf(p1.querySelector('.max-mp'), `${SHEET.mp}${SHEET.max}`);

  /* 技能：每一格 */
  const skills: Skill[] = [];
  for (const row of p1.querySelectorAll('.skill-grid > div')) {
    const cls = row.classList;
    let kind: SkillKind = 'custom';
    let key: string | null = null;
    let name = '';
    let specialty = '';
    let base: SkillBase = null;
    let checkable = true;
    if (cls.contains('skill')) {
      const r = readSkillLabel(row.querySelector('label'));
      ({ key, name, base, checkable } = r);
      kind = 'skill';
    } else if (cls.contains('special-skill')) {
      const labels = row.querySelectorAll('label');
      const r = readSkillLabel(labels[0] ?? null);
      ({ key, name, base, checkable } = r);
      specialty = text(labels[1]);
      kind = 'specialty';
    } else if (cls.contains('add-special-skill') || cls.contains('free-skill')) {
      const r = splitLabel(text(row.querySelector('label')));
      name = r.name;
      base = r.base;
    } else continue;
    const label = name + (specialty ? `（${specialty}）` : '');
    const value = numberOf(
      row.querySelector('.skill-regular'),
      S.migrate.skillValue(label || S.migrate.blankRow),
    );
    skills.push(newSkill({ key, kind, name, specialty, base, value, checkable }));
  }
  /* 舊版只顯示前 60 格；60 格以後只留到最後一個有內容的 */
  let last = skills.length - 1;
  while (last >= 60 && isBlankSkill(skills[last])) last--;
  if (skills.length) sheet.skills = skills.slice(0, last + 1);

  /* 武器：空白的列不搬 */
  const weapons: Weapon[] = [];
  const brawl = sheet.skills.find((s) => s.key === 'fightingBrawl');
  p1.querySelectorAll('.weapon-data').forEach((row, i) => {
    const get = (c: string) => row.querySelector(`.${c}`);
    const nameEl = get('weapon-name');
    const rawName = text(nameEl);
    const name =
      hook(nameEl) === 'sheet.weapon.unarmed' ||
      (i === 0 && LEGACY_WEAPON_UNARMED.includes(rawName))
        ? DEFAULTS.unarmed
        : rawName;
    const w = newWeapon({
      name,
      value: numberOf(get('weapon-regular'), S.migrate.weaponValue(name || S.migrate.blankRow)),
      damage: text(get('weapon-damage')),
      range: text(get('weapon-range')),
      attacks: text(get('weapon-times')),
      ammo: text(get('weapon-bullets')),
      malfunction: text(get('weapon-break')),
    });
    const filled = [w.name, w.damage, w.range, w.attacks, w.ammo, w.malfunction].some(Boolean);
    /* 「徒手」沒有填技能值時和新角色卡一樣跟著「格鬥（鬥毆）」 */
    if (w.name === DEFAULTS.unarmed && w.value === null && brawl) w.skillId = brawl.id;
    if (filled || w.value !== null) weapons.push(w);
  });
  sheet.weapons = weapons;

  /* 戰鬥 */
  const db = text(p1.querySelector('.db'));
  sheet.db = db;
  sheet.build = numberOf(p1.querySelector('.build'), SHEET.build);
  const combatDodge = numberOf(
    p1.querySelector('.combat-container .abilitie-regular'),
    `${SHEET.combat}的${SHEET.dodge}`,
  );
  const dodge = sheet.skills.find((s) => s.key === 'dodge');
  if (combatDodge !== null) {
    if (dodge && dodge.value === null) dodge.value = combatDodge;
    else if (dodge && dodge.value !== combatDodge) skip(S.migrate.dodge(combatDodge, dodge.value));
  }

  /* 背景故事：依掛勾的鍵，沒有掛勾時依位置 */
  p2.querySelectorAll('.backstory.sentence').forEach((box, i) => {
    const h = hook(box.querySelector('label'));
    const k = (h?.startsWith('sheet.backstory.') ? h.slice(16) : STORY_KEYS[i]) as StoryKey;
    if (!STORY_KEYS.includes(k)) return;
    sheet.story[k] = lines(box.querySelectorAll('span'));
  });

  /* 裝備：左欄再右欄 */
  sheet.gear = lines([
    ...p2.querySelectorAll('#item-left span'),
    ...p2.querySelectorAll('#item-right span'),
  ]);

  /* 現金與資產 */
  const assetLabels = p2.querySelectorAll('#assets .label-asset span');
  sheet.assets.spending = text(assetLabels[0]);
  sheet.assets.cash = text(assetLabels[1]);
  sheet.assets.assets = text(assetLabels[2]);
  sheet.assets.other = lines(p2.querySelectorAll('#assets > span'));

  /* 備註 */
  sheet.memo = lines(p2.querySelectorAll('.memo span'));

  /* 頭像 */
  const portrait = readPortrait(doc);
  if (portrait)
    sheet.portrait = {
      assetId: portrait.assetId,
      crop: { x: 0, y: 0, width: portrait.width, height: portrait.height },
    };
  else if (doc.querySelector('#img-container img')) skip(S.migrate.portrait);

  return { sheet, portrait, skipped };
}

function isBlankSkill(s: Skill): boolean {
  return s.kind === 'custom' && !s.name.trim() && s.value === null;
}

/** 比較兩張角色卡的內容（不看 id、名稱） */
export function sheetFingerprint(sheet: Sheet): string {
  return JSON.stringify({
    ...sheet,
    id: '',
    title: '',
    skills: sheet.skills.map((s) => ({ ...s, id: '' })),
    weapons: sheet.weapons.map((w) => ({ ...w, id: '' })),
  });
}

export interface LegacyMigration {
  sheets: Sheet[];
  currentId: string;
  portraits: LegacyPortrait[];
  /** 每張角色卡沒有搬過來的內容（角色卡名稱 → 說明） */
  skipped: { title: string; items: string[] }[];
}

/**
 * 讀舊版的 localStorage 值，轉成新版的角色卡。沒有可以搬的內容時 null。
 * - 每個具名存檔一張（名稱＝存檔名稱，依存檔的順序）；
 * - 自動儲存的內容和某個存檔相同時不另外加，目前的角色卡就是那一張；不同時另外加一張「自動儲存的角色卡」
 *   放在最前面、設為目前的角色卡（那是使用者最後看到的內容）；空白的角色卡不搬。
 */
export function migrateLegacy(
  savesJson: string | null,
  autosaveHtml: string | null,
  parse?: (html: string) => Document,
): LegacyMigration | null {
  const blank = sheetFingerprint(newSheet(''));
  const items: LegacySheet[] = [];
  let saves: Record<string, unknown> = {};
  try {
    const v = savesJson ? JSON.parse(savesJson) : {};
    if (v && typeof v === 'object' && !Array.isArray(v)) saves = v as Record<string, unknown>;
  } catch {
    saves = {};
  }
  for (const [name, html] of Object.entries(saves)) {
    if (typeof html !== 'string' || !html.trim()) continue;
    items.push(parseLegacySheet(html, name, parse));
  }
  let currentId = items[0]?.sheet.id ?? '';
  if (autosaveHtml?.trim()) {
    const auto = parseLegacySheet(autosaveHtml, AUTOSAVE_TITLE, parse);
    const fp = sheetFingerprint(auto.sheet);
    const same = items.find((it) => sheetFingerprint(it.sheet) === fp);
    if (same) currentId = same.sheet.id;
    else if (fp !== blank) {
      items.unshift(auto);
      currentId = auto.sheet.id;
    }
  }
  if (!items.length) return null;
  const portraits = new Map<string, LegacyPortrait>();
  for (const it of items) if (it.portrait) portraits.set(it.portrait.assetId, it.portrait);
  return {
    sheets: items.map((it) => it.sheet),
    currentId,
    portraits: [...portraits.values()],
    skipped: items
      .filter((it) => it.skipped.length)
      .map((it) => ({ title: it.sheet.title, items: it.skipped })),
  };
}
