/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 排列方式（原作的 openLayoutPanel：點陣型即時預覽、確定保留、取消還原）與對齊與分佈（openAlignPanel）。
 */
import { useEffect, useRef } from 'react';
import { Button, Dialog, Toggle } from '@/ui';
import { OptionalNumberInput } from '@/ui/OptionalNumberInput';
import { charLevel } from '../../engine/geom';
import { type AlignAction, canDistribute } from '../../logic/align';
import { LAYOUT_KINDS } from '../../model/normalize';
import type { LayoutKind, Sheet } from '../../model/types';
import { align, editSheet, layoutSheet, updateSettings } from '../../state/actions';
import { activeSheet, holdHistory, releaseHistory, setUi, useUi } from '../../state/store';
import { S } from '../../strings';
import { useSheet } from '../hooks';
import { kickSim } from '../sim';

const L = S.layout;

function LayoutBody({ onClose }: { onClose: (keep: boolean) => void }) {
  const sheet = useSheet();
  const s = sheet.settings;
  const picked = useRef<LayoutKind | null>(null);
  const free = sheet.chars.filter((c) => !c.locked);
  const levels = [...new Set(sheet.chars.map((c) => charLevel(c)))].sort((a, b) => b - a);
  const pick = (k: LayoutKind) => {
    picked.current = k;
    layoutSheet(k);
  };
  /* 改了選項：立刻用目前的陣型重排 */
  const reapply = () => layoutSheet(picked.current ?? activeSheet().settings.lastLayout);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{L.hint}</p>
      {free.length ? null : <p className="text-sm text-warning">{L.noChars}</p>}
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4" data-testid="layout-kinds">
        {LAYOUT_KINDS.map((k) => (
          <Button
            key={k}
            size="sm"
            variant={s.lastLayout === k ? 'primary' : 'secondary'}
            disabled={!free.length}
            onClick={() => pick(k)}
            data-testid={`layout-${k}`}
          >
            {S.layouts[k]}
          </Button>
        ))}
      </div>
      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <Toggle
          checked={s.pinFlip}
          onCheckedChange={(v) => {
            updateSettings((d) => {
              d.pinFlip = v;
            });
            reapply();
          }}
          label={L.pinFlip}
        />
        <Toggle
          checked={s.fitLayout}
          onCheckedChange={(v) => {
            updateSettings((d) => {
              d.fitLayout = v;
            });
            reapply();
          }}
          label={L.fitLayout}
        />
        <Toggle
          checked={s.layoutNoStagger}
          onCheckedChange={(v) => {
            updateSettings((d) => {
              d.layoutNoStagger = v;
            });
            reapply();
          }}
          label={L.noStagger}
        />
      </div>
      <details className="rounded-md border border-border px-3 py-2">
        <summary className="cursor-pointer text-sm">{L.wrapCaps}</summary>
        <p className="mt-2 text-xs text-muted">{L.wrapCapsHint}</p>
        {levels.length ? (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {levels.map((lv) => (
              <div key={lv} className="flex items-center gap-2 text-sm">
                <span className="w-20 shrink-0 text-muted">{L.wrapLevel(lv)}</span>
                <OptionalNumberInput
                  size="sm"
                  value={s.wrapCaps[String(lv)] ?? null}
                  min={1}
                  max={999}
                  placeholder={S.char.sizeAuto}
                  aria-label={L.wrapLevel(lv)}
                  onChange={(v) => {
                    updateSettings((d) => {
                      if (v && v >= 1) d.wrapCaps[String(lv)] = Math.round(v);
                      else delete d.wrapCaps[String(lv)];
                    });
                    reapply();
                  }}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted">{L.wrapEmpty}</p>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="mt-2"
          onClick={() => {
            updateSettings((d) => {
              d.wrapCaps = {};
            });
            reapply();
          }}
        >
          {L.wrapReset}
        </Button>
      </details>
      <div className="flex justify-end gap-2">
        <Button onClick={() => onClose(false)} data-testid="layout-cancel">
          {L.cancel}
        </Button>
        <Button variant="primary" onClick={() => onClose(true)} data-testid="layout-ok">
          {L.ok}
        </Button>
      </div>
    </div>
  );
}

export function LayoutDialog() {
  const open = useUi((u) => u.dialog === 'layout');
  const snap = useRef<Sheet | null>(null);
  useEffect(() => {
    if (!open) return;
    snap.current = JSON.parse(JSON.stringify(activeSheet())) as Sheet;
    holdHistory('layout');
    return () => releaseHistory('layout');
  }, [open]);
  const close = (keep: boolean) => {
    const before = snap.current;
    if (!keep && before) {
      editSheet((s) => {
        s.settings = before.settings;
        s.W = before.W;
        s.H = before.H;
        const pos = new Map(before.chars.map((c) => [c.id, c]));
        for (const c of s.chars) {
          const p = pos.get(c.id);
          if (p) {
            c.x = p.x;
            c.y = p.y;
          }
        }
      });
    }
    snap.current = null;
    releaseHistory('layout');
    setUi({ dialog: null });
    if (keep) kickSim(0.5);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close(false)}
      title={L.title}
      size="md"
      placement="right"
    >
      {open ? <LayoutBody onClose={close} /> : null}
    </Dialog>
  );
}

const A = S.align;

const ROWS: { title: string; items: AlignAction[] }[] = [
  { title: A.secAlign, items: ['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom'] },
  { title: A.secDist, items: ['distH', 'distV'] },
  { title: A.secGap, items: ['gapH', 'gapV'] },
];

function AlignBody() {
  const sheet = useSheet();
  const sel = useUi((u) => u.sel);
  const picked = sheet.chars.filter((c) => sel.includes(c.id));
  const targets = picked.length ? picked : sheet.chars;
  const free = targets.filter((c) => !c.locked);
  const canDist = canDistribute(free);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm" data-testid="align-target">
        {picked.length >= 2
          ? A.targetSel(targets.length)
          : picked.length === 1
            ? A.targetOne
            : A.targetCanvas(targets.length)}
      </p>
      {ROWS.map((row) => (
        <section key={row.title} className="flex flex-col gap-1.5">
          <h3 className="text-xs font-semibold text-muted">{row.title}</h3>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {row.items.map((a) => (
              <Button
                key={a}
                size="sm"
                disabled={!free.length || (row.items.length === 2 && !canDist)}
                onClick={() => align(a)}
                data-testid={`align-${a}`}
              >
                {A[a]}
              </Button>
            ))}
          </div>
        </section>
      ))}
      <p className="text-xs text-muted">{A.note}</p>
    </div>
  );
}

export function AlignDialog() {
  const open = useUi((u) => u.dialog === 'align');
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && setUi({ dialog: null })}
      title={A.title}
      size="sm"
      placement="right"
    >
      {open ? <AlignBody /> : null}
    </Dialog>
  );
}
