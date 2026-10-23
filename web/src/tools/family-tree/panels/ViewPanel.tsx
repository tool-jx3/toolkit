/**
 * 「顯示」分頁（規格 F16、F17、F20、F28、F58、F59；第二批 F80～F84、F87）：父親的位置、卡片的樣子
 * （備註、配偶、婚姻連線、女兒的寫法、頭像）、家系（母系外孫、生家的「出」字小卡）、色分類。
 * 都記在瀏覽器（不列入復原；父親的位置與色分類存在圖板裡）。
 */
import { Plus, Trash2 } from 'lucide-react';
import { historyGesture } from '@/core/storage';
import { Button, ColorField, Field, IconButton, Section, Segmented, TextInput, Toggle } from '@/ui';
import { notify, undo } from '../actions';
import type { CardMode } from '../model/layout';
import { newCategory, removeCategory } from '../model/ops';
import { CAT_PALETTE } from '../model/palette';
import { type Align, type Board, LIMITS } from '../model/types';
import { setPrefs, updateBoard, useBoard, usePrefs, useTree } from '../store';
import { S } from '../strings';

const gesture = historyGesture(useTree);

export function ViewPanel() {
  const board = useBoard();
  const prefs = usePrefs((s) => s.data);
  return (
    <div className="flex flex-col gap-3" data-testid="view-panel">
      <Section title={S.alignSection} persistKey="family-tree:view-align">
        <Segmented<Align>
          aria-label={S.alignSection}
          value={board.align}
          onValueChange={(a) =>
            updateBoard((b) => {
              b.align = a;
            })
          }
          options={[
            { value: 'center', label: S.align.center },
            { value: 'manual', label: S.align.manual },
            { value: 'eldest', label: S.align.eldest },
          ]}
          fullWidth
        />
        <p className="m-0 mt-2 text-xs text-muted" data-testid="align-hint">
          {S.alignHint[board.align]}
        </p>
      </Section>

      <Section title={S.cardSection} persistKey="family-tree:view-card">
        <Field label={S.cardMode}>
          <Segmented<CardMode>
            value={prefs.cardMode}
            onValueChange={(m) => setPrefs({ cardMode: m })}
            options={[
              { value: 'full', label: S.cardFull },
              { value: 'compact', label: S.cardCompact },
            ]}
            fullWidth
          />
        </Field>
        <Field label={S.showMemo} layout="inline" hint={S.showMemoHint}>
          <Toggle
            checked={prefs.memo}
            disabled={prefs.cardMode === 'compact'}
            onCheckedChange={(v) => setPrefs({ memo: v })}
          />
        </Field>
        <Field label={S.showSpouses} layout="inline">
          <Toggle checked={prefs.spouses} onCheckedChange={(v) => setPrefs({ spouses: v })} />
        </Field>
        <Field label={S.showLinks} layout="inline" hint={S.showLinksHint}>
          <Toggle
            checked={prefs.links}
            disabled={!prefs.spouses}
            onCheckedChange={(v) => setPrefs({ links: v })}
          />
        </Field>
        <Field label={S.showDaughterName} layout="inline" hint={S.showDaughterNameHint}>
          <Toggle
            checked={prefs.daughterName}
            onCheckedChange={(v) => setPrefs({ daughterName: v })}
          />
        </Field>
        <Field label={S.showAvatars} layout="inline" hint={S.showAvatarsHint}>
          <Toggle checked={prefs.avatars} onCheckedChange={(v) => setPrefs({ avatars: v })} />
        </Field>
      </Section>

      <Section title={S.lineSection} persistKey="family-tree:view-line">
        <Field label={S.showMaternal} layout="inline" hint={S.showMaternalHint}>
          <Toggle checked={prefs.maternal} onCheckedChange={(v) => setPrefs({ maternal: v })} />
        </Field>
        <Field label={S.showStubs} layout="inline" hint={S.showStubsHint}>
          <Toggle checked={prefs.stubs} onCheckedChange={(v) => setPrefs({ stubs: v })} />
        </Field>
      </Section>

      <Section title={S.colorSection} persistKey="family-tree:view-cats">
        <Field label={S.showColors} layout="inline">
          <Toggle checked={prefs.colors} onCheckedChange={(v) => setPrefs({ colors: v })} />
        </Field>
        {board.cats.length ? (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0" data-testid="cat-list">
            {board.cats.map((c) => (
              <li key={c.id} className="flex items-center gap-1.5">
                <ColorField
                  aria-label={S.catColor}
                  value={c.color}
                  swatches={CAT_PALETTE}
                  showInput={false}
                  className="w-auto"
                  onChange={(color) =>
                    updateBoard((b) => {
                      const t = b.cats.find((x) => x.id === c.id);
                      if (t) t.color = color;
                    })
                  }
                />
                <TextInput
                  aria-label={S.catName}
                  value={c.name}
                  maxLength={LIMITS.catName}
                  onFocus={gesture.begin}
                  onBlur={gesture.commit}
                  onChange={(e) => {
                    const v = Array.from(e.target.value).slice(0, LIMITS.catName).join('');
                    updateBoard((b) => {
                      const t = b.cats.find((x) => x.id === c.id);
                      if (t) t.name = v;
                    });
                  }}
                />
                <IconButton
                  label={S.catDelete(c.name || S.catFallback)}
                  icon={<Trash2 />}
                  variant="ghost"
                  onClick={() => {
                    updateBoard((b) => removeCategory(b as Board, c.id));
                    notify({
                      title: S.catDeleted(c.name || S.catFallback),
                      tone: 'success',
                      action: { label: S.undo, onClick: undo },
                    });
                  }}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-xs text-muted">{S.catEmpty}</p>
        )}
        <div className="mt-2">
          <Button
            size="sm"
            icon={<Plus />}
            data-testid="cat-add"
            onClick={() => {
              updateBoard((b) => {
                b.cats.push(newCategory(b));
              });
              /* 名稱欄聚焦並全選，直接打字取代「分類 N」 */
              setTimeout(() => {
                const list = document.querySelectorAll<HTMLInputElement>(
                  '[data-testid="cat-list"] input[type="text"]',
                );
                const last = list[list.length - 1];
                last?.focus();
                last?.select();
              }, 30);
            }}
          >
            {S.catAdd}
          </Button>
        </div>
      </Section>
    </div>
  );
}
