/**
 * 「角色」分頁：房間網址（F85）、角色清單（F86～F91）。
 */
import { Copy, Eye, Link2 } from 'lucide-react';
import { Button, Field, ItemListEditor, Section, TextInput } from '@/ui';
import { copyCharacterCss, copyCharacterUrl } from '../actions';
import { GestureColor, useS } from '../controls';
import { characterHint, characterSourceUrl, nextCharacterColor } from '../logic';
import type { Character } from '../settings';
import { setSetting, usePreview, useSettings } from '../store';
import { S } from '../strings';

let seq = 0;
const newId = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`;

function updateChar(id: string, patch: Partial<Character>): void {
  useSettings.getState().update((d) => {
    const c = d.characters.find((x) => x.id === id);
    if (c) Object.assign(c, patch);
  });
}

const HINTS = { id: S.chars.hintId, room: S.chars.hintRoom, name: S.chars.hintName } as const;

export function CharactersPanel() {
  const s = useS();
  const target = usePreview((st) => st.data.target);
  return (
    <div className="flex flex-col gap-3">
      <Section title={S.chars.roomSection} persistKey="status-bar:room">
        <Field label={S.chars.room} hint={S.chars.roomHint}>
          <TextInput
            value={s.room}
            placeholder={S.chars.roomPlaceholder}
            spellCheck={false}
            onChange={(e) => setSetting('room', e.target.value)}
          />
        </Field>
      </Section>
      <Section title={S.chars.listTitle} persistKey="status-bar:chars">
        <ItemListEditor<Character>
          aria-label={S.chars.listLabel}
          items={s.characters}
          getId={(c) => c.id}
          getName={(c) => c.name}
          placeholder={S.chars.unnamed}
          renameLabel={S.chars.name}
          onRename={(id, name) => updateChar(id, { name })}
          onAdd={() =>
            useSettings.getState().update((d) => {
              d.characters.push({
                id: newId(),
                name: '',
                color: nextCharacterColor(d.characters.length),
                ref: '',
              });
            })
          }
          addLabel={S.chars.add}
          onRemove={(id) => {
            useSettings.getState().update((d) => {
              d.characters = d.characters.filter((c) => c.id !== id);
            });
            if (usePreview.getState().data.target === id)
              usePreview.getState().patch({ target: 'example' });
          }}
          emptyText={S.chars.empty}
          renderLeading={(c) => (
            <span
              aria-hidden
              className="block size-4 rounded-full border border-border-strong"
              style={{ background: c.color }}
            />
          )}
          renderDetails={(c) => {
            const hint = characterHint(c, s.room);
            const label = c.name.trim() || S.chars.unnamed;
            const url = characterSourceUrl(c, s.room);
            return (
              <div className="flex min-w-0 flex-col gap-2">
                <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-2">
                  <span className="text-xs text-muted">{S.chars.color}</span>
                  <GestureColor
                    aria-label={`${S.chars.color}（${label}）`}
                    value={c.color}
                    onChange={(color) => updateChar(c.id, { color })}
                  />
                  <span className="text-xs text-muted">{S.chars.ref}</span>
                  <TextInput
                    aria-label={`${S.chars.ref}（${label}）`}
                    value={c.ref}
                    placeholder={S.chars.refPlaceholder}
                    spellCheck={false}
                    onChange={(e) => updateChar(c.id, { ref: e.target.value })}
                  />
                </div>
                {hint ? (
                  <p className="m-0 text-xs text-warning" data-testid="character-hint">
                    {HINTS[hint]}
                  </p>
                ) : (
                  <p className="m-0 truncate font-mono text-xs text-muted" title={url ?? undefined}>
                    {url}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    icon={<Link2 />}
                    onClick={() => copyCharacterUrl(useSettings.getState().data, c)}
                    aria-label={`${S.chars.copyUrl}（${label}）`}
                  >
                    {S.chars.copyUrl}
                  </Button>
                  <Button
                    size="sm"
                    icon={<Copy />}
                    onClick={() => copyCharacterCss(useSettings.getState().data, c)}
                    aria-label={`${S.chars.copyCss}（${label}）`}
                  >
                    {S.chars.copyCss}
                  </Button>
                  <Button
                    size="sm"
                    variant={target === c.id ? 'primary' : 'secondary'}
                    aria-pressed={target === c.id}
                    icon={<Eye />}
                    onClick={() => usePreview.getState().patch({ target: c.id })}
                    aria-label={`${S.chars.preview}（${label}）`}
                  >
                    {target === c.id ? S.chars.previewing : S.chars.preview}
                  </Button>
                </div>
              </div>
            );
          }}
        />
        <p className="m-0 text-xs text-muted">{S.chars.refHint}</p>
      </Section>
    </div>
  );
}
