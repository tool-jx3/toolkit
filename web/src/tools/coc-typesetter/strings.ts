/**
 * CoC 劇本排版工具的介面文字（台灣繁體中文，用詞照 DESIGN.md 第 5 節）。
 * 紙面上的固定文字（標籤、「未命名劇本」…）也在這裡（PAPER）。
 */

import type { ThemeId } from './model';
import type { BoxKind } from './syntax';

export const PAPER_TEXT = {
  desc: '描述',
  untitled: '未命名劇本',
  author: '作者',
  toc: '目錄',
  coverMark: 'TRPG SCENARIO',
  tocMark: 'CONTENTS',
  cont: '（續）',
  fallbackTitle: '劇本',
  boxLabels: {
    kp: 'KP 資訊',
    pl: '公開資訊',
    note: '補充',
    warn: '注意',
  } satisfies Record<BoxKind, string>,
};

export const THEME_NAMES: Record<ThemeId, string> = {
  mono: '黑白（省墨）',
  antique: '舊書',
  night: '深夜',
};

export const S = {
  toolbar: {
    label: '工具列',
    paper: '紙張',
    theme: '配色',
    options: '紙面選項',
    zoom: '顯示比例',
    fit: '符合寬度',
    custom: (z: number) => `${Math.round(z * 100)}%`,
    newDoc: '新建',
    help: '寫法說明',
    saveHtml: '儲存列印用 HTML',
    print: '列印成 PDF',
    printTitle: '開啟列印對話框，目的地選「另存為 PDF」',
    saveHtmlTitle: '下載只有紙面的 HTML 檔，打開後列印也能做出一樣的 PDF',
    fold: '設定',
    pane: '顯示',
    paneEdit: '編輯',
    panePreview: '預覽',
  },
  options: {
    cover: '封面',
    toc: '目錄',
    chapter: '每章換頁',
    header: '書眉',
  },
  editor: {
    region: '編輯區',
    tabs: '編輯的內容',
    tabText: '內文',
    tabMeta: '封面與概要',
    slashHint: '在行首按',
    slashHint2: '開啟格式選單',
    foldButtons: '格式按鈕',
    buttons: '插入格式',
    buttonsHint: '先選取文字再按，會用該格式包住選取的行',
    label: '劇本內文',
    placeholder: '在這裡寫劇本的內文。\n在行首按「/」，可以選擇章標題、描述、檢定等格式。',
    menu: '插入格式',
    menuEmpty: '沒有符合的格式',
  },
  meta: {
    title: '標題',
    titlePlaceholder: '劇本標題',
    subtitle: '副標題',
    subtitlePlaceholder: '例：克蘇魯神話 TRPG 短篇劇本',
    author: '作者',
    authorPlaceholder: '作者名稱',
    items: '概要（排在封面上，由上往下依序顯示）',
    key: '項目',
    value: '內容',
    up: '上移',
    down: '下移',
    remove: '刪除',
    add: '新增項目',
    hint1: '在內文開頭貼上以「---」包住的封面資訊（每行「標題: ○○」這樣寫），會自動讀進這裡。',
    hint2: '內容裡也可以寫【技能名】。比較長的內容會自動佔一整行。',
  },
  preview: {
    region: '紙面',
    tip: '點一下紙面，就會跳到內文的對應位置',
  },
  status: {
    chars: (n: number) => `字數 ${n.toLocaleString('en-US')} 字`,
    heads: (all: number, ch: number, sc: number) => `標題 ${all} 個（章 ${ch}、探索點 ${sc}）`,
    pages: (paper: string, n: number) => `${paper}・共 ${n} 頁`,
    over: (n: number) => `有放不進一頁的內容（${n} 頁，以紅框標出）`,
    saveFailed: '無法自動存檔（瀏覽器的儲存空間已滿或被封鎖），請另外保存內文。',
  },
  errors: {
    layout: (m: string) => `排版時發生錯誤：${m}`,
  },
  confirm: {
    newTitle: '建立新的劇本？',
    newDesc:
      '目前的內文、封面與概要會全部清除（紙張、配色等設定會保留）。需要的話，請先用「儲存列印用 HTML」留一份備份。',
    newOk: '清除並新建',
    sampleTitle: '讀入範例劇本？',
    sampleDesc: '範例劇本會取代目前的內文、封面與概要。',
    sampleOk: '讀入範例',
  },
  toast: {
    absorbed: '已把封面資訊讀進「封面與概要」分頁',
    newDone: '已建立新的劇本，可以從標題開始輸入',
    sampleDone: '已讀入範例劇本',
    saved: (name: string) => `已儲存 ${name}`,
  },
  help: {
    title: '寫法說明',
    sample: '讀入範例劇本（取代目前的內文與封面資訊）',
  },
  shortcuts: {
    group: '格式選單',
    open: '在行首開啟格式選單',
    move: '選擇上一個／下一個格式',
    insert: '插入選擇的格式',
    close: '關閉格式選單',
    print: '列印成 PDF（只印紙面）',
    output: '輸出',
  },
};
