/**
 * 字型選擇：Google Fonts／電腦字型／上傳字型三合一，含字重。
 *
 * - 欄位本身是一個按鈕（以該字型顯示名稱）＋字重選單；按鈕開啟選擇對話框。
 * - Google 字型清單的預覽只下載用到的幾個字（Google Fonts 的 text= 子集），不會一次載入整套字型。
 * - 選定後會呼叫 ensureFont 載入正式字型；工具畫 canvas 前仍應自己 await ensureFont。
 */
import { HardDrive, Search, Trash2, Type, Upload } from 'lucide-react';
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';
import { formatBytes } from '@/core/files';
import {
  CATEGORY_LABELS,
  canQueryLocalFonts,
  ensureFont,
  FONT_FILE_ACCEPT,
  type FontScript,
  type FontValue,
  findGoogleFont,
  fontFamilyCss,
  GOOGLE_FONTS,
  isLocalFontAvailable,
  listUploadedFonts,
  loadPreviewFont,
  nearestWeight,
  queryLocalFamilies,
  registerUploadedFonts,
  removeUploadedFont,
  SCRIPT_LABELS,
  type UploadedFont,
  uploadFont,
} from '@/core/fonts';
import { Button, IconButton } from './Button';
import { cn } from './cn';
import { Dialog, DialogClose } from './Dialog';
import { useFieldControl } from './Field';
import { FileDrop } from './ImageDrop';
import { Segmented } from './Segmented';
import { Select } from './Select';
import { Tabs } from './Tabs';
import { TextInput } from './TextInput';

export const WEIGHT_LABELS: Record<number, string> = {
  100: '100 極細',
  200: '200 特細',
  300: '300 細',
  400: '400 標準',
  500: '500 中等',
  600: '600 半粗',
  700: '700 粗',
  800: '800 特粗',
  900: '900 極粗',
};

const ALL_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

export interface FontPickerProps {
  value: FontValue;
  onChange: (value: FontValue) => void;
  /** 清單預覽用的文字 */
  previewText?: string;
  /** 只列出這些文字的字型（預設全部） */
  scripts?: readonly FontScript[];
  /** 允許電腦字型（預設 true） */
  allowLocal?: boolean;
  /** 允許上傳字型（預設 true） */
  allowUpload?: boolean;
  /** 顯示字重選單（預設 true） */
  showWeight?: boolean;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  className?: string;
}

/** 這個值可以選的字重 */
export function availableWeights(value: Pick<FontValue, 'source' | 'family'>): readonly number[] {
  if (value.source === 'google') return findGoogleFont(value.family)?.weights ?? [400];
  return ALL_WEIGHTS;
}

const SOURCE_LABEL: Record<FontValue['source'], string> = {
  google: 'Google',
  local: '電腦',
  upload: '上傳',
};

function PreviewRow({
  family,
  label,
  text,
  children,
}: {
  family: string;
  label: string;
  text: string;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [alias, setAlias] = useState<string | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        loadPreviewFont(family, `${label}${text}`).then((a) => {
          if (!cancelled) setAlias(a);
        });
      }
    });
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [family, label, text]);
  return (
    <span
      ref={ref}
      className="flex min-w-0 flex-col"
      style={alias ? { fontFamily: `"${alias}", var(--font-ui)` } : undefined}
    >
      <span className="truncate text-base text-fg">{label}</span>
      <span className="truncate text-sm text-muted">{text}</span>
      {children}
    </span>
  );
}

