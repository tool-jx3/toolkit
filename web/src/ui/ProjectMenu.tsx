/**
 * 專案選單：存成專案檔（.json；有附加檔案時 .zip）、開啟專案檔、重設；旁邊顯示自動存檔狀態。
 * 專案檔格式見 core/storage/project.ts（開啟時自動分辨 JSON 或 ZIP）。
 * 檔名、確認與重設的文字可以換；存檔／開啟的結果也可以交給工具（onNotify、onSaved、onLoadError、
 * onLoad 的第四個參數），讓工具寫進自己的狀態列。
 */
import { ChevronDown, FolderOpen, RotateCcw, Save } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { type ReactNode, useState } from 'react';
import { downloadBytes, downloadText, fileNameWithExt, pickFiles, readAsBytes } from '@/core/files';
import {
  type ParsedProject,
  type ProjectBinary,
  type ProjectFile,
  ProjectFileError,
  parseProjectBytes,
  serializeProject,
  serializeProjectZip,
} from '@/core/storage/project';
import { buttonClass } from './Button';
import { cn } from './cn';
import { type ConfirmOptions, useConfirm } from './Dialog';
import { useToast } from './Toast';

/** 專案選單的結果通知（給了 onNotify 時改用它，不跳通知；工具可以寫進自己的狀態列） */
export interface ProjectNotice {
  kind: 'saved' | 'opened' | 'open-failed' | 'reset';
  tone: 'success' | 'danger' | 'info';
  /** 存檔或開啟的檔名 */
  fileName?: string;
  /** 開啟失敗的原因（可直接顯示） */
  message?: string;
}

export interface ProjectMenuProps<T> {
  /** 工具 id（寫進專案檔，開啟時檢查） */
  toolId: string;
  /** 專案資料的版本（資料結構改變時加 1） */
  version?: number;
  /** 取得要存的資料 */
  getData: () => T;
  /**
   * 開啟專案檔後套用（回傳 false 或丟錯表示資料不合用，會顯示錯誤；可以是 async）。
   * files：ZIP 專案檔附帶的檔案（名稱 → 位元組；JSON 專案檔是空的）；source：使用者選的檔案（顯示檔名用）。
   */
  onLoad: (
    data: T,
    file: ProjectFile<T>,
    files: Map<string, Uint8Array>,
    source: File,
  ) => unknown;
  onReset: () => void;
  /** 最後自動存檔時間（毫秒）；null 表示還沒存過 */
  savedAt?: number | null;
  /** 專案檔名（不含副檔名，預設工具 id）；會接上「_YYYYMMDD」 */
  fileName?: string;
  /** 自訂完整檔名（不含副檔名，例如 `height-board_20261001-1551`）；給了就不用 fileName 的規則 */
  fileNameFor?: (now: Date) => string;
  /** 完整檔名（含副檔名，例：`messagebox.message-box.json`）；給了就照用，不加日期、不改副檔名 */
  exactFileName?: string;
  /** 完整檔名的函式版（含副檔名，例：`chatwindow.chatwindow.json`） */
  saveFileName?: () => string;
  /**
   * 附加的二進位檔（圖片等）：有給時存成 ZIP（project.json＋files/…）。
   * 例：`getFiles={() => assets.exportFiles(ids)}`
   */
  getFiles?: () => ProjectBinary[] | Promise<ProjectBinary[]>;
  /** 存檔前檢查：回傳文字時不存，改顯示這段訊息（例如「還沒有角色」） */
  beforeSave?: () => string | null | undefined;
  /**
   * 開啟前的確認：
   * - 不給或 true：讀檔後詢問「目前的設定會被取代」（原本的行為）
   * - false 或 null：不確認
   * - ConfirmOptions 或函式：**在選檔之前**詢問（取消就不開選檔視窗），函式可以依目前狀態決定
   */
  confirmOpen?: boolean | ConfirmOptions | null | (() => ConfirmOptions | null);
  /** 開啟成功後的通知（預設「已開啟專案檔」） */
  openedMessage?: string;
  /** 結果通知：給了就呼叫它，不顯示 toast（onSaved／onLoadError 仍會呼叫） */
  onNotify?: (notice: ProjectNotice) => void;
  /** 存好專案檔之後（例如寫進工具自己的狀態列） */
  onSaved?: (fileName: string) => void;
  /** 開啟專案檔失敗時（訊息可直接顯示） */
  onLoadError?: (message: string) => void;
  /** 重設的確認對話框（覆寫預設的標題、說明、按鈕文字） */
  resetConfirm?: Partial<ConfirmOptions>;
  /** 選單上重設項目的文字（預設「重設…」） */
  resetLabel?: ReactNode;
  /** 「重設」項目與確認對話框的文字（resetLabel／resetConfirm 的簡寫） */
  resetText?: { label?: string; title?: string; description?: string; confirmLabel?: string };
  /** 額外的選單項目 */
  extraItems?: ReactNode;
  className?: string;
}

const itemClass =
  'flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-fg outline-none data-highlighted:bg-accent-soft [&_svg]:size-4 [&_svg]:text-muted';

