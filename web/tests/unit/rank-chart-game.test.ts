/**
 * 排行榜產生器（rank-chart）的遊戲流程與狀態：
 * - 開始前的檢查、開始（洗牌、抽第一位）、抽選的演出（時間到才揭曉；不要快速切換時不換圖）、
 *   選名次（再確認／直接確定）、自動抽下一位（0.8 秒）、完成、回到設定、再玩一次；
 * - 這一局不列入復原（復原只動設定）；遊戲中設定的動作不做事；
 * - 原作設定檔（沒有照片的部分）：標題的助詞接回文字、範圍、id 重複的設定檔不收。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addBlank, addNames, removeCharacter, set } from '@/tools/rank-chart/actions';
import {
  commitPending,
  drawNext,
  endGame,
  pickRank,
  restartGame,
  setRng,
  startGame,
} from '@/tools/rank-chart/game';
import { defaultConfig, type Rng, titleParts } from '@/tools/rank-chart/model';
import { importLegacy } from '@/tools/rank-chart/project';
import { configNow, runNow, useConfig, useSession } from '@/tools/rank-chart/store';

const lcg = (seed: number): Rng => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s;
  };
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
  let t = 0;
  vi.stubGlobal(
    'requestAnimationFrame',
    (cb: FrameRequestCallback) =>
      setTimeout(() => {
        t += 16;
        cb(t);
      }, 16) as unknown as number,
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  vi.spyOn(performance, 'now').mockImplementation(() => t);
  endGame();
  useConfig.getState().replace(defaultConfig(false));
  useConfig.temporal.getState().clear();
  setRng(lcg(7));
});

afterEach(() => {
  endGame();
  setRng(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const phase = () => runNow()?.phase;

describe('流程', () => {
  it('開始：檢查沒過就不開始；開始後抽第一位，演出 1.8 秒才揭曉，期間輪流換候選', () => {
    useConfig.getState().update((d) => {
      d.name = ' ';
    });
    expect(startGame()?.kind).toBe('name');
    expect(runNow()).toBeNull();
    useConfig.getState().update((d) => {
      d.name = '小明';
    });
    expect(startGame()).toBeNull();
    expect(phase()).toBe('spinning');
    const seen = new Set<string | null>([useSession.getState().spinId]);
    for (let i = 0; i < 200 && phase() === 'spinning'; i++) {
      vi.advanceTimersByTime(16);
      seen.add(useSession.getState().spinId);
    }
    expect(phase()).toBe('revealed');
    expect(seen.size).toBeGreaterThan(3);
    expect(useSession.getState().spinId).toBeNull();
    /* 揭曉的是出場順序的第一位 */
    expect(runNow()?.turn).toBe(0);
  });

  it('不要快速切換：抽選中卡片是「?」（沒有候選），時間到直接揭曉', () => {
    useConfig.getState().update((d) => {
      d.reducedMotion = true;
      d.spinMs = 1000;
    });
    startGame();
    expect(useSession.getState().spinId).toBeNull();
    vi.advanceTimersByTime(500);
    expect(useSession.getState().spinId).toBeNull();
    expect(phase()).toBe('spinning');
    vi.advanceTimersByTime(600);
    expect(phase()).toBe('revealed');
  });

  it('再確認：選了先待確定、可以改；確定後 between；抽下一位；全部確定後 complete', () => {
    useConfig.getState().update((d) => {
      d.slots = 3;
      d.spinMs = 1000;
    });
    startGame();
    vi.advanceTimersByTime(1100);
    expect(pickRank(2)).toBe('pending');
    expect(pickRank(1)).toBe('pending');
    expect(runNow()?.pending).toBe(1);
    expect(commitPending()).toBe(true);
    expect(phase()).toBe('between');
    expect(pickRank(0)).toBe('ignored');
    drawNext();
    vi.advanceTimersByTime(1100);
    expect(pickRank(1)).toBe('filled');
    pickRank(0);
    commitPending();
    drawNext();
    vi.advanceTimersByTime(1100);
    pickRank(2);
    commitPending();
    expect(phase()).toBe('complete');
    expect(runNow()?.ranks.map((r) => r?.drawIndex)).toEqual([2, 1, 3]);
  });

  it('不再確認＋自動抽下一位：點了就確定，0.8 秒後自動開始下一次抽選', () => {
    useConfig.getState().update((d) => {
      d.slots = 2;
      d.spinMs = 1000;
      d.confirmRank = false;
      d.autoNext = true;
    });
    startGame();
    vi.advanceTimersByTime(1100);
    expect(pickRank(1)).toBe('commit');
    expect(phase()).toBe('between');
    vi.advanceTimersByTime(700);
    expect(phase()).toBe('between');
    vi.advanceTimersByTime(200);
    expect(phase()).toBe('spinning');
    vi.advanceTimersByTime(1100);
    pickRank(0);
    expect(phase()).toBe('complete');
  });

  it('回到設定（抽選中也停住）、再玩一次（重新洗牌）', () => {
    startGame();
    endGame();
    expect(runNow()).toBeNull();
    vi.advanceTimersByTime(3000);
    expect(runNow()).toBeNull();
    startGame();
    const first = runNow()?.deck;
    restartGame();
    expect(phase()).toBe('spinning');
    expect(runNow()?.deck).not.toEqual(first);
  });

  it('窄畫面開始時進入播放畫面；開始時結束擺放模式', () => {
    useSession.setState({ placing: true, focus: false });
    startGame(true);
    expect(useSession.getState()).toMatchObject({ placing: false, focus: true });
    endGame();
    expect(useSession.getState().focus).toBe(false);
  });
});

