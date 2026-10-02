/**
 * 自訂組合（F55～F58）：把目前的整體調色存成一組（名稱空白時自動取「自訂組合 N」），點名稱套用、刪除前確認。
 * 存在瀏覽器（localStorage），不受「全部重設」與「清除作業」影響。
 */
import { Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  Button,
  type ConfirmOptions,
  IconButton,
  Section,
  TextInput,
  type ToastOptions,
} from '@/ui';
import { type GlobalAdjust, sanitizeAdjust } from './adjust';
import { sanitizePresets, usePresets } from './store';
import { S } from './strings';

let seq = 0;
const presetId = () => `preset-${Date.now().toString(36)}-${(++seq).toString(36)}`;

export function PresetsSection({
  current,
  onApply,
  toast,
  confirm,
}: {
  current: GlobalAdjust;
  onApply: (g: GlobalAdjust) => void;
  toast: (o: ToastOptions) => void;
  confirm: (o: ConfirmOptions) => Promise<boolean>;
}) {
  const raw = usePresets((s) => s.data.list);
  const list = sanitizePresets(raw);
  const [name, setName] = useState('');
  const note = (title: string) => toast({ title, tone: 'success', replace: true, duration: 2500 });

  const save = () => {
    const trimmed = name.trim();
    const n = trimmed || S.presetDefaultName(list.length + 1);
    usePresets.getState().patch({
      list: [...list, { id: presetId(), name: n, global: structuredClone(current) }],
    });
    setName('');
    note(S.presetSaved(n));
  };

  return (
    <Section title={S.presets} description={S.presetHint} persistKey="psd-studio:presets">
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <TextInput
            aria-label={S.presetName}
            value={name}
            placeholder={S.presetPlaceholder}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                save();
              }
            }}
          />
          <Button icon={<Save />} onClick={save}>
            {S.presetSave}
          </Button>
        </div>
        {list.length ? (
          <ul
            aria-label={S.presets}
            className="m-0 flex max-h-44 list-none flex-col gap-1 overflow-y-auto p-0"
            data-testid="preset-list"
          >
            {list.map((p) => (
              <li key={p.id} className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  className="min-w-0 flex-1 justify-start"
                  aria-label={S.presetApply(p.name)}
                  onClick={() => {
                    onApply(sanitizeAdjust(p.global, 'global'));
                    note(S.presetApplied(p.name));
                  }}
                >
                  <span className="truncate">{p.name}</span>
                </Button>
                <IconButton
                  label={S.presetDelete(p.name)}
                  icon={<Trash2 />}
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    const ok = await confirm({
                      title: S.presetDeleteTitle(p.name),
                      danger: true,
                      confirmLabel: '刪除',
                    });
                    if (!ok) return;
                    usePresets.getState().patch({
                      list: sanitizePresets(usePresets.getState().data.list).filter(
                        (x) => x.id !== p.id,
                      ),
                    });
                    note(S.presetDeleted(p.name));
                  }}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-xs text-muted">{S.presetEmpty}</p>
        )}
      </div>
    </Section>
  );
}