function OptionList<T extends string>({
  name,
  label,
  items,
  selected,
  onSelect,
  render,
  empty,
}: {
  name: string;
  label: string;
  items: readonly T[];
  selected: string | null;
  onSelect: (item: T) => void;
  render: (item: T) => ReactNode;
  empty?: ReactNode;
}) {
  if (!items.length)
    return <p className="m-0 py-6 text-center text-sm text-muted">{empty ?? '沒有符合的字型'}</p>;
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex max-h-[45dvh] flex-col gap-1 overflow-y-auto pr-1"
    >
      {items.map((item) => (
        <label
          key={item}
          className={cn(
            'flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 transition-colors hover:bg-surface-2',
            selected === item ? 'border-accent bg-accent-soft' : 'border-transparent',
          )}
        >
          <input
            type="radio"
            name={name}
            value={item}
            checked={selected === item}
            onChange={() => onSelect(item)}
            className="size-4 shrink-0 accent-(--accent)"
          />
          {render(item)}
        </label>
      ))}
    </div>
  );
}

function GoogleTab({
  value,
  onPick,
  previewText,
  scripts,
}: {
  value: FontValue;
  onPick: (family: string) => void;
  previewText: string;
  scripts?: readonly FontScript[];
}) {
  const [q, setQ] = useState('');
  const [script, setScript] = useState<'all' | FontScript>('all');
  const name = useId();
  const pool = useMemo(
    () => GOOGLE_FONTS.filter((f) => !scripts || f.scripts.some((s) => scripts.includes(s))),
    [scripts],
  );
  const scriptOptions = useMemo(() => {
    const present = (['tc', 'jp', 'kr', 'latin'] as const).filter((s) =>
      pool.some((f) => f.scripts.includes(s)),
    );
    return [
      { value: 'all' as const, label: '全部' },
      ...present.map((s) => ({ value: s, label: SCRIPT_LABELS[s] })),
    ];
  }, [pool]);
  const list = pool.filter((f) => {
    if (script !== 'all' && !f.scripts.includes(script)) return false;
    const k = q.trim().toLowerCase();
    return !k || f.family.toLowerCase().includes(k) || f.label.toLowerCase().includes(k);
  });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-40 flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted"
          />
          <TextInput
            aria-label="搜尋字型"
            placeholder="搜尋字型名稱"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
          />
        </div>
        {scriptOptions.length > 2 ? (
          <Segmented
            aria-label="文字種類"
            value={script}
            onValueChange={setScript}
            options={scriptOptions}
            size="sm"
          />
        ) : null}
      </div>
      <OptionList
        name={name}
        label="Google 字型"
        items={list.map((f) => f.family)}
        selected={value.source === 'google' ? value.family : null}
        onSelect={onPick}
        render={(family) => {
          const f = findGoogleFont(family)!;
          return (
            <PreviewRow family={family} label={f.label} text={previewText}>
              <span className="mt-0.5 text-xs text-muted" style={{ fontFamily: 'var(--font-ui)' }}>
                {CATEGORY_LABELS[f.category]}・{f.scripts.map((s) => SCRIPT_LABELS[s]).join('、')}・
                {f.weights.length > 1 ? `${f.weights.length} 種字重` : '單一字重'}
              </span>
            </PreviewRow>
          );
        }}
      />
    </div>
  );
}

