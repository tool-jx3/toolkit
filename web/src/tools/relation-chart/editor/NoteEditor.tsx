/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 便利貼的就地編輯（原作的 openNoteEditor、placeNoteEditor、closeNoteEditor）：一個「不像輸入框」的 textarea
 * 疊在便利貼的文字區（位置、大小、字級、行高和畫出來的文字對齊），SVG 那份文字讓位（note-editing）。
 * 打字即時寫進專案；整段編輯＝一步復原（內容真的變了才記）；Esc＝放棄這次的修改並收起；點畫布別的地方或失去焦點＝收起。
 * 按鍵不往外傳（Delete、Ctrl＋Z 不會刪角色或復原畫布）。
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { fontStack, type SheetCtx } from '../engine/geom';
import { NOTE_LH, noteFontSize, noteLook, noteTextPad } from '../engine/notes';
import { NOTE_BAR } from '../model/notes';
import type { Note } from '../model/types';
import { updateNote } from '../state/noteActions';
import { holdHistory, releaseHistory, setUi, useUi } from '../state/store';
import { S } from '../strings';

/** 收起編輯中的便利貼（畫布的 pointerdown 會 preventDefault，焦點不會自己離開） */
export function closeNoteEditor(): void {
  const el = document.querySelector<HTMLTextAreaElement>('[data-note-editor]');
  if (el && document.activeElement === el) el.blur();
  else if (useUi.getState().noteEdit !== null) setUi({ noteEdit: null });
}

function Editor({ note, ctx, pad }: { note: Note; ctx: SheetCtx; pad: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const before = useRef(note.text);
  const reverting = useRef(false);
  const view = useUi((u) => u.view);
  /* 一段編輯＝一步復原：打開時開始、收起時結束（內容沒變就不記） */
  useEffect(() => {
    holdHistory('note');
    const el = ref.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
    return () => {
      queueMicrotask(() => releaseHistory('note'));
    };
  }, []);
  /* 專案裡的字被別的地方改了（復原）時跟上 */
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && el.value !== note.text) el.value = note.text;
  }, [note.text]);
  const fs = noteFontSize(ctx, note);
  const tp = noteTextPad(fs);
  const z = view.zoom;
  const x0 = note.x - note.w / 2;
  const y0 = note.y - note.h / 2;
  const look = noteLook(ctx.s.palette);
  return (
    <textarea
      ref={ref}
      data-rc-overlay
      data-note-editor
      aria-label={S.note.edit}
      defaultValue={note.text}
      spellCheck={false}
      className="absolute z-20 m-0 resize-none overflow-auto border-0 bg-transparent p-0 outline-none"
      style={{
        left: view.x + (pad + x0 + tp) * z,
        top: view.y + (pad + y0 + NOTE_BAR + tp * 0.5) * z,
        width: Math.max(1, (note.w - tp * 2) * z),
        height: Math.max(1, (note.h - NOTE_BAR - tp) * z),
        fontSize: `${(fs * z).toFixed(1)}px`,
        lineHeight: String(NOTE_LH),
        fontFamily: fontStack(ctx.docFont, ctx.fontIds),
        fontWeight: 400,
        color: look.ink,
        caretColor: look.ink,
        scrollbarWidth: 'none',
      }}
      onChange={(e) => {
        const v = e.target.value;
        updateNote(note.id, (n) => {
          n.text = v.slice(0, 20000);
        });
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          reverting.current = true;
          updateNote(note.id, (n) => {
            n.text = before.current;
          });
          setUi({ noteEdit: null });
        }
      }}
      onBlur={() => {
        if (!reverting.current) setUi({ noteEdit: null });
      }}
    />
  );
}

/** 畫布上的編輯框（沒有在編輯＝什麼都不畫） */
export function NoteEditor({
  notes,
  ctx,
  pad,
}: {
  notes: readonly Note[];
  ctx: SheetCtx;
  pad: number;
}) {
  const id = useUi((u) => u.noteEdit);
  const n = id === null ? undefined : notes.find((x) => x.id === id);
  /* 便利貼不見了（刪掉、復原、換分頁）＝收起 */
  useEffect(() => {
    if (id !== null && (!n || n.chart)) setUi({ noteEdit: null });
  }, [id, n]);
  if (!n || n.chart) return null;
  return <Editor key={n.id} note={n} ctx={ctx} pad={pad} />;
}
