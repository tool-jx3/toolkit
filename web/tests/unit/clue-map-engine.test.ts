// @vitest-environment jsdom
/**
 * 調查熱點圖的遊玩畫面（引擎 mountClueMap）：找到、線索卡、解鎖、隱藏熱點、顯示所有熱點、重來、記住進度、文字跳脫、
 * 自給自足（原始碼拿出來在乾淨的環境執行，和互動 HTML 裡的一樣）、和 model 的出現條件規則一致。規格 F60～F72、3.2、3.3。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ClueMapConfig, type ClueMapHandle, mountClueMap } from '@/tools/clue-map/engine';
import { playConfig, progressKey } from '@/tools/clue-map/markup';
import {
  blankState,
  type ClueMapState,
  isUnlocked,
  newSpot,
  type Spot,
} from '@/tools/clue-map/model';
import { SAMPLE_IDS, sampleState } from '@/tools/clue-map/sample';

const srcOf = () => 'data:image/png;base64,AAAA';

/** 引擎的原始碼在乾淨的函式範圍裡重新建立（和互動 HTML 的 <script> 一樣：不能引用模組裡的任何東西） */
const standalone = new Function(`return (${mountClueMap.toString()})`)() as typeof mountClueMap;

let root: HTMLElement;
let handle: ClueMapHandle | null = null;

beforeEach(() => {
  document.body.innerHTML = '<div id="r"></div>';
  root = document.getElementById('r') as HTMLElement;
  localStorage.clear();
});
afterEach(() => {
  handle?.destroy();
  handle = null;
});

const mount = (
  state: ClueMapState = sampleState(),
  opts: Parameters<typeof playConfig>[2] = {},
  fn: typeof mountClueMap = standalone,
  hooks?: Parameters<typeof mountClueMap>[2],
): ClueMapConfig => {
  const cfg = playConfig(state, srcOf, opts);
  handle = fn(root, cfg, hooks);
  return cfg;
};

const spotEl = (id: string) => root.querySelector(`[data-spot="${id}"]`) as HTMLButtonElement;
const stateOf = (id: string) => spotEl(id).getAttribute('data-state');
const click = (id: string) => spotEl(id).click();
const text = (sel: string) => root.querySelector(sel)?.textContent ?? '';
const q = (sel: string) => root.querySelector(sel) as HTMLElement;
const foundItems = () =>
  [...root.querySelectorAll('.cm-found-item .cm-found-name')].map((e) => e.textContent);

