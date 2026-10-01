/**
 * 電腦字型清單對話框（「從清單選」）：列出這台電腦安裝的字型供挑選（桌面版 Chrome／Edge 的 Local Font Access）。
 *
 * - 第一次打開時向瀏覽器要求權限（瀏覽器會詢問），讀取期間顯示提示；拒絕或回傳空清單時說明如何在網站設定中允許，
 *   按「重新讀取」再試；以本機檔案開啟等無法讀取的情況顯示另一種說明。任何情況都可以直接手打字型名稱。
 * - 依家族名稱排序（同一家族只列一次），每一項是名稱＋用該字型顯示的樣張；樣張文字可改（預設含「永」字，看有沒有漢字）。
 * - 搜尋：以空白分隔多個關鍵字，全部都要符合（不分大小寫，比對家族名稱與完整名稱）；顯示「共 N 套」或「N 套之中的 M 套」。
 *   在搜尋欄按 Enter（不在輸入法選字中）選第一個符合的字型。
 * - 點一個字型就交給 onPick 並關閉；打開時標示目前的字型並捲到清單中央，焦點在搜尋欄。清單讀過一次就留著。
 */
import { RefreshCw, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  cachedLocalFonts,
  canQueryLocalFonts,
  filterLocalFonts,
  type LocalFontErrorKind,
  type LocalFontFamily,
  queryLocalFontFamilies,
} from '@/core/fonts';
import { Button } from './Button';
import { cn } from './cn';
import { Dialog, DialogClose } from './Dialog';
import { Notice } from './Notice';
import { TextInput } from './TextInput';

export interface LocalFontDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 目前欄位的字型名稱（會被標示並捲到中央） */
  value?: string;
  /** 選了一個字型 */
  onPick: (family: string) => void;
  /** 預設樣張文字（預設 LOCAL_FONT_SAMPLE：含「永」字與英數） */
  sampleText?: string;
  title?: string;
}

export const LOCAL_FONT_MESSAGES: Record<LocalFontErrorKind, string> = {
  denied:
    '沒有取得讀取電腦字型的權限。請按網址列左側的圖示，在網站設定裡把「字型」改成允許，再按「重新讀取」；也可以直接在欄位裡輸入字型名稱。',
  empty:
    '瀏覽器沒有回傳任何字型（通常是權限被擋）。請在網站設定裡允許「字型」後按「重新讀取」，或直接輸入字型名稱。',
  insecure: '以本機檔案開啟頁面時無法讀取電腦字型清單，請直接在欄位裡輸入字型名稱。',
  unsupported: '這個瀏覽器無法列出電腦上的字型（桌面版 Chrome、Edge 可以），請直接輸入字型名稱。',
  failed: '讀取電腦字型清單時發生錯誤，請按「重新讀取」，或直接輸入字型名稱。',
};

/** 電腦字型清單的預設樣張：含「永」字（看有沒有漢字、筆畫）與英數 */
export const LOCAL_FONT_SAMPLE = '永遠的冒險 Aa 123';

/** 瀏覽器能不能列出電腦字型（不能時「從清單選」按鈕應該隱藏） */
export const supportsLocalFontList = canQueryLocalFonts;

