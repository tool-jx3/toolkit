/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 富文本編輯器（角色資訊；第四批的世界觀沿用）：原作 buildRichEditor 的工具列 17 顆
 * （粗體、斜體、底線、刪除線｜段落樣式、項目清單、編號清單、引用、分隔線｜文字顏色、文字底色、字級、對齊｜
 * 連結、插入圖片、表格、清除格式）。
 * - 資料是淨化過的 HTML（logic/rich 的白名單）；圖片存在資產庫，HTML 裡寫 `rcimg:<資產 id>`，顯示時換成網址。
 * - 打字停 0.5 秒淨化後寫入；一段編輯（聚焦到離開）＝一步復原（原作的 endBurst）。
 * - 工具列的鈕按下時不搶編輯區的選取（pointerdown 擋掉預設）；展開選單是工具列裡的小浮層。
 */
import {
  ALargeSmall,
  AlignLeft,
  Baseline,
  Bold,
  Heading,
  Highlighter,
  ImagePlus,
  Italic,
  Link,
  List,
  ListOrdered,
  RemoveFormatting,
  SeparatorHorizontal,
  Strikethrough,
  Table,
  TextQuote,
  Underline,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addImageFile } from '@/core/assets';
import { pickFiles } from '@/core/files';
import { Button, TextInput, useToast } from '@/ui';
import { richDocCss, richIsEmpty, sanitizeRichHtml } from '../logic/rich';
import { richImageIds } from '../model/normalize';
import { useImageUrls } from '../state/images';
import { assets, gesture } from '../state/store';
import { S } from '../strings';

/** 插入的圖片長邊上限（原作的 richReadImage） */
const IMG_MAX = 800;
const SWATCHES = [
  '#000000',
  '#5c5c5c',
  '#9e9e9e',
  '#ffffff',
  '#c0392b',
  '#e67e22',
  '#e5b84b',
  '#27ae60',
  '#16a085',
  '#2980b9',
  '#8e44ad',
  '#d35d8f',
];
const SIZES: [keyof typeof S.rich, number][] = [
  ['sizeS', 12],
  ['sizeM', 15],
  ['sizeL', 19],
  ['sizeXL', 24],
];
/** <font size> → px（fontSize 指令與部分貼上內容會產生 <font>） */
const FONT_PX: Record<number, number> = { 1: 10, 2: 12, 3: 15, 4: 18, 5: 24, 6: 32, 7: 40 };

export const RICH_DOC_CLASS = 'rc-rich-doc';
const DOC_CSS =
  richDocCss(`.${RICH_DOC_CLASS}`) +
  `.${RICH_DOC_CLASS}{--rd-line:var(--color-border);--rd-muted:var(--color-muted);--rd-link:var(--color-accent)}`;

/** 編輯器之外顯示文件時也要這份樣式 */
export function RichDocStyle() {
  return <style>{DOC_CSS}</style>;
}

/** 唯讀顯示一份文件（世界觀的「沿用」）：圖片換成網址 */
export function RichView({
  html,
  'data-testid': testId,
}: {
  html: string;
  'data-testid'?: string;
}) {
  const ids = useMemo(() => richImageIds(html), [html]);
  const urls = useImageUrls(ids);
  return (
    <div
      className={`${RICH_DOC_CLASS} min-h-[6rem] rounded-md border border-border bg-surface-2 p-2 text-sm`}
      data-testid={testId}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: 存的是淨化過的 HTML（logic/rich 的白名單）
      dangerouslySetInnerHTML={{ __html: display(html, (id) => urls.get(id)) }}
    />
  );
}

/* 開著的編輯器：匯出、存檔前要把還在等的內容寫進去 */
const live = new Set<() => void>();
export function flushRichEditors(): void {
  for (const f of live) f();
}

type Fly = 'heading' | 'color' | 'bg' | 'size' | 'align' | 'link' | 'table';

/**
 * 顯示用：rcimg 參照換成網址（記住資產 id，存回去時換回參照）。
 * 網址還沒到＝先不放 src（瀏覽器不認得 rcimg:，放了會多一筆載入失敗），到了再就地補上。
 */
function display(html: string, url: (id: string) => string | undefined): string {
  return html.replace(/src="rcimg:([0-9a-z-]{3,80})"/g, (_m, id: string) => {
    const u = url(id);
    return u ? `src="${u}" data-rcimg="${id}"` : `data-rcimg="${id}"`;
  });
}

