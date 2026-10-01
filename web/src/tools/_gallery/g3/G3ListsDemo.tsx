/**
 * 「立繪工作台」：縮圖清單的選取、↑↓ 切換、拖曳排序、每列自訂欄位＋建議詞按鈕＋檔名（safeFileName 底線模式、uniqueFileName）。
 */
import { ClipboardCopy } from 'lucide-react';
import { useMemo } from 'react';
import { moveItem } from '@/core/compose';
import { copyText, safeFileName, uniqueFileName } from '@/core/files';
import { Button, Chips, Field, Section, TextInput, ThumbnailList, Toggle, useToast } from '@/ui';
import { FIGURE_COLORS, makeFigure } from './art';
import { type DemoVariant, useG3, useG3Preview } from './store';

const SUGGESTIONS = [
  '普通',
  '笑',
  '大笑',
  '生氣',
  '哭',
  '驚訝',
  '害羞',
  '疑問',
  '閉眼',
  '受傷',
  '戰鬥',
  '瘋狂',
];

const clean = (s: string) => safeFileName(s, { underscore: true, fallback: '' });

/** 檔名：主名稱＋兩位數序號＋_差分名＋原副檔名（小寫；沒有副檔名時 png） */
export function variantFileName(
  main: string,
  numbered: boolean,
  index: number,
  v: DemoVariant,
): string {
  const base = clean(main) || 'character';
  const num = numbered ? String(index + 1).padStart(2, '0') : '';
  const dot = v.file.lastIndexOf('.');
  const ext = dot >= 0 ? v.file.slice(dot + 1).toLowerCase() : 'png';
  const name = clean(v.variant);
  return `${base}${num}${name ? `_${name}` : ''}.${ext}`;
}

export function G3ListsDemo() {
  const s = useG3((st) => st.data);
  const update = useG3((st) => st.update);
  const selected = useG3Preview((st) => st.data.selectedVariant);
  const setPreview = useG3Preview((st) => st.patch);
  const toast = useToast();
  const thumbs = useMemo(() => FIGURE_COLORS.map((c) => makeFigure(90, 180, c)), []);

  const names = s.variants.map((v, i) => variantFileName(s.mainName, s.numbered, i, v));
  const used = new Set<string>();
  const zipNames = names.map((n) => uniqueFileName(n, used));
  const palette = s.variants
    .map((v) => clean(v.variant))
    .filter(Boolean)
    .map((n) => `@${n}`)
    .join('\n');

  const setVariant = (id: string, variant: string) =>
    update((d) => {
      const v = d.variants.find((x) => x.id === id);
      if (v) v.variant = variant;
    });

  return (
    <Section title="縮圖清單（選取、排序、自訂欄位）ThumbnailList" persistKey="_gallery:g3:lists">
      <p className="m-0 text-xs text-muted">
        `layout="list"`：點一列或聚焦欄位就選取，清單有焦點時 ↑↓
        切換；拖曳一列到另一列放開來排序（從欄位上拖不算）。 建議詞（Chips）填進選取中的那張。
      </p>
      <Field
        label="主名稱"
        hint="清理規則：空白換 _、刪掉 \ / : * ? &quot; < > |、合併連續 _、去頭尾 _"
      >
        <TextInput
          value={s.mainName}
          placeholder="例：alice"
          onChange={(e) => update((d) => void Object.assign(d, { mainName: e.target.value }))}
        />
      </Field>
      <Toggle
        label="加上編號"
        checked={s.numbered}
        onCheckedChange={(v) => update((d) => void Object.assign(d, { numbered: v }))}
      />
      <ThumbnailList
        aria-label="差分清單"
        layout="list"
        numbered
        thumbSize={64}
        items={s.variants.map((v, i) => ({ ...v, name: v.file, image: thumbs[i % thumbs.length] }))}
        selectedId={selected}
        onSelect={(id) => setPreview({ selectedVariant: id })}
        onReorder={(from, to) =>
          update((d) => {
            d.variants = moveItem(d.variants, from, to);
          })
        }
        renderFields={(item, i) => (
          <div className="flex flex-col gap-1">
            <TextInput
              aria-label={`第 ${i + 1} 張的差分名`}
              value={item.variant}
              placeholder="差分名"
              onChange={(e) => setVariant(item.id, e.target.value)}
              className="h-7 text-xs"
            />
            <span className="truncate font-mono text-xs text-muted" data-testid="variant-output">
              {names[i]}
            </span>
          </div>
        )}
      />
      <Chips
        aria-label="差分名建議"
        items={SUGGESTIONS}
        value={s.variants.find((v) => v.id === selected)?.variant ?? null}
        onPick={(v) =>
          selected ? setVariant(selected, v) : toast({ title: '請先選圖片', tone: 'warning' })
        }
      />
      <Field label="ZIP 內的檔名（uniqueFileName）">
        <ul className="m-0 list-none p-0 font-mono text-xs text-muted" data-testid="zip-names">
          {zipNames.map((n, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 依清單順序
            <li key={i}>{n}</li>
          ))}
        </ul>
      </Field>
      <Button
        size="sm"
        icon={<ClipboardCopy />}
        disabled={!palette}
        onClick={async () =>
          toast(
            (await copyText(palette))
              ? { title: '已複製聊天面板文字', tone: 'success' }
              : { title: '無法複製，請手動複製', tone: 'warning' },
          )
        }
      >
        複製聊天面板文字
      </Button>
    </Section>
  );
}
