/**
 * 右欄：團報預覽（共用的 PostEditor）＋文字樣式快速切換列＋復原、重做、重新產生、清除預覽。
 * 規格：docs/refactor/specs/session-report.md 1.8、3.8、3.9。
 */
import { Eraser, Redo2, RotateCcw, Undo2 } from 'lucide-react';
import type { KeyboardEvent, RefObject } from 'react';
import { UNICODE_TEXT_STYLES } from '@/core/social';
import { Button, IconButton, PostEditor, type PostEditorHandle, withShortcut } from '@/ui';
import { preview, setField, usePreview, useReport } from './store';
import { S } from './strings';

/** 預覽區裡的 Ctrl／⌘＋Z、Ctrl／⌘＋Shift＋Z、Ctrl＋Y：取代瀏覽器內建的復原（F48、F49） */
export function handlePreviewUndoKeys(e: KeyboardEvent<HTMLElement>) {
  if (e.nativeEvent.isComposing || !(e.metaKey || e.ctrlKey) || e.altKey) return;
  const key = e.key.toLowerCase();
  const isRedo = (key === 'z' && e.shiftKey) || (key === 'y' && !e.shiftKey);
  const isUndo = key === 'z' && !e.shiftKey;
  if (!isUndo && !isRedo) return;
  e.preventDefault();
  if (isRedo) preview.redo();
  else preview.undo();
}

function StyleBar() {
  const fontStyle = useReport((s) => s.data.fontStyle);
  return (
    // biome-ignore lint/a11y/useSemanticElements: 一組切換按鈕，不是表單分組
    <div
      role="group"
      aria-label={S.preview.styleBar}
      className="flex flex-wrap gap-1"
      data-testid="style-bar"
    >
      {UNICODE_TEXT_STYLES.map((st) => (
        <IconButton
          key={st.id}
          label={st.label}
          size="sm"
          variant="secondary"
          pressed={fontStyle === st.id}
          icon={<span className="font-ui text-[15px] leading-none">{st.sample}</span>}
          onClick={() => {
            /* F11：快速切換列先記一步復原（選單、快捷鍵不記） */
            preview.push();
            setField('fontStyle', st.id);
          }}
        />
      ))}
    </div>
  );
}

export function PreviewPanel({
  editorRef,
  onRegenerate,
}: {
  editorRef: RefObject<PostEditorHandle | null>;
  onRegenerate: () => void;
}) {
  const text = usePreview((s) => s.text);
  const dirty = usePreview((s) => s.dirty);
  const canUndo = usePreview((s) => s.past.length > 0);
  const canRedo = usePreview((s) => s.future.length > 0);

  const actions = (
    <>
      <IconButton
        label={withShortcut(S.preview.undo, 'mod+z')}
        icon={<Undo2 />}
        disabled={!canUndo}
        onClick={() => preview.undo()}
      />
      <IconButton
        label={withShortcut(S.preview.redo, 'shift+mod+z')}
        icon={<Redo2 />}
        disabled={!canRedo}
        onClick={() => preview.redo()}
      />
      <Button
        size="sm"
        variant="ghost"
        icon={<RotateCcw />}
        title={withShortcut(S.preview.regenerateTitle, 'mod+alt+code:keyr')}
        onClick={onRegenerate}
      >
        {S.preview.regenerate}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        icon={<Eraser />}
        onClick={() => {
          preview.clear();
          editorRef.current?.focus();
        }}
      >
        {S.preview.clear}
      </Button>
    </>
  );

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 只是攔下預覽區裡的復原快捷鍵
    <div className="flex min-w-0 flex-col gap-2" onKeyDown={handlePreviewUndoKeys}>
      <PostEditor
        ref={editorRef}
        value={text}
        onChange={(next) => preview.edit(next)}
        title={S.preview.title}
        label={S.preview.label}
        placeholder={S.preview.placeholder}
        toolbar={<StyleBar />}
        actions={actions}
        copyLabel={S.preview.copy}
        copyTitle={withShortcut(S.preview.copy, 'mod+enter')}
        postLabel={S.preview.post}
        postTitle={withShortcut(S.preview.post, 'mod+shift+p')}
        messages={{ copied: S.preview.copied, postEmpty: S.preview.postEmpty }}
        hint={S.preview.hint}
      />
      {dirty ? (
        <p className="m-0 px-1 text-xs text-muted" data-testid="dirty-note">
          {S.preview.dirty}
        </p>
      ) : null}
    </div>
  );
}
