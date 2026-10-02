/**
 * 17 種團報範本（本站自做的版面與裝飾；原作未授權，範本文字一律自寫）。
 * 第 n 種範本的資料部件序列與舊版第 n 種相同（規格 3.2），固定文字（裝飾、括號、分隔、縮排）是新版自己的設計。
 *
 * 範本只負責排列部件；空的資料部件、行尾空白、連續空行由 report.ts 整理（3.5）。
 */
import { type Part, type PartKind, type ReportData, type ReportPlayer, showsSlot } from './parts';

export class ReportBuilder {
  readonly parts: Part[] = [];
  constructor(readonly d: ReportData) {}

  /** 固定文字 */
  t(text: string): this {
    this.parts.push({ kind: 'text', value: text });
    return this;
  }

  /** 資料 */
  v(kind: Exclude<PartKind, 'text'>, value: string): this {
    this.parts.push({ kind, value });
    return this;
  }

  nl(): this {
    return this.t('\n');
  }

  /** 空一行（連續換行最後會縮成最多一個空行） */
  blank(): this {
    return this.t('\n\n');
  }

  /** PC／PL 標題：名字順序 PL 在前時「PL<sep>PC」 */
  header(sep: string): this {
    return this.v('header', this.d.plFirst ? `PL${sep}PC` : `PC${sep}PL`);
  }

  /** 兩個名字（依名字順序） */
  names(p: ReportPlayer, sep: string): this {
    if (this.d.plFirst) return this.v('pl', p.pl).t(sep).v('pc', p.pc);
    return this.v('pc', p.pc).t(sep).v('pl', p.pl);
  }

  /** 標記（＋HO 補充）＋after；標記不寫時什麼都不加，回傳 false */
  slot(p: ReportPlayer, after: string): boolean {
    if (!showsSlot(p.slot)) return false;
    this.v('slot', p.slot);
    if (p.ho) this.t(' ').v('ho', p.ho);
    this.t(after);
    return true;
  }

  /** 每位主持人一行：prefix 身分 sep 名字 */
  gms(sep: string, prefix = ''): this {
    for (const g of this.d.gms) this.t(prefix).v('role', g.role).t(sep).v('gm', g.name).nl();
    return this;
  }

  /** 每位參加者一行：prefix 標記 afterSlot 名字 */
  players(nameSep: string, afterSlot: string, prefix = ''): this {
    for (const p of this.d.players) {
      this.t(prefix);
      this.slot(p, afterSlot);
      this.names(p, nameSep).nl();
    }
    return this;
  }

  /** 每位參加者：標記獨立一行，名字在下一行（indent 開頭） */
  playersSplit(nameSep: string, indent: string, slotPrefix = ''): this {
    for (const p of this.d.players) {
      if (showsSlot(p.slot)) {
        this.t(slotPrefix);
        this.slot(p, '\n');
      }
      this.t(indent).names(p, nameSep).nl();
    }
    return this;
  }

  /** 每位參加者只寫名字 */
  roster(nameSep: string, prefix: string): this {
    for (const p of this.d.players) this.t(prefix).names(p, nameSep).nl();
    return this;
  }

  /** 結果、日期、主題標籤各一行 */
  tail(resultBefore = '', resultAfter = ''): this {
    return this.t(resultBefore)
      .v('result', this.d.result)
      .t(resultAfter)
      .nl()
      .v('date', this.d.date)
      .nl()
      .v('tags', this.d.tags);
  }
}

export interface ReportTemplate {
  id: string;
  /** 選單上的名稱 */
  label: string;
  /** 選單上的第二行說明 */
  description: string;
  build: (b: ReportBuilder) => void;
}

const firstRole = (d: ReportData): string => d.gms[0]?.role ?? 'KP';

