/**
 * CoC 劇本排版工具：左邊寫劇本（分色文字欄＋封面與概要），右邊即時排成書頁；列印成 PDF、儲存列印用 HTML。
 * 規格：docs/refactor/specs/coc-typesetter.md。
 *
 * 版面（ToolShell 的 body 自己排）：上方設定列；寬畫面（≥ 1024 px）左右兩欄、整頁佔滿視窗高；
 * 窄畫面「編輯／預覽」切換一次顯示一區，設定列可以收起。最下面是狀態列。
 */
import { ChevronDown, ChevronUp, FileDown, FilePlus2, HelpCircle, Printer } from 'lucide-react';
import { type CSSProperties, useMemo, useState } from 'react';
import { useSaveError } from '@/core/storage';
import {
  Button,
  cn,
  Notice,
  Segmented,
  Select,
  type Shortcut,
  Tabs,
  ToolShell,
  useConfirm,
  useToast,
  withShortcut,
} from '@/ui';
import { THEMES } from './bookCss';
import { Editor, FoldButtonsToggle, SlashHint } from './Editor';
import { HelpDialog } from './HelpDialog';
import { MetaForm } from './MetaForm';
import {
  blankMeta,
  PAPER_IDS,
  type PaperId,
  type Settings,
  THEME_IDS,
  type ThemeId,
  ZOOM_CHOICES,
} from './model';
import { downloadPrintHtml, printBook } from './output';
import { Preview } from './Preview';
import { SAMPLE_META, SAMPLE_TEXT } from './sample';
import { doc, TOOL_ID, updateDoc, useDoc, useUiPrefs } from './store';
import { S, THEME_NAMES } from './strings';
import { editorApi, metaApi, type Pane, previewApi, type SubTab, setView, useView } from './view';

const setSetting = <K extends keyof Settings>(k: K, v: Settings[K]) =>
  updateDoc((d) => {
    d.settings[k] = v;
  });

/** 配色的色塊（兩種代表色）；滑鼠停留顯示名稱 */
const SWATCH: Record<ThemeId, [string, string]> = {
  mono: [THEMES.mono.ink, '#ffffff'],
  antique: [THEMES.antique.accent, THEMES.antique['cover-bg']],
  night: [THEMES.night['cover-bg'], THEMES.night.num],
};

function Swatch({ theme }: { theme: ThemeId }) {
  const [a, b] = SWATCH[theme];
  return (
    <span
      title={THEME_NAMES[theme]}
      className="inline-block size-4 rounded-full shadow-[0_0_0_1px_rgba(127,127,127,.5)]"
      style={{ background: `linear-gradient(135deg, ${a} 50%, ${b} 50%)` } as CSSProperties}
    />
  );
}

/* ---------- 輸出 ---------- */

/** 列印成 PDF：先把還沒排的變更排好，只印紙面 */
function printNow(): void {
  const book = previewApi.flush();
  if (!book) return;
  const d = doc();
  void printBook({ title: d.meta.title, paper: d.settings.paper, theme: d.settings.theme, book });
}

function useSaveHtml() {
  const toast = useToast();
  return () => {
    const book = previewApi.flush();
    if (!book) return;
    const d = doc();
    const name = downloadPrintHtml({ title: d.meta.title, paper: d.settings.paper, book });
    toast({ title: S.toast.saved(name), tone: 'success' });
  };
}

/* ---------- 設定列 ---------- */

