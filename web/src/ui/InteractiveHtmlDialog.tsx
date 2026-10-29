/**
 * 互動 HTML 與分享連結的對話框（scratch-card 做出來、clue-map 一起用的共用版）。
 *
 * - `InteractiveHtmlDialog`：產生互動 HTML（`build`，非同步）→ 程式碼（可複製、顯示大小）、「下載 HTML」（獨立網頁檔）、
 *   「開新視窗」。`build` 的身分一變（依賴的內容變了）就重新產生，所以呼叫端用 `useCallback` 包。
 *   `extra` 放在說明和程式碼之間（例如 scratch-card 的「上傳的圖片改成待填的網址」開關）。
 * - `ShareLinkDialog`：分享連結（呼叫端算好 `url`，算的過程中是 null）→ 可複製的連結、「開啟連結」；
 *   `tooLong` 時只顯示說明（連結超過上限，讀回時會被忽略）。標題旁的字數是 `#` 後面的字數（和上限同一個量法），
 *   寫成 `strings.count(n, maxLength)`，例如「內容 7,998 字（上限 8,000 字）」。
 *
 * 文字全部由呼叫端用 `strings` 帶入（各工具自己的用詞）。核心零件在 `@/core/interactive`、`@/core/share`。
 *
 * ```tsx
 * const build = useCallback(() => buildMyHtml(state), [state]);
 * <InteractiveHtmlDialog open={open} onOpenChange={setOpen} build={build} fileName="調查熱點圖.html" strings={S.html} />
 * <ShareLinkDialog open={open} onOpenChange={setOpen} url={url} tooLong={tooLong} maxLength={8000} strings={S.share} />
 * ```
 */
import { Download, ExternalLink } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { downloadText, formatBytes } from '@/core/files';
import { type InteractiveHtml, openHtmlWindow } from '@/core/interactive';
import { shareHashLength } from '@/core/share';
import { Button, buttonClass } from './Button';
import { Dialog } from './Dialog';
import { Notice } from './Notice';
import { TextOutputPanel } from './TextOutputPanel';
import { useToast } from './Toast';

export interface InteractiveHtmlStrings {
  title: string;
  lead: string;
  /** 對話框裡的說明（程式碼上方） */
  note: string;
  generating: string;
  /** 失敗時的前綴（後面接錯誤訊息） */
  failed: string;
  /** 程式碼區的標題（也是輸出欄的無障礙名稱） */
  code: string;
  copy: string;
  copied: string;
  /** 標題旁的大小（參數是已經格式化的大小，例如「12.3 KB」） */
  size: (bytes: string) => string;
  download: string;
  open: string;
  popupBlocked: string;
  popupBlockedHint: string;
}

export interface InteractiveHtmlDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  strings: InteractiveHtmlStrings;
  /** 產生互動 HTML；身分一變就重新產生（用 useCallback） */
  build: () => Promise<InteractiveHtml>;
  /** 下載的檔名 */
  fileName: string;
  /** 說明和程式碼之間的其他控制項 */
  extra?: ReactNode;
  'data-testid'?: string;
}

type HtmlState =
  | { kind: 'busy' }
  | { kind: 'done'; snippet: string; standalone: string }
  | { kind: 'error'; message: string };

export function InteractiveHtmlDialog({
  open,
  onOpenChange,
  strings: s,
  build,
  fileName,
  extra,
  'data-testid': testId,
}: InteractiveHtmlDialogProps) {
  const toast = useToast();
  const [state, setState] = useState<HtmlState>({ kind: 'busy' });

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setState({ kind: 'busy' });
    build().then(
      (r) => alive && setState({ kind: 'done', ...r }),
      (e) =>
        alive && setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      alive = false;
    };
  }, [open, build]);

  const done = state.kind === 'done' ? state : null;
  const openWindow = () => {
    if (!done) return;
    if (!openHtmlWindow(done.standalone))
      toast({ title: s.popupBlocked, description: s.popupBlockedHint, tone: 'danger' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={s.title} description={s.lead} size="lg">
      <div className="flex min-w-0 flex-col gap-3" data-testid={testId}>
        <p className="m-0 text-sm text-muted">{s.note}</p>
        {extra}
        {state.kind === 'busy' ? (
          <Notice tone="progress">{s.generating}</Notice>
        ) : state.kind === 'error' ? (
          <Notice tone="danger">
            {s.failed} {state.message}
          </Notice>
        ) : (
          <TextOutputPanel
            text={state.snippet}
            title={s.code}
            count={(t) => s.size(formatBytes(new Blob([t]).size))}
            copyLabel={s.copy}
            messages={{ copied: s.copied }}
            wrap="off"
            font="mono"
            className="max-h-[40dvh] overflow-auto"
          />
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            icon={<Download />}
            disabled={!done}
            onClick={() =>
              done && downloadText(done.standalone, fileName, 'text/html;charset=utf-8')
            }
          >
            {s.download}
          </Button>
          <Button icon={<ExternalLink />} disabled={!done} onClick={openWindow}>
            {s.open}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export interface ShareLinkStrings {
  title: string;
  lead: string;
  note: string;
  /** 算連結的過程中的說明 */
  generating: string;
  /** 連結太長時的說明 */
  tooLong: string;
  /** 連結區的標題 */
  link: string;
  copy: string;
  copied: string;
  /**
   * 標題旁的字數：n 是連結 `#` 後面的字數（和上限同一個量法），max 是 `maxLength`。
   * 例：`內容 7,998 字（上限 8,000 字）`（同 floor-plan 的分享對話框）
   */
  count: (n: number, max: number) => string;
  open: string;
}

export interface ShareLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  strings: ShareLinkStrings;
  /** 完整的分享網址；還在算（例如讀圖片的像素）時 null */
  url: string | null;
  /** 連結超過上限 */
  tooLong: boolean;
  /** 連結 `#` 後面的字數上限（只用來顯示；判斷是否太長由呼叫端用 `shareTooLong` 做，才會是同一個量法） */
  maxLength: number;
  'data-testid'?: string;
  /** 關閉後把焦點還給這個元素（選填，見 Dialog 的 returnFocus；ambience-mixer 新增，不給時行為不變） */
  returnFocus?: HTMLElement | null;
}

/** 網址 `#` 後面的字數（沒有 # 時 0；和 `shareTooLong` 同一個量法） */
const hashChars = (url: string): number => {
  const i = url.indexOf('#');
  return i < 0 ? 0 : shareHashLength(url.slice(i));
};

export function ShareLinkDialog({
  open,
  onOpenChange,
  strings: s,
  url,
  tooLong,
  maxLength,
  'data-testid': testId,
  returnFocus,
}: ShareLinkDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={s.title}
      description={s.lead}
      size="lg"
      returnFocus={returnFocus}
    >
      <div className="flex min-w-0 flex-col gap-3" data-testid={testId}>
        <p className="m-0 text-sm text-muted">{s.note}</p>
        {url === null ? (
          <Notice tone="progress">{s.generating}</Notice>
        ) : tooLong ? (
          <Notice tone="danger">{s.tooLong}</Notice>
        ) : (
          <>
            <TextOutputPanel
              text={url}
              title={s.link}
              count={(t) => s.count(hashChars(t), maxLength)}
              copyLabel={s.copy}
              messages={{ copied: s.copied }}
              className="max-h-[30dvh] overflow-auto"
            />
            <div className="flex flex-wrap gap-2">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClass('secondary', 'md')}
              >
                <ExternalLink aria-hidden className="size-4" />
                {s.open}
              </a>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