/** <font> 換成白名單裡的 <span style>（就地，在淨化之前；原作的 normalizeFonts） */
function normalizeFonts(root: HTMLElement): void {
  for (const f of [...root.querySelectorAll('font')]) {
    const sp = document.createElement('span');
    const c = f.getAttribute('color');
    if (c) sp.style.color = c;
    const px = FONT_PX[Number(f.getAttribute('size'))];
    if (px) sp.style.fontSize = `${px}px`;
    while (f.firstChild) sp.appendChild(f.firstChild);
    f.replaceWith(sp);
  }
}

/** 編輯區的內容 → 要存的 HTML（圖片換回參照、淨化） */
function pack(ed: HTMLElement): string {
  normalizeFonts(ed);
  /* 複製到惰性文件再換 src：在頁面本身的文件裡設 rcimg: 會讓瀏覽器去載入（多一筆載入失敗） */
  const clone = document.implementation.createHTMLDocument('').importNode(ed, true) as HTMLElement;
  for (const img of clone.querySelectorAll('img')) {
    const id = img.getAttribute('data-rcimg');
    if (id) img.setAttribute('src', `rcimg:${id}`);
    img.removeAttribute('data-rcimg');
  }
  const html = sanitizeRichHtml(clone.innerHTML);
  return richIsEmpty(html) ? '' : html;
}

/** 貼進來的 data: 圖片搬進資產庫，換成參照（存的 HTML 一律是小字串） */
async function moveDataImages(html: string): Promise<string | null> {
  const found = [...html.matchAll(/src="(data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+)"/g)];
  if (!found.length) return null;
  let out = html;
  for (const m of found) {
    try {
      const blob = await (await fetch(m[1])).blob();
      const r = await addImageFile(assets, blob, { maxSide: IMG_MAX });
      out = out.replace(m[0], `src="rcimg:${r.ref.id}"`);
    } catch {
      out = out.replace(m[0], 'src=""');
    }
  }
  return sanitizeRichHtml(out);
}

function TbButton({
  label,
  icon,
  onClick,
  pressed,
  testId,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  pressed?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-expanded={pressed}
      className={`grid size-7 shrink-0 place-items-center rounded-sm text-fg hover:bg-surface-3 [&_svg]:size-4 ${pressed ? 'bg-surface-3' : ''}`}
      onPointerDown={(e) => e.preventDefault()}
      onClick={onClick}
      data-testid={testId}
    >
      {icon}
    </button>
  );
}