describe('開頁', () => {
  it('結構與屬性：標題、導言、進度、場景圖、每個熱點一個按鈕（順序＝編號）', () => {
    mount();
    expect(root.classList.contains('cm')).toBe(true);
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.getAttribute('role')).toBe('region');
    expect(text('.cm-title')).toBe('舊書房的調查');
    expect(text('.cm-intro')).toContain('雨夜裡');
    expect(text('.cm-progress')).toBe('找到 0／8');
    expect((q('.cm-img') as HTMLImageElement).getAttribute('src')).toBe(srcOf());
    const spots = [...root.querySelectorAll('.cm-spot')];
    expect(spots).toHaveLength(8);
    expect(spots.map((e) => e.getAttribute('data-spot'))).toEqual(
      sampleState().spots.map((s) => s.id),
    );
    expect(text('.cm-card')).toBe('點選場景裡的熱點，開始調查。');
    expect(text('.cm-found-title')).toBe('已找到的線索（0）');
    expect(text('.cm-found-empty')).toBe('還沒有找到線索。');
  });

  it('熱點的位置：中心 left/top、寬高都是 %；橢圓有 data-shape', () => {
    mount();
    const desk = spotEl(SAMPLE_IDS.desk);
    const s = sampleState().spots[0];
    expect(Number.parseFloat(desk.style.left)).toBeCloseTo(s.x + s.w / 2, 4);
    expect(Number.parseFloat(desk.style.top)).toBeCloseTo(s.y + s.h / 2, 4);
    expect(desk.style.width).toBe(`${s.w}%`);
    expect(desk.style.height).toBe(`${s.h}%`);
    expect(spotEl(SAMPLE_IDS.hatch).getAttribute('data-shape')).toBe('ellipse');
  });

  it('看得到的、還沒解鎖的、隱藏的：狀態、標示與鍵盤順序', () => {
    mount();
    for (const id of [
      SAMPLE_IDS.desk,
      SAMPLE_IDS.shelf,
      SAMPLE_IDS.fireplace,
      SAMPLE_IDS.window,
      SAMPLE_IDS.painting,
    ]) {
      expect(stateOf(id)).toBe('ready');
      expect(spotEl(id).getAttribute('data-vis')).toBe('ring');
      expect(spotEl(id).hidden).toBe(false);
      expect(spotEl(id).tabIndex).toBe(0);
    }
    /* 還沒解鎖：不存在於畫面 */
    for (const id of [SAMPLE_IDS.drawer, SAMPLE_IDS.safe]) {
      expect(stateOf(id)).toBe('locked');
      expect(spotEl(id).hidden).toBe(true);
      expect(spotEl(id).tabIndex).toBe(-1);
    }
    /* 隱藏熱點：沒有標示、不在鍵盤順序、不給讀屏看，但點得到 */
    const hatch = spotEl(SAMPLE_IDS.hatch);
    expect(stateOf(SAMPLE_IDS.hatch)).toBe('ready');
    expect(hatch.getAttribute('data-vis')).toBe('none');
    expect(hatch.hidden).toBe(false);
    expect(hatch.tabIndex).toBe(-1);
    expect(hatch.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('點熱點', () => {
  it('找到：線索卡（編號、名稱、文字分段、檢定提示）、進度、已找到的清單', () => {
    mount();
    click(SAMPLE_IDS.desk);
    expect(stateOf(SAMPLE_IDS.desk)).toBe('found');
    expect(text('.cm-card-name')).toBe('書桌');
    expect(text('.cm-kicker')).toBe('線索 1');
    expect(text('.cm-card-head .cm-num')).toBe('1');
    const paras = [...root.querySelectorAll('.cm-card .cm-text')].map((e) => e.textContent);
    expect(paras).toHaveLength(2);
    expect(paras[0]).toContain('皮面日記');
    expect(text('.cm-check')).toBe('檢定提示：偵查 40%');
    expect(text('.cm-progress')).toBe('找到 1／8');
    expect(text('.cm-found-title')).toBe('已找到的線索（1）');
    expect(foundItems()).toEqual(['書桌']);
    expect(spotEl(SAMPLE_IDS.desk).getAttribute('aria-label')).toBe('書桌（已找到）');
    expect(spotEl(SAMPLE_IDS.desk).getAttribute('data-check')).toBe('1');
    expect(spotEl(SAMPLE_IDS.desk).getAttribute('data-tone')).toBe('found');
  });

  it('再點同一個只是重新翻出線索卡，不重複計算', () => {
    mount();
    click(SAMPLE_IDS.desk);
    click(SAMPLE_IDS.shelf);
    expect(text('.cm-card-name')).toBe('書架');
    click(SAMPLE_IDS.desk);
    expect(text('.cm-card-name')).toBe('書桌');
    expect(text('.cm-progress')).toBe('找到 2／8');
    expect(foundItems()).toEqual(['書桌', '書架']);
  });

  it('已找到的清單依找到的先後；點清單的一項重新翻出那張線索卡', () => {
    mount();
    click(SAMPLE_IDS.window);
    click(SAMPLE_IDS.desk);
    expect(foundItems()).toEqual(['窗戶', '書桌']);
    (root.querySelector(`[data-found-item="${SAMPLE_IDS.window}"]`) as HTMLElement).click();
    expect(text('.cm-card-name')).toBe('窗戶');
    expect(
      root.querySelector(`[data-found-item="${SAMPLE_IDS.window}"]`)?.getAttribute('aria-current'),
    ).toBe('true');
    expect(spotEl(SAMPLE_IDS.window).getAttribute('data-flash')).toBe('1');
  });

  it('關閉線索卡：關閉鈕、Esc；焦點還給剛才的熱點', () => {
    mount();
    spotEl(SAMPLE_IDS.desk).focus();
    click(SAMPLE_IDS.desk);
    (q('.cm-close') as HTMLElement).click();
    expect(text('.cm-card')).toBe('點選場景裡的熱點，開始調查。');
    expect(document.activeElement).toBe(spotEl(SAMPLE_IDS.desk));
    click(SAMPLE_IDS.shelf);
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(q('.cm-card').hasAttribute('data-empty')).toBe(true);
    /* 找到的仍然算找到 */
    expect(text('.cm-progress')).toBe('找到 2／8');
  });

  it('沒有文字、圖片、檢定提示的熱點：這裡沒有特別的發現', () => {
    const s = blankState();
    s.spots = [newSpot('aaa1', 'rect', { x: 10, y: 10, w: 20, h: 20 }, '空的')];
    mount(s);
    click('aaa1');
    expect(text('.cm-flavor')).toBe('這裡沒有特別的發現。');
  });

  it('線索圖片放在文字上面；沒有名稱時用「熱點 N」', () => {
    const s = blankState();
    s.spots = [
      newSpot('aaa1', 'rect', { x: 10, y: 10, w: 20, h: 20 }, '', {
        text: '有圖',
        image: { kind: 'url', url: 'https://e.com/a.png', name: 'a.png' },
      }),
    ];
    mount(s);
    click('aaa1');
    expect(text('.cm-card-name')).toBe('熱點 1');
    const kids = [...q('.cm-card').children].map((e) => e.className);
    expect(kids.indexOf('cm-card-img')).toBeGreaterThan(-1);
    expect(kids.indexOf('cm-card-img')).toBeLessThan(kids.indexOf('cm-text'));
  });
});

describe('解鎖', () => {
  it('找到書架後書桌抽屜出現（一處新的地方）；保險箱要抽屜和掛畫都找到才出現', () => {
    mount();
    click(SAMPLE_IDS.shelf);
    expect(stateOf(SAMPLE_IDS.drawer)).toBe('ready');
    expect(spotEl(SAMPLE_IDS.drawer).hidden).toBe(false);
    expect(spotEl(SAMPLE_IDS.drawer).getAttribute('data-new')).toBe('1');
    expect(text('.cm-note')).toBe('出現了 1 處新的地方可以調查。');
    expect(stateOf(SAMPLE_IDS.safe)).toBe('locked');
    click(SAMPLE_IDS.drawer);
    expect(stateOf(SAMPLE_IDS.safe)).toBe('locked');
    click(SAMPLE_IDS.painting);
    expect(stateOf(SAMPLE_IDS.safe)).toBe('ready');
    expect(text('.cm-note')).toBe('出現了 1 處新的地方可以調查。');
    click(SAMPLE_IDS.safe);
    expect(text('.cm-card-name')).toBe('牆後保險箱');
    expect(text('.cm-progress')).toBe('找到 4／8');
  });

  it('隱藏的熱點新出現時不提示；只有隱藏的新熱點時提示是空的', () => {
    const s = blankState();
    s.spots = [
      newSpot('aaa1', 'rect', { x: 10, y: 10, w: 20, h: 20 }, 'A'),
      newSpot('bbb1', 'rect', { x: 50, y: 10, w: 20, h: 20 }, 'B', {
        locked: true,
        requires: ['aaa1'],
        hidden: true,
      }),
    ];
    mount(s);
    click('aaa1');
    expect(text('.cm-note')).toBe('');
    expect(stateOf('bbb1')).toBe('ready');
    expect(spotEl('bbb1').getAttribute('data-vis')).toBe('none');
  });

  it('還沒解鎖的熱點：點到沒有反應', () => {
    mount();
    click(SAMPLE_IDS.drawer);
    expect(text('.cm-progress')).toBe('找到 0／8');
    expect(stateOf(SAMPLE_IDS.drawer)).toBe('locked');
  });

  it('any：找到其中一個就出現', () => {
    const s = blankState();
    s.spots = [
      newSpot('aaa1', 'rect', { x: 5, y: 5, w: 10, h: 10 }, 'A'),
      newSpot('bbb1', 'rect', { x: 25, y: 5, w: 10, h: 10 }, 'B'),
      newSpot('ccc1', 'rect', { x: 45, y: 5, w: 10, h: 10 }, 'C', {
        locked: true,
        requires: ['aaa1', 'bbb1'],
        mode: 'any',
      }),
    ];
    mount(s);
    expect(stateOf('ccc1')).toBe('locked');
    click('bbb1');
    expect(stateOf('ccc1')).toBe('ready');
  });

  it('已經找到的熱點永遠看得到（就算之後條件不成立）', () => {
    const s = blankState();
    s.spots = [
      newSpot('aaa1', 'rect', { x: 5, y: 5, w: 10, h: 10 }, 'A', {
        locked: true,
        requires: ['bbb1'],
      }),
      newSpot('bbb1', 'rect', { x: 25, y: 5, w: 10, h: 10 }, 'B'),
    ];
    mount(s, { initialFound: ['aaa1'] });
    expect(stateOf('aaa1')).toBe('found');
    expect(spotEl('aaa1').hidden).toBe(false);
  });
});

describe('隱藏熱點', () => {
  it('點對位置才翻出線索；找到之後依「找到後的標記」顯示', () => {
    mount();
    click(SAMPLE_IDS.hatch);
    expect(text('.cm-card-name')).toBe('地毯下的暗格');
    expect(stateOf(SAMPLE_IDS.hatch)).toBe('found');
    const el = spotEl(SAMPLE_IDS.hatch);
    expect(el.getAttribute('data-vis')).toBe('ring');
    expect(el.getAttribute('data-check')).toBe('1');
    expect(el.tabIndex).toBe(0);
    expect(el.hasAttribute('aria-hidden')).toBe(false);
  });

  it('條件沒有成立的隱藏熱點：點到沒有反應', () => {
    const s = blankState();
    s.spots = [
      newSpot('aaa1', 'rect', { x: 5, y: 5, w: 10, h: 10 }, 'A'),
      newSpot('bbb1', 'rect', { x: 25, y: 5, w: 10, h: 10 }, 'B', {
        hidden: true,
        locked: true,
        requires: ['aaa1'],
      }),
    ];
    mount(s);
    expect(spotEl('bbb1').hidden).toBe(true);
    click('bbb1');
    expect(text('.cm-progress')).toBe('找到 0／2');
  });
});

describe('顯示所有熱點（KP 用）', () => {
  it('切換：全部畫出輪廓與編號；隱藏的用虛線、還沒解鎖的灰色虛線且不能點；不影響進度；再按一次關閉', () => {
    mount();
    const btn = q('.cm-reveal');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    btn.click();
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    for (const s of sampleState().spots) {
      expect(spotEl(s.id).hidden, s.name).toBe(false);
      expect(spotEl(s.id).hasAttribute('data-num'), s.name).toBe(true);
    }
    expect(spotEl(SAMPLE_IDS.hatch).hasAttribute('data-dashed')).toBe(true);
    expect(spotEl(SAMPLE_IDS.drawer).getAttribute('data-tone')).toBe('locked');
    expect(spotEl(SAMPLE_IDS.drawer).title).toBe('尚未解鎖：先找到 書架');
    expect(spotEl(SAMPLE_IDS.safe).title).toBe('尚未解鎖：先找到 掛畫、書桌抽屜');
    click(SAMPLE_IDS.drawer);
    expect(text('.cm-progress')).toBe('找到 0／8');
    expect(text('.cm-progress')).toBe('找到 0／8');
    btn.click();
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(spotEl(SAMPLE_IDS.drawer).hidden).toBe(true);
    expect(spotEl(SAMPLE_IDS.hatch).getAttribute('data-vis')).toBe('none');
  });

  it('look.reveal 關掉時沒有這顆按鈕', () => {
    const s = sampleState();
    s.look.reveal = false;
    mount(s);
    expect(root.querySelector('.cm-reveal')).toBeNull();
    expect(root.querySelector('.cm-reset')).not.toBeNull();
  });
});

describe('重來', () => {
  it('第一次按變成「再按一次確定重來」，第二次才清除；3 秒內沒再按就變回來', async () => {
    mount();
    click(SAMPLE_IDS.desk);
    click(SAMPLE_IDS.shelf);
    const reset = q('.cm-reset');
    reset.click();
    expect(reset.textContent).toBe('再按一次確定重來');
    expect(text('.cm-progress')).toBe('找到 2／8');
    reset.click();
    expect(reset.textContent).toBe('重來');
    expect(text('.cm-progress')).toBe('找到 0／8');
    expect(foundItems()).toEqual([]);
    expect(stateOf(SAMPLE_IDS.drawer)).toBe('locked');
    expect(q('.cm-card').hasAttribute('data-empty')).toBe(true);
  });

  it('重來也關掉「顯示所有熱點」', () => {
    mount();
    click(SAMPLE_IDS.desk);
    q('.cm-reveal').click();
    handle?.reset();
    expect(q('.cm-reveal').getAttribute('aria-pressed')).toBe('false');
    expect(handle?.isRevealing()).toBe(false);
  });
});

describe('重來的確認逾時', () => {
  it('第一次按之後 3 秒內沒再按，按鈕變回「重來」，進度不變', () => {
    vi.useFakeTimers();
    try {
      mount();
      click(SAMPLE_IDS.desk);
      const reset = q('.cm-reset');
      reset.click();
      expect(reset.textContent).toBe('再按一次確定重來');
      vi.advanceTimersByTime(2900);
      expect(reset.textContent).toBe('再按一次確定重來');
      vi.advanceTimersByTime(200);
      expect(reset.textContent).toBe('重來');
      reset.click();
      expect(reset.textContent).toBe('再按一次確定重來');
      expect(text('.cm-progress')).toBe('找到 1／8');
      /* 提示「出現了…」5 秒後消失 */
      click(SAMPLE_IDS.shelf);
      expect(text('.cm-note')).toBe('出現了 1 處新的地方可以調查。');
      vi.advanceTimersByTime(5100);
      expect(text('.cm-note')).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('進度', () => {
  it('三種顯示；全部找到時顯示完成', () => {
    const s = blankState();
    s.spots = [newSpot('aaa1', 'rect', { x: 5, y: 5, w: 10, h: 10 }, 'A')];
    s.look.progress = 'found';
    mount(s);
    expect(text('.cm-progress')).toBe('已找到 0 個');
    click('aaa1');
    expect(text('.cm-progress')).toBe('全部線索都找到了');
    expect(root.hasAttribute('data-complete')).toBe(true);
    handle?.destroy();
    s.look.progress = 'off';
    mount(s);
    expect(root.querySelector('.cm-progress')).toBeNull();
  });

  it('沒有熱點時不算完成', () => {
    mount(blankState());
    expect(root.hasAttribute('data-complete')).toBe(false);
    expect(text('.cm-progress')).toBe('找到 0／0');
  });
});

describe('找到後的標記與熱點標示', () => {
  const one = (patch: Partial<ClueMapState['look']>, spotPatch: Partial<Spot> = {}) => {
    const s = blankState();
    s.look = { ...s.look, ...patch };
    s.spots = [newSpot('aaa1', 'rect', { x: 5, y: 5, w: 10, h: 10 }, 'A', spotPatch)];
    return s;
  };

  it('打勾＋變色／只打勾／只變色／不標記', () => {
    for (const [mark, tone, check] of [
      ['both', 'found', '1'],
      ['check', 'accent', '1'],
      ['color', 'found', null],
      ['none', 'accent', null],
    ] as const) {
      mount(one({ foundMark: mark }));
      click('aaa1');
      const el = spotEl('aaa1');
      expect(el.getAttribute('data-tone'), mark).toBe(tone);
      expect(el.getAttribute('data-check'), mark).toBe(check);
      handle?.destroy();
    }
  });

  it('標示方式：輪廓／圓點／不顯示（不顯示時所有熱點都像隱藏熱點）', () => {
    for (const [marker, vis] of [
      ['outline', 'ring'],
      ['pin', 'dot'],
      ['none', 'none'],
    ] as const) {
      mount(one({ marker }));
      expect(spotEl('aaa1').getAttribute('data-vis'), marker).toBe(vis);
      handle?.destroy();
    }
    mount(one({ marker: 'none' }));
    expect(spotEl('aaa1').tabIndex).toBe(0);
    click('aaa1');
    /* 找到之後（有標記時）才顯示 */
    expect(spotEl('aaa1').getAttribute('data-vis')).toBe('ring');
  });

  it('顯示熱點名稱：看得到的顯示、隱藏的沒找到不顯示', () => {
    mount(sampleState());
    for (const t of root.querySelectorAll('.cm-tag')) expect((t as HTMLElement).hidden).toBe(true);
    handle?.destroy();
    const s = sampleState();
    s.look.names = true;
    mount(s);
    const tag = (name: string) =>
      [...root.querySelectorAll('.cm-tag')].find((t) => t.textContent === name) as HTMLElement;
    expect(tag('書桌').hidden).toBe(false);
    expect(tag('書桌抽屜').hidden).toBe(true);
    expect(tag('地毯下的暗格').hidden).toBe(true);
    click(SAMPLE_IDS.hatch);
    expect(tag('地毯下的暗格').hidden).toBe(false);
  });

  it('顏色由設定帶入 CSS 變數；編號圓標文字色依顏色明暗', () => {
    const s = one({ accent: '#f5b83d', foundColor: '#1d4ed8' });
    mount(s);
    expect(root.style.getPropertyValue('--cm-accent')).toBe('#f5b83d');
    expect(root.style.getPropertyValue('--cm-accent-fg')).toBe('#000000');
    expect(root.style.getPropertyValue('--cm-found')).toBe('#1d4ed8');
    expect(root.style.getPropertyValue('--cm-found-fg')).toBe('#ffffff');
  });
});

describe('記住進度', () => {
  it('有儲存鍵時存起來，重新掛載時還在；重來清掉', () => {
    const state = sampleState();
    const key = progressKey(state);
    mount(state, { storageKey: key });
    click(SAMPLE_IDS.shelf);
    click(SAMPLE_IDS.desk);
    expect(JSON.parse(localStorage.getItem(key) as string)).toEqual({
      v: 1,
      found: [SAMPLE_IDS.shelf, SAMPLE_IDS.desk],
    });
    handle?.destroy();
    mount(state, { storageKey: key });
    expect(foundItems()).toEqual(['書架', '書桌']);
    expect(text('.cm-progress')).toBe('找到 2／8');
    expect(stateOf(SAMPLE_IDS.drawer)).toBe('ready');
    handle?.reset();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('內容改了儲存鍵就不一樣（不沿用舊進度）；KP 備註與遊玩設定不影響', () => {
    const a = sampleState();
    const b = sampleState();
    b.spots[0].text += '改了';
    expect(progressKey(a)).not.toBe(progressKey(b));
    const c = sampleState();
    c.spots[0].memo = '另一個備註';
    c.look.accent = '#ff0000';
    expect(progressKey(a)).toBe(progressKey(c));
  });

  it('沒有儲存鍵時不記；儲存的資料壞了、有不存在的代號時照常開頁', () => {
    mount(sampleState(), { storageKey: null });
    click(SAMPLE_IDS.desk);
    expect(localStorage.length).toBe(0);
    handle?.destroy();
    localStorage.setItem('k', '{broken');
    mount(sampleState(), { storageKey: 'k' });
    expect(text('.cm-progress')).toBe('找到 0／8');
    handle?.destroy();
    localStorage.setItem(
      'k',
      JSON.stringify({ v: 1, found: ['nope', SAMPLE_IDS.desk, SAMPLE_IDS.desk, 5] }),
    );
    mount(sampleState(), { storageKey: 'k' });
    expect(foundItems()).toEqual(['書桌']);
  });

  it('initialFound（試玩重新掛載帶回進度）優先於儲存', () => {
    localStorage.setItem('k', JSON.stringify({ v: 1, found: [SAMPLE_IDS.window] }));
    mount(sampleState(), { storageKey: 'k', initialFound: [SAMPLE_IDS.desk] });
    expect(foundItems()).toEqual(['書桌']);
  });
});

describe('hooks 與 handle', () => {
  it('onChange 在找到、翻開線索卡、關閉、顯示所有熱點、重來時通知；open() 只翻出已找到的', () => {
    const calls: { found: string[]; revealing: boolean; open: string | null }[] = [];
    mount(sampleState(), {}, standalone, { onChange: (s) => calls.push(s) });
    click(SAMPLE_IDS.desk);
    expect(calls.at(-1)).toEqual({
      found: [SAMPLE_IDS.desk],
      revealing: false,
      open: SAMPLE_IDS.desk,
    });
    handle?.setReveal(true);
    expect(calls.at(-1)).toEqual({
      found: [SAMPLE_IDS.desk],
      revealing: true,
      open: SAMPLE_IDS.desk,
    });
    handle?.open(SAMPLE_IDS.shelf);
    expect(text('.cm-card-name')).toBe('書桌');
    handle?.open(null);
    expect(q('.cm-card').hasAttribute('data-empty')).toBe(true);
    expect(calls.at(-1)).toEqual({ found: [SAMPLE_IDS.desk], revealing: true, open: null });
    handle?.reset();
    expect(calls.at(-1)).toEqual({ found: [], revealing: false, open: null });
    expect(handle?.found()).toEqual([]);
  });

  it('initialReveal、initialOpen（試玩重新掛載帶回進度）：開著「顯示所有熱點」、翻開的線索卡；沒找到的卡不翻', () => {
    mount(sampleState(), {
      initialFound: [SAMPLE_IDS.desk, SAMPLE_IDS.shelf],
      initialReveal: true,
      initialOpen: SAMPLE_IDS.shelf,
    });
    expect(q('.cm-reveal').getAttribute('aria-pressed')).toBe('true');
    expect(text('.cm-card-name')).toBe('書架');
    expect(
      root.querySelector(`[data-found-item="${SAMPLE_IDS.shelf}"]`)?.getAttribute('aria-current'),
    ).toBe('true');
    handle?.destroy();
    mount(sampleState(), { initialFound: [SAMPLE_IDS.desk], initialOpen: SAMPLE_IDS.shelf });
    expect(q('.cm-card').hasAttribute('data-empty')).toBe(true);
  });

  it('destroy 清乾淨：再掛載一次是新的', () => {
    mount();
    click(SAMPLE_IDS.desk);
    handle?.destroy();
    expect(root.innerHTML).toBe('');
    expect(root.classList.contains('cm')).toBe(false);
    mount();
    expect(text('.cm-progress')).toBe('找到 0／8');
  });
});

describe('安全：使用者的文字一律當文字', () => {
  it('標題、導言、名稱、線索文字、檢定提示裡的 HTML 不會變成元素', () => {
    const evil = '<img src=x onerror=alert(1)><script>alert(2)</script>';
    const s = blankState();
    s.title = evil;
    s.intro = evil;
    s.spots = [
      newSpot('aaa1', 'rect', { x: 5, y: 5, w: 10, h: 10 }, evil, { text: evil, check: evil }),
    ];
    mount(s);
    click('aaa1');
    expect(root.querySelector('script')).toBeNull();
    expect(root.querySelectorAll('img').length).toBe(1);
    expect(text('.cm-title')).toBe(evil);
    expect(text('.cm-card-name')).toBe(evil);
    expect(text('.cm-text')).toBe(evil);
    expect(text('.cm-check')).toBe(`檢定提示：${evil}`);
  });

  it('KP 備註不在遊玩畫面的設定裡', () => {
    const cfg = playConfig(sampleState(), srcOf);
    expect(JSON.stringify(cfg)).not.toContain('memo');
    for (const s of sampleState().spots) expect(JSON.stringify(cfg)).not.toContain(s.memo);
  });
});

describe('自給自足', () => {
  it('原始碼不引用模組裡的東西：獨立執行的版本和直接 import 的行為一樣', () => {
    mount(sampleState(), {}, standalone);
    click(SAMPLE_IDS.shelf);
    const a = root.innerHTML;
    handle?.destroy();
    mount(sampleState(), {}, mountClueMap);
    click(SAMPLE_IDS.shelf);
    expect(root.innerHTML).toBe(a);
  });
});

describe('和 model 的出現條件規則一致（隨機資料）', () => {
  it('隨機的熱點與找到的集合：引擎的 ready／locked 和 isUnlocked 一樣', () => {
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let round = 0; round < 40; round++) {
      const n = 3 + Math.floor(rand() * 6);
      const ids = Array.from({ length: n }, (_, i) => `s${round}x${i}`);
      const spots: Spot[] = ids.map((id, i) =>
        newSpot(id, 'rect', { x: i * 5, y: 5, w: 4, h: 4 }, id, {
          locked: rand() > 0.3,
          requires: ids.filter((o) => o !== id && rand() > 0.6),
          mode: rand() > 0.5 ? 'all' : 'any',
        }),
      );
      const found = ids.filter(() => rand() > 0.6);
      const s = blankState();
      s.spots = spots;
      mount(s, { initialFound: found });
      const foundSet = new Set(found);
      for (const sp of spots) {
        const want = foundSet.has(sp.id) ? 'found' : isUnlocked(sp, foundSet) ? 'ready' : 'locked';
        expect(stateOf(sp.id), `${round} ${sp.id}`).toBe(want);
      }
      handle?.destroy();
    }
  });
});
