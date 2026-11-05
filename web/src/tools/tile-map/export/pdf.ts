/**
 * 列印用 PDF：每一頁放地圖的一塊（點陣，格子的實際大小固定），格線用向量線畫（和點陣的解析度無關），
 * 外框一條細線，頁尾寫地圖名稱、第幾欄第幾列的頁、每格的大小與「請用實際大小列印」，右邊是頁碼。
 * 頁尾有中文，做成一小張點陣圖放上去（PDF 內建的字型沒有中文）。
 *
 * pdf-lib 很大：按下匯出時才載入（`await import('pdf-lib')`）。點陣與頁尾由呼叫的人提供（瀏覽器裡用畫布畫；
 * 單元測試用小圖），這裡只管版面與 PDF。
 */
import type { PrintLayout, PrintPage } from '../model/print';

export interface PdfBuildOptions {
  layout: PrintLayout;
  pages: readonly PrintPage[];
  title: string;
  subject: string;
  /** 畫格線 */
  grid: boolean;
  /** 這一頁的地圖點陣（PNG） */
  raster: (page: PrintPage) => Promise<Uint8Array>;
  /** 這一頁的頁尾（PNG；寬＝紙寬扣掉左右留白、高＝頁尾的高度） */
  footer: (page: PrintPage) => Promise<Uint8Array>;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

/** 格線的灰（0～1）與粗細（pt） */
export const PDF_GRID_GRAY = 145 / 255;
export const PDF_GRID_WIDTH = 0.5;
/** 外框 */
export const PDF_BORDER_GRAY = 150 / 255;
export const PDF_BORDER_WIDTH = 0.36;

/** 這一頁地圖的範圍（pt；PDF 的原點在左下角） */
export function pageBox(
  layout: PrintLayout,
  page: PrintPage,
): { x: number; y: number; width: number; height: number } {
  const width = page.width * layout.cell;
  const height = page.height * layout.cell;
  return { x: layout.margin, y: layout.pageH - layout.margin - height, width, height };
}

export async function buildPrintPdf(o: PdfBuildOptions): Promise<Uint8Array> {
  const { PDFDocument, grayscale } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  doc.setTitle(o.title);
  doc.setSubject(o.subject);
  doc.setCreator('TRPG Toolkit');
  doc.setProducer('TRPG Toolkit（pdf-lib）');
  const L = o.layout;
  const total = o.pages.length;
  let done = 0;
  for (const p of o.pages) {
    o.signal?.throwIfAborted();
    const page = doc.addPage([L.pageW, L.pageH]);
    const box = pageBox(L, p);
    const img = await doc.embedPng(await o.raster(p));
    page.drawImage(img, box);
    if (o.grid) {
      const color = grayscale(PDF_GRID_GRAY);
      for (let c = 1; c < p.width; c++) {
        const x = box.x + c * L.cell;
        page.drawLine({
          start: { x, y: box.y },
          end: { x, y: box.y + box.height },
          thickness: PDF_GRID_WIDTH,
          color,
        });
      }
      for (let r = 1; r < p.height; r++) {
        const y = box.y + box.height - r * L.cell;
        page.drawLine({
          start: { x: box.x, y },
          end: { x: box.x + box.width, y },
          thickness: PDF_GRID_WIDTH,
          color,
        });
      }
    }
    page.drawRectangle({
      ...box,
      borderColor: grayscale(PDF_BORDER_GRAY),
      borderWidth: PDF_BORDER_WIDTH,
    });
    const foot = await doc.embedPng(await o.footer(p));
    page.drawImage(foot, {
      x: L.margin,
      y: L.margin,
      width: L.pageW - 2 * L.margin,
      height: L.footer,
    });
    done++;
    o.onProgress?.(done, total);
    await new Promise((r) => setTimeout(r, 0));
  }
  return doc.save();
}
