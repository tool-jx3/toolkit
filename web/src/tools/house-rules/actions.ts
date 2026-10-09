/**
 * 修改房規表的動作（按鈕、快捷鍵、手勢共用）。每個動作是一步復原（打字時 400 ms 內的連續變更合成一步）。
 */
import {
  applyPreset,
  type CustomRow,
  categoryItems,
  clampNum,
  LIMITS,
  newId,
  type PresetId,
  type TableInfo,
} from './model';
import {
  type CategoryId,
  type CustomValue,
  type Edition,
  SECTION_BY_ID,
  type SectionId,
} from './rules';
import { collapseKey, useRules, useView } from './store';

const update = (...args: Parameters<ReturnType<typeof useRules.getState>['update']>) =>
  useRules.getState().update(...args);

export function setEdition(edition: Edition): void {
  if (useRules.getState().data.edition === edition) return;
  update((d) => {
    d.edition = edition;
  });
}

export function setInfo(key: keyof TableInfo, value: string): void {
  update((d) => {
    d.info[key] = value;
  });
}

export function runPreset(preset: PresetId): void {
  useRules.getState().replace(applyPreset(useRules.getState().data, preset));
}

/* ---------- 內建規則 ---------- */

const ruleDef = (secId: SectionId, ruleId: string) =>
  SECTION_BY_ID[secId].rules.find((r) => r.id === ruleId);

/**
 * 點選項：已選的再點一次＝未設定（放不放進表不變）；選別的＝設成那個選項並放進表
 * （帶數字的選項：還沒有數字時用預設值）。
 */
export function toggleOption(secId: SectionId, ruleId: string, optId: string): void {
  const def = ruleDef(secId, ruleId);
  if (!def) return;
  update((d) => {
    const row = d.secs[secId].rows[ruleId];
    if (row.val === optId) {
      row.val = null;
      return;
    }
    row.val = optId;
    const op = def.opts.find((x) => x.id === optId);
    if (op?.num && !Number.isFinite(row.n)) row.n = op.num.def;
    row.vis = true;
  });
}

export function setNumber(secId: SectionId, ruleId: string, value: number): void {
  const def = ruleDef(secId, ruleId);
  update((d) => {
    const row = d.secs[secId].rows[ruleId];
    const op = def?.opts.find((x) => x.id === row.val);
    if (!op?.num || !Number.isFinite(value)) return;
    row.n = clampNum(value, op.num.min, op.num.max);
  });
}

/** 改名：空白或和原本的名稱一樣時回到原本的名稱 */
export function setRuleName(secId: SectionId, ruleId: string, value: string): void {
  const def = ruleDef(secId, ruleId);
  if (!def) return;
  const v = Array.from(value).slice(0, LIMITS.name).join('');
  update((d) => {
    const row = d.secs[secId].rows[ruleId];
    const t = v.trim();
    if (!t || t === def.name) delete row.name;
    else row.name = v;
  });
}

export function resetRuleName(secId: SectionId, ruleId: string): void {
  update((d) => {
    delete d.secs[secId].rows[ruleId].name;
  });
}

export function setNote(secId: SectionId, id: string, custom: boolean, value: string): void {
  const v = Array.from(value).slice(0, LIMITS.note).join('');
  update((d) => {
    const row = custom ? d.secs[secId].custom.find((c) => c.id === id) : d.secs[secId].rows[id];
    if (row) row.note = v;
  });
}

export function setVisible(secId: SectionId, id: string, custom: boolean, vis: boolean): void {
  update((d) => {
    const row = custom ? d.secs[secId].custom.find((c) => c.id === id) : d.secs[secId].rows[id];
    if (row) row.vis = vis;
  });
}

/** 分類裡全部放進表（已經全部在表上時改成全部拿掉） */
export function toggleCategory(secId: SectionId, catId: CategoryId): void {
  const items = categoryItems(useRules.getState().data, secId, catId);
  if (!items.length) return;
  const vis = !items.every((i) => i.row.vis);
  update((d) => {
    const sec = SECTION_BY_ID[secId];
    for (const r of sec.rules) if (r.cat === catId) d.secs[secId].rows[r.id].vis = vis;
    for (const c of d.secs[secId].custom) if (c.cat === catId) c.vis = vis;
  });
}

/* ---------- 自己加的規則 ---------- */

/** 加在分類最後面（預設 ○、放進表）；回傳新的 id。分類收合時展開 */
export function addCustom(secId: SectionId, catId: CategoryId): string | null {
  if (useRules.getState().data.secs[secId].custom.length >= LIMITS.custom) return null;
  const item: CustomRow = {
    id: newId(),
    cat: catId,
    name: '',
    val: 'o',
    text: '',
    note: '',
    vis: true,
  };
  update((d) => {
    d.secs[secId].custom.push(item);
  });
  setCollapsed(secId, catId, false);
  return item.id;
}

export function removeCustom(secId: SectionId, id: string): void {
  update((d) => {
    const list = d.secs[secId].custom;
    const i = list.findIndex((c) => c.id === id);
    if (i >= 0) list.splice(i, 1);
  });
}

export function setCustomName(secId: SectionId, id: string, value: string): void {
  const v = Array.from(value).slice(0, LIMITS.name).join('');
  update((d) => {
    const c = d.secs[secId].custom.find((x) => x.id === id);
    if (c) c.name = v;
  });
}

export function setCustomText(secId: SectionId, id: string, value: string): void {
  const v = Array.from(value).slice(0, LIMITS.text).join('');
  update((d) => {
    const c = d.secs[secId].custom.find((x) => x.id === id);
    if (c) c.text = v;
  });
}

/** 自訂規則的值：已選的再點一次＝未設定；選別的＝設成那個並放進表 */
export function toggleCustomValue(secId: SectionId, id: string, value: CustomValue): void {
  update((d) => {
    const c = d.secs[secId].custom.find((x) => x.id === id);
    if (!c) return;
    if (c.val === value) {
      c.val = null;
      return;
    }
    c.val = value;
    c.vis = true;
  });
}

/* ---------- 畫面狀態（不列入復原） ---------- */

export function setCollapsed(secId: SectionId, catId: CategoryId, collapsed: boolean): void {
  const key = collapseKey(secId, catId);
  const cur = !!useView.getState().data.collapsed[key];
  if (cur === collapsed) return;
  useView.getState().update((v) => {
    if (collapsed) v.collapsed[key] = true;
    else delete v.collapsed[key];
  });
}
