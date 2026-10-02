/**
 * 文字裝飾（F29）：本站自做的分隔線、單一符號、點綴。label 是按鈕上的短字樣，value 是插入的內容。
 */

export interface Decoration {
  label: string;
  value: string;
}

export interface DecorationGroup {
  id: 'lines' | 'symbols' | 'accents';
  items: readonly Decoration[];
}

const same = (s: string): Decoration => ({ label: s, value: s });

export const DECORATIONS: readonly DecorationGroup[] = [
  {
    id: 'lines',
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
    id: 'symbols',
    items: [
      ...['◆', '◇', '■', '□', '▶', '▷', '●', '○', '★', '☆', '✦', '✧', '✿', '❀'].map(same),
      ...['❖', '◎', '※', '†', '‡', '☾', '☽', '♪', '♡', '⚔', '⚀', '⚅', '➤'].map(same),
      { label: '└', value: '└ ' },
    ],
  },
  {
    id: 'accents',
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
