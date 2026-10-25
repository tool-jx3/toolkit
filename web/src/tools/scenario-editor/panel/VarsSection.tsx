/**
 * 文件分頁的「變數」（F255、F256；原作 v3.8.0～v3.9.0）：手冊的編號、登錄的變數、本文寫到的 HO＋數字，
 * 依匯出時的順序列成一張表，每一列都可以直接改（第三批，上游 v3.10.2；F307）：
 * 手冊的列改手冊的編號（離開欄位時檢查）、預設值、說明；自動的列填了預設值或說明就變成登錄的變數。
 * 最後是原稿裡寫到、還沒登錄的名稱。
 */
import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button, IconButton, Section, TextInput } from '@/ui';
import { allBlocks, findBlock } from '../model/blocks';
import { ensureHo, hoNote, hoOf, isVarName, varCandidates, varList } from '../model/vars';
import { edit, holdStatus, releaseStatus, say, ui, useDoc } from '../store';
import { S } from '../strings';

/** 放開變數名稱的錯誤訊息（7.3：名稱還錯著時自動儲存不蓋掉它） */
function releaseVarHold(): void {
  const h = ui().status?.hold;
  if (h?.startsWith('var:')) releaseStatus(h);
}

/** 畫好之後聚焦某一列的某個欄位（游標放在最後） */
function focusField(row: string, k: 'n' | 'def' | 'note'): void {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLInputElement>(
      `[data-var-row="${CSS.escape(row)}"] [data-vk="${k}"]`,
    );
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  });
}

interface Row {
  /** r<登錄的第幾個>、h<手冊 id>、a<名稱> */
  key: string;
  kind: 'reg' | 'ho' | 'auto';
  n: string;
  def: string;
  note: string;
  /** 欄位裡淡淡顯示的字 */
  defPh: string;
  notePh: string;
  cap?: string;
  tip?: string;
  /** 登錄的第幾個（reg） */
  i?: number;
  /** 手冊的 id（ho） */
  id?: string;
}

