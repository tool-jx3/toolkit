/**
 * 部件選項格（F01～F05、F18～F20）：眼睛、眉毛、嘴巴單選，裝飾複選；每類可以加自訂圖片。
 */
import { ImagePlus } from 'lucide-react';
import { useMemo } from 'react';
import { pickFiles } from '@/core/files';
import { detectImageType, loadImage } from '@/core/image';
import { Button, type PartOption, PartPicker, useConfirm } from '@/ui';
import { builtinThumbLayers, useNotify } from './hooks';
import {
  CATEGORY_ORDER,
  type Category,
  type CustomPart,
  partBaseName,
  removePartRefs,
  uniqueName,
} from './logic';
import { BUILTIN_PARTS } from './parts';
import { newId, partAssets, useCustomImages, useEditor, useEmotions } from './store';
import { CATEGORY_LABELS, S } from './strings';

/** 選檔視窗只列圖片 */
const IMAGE_ACCEPT = 'image/*';
const THUMB_SIZE = 64;

async function isImageFile(file: File): Promise<boolean> {
  if (file.type.startsWith('image/')) return true;
  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  return detectImageType(head) !== null;
}

/** 刪掉沒有任何自訂部件用到的圖片 */
export async function collectUnusedImages(): Promise<void> {
  const keep = useEmotions
    .getState()
    .data.customParts.map((p) => p.assetId)
    .filter((id): id is string => !!id);
  try {
    await partAssets.gc(keep);
  } catch {
    /* IndexedDB 不能用：不影響操作 */
  }
}

export function PartsPanel() {
  const draft = useEditor((s) => s.draft);
  const setDraft = useEditor((s) => s.setDraft);
  const customParts = useEmotions((s) => s.data.customParts);
  const images = useCustomImages((s) => s.images);
  const notify = useNotify();
  const confirm = useConfirm();

  const thumbs = useMemo(() => builtinThumbLayers().layers, []);
  const base = useMemo(
    () => [thumbs.get('head-fill') ?? null, thumbs.get('head-line') ?? null],
    [thumbs],
  );

  const options = useMemo(() => {
    const out = {} as Record<Category, PartOption[]>;
    for (const c of CATEGORY_ORDER) {
      out[c] = [
        ...BUILTIN_PARTS[c].map((p) => ({
          id: p.id,
          name: p.name,
          layer: thumbs.get(p.id) ?? null,
        })),
        ...customParts
          .filter((p) => p.category === c)
          .map((p) => ({
            id: p.id,
            name: p.name,
            layer: (p.assetId && images[p.assetId]) || null,
            custom: true,
          })),
      ];
    }
    return out;
  }, [thumbs, customParts, images]);

  const addImages = async (category: Category) => {
    const files = await pickFiles({ accept: IMAGE_ACCEPT, multiple: true });
    if (!files.length) return;
    const decoded: { file: File; image: ImageBitmap }[] = [];
    for (const file of files) {
      try {
        if (!(await isImageFile(file))) continue;
        decoded.push({ file, image: await loadImage(file) });
      } catch {
        /* 解不開的檔案視為不是圖片 */
      }
    }
    const skipped = files.length - decoded.length;
    if (!decoded.length) {
      notify(S.notImage, 'warning');
      return;
    }
    const label = CATEGORY_LABELS[category];
    const current = useEmotions.getState().data.customParts;
    const names = [
      ...BUILTIN_PARTS[category].map((p) => p.name),
      ...current.filter((p) => p.category === category).map((p) => p.name),
    ];
    const added: CustomPart[] = [];
    let notSaved = 0;
    let unavailable = false;
    for (const { file, image } of decoded) {
      const r = await partAssets.add(file);
      if (!r.persisted) {
        notSaved++;
        if (r.reason === 'unavailable') unavailable = true;
      }
      useCustomImages.getState().put(r.id, image);
      const name = uniqueName(partBaseName(file.name), names);
      names.push(name);
      added.push({ id: newId('c'), category, name, assetId: r.id });
    }
    useEmotions.getState().patch({
      customParts: [...useEmotions.getState().data.customParts, ...added],
    });
    const notes = [
      skipped ? S.skippedFiles(skipped) : '',
      notSaved ? (unavailable ? S.partsUnavailable : S.partsNotSaved(notSaved)) : '',
    ].filter(Boolean);
    notify(
      S.addedParts(label, added.length),
      notSaved ? 'warning' : 'success',
      notes.join('') || undefined,
    );
  };

  const removeCustom = async (option: PartOption) => {
    const part = useEmotions.getState().data.customParts.find((p) => p.id === option.id);
    if (!part) return;
    const ok = await confirm({
      title: S.confirmRemovePart(part.name),
      description: S.confirmRemovePartDescription,
      confirmLabel: S.deleteLabel,
      danger: true,
    });
    if (!ok) return;
    const data = useEmotions.getState().data;
    useEmotions.getState().patch({
      customParts: data.customParts.filter((p) => p.id !== part.id),
      expressions: data.expressions.map((e) => removePartRefs(e, part.category, part.id)),
    });
    const ed = useEditor.getState();
    useEditor.setState({ draft: removePartRefs(ed.draft, part.category, part.id) });
    notify(S.partRemoved(part.name), 'success');
    void collectUnusedImages();
  };

  const picker = (category: Category) => {
    const label = CATEGORY_LABELS[category];
    const actions = (
      <Button
        size="sm"
        variant="ghost"
        icon={<ImagePlus />}
        aria-label={S.addImageLabel(label)}
        onClick={() => void addImages(category)}
      >
        {S.addImage}
      </Button>
    );
    if (category === 'deco') {
      return (
        <PartPicker
          key={category}
          label={label}
          mode="multiple"
          base={base}
          options={options.deco}
          value={draft.decorations}
          onChange={(next) => setDraft({ decorations: next })}
          onRemove={(o) => void removeCustom(o)}
          actions={actions}
          thumbSize={THUMB_SIZE}
          empty={S.partsEmpty}
        />
      );
    }
    const value = draft[category];
    return (
      <PartPicker
        key={category}
        label={label}
        mode="single"
        base={base}
        options={options[category]}
        value={value ? [value] : []}
        onChange={([id]) => setDraft({ [category]: id ?? null })}
        onRemove={(o) => void removeCustom(o)}
        actions={actions}
        thumbSize={THUMB_SIZE}
        empty={S.partsEmpty}
      />
    );
  };

  return (
    <section
      aria-labelledby="emotion-parts-title"
      className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-surface p-3"
    >
      <div className="flex flex-col gap-0.5">
        <h2 id="emotion-parts-title" className="m-0 text-base font-semibold text-fg">
          {S.partsTitle}
        </h2>
        <p className="m-0 text-xs text-muted">{S.partsHint}</p>
      </div>
      {CATEGORY_ORDER.map(picker)}
    </section>
  );
}
