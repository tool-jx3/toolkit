/**
 * 作用在「文字欄裡選取的文字」的操作：注音（F070）、註解（F072）、文字顏色（F074）、巢狀書式按鈕（F078）。
 * 最後聚焦的文字欄（文字欄、規則框的內容欄、彈出視窗裡的文字欄、表格名稱欄）記在 lastField；
 * 按設定欄的按鈕時焦點會離開，但選取範圍還留在那個欄位上。
 */
import { bridge } from './bridge';
import { findBlock } from './model/blocks';
import { appendMarkLine, RICH_TYPES, richApply } from './model/rich';
import { cellHead, cellWrite } from './model/table';
import { addComment, setBlockText, setMarkColor } from './model/text';
import { doc, edit, editBlock, say, ui } from './store';
import { S } from './strings';

interface LastField {
  el: HTMLTextAreaElement | HTMLInputElement;
  /** 段落 id */
  id: string;
  /** 表格名稱欄 */
  name: boolean;
  /** 儲存格的欄位（設定欄、寬視窗）："r,c" */
  cell?: string;
}

let last: LastField | null = null;
let bound = false;

/** 開始追蹤最後聚焦的文字欄（App 掛載時呼叫一次） */
export function trackFields(): void {
  if (bound || typeof document === 'undefined') return;
  bound = true;
  /*
   * 在文字欄裡按 Esc＝結束輸入：記住的選取範圍跟著作廢（原作在 Esc 時重畫文字欄，選取範圍就不見了），
   * 之後按注音、註解、顏色、巢狀書式不再作用在看不到的範圍（F070、F072、F074、F078）。
   * 用捕獲階段，在欄位自己處理 Esc（blur、選取段落）之前就作廢；輸入法選字中的 Esc 不算。
   */
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && !e.isComposing && last && e.target === last.el) last = null;
    },
    true,
  );
  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (t instanceof HTMLTextAreaElement && t.dataset.bid)
      last = { el: t, id: t.dataset.bid, name: false };
    else if (t instanceof HTMLInputElement && t.dataset.tname)
      last = { el: t, id: t.dataset.tname, name: true };
    else if (
      (t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement) &&
      t.dataset.cellOf
    )
      last = { el: t, id: t.dataset.cellOf, name: false, cell: t.dataset.cell };
  });
}

export interface ActiveField {
  el: HTMLTextAreaElement | HTMLInputElement;
  id: string;
  name: boolean;
  cell?: string;
  a: number;
  z: number;
}

/** 最後聚焦、而且還在畫面上、屬於選取段落（或正在輸入）的文字欄 */
export function activeField(): ActiveField | null {
  if (!last?.el.isConnected) return null;
  const s = ui();
  if (!s.sel.includes(last.id) && s.focusId !== last.id) return null;
  const a = last.el.selectionStart ?? 0;
  const z = last.el.selectionEnd ?? a;
  return { ...last, a: Math.min(a, z), z: Math.max(a, z) };
}

function restore(f: ActiveField, a: number, z: number): void {
  requestAnimationFrame(() => {
    if (!f.el.isConnected) return;
    f.el.focus({ preventScroll: true });
    f.el.setSelectionRange(a, z);
  });
}

/** 注音（F070）：選取的文字包成 ｜文字《》，游標放進《》；沒有選取時插入 ｜《》 */
export function addRuby(): void {
  const f = activeField();
  if (!f || f.name || f.cell) {
    say(S.status.rubyNoField, 'warn');
    return;
  }
  const b = findBlock(doc(), f.id)?.b;
  if (!b) return;
  const t = String(b.text ?? '');
  const picked = t.slice(f.a, f.z).replace(/[\r\n｜|《》]/g, '');
  const ins = `｜${picked}《》`;
  const next = t.slice(0, f.a) + ins + t.slice(f.z);
  editBlock(f.id, (x) => setBlockText(x, next));
  const c = picked ? f.a + ins.length - 1 : f.a + 1;
  restore(f, c, c);
}

