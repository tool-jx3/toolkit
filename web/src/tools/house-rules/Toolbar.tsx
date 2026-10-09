/**
 * 編輯區上方的工具列：版本（6 版／7 版／兩版並列）與預設集選單（規格 F01、F02）。
 */
import { ChevronDown, Sparkles } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { buttonClass, comboText, Segmented, useToast } from '@/ui';
import { runPreset, setEdition } from './actions';
import { PRESET_IDS, type PresetId } from './model';
import { EDITIONS, type Edition } from './rules';
import { useRules } from './store';
import { S } from './strings';

export function Toolbar() {
  const edition = useRules((s) => s.data.edition);
  const toast = useToast();
  const apply = (preset: PresetId) => {
    runPreset(preset);
    toast({
      title: S.toast.preset(S.toolbar.presets[preset].name),
      description: S.toast.undoHint(comboText('mod+z')),
      tone: 'success',
      replace: true,
    });
  };
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-surface px-3 py-2">
      <span id="hr-edition-label" className="text-sm font-medium text-fg">
        {S.toolbar.edition}
      </span>
      <Segmented<Edition>
        aria-labelledby="hr-edition-label"
        value={edition}
        onValueChange={setEdition}
        options={EDITIONS.map((e) => ({ value: e, label: S.toolbar.editions[e] }))}
        size="sm"
      />
      <DropdownMenu.Root>
        <DropdownMenu.Trigger className={buttonClass('secondary', 'sm', 'ml-auto')}>
          <Sparkles aria-hidden className="size-3.5" />
          {S.toolbar.preset}
          <ChevronDown aria-hidden className="size-3.5" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            aria-label={S.toolbar.presetMenu}
            className="z-50 w-[min(22rem,calc(100vw-2rem))] rounded-md border border-border bg-surface p-1 shadow-2"
          >
            <DropdownMenu.Label className="px-2 pt-1 pb-1.5 text-xs text-muted">
              {S.toolbar.presetMenu}
            </DropdownMenu.Label>
            {PRESET_IDS.map((id) => (
              <DropdownMenu.Item
                key={id}
                onSelect={() => apply(id)}
                className="flex cursor-pointer select-none flex-col items-start gap-0.5 rounded-sm px-2 py-1.5 outline-none data-highlighted:bg-accent-soft"
              >
                <span
                  className={
                    id === 'clear' ? 'text-sm text-muted' : 'text-sm font-semibold text-fg'
                  }
                >
                  {S.toolbar.presets[id].name}
                </span>
                <span className="text-xs text-muted">{S.toolbar.presets[id].note}</span>
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
