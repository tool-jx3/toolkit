/**
 * 預設表情組（F30）：本工具自己設計的 20 組組合與標籤，涵蓋喜、怒、哀、驚、羞與面無表情等常見情緒。
 * 每組都有標籤、顯示文字、勾選。部件 id 對應 parts.ts 的內建部件。
 */
import type { PartSelection } from './logic';

export interface Preset extends PartSelection {
  label: string;
}

const p = (
  label: string,
  eyes: string,
  brows: string,
  mouth: string,
  decorations: string[] = [],
): Preset => ({ label, eyes, brows, mouth, decorations });

export const PRESETS: readonly Preset[] = [
  /* 喜 */
  p('開心！', 'eyes-smile', 'brows-normal', 'mouth-grin', ['deco-blush']),
  p('微笑', 'eyes-normal', 'brows-normal', 'mouth-smile'),
  p('哈哈哈', 'eyes-squeeze', 'brows-normal', 'mouth-wide'),
  p('哼哼～', 'eyes-closed', 'brows-normal', 'mouth-smug'),
  p('嘿嘿', 'eyes-wink', 'brows-normal', 'mouth-tongue'),
  p('好期待！', 'eyes-sparkle', 'brows-normal', 'mouth-grin', ['deco-blush']),
  p('好喜歡～', 'eyes-heart', 'brows-normal', 'mouth-cat', ['deco-blush']),
  /* 怒 */
  p('生氣了！', 'eyes-sharp', 'brows-angry', 'mouth-frown', ['deco-anger']),
  p('給我站住！', 'eyes-sharp', 'brows-angry', 'mouth-wide', ['deco-tint-red', 'deco-anger']),
  p('哼！', 'eyes-normal', 'brows-angry', 'mouth-pout', ['deco-wrinkle']),
  /* 哀 */
  p('嗚嗚……', 'eyes-normal', 'brows-worried', 'mouth-frown', ['deco-tears']),
  p('哇啊啊！', 'eyes-squeeze', 'brows-worried', 'mouth-wide', ['deco-tears']),
  p('完蛋了……', 'eyes-dull', 'brows-worried', 'mouth-line', ['deco-tint-black', 'deco-despair']),
  /* 驚 */
  p('咦？', 'eyes-dot', 'brows-normal', 'mouth-open'),
  p('怎麼會！', 'eyes-dot', 'brows-worried', 'mouth-wide', ['deco-tint-blue', 'deco-sweat-one']),
  p('糟糕……', 'eyes-normal', 'brows-worried', 'mouth-line', ['deco-sweat-many']),
  /* 羞 */
  p('好害羞……', 'eyes-closed', 'brows-worried', 'mouth-pout', ['deco-blush']),
  /* 其他 */
  p('呵呵呵……', 'eyes-sharp', 'brows-flat', 'mouth-smug', ['deco-shadow']),
  p('……', 'eyes-dull', 'brows-flat', 'mouth-line'),
  p('噁……', 'eyes-dull', 'brows-angry', 'mouth-frown', ['deco-tint-purple', 'deco-under-nose']),
];
