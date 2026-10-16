/**
 * @vitest-environment jsdom
 */
/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見 web/src/tools/relation-chart/UPSTREAM_LICENSE。
 *
 * 第四批對等驗證後的修正（規格 7.10）：
 * - F191a：切分頁時世界觀／備忘錄／統計面板留著（照原作，換成新分頁的內容）；角色、關係、便利貼這類指著某個東西的面板照舊關掉。
 * - 縮放停手的判斷（D72）：角色多時一格本身就要 0.1～0.15 秒，滾動途中不能被當成停手而重新排版（120 位一次 0.3～0.4 秒的停頓）。
 * - 自動儲存讀回時世界觀與角色資訊也淨化。
 * 每個測試重新載入模組（store 在載入時讀自動儲存）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeChar } from '@/tools/relation-chart/model/factory';
import { emptySheet } from '@/tools/relation-chart/model/normalize';
import type { Panel } from '@/tools/relation-chart/state/store';

const KEY = 'trpg-toolkit:relation-chart';

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

function twoSheets() {
  const a = emptySheet(1, 1);
  a.chars.push(makeChar(11, '甲', 200, 200, { defNo: 1 }), makeChar(12, '乙', 400, 200));
  a.memo = '主線的備忘錄';
  const b = emptySheet(2, 2);
  b.chars.push(makeChar(21, '丙', 200, 200, { defNo: 1 }));
  b.memo = '支線的備忘錄';
  return { sheets: [a, b], active: 0, labels: [], nextId: 100, font: 'sans' };
}

describe('切分頁時右側面板（F191a，7.10）', () => {
  it('世界觀／備忘錄／統計留著；新增、刪除分頁也一樣；指著角色或便利貼的面板關掉', async () => {
    const { normalizeProject } = await import('@/tools/relation-chart/model/normalize');
    const store = await import('@/tools/relation-chart/state/store');
    const { addSheet, deleteSheet, switchSheet } = await import(
      '@/tools/relation-chart/state/actions'
    );
    store.useProject.getState().replace(normalizeProject(twoSheets()) as never);
    const panel = () => store.useUi.getState().panel;
    for (const kind of ['lore', 'memo', 'stats'] as const) {
      store.setUi({ panel: { kind } });
      switchSheet(1);
      expect(panel(), kind).toEqual({ kind });
      switchSheet(0);
      expect(panel(), kind).toEqual({ kind });
    }
    store.setUi({ panel: { kind: 'memo' } });
    addSheet(false);
    expect(panel()).toEqual({ kind: 'memo' });
    deleteSheet(2);
    expect(panel()).toEqual({ kind: 'memo' });
    for (const p of [
      { kind: 'char', id: 11 },
      { kind: 'info', id: 11 },
      { kind: 'note', id: 5 },
    ] as Panel[]) {
      store.setUi({ panel: p });
      switchSheet(store.useProject.getState().data.active === 0 ? 1 : 0);
      expect(panel()).toBeNull();
    }
  });

  it('統計面板鎖定的聚焦（上一張分頁的角色）在切分頁時解除', async () => {
    const { normalizeProject } = await import('@/tools/relation-chart/model/normalize');
    const store = await import('@/tools/relation-chart/state/store');
    const { switchSheet } = await import('@/tools/relation-chart/state/actions');
    store.useProject.getState().replace(normalizeProject(twoSheets()) as never);
    store.setUi({ panel: { kind: 'stats' }, statsFocus: { nodes: [11, 12], edges: [] } });
    switchSheet(1);
    expect(store.useUi.getState().panel).toEqual({ kind: 'stats' });
    expect(store.useUi.getState().statsFocus).toBeNull();
  });
});

