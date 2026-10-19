/**
 * 文件分頁的「變數」（F255、F256；原作 v3.8.0～v3.9.0）：手冊與本文的 HO＋數字（唯讀）、登錄的變數、
 * 原稿裡寫到、還沒登錄的名稱。
 */
import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button, IconButton, Section, TextInput } from '@/ui';
import { isVarName, varCandidates, varList } from '../model/vars';
import { edit, holdStatus, releaseStatus, say, ui, useDoc } from '../store';
import { S } from '../strings';

/** 放開變數名稱的錯誤訊息（7.3：名稱還錯著時自動儲存不蓋掉它） */
function releaseVarHold(): void {
  const h = ui().status?.hold;
  if (h?.startsWith('var:')) releaseStatus(h);
}

/** 新增的一列的名稱欄（畫好之後聚焦） */
function focusName(i: number): void {
  requestAnimationFrame(() =>
    document.querySelector<HTMLInputElement>(`[data-var-name="${i}"]`)?.focus(),
  );
}

export function VarsSection() {
  const d = useDoc((s) => s.data);
  const list = useMemo(() => varList(d), [d]);
  const cands = useMemo(() => varCandidates(d), [d]);
  const regs = d.vars ?? [];
  const derived = list.filter((v) => v.src !== 'reg');
  /* 離開過的名稱欄（空白的名稱離開之後才標紅） */
  const [touched, setTouched] = useState<ReadonlySet<number>>(new Set());
  useEffect(() => releaseVarHold, []);
  const setVar = (i: number, k: 'n' | 'def' | 'note', v: string) => {
    if (k === 'n' && isVarName(v.trim())) releaseStatus(`var:${i}`);
    edit((x) => {
      const r = x.vars?.[i];
      if (r) r[k] = v;
    });
  };
  const checkName = (i: number) => {
    setTouched((t) => new Set(t).add(i));
    const n = String(regs[i]?.n ?? '').trim();
    if (!isVarName(n)) holdStatus(`var:${i}`, S.vars.badName);
    else if (
      regs.some((v, j) => j !== i && String(v.n).trim() === n) ||
      derived.some((v) => v.n === n)
    )
      say(S.vars.dupName, 'warn');
  };
  const add = (n = '') => {
    const i = regs.length;
    edit((x) => {
      if (!Array.isArray(x.vars)) x.vars = [];
      x.vars.push({ n, def: '', note: '' });
    });
    if (n) say(S.vars.registered(n));
    else focusName(i);
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
        {derived.map((v) => (
          <p key={v.n} className="m-0 flex items-baseline gap-2 text-xs text-muted">
            <code className="font-mono text-accent">{`{${v.n}}`}</code>
            <span>{v.src === 'ho' ? S.vars.fromHo(v.ttl ?? '') : S.vars.fromText}</span>
          </p>
        ))}
        {regs.length ? (
          <div className="grid grid-cols-[6rem_1fr_auto] gap-1 text-xs text-muted" aria-hidden>
            <span>{S.vars.name}</span>
            <span>{S.vars.def}</span>
          </div>
        ) : null}
        {regs.map((v, i) => {
          const n = String(v.n ?? '').trim();
          const bad = (n !== '' || touched.has(i)) && !isVarName(n);
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: 變數沒有 id，依登錄的順序
            <div key={i} className="grid grid-cols-[6rem_1fr_auto] gap-1" data-var-row={i}>
              <TextInput
                value={v.n}
                invalid={bad}
                data-var-name={i}
                aria-label={`變數 ${i + 1} 的${S.vars.name}`}
                placeholder={S.vars.namePlaceholder}
                onChange={(e) => setVar(i, 'n', e.target.value)}
                onBlur={() => checkName(i)}
              />
              <TextInput
                value={v.def}
                aria-label={`變數 ${i + 1} 的${S.vars.def}`}
                placeholder={S.vars.defPlaceholder}
                onChange={(e) => setVar(i, 'def', e.target.value)}
              />
              <IconButton
                size="sm"
                variant="ghost"
                label={S.vars.remove(n)}
                icon={<X />}
                onClick={() => remove(i)}
              />
              <TextInput
                className="col-span-3"
                value={v.note}
                aria-label={`變數 ${i + 1} 的${S.vars.note}`}
                placeholder={S.vars.notePlaceholder}
                onChange={(e) => setVar(i, 'note', e.target.value)}
              />
            </div>
          );
        })}
        {!derived.length && !regs.length ? (
          <p className="m-0 text-xs text-muted">{S.vars.none}</p>
        ) : null}
        <div>
          <Button size="sm" variant="secondary" onClick={() => add()}>
            {S.vars.add}
          </Button>
        </div>
        {cands.length ? (
          <div className="flex flex-col gap-1" data-testid="se-var-found">
            <p className="m-0 text-xs text-warning">{S.vars.found}</p>
            <div className="flex flex-wrap gap-1">
              {cands.map((n) => (
                <Button key={n} size="sm" variant="secondary" onClick={() => add(n)}>
                  {`＋ {${n}}`}
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
