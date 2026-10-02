/**
 * log-converter 的成品 HTML → 附件（docs/refactor/specs/log-converter.examples.json）的「區塊」結構。
 *
 * 函式本身不引用任何外部變數（e2e 用 `page.evaluate(extractLogBlocks, true)` 直接丟進瀏覽器執行）：
 * - computed=false（單元測試、jsdom）：只抽結構與文字（種類、名稱、行、斜體、對齊、頭像、分頁標籤…）；
 * - computed=true（Chromium）：另外用 getComputedStyle 抽顏色、寬度，與附件的「瀏覽器計算後的值」比對。
 */

export interface ExtractedPage {
  page: Record<string, unknown>;
  標題區: Record<string, unknown>;
  區塊: Record<string, unknown>[];
}

export function extractLogBlocks(computed: boolean, source?: Document): ExtractedPage {
  const doc = source ?? document;
  const wrap = doc.querySelector('.lc-wrap') as HTMLElement;
  const box = wrap.querySelector('.lc-box') as HTMLElement;
  const css = Array.from(doc.querySelectorAll('style'))
    .map((s) => s.textContent ?? '')
    .join('\n');
  const cs = (el: Element | null) => (el ? getComputedStyle(el as HTMLElement) : null);
  const color = (el: Element | null) => (computed && el ? cs(el)!.color : undefined);
  const bg = (el: Element | null) => {
    if (!computed || !el) return undefined;
    const v = cs(el)!.backgroundColor;
    return v === 'rgba(0, 0, 0, 0)' || v === 'transparent' ? '透明' : v;
  };
  const style = wrap.classList.contains('lc-timeline')
    ? 'timeline'
    : wrap.classList.contains('lc-ccfolia')
      ? 'ccfolia'
      : 'novel';

  /** 文字行：<br> 與區塊元素（div、p）換行 */
  const lines = (el: Element | null): string[] => {
    if (!el) return [];
    let out = '';
    const walk = (n: Node) => {
      for (const c of Array.from(n.childNodes)) {
        if (c.nodeType === 3) out += c.nodeValue ?? '';
        else if (c.nodeType === 1) {
          const tag = (c as Element).tagName.toLowerCase();
          if (tag === 'br') out += '\n';
          else if (tag === 'div' || tag === 'p') {
            if (out && !out.endsWith('\n')) out += '\n';
            walk(c);
            if (!out.endsWith('\n')) out += '\n';
          } else if (tag !== 'svg' && tag !== 'style') walk(c);
        }
      }
    };
    walk(el);
    if (out.endsWith('\n')) out = out.slice(0, -1);
    return out.split('\n');
  };
  const text = (el: Element | null) => (el ? (el.textContent ?? '') : '');
  /** 名稱有沒有折成兩行以上（文字的行框數） */
  const wrapped = (el: Element): boolean => {
    const r = doc.createRange();
    r.selectNodeContents(el);
    const tops = new Set(Array.from(r.getClientRects()).map((x) => Math.round(x.top)));
    return tops.size > 1;
  };
  const italic = (el: Element | null): boolean => {
    if (!el) return false;
    if (computed) return cs(el)!.fontStyle === 'italic';
    for (let n: Element | null = el; n && n !== wrap; n = n.parentElement) {
      if (n.classList.contains('lc-it')) return true;
      if (/font-style:\s*italic/.test(n.getAttribute('style') ?? '')) return true;
    }
    return false;
  };
  /** 頭像：data URL／網址，或「預設圖示」 */
  const avatar = (holder: Element | null): unknown => {
    if (!holder) return '（隱藏）';
    const av = holder.querySelector('[class*="lc-av-"]');
    if (!av) return '預設圖示';
    const cls = Array.from(av.classList).find((c) => /^lc-av-(?:.+-)?\d+$/.test(c))!;
    if (computed) {
      const m = /url\("?(.*?)"?\)$/.exec(cs(av)!.backgroundImage);
      return { src: m ? m[1] : null, cls };
    }
    const esc = cls.replace(/[-]/g, '\\-');
    const m = new RegExp(`\\.${esc}\\{background-image:url\\("([^"]*)"\\)`).exec(css);
    return { src: m ? m[1].replace(/\\(.)/g, '$1') : null, cls };
  };
  const nameColor = (el: Element | null) => {
    if (!el) return undefined;
    if (computed) return cs(el)!.color;
    const m = /(?:^|;)\s*color:\s*(#[0-9a-f]{6})/i.exec(el.getAttribute('style') ?? '');
    return m ? m[1].toLowerCase() : undefined;
  };
  const strip = <T extends Record<string, unknown>>(o: T): T => {
    for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
    return o;
  };

  const page = strip({
    title: doc.title,
    lang: doc.documentElement.lang,
    頁面背景: bg(wrap),
    容器背景: bg(box),
    容器最大寬: computed ? cs(box)!.maxWidth : undefined,
    字級: computed ? cs(wrap)!.fontSize : undefined,
    行高: computed ? cs(wrap)!.lineHeight : undefined,
    文字顏色: color(wrap),
  });
  const head = box.querySelector('.lc-head')!;
  const h1 = head.querySelector('h1');
  const 標題區 = strip({
    標題: text(h1),
    標題顏色: color(h1),
    副標題: head.querySelector('.lc-sub') ? text(head.querySelector('.lc-sub')) : null,
    摘要: head.querySelector('.lc-sum') ? text(head.querySelector('.lc-sum')) : null,
  });

  const illustration = (el: Element) => {
    const img = el.querySelector('img')!;
    const align = (el.getAttribute('style') ?? '').includes('flex-start')
      ? '靠左'
      : (el.getAttribute('style') ?? '').includes('flex-end')
        ? '靠右'
        : '置中';
    return strip({
      種類: '插圖',
      圖片: { src: img.getAttribute('src') },
      最大寬: /max-width:\s*([^;!]+)/.exec(img.getAttribute('style') ?? '')?.[1].trim(),
      對齊: align,
      alt: img.getAttribute('alt'),
    });
  };
  const footer = (el: Element) => ({ 種類: '頁尾', 文字: text(el) });

  const blocks: Record<string, unknown>[] = [];
  const body = box.querySelector('.lc-body')!;

  if (style === 'novel') {
    const novelBlock = (el: Element): Record<string, unknown> | null => {
      if (el.classList.contains('lc-narr'))
        return strip({ 種類: '旁白', 行: lines(el), 斜體: italic(el), 文字顏色: color(el) });
      if (el.classList.contains('lc-dlg')) {
        const name = el.querySelector('.lc-name')!;
        const ls = el.querySelector('.lc-lines')!;
        return strip({
          種類: '對話',
          名稱: text(name),
          名稱顏色: nameColor(name),
          名稱換行: computed ? wrapped(name) : undefined,
          名稱欄寬: computed
            ? cs(el)!.gridTemplateColumns.split(' ')[0]
            : /grid-template-columns:(\S+)/.exec(css)?.[1],
          行: lines(ls),
          斜體: italic(ls.querySelector('div') ?? ls),
          文字顏色: color(ls),
        });
      }
      if (el.classList.contains('lc-dice'))
        return strip({
          種類: '擲骰',
          名稱: text(el.querySelector('.lc-dice-head span')),
          內容: lines(el.querySelector('.lc-dice-body')),
          背景: bg(el),
          框線色: computed ? cs(el)!.borderTopColor : undefined,
          文字顏色: color(el.querySelector('.lc-dice-body')),
        });
      if (el.classList.contains('lc-chat')) {
        const msgs = Array.from(el.querySelectorAll('p')).map((p) => {
          const b = p.querySelector('b')!;
          return strip({
            名稱: text(b).replace(/:$/, ''),
            名稱顏色: color(b),
            內容: lines(p)
              .join('\n')
              .replace(/^[^:]*:\s/, ''),
          });
        });
        if (el.tagName.toLowerCase() === 'details') {
          const sum = el.querySelector('summary')!;
          return strip({
            種類: '閒聊（摺疊）',
            摘要: text(sum),
            背景: bg(el),
            摘要顏色: color(sum),
            訊息: msgs,
            文字顏色: color(el.querySelector('.lc-chat-body')),
          });
        }
        return strip({ 種類: '閒聊（展開）', 背景: bg(el), 文字顏色: color(el), 訊息: msgs });
      }
      if (el.classList.contains('lc-scene')) return { 種類: '場景分隔', 文字: text(el) };
      if (el.classList.contains('lc-tabsec'))
        return strip({
          種類: '分頁區段',
          背景: bg(el),
          文字顏色: color(el),
          內容: Array.from(el.children)
            .map(novelBlock)
            .filter((b): b is Record<string, unknown> => !!b),
        });
      if (el.classList.contains('lc-ill')) return illustration(el);
      return null;
    };
    for (const el of Array.from(body.children)) {
      const b = novelBlock(el);
      if (b) blocks.push(b);
    }
  } else if (style === 'timeline') {
    const list = body.querySelector('.lc-tl')!;
    for (const el of Array.from(list.children)) {
      if (el.classList.contains('lc-ill')) {
        blocks.push(illustration(el));
        continue;
      }
      const content = el.querySelector('.lc-content')!;
      const icon = el.querySelector('.lc-icon')!;
      if (el.classList.contains('lc-narr-item') || el.classList.contains('lc-sub-item')) {
        blocks.push(
          strip({
            種類: '旁白',
            圖示: '預設圖示',
            段落: Array.from(content.querySelectorAll('.lc-msg')).map((p) =>
              strip({ 行: lines(p), 斜體: italic(p), 文字顏色: color(p) }),
            ),
            背景: bg(content),
          }),
        );
      } else if (el.classList.contains('lc-dlg-item')) {
        const name = content.querySelector('.lc-name')!;
        const inline = content.querySelector('.lc-inline');
        const ls = content.querySelector('.lc-lines, .lc-msgs')!;
        const grid = content.querySelector('.lc-grid');
        blocks.push(
          strip({
            種類: '對話',
            版面: inline ? '接續' : '欄位對齊',
            名稱: text(name),
            名稱顏色: nameColor(name),
            名稱換行: computed ? wrapped(name) : undefined,
            名稱欄寬: grid
              ? computed
                ? cs(grid)!.gridTemplateColumns.split(' ')[0]
                : /grid-template-columns:(\S+)/.exec(css)?.[1]
              : undefined,
            分隔: inline ? text(content.querySelector('.lc-sep')) : undefined,
            頭像: avatar(icon),
            行: lines(ls),
            斜體: italic(ls.querySelector('span, div') ?? ls),
            背景: bg(content),
            文字顏色: color(ls),
          }),
        );
      } else if (el.classList.contains('lc-sys-item')) {
        blocks.push(
          strip({
            種類: '擲骰',
            名稱: text(content.querySelector('.lc-dice-head')),
            內容: lines(content.querySelector('.lc-dice-body')),
            背景: bg(content.querySelector('.lc-dicebox')),
            文字顏色: color(content.querySelector('.lc-dice-body')),
          }),
        );
      } else if (el.classList.contains('lc-chat-item')) {
        const det = content.querySelector('details');
        const msg = (p: Element) => {
          const b = p.querySelector('b')!;
          return strip({
            名稱: text(b).replace(/:$/, ''),
            名稱顏色: color(b),
            內容: lines(p)
              .join('\n')
              .replace(/^[^:]*:\s/, ''),
          });
        };
        if (det) {
          const sum = det.querySelector('summary')!;
          blocks.push(
            strip({
              種類: '閒聊（摺疊）',
              摘要: text(sum),
              摘要顏色: color(sum),
              背景: bg(content),
              訊息: Array.from(det.querySelectorAll('.lc-chat-body p')).map(msg),
            }),
          );
        } else {
          const p = content.querySelector('p')!;
          blocks.push(strip({ 種類: '閒聊（單則）', 背景: bg(content), ...msg(p) }));
        }
      }
    }
  } else {
    const list = body.querySelector('.lc-list')!;
    const row = (el: Element, kind?: string): Record<string, unknown> => {
      const name = el.querySelector('.lc-name');
      const textEl = el.querySelector('.lc-text')!;
      const label = el.querySelector('.lc-tablabel');
      const pfp = el.querySelector('.lc-pfp');
      const sysIcon = el.querySelector('.lc-sysicon');
      const isBlock = el.classList.contains('lc-block');
      let k = kind;
      if (!k) {
        if (el.classList.contains('lc-narr')) k = '旁白列';
        else if (el.classList.contains('lc-sys'))
          k = text(sysIcon).includes('📌') ? '通知' : '擲骰';
        else if (el.classList.contains('lc-chatrow')) k = '閒聊（單則）';
        else k = '對話';
      }
      const firstLine = textEl.querySelector('div') ?? textEl;
      const align = computed
        ? cs(firstLine)!.textAlign === 'center'
          ? '置中'
          : '靠左'
        : isBlock && /text-align:center/.test(css)
          ? '置中'
          : '靠左';
      return strip({
        種類: k,
        名稱: name ? text(name) : undefined,
        名稱顏色: name ? nameColor(name) : undefined,
        名稱顯示: !isBlock,
        頭像: sysIcon ? `骰子圖示${text(sysIcon)}` : isBlock ? '（隱藏）' : avatar(pfp),
        分頁標籤: label ? text(label) : undefined,
        分頁標籤顏色: label ? color(label) : undefined,
        行: lines(textEl),
        文字顏色: color(firstLine),
        斜體: italic(firstLine),
        對齊: align,
        背景: bg(el),
        文字區背景: bg(textEl),
      });
    };
    for (const el of Array.from(list.children)) {
      if (el.classList.contains('lc-ill')) blocks.push(illustration(el));
      else if (el.classList.contains('lc-chatfold')) {
        const sum = el.querySelector('summary')!;
        blocks.push(
          strip({
            種類: '閒聊（摺疊）',
            摘要: text(sum),
            摘要顏色: color(sum),
            訊息: Array.from(el.querySelectorAll('.lc-chatrow')).map((r) => {
              const o = row(r);
              return strip({
                名稱: o.名稱,
                名稱顏色: o.名稱顏色,
                頭像: o.頭像,
                分頁標籤: o.分頁標籤,
                內容: o.行,
                文字顏色: o.文字顏色,
                背景: o.背景,
              });
            }),
          }),
        );
      } else blocks.push(row(el));
    }
  }
  const foot = box.querySelector('.lc-foot');
  if (foot) blocks.push(footer(foot));
  return { page, 標題區, 區塊: blocks };
}