/** 加上註解（F072） */
export async function addCommentToSelection(): Promise<void> {
  const f = activeField();
  if (f?.name) {
    say(S.status.cmtNameField, 'warn');
    return;
  }
  if (!f || f.cell || f.z <= f.a) {
    say(S.status.cmtNoRange, 'warn');
    return;
  }
  const r = await bridge.prompt({
    title: '加上註解',
    label: '註解的內容',
    multiline: true,
    confirmLabel: '加上',
  });
  const text = r?.value.trim();
  if (!text) return;
  editBlock(f.id, (b) => addComment(b, f.a, f.z, text));
  say(S.status.cmtAdded);
  restore(f, f.a, f.z);
}

/** 文字顏色（F074）：有選取文字時只改那一段（空字串＝拿掉），否則整段 */
export function applyColor(color: string): void {
  const f = activeField();
  if (f?.name) {
    say(S.status.colorNameField, 'warn');
    return;
  }
  if (f && !f.cell && f.z > f.a) {
    editBlock(f.id, (b) => setMarkColor(b, f.a, f.z, color));
    say(S.status.colorSet);
    restore(f, f.a, f.z);
    return;
  }
  const ids = ui().sel;
  if (!ids.length) {
    say(S.status.noSelection, 'warn');
    return;
  }
  edit((d) => {
    for (const id of ids) {
      const b = findBlock(d, id)?.b;
      if (b) b.col = color;
    }
  });
  say(S.status.colorSet);
}

/**
 * 巢狀書式按鈕（F078）：文字欄有游標時照 3.4.4 套用，沒有游標時在段落最後加一行。
 * 表格：作用在目標儲存格的文字。
 */
export function applyRichMark(mark: string, label: string): void {
  const s = ui();
  const id = s.sel[0];
  const b = id ? findBlock(doc(), id)?.b : null;
  if (!b) {
    say(S.status.noSelection, 'warn');
    return;
  }
  if (b.type === 'table') {
    const cell = s.cell && s.cell.tbl === b.id ? s.cell : null;
    if (!cell || !b.tbl) {
      say('請先點一下要套用的儲存格。', 'warn');
      return;
    }
    const f = activeField();
    const key = `${cell.r},${cell.c}`;
    const cur = String(cellHead(b.tbl, cell.r, cell.c) ?? '');
    const useSel = f?.cell === key && f.id === b.id;
    const r = useSel
      ? richApply(cur, f.a, f.z, mark)
      : richApply(cur, cur.length, cur.length, mark);
    editBlock(b.id, (x) => {
      if (x.tbl) cellWrite(x.tbl, cell.r, cell.c, r.text);
    });
    if (useSel && f) restore(f, r.a, r.z);
    say(`已在第 ${cell.r + 1} 列第 ${cell.c + 1} 欄加上「${label}」`);
    return;
  }
  if (!RICH_TYPES.includes(b.type)) {
    say('這個書式不能用巢狀書式。', 'warn');
    return;
  }
  const f = activeField();
  if (f && f.id === b.id && !f.name && !f.cell && document.activeElement === f.el) {
    const t = String(b.text ?? '');
    const r = richApply(t, f.a, f.z, mark);
    editBlock(b.id, (x) => setBlockText(x, r.text));
    restore(f, r.a, r.z);
    return;
  }
  if (f && f.id === b.id && !f.name && !f.cell) {
    /* 剛剛還在文字欄裡（按按鈕時焦點離開）：照游標位置 */
    const t = String(b.text ?? '');
    const r = richApply(t, f.a, f.z, mark);
    editBlock(b.id, (x) => setBlockText(x, r.text));
    restore(f, r.a, r.z);
    return;
  }
  editBlock(b.id, (x) => setBlockText(x, appendMarkLine(String(x.text ?? ''), mark)));
}

/** 巢狀書式按鈕（11 個；F078） */
export const RICH_BUTTONS: readonly { mark: string; label: string }[] = [
  { mark: '- ', label: '條列' },
  { mark: '1. ', label: '編號' },
  { mark: '- [ ] ', label: '選項' },
  { mark: '  - ', label: '縮排' },
  { mark: '■', label: '小標' },
  { mark: '◇', label: '次小標' },
  { mark: '※', label: '注釋' },
  { mark: '> 技能：', label: '檢定框' },
  { mark: '「」', label: '對話' },
  { mark: '|項目|內容|', label: '表格' },
  { mark: '＠', label: '彈出視窗' },
];
