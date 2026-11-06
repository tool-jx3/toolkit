/**
 * 共用模組：
 * - core/mirror：GM 的分頁送內容、玩家的視窗先問再收、GM 關閉時通知（BroadcastChannel；Node 也有）。
 * - core/combat：送到戰鬥追蹤的參戰者格式（讀寫、夾範圍、看不懂的略過、最多 200 筆）。
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  COMBAT_HANDOFF_FORMAT,
  encodeCombatHandoff,
  parseCombatHandoff,
  readCombatSeed,
  seedTotal,
} from '@/core/combat';
import {
  createMirrorHost,
  createMirrorView,
  mirrorChannelName,
  mirrorSupported,
} from '@/core/mirror';

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

describe('core/mirror', () => {
  const closers: (() => void)[] = [];
  afterEach(() => {
    for (const c of closers.splice(0)) c();
  });

  it('頻道名稱、支援', () => {
    expect(mirrorChannelName('x')).toBe('trpg-toolkit:mirror:x');
    expect(mirrorSupported()).toBe(true);
  });

  it('玩家的視窗後開：先問，拿到最後一份；之後每次 publish 都收到；GM 關閉時通知', async () => {
    const host = createMirrorHost<{ n: number }>('t1');
    closers.push(host.close);
    host.publish({ n: 1 });
    host.publish({ n: 2 });
    const got: number[] = [];
    let closed = 0;
    const view = createMirrorView<{ n: number }>('t1', {
      state: (d) => got.push(d.n),
      closed: () => {
        closed += 1;
      },
    });
    closers.push(view.close);
    await tick();
    expect(got).toEqual([2]);
    host.publish({ n: 3 });
    await tick();
    expect(got).toEqual([2, 3]);
    host.close();
    await tick();
    expect(closed).toBe(1);
  });

  it('不同的 topic 互不干擾；GM 還沒送過時問了也沒有內容', async () => {
    const host = createMirrorHost<number>('t2');
    closers.push(host.close);
    const got: number[] = [];
    const view = createMirrorView<number>('t3', { state: (d) => got.push(d) });
    closers.push(view.close);
    host.publish(5);
    await tick();
    expect(got).toEqual([]);
    const other = createMirrorView<number>('t2', { state: (d) => got.push(d) });
    closers.push(other.close);
    await tick();
    expect(got).toEqual([5]);
  });
});

describe('core/combat', () => {
  it('讀一筆：名字必填（60 字）、數值夾在範圍、看不懂的欄位略過', () => {
    expect(readCombatSeed({ name: '  ' })).toBeNull();
    expect(readCombatSeed('x')).toBeNull();
    expect(
      readCombatSeed({
        name: `${'名'.repeat(70)}`,
        count: 99,
        side: 'boss',
        init: 1000,
        initMod: -50,
        rollInit: 'yes',
        hp: 0,
        ac: 12.6,
        note: ' 備註 ',
      }),
    ).toEqual({
      name: '名'.repeat(60),
      count: 20,
      init: 99,
      initMod: -20,
      hp: 1,
      ac: 13,
      note: '備註',
    });
  });

  it('寫與讀的往返；格式不對時 null；最多 200 筆', () => {
    const seeds = [
      {
        name: '食人魔',
        count: 2,
        side: 'enemy' as const,
        hp: 45,
        ac: 13,
        initMod: 0,
        rollInit: true,
      },
      { name: '嚮導', side: 'ally' as const, init: 14 },
    ];
    expect(parseCombatHandoff(encodeCombatHandoff(seeds))).toEqual(seeds);
    expect(JSON.parse(encodeCombatHandoff(seeds)).format).toBe(COMBAT_HANDOFF_FORMAT);
    expect(seedTotal(seeds)).toBe(3);
    expect(parseCombatHandoff('{')).toBeNull();
    expect(parseCombatHandoff('{"format":"x","seeds":[]}')).toBeNull();
    const many = Array.from({ length: 250 }, (_, i) => ({ name: `n${i}` }));
    expect(parseCombatHandoff(encodeCombatHandoff([{ name: '' }, ...many]))).toHaveLength(200);
  });
});