const TEMPLATE_LIST = [
  {
    id: 'standard',
    label: '標準',
    description: '好讀的基本款',
    build: (b) => {
      b.v('system', b.d.system).nl().t('《').v('scenario', b.d.scenario).t('》').blank();
      b.gms('｜').blank();
      b.header('／').nl().players(' ／ ', '｜').blank();
      b.v('result', b.d.result).blank().v('date', b.d.date).nl().v('tags', b.d.tags);
    },
  },
  {
    id: 'compact',
    label: '精簡',
    description: '行數少、不寫日期',
    build: (b) => {
      b.t('【').v('system', b.d.system).t('】').nl().v('scenario', b.d.scenario).blank();
      b.gms('：').header('/').nl().players('／', '：').blank();
      b.v('result', b.d.result).nl().v('tags', b.d.tags);
    },
  },
  {
    id: 'sparkle',
    label: '星光框',
    description: '✧･ﾟ 上下兩條星光線',
    build: (b) => {
      const line = '✧･ﾟ･✧･ﾟ･✧･ﾟ･✧･ﾟ･✧';
      b.t(`${line}\n　`).v('system', b.d.system).nl().t('　　').v('scenario', b.d.scenario).blank();
      b.gms('｜', '　');
      b.t('　').header('｜').nl().players('｜', '　', '　');
      b.t('　─ ').v('result', b.d.result).t(' ─').nl().v('date', b.d.date).nl();
      b.t(`${line}\n`).v('tags', b.d.tags);
    },
  },
  {
    id: 'petal',
    label: '花邊框',
    description: '❀ 花朵分隔線包住標題',
    build: (b) => {
      const line = '❀┈┈┈┈┈❀┈┈┈┈┈❀';
      b.t(`${line}\n　`)
        .v('system', b.d.system)
        .nl()
        .t('　『')
        .v('scenario', b.d.scenario)
        .t('』')
        .nl();
      b.t(`${line}\n`).gms('／').blank();
      b.header('/').nl().players(' / ', '：').blank();
      b.tail();
    },
  },
  {
    id: 'moon',
    label: '月夜',
    description: '☾ ☽ 標題線，標記獨立一行',
    build: (b) => {
      b.t('☾ ⋆*･ﾟ:⋆*･ﾟ:⋆*･ﾟ ☽\n ').v('system', b.d.system).nl();
      b.t('　⟪ ').v('scenario', b.d.scenario).t(' ⟫').blank();
      b.gms(' ', ' ').blank();
      b.header('/').nl().playersSplit(' | ', ' └ ', ' ').blank();
      b.tail();
    },
  },
  {
    id: 'block',
    label: '色塊標題',
    description: '■□ 系統 □■',
    build: (b) => {
      b.t('■□ ').v('system', b.d.system).t(' □■').blank();
      b.t('　〈 ').v('scenario', b.d.scenario).t(' 〉').blank();
      b.gms(' ').header('/').nl().players('｜', ' ', '　').blank();
      b.tail();
    },
  },
  {
    id: 'ho-lines',
    label: 'HO 分行',
    description: '標記獨立一行、名字縮排',
    build: (b) => {
      b.v('system', b.d.system).nl().t('〔 ').v('scenario', b.d.scenario).t(' 〕').blank();
      b.gms(' ').header('/').nl().playersSplit(' / ', '　　→ ').blank();
      b.tail('＊ ', ' ＊');
    },
  },
  {
    id: 'duo',
    label: '一對一',
    description: 'KPC 團：只寫第一位主持人與參加者',
    build: (b) => {
      const gm = b.d.gms[0];
      const p = b.d.players[0];
      b.v('system', b.d.system).nl().t('〖 ').v('scenario', b.d.scenario).t(' 〗').blank();
      b.t('▷ ')
        .v('header', 'KPC／KP')
        .nl()
        .t('　')
        .v('gm', gm?.name ?? '')
        .nl();
      b.t('▷ ').header('・').nl().t('　');
      if (p) b.names(p, ' × ');
      b.blank().v('date', b.d.date).nl().v('result', b.d.result).nl().v('tags', b.d.tags);
    },
  },
  {
    id: 'dated',
    label: '日期在上',
    description: '日期寫在劇本下面',
    build: (b) => {
      b.t('⋄ ').v('system', b.d.system).nl().t('⋄ 「').v('scenario', b.d.scenario).t('」').nl();
      b.t('⋄ 日期　').v('date', b.d.date).blank();
      b.gms(' ').header('/').nl().players(' | ', ' ', '▹ ').blank();
      b.t('⋄ ').v('result', b.d.result).nl().v('tags', b.d.tags);
    },
  },
  {
    id: 'bracket',
    label: '粗括號',
    description: '⟦ 劇本 ⟧',
    build: (b) => {
      b.v('system', b.d.system).nl().t('⟦ ').v('scenario', b.d.scenario).t(' ⟧').blank();
      b.gms('：').blank();
      b.header('/').nl().players(' / ', '：').blank();
      b.tail();
    },
  },
  {
    id: 'wave',
    label: '波浪框',
    description: '〜 上下波浪線，標記獨立一行',
    build: (b) => {
      const line = '〜〜〜〜〜〜〜〜〜〜〜〜';
      b.t(`${line}\n　`).v('system', b.d.system).nl().t('　　').v('scenario', b.d.scenario).nl();
      b.t(`${line}\n`).gms(' ').header('/').nl().playersSplit(' / ', '　・').blank();
      b.tail('〜 ', ' 〜');
    },
  },
  {
    id: 'roster',
    label: '名單式',
    description: '┏━┓ 框，不寫標記',
    build: (b) => {
      b.t('┏━━━━━━━━━━━━┓\n　')
        .v('system', b.d.system)
        .nl()
        .t('　')
        .v('scenario', b.d.scenario)
        .nl();
      b.t('┗━━━━━━━━━━━━┛\n').gms(': ').blank();
      b.header('/').nl().roster(' / ', '　').blank();
      b.tail();
    },
  },
  {
    id: 'index',
    label: '目錄式',
    description: '◇ 開頭，參加者接在標題後面',
    build: (b) => {
      b.t('◇ ').v('system', b.d.system).blank().t('〈').v('scenario', b.d.scenario).t('〉').blank();
      b.gms('：', '◇ ');
      b.t('◇ ').header('/').t('：');
      b.d.players.forEach((p, i) => {
        if (i > 0) b.t('\n　　　　　　');
        b.slot(p, ' ');
        b.names(p, ' / ');
      });
      b.blank().tail('◇ ');
    },
  },
  {
    id: 'credit',
    label: '劇本作者款',
    description: '作者寫在劇本下面，不寫標記',
    build: (b) => {
      b.t('▣ ').v('system', b.d.system).nl().t('　').v('scenario', b.d.scenario).nl();
      if (b.d.author) b.t('　').v('author', b.d.author).nl();
      b.nl();
      for (const g of b.d.gms) b.t('▸ ').v('role', g.role).t('\n　').v('gm', g.name).blank();
      b.t('▸ ').header('・').nl().roster(' / ', '　').blank();
      b.tail('　《 ', ' 》');
    },
  },
  {
    id: 'notebook',
    label: '手帳風',
    description: '✎ 條列，身分只寫一次',
    build: (b) => {
      const line = '- - - - - - - - - - - -';
      b.v('system', b.d.system).nl().t('✎ ').v('scenario', b.d.scenario).nl().t(`${line}\n`);
      b.t('● ').v('role', firstRole(b.d)).nl();
      for (const g of b.d.gms) b.t('　- ').v('gm', g.name).nl();
      b.blank().t('● ').header(' & ').nl().players(' / ', ' ', '　- ').blank();
      b.t('● ').v('result', b.d.result).nl().t(`${line} ✐\n`).v('date', b.d.date).nl();
      b.v('tags', b.d.tags);
    },
  },
  {
    id: 'double',
    label: '雙線框',
    description: '╔═╗ 框，不寫 PC／PL 標題',
    build: (b) => {
      b.t('╔════════════╗\n　')
        .v('system', b.d.system)
        .nl()
        .t('　')
        .v('scenario', b.d.scenario)
        .nl();
      b.t('╚════════════╝').blank().gms('：').playersSplit(' / ', '　　').blank();
      b.tail();
    },
  },
  {
    id: 'ribbon',
    label: '蝴蝶結',
    description: 'ʚ 劇本 ɞ，身分只寫一次、不寫標記',
    build: (b) => {
      b.v('system', b.d.system).nl().t('　ʚ ').v('scenario', b.d.scenario).t(' ɞ').blank();
      b.v('role', firstRole(b.d)).t(' ⋯\n');
      for (const g of b.d.gms) b.t('　').v('gm', g.name).nl();
      b.blank().header('/').t(' ⋯\n').roster(' / ', '　').blank();
      b.tail();
    },
  },
] as const satisfies readonly ReportTemplate[];

export type TemplateId = (typeof TEMPLATE_LIST)[number]['id'];

export const TEMPLATES: readonly ReportTemplate[] = TEMPLATE_LIST;

export const TEMPLATE_IDS = TEMPLATE_LIST.map((t) => t.id) as readonly TemplateId[];

export function getTemplate(id: string): ReportTemplate {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}

/** 用某個範本排出部件 */
export function buildParts(id: string, d: ReportData): Part[] {
  const b = new ReportBuilder(d);
  getTemplate(id).build(b);
  return b.parts;
}
