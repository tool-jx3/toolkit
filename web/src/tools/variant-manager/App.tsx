/**
 * 角色差分管理器：載入同一個角色的多張差分圖，填差分名、排順序、放大檢查，
 * 以新檔名打包成 ZIP（圖片原封不動），並產生 CCFOLIA 聊天面板用的「@差分名」文字。
 * 規格：docs/refactor/specs/variant-manager.md（F34：不保留任何狀態，所以全部用元件狀態）。
 */
import { ClipboardCopy, Download, ImagePlus, RotateCcw } from 'lucide-react';
import {
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { moveItem } from '@/core/compose';
import { copyText, downloadBytes, pickFiles, readAsBytes, zipFiles } from '@/core/files';
import {
  Button,
  Chips,
  Field,
  FileDrop,
  isEditableTarget,
  Notice,
  type NoticeTone,
  Section,
  type Shortcut,
  Stage,
  TextArea,
  TextInput,
  ThumbnailList,
  Toggle,
  ToolShell,
  useConfirm,
  useToast,
} from '@/ui';
import {
  autoMainName,
  chatPalette,
  fileKey,
  isImageFile,
  outputFileName,
  PALETTE_FILE,
  zipEntryNames,
  zipFileName,
} from './logic';
import { S, SUGGESTIONS } from './strings';

const TOOL_ID = 'variant-manager';
/** 選檔視窗只列 PNG、JPEG、WebP（F01）；拖放與貼上收所有圖片類型（F03） */
const ACCEPT = 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp';
/** 匯出完成提示的顯示時間（F22：約 2.2 秒後淡出） */
const ZIP_TOAST_MS = 2200;
/** 大圖區的高度（固定高度，換圖時版面不跳動） */
const PREVIEW_HEIGHT = 'h-[min(46dvh,440px)]';
/** 方向鍵由這些元件自己使用時，不切換選取 */
const ARROW_OWNERS =
  '[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],[role="radiogroup"],[role="slider"],[role="tablist"],[role="spinbutton"],[role="combobox"]';

interface Item {
  id: string;
  file: File;
  /** 縮圖與大圖用的物件網址 */
  url: string;
  /** 判斷重複用的鍵（檔名＋大小＋修改時間） */
  key: string;
  /** 差分名（使用者輸入的原樣） */
  variant: string;
}

interface Status {
  tone: NoticeTone;
  text: string;
}

let seq = 0;
const nextId = () => `variant-${++seq}`;

/** ToolShell 裡面才拿得到確認對話框與通知：交給 App 的按鈕與快捷鍵使用 */
interface UiApi {
  confirm: ReturnType<typeof useConfirm>;
  toast: ReturnType<typeof useToast>;
}

function UiBridge({ api }: { api: RefObject<UiApi | null> }) {
  const confirm = useConfirm();
  const toast = useToast();
  useLayoutEffect(() => {
    api.current = { confirm, toast };
  }, [api, confirm, toast]);
  return null;
}

/** 讀圖片的原始尺寸（大圖區的 Stage 用）；讀不到時 broken */
function useImageSize(url: string | null) {
  const [state, setState] = useState<{
    url: string;
    width: number;
    height: number;
    broken: boolean;
  } | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    const img = new Image();
    img.onload = () => {
      if (!alive) return;
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      setState({ url, width, height, broken: !width || !height });
    };
    img.onerror = () => {
      if (alive) setState({ url, width: 0, height: 0, broken: true });
    };
    img.src = url;
    return () => {
      alive = false;
    };
  }, [url]);
  return state && state.url === url ? state : null;
}

