/**
 * 選角畫面產生器：目標、路徑、時間軸、某個時間點的狀態、主格的內容、影格表（規格 3.1、3.3、3.4、3.7）。
 */
import { describe, expect, it } from 'vitest';
import { demoCharacters } from '@/tools/character-select/demo';
import { tileRects } from '@/tools/character-select/layout';
import { createDefaultSettings, type Settings } from '@/tools/character-select/model';
import {
  automaticPath,
  automaticStart,
  capturedPath,
  captureRefs,
  compactPath,
  confirmStartTime,
  easeInOutCubic,
  framePlan,
  gifFramePlan,
  mainPanelSelections,
  nextWaypoint,
  normalizeTargets,
  remapRefs,
  sceneAt,
  selectionIssue,
  selectionPath,
  timelineDuration,
  videoFramePlan,
} from '@/tools/character-select/motion';
import { sanitize } from '@/tools/character-select/sanitize';

function make(patch?: (s: Settings) => void): Settings {
  const s = createDefaultSettings();
  s.characters = demoCharacters();
  patch?.(s);
  sanitize(s);
  return s;
}

describe('自動路徑（規格 3.3 的例子）', () => {
  const s = make();
  it('預設 8 個角色、經過 3 格', () => {
    expect(selectionPath(s, 0, 0, 8)).toEqual([0, 3, 6, 3, 0]);
    expect(selectionPath(s, 1, 1, 8)).toEqual([2, 6, 2, 0, 1]);
    expect(selectionPath(s, 2, 2, 8)).toEqual([4, 1, 6, 5, 2]);
    expect(selectionPath(s, 3, 3, 8)).toEqual([6, 4, 2, 3]);
  });
  it('起點：(玩家 × 2 + max(0, 目標 − 經過格數 − 1)) mod 格數；有指定起始游標時用它', () => {
    expect(automaticStart(s, 1, 7, 8)).toBe((2 + 3) % 8);
    const t = make((d) => {
      d.players.starts[1] = 5;
    });
    expect(automaticStart(t, 1, 7, 8)).toBe(5);
    expect(automaticPath(t, 1, 1, 8)[0]).toBe(5);
  });
  it('經過 0 格：起點 → 目標', () => {
    const t = make((d) => {
      d.animation.hops = 0;
    });
    expect(selectionPath(t, 0, 0, 8)).toEqual([0]);
    expect(selectionPath(t, 1, 1, 8)).toEqual([2, 1]);
  });
  it('只有 1 格時只有第 0 格', () => {
    expect(selectionPath(s, 2, 0, 1)).toEqual([0]);
  });
});

describe('自行指定的路徑', () => {
  it('起點＋中繼點＋目標，去掉連續重複，結尾補目標', () => {
    expect(compactPath([2, 2, 5, 5, 1], 4, 8)).toEqual([2, 5, 1, 4]);
    expect(compactPath([3], 3, 8)).toEqual([3]);
    expect(compactPath([], 6, 8)).toEqual([6]);
    const s = make((d) => {
      d.players.pathModes[0] = 'custom';
      d.players.starts[0] = 7;
      d.players.paths[0] = [5, 5, 2];
    });
    /* 存著的中繼點也去掉連續重複 */
    expect(s.players.paths[0]).toEqual([5, 2]);
    expect(selectionPath(s, 0, 0, 8)).toEqual([7, 5, 2, 0]);
  });
  it('存著的中繼點去掉等於目標的點', () => {
    const s = make((d) => {
      d.players.paths[1] = [1, 4, 1, 6];
    });
    expect(s.players.paths[1]).toEqual([4, 6]);
  });
  it('固定目前的自動路徑：起點存成起始游標、中間的點存成中繼點', () => {
    const s = make();
    expect(capturedPath(s, 2, 2, 8)).toEqual({ start: 4, waypoints: [1, 6, 5] });
  });
  it('＋中繼點：上一個點的下一個角色，跳過目標與上一個點', () => {
    const s = make((d) => {
      d.players.pathModes[0] = 'custom';
      d.players.paths[0] = [];
    });
    /* 起點 0（目標 0）：下一個是 1 */
    expect(nextWaypoint(s, 0, 8)).toBe(1);
    const t = make((d) => {
      d.players.pathModes[1] = 'custom';
      d.players.paths[1] = [0];
    });
    /* 上一個點 0 → 1 是目標，跳到 2 */
    expect(nextWaypoint(t, 1, 8)).toBe(2);
    const full = make((d) => {
      d.players.paths[0] = Array.from({ length: 24 }, (_, i) => (i % 2) + 1);
    });
    expect(nextWaypoint(full, 0, 8)).toBeNull();
  });
});