export function LocalFontDialog({
  open,
  onOpenChange,
  value = '',
  onPick,
  sampleText = LOCAL_FONT_SAMPLE,
  title = '從電腦字型清單選',
}: LocalFontDialogProps) {
  const [list, setList] = useState<LocalFontFamily[] | null>(() => cachedLocalFonts());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<LocalFontErrorKind | null>(null);
  const [q, setQ] = useState('');
  const [sample, setSample] = useState(sampleText);
  const search = useRef<HTMLInputElement>(null);
  const listBox = useRef<HTMLUListElement>(null);

  const load = async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      setList(await queryLocalFontFamilies({ force }));
    } catch (e) {
      setError((e as { kind?: LocalFontErrorKind }).kind ?? 'failed');
    } finally {
      setLoading(false);
    }
  };

  /* 第一次打開時讀取（在使用者點擊的當下，瀏覽器才會詢問權限） */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在打開時讀一次
  useEffect(() => {
    if (!open) return;
    setQ('');
    const cached = cachedLocalFonts();
    if (cached) setList(cached);
    else void load();
  }, [open]);

  const shown = useMemo(() => (list ? filterLocalFonts(list, q) : []), [list, q]);
  const current = value.trim().toLowerCase();

  /* 打開時把目前的字型捲到中央 */
  useEffect(() => {
    if (!open || !list) return;
    const id = requestAnimationFrame(() => {
      const el = listBox.current?.querySelector<HTMLElement>('[aria-current="true"]');
      el?.scrollIntoView({ block: 'center' });
    });
    return () => cancelAnimationFrame(id);
  }, [open, list]);

  const pick = (family: string) => {
    onPick(family);
    onOpenChange(false);
  };

  const count =
    list === null
      ? ''
      : q.trim()
        ? `${list.length} 套之中的 ${shown.length} 套`
        : `共 ${list.length} 套`;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="點一個字型就會填進字型名稱欄。"
      size="md"
      initialFocus={search}
      footer={<DialogClose>關閉</DialogClose>}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-40 flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted"
            />
            <TextInput
              ref={search}
              aria-label="搜尋電腦字型"
              placeholder="搜尋（空白分隔多個關鍵字）"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.keyCode === 229) return;
                e.preventDefault();
                if (shown[0]) pick(shown[0].family);
              }}
              className="pl-8"
            />
          </div>
          <span className="text-xs text-muted tabular-nums" role="status">
            {count}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="shrink-0 text-muted" aria-hidden>
            樣張
          </span>
          <TextInput
            aria-label="樣張文字"
            value={sample}
            onChange={(e) => setSample(e.target.value)}
          />
        </div>
        {loading ? (
          <Notice tone="progress">正在讀取電腦上的字型…（瀏覽器可能會詢問是否允許）</Notice>
        ) : null}
        {error ? (
          <Notice
            tone="warning"
            action={
              error === 'insecure' || error === 'unsupported' ? null : (
                <Button size="sm" icon={<RefreshCw />} onClick={() => load(true)}>
                  重新讀取
                </Button>
              )
            }
          >
            {LOCAL_FONT_MESSAGES[error]}
          </Notice>
        ) : null}
        {list ? (
          shown.length ? (
            <ul
              ref={listBox}
              aria-label="電腦字型"
              className="flex max-h-[50dvh] flex-col gap-1 overflow-y-auto pr-1"
            >
              {shown.map((f) => {
                const isCurrent = f.family.toLowerCase() === current;
                return (
                  <li
                    key={f.family}
                    style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 52px' }}
                  >
                    <button
                      type="button"
                      aria-current={isCurrent ? 'true' : undefined}
                      onClick={() => pick(f.family)}
                      className={cn(
                        'flex w-full min-w-0 flex-col items-start rounded-md border px-3 py-1.5 text-left hover:bg-surface-2',
                        isCurrent ? 'border-accent bg-accent-soft' : 'border-transparent',
                      )}
                    >
                      <span className="flex w-full items-center gap-2 text-sm text-fg">
                        <span className="truncate">{f.family}</span>
                        {isCurrent ? (
                          <span className="shrink-0 rounded-sm bg-accent px-1.5 text-xs text-accent-contrast">
                            使用中
                          </span>
                        ) : null}
                      </span>
                      <span
                        className="w-full truncate text-base text-muted"
                        style={{ fontFamily: `"${f.family.replace(/"/g, '')}", var(--font-ui)` }}
                      >
                        {sample || f.family}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="m-0 py-6 text-center text-sm text-muted">沒有符合的字型</p>
          )
        ) : null}
      </div>
    </Dialog>
  );
}