export function VarsSection() {
  const d = useDoc((s) => s.data);
  const list = useMemo(() => varList(d), [d]);
  const cands = useMemo(() => varCandidates(d), [d]);
  const regs = d.vars ?? [];
  /* 離開過的名稱欄（空白的名稱離開之後才標紅） */
  const [touched, setTouched] = useState<ReadonlySet<number>>(new Set());
  /* 手冊編號打到一半（離開欄位時才檢查、寫進原稿） */
  const [hoDraft, setHoDraft] = useState<Record<string, string>>({});
  useEffect(() => releaseVarHold, []);

  const rows: Row[] = [];
  const shown = new Set<number>();
  for (const v of list) {
    if (v.src === 'ho' && v.id) {
      const b = findBlock(d, v.id)?.b;
      const h = b ? hoOf(b) : { no: v.n, ttl: '', def: '', note: '' };
      rows.push({
        key: `h${v.id}`,
        kind: 'ho',
        n: v.n,
        def: String(h.def ?? ''),
        note: String(h.note ?? ''),
        defPh: v.n,
        notePh: hoNote(h.ttl),
        cap: S.vars.hoRow(v.n, h.ttl),
        tip: S.vars.hoRowTip,
        id: v.id,
      });
    } else if (v.src === 'auto') {
      rows.push({
        key: `a${v.n}`,
        kind: 'auto',
        n: v.n,
        def: '',
        note: '',
        defPh: v.n,
        notePh: v.note,
        cap: S.vars.autoRow(v.n),
        tip: S.vars.autoRowTip,
      });
    } else {
      const i = regs.findIndex((x) => String(x.n ?? '').trim() === v.n);
      if (i < 0) continue;
      shown.add(i);
      rows.push({
        key: `r${i}`,
        kind: 'reg',
        n: regs[i].n,
        def: regs[i].def,
        note: regs[i].note,
        defPh: S.vars.defPlaceholder,
        notePh: S.vars.notePlaceholder,
        i,
      });
    }
  }
  /* 還沒有名稱、名稱不能用的登錄也列在後面（可以改） */
  regs.forEach((v, i) => {
    if (shown.has(i)) return;
    rows.push({
      key: `r${i}`,
      kind: 'reg',
      n: v.n,
      def: v.def,
      note: v.note,
      defPh: S.vars.defPlaceholder,
      notePh: S.vars.notePlaceholder,
      i,
    });
  });

  const setReg = (i: number, k: 'n' | 'def' | 'note', v: string) => {
    if (k === 'n' && isVarName(v.trim())) releaseStatus(`var:${i}`);
    edit((x) => {
      const r = x.vars?.[i];
      if (r) r[k] = v;
    });
  };
  const setHo = (id: string, k: 'def' | 'note', v: string) =>
    edit((x) => {
      const b = findBlock(x, id)?.b;
      if (b) ensureHo(b)[k] = v;
    });
  /* 自動的列：填了就登錄（同一列接著改登錄的那一個） */
  const setAuto = (n: string, k: 'def' | 'note', v: string) => {
    const i = regs.length;
    edit((x) => {
      if (!Array.isArray(x.vars)) x.vars = [];
      x.vars.push({ n, def: k === 'def' ? v : '', note: k === 'note' ? v : '' });
    });
    focusField(`r${i}`, k);
  };
  const checkName = (i: number) => {
    setTouched((t) => new Set(t).add(i));
    const n = String(regs[i]?.n ?? '').trim();
    if (!isVarName(n)) holdStatus(`var:${i}`, S.vars.badName);
    else if (
      regs.some((v, j) => j !== i && String(v.n).trim() === n) ||
      list.some((v) => v.src !== 'reg' && v.n === n)
    )
      say(S.vars.dupName, 'warn');
  };
  /* 手冊的編號：符合規則、沒有重複時才改；不行時回到原來的編號（狀態列說明） */
  const commitHo = (id: string) => {
    const v = hoDraft[id];
    setHoDraft(({ [id]: _drop, ...rest }) => rest);
    if (v == null) return;
    const nv = v.trim();
    const hb = findBlock(d, id)?.b;
    if (!hb || nv === hoOf(hb).no) return;
    if (!isVarName(nv)) {
      say(S.vars.hoNoBad, 'err');
      return;
    }
    if (allBlocks(d).some((x) => x.id !== id && x.type === 'handout' && hoOf(x).no === nv)) {
      say(S.handout.noDup, 'err');
      return;
    }
    edit((x) => {
      const b = findBlock(x, id)?.b;
      if (b) ensureHo(b).no = nv;
    });
  };
  const add = (n = '') => {
    const i = regs.length;
    edit((x) => {
      if (!Array.isArray(x.vars)) x.vars = [];
      x.vars.push({ n, def: '', note: '' });
    });
    if (n) say(S.vars.registered(n));
    else focusField(`r${i}`, 'n');
  };
  const remove = (i: number) => {
    releaseVarHold();
    edit((x) => {
      x.vars?.splice(i, 1);
    });
    setTouched(new Set());
  };
  return (
    <Section title={S.vars.title} fixed description={S.vars.description}>
      <div className="flex flex-col gap-1" data-testid="se-vars">
        {rows.length ? (
          <div className="grid grid-cols-[6rem_1fr_auto] gap-1 text-xs text-muted" aria-hidden>
            <span>{S.vars.name}</span>
            <span>{S.vars.def}</span>
          </div>
        ) : null}
        {rows.map((r) => {
          const n = String(r.n ?? '').trim();
          const bad = r.kind === 'reg' && (n !== '' || touched.has(r.i ?? -1)) && !isVarName(n);
          const nameLabel = r.kind === 'ho' ? S.handout.no : S.vars.name;
          const what = r.kind === 'reg' ? `變數 ${(r.i ?? 0) + 1} ` : `{${r.n}}`;
          return (
            <div
              key={r.key}
              className="grid grid-cols-[6rem_1fr_auto] gap-1"
              data-var-row={r.key}
              data-var-kind={r.kind}
              title={r.tip}
            >
              {r.cap ? (
                <p className="col-span-3 m-0 text-xs text-muted">
                  <code className="font-mono text-accent">{r.cap}</code>
                </p>
              ) : null}
              <TextInput
                value={r.kind === 'ho' ? (hoDraft[r.id ?? ''] ?? r.n) : r.n}
                invalid={bad}
                readOnly={r.kind === 'auto'}
                data-vk="n"
                data-var-name={r.kind === 'reg' ? r.i : undefined}
                aria-label={`${what}的${nameLabel}`}
                placeholder={S.vars.namePlaceholder}
                onChange={(e) => {
                  if (r.kind === 'reg' && r.i != null) setReg(r.i, 'n', e.target.value);
                  else if (r.kind === 'ho' && r.id) {
                    const id = r.id;
                    const v = e.target.value;
                    setHoDraft((x) => ({ ...x, [id]: v }));
                  }
                }}
                onBlur={() => {
                  if (r.kind === 'reg' && r.i != null) checkName(r.i);
                  else if (r.kind === 'ho' && r.id) commitHo(r.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && r.kind === 'ho' && r.id) commitHo(r.id);
                }}
              />
              <TextInput
                value={r.def}
                data-vk="def"
                aria-label={`${what}的${S.vars.def}`}
                placeholder={r.defPh}
                onChange={(e) => {
                  const v = e.target.value;
                  if (r.kind === 'reg' && r.i != null) setReg(r.i, 'def', v);
                  else if (r.kind === 'ho' && r.id) setHo(r.id, 'def', v);
                  else if (v) setAuto(r.n, 'def', v);
                }}
              />
              {r.kind === 'reg' && r.i != null ? (
                <IconButton
                  size="sm"
                  variant="ghost"
                  label={S.vars.remove(n)}
                  icon={<X />}
                  onClick={() => remove(r.i as number)}
                />
              ) : (
                <span />
              )}
              <TextInput
                className="col-span-3"
                value={r.note}
                data-vk="note"
                aria-label={`${what}的${S.vars.note}`}
                placeholder={r.notePh}
                onChange={(e) => {
                  const v = e.target.value;
                  if (r.kind === 'reg' && r.i != null) setReg(r.i, 'note', v);
                  else if (r.kind === 'ho' && r.id) setHo(r.id, 'note', v);
                  else if (v) setAuto(r.n, 'note', v);
                }}
              />
            </div>
          );
        })}
        {!rows.length ? <p className="m-0 text-xs text-muted">{S.vars.none}</p> : null}
        <div>
          <Button size="sm" variant="secondary" onClick={() => add()}>
            {S.vars.add}
          </Button>
        </div>
        {cands.length ? (
          <div className="flex flex-col gap-1" data-testid="se-var-found">
            <p className="m-0 text-xs text-warning">{S.vars.found}</p>
            <div className="flex flex-wrap gap-1">
              {cands.map((c) => (
                <Button key={c} size="sm" variant="secondary" onClick={() => add(c)}>
                  {`＋ {${c}}`}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        <p className="m-0 text-xs text-muted">{S.vars.rule}</p>
      </div>
    </Section>
  );
}