function LocalTab({
  value,
  onPick,
  previewText,
}: {
  value: FontValue;
  onPick: (family: string) => void;
  previewText: string;
}) {
  const supported = canQueryLocalFonts();
  const [families, setFamilies] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [manual, setManual] = useState(value.source === 'local' ? value.family : '');
  const [check, setCheck] = useState<boolean | null>(null);
  const name = useId();
  const list = (families ?? []).filter(
    (f) => !q.trim() || f.toLowerCase().includes(q.trim().toLowerCase()),
  );
  return (
    <div className="flex flex-col gap-3">
      {supported ? (
        families ? (
          <>
            <TextInput
              aria-label="搜尋電腦字型"
              placeholder="搜尋字型名稱"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <OptionList
              name={name}
              label="電腦字型"
              items={list}
              selected={value.source === 'local' ? value.family : null}
              onSelect={onPick}
              render={(family) => (
                <span
                  className="flex min-w-0 flex-col"
                  style={{ fontFamily: fontFamilyCss(family) }}
                >
                  <span className="truncate text-base text-fg">{family}</span>
                  <span className="truncate text-sm text-muted">{previewText}</span>
                </span>
              )}
            />
          </>
        ) : (
          <div className="flex flex-col items-start gap-2">
            <p className="m-0 text-sm text-muted">瀏覽器會詢問是否允許讀取電腦上的字型清單。</p>
            <Button
              icon={<HardDrive />}
              onClick={async () => {
                setError(null);
                try {
                  setFamilies(await queryLocalFamilies());
                } catch (e) {
                  setError(
                    e instanceof Error && e.name !== 'SecurityError'
                      ? e.message
                      : '沒有取得權限，請改用下方的手動輸入。',
                  );
                }
              }}
            >
              列出電腦上的字型
            </Button>
          </div>
        )
      ) : (
        <p className="m-0 text-sm text-muted">
          這個瀏覽器無法列出電腦上的字型（Chrome、Edge 可以），請直接輸入字型名稱。
        </p>
      )}
      {error ? (
        <p role="alert" className="m-0 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <form
        className="flex flex-col gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const fam = manual.trim();
          if (!fam) return;
          setCheck(isLocalFontAvailable(fam));
          onPick(fam);
        }}
      >
        <label htmlFor={`${name}-manual`} className="text-sm font-medium">
          手動輸入字型名稱
        </label>
        <div className="flex gap-2">
          <TextInput
            id={`${name}-manual`}
            placeholder="例如：微軟正黑體、PingFang TC"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
          />
          <Button type="submit" variant="primary">
            套用
          </Button>
        </div>
        {check !== null ? (
          <p role="status" className={cn('m-0 text-xs', check ? 'text-success' : 'text-warning')}>
            {check ? '找到這個字型。' : '這台電腦似乎沒有這個字型，會改用備用字型顯示。'}
          </p>
        ) : null}
      </form>
    </div>
  );
}

