/**
 * 每種類型的代表色（F17：新版自訂，12 色可分辨）。深色、淺色主題各一組：
 * 當文字用在卡片底色（surface、surface-2、bg）上對比都至少 4.5:1（單元測試檢查）；
 * 實心醒目（目前類型、目前的篩選）時的文字色用 readableTextColor。
 * 色相大致平均分布：紅、橙、金、黃綠、綠、青綠、青、天藍、靛、紫、粉紅，備忘是灰色。
 */
import { readableTextColor } from '@/core/color';
import type { Theme } from '@/ui';
import type { CardType } from './logic';

export const TYPE_COLORS: Readonly<Record<Theme, Readonly<Record<CardType, string>>>> = {
  dark: {
    scene: '#9aa5ff',
    location: '#74d38a',
    document: '#e6c15c',
    npc: '#f2a067',
    skill: '#f5857f',
    memo: '#b0b4bc',
    item: '#5fcfe3',
    rule: '#b7d65c',
    ho1: '#f48fca',
    ho2: '#5fd6b5',
    ho3: '#79b6f7',
    ho4: '#c8a2f7',
  },
  light: {
    scene: '#3f4fc9',
    location: '#1e7a37',
    document: '#7d5d00',
    npc: '#a24d0c',
    skill: '#c0262d',
    memo: '#5c6370',
    item: '#0a6f82',
    rule: '#557008',
    ho1: '#b0256f',
    ho2: '#0d7a60',
    ho3: '#1b62b5',
    ho4: '#7240b5',
  },
};

/** 填滿代表色時上面的文字色 */
export const onTypeColor = (color: string): string => readableTextColor(color);
