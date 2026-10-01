/**
 * ② 立繪與效果（規格 F08～F10）：預設集清單（縮圖、名稱、刪除）＋編輯區。
 */
import { ItemListEditor, Section } from '@/ui';
import { addPreset, removePreset } from './actions';
import { Thumb } from './controls';
import type { ImageInputState } from './ImageSection';
import { combosOfPreset, type Preset } from './model';
import { PresetEditor } from './PresetEditor';
import { comboNames } from './StepUsers';
import { useImages, useTachie, useView } from './store';
import { S } from './strings';

function PresetThumb({ preset }: { preset: Preset }) {
  const src = useImages((s) => (preset.image ? (s.map[preset.image] ?? null) : null));
  return (
    <Thumb
      src={src}
      alt={preset.image ? preset.name || S.presets.unnamed : S.presets.noImageLabel}
      empty={preset.image ? '…' : S.presets.noImage}
    />
  );
}

/** 編輯中的預設集：沒有選或已刪掉時用第一個 */
export function useEditingPreset(): Preset | null {
  const presets = useTachie((s) => s.data.presets);
  const editingId = useView((s) => s.data.editingId);
  return presets.find((p) => p.id === editingId) ?? presets[0] ?? null;
}

export function StepLook({
  input,
  onInputChange,
}: {
  input: ImageInputState;
  onInputChange: (patch: Partial<ImageInputState>) => void;
}) {
  const data = useTachie((s) => s.data);
  const editing = useEditingPreset();
  return (
    <>
      <Section title={S.listTitle(S.presets.listTitle, data.presets.length)} fixed>
        <ItemListEditor<Preset>
          aria-label={S.presets.listLabel}
          items={data.presets}
          getId={(p) => p.id}
          getName={(p) => p.name}
          placeholder={S.presets.unnamed}
          selectedId={editing?.id ?? null}
          onSelect={(id) => useView.getState().patch({ editingId: id })}
          onAdd={addPreset}
          addLabel={S.presets.add}
          renderLeading={(p) => <PresetThumb preset={p} />}
          onRemove={(id) => {
            const wasEditing = editing?.id === id;
            removePreset(id);
            /* 刪的是編輯中的那個：改編輯第一個 */
            if (wasEditing)
              useView
                .getState()
                .patch({ editingId: useTachie.getState().data.presets[0]?.id ?? null });
          }}
          confirmRemove={(p) => {
            const combos = comboNames(data, combosOfPreset(data, p.id));
            return {
              title: S.presets.removeTitle(p.name.trim() || S.presets.unnamed),
              description: combos.length ? S.removeCombos(combos) : S.removeNoCombos,
              confirmLabel: S.removeConfirm,
              danger: true,
            };
          }}
          emptyText={S.presets.empty}
        />
      </Section>
      {editing ? (
        <PresetEditor
          key={editing.id}
          preset={editing}
          input={input}
          onInputChange={onInputChange}
        />
      ) : (
        <p
          className="m-0 rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted"
          data-testid="editor-empty"
        >
          {S.presets.editEmpty}
        </p>
      )}
    </>
  );
}
