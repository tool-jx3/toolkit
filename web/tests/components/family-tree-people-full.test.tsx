// @vitest-environment jsdom
/**
 * family-tree：一張圖板滿 2,000 人時，所有「新增始祖」的按鈕都停用並提示（規格第 2 節、F07）。
 * 人物面板的加人按鈕本來就有（e2e）；這裡測工具列的「＋始祖」與空白圖板中央的「新增始祖」。
 */
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EmptyState } from '@/tools/family-tree/editor/EmptyState';
import { CanvasToolbar } from '@/tools/family-tree/editor/Toolbar';
import type { Board, People } from '@/tools/family-tree/model/types';
import { LIMITS } from '@/tools/family-tree/model/types';
import { setPrefs, useTree } from '@/tools/family-tree/store';
import { UiProvider } from '@/ui';

function crowd(n: number): Board {
  const people: People = {
    r: { id: 'r', kind: 'member', name: '根', gender: 'M', gen: 1, order: 1 },
  };
  for (let i = 0; i < n - 1; i++)
    people[`k${i}`] = {
      id: `k${i}`,
      kind: 'member',
      name: `子${i}`,
      gender: 'M',
      order: i + 1,
      fatherId: 'r',
    };
  return {
    id: 'crowd',
    title: '人數上限',
    createdAt: '2026-01-01T00:00:00.000Z',
    align: 'center',
    cats: [],
    people,
  };
}

function show(n: number) {
  act(() => {
    useTree.setState({ data: { boards: [crowd(n)] } });
    setPrefs({ current: 'crowd' });
  });
}

const HINT = `一張圖板最多 ${LIMITS.people} 人。`;

afterEach(() => {
  act(() => {
    useTree.setState({ data: { boards: [crowd(1)] } });
  });
});

describe('滿 2,000 人時不能再新增始祖（F07）', () => {
  it('工具列的「＋始祖」：1,999 人可以按；2,000 人停用、旁邊寫原因、按鈕的說明指到它', () => {
    show(LIMITS.people - 1);
    render(
      <UiProvider>
        <CanvasToolbar />
      </UiProvider>,
    );
    const add = screen.getByRole('button', { name: '新增始祖' });
    expect(add).toBeEnabled();
    expect(screen.queryByText(HINT)).toBeNull();
    show(LIMITS.people);
    expect(add).toBeDisabled();
    const hint = screen.getByText(HINT);
    expect(add.getAttribute('aria-describedby')).toBe(hint.id);
  });

  it('空白圖板中央的「新增始祖」：滿了就停用並提示', () => {
    show(LIMITS.people - 1);
    render(<EmptyState />);
    expect(screen.getByRole('button', { name: '新增始祖' })).toBeEnabled();
    expect(screen.queryByText(HINT)).toBeNull();
    show(LIMITS.people);
    const add = screen.getByRole('button', { name: '新增始祖' });
    expect(add).toBeDisabled();
    expect(add.getAttribute('aria-describedby')).toBe(screen.getByText(HINT).id);
  });
});
