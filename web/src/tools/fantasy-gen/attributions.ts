/**
 * 規則內容的出處與署名文（照原文，不翻譯）：畫面上的「關於規則內容與授權」與 data/ 底下各資料夾的 LICENSE.txt 寫的是同一份。
 */
import type { SourceId } from './generators';

export interface Attribution {
  id: SourceId;
  /** 名稱（畫面上的小標題） */
  name: string;
  url: string;
  /** 照原文的署名文 */
  statement: string;
}

export const CC_BY_4 = {
  name: 'CC BY 4.0（創用 CC 姓名標示 4.0 國際）',
  url: 'https://creativecommons.org/licenses/by/4.0/legalcode',
} as const;

export const CC0 = {
  name: 'CC0 1.0',
  url: 'https://creativecommons.org/publicdomain/zero/1.0/',
} as const;

export const ATTRIBUTIONS: readonly Attribution[] = [
  {
    id: 'srd52',
    name: 'System Reference Document 5.2（SRD 5.2）',
    url: 'https://www.dndbeyond.com/srd',
    statement:
      'This work includes material from the System Reference Document 5.2 (“SRD 5.2”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.',
  },
  {
    id: 'srd51',
    name: 'System Reference Document 5.1（SRD 5.1）',
    url: 'https://dnd.wizards.com/resources/systems-reference-document',
    statement:
      'This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.',
  },
  {
    id: 'bfrd',
    name: 'Black Flag Reference Document 1.0（BFRD 1.0）',
    url: 'https://koboldpress.com/Black-Flag-Roleplaying',
    statement:
      'This work includes material taken from the Black Flag Reference Document 1.0 (“BFRD 1.0”) by Kobold Press and available at https://koboldpress.com/Black-Flag-Roleplaying. The BFRD 1.0 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.',
  },
  {
    id: '5eadb',
    name: '5e Artisanal Database（產生器的共用詞：狀態、來源、小東西、地點、生物類型）',
    url: 'https://github.com/mshea/lazy_gm_tools',
    statement:
      'This work includes material taken from the 5e Artisanal Database by Michael E. Shea of SlyFlourish.com, available under a Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/',
  },
];

/** 靈感來源（頁尾也有）與程式的授權 */
export const UPSTREAM = {
  name: 'Sly Flourish／lazy_gm_tools（5e Artisanal Database）',
  url: 'https://github.com/mshea/lazy_gm_tools',
} as const;
