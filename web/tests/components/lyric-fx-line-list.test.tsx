// @vitest-environment jsdom
/**
 * 逐句清單在預覽上拖曳時的重畫（lyric-fx 規格 D28、F76、F77）：
 * - 只動手動調整（拖曳、改顏色…）時，每一列的內容沒有變，列不重畫（builtLines 沿用沒變的列）；改了某一句的文字只有那一列重畫。
 * - 拖曳中（session.dragging），被選取那一列的數字欄停在拖曳前的值，放開才更新。
 */
import { act, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdjustFields } from '@/tools/lyric-fx/LineAdjust';
import { LineList } from '@/tools/lyric-fx/LineList';
import { defaultSettings } from '@/tools/lyric-fx/model';
import { builtLines } from '@/tools/lyric-fx/scene';
import { edit, useSession, useSettings } from '@/tools/lyric-fx/store';
import { UiProvider } from '@/ui';

/* 每一列的時間欄畫了幾次：列重畫時，裡面的時間欄跟著重畫 */
const timeRenders = new Map<string, number>();
vi.mock('@/tools/lyric-fx/widgets', async (orig) => {
  const m = await orig<typeof import('@/tools/lyric-fx/widgets')>();
  return {
    ...m,
    TimeInput: (p: ComponentProps<typeof m.TimeInput>) => {
      const k = String(p['aria-label']);
      timeRenders.set(k, (timeRenders.get(k) ?? 0) + 1);
      return <m.TimeInput {...p} />;
    },
  };
});

const LRC = Array.from(
  { length: 12 },
  (_, i) => `[00:${String(1 + i * 2).padStart(2, '0')}.00]第${i + 1}句歌詞`,
).join('\n');

beforeEach(() => {
  timeRenders.clear();
  act(() => {
    useSettings
      .getState()
      .replace({ ...defaultSettings(), lyrics: { ...defaultSettings().lyrics, text: LRC } });
    useSession.setState({ selected: null, dragging: false });
  });
});

describe('builtLines：列的物件', () => {
  it('只改手動調整：每一列沿用上一次的物件（整個陣列也一樣）；改一句的文字：只有那一列換新', () => {
    const a = builtLines(useSettings.getState().data);
    const key = a.rows[3].key;
    act(() =>
      edit((d) => {
        d.overrides[key] = { adjust: { x: 0.3, y: 0.4, angle: 0 } };
      }),
    );
    const b = builtLines(useSettings.getState().data);
    expect(b).not.toBe(a);
    expect(b.lines[3].adjust).toBeTruthy();
    expect(b.rows).toBe(a.rows);
    act(() =>
      edit((d) => {
        d.overrides[key] = { ...d.overrides[key], text: '改過的字' };
      }),
    );
    const c = builtLines(useSettings.getState().data);
    expect(c.rows[3]).not.toBe(a.rows[3]);
    expect(c.rows[3].text).toBe('改過的字');
    for (const i of [0, 1, 2, 4, 5, 11]) expect(c.rows[i]).toBe(a.rows[i]);
  });
});

describe('逐句清單：每一列只在自己的資料變了才重畫', () => {
  it('拖曳（只改手動位置）時沒有任何一列重畫；改一句的文字只有那一列重畫', () => {
    render(
      <UiProvider>
        <LineList />
      </UiProvider>,
    );
    const all = useSettings.getState().data;
    const key = builtLines(all).rows[5].key;
    expect(timeRenders.size).toBe(12);
    const first = new Map(timeRenders);
    for (const v of first.values()) expect(v).toBe(1);
    /* 連續拖曳：位置一直在變 */
    for (let i = 0; i < 5; i++)
      act(() =>
        edit((d) => {
          d.overrides[key] = { adjust: { x: 0.2 + i * 0.05, y: 0.5, angle: 0 } };
        }),
      );
    const afterDrag = [...timeRenders.entries()].filter(([k, v]) => v !== first.get(k));
    /* 只有被調整的那一列（多了「手動調整」標示、第一次寫入時）重畫過；其他列一次都沒有 */
    expect(afterDrag.map(([k]) => k)).toEqual(['第 6 句的時間']);
    const settled = timeRenders.get('第 6 句的時間');
    for (let i = 0; i < 5; i++)
      act(() =>
        edit((d) => {
          d.overrides[key] = { adjust: { x: 0.5 + i * 0.02, y: 0.5, angle: 0 } };
        }),
      );
    expect(timeRenders.get('第 6 句的時間')).toBe(settled);
    const other = builtLines(useSettings.getState().data).rows[2].key;
    const before = new Map(timeRenders);
    act(() =>
      edit((d) => {
        d.overrides[other] = { text: '換字' };
      }),
    );
    const changed = [...timeRenders.entries()]
      .filter(([k, v]) => v !== before.get(k))
      .map(([k]) => k);
    expect(changed).toEqual(['第 3 句的時間']);
  });
});

describe('被選取那一列的數字欄：拖曳中停住、放開才更新', () => {
  const x = () =>
    Number.parseFloat((screen.getByRole('spinbutton', { name: 'X' }) as HTMLInputElement).value);

  it('dragging 時 X 欄不變；放開（dragging＝false）後顯示新的值', () => {
    const key = builtLines(useSettings.getState().data).rows[1].key;
    act(() =>
      edit((d) => {
        d.overrides[key] = { adjust: { x: 0.25, y: 0.5, angle: 0 } };
      }),
    );
    render(<AdjustFields rowKey={key} n={2} text="第2句歌詞" />);
    expect(x()).toBeCloseTo(25, 0);
    act(() => useSession.setState({ dragging: true }));
    for (const v of [0.4, 0.5, 0.6])
      act(() =>
        edit((d) => {
          d.overrides[key] = { adjust: { x: v, y: 0.5, angle: 0 } };
        }),
      );
    expect(x()).toBeCloseTo(25, 0);
    act(() => useSession.setState({ dragging: false }));
    expect(x()).toBeCloseTo(60, 0);
  });

  it('沒有拖曳時照樣即時（方向鍵、欄位輸入、顏色滑桿的變更馬上看得到）', () => {
    const key = builtLines(useSettings.getState().data).rows[1].key;
    act(() =>
      edit((d) => {
        d.overrides[key] = { adjust: { x: 0.25, y: 0.5, angle: 0 } };
      }),
    );
    render(<AdjustFields rowKey={key} n={2} text="第2句歌詞" />);
    act(() =>
      edit((d) => {
        d.overrides[key] = { adjust: { x: 0.35, y: 0.5, angle: 0 } };
      }),
    );
    expect(x()).toBeCloseTo(35, 0);
  });
});
