/**
 * PDF 壓縮器：檔名規則（F28、F29）、減少的百分比（F24）、Discord 的上限（F27）、哪些列要重壓（F14）、
 * 結果的說明與保留原檔的原因（F22、F25、F26）。
 */
import { describe, expect, it } from 'vitest';
import { resolveSettings } from '@/core/pdf/levels';
import {
  DISCORD_LIMIT,
  keptReason,
  needsWork,
  outputName,
  type ReportSummary,
  resultLines,
  savedPercent,
  settingsKey,
  sizeLine,
  skippedList,
  zipEntryNames,
} from '@/tools/pdf-compress/logic';

function report(over: Partial<ReportSummary> = {}): ReportSummary {
  return {
    originalBytes: 10_000_000,
    outputBytes: 2_000_000,
    strategy: 'images',
    lossy: true,
    kept: false,
    pages: 12,
    images: {
      found: 10,
      tried: 8,
      replaced: 6,
      converted: 1,
      downscaled: 4,
      savedBytes: 7_000_000,
      measured: 8,
      skipped: { colorspace: 2, graphic: 1, decode: 1, 'no-size': 1 },
    },
    dedupe: { merged: 2, savedBytes: 500_000 },
    raster: null,
    verify: { ok: true, mismatches: [], page: null },
    verifySkipped: null,
    rejectedByVerify: 0,
    restricted: false,
    decrypted: false,
    signed: false,
    missingFonts: [],
    durationMs: 1234,
    ...over,
  };
}

describe('檔名', () => {
  it('壓縮後：<原檔名>_壓縮.pdf；保留原檔：原檔名', () => {
    expect(outputName('劇本.pdf', false)).toBe('劇本_壓縮.pdf');
    expect(outputName('Handout.PDF', false)).toBe('Handout_壓縮.pdf');
    expect(outputName('no-ext', false)).toBe('no-ext_壓縮.pdf');
    expect(outputName('Handout.PDF', true)).toBe('Handout.PDF');
    expect(outputName('no-ext', true)).toBe('no-ext.pdf');
    expect(outputName('a/b:c.pdf', false)).toBe('a_b_c_壓縮.pdf');
    expect(outputName('', false)).toBe('PDF_壓縮.pdf');
  });

  it('ZIP 裡同名時加 _2、_3', () => {
    expect(
      zipEntryNames([
        { name: 'a.pdf', kept: false },
        { name: 'a.pdf', kept: false },
        { name: 'a.pdf', kept: true },
        { name: 'A.pdf', kept: true },
      ]),
    ).toEqual(['a_壓縮.pdf', 'a_壓縮_2.pdf', 'a.pdf', 'A_2.pdf']);
  });
});

describe('大小', () => {
  it('減少的百分比四捨五入；沒有變小時 0', () => {
    expect(savedPercent(1000, 280)).toBe(72);
    expect(savedPercent(1000, 1000)).toBe(0);
    expect(savedPercent(1000, 1200)).toBe(0);
    expect(savedPercent(0, 0)).toBe(0);
    expect(sizeLine(10 * 1024 * 1024, 3 * 1024 * 1024)).toBe('10.0 MB → 3.0 MB（減少 70%）');
    expect(sizeLine(100_000, 99_900)).toContain('減少不到 1%');
  });
});

describe('哪些列要（重新）壓縮', () => {
  const k1 = settingsKey(resolveSettings('balanced'));
  const k2 = settingsKey(resolveSettings('lossless'));
  it('等待中要；完成、保留原檔的用別的設定壓過才要；讀取中、要密碼、處理中不要', () => {
    expect(needsWork({ state: 'ready', key: null, errorKind: null }, k1)).toBe(true);
    expect(needsWork({ state: 'done', key: k1, errorKind: null }, k1)).toBe(false);
    expect(needsWork({ state: 'done', key: k2, errorKind: null }, k1)).toBe(true);
    expect(needsWork({ state: 'kept', key: k2, errorKind: null }, k1)).toBe(true);
    for (const state of ['probing', 'password', 'running'] as const) {
      expect(needsWork({ state, key: null, errorKind: null }, k1)).toBe(false);
    }
  });

  it('錯誤：檔案本身的問題（壞檔等）不重壓；其他的換了設定才重壓', () => {
    expect(needsWork({ state: 'error', key: k2, errorKind: 'broken' }, k1)).toBe(false);
    expect(needsWork({ state: 'error', key: k2, errorKind: 'too-many-pages' }, k1)).toBe(true);
    expect(needsWork({ state: 'error', key: k1, errorKind: 'too-many-pages' }, k1)).toBe(false);
  });

  it('設定的指紋：等級、進階設定不同就不同', () => {
    expect(k1).not.toBe(k2);
    expect(settingsKey(resolveSettings('balanced', { quality: 60 }))).not.toBe(k1);
    expect(settingsKey(resolveSettings('balanced'))).toBe(k1);
  });
});

