/**
 * 左欄：劇本內文（F01～F10）與「以選取內容建卡」（F11～F13）。
 * - 內文區：貼上或編輯，每次輸入立即自動存檔並重算搜尋。
 * - 開啟 TXT 檔：BOM／UTF-8，不是 UTF-8 時試 Big5（第 7 節裁定），依 3.1 整理後取代內文。
 * - 搜尋：計數、搜尋鈕、上一個／下一個、搜尋欄 Enter／Shift＋Enter（第一次 Enter 選第 1 個，第 7 節裁定）。
 * - 焦點在內文區且有選取時按 C（可加 Shift）建卡。
 */
import { ChevronDown, ChevronUp, Eraser, FileText, Search, SquarePlus } from 'lucide-react';
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { decodeText, pickFiles, readAsBytes } from '@/core/files';
import { Button, cn, IconButton, Select, TextInput, withShortcut } from '@/ui';
import { selectInTextarea } from './dom';
import {
  type CardType,
  findMatches,
  normalizeImport,
  projectNameFromFile,
  SEARCH_START,
  type SearchCursor,
  searchCountText,
  searchStep,
  TYPE_OPTIONS,
} from './logic';
import {
  clearText,
  createFromSelection,
  importText,
  notify,
  setSelectionType,
  setText,
  usePrefs,
  useWorkspace,
} from './store';
import { S } from './strings';

/** 搜尋選取後內文區外框亮起的時間（F08：約 0.65 秒） */
const SEARCH_FLASH_MS = 650;

export function SourcePanel() {
  const text = useWorkspace((s) => s.data.text);
  const selectionType = usePrefs((s) => s.data.selectionType);
  const area = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState('');
  /* 目前位置跟著「內文＋關鍵字」：任一個改變就回到第 1 個、還沒選取（3.6） */
  const [search, setSearch] = useState<{ text: string; query: string; cursor: SearchCursor }>({
    text,
    query,
    cursor: SEARCH_START,
  });
  const cursor = search.text === text && search.query === query ? search.cursor : SEARCH_START;
  const matches = useMemo(() => findMatches(text, query), [text, query]);
  const [flash, setFlash] = useState(0);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(0), SEARCH_FLASH_MS);
    return () => clearTimeout(t);
  }, [flash]);

  const select = (next: SearchCursor) => {
    const m = matches[next.index];
    const ta = area.current;
    if (!m || !ta) return;
    setSearch({ text, query, cursor: next });
    selectInTextarea(ta, m.start, m.end);
    setFlash((n) => n + 1);
    /* 有些瀏覽器聚焦後會自己調整捲動：下一個畫面再確認一次選取範圍 */
    requestAnimationFrame(() => {
      if (document.activeElement !== ta) ta.focus({ preventScroll: true });
      if (ta.selectionStart !== m.start || ta.selectionEnd !== m.end)
        ta.setSelectionRange(m.start, m.end, 'forward');
    });
  };

  const canSearch = () => {
    if (!query) {
      notify(S.status.needQuery, 'warning');
      return false;
    }
    if (!matches.length) {
      notify(S.status.notFound(query), 'warning');
      return false;
    }
    return true;
  };

  /** 「搜尋」：選第 1 個（F08） */
  const searchFirst = () => {
    if (canSearch()) select({ index: 0, visited: true });
  };

  /** 上一個／下一個（F09） */
  const step = (dir: 1 | -1) => {
    if (!canSearch()) return;
    const next = searchStep(cursor, matches.length, dir);
    if (next) select(next);
  };

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    e.preventDefault();
    step(e.shiftKey ? -1 : 1);
  };

  const fromSelection = () => {
    const ta = area.current;
    if (!ta) return;
    createFromSelection(ta.value, ta.selectionStart, ta.selectionEnd);
  };

  /** F13：焦點在內文區且有選取時，C（可加 Shift，不能加 Ctrl／Alt／⌘）建卡，字母不打進內文 */
  const onAreaKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key.toLowerCase() !== 'c' || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.nativeEvent.isComposing) return;
    const ta = e.currentTarget;
    if (ta.selectionStart === ta.selectionEnd) return;
    e.preventDefault();
    fromSelection();
  };

  /** F02：開啟 TXT 檔 */
  const openTxt = async () => {
    const [file] = await pickFiles({ accept: '.txt,text/plain' });
    if (!file) return;
    try {
      const decoded = decodeText(await readAsBytes(file));
      importText(normalizeImport(decoded.text), projectNameFromFile(file.name) || null);
      notify(
        decoded.lossy
          ? S.status.txtLoadedLossy(file.name)
          : decoded.encoding === 'big5'
            ? S.status.txtLoadedBig5(file.name)
            : S.status.txtLoaded(file.name),
        decoded.lossy ? 'warning' : 'success',
        { undoable: true },
      );
    } catch {
      notify(S.status.txtFailed(file.name), 'danger');
    }
  };

  return (
    <section
      aria-labelledby="sc-source-title"
      className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface p-3 lg:h-full lg:min-h-0"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="sc-source-title" className="m-0 mr-auto text-base font-semibold text-fg">
          {S.sourceTitle}
        </h2>
        <Button size="sm" icon={<FileText />} onClick={() => void openTxt()}>
          {S.openTxt}
        </Button>
        <Button size="sm" variant="ghost" icon={<Eraser />} onClick={clearText}>
          {S.clearText}
        </Button>
      </div>

      <search className="flex flex-wrap items-center gap-1.5">
        <TextInput
          type="search"
          aria-label={S.searchLabel}
          placeholder={S.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onSearchKey}
          autoComplete="off"
          spellCheck={false}
          className="min-w-40 flex-1"
        />
        <div className="flex items-center gap-1">
          <Button size="md" icon={<Search />} onClick={searchFirst}>
            {S.searchButton}
          </Button>
          <IconButton
            label={withShortcut(S.searchPrev, 'shift+enter')}
            icon={<ChevronUp />}
            variant="secondary"
            onClick={() => step(-1)}
          />
          <IconButton
            label={withShortcut(S.searchNext, 'enter')}
            icon={<ChevronDown />}
            variant="secondary"
            onClick={() => step(1)}
          />
          <output
            aria-label={S.searchCount}
            className="min-w-14 text-right font-mono text-xs text-muted tabular-nums"
            data-testid="search-count"
          >
            {query ? searchCountText(cursor, matches.length) : '0 / 0'}
          </output>
        </div>
      </search>

      <textarea
        ref={area}
        aria-label={S.sourceLabel}
        value={text}
        placeholder={S.sourcePlaceholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onAreaKey}
        spellCheck={false}
        data-flash={flash ? '' : undefined}
        className={cn(
          'block h-[45dvh] min-h-60 w-full min-w-0 resize-y rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-sm leading-relaxed text-fg placeholder:text-muted lg:h-auto lg:min-h-40 lg:flex-1 lg:resize-none',
          'transition-[border-color,box-shadow] duration-(--duration-fast) hover:border-accent',
          'selection:bg-warning selection:text-warning-contrast',
          flash && 'border-warning ring-3 ring-warning/40',
        )}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Select<CardType>
          aria-label={S.selectionType}
          value={selectionType}
          onValueChange={setSelectionType}
          options={TYPE_OPTIONS}
          className="w-40"
        />
        <Button variant="primary" icon={<SquarePlus />} onClick={fromSelection}>
          {S.createFromSelection}
        </Button>
        <p className="m-0 min-w-0 basis-full text-xs text-muted sm:basis-auto sm:flex-1">
          {S.selectionHint}
        </p>
      </div>
    </section>
  );
}
