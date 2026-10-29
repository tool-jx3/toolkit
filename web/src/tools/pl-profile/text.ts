/**
 * 純文字輸出（規格 F36～F38、3.4）：貼到 Discord 或揪團貼文用。
 * 一般：【標題】、・項目；Discord：**標題**、・**欄位**：內容（Discord 的粗體）。
 */
import { LEVELS, type ProfileData } from './model';
import { OUT } from './strings';
import { jiraiView, profileHasContent, profileView } from './view';

export type TextStyle = 'plain' | 'discord';

export interface TextOptions {
  style: TextStyle;
  profile: boolean;
  jirai: boolean;
  /** 地雷表只列 ng、ask 兩級 */
  issuesOnly: boolean;
}

/** 系統的一行：系統名稱（熟悉程度・可以 KP・補充） */
export function systemText(s: { name: string; level: string; kp: boolean; note: string }): string {
  const bits = [s.level, s.kp ? OUT.canKp : '', s.note].filter(Boolean);
  return `${s.name}（${bits.join('・')}）`;
}

/** 經驗的一行：PL 熟手／KP 新手（補充） */
export function experienceText(e: { pl: string; kp: string; note: string }): string {
  const parts = [e.pl ? `PL ${e.pl}` : '', e.kp ? `KP ${e.kp}` : ''].filter(Boolean);
  const main = parts.join('／');
  if (!e.note) return main;
  return main ? `${main}（${e.note}）` : e.note;
}

/** 主題與補充：PC 死亡（事前說一聲就好） */
export const topicText = (label: string, note: string): string =>
  note ? `${label}（${note}）` : label;

/** Discord 的 markdown 字元（\ * _ ~ | `）前面加反斜線 */
export const escapeDiscordInline = (text: string): string =>
  text.replace(/[\\*_~|`]/g, (c) => `\\${c}`);

/** 行首會變成標題、引用、清單的寫法（# > - 數字.）跳脫 */
export const escapeDiscordLineStart = (line: string): string =>
  line.replace(/^(\s*)(#|>|-|\d+\.)/, (_m, sp: string, mark: string) =>
    mark.endsWith('.') ? `${sp}${mark.slice(0, -1)}\\.` : `${sp}\\${mark}`,
  );

/** 使用者寫的多行文字：Discord 時每一行都跳脫 */
const escapeDiscordBlock = (text: string): string =>
  text
    .split('\n')
    .map((l) => escapeDiscordLineStart(escapeDiscordInline(l)))
    .join('\n');

export function toText(d: ProfileData, o: TextOptions): string {
  const discord = o.style === 'discord';
  /* 使用者寫的字：Discord 時跳脫 markdown，一般時原樣 */
  const u = (text: string) => (discord ? escapeDiscordInline(text) : text);
  const block = (text: string) => (discord ? escapeDiscordBlock(text) : text);
  const heading = (s: string) => (discord ? `**${s}**` : `【${s}】`);
  const field = (name: string, value: string) =>
    `${OUT.bullet}${discord ? `**${name}**` : name}：${value}`;
  const blocks: string[] = [];

  if (o.profile) {
    const v = profileView(d);
    if (profileHasContent(v)) {
      const lines: string[] = [heading(OUT.profileTitle)];
      const name = v.nickname ? u(v.nickname) : OUT.noName;
      const nameLine = v.handle ? `${name}（${u(v.handle)}）` : name;
      lines.push(discord ? escapeDiscordLineStart(nameLine) : nameLine);
      if (v.tagline) lines.push(`「${u(v.tagline)}」`);
      if (v.age) lines.push(field(OUT.fields.age, v.age));
      if (v.experience)
        lines.push(
          field(
            OUT.fields.experience,
            experienceText({ ...v.experience, note: u(v.experience.note) }),
          ),
        );
      if (v.systems.length)
        lines.push(
          field(
            OUT.fields.systems,
            v.systems
              .map((x) => systemText({ ...x, name: u(x.name), note: u(x.note) }))
              .join(OUT.sep),
          ),
        );
      for (const g of v.tags) {
        const items = g.items.map(u).join(OUT.sep);
        const note = u(g.note);
        const value = note ? (items ? `${items}（${note}）` : note) : items;
        lines.push(field(g.title, value));
      }
      if (v.contacts.length)
        lines.push(
          field(
            OUT.fields.contact,
            v.contacts.map((c) => [u(c.kind), u(c.value)].filter(Boolean).join(' ')).join('／'),
          ),
        );
      if (v.avatarCredit) lines.push(field(OUT.fields.avatar, u(v.avatarCredit)));
      if (v.memo) {
        lines.push(`${OUT.bullet}${discord ? `**${OUT.fields.memo}**` : OUT.fields.memo}：`);
        lines.push(block(v.memo));
      }
      blocks.push(lines.join('\n'));
    }
  }

  if (o.jirai) {
    const j = jiraiView(d, { issuesOnly: o.issuesOnly });
    if (j.any || j.memo) {
      const nick = d.profile.nickname.trim();
      const lines: string[] = [heading(nick ? OUT.jiraiOf(u(nick)) : OUT.jiraiTitle)];
      if (j.mode === 'level') {
        for (const g of j.groups) {
          const level = g.level ?? 'ok';
          const items = g.items.map((it) => topicText(u(it.label), u(it.note))).join(OUT.sep);
          const head = `${OUT.symbols[level]} ${OUT.levels[level]}`;
          lines.push(`${discord ? `**${head}**` : head}：${items}`);
        }
      } else {
        if (j.any) lines.push(LEVELS.map((l) => `${OUT.symbols[l]} ${OUT.levels[l]}`).join('　'));
        for (const g of j.groups) {
          lines.push(discord ? `**▼ ${u(g.title)}**` : `▼ ${g.title}`);
          for (const it of g.items)
            lines.push(`${OUT.symbols[it.level]} ${topicText(u(it.label), u(it.note))}`);
        }
      }
      if (j.memo) {
        lines.push(`${discord ? `**${OUT.jiraiMemo}**` : OUT.jiraiMemo}：`);
        lines.push(block(j.memo));
      }
      blocks.push(lines.join('\n'));
    }
  }

  return blocks.join('\n\n');
}
