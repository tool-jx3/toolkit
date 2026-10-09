/**
 * 範本對話框：分類篩選、縮圖卡片（樓層數與說明）、空白地圖；載入選項「只載入格局」「放入隱藏線索」。
 */
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Dialog, Field, TemplateGallery, type TemplateItem, Toggle } from '@/ui';
import { renderImage } from '../draw/export';
import { S } from '../strings';
import { instantiateTemplate, TEMPLATE_GROUPS, TEMPLATES } from '../templates';
import { loadTemplate, newMap } from './actions';
import { setEditor, useEditor } from './store';

const thumbs = new Map<string, string>();

function thumbnail(id: string): string | null {
  const hit = thumbs.get(id);
  if (hit) return hit;
  const floors = instantiateTemplate(id);
  if (!floors) return null;
  try {
    const canvas = renderImage(floors, {
      theme: 'clean',
      px: 10,
      showSize: 'none',
      hideNames: false,
      playerView: false,
      hideClues: false,
      grid: false,
      transparent: false,
      margin: 1,
    });
    const url = canvas.toDataURL('image/png');
    thumbs.set(id, url);
    return url;
  } catch {
    return null;
  }
}

const groupName = (id: string) => TEMPLATE_GROUPS.find((g) => g.id === id)?.name ?? '';

export function TemplateDialog() {
  const open = useEditor((s) => s.templatesOpen);
  const [structureOnly, setStructureOnly] = useState(false);
  const [clues, setClues] = useState(false);
  const [ready, setReady] = useState(0);

  /* 縮圖在打開之後才一張一張畫（不卡住開對話框） */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let i = 0;
    const step = () => {
      if (cancelled || i >= TEMPLATES.length) return;
      thumbnail(TEMPLATES[i].id);
      i++;
      setReady(i);
      setTimeout(step, 0);
    };
    setTimeout(step, 0);
    return () => {
      cancelled = true;
    };
  }, [open]);

  const items = useMemo<TemplateItem<string>[]>(() => {
    void ready;
    const list: TemplateItem<string>[] = TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      description: `${S.tpl.floors(t.build().length)}・${t.description}`,
      thumbnail: thumbs.get(t.id) ?? (
        <span className="flex size-full items-center justify-center bg-surface-2 text-xs text-muted">
          …
        </span>
      ),
      tags: [groupName(t.group)],
      data: t.id,
    }));
    list.splice(3, 0, {
      id: 'blank',
      name: S.tpl.blank,
      description: S.tpl.blankDesc,
      thumbnail: (
        <span className="flex size-full items-center justify-center bg-surface-2 text-muted">
          <Plus aria-hidden className="size-8" />
        </span>
      ),
      tags: [groupName('home')],
      data: 'blank',
    });
    return list;
  }, [ready]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => setEditor({ templatesOpen: o })}
      title={S.tpl.title}
      description={S.tpl.intro}
      size="xl"
    >
      <div className="flex flex-col gap-3" data-testid="template-dialog">
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <Field label={S.tpl.structureOnly} layout="inline">
            <Toggle checked={structureOnly} onCheckedChange={setStructureOnly} />
          </Field>
          <Field label={S.tpl.clues} layout="inline">
            <Toggle checked={clues} onCheckedChange={setClues} />
          </Field>
        </div>
        <TemplateGallery
          aria-label={S.tpl.gallery}
          templates={items}
          confirm={false}
          onApply={(t) => {
            if (t.data === 'blank') newMap();
            else loadTemplate(t.data, { structureOnly, clues });
          }}
        />
      </div>
    </Dialog>
  );
}