describe('目標的重複處理', () => {
  it('不可重複：撞到的往後找沒人選的；剛改的玩家優先', () => {
    const s = make();
    s.players.targets[2] = 0;
    normalizeTargets(s, 2);
    /* 3P 改成 0（優先）→ 1P 讓到 1 → 2P 再讓到 2 */
    expect(s.players.targets.slice(0, 4)).toEqual([1, 2, 0, 3]);
  });
  it('允許重複時不改', () => {
    const s = make((d) => {
      d.players.allowDuplicate = true;
      d.players.targets = [5, 5, 5, 5];
    });
    expect(s.players.targets.slice(0, 4)).toEqual([5, 5, 5, 5]);
  });
  it('目標夾在 0～角色數 − 1', () => {
    const s = make((d) => {
      d.players.targets = [99, -3, 2, 3];
    });
    expect(s.players.targets.slice(0, 4)).toEqual([7, 0, 2, 3]);
  });
  it('角色不夠：依序、不可重複、畫面上的角色比人數少', () => {
    const s = make((d) => {
      d.players.count = 9;
    });
    expect(selectionIssue(s)).toEqual({ visible: 8, players: 9 });
    expect(
      selectionIssue(
        make((d) => void Object.assign(d.players, { count: 9, allowDuplicate: true })),
      ),
    ).toBeNull();
    expect(
      selectionIssue(
        make((d) => void Object.assign(d.players, { count: 9, selectionMode: 'single' })),
      ),
    ).toBeNull();
  });
});

describe('時間軸與狀態（規格 3.1、3.4）', () => {
  const s = make();
  const rects = tileRects(s);
  it('總長＝開場 + 人數 × (移動 + 確定) + 結尾', () => {
    expect(timelineDuration(s)).toBe(8450);
    expect(confirmStartTime(s, 1)).toBe(650 + 1550 + 900);
  });
  it('開場等待：游標在第一位的起點、頁尾「準備」', () => {
    const sc = sceneAt(s, 100);
    expect(sc).toMatchObject({
      activePlayer: 0,
      hoverIndex: 0,
      waiting: true,
      confirmProgress: 0,
      final: false,
    });
    expect(sc.cursorRect).toEqual(rects[0]);
  });
  it('游標移動：均分路徑、ease-in-out 內插，超過 0.45 換下一格', () => {
    /* 1P 的路徑 0→3→6→3→0（4 段），段長 225 ms */
    const at = (ms: number) => sceneAt(s, 650 + ms);
    const local = easeInOutCubic(0.5);
    const sc = at(225 * 0.5);
    expect(sc.hoverIndex).toBe(3);
    expect(sc.cursorRect?.x).toBeCloseTo(rects[0].x + (rects[3].x - rects[0].x) * local, 8);
    expect(at(225 * 0.4).hoverIndex).toBe(0);
    expect(at(225 * 1.2).hoverIndex).toBe(3);
  });
  it('確定演出：游標在目標、進度＝經過 ÷ 確定演出', () => {
    const sc = sceneAt(s, 650 + 900 + 325);
    expect(sc).toMatchObject({ activePlayer: 0, hoverIndex: 0, confirming: true });
    expect(sc.confirmProgress).toBeCloseTo(0.5, 10);
  });
  it('鎖定與完成', () => {
    const sc = sceneAt(s, 650 + 1550 + 10);
    expect(sc.locked).toEqual([{ player: 0, target: 0 }]);
    expect(sc.activePlayer).toBe(1);
    const end = sceneAt(s, 8000);
    expect(end.final).toBe(true);
    expect(end.locked).toHaveLength(4);
    expect(end.hoverIndex).toBe(-1);
  });
  it('單一玩家：只播那一號', () => {
    const t = make((d) => {
      d.players.selectionMode = 'single';
      d.players.singleNumber = 2;
    });
    expect(timelineDuration(t)).toBe(650 + 1550 + 1600);
    expect(sceneAt(t, 0).activePlayer).toBe(1);
  });
  it('沒有角色時一開始就是完成', () => {
    const t = make((d) => {
      d.characters = [];
    });
    expect(sceneAt(t, 0).final).toBe(true);
  });
});

