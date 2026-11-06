/**
 * 5e 的規則內容的出處與署名文（頁面上「關於規則內容」的對話框用）。署名文照原文（英文），各資料夾的 LICENSE.txt
 * 另有完整的出處、授權與本站的變更（建置時列進 THIRD_PARTY_NOTICES）。
 */

export type SrdSourceId = 'srd52' | 'srd51' | 'lgmrd';

export interface SrdSource {
  id: SrdSourceId;
  /** 名稱（顯示用） */
  name: string;
  url: string;
  license: string;
  licenseUrl: string;
  /** 原文要求的署名（英文，照原文；原文是連結的地方把網址寫在括號裡） */
  attribution: string;
}

export const CC_BY_40 = 'https://creativecommons.org/licenses/by/4.0/';

export const SRD_SOURCES: Readonly<Record<SrdSourceId, SrdSource>> = {
  srd52: {
    id: 'srd52',
    name: 'System Reference Document 5.2.1（SRD 5.2.1）',
    url: 'https://www.dndbeyond.com/srd',
    license: 'CC BY 4.0',
    licenseUrl: CC_BY_40,
    attribution:
      'This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.',
  },
  srd51: {
    id: 'srd51',
    name: 'System Reference Document 5.1（SRD 5.1）',
    url: 'https://dnd.wizards.com/resources/systems-reference-document',
    license: 'CC BY 4.0',
    licenseUrl: CC_BY_40,
    attribution:
      'This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.',
  },
  lgmrd: {
    id: 'lgmrd',
    name: "Lazy GM's 5e Monster Builder Resource Document",
    url: 'https://slyflourish.com/lazy_5e_monster_building_resource_document.html',
    license: 'CC BY 4.0',
    licenseUrl: CC_BY_40,
    attribution:
      "This work includes material taken from the Lazy GM's 5e Monster Builder Resource Document (https://slyflourish.com/lazy_5e_monster_building_resource_document.html) written by Teos Abadía of Alphastream.org (https://alphastream.org), Scott Fitzgerald Gray of Insaneangel.com (https://insaneangel.com), and Michael E. Shea of SlyFlourish.com (https://slyflourish.com), available under a Creative Commons Attribution 4.0 International License (http://creativecommons.org/licenses/by/4.0/).",
  },
};

/** 每個出處都要附的一句（本站的翻譯與修改） */
export const SRD_TRANSLATION_NOTE =
  '本站把上面的內容翻譯成繁體中文，並有摘要、改寫與改成計算的修改；翻譯與修改依 CC BY 4.0 提供。本站與這些文件的權利人沒有關係，也沒有得到他們的認可。';