describe('結果的說明', () => {
  it('做法、沒動的影像（同義的原因合併、依張數排序）、比對、Discord', () => {
    const lines = resultLines(report(), 'balanced');
    expect(lines[0]).toBe(
      '做法：重新壓縮了 6 張影像（其中 4 張縮小解析度、1 張 PNG 轉成 JPEG）；移除了 2 個重複的圖片、字型或檔案',
    );
    expect(lines[1]).toBe(
      '沒動的影像 5 張：色彩空間不支援（CMYK 等） 2、讀不出來 2、看起來像圖表或截圖（保持無損） 1',
    );
    expect(lines).toContain('已比對：頁數、文字、連結、書籤、表單欄位都和原檔相同。');
    expect(lines).toContain('Discord 免費帳號可以直接傳（10 MB 以下）。');
    expect(skippedList({ bits: 1, filter: 3 })).toEqual([
      '壓縮方式不支援（JPEG 2000、JBIG2 等） 3',
      '不是 8 位元 1',
    ]);
  });

  it('Discord：超過 10 MB 時提醒，等級不是最小／整頁轉圖時建議改用', () => {
    expect(DISCORD_LIMIT).toBe(10 * 1024 * 1024);
    const big = report({ outputBytes: DISCORD_LIMIT + 1 });
    expect(resultLines(big, 'balanced')).toContain(
      '還超過 Discord 免費帳號的上限（10 MB），可以試「最小」或「整頁轉圖」。',
    );
    expect(resultLines(big, 'smallest')).toContain('還超過 Discord 免費帳號的上限（10 MB）。');
  });

  it('整頁轉圖、簽章、解密、權限設定的提醒', () => {
    const raster = resultLines(
      report({
        strategy: 'raster',
        raster: { dpi: 86, reduced: true, grayPages: 3 },
        images: null,
        dedupe: null,
      }),
      'raster',
    );
    expect(raster[0]).toBe(
      '做法：每頁畫成 86 DPI 的圖片；為了比原檔小，解析度降到 86 DPI；3 頁是灰階，存成灰階圖片',
    );
    expect(raster).toContain('已比對：頁數和原檔相同。');
    expect(raster).toContain('文字已經變成圖片：不能選取、不能搜尋，連結、書籤、表單也沒有了。');
    const notes = resultLines(report({ signed: true, decrypted: true }), 'balanced');
    expect(notes).toContain('這個 PDF 有數位簽章：改寫之後簽章會失效。');
    expect(notes).toContain('輸出的檔案沒有加密（不需要密碼就能打開）。');
  });

  it('保留原檔的原因', () => {
    const kept = report({ kept: true, strategy: 'original', outputBytes: 10_000_000 });
    expect(keptReason({ ...kept, restricted: true }, 'balanced')).toContain('權限設定');
    expect(keptReason({ ...kept, rejectedByVerify: 2 }, 'balanced')).toContain('不一樣');
    expect(keptReason(kept, 'lossless')).toContain('可以試「平衡」或「最小」');
    expect(keptReason({ ...kept, missingFonts: ['MS-Mincho', 'PMingLiU'] }, 'raster')).toBe(
      '這個 PDF 有沒有內嵌的中日韓字型（MS-Mincho、PMingLiU），轉成圖片會缺字，所以保留原檔。請改用其他等級。',
    );
    expect(keptReason(kept, 'balanced')).toContain('已經很精簡');
    expect(keptReason(kept, 'raster')).toContain('轉成圖片反而比原檔大');
    expect(resultLines(kept, 'balanced').some((l) => l.startsWith('做法'))).toBe(false);
  });
});
