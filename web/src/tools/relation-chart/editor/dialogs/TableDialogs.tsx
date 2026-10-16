/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 貼上關係表、複製關係表（規格 3.6；原作的 openPasteTablePanel、openCopyTablePanel），以及開啟範例。
 */
import { useMemo, useRef, useState } from 'react';
import { copyText } from '@/core/files';
import { Button, Dialog, TextArea, useToast } from '@/ui';
import { buildSample, SAMPLES } from '../../logic/samples';
import { buildRelTable, parseRelTable, planImport } from '../../logic/table';
import { addSample, importTable } from '../../state/actions';
import { setUi, useUi } from '../../state/store';
import { S } from '../../strings';
import { useSheet } from '../hooks';
import { kickSim } from '../sim';

const P = S.pasteTable;

function PasteBody({ onDone }: { onDone: () => void }) {
  const sheet = useSheet();
  const toast = useToast();
  const [text, setText] = useState('');
  const parsed = useMemo(() => (text.trim() ? parseRelTable(text) : null), [text]);
  const plan = useMemo(
    () => (parsed?.rows.length ? planImport(parsed, sheet.chars, sheet.types) : null),
    [parsed, sheet.chars, sheet.types],
  );
  const apply = () => {
    if (!parsed?.rows.length) return;
    const n = importTable(parsed);
    kickSim(0.7);
    toast({ title: P.done(n), tone: 'success' });
    onDone();
  };
  let preview = '';
  if (parsed && !parsed.rows.length) preview = P.none;
  else if (parsed && plan) {
    preview = P.preview(plan.links.length, plan.newNames.length, plan.relLabels.length);
    if (plan.existingUsed) preview += P.reuse(plan.existingUsed);
    if (parsed.bad.length) preview += P.skip(parsed.bad.length);
    if (parsed.header) preview += P.header;
  }
  const relList = plan?.relLabels.length
    ? P.relList(
        plan.relLabels.slice(0, 8).join('、') +
          (plan.relLabels.length > 8 ? P.relMore(plan.relLabels.length) : ''),
      )
    : '';
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{P.hint}</p>
      <TextArea
        rows={8}
        value={text}
        placeholder={P.ph}
        aria-label={P.label}
        onChange={(e) => setText(e.target.value)}
        className="font-mono text-sm"
        autoFocus
        data-testid="paste-text"
      />
      {preview ? (
        <p className="text-sm" data-testid="paste-preview">
          {preview}
        </p>
      ) : null}
      {relList ? <p className="text-xs text-muted">{relList}</p> : null}
      {plan?.similar.map(([a, b]) => (
        <p key={`${a}\u0000${b}`} className="text-xs text-warning">
          {P.similar(a, b)}
        </p>
      ))}
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>{P.cancel}</Button>
        <Button
          variant="primary"
          disabled={!parsed?.rows.length}
          onClick={apply}
          data-testid="paste-apply"
        >
          {P.apply}
        </Button>
      </div>
    </div>
  );
}

export function PasteTableDialog() {
  const open = useUi((u) => u.dialog === 'paste');
  const close = () => setUi({ dialog: null });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()} title={P.title} size="md">
      {open ? <PasteBody onDone={close} /> : null}
    </Dialog>
  );
}

const C = S.copyTable;

function CopyBody() {
  const sheet = useSheet();
  const toast = useToast();
  const area = useRef<HTMLTextAreaElement>(null);
  const [manual, setManual] = useState(false);
  const t = useMemo(() => buildRelTable(sheet.chars, sheet.rels, sheet.types), [sheet]);
  if (!t.lines) return <p className="text-sm text-muted">{C.empty}</p>;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{C.hint}</p>
      <TextArea
        ref={area}
        readOnly
        rows={8}
        value={t.text}
        aria-label={C.label}
        className="font-mono text-sm"
        onFocus={(e) => e.currentTarget.select()}
        data-testid="copy-text"
      />
      <p className="text-sm">
        {C.stat(t.lines)}
        {t.both ? C.both(t.both) : ''}
      </p>
      {manual ? <p className="text-xs text-warning">{C.manual}</p> : null}
      <div className="flex justify-end">
        <Button
          variant="primary"
          onClick={async () => {
            if (await copyText(t.text)) toast({ title: C.copied, tone: 'success' });
            else {
              setManual(true);
              area.current?.select();
            }
          }}
          data-testid="copy-do"
        >
          {C.copy}
        </Button>
      </div>
    </div>
  );
}

export function CopyTableDialog() {
  const open = useUi((u) => u.dialog === 'copy');
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && setUi({ dialog: null })}
      title={C.title}
      size="md"
    >
      {open ? <CopyBody /> : null}
    </Dialog>
  );
}

export function SamplesDialog() {
  const open = useUi((u) => u.dialog === 'samples');
  const toast = useToast();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && setUi({ dialog: null })}
      title={S.samples.title}
      description={S.samples.note}
      size="md"
    >
      <ul className="grid gap-2 sm:grid-cols-2" data-testid="samples">
        {SAMPLES.map((s) => (
          <li key={s.key}>
            <button
              type="button"
              className="flex h-full w-full flex-col gap-1 rounded-md border border-border bg-surface-2 p-3 text-left hover:border-accent"
              onClick={() => {
                addSample(buildSample(s.key));
                setUi({ dialog: null });
                toast({ title: S.samples.added(s.name), tone: 'success' });
              }}
              data-testid={`sample-${s.key}`}
            >
              <span className="font-semibold">{s.name}</span>
              <span className="text-xs text-muted">{s.desc}</span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