function FlyItem({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      className="block w-full rounded-sm px-2 py-1 text-left text-sm whitespace-nowrap hover:bg-accent-soft"
      onPointerDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />;

export interface RichEditorProps {
  /** 存著的 HTML（淨化過、圖片是 rcimg 參照） */
  value: string;
  /** 寫入（淨化過；空白＝''） */
  onChange: (html: string) => void;
  placeholder?: string;
  'aria-label'?: string;
  'data-testid'?: string;
  /** 編輯區的最小高度（CSS） */
  minHeight?: string;
}

export function RichEditor({
  value,
  onChange,
  placeholder,
  minHeight = '12rem',
  ...rest
}: RichEditorProps) {
  const toast = useToast();
  const ed = useRef<HTMLDivElement>(null);
  const range = useRef<Range | null>(null);
  const shown = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const burst = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [fly, setFly] = useState<Fly | null>(null);
  const [link, setLink] = useState('https://');
  const [empty, setEmpty] = useState(() => richIsEmpty(value));
  const ids = useMemo(() => richImageIds(value), [value]);
  const urls = useImageUrls(ids);
  const urlsRef = useRef(urls);
  urlsRef.current = urls;

  /* ---------- 寫入 ---------- */
  const commit = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const el = ed.current;
    if (!el) return;
    const html = pack(el);
    shown.current = html;
    onChangeRef.current(html);
    void moveDataImages(html).then((moved) => {
      if (moved === null || shown.current !== html) return;
      shown.current = moved;
      onChangeRef.current(moved);
      const cur = ed.current;
      if (cur && document.activeElement !== cur)
        cur.innerHTML = display(moved, (id) => urlsRef.current.get(id));
    });
  }, []);
  const queue = useCallback(() => {
    burst.current = true;
    if (ed.current) setEmpty(richIsEmpty(ed.current.innerHTML));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(commit, 500);
  }, [commit]);
  const flush = useCallback(() => {
    if (timer.current) commit();
  }, [commit]);

  useEffect(() => {
    live.add(flush);
    return () => {
      live.delete(flush);
      flush();
      if (burst.current) gesture.commit();
    };
  }, [flush]);

  /* ---------- 外面改了（換角色、復原）：重畫 ---------- */
  useEffect(() => {
    const el = ed.current;
    if (!el || value === shown.current) return;
    shown.current = value;
    el.innerHTML = display(value, (id) => urlsRef.current.get(id));
    setEmpty(richIsEmpty(value));
  }, [value]);
  /* 圖片的網址晚到：就地補上 */
  useEffect(() => {
    const el = ed.current;
    if (!el) return;
    for (const img of el.querySelectorAll('img[data-rcimg]')) {
      const u = urls.get(img.getAttribute('data-rcimg') ?? '');
      if (u && img.getAttribute('src') !== u) img.setAttribute('src', u);
    }
  }, [urls]);

  /* ---------- 選取（工具列的浮層要用） ---------- */
  useEffect(() => {
    const onSel = () => {
      const s = document.getSelection();
      const el = ed.current;
      if (!s?.rangeCount || !el) return;
      const r = s.getRangeAt(0);
      if (el.contains(r.commonAncestorContainer)) range.current = r.cloneRange();
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, []);
  /* 點浮層以外＝收起來 */
  useEffect(() => {
    if (!fly) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest?.('[data-rich-tb]')) setFly(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setFly(null);
      }
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [fly]);

  /**
   * 回到編輯區、還原選取。焦點不在編輯區（例如在「連結」浮層的輸入欄）時，focus() 會把游標放到開頭，
   * 所以一定換回存著的選取（7.8：選好的字要變成連結）。
   */
  const focusEd = (): HTMLDivElement | null => {
    const el = ed.current;
    if (!el) return null;
    const away = document.activeElement !== el;
    if (away) el.focus({ preventScroll: true });
    const s = document.getSelection();
    const r = range.current;
    if (s && r && el.contains(r.commonAncestorContainer)) {
      const cur = s.rangeCount ? s.getRangeAt(0) : null;
      if (away || !cur || !el.contains(cur.commonAncestorContainer)) {
        s.removeAllRanges();
        s.addRange(r);
      }
    }
    return el;
  };
  const exec = (cmd: string, val?: string) => {
    const el = focusEd();
    if (!el) return;
    try {
      document.execCommand('styleWithCSS', false, 'true');
    } catch {
      /* 舊瀏覽器 */
    }
    document.execCommand(cmd, false, val);
    normalizeFonts(el);
    queue();
  };
  const fontSize = (px: number) => {
    const el = focusEd();
    if (!el) return;
    /* styleWithCSS 下會給關鍵字字級（淨化器不收）：先產生 <font size=7> 再換成 px 的 span */
    try {
      document.execCommand('styleWithCSS', false, 'false');
    } catch {
      /* 舊瀏覽器 */
    }
    document.execCommand('fontSize', false, '7');
    for (const f of [...el.querySelectorAll('font[size="7"]')]) {
      const sp = document.createElement('span');
      sp.style.fontSize = `${px}px`;
      while (f.firstChild) sp.appendChild(f.firstChild);
      f.replaceWith(sp);
    }
    normalizeFonts(el);
    queue();
  };
  const cellAt = (): HTMLTableCellElement | null => {
    const el = ed.current;
    const r = range.current;
    const n = r?.startContainer;
    const e = n && (n.nodeType === 1 ? (n as Element) : n.parentElement);
    return e && el?.contains(e) ? (e.closest('td,th') as HTMLTableCellElement | null) : null;
  };
  const insertTable = (rows: number, cols: number) => {
    const tr = `<tr>${'<td><br></td>'.repeat(cols)}</tr>`;
    exec('insertHTML', `<table><tbody>${tr.repeat(rows)}</tbody></table><p><br></p>`);
  };
  const tableOp = (op: 'rowAdd' | 'colAdd' | 'rowDel' | 'colDel' | 'tblDel') => {
    const cell = cellAt();
    const tr = cell?.closest('tr');
    const tbl = cell?.closest('table');
    if (!cell || !tr || !tbl) return;
    const ci = cell.cellIndex;
    const rows = [...tbl.querySelectorAll('tr')];
    if (op === 'rowAdd') {
      const nr = document.createElement('tr');
      for (let i = 0; i < tr.cells.length; i++) {
        const td = document.createElement('td');
        td.innerHTML = '<br>';
        nr.appendChild(td);
      }
      tr.after(nr);
    } else if (op === 'colAdd') {
      for (const row of rows) {
        const ref = row.cells[Math.min(ci, row.cells.length - 1)];
        const td = document.createElement(ref?.tagName === 'TH' ? 'th' : 'td');
        td.innerHTML = '<br>';
        if (ref) ref.after(td);
        else row.appendChild(td);
      }
    } else if (op === 'rowDel') {
      if (rows.length <= 1) tbl.remove();
      else tr.remove();
    } else if (op === 'colDel') {
      if (tr.cells.length <= 1) tbl.remove();
      else for (const row of rows) if (row.cells[ci]) row.deleteCell(ci);
    } else tbl.remove();
    queue();
  };
  const insertImage = async (blob: Blob) => {
    try {
      const r = await addImageFile(assets, blob, { maxSide: IMG_MAX });
      const u = await assets.url(r.ref.id);
      exec('insertHTML', `<img ${u ? `src="${u}" ` : ''}data-rcimg="${r.ref.id}">`);
      if (!r.persisted) toast({ title: S.msg.imageNotSaved, tone: 'warning' });
    } catch {
      toast({ title: S.rich.imageFail, tone: 'warning' });
    }
  };
  const close = (fn: () => void) => () => {
    setFly(null);
    fn();
  };
  const toggle = (f: Fly) => setFly((x) => (x === f ? null : f));

  const colorFly = (apply: (c: string) => void) => (
    <div className="flex w-44 flex-col gap-1">
      <div className="grid grid-cols-6 gap-1">
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            aria-label={c}
            className="size-6 rounded-sm border border-border"
            style={{ background: c }}
            onPointerDown={(e) => e.preventDefault()}
            onClick={close(() => apply(c))}
          />
        ))}
      </div>
      <label className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-1 text-sm hover:bg-accent-soft">
        <input
          type="color"
          className="size-5 cursor-pointer border-0 bg-transparent p-0"
          onInput={(e) => apply((e.target as HTMLInputElement).value)}
          onChange={() => setFly(null)}
        />
        {S.rich.customColor}
      </label>
    </div>
  );

  const body: Record<Fly, ReactNode> = {
    heading: (
      <>
        <FlyItem onClick={close(() => exec('formatBlock', '<p>'))}>{S.rich.body}</FlyItem>
        <FlyItem onClick={close(() => exec('formatBlock', '<h1>'))}>{S.rich.h1}</FlyItem>
        <FlyItem onClick={close(() => exec('formatBlock', '<h2>'))}>{S.rich.h2}</FlyItem>
        <FlyItem onClick={close(() => exec('formatBlock', '<h3>'))}>{S.rich.h3}</FlyItem>
      </>
    ),
    color: colorFly((c) => exec('foreColor', c)),
    bg: colorFly((c) => exec('hiliteColor', c)),
    size: (
      <>
        {SIZES.map(([k, px]) => (
          <FlyItem key={k} onClick={close(() => fontSize(px))}>
            {S.rich[k] as string}
          </FlyItem>
        ))}
      </>
    ),
    align: (
      <>
        <FlyItem onClick={close(() => exec('justifyLeft'))}>{S.rich.alignL}</FlyItem>
        <FlyItem onClick={close(() => exec('justifyCenter'))}>{S.rich.alignC}</FlyItem>
        <FlyItem onClick={close(() => exec('justifyRight'))}>{S.rich.alignR}</FlyItem>
      </>
    ),
    link: (
      <form
        className="flex w-64 max-w-full flex-col gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          const u = link.trim();
          setFly(null);
          if (/^https?:\/\/\S+$/i.test(u)) exec('createLink', u);
        }}
      >
        <span className="text-xs text-muted">{S.rich.linkPrompt}</span>
        <div className="flex gap-1">
          <TextInput
            value={link}
            onChange={(e) => setLink(e.target.value)}
            aria-label={S.rich.linkPrompt}
            className="h-7 min-w-0 flex-1 text-sm"
            autoFocus
            data-testid="rich-link-input"
          />
          <Button size="sm" type="submit">
            {S.rich.linkOk}
          </Button>
        </div>
      </form>
    ),
    table: (
      <>
        <FlyItem onClick={close(() => insertTable(2, 2))}>{S.rich.tbl22}</FlyItem>
        <FlyItem onClick={close(() => insertTable(3, 3))}>{S.rich.tbl33}</FlyItem>
        <FlyItem onClick={close(() => tableOp('rowAdd'))}>{S.rich.rowAdd}</FlyItem>
        <FlyItem onClick={close(() => tableOp('colAdd'))}>{S.rich.colAdd}</FlyItem>
        <FlyItem onClick={close(() => tableOp('rowDel'))}>{S.rich.rowDel}</FlyItem>
        <FlyItem onClick={close(() => tableOp('colDel'))}>{S.rich.colDel}</FlyItem>
        <FlyItem onClick={close(() => tableOp('tblDel'))}>{S.rich.tblDel}</FlyItem>
      </>
    ),
  };
  const flyBtn = (f: Fly, label: string, icon: ReactNode) => (
    <TbButton
      label={label}
      icon={icon}
      pressed={fly === f}
      onClick={() => {
        if (f === 'link') setLink('https://');
        toggle(f);
      }}
      testId={`rich-${f}`}
    />
  );

  return (
    <div className="flex min-w-0 flex-col rounded-md border border-border-strong bg-surface-2">
      <RichDocStyle />
      <div
        className="relative flex flex-wrap items-center gap-0.5 border-b border-border p-1"
        role="toolbar"
        aria-label={S.rich.toolbar}
        data-rich-tb
      >
        <TbButton
          label={S.rich.bold}
          icon={<Bold />}
          onClick={() => exec('bold')}
          testId="rich-bold"
        />
        <TbButton label={S.rich.italic} icon={<Italic />} onClick={() => exec('italic')} />
        <TbButton label={S.rich.underline} icon={<Underline />} onClick={() => exec('underline')} />
        <TbButton
          label={S.rich.strike}
          icon={<Strikethrough />}
          onClick={() => exec('strikeThrough')}
        />
        <Sep />
        {flyBtn('heading', S.rich.heading, <Heading />)}
        <TbButton
          label={S.rich.ul}
          icon={<List />}
          onClick={() => exec('insertUnorderedList')}
          testId="rich-ul"
        />
        <TbButton
          label={S.rich.ol}
          icon={<ListOrdered />}
          onClick={() => exec('insertOrderedList')}
        />
        <TbButton
          label={S.rich.quote}
          icon={<TextQuote />}
          onClick={() => exec('formatBlock', '<blockquote>')}
        />
        <TbButton
          label={S.rich.hr}
          icon={<SeparatorHorizontal />}
          onClick={() => exec('insertHorizontalRule')}
        />
        <Sep />
        {flyBtn('color', S.rich.color, <Baseline />)}
        {flyBtn('bg', S.rich.bg, <Highlighter />)}
        {flyBtn('size', S.rich.size, <ALargeSmall />)}
        {flyBtn('align', S.rich.align, <AlignLeft />)}
        <Sep />
        {flyBtn('link', S.rich.link, <Link />)}
        <TbButton
          label={S.rich.image}
          icon={<ImagePlus />}
          onClick={() => {
            void pickFiles({ accept: 'image/*' }).then(([f]) => {
              if (f) void insertImage(f);
            });
          }}
        />
        {flyBtn('table', S.rich.table, <Table />)}
        <TbButton
          label={S.rich.clear}
          icon={<RemoveFormatting />}
          onClick={() => {
            exec('removeFormat');
            exec('formatBlock', '<p>');
          }}
        />
        {fly ? (
          <div
            className="absolute top-full left-1 z-20 mt-1 max-w-[calc(100%-0.5rem)] rounded-md border border-border bg-surface p-1 shadow-2"
            data-testid="rich-fly"
          >
            {body[fly]}
          </div>
        ) : null}
      </div>
      <div className="relative">
        {empty && placeholder ? (
          <div className="pointer-events-none absolute top-2 left-3 text-sm text-muted" aria-hidden>
            {placeholder}
          </div>
        ) : null}
        {/* biome-ignore lint/a11y/useSemanticElements: 富文本要 contentEditable（沒有對應的原生元素） */}
        <div
          ref={ed}
          role="textbox"
          tabIndex={0}
          aria-multiline
          aria-label={rest['aria-label']}
          contentEditable
          suppressContentEditableWarning
          className={`${RICH_DOC_CLASS} max-h-[60vh] overflow-auto px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent`}
          style={{ minHeight }}
          onFocus={() => {
            gesture.begin();
          }}
          onBlur={() => {
            flush();
            burst.current = false;
            gesture.commit();
          }}
          onInput={queue}
          onPaste={(e) => {
            const it = [...e.clipboardData.items].find(
              (x) => x.kind === 'file' && x.type.startsWith('image/'),
            );
            const f = it?.getAsFile();
            if (!f) return;
            e.preventDefault();
            void insertImage(f);
          }}
          data-testid={rest['data-testid']}
        />
      </div>
    </div>
  );
}
