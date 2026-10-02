// @vitest-environment jsdom
/**
 * useToast 的 replace（emotion-maker 移植時新增）：新通知取代畫面上現有的通知；不給時照舊疊起來（最多 4 則）。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UiProvider, useToast } from '@/ui';

function Probe({ replace }: { replace?: boolean }) {
  const toast = useToast();
  return (
    <>
      <button type="button" onClick={() => toast({ title: '第一則', replace })}>
        一
      </button>
      <button type="button" onClick={() => toast({ title: '第二則', replace })}>
        二
      </button>
    </>
  );
}

describe('useToast', () => {
  it('不給 replace：通知疊起來（向下相容）', async () => {
    render(
      <UiProvider>
        <Probe />
      </UiProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: '一' }));
    fireEvent.click(screen.getByRole('button', { name: '二' }));
    expect(await screen.findByText('第一則')).toBeTruthy();
    expect(screen.getByText('第二則')).toBeTruthy();
  });

  it('replace：新的通知取代舊的', async () => {
    render(
      <UiProvider>
        <Probe replace />
      </UiProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: '一' }));
    expect(await screen.findByText('第一則')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '二' }));
    expect(await screen.findByText('第二則')).toBeTruthy();
    expect(screen.queryByText('第一則')).toBeNull();
  });
});
