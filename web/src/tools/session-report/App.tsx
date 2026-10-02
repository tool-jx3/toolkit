/**
 * 團報產生器：填系統、劇本、主持人與參加者，選範本與文字樣式，即時產生貼到 X 的團報文。
 * 預覽可以直接修改（之後改輸入時保留手動的部分）、插入文字裝飾、復原／重做、複製或開啟 X 的發文畫面。
 * 跑團紀錄簿送來的一團在開頁時詢問讀入。
 * 規格：docs/refactor/specs/session-report.md（第 7 節主控裁定優先）。
 *
 * 版面（ToolShell 的 body）：寬螢幕左邊輸入、右邊預覽（固定在畫面上）；窄螢幕上下排列，預覽在上。
 */
import { Trash2 } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { clearPendingReportImport, readPendingReportImport } from '@/core/sessions';
import { UNICODE_TEXT_STYLE_IDS } from '@/core/social';
import {
  Button,
  isMac,
  type PostEditorHandle,
  type Shortcut,
  ToolShell,
  useChoice,
  useConfirm,
  useConfirmedReset,
  useToast,
} from '@/ui';
import { InputPanel } from './InputPanel';
import { applyImportItem } from './importLog';
import { defaultSettings } from './model';
import { PreviewPanel } from './PreviewPanel';
import { renderReport, todayText } from './report';
import { preview, setField, TOOL_ID, useReport } from './store';
import { S } from './strings';
import { TEMPLATE_IDS } from './templates';