function UploadTab({
  value,
  onPick,
  previewText,
}: {
  value: FontValue;
  onPick: (family: string) => void;
  previewText: string;
}) {
  const [fonts, setFonts] = useState<UploadedFont[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const name = useId();
  useEffect(() => {
    registerUploadedFonts()
      .then(setFonts)
      .catch(() => setFonts([]));
  }, []);
  return (
    <div className="flex flex-col gap-3">
      <FileDrop
        accept={FONT_FILE_ACCEPT}
        multiple
        paste="off"
        icon={<Upload />}
        label="把字型檔拖到這裡"
        hint="TTF、OTF、WOFF、WOFF2；只存在這個瀏覽器裡"
        onReject={(files) => setError(`不是字型檔：${files.map((f) => f.name).join('、')}`)}
        onFiles={async (files) => {
          setError(null);
          setBusy(true);
          let last: UploadedFont | null = null;
          for (const f of files) {
            try {
              last = await uploadFont(f);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          }
          setFonts(await listUploadedFonts());
          setBusy(false);
          if (last) onPick(last.family);
        }}
      />
      {busy ? (
        <p role="status" className="m-0 text-sm text-muted">
          正在讀取字型…
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="m-0 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {fonts === null ? null : fonts.length ? (
        <div role="radiogroup" aria-label="上傳的字型" className="flex flex-col gap-1">
          {fonts.map((f) => (
            <div
              key={f.id}
              className={cn(
                'flex items-center gap-2 rounded-md border px-3 py-2',
                value.source === 'upload' && value.family === f.family
                  ? 'border-accent bg-accent-soft'
                  : 'border-border',
              )}
            >
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                <input
                  type="radio"
                  name={name}
                  checked={value.source === 'upload' && value.family === f.family}
                  onChange={() => onPick(f.family)}
                  className="size-4 shrink-0 accent-(--accent)"
                />
                <span
                  className="flex min-w-0 flex-col"
                  style={{ fontFamily: fontFamilyCss(f.family) }}
                >
                  <span className="truncate text-base">{f.family}</span>
                  <span className="truncate text-sm text-muted">{previewText}</span>
                  <span className="text-xs text-muted" style={{ fontFamily: 'var(--font-ui)' }}>
                    {f.fileName}・{formatBytes(f.size)}
                  </span>
                </span>
              </label>
              <IconButton
                label={`刪除「${f.family}」`}
                icon={<Trash2 />}
                size="sm"
                onClick={async () => {
                  await removeUploadedFont(f.id);
                  setFonts(await listUploadedFonts());
                }}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="m-0 text-sm text-muted">還沒有上傳任何字型。</p>
      )}
    </div>
  );
}

export function FontPicker({
  value,
  onChange,
  previewText = '天地玄黃 宇宙洪荒 TRPG 123',
  scripts,
  allowLocal = true,
  allowUpload = true,
  showWeight = true,
  disabled,
  className,
  ...rest
}: FontPickerProps) {
  const field = useFieldControl(rest);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<FontValue['source']>(value.source);
  const weights = availableWeights(value);
  const display =
    value.source === 'google'
      ? (findGoogleFont(value.family)?.label ?? value.family)
      : value.family;

  useEffect(() => {
    ensureFont(value.family, value.weight, display);
  }, [value.family, value.weight, display]);

  const pick = (source: FontValue['source']) => (family: string) => {
    const ws = availableWeights({ source, family });
    onChange({ source, family, weight: nearestWeight(ws, value.weight) });
  };

  const tabs = [
    {
      value: 'google' as const,
      label: 'Google 字型',
      icon: <Type />,
      content: (
        <GoogleTab
          value={value}
          onPick={pick('google')}
          previewText={previewText}
          scripts={scripts}
        />
      ),
    },
    ...(allowLocal
      ? [
          {
            value: 'local' as const,
            label: '電腦字型',
            icon: <HardDrive />,
            content: <LocalTab value={value} onPick={pick('local')} previewText={previewText} />,
          },
        ]
      : []),
    ...(allowUpload
      ? [
          {
            value: 'upload' as const,
            label: '上傳字型',
            icon: <Upload />,
            content: <UploadTab value={value} onPick={pick('upload')} previewText={previewText} />,
          },
        ]
      : []),
  ];

  return (
    <div className={cn('flex w-full min-w-0 gap-2', className)}>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) setTab(value.source);
        }}
        title="選擇字型"
        description={`目前：${display}（${SOURCE_LABEL[value.source]}）`}
        size="md"
        trigger={
          <button
            type="button"
            id={field.id}
            disabled={disabled}
            aria-haspopup="dialog"
            aria-label={rest['aria-label'] ? `${rest['aria-label']}：${display}` : undefined}
            aria-labelledby={
              rest['aria-label']
                ? undefined
                : field['aria-labelledby']
                  ? `${field['aria-labelledby']} ${field.id}`
                  : undefined
            }
            aria-describedby={field['aria-describedby']}
            className="flex h-8 min-w-0 flex-1 items-center justify-between gap-2 rounded-md border border-border-strong bg-surface-2 px-2.5 text-left text-sm text-fg hover:bg-surface-3 disabled:opacity-50"
          >
            <span
              className="truncate"
              style={{ fontFamily: fontFamilyCss(value.family), fontWeight: value.weight }}
            >
              {display}
            </span>
            <span className="shrink-0 rounded-sm bg-surface-3 px-1.5 text-xs text-muted">
              {SOURCE_LABEL[value.source]}
            </span>
          </button>
        }
        footer={<DialogClose variant="primary">完成</DialogClose>}
      >
        <Tabs aria-label="字型來源" items={tabs} value={tab} onValueChange={setTab} />
      </Dialog>
      {showWeight ? (
        <Select
          aria-label="字重"
          value={String(nearestWeight(weights, value.weight))}
          onValueChange={(w) => onChange({ ...value, weight: Number(w) })}
          options={weights.map((w) => ({ value: String(w), label: WEIGHT_LABELS[w] ?? String(w) }))}
          disabled={disabled || weights.length < 2}
          className="w-28 shrink-0"
        />
      ) : null}
    </div>
  );
}
