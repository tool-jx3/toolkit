/**
 * 全視窗拖放：檔案拖進視窗任何地方時整個畫面出現「放開即可加入」的覆蓋層，拖出或放開後消失；
 * 放開時把檔案與放開的位置（clientX／Y）交給 onDrop——例如依放開的位置決定新角色在盤面上的位置
 * （PanZoomViewportHandle.clientToWorld）。頁面上其他拖放區（FileDrop）已經處理的放開不會重複處理。
 *
 * ```tsx
 * <WindowDrop accept="image/*" onDrop={(files, at) => addFiles(files, viewport.current?.clientToWorld(at.clientX, at.clientY))}
 *   hint="建議用透明背景的 PNG／WebP" />
 * ```
 */
import { ImagePlus } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { filesInMemory, matchesAccept } from '@/core/files';
import { cn } from './cn';

export interface WindowDropProps {
  onDrop: (files: File[], at: { clientX: number; clientY: number }) => void;
  /** 同 <input accept>；不符合的檔案交給 onReject */
  accept?: string;
  onReject?: (files: File[]) => void;
  /** 覆蓋層的主要文字（預設「放開即可加入」） */
  label?: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  /**
   * 交給 onDrop 前先把檔案讀進記憶體（預設 true，見 `@/core/files` 的 filesInMemory：Android 的相片挑選器給的檔案，
   * 讀取權限之後會失效）。false：直接交出原本的 File。
   */
  readNow?: boolean;
  className?: string;
  /**
   * 覆蓋層出現／消失時呼叫（拖著檔案進入視窗＝true；拖出、放開、停用＝false）。工具可以據此讓自己的載入區變醒目
   * （psd-studio 移植時新增，不給時行為不變）。
   */
  onActiveChange?: (active: boolean) => void;
}

export function WindowDrop({
  onDrop,
  accept,
  onReject,
  label = '放開即可加入',
  hint,
  icon = <ImagePlus />,
  disabled,
  readNow = true,
  className,
  onActiveChange,
}: WindowDropProps) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const cb = useRef({ onDrop, onReject, accept, onActiveChange, readNow });
  cb.current = { onDrop, onReject, accept, onActiveChange, readNow };
  const reported = useRef(false);
  useEffect(() => {
    if (reported.current === over) return;
    reported.current = over;
    cb.current.onActiveChange?.(over);
  }, [over]);

  useEffect(() => {
    if (disabled) {
      setOver(false);
      return;
    }
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current++;
      setOver(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) setOver(false);
    };
    const overHandler = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const drop = (e: DragEvent) => {
      depth.current = 0;
      setOver(false);
      if (!hasFiles(e)) return;
      if (e.defaultPrevented) return;
      e.preventDefault();
      const files = Array.from(e.dataTransfer?.files ?? []);
      const { accept: acc } = cb.current;
      const ok = files.filter((f) => matchesAccept(f, acc));
      const bad = files.filter((f) => !matchesAccept(f, acc));
      if (bad.length) cb.current.onReject?.(bad);
      if (!ok.length) return;
      const at = { clientX: e.clientX, clientY: e.clientY };
      if (!cb.current.readNow) cb.current.onDrop(ok, at);
      else void filesInMemory(ok).then((list) => cb.current.onDrop(list, at));
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', overHandler);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', overHandler);
      window.removeEventListener('drop', drop);
    };
  }, [disabled]);

  if (!over) return null;
  return (
    <div
      aria-hidden
      data-testid="window-drop"
      className={cn(
        'pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-overlay p-6',
        className,
      )}
    >
      <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-accent bg-surface px-8 py-6 text-center shadow-2">
        <span className="text-accent [&_svg]:size-8">{icon}</span>
        <span className="text-base font-semibold text-fg">{label}</span>
        {hint ? <span className="text-sm text-muted">{hint}</span> : null}
      </div>
    </div>
  );
}