describe('鎖定與復原', () => {
  it('遊戲中設定的動作不做事；這一局不列入復原', () => {
    const before = configNow();
    startGame();
    set((d) => {
      d.name = '別人';
    });
    expect(addNames(['新角色'])).toBe(false);
    expect(addBlank()).toBeNull();
    removeCharacter(before.characters[0].id);
    expect(configNow()).toBe(before);
    expect(useConfig.temporal.getState().pastStates).toHaveLength(0);
    endGame();
    vi.advanceTimersByTime(10);
    set((d) => {
      d.name = '別人';
    });
    expect(useConfig.temporal.getState().pastStates).toHaveLength(1);
  });

  it('名單上限 120 位', () => {
    expect(addNames(Array.from({ length: 111 }, (_, i) => `n${i}`))).toBe(false);
    expect(addNames(Array.from({ length: 110 }, (_, i) => `n${i}`))).toBe(true);
    expect(configNow().characters).toHaveLength(120);
    expect(addBlank()).toBeNull();
  });
});

describe('原作的設定檔', () => {
  const file = (config: Record<string, unknown>) =>
    JSON.stringify({ app: 'blind-pick-studio', version: 1, config });
  const chars = [{ id: 'c1', name: ' 도윤 ', source: '', crop: { zoom: 9 } }];

  it('標題：名字的助詞放在連接文字前面、主題的助詞接在主題後面，排出來與原作相同', async () => {
    const r = await importLegacy(
      file({
        name: '김씨',
        nameParticle: 'auto',
        intro: '말아주는',
        subject: 'OOOO 등장인물',
        subjectParticle: 'with',
        question: '사귈 수 있을까?',
        slots: 30,
        spinMs: 2800,
        format: '9:16',
        theme: 'lilac',
        overlay: { x: 0.2, y: 2, size: 0.1 },
        characters: chars,
      }),
    );
    expect(titleParts(r.config)).toEqual({
      first: '김씨가 말아주는',
      second: 'OOOO 등장인물과',
      third: '사귈 수 있을까?',
    });
    expect(r.config).toMatchObject({ slots: 20, spinMs: 2800, format: '9:16', theme: 'lilac' });
    expect(r.config.overlay).toEqual({ x: 0.2, y: 1, size: 0.2 });
    expect(r.config.characters).toEqual([
      { id: 'c1', name: '도윤', photo: null, thumb: null, crop: { zoom: 4, x: 0, y: 0 } },
    ]);
    const none = await importLegacy(
      file({
        name: 'Kim',
        nameParticle: 'none',
        intro: 'presents',
        subject: 'X',
        subjectParticle: 'none',
        characters: chars,
      }),
    );
    expect(titleParts(none.config).first).toBe('Kim presents');
    const noIntro = await importLegacy(
      file({ name: '박준', intro: '', subject: 'X', characters: chars }),
    );
    expect(titleParts(noIntro.config)).toMatchObject({ first: '박준이', second: 'X과' });
  });

  it('不收：不是 JSON、不是原作的檔、版本不同、超過 120 位、id 重複、照片資料不對', async () => {
    await expect(importLegacy('{')).rejects.toThrow('格式錯誤');
    await expect(
      importLegacy(JSON.stringify({ app: 'x', version: 1, config: {} })),
    ).rejects.toThrow('這不是原作存的第 1 版設定檔。');
    await expect(
      importLegacy(
        JSON.stringify({ app: 'blind-pick-studio', version: 2, config: { characters: [] } }),
      ),
    ).rejects.toThrow();
    await expect(
      importLegacy(file({ characters: Array.from({ length: 121 }, () => ({ name: 'x' })) })),
    ).rejects.toThrow('120');
    await expect(
      importLegacy(
        file({
          characters: [
            { id: 'a', name: 'A' },
            { id: 'a', name: 'B' },
          ],
        }),
      ),
    ).rejects.toThrow();
    await expect(
      importLegacy(
        file({ characters: [{ id: 'a', name: 'A', source: 'data:text/plain;base64,AAAA' }] }),
      ),
    ).rejects.toThrow('第 1 位');
  });
});
