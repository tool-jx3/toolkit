/**
 * 工具外框：頁首＋主體（設定面板＋預覽區）＋頁尾（靈感來源）。
 * - ≥ 1024 px：左邊設定、右邊預覽（預覽固定在畫面上，內容太長時自己捲動）。
 * - < 1024 px：上下排列，預覽在上。
 * - 已包好 UiProvider（提示、通知、確認對話框）；傳入 shortcuts 會自動綁定，並可按「?」看說明。
 */
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { getTool, type Inspiration } from '@/registry';
import { Dialog, DialogClose } from './Dialog';
import { InspirationFooter } from './InspirationFooter';
import { ShortcutHelp } from './ShortcutHelp';
import { type Shortcut, useShortcuts } from './shortcuts';
import { ToolHeader } from './ToolHeader';
import { UiProvider } from './UiProvider';

export interface ToolShellProps {
  /** registry 裡的工具 id（決定標題、群組分頁、靈感來源） */
  toolId: string;
  /** 覆寫標題 */
  title?: string;
  /** 覆寫靈感來源（null 不顯示） */
  inspiration?: Inspiration | null;
  /** 設定面板（Tabs／Section／Field） */
  settings?: ReactNode;
  /** 預覽區（Stage、Transport、ExportPanel） */
  preview?: ReactNode;
  /**
   * 整頁內容：給了就取代「設定＋預覽」兩欄（例如開頁先顯示的範本一覽），頁首、頁尾照舊。
   * 不給時行為不變。
   */
  body?: ReactNode;
  /** 頁首右側的按鈕 */
  headerActions?: ReactNode;
  shortcuts?: readonly Shortcut[];
  /** 「說明」對話框的內容（通常與 UsageSection 相同） */
  usage?: ReactNode;
}

export function ToolShell({
  toolId,
  title,
  inspiration,
  settings,
  preview,
  headerActions,
  shortcuts = [],
  usage,
  body,
}: ToolShellProps) {
  const tool = getTool(toolId);
  const name = title ?? tool?.name ?? toolId;
  const [helpOpen, setHelpOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);

  useEffect(() => {
    document.title = `${name}｜TRPG Toolkit`;
  }, [name]);

  const all = useMemo<Shortcut[]>(
    () =>
      shortcuts.length
        ? [
            ...shortcuts,
            { keys: '?', label: '顯示快捷鍵', group: '一般', handler: () => setKeysOpen(true) },
          ]
        : [],
    [shortcuts],
  );
  useShortcuts(all);

  return (
    <UiProvider>
      <div className="flex min-h-dvh flex-col bg-bg text-fg">
        {body === undefined ? (
          <a
            href="#tool-preview"
            className="sr-only rounded-md bg-accent px-3 py-2 text-accent-contrast focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
          >
            跳到預覽
          </a>
        ) : null}
        <ToolHeader
          toolId={toolId}
          title={name}
          actions={headerActions}
          onHelp={usage ? () => setHelpOpen(true) : undefined}
          onShortcuts={all.length ? () => setKeysOpen(true) : undefined}
        />
        {body !== undefined ? (
          <main className="mx-auto flex w-full max-w-[1600px] min-w-0 flex-1 flex-col gap-4 p-3 lg:p-4">
            {body}
          </main>
        ) : (
          <main className="mx-auto grid w-full max-w-[1600px] flex-1 grid-cols-1 items-start gap-4 p-3 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)] lg:p-4">
            <aside aria-label="設定" className="order-2 flex min-w-0 flex-col gap-3 lg:order-1">
              {settings}
            </aside>
            <section
              id="tool-preview"
              aria-label="預覽"
              tabIndex={-1}
              className="order-1 flex min-w-0 flex-col gap-3 outline-none lg:sticky-pane lg:order-2"
            >
              {preview}
            </section>
          </main>
        )}
        <InspirationFooter
          inspiration={inspiration === undefined ? tool?.inspiration : inspiration}
        />
      </div>
      {all.length ? (
        <ShortcutHelp shortcuts={all} open={keysOpen} onOpenChange={setKeysOpen} />
      ) : null}
      {usage ? (
        <Dialog
          open={helpOpen}
          onOpenChange={setHelpOpen}
          title={`${name}：使用方式`}
          footer={<DialogClose />}
        >
          <div className="text-sm leading-relaxed [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
            {usage}
          </div>
        </Dialog>
      ) : null}
    </UiProvider>
  );
}
