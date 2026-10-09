/**
 * 新增地圖（規格 F003）：網格種類、六角格的方向、對齊網格、名稱 → 建立並開啟。
 */
import { useEffect, useRef, useState } from 'react';
import { composeMapGridType, type HexOrientation, type MapGridType } from '@/core/grid';
import { Button, Dialog, Field, Segmented, TextInput, Toggle } from '@/ui';
import { S } from './strings';

/** 「地圖 2026/10/8」 */
export function todayLabel(d = new Date()): string {
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export interface NewMapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string, gridType: MapGridType) => void | Promise<void>;
}

export function NewMapDialog({ open, onOpenChange, onCreate }: NewMapDialogProps) {
  const [kind, setKind] = useState<'square' | 'hex'>('square');
  const [orientation, setOrientation] = useState<HexOrientation>('flat');
  const [fit, setFit] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setKind('square');
    setOrientation('flat');
    setFit(false);
    setName(S.list.defaultName(todayLabel()));
    setError('');
    setBusy(false);
  }, [open]);

  const submit = async () => {
    const v = name.trim();
    if (!v) {
      setError(S.list.nameRequired);
      nameRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      await onCreate(v.slice(0, 60), composeMapGridType(kind, orientation, fit));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={S.newMap.title}
      description={S.newMap.fixedNote}
      initialFocus={nameRef}
      footer={
        <Button variant="primary" onClick={() => void submit()} loading={busy}>
          {S.newMap.create}
        </Button>
      }
    >
      <div className="flex flex-col gap-3" data-testid="new-map-dialog">
        <Field label={S.newMap.kind} hint={S.newMap.kindHints[kind]}>
          <Segmented
            value={kind}
            onValueChange={setKind}
            fullWidth
            options={(['square', 'hex'] as const).map((v) => ({
              value: v,
              label: S.newMap.kinds[v],
            }))}
          />
        </Field>
        {kind === 'hex' ? (
          <>
            <Field label={S.newMap.orientation} hint={S.newMap.orientationHints[orientation]}>
              <Segmented
                value={orientation}
                onValueChange={setOrientation}
                fullWidth
                options={(['flat', 'pointy'] as const).map((v) => ({
                  value: v,
                  label: S.newMap.orientations[v],
                }))}
              />
            </Field>
            <Field label={S.newMap.fit} hint={S.newMap.fitHint} layout="inline">
              <Toggle checked={fit} onCheckedChange={setFit} />
            </Field>
          </>
        ) : null}
        <Field label={S.newMap.name} error={error || undefined}>
          <TextInput
            ref={nameRef}
            value={name}
            maxLength={60}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void submit();
              }
            }}
          />
        </Field>
      </div>
    </Dialog>
  );
}