/** 選單項目（給 extraItems 用） */
export function ProjectMenuItem({
  children,
  onSelect,
  icon,
}: {
  children: ReactNode;
  onSelect: () => void;
  icon?: ReactNode;
}) {
  return (
    <DropdownMenu.Item className={itemClass} onSelect={onSelect}>
      {icon}
      {children}
    </DropdownMenu.Item>
  );
}

const time = (ms: number) =>
  new Date(ms).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });

const pad2 = (n: number) => String(n).padStart(2, '0');

export function ProjectMenu<T>({
  toolId,
  version = 1,
  getData,
  onLoad,
  onReset,
  savedAt,
  fileName,
  fileNameFor,
  getFiles,
  beforeSave,
  exactFileName,
  saveFileName,
  confirmOpen,
  openedMessage = '已開啟專案檔',
  onNotify,
  onSaved,
  onLoadError,
  resetConfirm,
  resetLabel,
  resetText,
  extraItems,
  className,
}: ProjectMenuProps<T>) {
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState<'save' | 'open' | null>(null);

  const save = async () => {
    const blocked = beforeSave?.();
    if (blocked) {
      toast({ title: blocked, tone: 'warning' });
      return;
    }
    const stamp = new Date();
    const exact = exactFileName ?? saveFileName?.();
    const base =
      fileNameFor?.(stamp) ??
      `${fileName ?? toolId}_${stamp.getFullYear()}${pad2(stamp.getMonth() + 1)}${pad2(stamp.getDate())}`;
    const done = (name: string) => {
      if (onNotify) onNotify({ kind: 'saved', tone: 'success', fileName: name });
      else toast({ title: '已存成專案檔', description: name, tone: 'success' });
      onSaved?.(name);
    };
    try {
      if (getFiles) {
        setBusy('save');
        const files = await getFiles();
        const name = exact ?? fileNameWithExt(base, 'zip');
        downloadBytes(
          serializeProjectZip(toolId, version, getData(), files, stamp),
          name,
          'application/zip',
        );
        done(name);
      } else {
        const name = exact ?? fileNameWithExt(base, 'json');
        downloadText(serializeProject(toolId, version, getData(), stamp), name, 'application/json');
        done(name);
      }
    } catch (e) {
      toast({
        title: '無法存成專案檔',
        description: e instanceof Error ? e.message : String(e),
        tone: 'danger',
      });
    } finally {
      setBusy(null);
    }
  };

  const open = async () => {
    const pre =
      typeof confirmOpen === 'function'
        ? confirmOpen()
        : typeof confirmOpen === 'object'
          ? confirmOpen
          : null;
    if (pre && !(await confirm(pre))) return;
    const [file] = await pickFiles({
      accept: getFiles ? '.zip,.json,application/zip,application/json' : '.json,application/json',
    });
    if (!file) return;
    setBusy('open');
    try {
      const project: ParsedProject<T> = parseProjectBytes<T>(await readAsBytes(file), toolId);
      if (confirmOpen === undefined || confirmOpen === true) {
        const ok = await confirm({
          title: '開啟專案檔？',
          description: `目前的設定會被「${file.name}」取代。`,
          confirmLabel: '開啟',
        });
        if (!ok) return;
      }
      if ((await onLoad(project.data, project, project.files, file)) === false)
        throw new ProjectFileError('專案檔的內容無法使用。');
      if (onNotify) onNotify({ kind: 'opened', tone: 'success', fileName: file.name });
      else toast({ title: openedMessage, description: file.name, tone: 'success' });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (onNotify) onNotify({ kind: 'open-failed', tone: 'danger', fileName: file.name, message });
      else toast({ title: '無法開啟專案檔', description: message, tone: 'danger' });
      onLoadError?.(message);
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    const ok = await confirm({
      title: resetText?.title ?? '重設所有設定？',
      description: resetText?.description ?? '會回到預設值（可以用「復原」回來）。',
      confirmLabel: resetText?.confirmLabel ?? '重設',
      danger: true,
      ...resetConfirm,
    });
    if (ok) {
      onReset();
      if (onNotify) onNotify({ kind: 'reset', tone: 'info' });
      else toast({ title: '已重設' });
    }
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span role="status" className="hidden text-xs text-muted sm:inline">
        {busy === 'open'
          ? '讀取專案檔中…'
          : busy === 'save'
            ? '準備專案檔中…'
            : savedAt
              ? `已自動儲存（${time(savedAt)}）`
              : '設定會自動儲存'}
      </span>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          className={buttonClass('secondary', 'sm')}
          disabled={busy !== null}
          aria-busy={busy !== null || undefined}
        >
          專案
          <ChevronDown aria-hidden className="size-3.5" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="z-50 min-w-48 rounded-md border border-border bg-surface p-1 shadow-2"
          >
            <DropdownMenu.Item className={itemClass} onSelect={save}>
              <Save aria-hidden />
              存成專案檔…
            </DropdownMenu.Item>
            <DropdownMenu.Item className={itemClass} onSelect={open}>
              <FolderOpen aria-hidden />
              開啟專案檔…
            </DropdownMenu.Item>
            {extraItems}
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            <DropdownMenu.Item
              className={cn(itemClass, 'text-danger [&_svg]:text-danger')}
              onSelect={reset}
            >
              <RotateCcw aria-hidden />
              {resetLabel ?? resetText?.label ?? '重設…'}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