describe('縮放停手的判斷（D72，7.10）', () => {
  it('120 位每格 0.1～0.2 秒：滾動途中每一格開始前都還不算停手；停手後才重新排版', async () => {
    const { ZoomSettle, SETTLE_MIN_MS } = await import('@/tools/relation-chart/editor/zoomSettle');
    const s = new ZoomSettle();
    /* 驗證者的量法：送滾輪 → 兩個 rAF 再送下一格；一般 80～130 ms，換遠近檔位的那格 150～160 ms */
    const gaps = [90, 120, 135, 152, 160, 110, 95, 150, 158, 200, 130, 90];
    let t = 1000;
    for (const g of gaps) {
      s.input(t);
      /* 下一格送出之前：還不算停手（畫面畫好了，下一格接著送） */
      expect(s.wait(t + g - 1), `gap ${g}`).toBeGreaterThan(0);
      s.framed(t + g - 1);
      expect(s.wait(t + g), `gap ${g}`).toBeGreaterThan(0);
      t += g;
    }
    s.input(t);
    s.framed(t + 80);
    /* 停手：畫面畫好之後再等最近間隔的 3 倍（這裡 600 ms），之後一定重新排版 */
    expect(s.wait(t + 80 + 599)).toBeGreaterThan(0);
    expect(s.wait(t + 80 + 600)).toBe(0);
    s.done();
    /* 新的一次縮放（沒有間隔紀錄）：畫好之後最短的等待 */
    t += 5000;
    s.input(t);
    s.framed(t + 20);
    expect(s.wait(t + 20 + SETTLE_MIN_MS - 1)).toBeGreaterThan(0);
    expect(s.wait(t + 20 + SETTLE_MIN_MS)).toBe(0);
  });

  it('換遠近檔位那格畫了 0.5 秒：畫面還沒畫好之前不算停手（驗證時 120 位第 65 格）', async () => {
    const { ZoomSettle } = await import('@/tools/relation-chart/editor/zoomSettle');
    const s = new ZoomSettle();
    let t = 10047;
    for (const g of [51, 68, 70]) {
      s.input(t);
      s.framed(t + g - 1);
      t += g;
    }
    /* 第 65 格：換檔＝整張重畫，畫了 500 ms；310 ms 時（第四批的停手計時到了）畫面還沒好 */
    s.input(t);
    expect(s.wait(t + 310)).toBeGreaterThan(0);
    expect(s.wait(t + 499)).toBeGreaterThan(0);
    s.framed(t + 500);
    expect(s.wait(t + 501)).toBeGreaterThan(0);
  });

  it('等待有上限：很慢的一格之後，停手 1 秒內一定重新排版', async () => {
    const { ZoomSettle, SETTLE_MAX_MS } = await import('@/tools/relation-chart/editor/zoomSettle');
    const s = new ZoomSettle();
    s.input(0);
    s.framed(899);
    s.input(900);
    s.framed(950);
    expect(s.wait(950 + SETTLE_MAX_MS)).toBe(0);
    expect(SETTLE_MAX_MS).toBeLessThanOrEqual(1000);
  });
});

describe('自動儲存讀回時也淨化（7.10）', () => {
  it('世界觀與角色資訊裡的 script、on*、javascript: 拿掉，文字留著；整理不算一步復原', async () => {
    const bad =
      '<p onclick="alert(1)">北境<script>alert(2)</script><img src="x" onerror="alert(3)"><a href="javascript:alert(4)">連結</a></p><iframe src="https://example.com"></iframe>';
    const data = twoSheets() as Record<string, unknown> & { sheets: { lore: string }[] };
    data.sheets[0].lore = bad;
    data.sheets[1].lore = '<p>乾淨的</p>';
    data.library = [{ id: 500, variants: [{ id: 501, name: '甲' }], unified: false, info: bad }];
    localStorage.setItem(KEY, JSON.stringify({ state: { data }, version: 4 }));
    const store = await import('@/tools/relation-chart/state/store');
    const p = store.useProject.getState().data;
    const lore = p.sheets[0].lore;
    const info = p.library.find((e) => e.id === 500)?.info ?? '';
    for (const html of [lore, info]) {
      expect(html).toContain('北境');
      expect(html).toContain('連結');
      expect(html).not.toMatch(/script|onclick|onerror|javascript:|iframe/i);
    }
    expect(p.sheets[1].lore).toBe('<p>乾淨的</p>');
    expect(store.useProject.temporal.getState().pastStates).toHaveLength(0);
  });
});
