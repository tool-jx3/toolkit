/**
 * 範例（規格 F03）：每個主題一個本站自己寫的範例，縮圖用同一段程式畫。
 * 選了之後問要「加成新的一張」還是「取代目前這張」（可以復原）。
 */
import { useMemo } from 'react';
import { Dialog, TemplateGallery, type TemplateItem, useChoice, useToast } from '@/ui';
import { applyExample, EXAMPLE_LIST, type Example, exampleHandout } from './examples';
import { useEnsureFonts, useFontTick } from './fonts';
import { HANDOUT_MAX } from './model';
import { fontNeeds, renderThumb } from './render';
import { activeNow, addHandout, replaceActive } from './store';
import { S } from './strings';

const EXAMPLE_HANDOUTS = EXAMPLE_LIST.map((ex) => exampleHandout(ex, `example-${ex.theme}`));
const EXAMPLE_NEEDS = EXAMPLE_HANDOUTS.flatMap(fontNeeds);

function Thumbs({ open }: { open: boolean }) {
  useEnsureFonts(open ? EXAMPLE_NEEDS : []);
  return null;
}

export function ExamplesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const choose = useChoice();
  const toast = useToast();
  const tick = useFontTick();
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick 是字型載好後重畫縮圖
  const templates = useMemo<TemplateItem<Example>[]>(() => {
    if (!open) return [];
    return EXAMPLE_LIST.map((ex, i) => {
      let thumbnail: string | undefined;
      try {
        const c = renderThumb(EXAMPLE_HANDOUTS[i], 240);
        thumbnail = 'toDataURL' in c ? c.toDataURL('image/png') : undefined;
      } catch {
        thumbnail = undefined;
      }
      return {
        id: ex.theme,
        name: S.themes[ex.theme],
        description: ex.title || ex.extra?.contact || '',
        thumbnail,
        data: ex,
      };
    });
  }, [open, tick]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={S.examplesTitle}
      description={S.examplesLead}
      size="lg"
    >
      <Thumbs open={open} />
      <div data-testid="examples">
        <TemplateGallery<Example>
          aria-label={S.examplesTitle}
          templates={templates}
          confirm={false}
          onApply={async (t) => {
            const name = S.themes[t.data.theme];
            const how = await choose({
              title: S.exampleChoiceTitle(name),
              description: S.exampleChoiceDesc,
              choices: [
                { value: 'add', label: S.exampleAdd },
                { value: 'replace', label: S.exampleReplace, variant: 'danger' },
              ],
            });
            if (!how) return;
            if (how === 'add') {
              if (!addHandout((id) => exampleHandout(t.data, id))) {
                toast({ title: S.listFull(HANDOUT_MAX), tone: 'warning' });
                return;
              }
            } else replaceActive(applyExample(activeNow(), t.data));
            onOpenChange(false);
            toast({ title: S.exampleApplied(name), tone: 'success' });
          }}
        />
      </div>
    </Dialog>
  );
}