function Usage() {
  return (
    <>
      <p>{S.usage.intro}</p>
      <ol className="mt-2">
        {S.usage.steps.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <p className="mt-2 font-semibold">{S.usage.notesTitle}</p>
      <ul>
        {S.usage.notes.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <p className="mt-2 text-muted">{S.disclaimer}</p>
    </>
  );
}

const cycle = <T,>(list: readonly T[], current: T, step: number): T => {
  const i = Math.max(0, list.indexOf(current));
  return list[(i + step + list.length) % list.length];
};

/** 換範本／文字樣式（F51、F52；不記復原） */
export const cycleTemplate = (step: number) =>
  setField('template', cycle(TEMPLATE_IDS, useReport.getState().data.template, step));
export const cycleStyle = (step: number) =>
  setField('fontStyle', cycle(UNICODE_TEXT_STYLE_IDS, useReport.getState().data.fontStyle, step));

/** 交接資料只在開頁時檢查一次（開發模式的 StrictMode 會掛載兩次） */
let pendingChecked = false;

/** 開頁時讀取跑團紀錄簿送來的一團（F41～F45） */
function PendingImport() {
  const choose = useChoice();
  const confirm = useConfirm();
  const toast = useToast();
  useEffect(() => {
    if (pendingChecked) return;
    pendingChecked = true;
    void (async () => {
      const payload = readPendingReportImport();
      if (payload === null) return;
      if (payload === 'broken') {
        const ok = await confirm({
          title: S.pending.brokenTitle,
          description: S.pending.brokenDescription,
          confirmLabel: S.pending.brokenConfirm,
          cancelLabel: S.pending.brokenCancel,
          danger: true,
        });
        if (ok) clearPendingReportImport();
        return;
      }
      const item = payload.items[0];
      if (!item) return;
      const how = await choose({
        title: S.pending.title,
        description: S.pending.description,
        choices: [
          { value: 'load', label: S.pending.load },
          { value: 'discard', label: S.pending.discard, variant: 'danger' },
        ],
        cancelLabel: S.pending.later,
      });
      if (how === 'discard') clearPendingReportImport();
      if (how !== 'load') return;
      preview.push();
      useReport.getState().replace(applyImportItem(useReport.getState().data, item));
      clearPendingReportImport();
      toast({ title: S.pending.loaded, tone: 'success' });
    })();
  }, [choose, confirm, toast]);
  return null;
}

/** 頁首的「清除輸入」（F39；新版先確認） */
function ResetButton({ onReset }: { onReset: () => void }) {
  const confirmReset = useConfirmedReset({
    title: S.header.resetTitle,
    description: S.header.resetDescription,
    confirmLabel: S.header.resetConfirm,
  });
  return (
    <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => void confirmReset(onReset)}>
      <span className="max-sm:sr-only">{S.header.resetAll}</span>
    </Button>
  );
}

export function App() {
  const editor = useRef<PostEditorHandle>(null);
  const settings = useReport((s) => s.data);
  const [today, setToday] = useState(() => todayText());
  const generated = useMemo(() => renderReport(settings, today), [settings, today]);
  const generatedRef = useRef(generated);
  generatedRef.current = generated;

  /* 輸入改變 → 新的團報（有手動編輯時照 3.8 保留） */
  useLayoutEffect(() => {
    preview.generated(generated);
  }, [generated]);

  const regenerate = () => {
    preview.regenerate(generatedRef.current);
    editor.current?.focus();
  };

  const resetAll = () => {
    const t = todayText();
    const fresh = defaultSettings();
    useReport.getState().replace(fresh);
    useReport.temporal.getState().clear();
    setToday(t);
    preview.reset(renderReport(fresh, t));
  };

  /*
   * 焦點在選單（Radix Select 的按鈕）上時，它會把方向鍵拿去展開選單、一般的快捷鍵收不到；
   * 在捕獲階段先攔下 Ctrl／⌘＋Alt＋方向鍵（F51、F52）。
   */
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const mod = isMac() ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
      if (!mod || !e.altKey || e.shiftKey) return;
      if (!(e.target as Element | null)?.closest?.('[role="combobox"]')) return;
      const step = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -1, ArrowRight: 1 }[e.key];
      if (step === undefined) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') cycleTemplate(step);
      else cycleStyle(step);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const shortcuts: Shortcut[] = [
    {
      keys: ['mod+shift+c', 'mod+enter'],
      label: S.keys.copy,
      group: S.keys.groupOutput,
      allowInInput: true,
      handler: () => void editor.current?.copy(),
    },
    {
      keys: ['mod+shift+p', 'mod+shift+enter'],
      label: S.keys.post,
      group: S.keys.groupOutput,
      allowInInput: true,
      handler: () => editor.current?.post(),
    },
    {
      keys: 'mod+z',
      label: S.keys.undo,
      group: S.keys.groupPreview,
      handler: () => preview.undo(),
    },
    {
      keys: ['shift+mod+z', 'mod+y'],
      label: S.keys.redo,
      group: S.keys.groupPreview,
      handler: () => preview.redo(),
    },
    {
      keys: 'mod+e',
      label: S.keys.focus,
      group: S.keys.groupPreview,
      allowInInput: true,
      handler: () => editor.current?.focus({ atEnd: true }),
    },
    {
      keys: 'mod+alt+code:keyr',
      label: S.keys.regenerate,
      group: S.keys.groupPreview,
      allowInInput: true,
      handler: regenerate,
    },
    {
      keys: 'mod+alt+arrowup',
      label: S.keys.templatePrev,
      group: S.keys.groupSwitch,
      allowInInput: true,
      handler: () => cycleTemplate(-1),
    },
    {
      keys: 'mod+alt+arrowdown',
      label: S.keys.templateNext,
      group: S.keys.groupSwitch,
      allowInInput: true,
      handler: () => cycleTemplate(1),
    },
    {
      keys: 'mod+alt+arrowleft',
      label: S.keys.stylePrev,
      group: S.keys.groupSwitch,
      allowInInput: true,
      handler: () => cycleStyle(-1),
    },
    {
      keys: 'mod+alt+arrowright',
      label: S.keys.styleNext,
      group: S.keys.groupSwitch,
      allowInInput: true,
      handler: () => cycleStyle(1),
    },
  ];

  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={<Usage />}
      shortcuts={shortcuts}
      headerActions={<ResetButton onReset={resetAll} />}
      body={
        <>
          <PendingImport />
          <div className="grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(400px,560px)]">
            <section aria-label="輸入" className="order-2 min-w-0 lg:order-1">
              <InputPanel today={today} onInsert={(t) => editor.current?.insert(t)} />
            </section>
            <section
              aria-label="預覽"
              className="order-1 min-w-0 lg:sticky lg:top-16 lg:order-2 lg:max-h-[calc(100dvh-5rem)] lg:overflow-y-auto"
            >
              <PreviewPanel editorRef={editor} onRegenerate={regenerate} />
            </section>
          </div>
          <p className="m-0 px-1 text-xs text-muted" data-testid="disclaimer">
            {S.disclaimer}
          </p>
        </>
      }
    />
  );
}
