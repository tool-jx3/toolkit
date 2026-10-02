/**
 * 場景轉換素材產生器的字幕字型（規格 F37）與共用的 ensureFont：
 * Google 字型的樣式表載不到（離線、被擋）時要回報「沒有載入」，狀態列才會附註已改用後備字型。
 * 舊版：document.fonts.load 找不到字型時回傳空陣列 → 判定失敗（0.2 秒內附註）。
 * 共用的 document.fonts.check 對不存在的字型也回傳 true，不能拿來判斷（以前因此一直顯示成功）。
 * Node 環境：以最小的假 document 模擬樣式表與 FontFaceSet。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

interface FakeFace {
  family: string;
  status: 'loaded' | 'error' | 'unloaded';
}

/** 假 document：sheet＝樣式表載入成功與否；faces＝樣式表帶進來的 @font-face；load＝document.fonts.load 的結果 */
function stubDocument({
  sheet,
  faces = [],
  load = [],
}: {
  sheet: 'ok' | 'error';
  faces?: FakeFace[];
  load?: FakeFace[];
}) {
  const loaded: FakeFace[] = [];
  const fonts = {
    load: vi.fn(async () => load),
    check: vi.fn(() => true),
    forEach(cb: (f: FakeFace) => void) {
      for (const f of loaded) cb(f);
    },
  };
  const head = {
    appendChild(link: { onload?: () => void; onerror?: () => void }) {
      queueMicrotask(() => {
        if (sheet === 'ok') {
          loaded.push(...faces);
          link.onload?.();
        } else link.onerror?.();
      });
      return link;
    },
  };
  vi.stubGlobal('document', { fonts, head, createElement: () => ({ dataset: {} }) });
  return fonts;
}

/* core/fonts 記得插過的樣式表；每個案例重新載入模組 */
async function load() {
  vi.resetModules();
  return import('@/core/fonts');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ensureFont：Google 字型是否確實載入', () => {
  it('樣式表載不到（沒有任何這個字型的 @font-face）：回傳 false，而且很快（不等逾時）', async () => {
    const fonts = stubDocument({ sheet: 'error' });
    const { ensureFont } = await load();
    const t0 = Date.now();
    expect(await ensureFont('Klee One', 600, '字幕測試ABC', { timeoutMs: 10_000 })).toBe(false);
    expect(Date.now() - t0).toBeLessThan(200);
    expect(fonts.load).toHaveBeenCalledWith('600 16px "Klee One"', '字幕測試ABC');
  });

  it('樣式表是空的（被代理擋成空白）：同樣回傳 false', async () => {
    stubDocument({ sheet: 'ok' });
    const { ensureFont } = await load();
    expect(await ensureFont('Klee One', 600, '字幕')).toBe(false);
  });

  it('載入成功：回傳 true', async () => {
    const face: FakeFace = { family: '"Klee One"', status: 'loaded' };
    stubDocument({ sheet: 'ok', faces: [face], load: [face] });
    const { ensureFont } = await load();
    expect(await ensureFont('Klee One', 600, '字幕')).toBe(true);
  });

  it('字型檔下載失敗（status error）：回傳 false', async () => {
    const face: FakeFace = { family: 'Klee One', status: 'error' };
    stubDocument({ sheet: 'ok', faces: [face], load: [face] });
    const { ensureFont } = await load();
    expect(await ensureFont('Klee One', 600, '字幕')).toBe(false);
  });

  it('字型有載入、只是字都不在它的範圍內（英文字型配中文）：照舊回傳 true（向下相容）', async () => {
    stubDocument({ sheet: 'ok', faces: [{ family: 'Orbitron', status: 'unloaded' }], load: [] });
    const { ensureFont } = await load();
    expect(await ensureFont('Orbitron', 700, '中文字幕')).toBe(true);
  });

  it('電腦字型（不在 Google 字型目錄）：照舊用 document.fonts.check', async () => {
    const fonts = stubDocument({ sheet: 'ok' });
    const { ensureFont } = await load();
    expect(await ensureFont('Microsoft JhengHei', 700, '字幕')).toBe(true);
    expect(fonts.check).toHaveBeenCalled();
  });
});

describe('ensureCaptionFont（場景轉換的字幕字型）', () => {
  it('Google 字型載不到時回傳 false（狀態列附註已改用後備字型）；電腦字型、空字幕不載入', async () => {
    const fonts = stubDocument({ sheet: 'error' });
    vi.resetModules();
    const { ensureCaptionFont } = await import('@/tools/scene-transition/fonts');
    expect(await ensureCaptionFont('gothic', '字幕')).toBe(true);
    expect(await ensureCaptionFont('klee', '   ')).toBe(true);
    expect(fonts.load).not.toHaveBeenCalled();
    expect(await ensureCaptionFont('klee', '字幕測試')).toBe(false);
  });
});
