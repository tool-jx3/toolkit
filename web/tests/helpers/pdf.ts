/**
 * 測試用的 PDF 解析（pdf-lib 的低階物件＋fontkit；不需要 pdf.js）：
 * - pdfPageTexts：每頁的文字（依各字型的 ToUnicode 還原，等於檢視器裡能選取、搜尋到的文字），
 *   以及畫出來是空白的字（嵌入的字型裡那個字形沒有外框＝缺字）；
 * - 只處理 pdf-lib 寫出的 Type0（Identity-H）字型與 `<hex> Tj`，這是本專案 core/paged/pdf 的輸出格式。
 */
import * as fontkitModule from '@pdf-lib/fontkit';
import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  type PDFDocument,
  PDFName,
  PDFRawStream,
  type PDFRef,
} from 'pdf-lib';

type FontkitFont = ReturnType<typeof fontkitModule.create>;
const fontkit = ((fontkitModule as unknown as { default?: typeof fontkitModule }).default ??
  fontkitModule) as typeof fontkitModule;

const latin1 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
};

function streamBytes(s: unknown): Uint8Array | null {
  return s instanceof PDFRawStream ? decodePDFRawStream(s).decode() : null;
}

/** ToUnicode CMap（bfchar／bfrange）→ 字形編號 → 字 */
export function parseToUnicode(cmap: string): Map<number, string> {
  const out = new Map<number, string>();
  const hexStr = (h: string) => {
    let s = '';
    for (let i = 0; i + 4 <= h.length; i += 4)
      s += String.fromCharCode(Number.parseInt(h.slice(i, i + 4), 16));
    return s;
  };
  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g))
      out.set(Number.parseInt(m[1], 16), hexStr(m[2]));
  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
    for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      const a = Number.parseInt(m[1], 16);
      const z = Number.parseInt(m[2], 16);
      const base = hexStr(m[3]);
      for (let c = a; c <= z; c++)
        out.set(
          c,
          base.slice(0, -1) + String.fromCharCode(base.charCodeAt(base.length - 1) + c - a),
        );
    }
  return out;
}

interface FontInfo {
  uni: Map<number, string>;
  /** 嵌入的 TrueType（FontFile2）；沒有時 null */
  fk: FontkitFont | null;
}

function fontInfo(doc: PDFDocument, ref: PDFRef | PDFDict): FontInfo {
  const dict = ref instanceof PDFDict ? ref : doc.context.lookup(ref, PDFDict);
  const tu = streamBytes(dict.lookup(PDFName.of('ToUnicode')));
  const uni = tu ? parseToUnicode(latin1(tu)) : new Map<number, string>();
  let fk: FontkitFont | null = null;
  const desc = dict.lookupMaybe(PDFName.of('DescendantFonts'), PDFArray)?.lookup(0, PDFDict);
  const fd = desc?.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict);
  const ff = streamBytes(fd?.lookup(PDFName.of('FontFile2')));
  if (ff) fk = fontkit.create(ff as unknown as Parameters<typeof fontkit.create>[0]);
  return { uni, fk };
}

export interface PdfPageText {
  /** 依 ToUnicode 還原的文字（依畫的順序，不含空白） */
  text: string;
  /** 畫出來沒有外框的字（缺字） */
  blank: string[];
}

/** 每頁的文字與缺字 */
export function pdfPageTexts(doc: PDFDocument): PdfPageText[] {
  return doc.getPages().map((page) => {
    const fonts = new Map<string, FontInfo>();
    const res = page.node.Resources();
    const fd = res?.lookupMaybe(PDFName.of('Font'), PDFDict);
    for (const [k, v] of fd?.entries() ?? []) fonts.set(k.decodeText(), fontInfo(doc, v as PDFRef));
    const contents = page.node.Contents();
    const parts: Uint8Array[] = [];
    if (contents instanceof PDFArray)
      for (let i = 0; i < contents.size(); i++) {
        const b = streamBytes(contents.lookup(i));
        if (b) parts.push(b);
      }
    else {
      const b = streamBytes(contents);
      if (b) parts.push(b);
    }
    const ops = parts.map(latin1).join('\n');
    let cur: FontInfo | undefined;
    let text = '';
    const blank: string[] = [];
    for (const m of ops.matchAll(/\/([^\s/<>[\]()]+)\s+[-\d.]+\s+Tf|<([0-9a-fA-F]*)>\s*Tj/g)) {
      if (m[1]) {
        cur = fonts.get(m[1]);
        continue;
      }
      const hex = m[2] ?? '';
      for (let i = 0; i + 4 <= hex.length; i += 4) {
        const cid = Number.parseInt(hex.slice(i, i + 4), 16);
        const ch = cur?.uni.get(cid) ?? '�';
        if (/\s/.test(ch)) continue;
        text += ch;
        /* 0 號（.notdef，豆腐）、沒有外框、字形資料壞掉（讀不出來）都算缺字 */
        let cmds: unknown[] | undefined;
        try {
          const g = cur?.fk?.getGlyph(cid) as unknown as { path?: { commands?: unknown[] } };
          cmds = g?.path?.commands;
        } catch {
          cmds = undefined;
        }
        if (cid === 0 || !cmds?.length) blank.push(ch);
      }
    }
    return { text, blank };
  });
}