function BigPreview({ item, alt }: { item: Item | null; alt: string }) {
  const size = useImageSize(item?.url ?? null);
  const box = `flex ${PREVIEW_HEIGHT} items-center justify-center rounded-lg border border-border bg-surface p-6 text-center text-sm text-muted`;
  if (!item) return <div className={box}>{S.previewEmpty}</div>;
  if (!size) return <div className={`${box} animate-pulse`} aria-busy />;
  if (size.broken)
    return (
      <div className={box} data-testid="preview-broken">
        {S.previewBroken}
      </div>
    );
  return (
    <Stage
      width={size.width}
      height={size.height}
      aria-label={S.stageLabel}
      backgrounds={['checker', 'dark', 'light']}
      viewportClassName={PREVIEW_HEIGHT}
    >
      <img
        src={item.url}
        alt={alt}
        draggable={false}
        className="block size-full select-none"
        data-testid="preview-image"
      />
    </Stage>
  );
}

function Usage() {
  return (
    <>
      <p>{S.usageIntro}</p>
      <ol className="mt-2">
        {S.usageSteps.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <p className="mt-2 font-semibold">{S.usageNotesTitle}</p>
      <ul>
        {S.usageNotes.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <p className="mt-2 text-muted">{S.disclaimer}</p>
    </>
  );
}

export function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [main, setMain] = useState('');
  const [numbered, setNumbered] = useState(true);
  const [status, setStatus] = useState<Status>({ tone: 'info', text: S.status.initial });
  const [busy, setBusy] = useState(false);

  const ui = useRef<UiApi | null>(null);
  const listBox = useRef<HTMLDivElement>(null);
  const paletteArea = useRef<HTMLTextAreaElement>(null);
  const exporting = useRef(false);
  const datalistId = useId();
  const paletteTitleId = useId();
  const paletteHintId = useId();

  /* 快捷鍵、非同步處理讀的是最新的值 */
  const itemsRef = useRef(items);
  const latest = useRef({ main, numbered, selectedId });
  latest.current = { main, numbered, selectedId };
  const commitItems = (next: Item[]) => {
    itemsRef.current = next;
    setItems(next);
  };

  /* 清單中隨時有一張被選取：選取的那張不存在時視為第一張（F10） */
  const selected = items.find((it) => it.id === selectedId) ?? items[0] ?? null;
  const selectedIndex = selected ? items.indexOf(selected) : -1;
  const names = useMemo(
    () =>
      items.map((it, index) =>
        outputFileName({ main, numbered, index, variant: it.variant, fileName: it.file.name }),
      ),
    [items, main, numbered],
  );
  const palette = useMemo(() => chatPalette(items.map((it) => it.variant)), [items]);
  const paletteLines = palette ? palette.split('\n').length : 0;

  /* 離開頁面時釋放物件網址 */
  useEffect(
    () => () => {
      for (const it of itemsRef.current) URL.revokeObjectURL(it.url);
    },
    [],
  );

  /* 檔案拖到載入區以外的地方放開時，不讓瀏覽器直接開啟圖片（會失去整理到一半的清單） */
  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const over = (e: DragEvent) => {
      if (!hasFiles(e) || e.defaultPrevented) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
    };
    const drop = (e: DragEvent) => {
      if (hasFiles(e) && !e.defaultPrevented) e.preventDefault();
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);

  /** 選取並把那一列捲到清單面板裡看得到的地方（只捲清單，不捲頁面） */
  const selectAndReveal = (index: number) => {
    const it = itemsRef.current[index];
    if (!it) return;
    latest.current.selectedId = it.id;
    setSelectedId(it.id);
    const box = listBox.current;
    const row = box?.querySelectorAll<HTMLElement>('ul > li')[index];
    if (!box || !row) return;
    const b = box.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    if (r.top < b.top) box.scrollTop -= b.top - r.top;
    else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom;
  };

  /* F11：焦點不在文字欄、選單等元件上時，整頁的 ↑／↓ 都切換選取（清單有焦點時由 ThumbnailList 處理） */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 讀的是 ref 裡的最新值，只綁一次
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const t = e.target;
      if (isEditableTarget(t)) return;
      if (t instanceof Element && t.closest(ARROW_OWNERS)) return;
      const list = itemsRef.current;
      if (!list.length) return;
      e.preventDefault();
      const cur = Math.max(
        0,
        list.findIndex((it) => it.id === latest.current.selectedId),
      );
      const to = Math.min(list.length - 1, Math.max(0, cur + (e.key === 'ArrowUp' ? -1 : 1)));
      if (to !== cur) selectAndReveal(to);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ---------- 載入 ---------- */

  const addFiles = (files: readonly File[]) => {
    const images = files.filter(isImageFile);
    if (!images.length) {
      /* F03：全部都不是圖片時只警告，清單不變 */
      setStatus({ tone: 'warning', text: S.status.noImages });
      return;
    }
    const seen = new Set(itemsRef.current.map((it) => it.key));
    const added: Item[] = [];
    for (const file of images) {
      const key = fileKey(file);
      if (seen.has(key)) continue;
      seen.add(key);
      added.push({ id: nextId(), file, url: URL.createObjectURL(file), key, variant: '' });
    }
    const next = [...itemsRef.current, ...added];
    commitItems(next);
    /* F10：載入後選取第一張 */
    setSelectedId(next[0]?.id ?? null);
    /* F07：主名稱是空的（只有空白也算）時，用清單第一張的檔名帶入 */
    if (!latest.current.main.trim() && next.length) {
      const auto = autoMainName(next[0].file.name);
      latest.current.main = auto;
      setMain(auto);
    }
    setStatus(
      added.length
        ? { tone: 'success', text: S.status.added(added.length, next.length) }
        : { tone: 'info', text: S.status.addedNone(next.length) },
    );
  };

  const openPicker = async () => {
    const files = await pickFiles({ accept: ACCEPT, multiple: true });
    if (files.length) addFiles(files);
  };

  /* ---------- 清單 ---------- */

  const setVariant = (id: string, variant: string) =>
    commitItems(itemsRef.current.map((it) => (it.id === id ? { ...it, variant } : it)));

  const reorder = (from: number, to: number) => {
    commitItems(moveItem(itemsRef.current, from, to));
    setStatus({ tone: 'info', text: S.status.reordered });
  };

  const remove = (id: string) => {
    const it = itemsRef.current.find((x) => x.id === id);
    if (!it) return;
    URL.revokeObjectURL(it.url);
    commitItems(itemsRef.current.filter((x) => x.id !== id));
    setStatus({ tone: 'info', text: S.status.removed(it.file.name) });
  };

  const pickSuggestion = (name: string) => {
    if (!selected) {
      setStatus({ tone: 'warning', text: S.status.needImage });
      return;
    }
    setVariant(selected.id, name);
  };

  const changeNumbered = (on: boolean) => {
    latest.current.numbered = on;
    setNumbered(on);
    setStatus({ tone: 'info', text: on ? S.status.numberedOn : S.status.numberedOff });
  };

  /* ---------- 匯出、複製、重設 ---------- */

  const exportZip = async () => {
    const list = itemsRef.current;
    if (!list.length || exporting.current) return;
    const { main: m, numbered: num } = latest.current;
    exporting.current = true;
    setBusy(true);
    setStatus({ tone: 'progress', text: S.status.zipping });
    try {
      const entryNames = zipEntryNames(
        list.map((it, index) =>
          outputFileName({
            main: m,
            numbered: num,
            index,
            variant: it.variant,
            fileName: it.file.name,
          }),
        ),
      );
      /* 圖片原封不動（不經過畫布、不重新編碼）；已壓縮過的格式只打包不壓縮 */
      const data = await Promise.all(list.map((it) => readAsBytes(it.file)));
      const zip = zipFiles(
        [
          ...list.map((_, i) => ({ name: entryNames[i], data: data[i] })),
          { name: PALETTE_FILE, data: chatPalette(list.map((it) => it.variant)) },
        ],
        { level: 0 },
      );
      const zipName = zipFileName(m);
      downloadBytes(zip, zipName, 'application/zip');
      setStatus({ tone: 'success', text: S.status.zipStarted(zipName, list.length) });
      ui.current?.toast({ title: S.zipToast, tone: 'success', duration: ZIP_TOAST_MS });
    } catch (e) {
      setStatus({
        tone: 'danger',
        text: S.status.zipFailed(e instanceof Error ? e.message : ''),
      });
    } finally {
      exporting.current = false;
      setBusy(false);
    }
  };

  const copyPalette = async () => {
    const text = chatPalette(itemsRef.current.map((it) => it.variant)).trim();
    if (!text) return;
    const ok = await copyText(text);
    if (ok) {
      setStatus({ tone: 'success', text: S.status.copied(text.split('\n').length) });
      return;
    }
    /* 剪貼簿不能用：全選聊天面板文字，請使用者手動複製 */
    const ta = paletteArea.current;
    ta?.focus();
    ta?.select();
    setStatus({ tone: 'warning', text: S.status.copyMaybeFailed });
  };

  const reset = async () => {
    const api = ui.current;
    if (!api) return;
    const ok = await api.confirm({
      title: S.resetTitle,
      description: S.resetDescription,
      confirmLabel: S.resetConfirm,
      danger: true,
    });
    if (!ok) return;
    for (const it of itemsRef.current) URL.revokeObjectURL(it.url);
    commitItems([]);
    setSelectedId(null);
    latest.current.main = '';
    setMain('');
    latest.current.numbered = true;
    setNumbered(true);
    setStatus({ tone: 'info', text: S.status.reset });
  };

  const shortcuts: Shortcut[] = [
    {
      keys: 'mod+shift+o',
      label: S.keyOpen,
      group: S.keyGroupFiles,
      allowInInput: true,
      handler: () => void openPicker(),
    },
    {
      keys: 'mod+shift+e',
      label: S.keyExport,
      group: S.keyGroupFiles,
      allowInInput: true,
      handler: () => void exportZip(),
    },
    {
      keys: 'mod+shift+l',
      label: S.keyCopy,
      group: S.keyGroupEdit,
      allowInInput: true,
      handler: () => void copyPalette(),
    },
    {
      keys: 'mod+shift+n',
      label: S.keyNumbered,
      group: S.keyGroupEdit,
      allowInInput: true,
      handler: () => changeNumbered(!latest.current.numbered),
    },
    /* 由 window 的監聽處理（只列在說明裡） */
    { keys: ['arrowup', 'arrowdown'], label: S.keySelect, group: S.keyGroupEdit },
    /* 文字欄裡按 Esc 不觸發（主控裁定）；說明視窗開著時由視窗自己關閉 */
    { keys: 'escape', label: S.keyReset, group: '一般', handler: () => void reset() },
  ];

  const usage = <Usage />;

  const settings = (
    <>
      <Section title={S.sectionLoad} fixed>
        <FileDrop
          multiple
          clickable
          accept={ACCEPT}
          filterByAccept={false}
          icon={<ImagePlus />}
          label={S.dropLabel}
          buttonLabel={S.dropButton}
          hint={S.dropHint}
          onFiles={addFiles}
        />
      </Section>
      <Section title={S.sectionNaming} fixed>
        <Field label={S.mainName} hint={S.mainHint}>
          <TextInput
            value={main}
            placeholder={S.mainPlaceholder}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              latest.current.main = e.target.value;
              setMain(e.target.value);
            }}
          />
        </Field>
        <Field label={S.numbered} hint={S.numberedHint} layout="inline">
          <Toggle checked={numbered} onCheckedChange={changeNumbered} />
        </Field>
      </Section>
      <Section
        title={S.sectionList}
        fixed
        description={items.length ? S.listHint : undefined}
        actions={
          <span className="text-xs text-muted" data-testid="file-count">
            {S.fileCount(items.length)}
          </span>
        }
      >
        <div ref={listBox} className="max-h-[min(70dvh,640px)] overflow-y-auto p-0.5">
          <ThumbnailList
            aria-label={S.listLabel}
            layout="list"
            numbered
            thumbSize={82}
            empty={S.listEmpty}
            items={items.map((it) => ({ ...it, name: it.file.name, image: it.url }))}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
            onReorder={reorder}
            onRemove={remove}
            removeLabel={(it) => S.remove(it.name)}
            /* 每列的 pr-8：右上角的移除按鈕不蓋住差分名欄 */
            renderFields={(item, i) => (
              <div className="flex min-w-0 flex-col gap-1 pr-8">
                <TextInput
                  aria-label={S.variantLabel(i + 1)}
                  value={item.variant}
                  placeholder={S.variantPlaceholder}
                  list={datalistId}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => setVariant(item.id, e.target.value)}
                />
                <div className="flex min-w-0 items-baseline gap-1.5 text-xs">
                  <span className="shrink-0 text-muted">{S.outputLabel}</span>
                  <span
                    className="min-w-0 truncate font-mono text-fg"
                    title={names[i]}
                    data-testid="output-name"
                  >
                    {names[i]}
                  </span>
                </div>
              </div>
            )}
          />
        </div>
        <datalist id={datalistId}>
          {SUGGESTIONS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </Section>
      <p className="m-0 px-1 text-xs text-muted">{S.disclaimer}</p>
    </>
  );

  const preview = (
    <>
      <UiBridge api={ui} />
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            icon={<Download />}
            loading={busy}
            disabled={!items.length}
            onClick={() => void exportZip()}
          >
            {S.exportZip}
          </Button>
          <Button variant="ghost" icon={<RotateCcw />} onClick={() => void reset()}>
            {S.reset}
          </Button>
          <span
            className="ml-auto min-w-0 truncate font-mono text-xs text-muted"
            data-testid="zip-name"
          >
            {S.zipName(zipFileName(main))}
          </span>
        </div>
        <Notice tone={status.tone}>
          <span data-testid="status-text">{status.text}</span>
        </Notice>
      </div>

      <section aria-label={S.previewLabel} className="flex flex-col gap-2">
        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
          <dt className="text-muted">{S.variantTag}</dt>
          <dd className="m-0 min-w-0 truncate font-semibold text-fg" data-testid="selected-variant">
            {selected ? selected.variant || S.variantEmpty : S.noImage}
          </dd>
          <dt className="text-muted">{S.outputLabel}</dt>
          <dd className="m-0 min-w-0 truncate font-mono text-fg" data-testid="selected-output">
            {selected ? names[selectedIndex] : S.noFileName}
          </dd>
        </dl>
        <BigPreview item={selected} alt={selected ? selected.file.name : ''} />
      </section>

      <section
        aria-label={S.suggestionsTitle}
        className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3"
      >
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h2 className="m-0 text-sm font-semibold text-fg">{S.suggestionsTitle}</h2>
          <span className="text-xs text-muted">{S.suggestionsHint}</span>
        </div>
        <Chips
          aria-label={S.suggestionsTitle}
          items={SUGGESTIONS}
          value={selected ? selected.variant : null}
          onPick={pickSuggestion}
        />
      </section>

      <section
        aria-labelledby={paletteTitleId}
        className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-baseline gap-2">
            <h2 id={paletteTitleId} className="m-0 text-sm font-semibold text-fg">
              {S.paletteTitle}
            </h2>
            <span className="text-xs text-muted" data-testid="palette-lines">
              {S.paletteLines(paletteLines)}
            </span>
          </div>
          <Button
            icon={<ClipboardCopy />}
            disabled={!paletteLines}
            onClick={() => void copyPalette()}
          >
            {S.copy}
          </Button>
        </div>
        <TextArea
          ref={paletteArea}
          readOnly
          aria-labelledby={paletteTitleId}
          aria-describedby={paletteHintId}
          value={palette}
          rows={5}
          placeholder={S.palettePlaceholder}
          spellCheck={false}
          className="font-mono"
        />
        <p id={paletteHintId} className="m-0 text-xs text-muted">
          {S.paletteHint}
        </p>
      </section>
    </>
  );

  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={usage}
      shortcuts={shortcuts}
      settings={settings}
      preview={preview}
    />
  );
}