describe('主格的內容', () => {
  it('確定的當下才填；鎖定的依播放順序 mod 格數', () => {
    const s = make((d) => {
      d.mainPanel.enabled = true;
      d.mainPanel.count = 2;
      d.mainPanel.columns = 2;
    });
    expect(mainPanelSelections(s, sceneAt(s, 650 + 100))).toEqual([null, null]);
    expect(mainPanelSelections(s, sceneAt(s, 650 + 900 + 1))).toEqual([
      { player: 0, target: 0 },
      null,
    ]);
    /* 3P 鎖定後蓋掉第 1 格 */
    expect(mainPanelSelections(s, sceneAt(s, 650 + 1550 * 3 + 10))).toEqual([
      { player: 2, target: 2 },
      { player: 1, target: 1 },
    ]);
  });
  it('游標移過去就先顯示：開場等待時不顯示', () => {
    const s = make((d) => {
      d.mainPanel.enabled = true;
      d.mainPanel.reveal = 'hover';
    });
    expect(mainPanelSelections(s, sceneAt(s, 100))).toEqual([null]);
    expect(mainPanelSelections(s, sceneAt(s, 700))).toEqual([{ player: 0, target: 0 }]);
  });
});

describe('影格表（規格 3.7）', () => {
  const s = make();
  it('圖片：預設 10 FPS 共 66 格、總長 8450 ms', () => {
    const p = framePlan(s, 10);
    expect(p).toHaveLength(66);
    expect(p[0]).toEqual({ time: 0, delay: 650 });
    expect(p[1]).toEqual({ time: 650.01, delay: 100 });
    /* 確定演出 650 ms：6 格 100 ms＋1 格 50 ms */
    expect(p.slice(10, 17).map((f) => f.delay)).toEqual([100, 100, 100, 100, 100, 100, 50]);
    expect(p.at(-1)).toEqual({ time: 6850.01, delay: 1600 });
    expect(p.reduce((a, f) => a + f.delay, 0)).toBeCloseTo(8450, 6);
  });
  it('開場等待 0 時沒有第一格；結尾至少 20 ms', () => {
    const t = make((d) => {
      d.animation.initialHold = 0;
    });
    expect(framePlan(t, 10)[0].time).toBeCloseTo(0.01, 10);
  });
  it('GIF：60 FPS 以 50 FPS 切格，延遲以 1/100 秒累計、每格至少 2', () => {
    const g = gifFramePlan(s, 60);
    for (const f of g) {
      expect(f.delay % 10).toBe(0);
      expect(f.delay).toBeGreaterThanOrEqual(20);
    }
    expect(g.reduce((a, f) => a + f.delay, 0)).toBe(8450);
    /* 每位玩家確定演出最後 10 ms 的那一格併到下一格 */
    expect(g).toHaveLength(framePlan(s, 50).length - 4);
  });
  it('GIF：48 FPS 的尾數太短的格併到下一格', () => {
    const g = gifFramePlan(s, 48);
    expect(g.reduce((a, f) => a + f.delay, 0)).toBe(8450);
    expect(g.length).toBeLessThan(framePlan(s, 48).length);
    for (const f of g) expect(f.delay).toBeGreaterThanOrEqual(20);
  });
  it('影片：⌈T × FPS ÷ 1000⌉ 格，第 i 格在 i × 1000 ÷ FPS', () => {
    const v = videoFramePlan(s, 10);
    expect(v).toHaveLength(85);
    expect(v[3]).toEqual({ time: 300, delay: 100 });
    expect(videoFramePlan(s, 30)).toHaveLength(Math.ceil(8.45 * 30));
  });
});

describe('排序、複製、刪除後玩家的設定跟著角色走', () => {
  it('對調第 1、2 個角色：目標、起始游標、中繼點跟著走', () => {
    const s = make((d) => {
      d.players.starts[2] = 0;
      d.players.paths[2] = [1, 5];
    });
    const refs = captureRefs(s);
    [s.characters[0], s.characters[1]] = [s.characters[1], s.characters[0]];
    remapRefs(s, refs);
    sanitize(s);
    expect(s.players.targets.slice(0, 4)).toEqual([1, 0, 2, 3]);
    expect(s.players.starts[2]).toBe(1);
    expect(s.players.paths[2]).toEqual([0, 5]);
  });
  it('刪除：起始游標變回隨機、中繼點拿掉、目標改指同一個位置', () => {
    const s = make((d) => {
      d.players.starts[0] = 3;
      d.players.paths[1] = [3, 4];
    });
    const refs = captureRefs(s);
    s.characters.splice(3, 1);
    remapRefs(s, refs);
    sanitize(s);
    expect(s.players.starts[0]).toBeNull();
    expect(s.players.paths[1]).toEqual([3]);
    expect(s.players.targets[3]).toBe(3);
  });
});