function Toolbar({ onHelp }: { onHelp: () => void }) {
  const s = useDoc((st) => st.data.settings);
  const foldBar = useUiPrefs((st) => st.data.foldBar);
  const patchUi = useUiPrefs((st) => st.patch);
  const pane = useView((v) => v.pane);
  const confirm = useConfirm();
  const toast = useToast();
  const saveHtml = useSaveHtml();

  const zoomValue = s.zoom === 'auto' ? 'auto' : String(s.zoom);
  const zoomOptions = useMemo(() => {
    const opts = [
      { value: 'auto', label: S.toolbar.fit },
      ...ZOOM_CHOICES.map((z) => ({ value: String(z), label: S.toolbar.custom(z) })),
    ];
    if (s.zoom !== 'auto' && !ZOOM_CHOICES.includes(s.zoom))
      opts.push({ value: String(s.zoom), label: S.toolbar.custom(s.zoom) });
    return opts;
  }, [s.zoom]);

  const newDoc = async () => {
    const ok = await confirm({
      title: S.confirm.newTitle,
      description: S.confirm.newDesc,
      confirmLabel: S.confirm.newOk,
      danger: true,
    });
    if (!ok) return;
    updateDoc((d) => {
      d.text = '';
      d.meta = blankMeta();
    });
    previewApi.scrollTop();
    editorApi.scrollTop();
    setView({ pane: 'edit', sub: 'meta' });
    metaApi.focusTitle();
    toast({ title: S.toast.newDone, tone: 'success' });
  };

  return (
    <div className="flex flex-col gap-2" role="toolbar" aria-label={S.toolbar.label}>
      {/* 窄畫面：收合設定、編輯／預覽 */}
      <div className="flex items-center gap-2 lg:hidden">
        <Button
          size="sm"
          variant="secondary"
          aria-expanded={!foldBar}
          icon={foldBar ? <ChevronDown /> : <ChevronUp />}
          onClick={() => patchUi({ foldBar: !foldBar })}
        >
          {S.toolbar.fold}
        </Button>
        <Segmented<Pane>
          aria-label={S.toolbar.pane}
          className="ml-auto"
          value={pane}
          onValueChange={(v) => setView({ pane: v })}
          options={[
            { value: 'edit', label: S.toolbar.paneEdit },
            { value: 'preview', label: S.toolbar.panePreview },
          ]}
        />
      </div>
      <div
        className={cn('flex flex-wrap items-center gap-x-4 gap-y-2', foldBar && 'max-lg:hidden')}
        data-testid="coc-settings"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted" id="coc-paper-label">
            {S.toolbar.paper}
          </span>
          <Segmented<PaperId>
            aria-labelledby="coc-paper-label"
            size="sm"
            value={s.paper}
            onValueChange={(v) => setSetting('paper', v)}
            options={PAPER_IDS.map((p) => ({ value: p, label: p }))}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted" id="coc-theme-label">
            {S.toolbar.theme}
          </span>
          <Segmented<ThemeId>
            aria-labelledby="coc-theme-label"
            size="sm"
            value={s.theme}
            onValueChange={(v) => setSetting('theme', v)}
            options={THEME_IDS.map((t) => ({
              value: t,
              label: '',
              icon: <Swatch theme={t} />,
              ariaLabel: THEME_NAMES[t],
            }))}
          />
          <span
            className="hidden min-w-[6em] text-xs text-muted xl:inline"
            data-testid="coc-theme-name"
          >
            {THEME_NAMES[s.theme]}
          </span>
        </div>
        <fieldset className="m-0 flex flex-wrap items-center gap-1 border-0 p-0">
          <legend className="sr-only">{S.toolbar.options}</legend>
          {(['cover', 'toc', 'chapter', 'header'] as const).map((k) => (
            <Button
              key={k}
              size="sm"
              variant={s[k] ? 'primary' : 'secondary'}
              aria-pressed={s[k]}
              className="rounded-full"
              onClick={() => setSetting(k, !s[k])}
            >
              {S.options[k]}
            </Button>
          ))}
        </fieldset>
        <Select
          aria-label={S.toolbar.zoom}
          size="sm"
          className="w-28"
          value={zoomValue}
          onValueChange={(v) => setSetting('zoom', v === 'auto' ? 'auto' : Number(v))}
          options={zoomOptions}
        />
        <div className="flex flex-wrap items-center gap-1.5 max-sm:grid max-sm:w-full max-sm:grid-cols-2 lg:ml-auto">
          <Button size="sm" icon={<FilePlus2 />} onClick={() => void newDoc()}>
            {S.toolbar.newDoc}
          </Button>
          <Button size="sm" icon={<HelpCircle />} onClick={onHelp}>
            {S.toolbar.help}
          </Button>
          <Button size="sm" icon={<FileDown />} title={S.toolbar.saveHtmlTitle} onClick={saveHtml}>
            {S.toolbar.saveHtml}
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={<Printer />}
            title={withShortcut(S.toolbar.printTitle, 'mod+p')}
            onClick={printNow}
          >
            {S.toolbar.print}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---------- 編輯區 ---------- */

function EditorPane() {
  const sub = useView((v) => v.sub);
  return (
    <Tabs<SubTab>
      aria-label={S.editor.tabs}
      value={sub}
      onValueChange={(v) => setView({ sub: v })}
      keepMounted
      className="h-full min-h-0 [&>[role=tabpanel]]:min-h-0 [&>[role=tabpanel]]:flex-1 [&>[role=tabpanel]]:pt-0 [&>[role=tabpanel][data-state=active]]:flex [&>[role=tabpanel]]:flex-col"
      listClassName="px-3 items-end"
      items={[
        { value: 'text', label: S.editor.tabText, content: <Editor /> },
        { value: 'meta', label: S.editor.tabMeta, content: <MetaForm /> },
      ]}
    />
  );
}

/* ---------- 狀態列 ---------- */

function StatusBar() {
  const st = useView((v) => v.status);
  const saveError = useSaveError(TOOL_ID);
  return (
    <div
      data-testid="coc-status"
      className="flex flex-wrap items-center gap-x-4 gap-y-0.5 px-1 text-xs text-muted"
    >
      {st ? (
        <>
          <span>{S.status.chars(st.chars)}</span>
          <span>{S.status.heads(st.chapters + st.scenes, st.chapters, st.scenes)}</span>
          <span>{S.status.pages(st.paper, st.pages)}</span>
          {st.over ? (
            <span className="font-bold text-danger" data-testid="coc-over">
              {S.status.over(st.over)}
            </span>
          ) : null}
        </>
      ) : null}
      {saveError ? <span className="text-warning">{S.status.saveFailed}</span> : null}
      <span className="ml-auto hidden lg:inline">{S.preview.tip}</span>
    </div>
  );
}

const SHORTCUTS: Shortcut[] = [
  { keys: '/', label: S.shortcuts.open, group: S.shortcuts.group },
  { keys: ['arrowup', 'arrowdown'], label: S.shortcuts.move, group: S.shortcuts.group },
  { keys: ['enter', 'tab'], label: S.shortcuts.insert, group: S.shortcuts.group },
  { keys: 'escape', label: S.shortcuts.close, group: S.shortcuts.group },
  {
    keys: 'mod+p',
    label: S.shortcuts.print,
    group: S.shortcuts.output,
    allowInInput: true,
    handler: (e) => {
      e.preventDefault();
      printNow();
    },
  },
];

function Body() {
  const pane = useView((v) => v.pane);
  const error = useView((v) => v.error);
  const [helpOpen, setHelpOpen] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();

  const loadSample = async () => {
    const ok = await confirm({
      title: S.confirm.sampleTitle,
      description: S.confirm.sampleDesc,
      confirmLabel: S.confirm.sampleOk,
      danger: true,
    });
    if (!ok) return;
    updateDoc((d) => {
      d.text = SAMPLE_TEXT;
      d.meta = structuredClone(SAMPLE_META);
    });
    setHelpOpen(false);
    toast({ title: S.toast.sampleDone, tone: 'success' });
  };

  return (
    <div
      className="flex min-h-0 flex-col gap-2 lg:h-[calc(100dvh-8.5rem)] lg:min-h-[560px]"
      data-testid="coc-root"
    >
      <Toolbar onHelp={() => setHelpOpen(true)} />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 lg:grid-cols-[minmax(320px,44%)_minmax(0,1fr)]">
        <section
          aria-label={S.editor.region}
          className={cn(
            'flex h-[78dvh] min-h-[420px] flex-col overflow-hidden rounded-lg border border-border bg-surface lg:h-auto lg:min-h-0',
            pane !== 'edit' && 'max-lg:hidden',
          )}
        >
          <div className="relative flex min-h-0 flex-1 flex-col">
            <EditorPane />
            <div className="pointer-events-none absolute top-0 right-3 flex h-9 items-center gap-2 [&>*]:pointer-events-auto">
              <span className="hidden lg:inline">
                <SlashHint />
              </span>
              <FoldButtonsToggle />
            </div>
          </div>
        </section>
        <section
          aria-label={S.preview.region}
          className={cn(
            'flex h-[78dvh] min-h-[420px] flex-col overflow-hidden rounded-lg border border-border lg:h-auto lg:min-h-0',
            pane !== 'preview' && 'max-lg:hidden',
          )}
        >
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <div className="min-h-0 flex-1">
            <Preview />
          </div>
        </section>
      </div>
      <StatusBar />
      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} onSample={() => void loadSample()} />
    </div>
  );
}

export function App() {
  return <ToolShell toolId={TOOL_ID} shortcuts={SHORTCUTS} body={<Body />} />;
}
