/**
 * 文字裝飾（F29、F57、F58）：本站自做的分隔線、括號、單一符號、點綴，依類型分頁。
 * label 是按鈕上的短字樣，value 是插入的內容；括號的 value／close 是包住選取文字的左右兩邊。
 *
 * 插入方式依類型（mode）：
 * - line：分隔線自成一行插入（前後不是換行時補換行，P11 新增）
 * - wrap：用括號包住選取的文字；沒有選取時插入一對括號、游標在中間（P11 新增）
 * - insert：在游標位置插入（取代選取的文字）
 */

export interface Decoration {
  label: string;
  value: string;
  /** 括號的右邊（mode 為 wrap 時才有） */
  close?: string;
}

export type DecorationGroupId = 'lines' | 'brackets' | 'symbols' | 'accents';

export interface DecorationGroup {
  id: DecorationGroupId;
  mode: 'line' | 'wrap' | 'insert';
  items: readonly Decoration[];
}

const same = (s: string): Decoration => ({ label: s, value: s });
const pair = (open: string, close: string, label = `${open.trim()}…${close.trim()}`) => ({
  label,
  value: open,
  close,
});

export const DECORATIONS: readonly DecorationGroup[] = [
  {
    id: 'lines',
    mode: 'line',
    items: [
      { label: '━━━━', value: '━━━━━━━━━━━━━━' },
      { label: '┄┄┄┄', value: '┄┄┄┄┄┄┄┄┄┄┄┄┄┄' },
      { label: '═ ✦ ═', value: '══════ ✦ ══════' },
      { label: '✧ ─ ✧', value: '·˚ ✧ ──────── ✧ ˚·' },
      { label: '⋆｡°✩', value: '⋆｡°✩ ⋆｡°✩ ⋆｡°✩ ⋆｡°✩' },
      { label: '❀ ┈ ❀', value: '❀ ┈┈┈┈┈┈┈┈┈┈ ❀' },
      { label: '▸▹▸▹', value: '▸▹▸▹▸▹▸▹▸▹▸▹▸▹' },
      { label: '◆◇◆◇', value: '◆◇◆◇◆◇◆◇◆◇◆◇' },
      { label: '〰〰', value: '〰〰〰〰〰〰〰〰〰' },
      { label: '⊱ ✾ ⊰', value: '⊱ ────── ✾ ────── ⊰' },
      { label: '☾ ⋯ ☽', value: '☾ ⋯⋯⋯⋯⋯⋯⋯⋯ ☽' },
      { label: '♠♥♦♣', value: '♠ ♥ ♦ ♣ ♠ ♥ ♦ ♣' },
      { label: '⚀⚁⚂', value: '⚀ ⚁ ⚂ ⚃ ⚄ ⚅' },
    ],
  },
  {
    id: 'brackets',
    mode: 'wrap',
    items: [
      pair('「', '」'),
      pair('『', '』'),
      pair('【', '】'),
      pair('〔', '〕'),
      pair('《', '》'),
      pair('〈', '〉'),
      pair('（', '）'),
      pair('［', '］'),
      pair('〖', '〗'),
      pair('✦ ', ' ✦', '✦ … ✦'),
      pair('꒰ ', ' ꒱', '꒰ … ꒱'),
      pair('── ', ' ──', '── … ──'),
    ],
  },
  {
    id: 'symbols',
    mode: 'insert',
    items: [
      ...['◆', '◇', '■', '□', '▶', '▷', '●', '○', '★', '☆', '✦', '✧', '✿', '❀'].map(same),
      ...['❖', '◎', '※', '†', '‡', '☾', '☽', '♪', '♡', '⚔', '⚀', '⚅', '➤'].map(same),
      { label: '└', value: '└ ' },
    ],
  },
  {
    id: 'accents',
    mode: 'insert',
    items: [
      same('✧˖°'),
      same('⋆⁺₊⋆ ☾ ⋆⁺₊⋆'),
      same('‧₊˚✩彡'),
      same('｡ﾟ✧'),
      same('꒰ ✿ ꒱'),
      same('ʚ ♡ ɞ'),
      same('༺ ✦ ༻'),
      same('⊹ ࣪ ˖'),
      same('ᴄʟᴇᴀʀ!!'),
      same('ᴛʜᴀɴᴋ ʏᴏᴜ!'),
      same('ɢᴏᴏᴅ ɢᴀᴍᴇ'),
      same('🎲 ⋆ 🎲'),
    ],
  },
];

export const DECORATION_GROUP_IDS: readonly DecorationGroupId[] = DECORATIONS.map((g) => g.id);
