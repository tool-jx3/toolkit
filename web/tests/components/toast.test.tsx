// @vitest-environment jsdom
/**
 * useToast 的 replace（emotion-maker 移植時新增）：新通知取代畫面上現有的通知；不給時照舊疊起來（最多 4 則）。
 * dismissOnClick（bg-motion 修正時新增）：點通知本體立刻關閉；不給時點本體不會關（只有 ×）。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UiProvider, useToast } from '@/ui';

function Probe({ replace, dismissOnClick }: { replace?: boolean; dismissOnClick?: boolean }) {
  const toast = useToast();
  return (
    <>
      <button type="button" onClick={() => toast({ title: '第一則', replace, dismissOnClick })}>
        一
      </button>
      <button type="button" onClick={() => toast({ title: '第二則', replace, dismissOnClick })}>
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

  it('dismissOnClick：點通知本體立刻關閉', async () => {
    render(
      <UiProvider>
        <Probe dismissOnClick />
      </UiProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: '一' }));
    fireEvent.click(await screen.findByText('第一則'));
    await waitFor(() => expect(screen.queryByText('第一則')).toBeNull());
  });

  it('不給 dismissOnClick：點本體不會關（向下相容），× 照樣能關', async () => {
    render(
      <UiProvider>
        <Probe />
      </UiProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: '一' }));
    fireEvent.click(await screen.findByText('第一則'));
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.getByText('第一則')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '關閉通知' }));
    await waitFor(() => expect(screen.queryByText('第一則')).toBeNull());
  });
});
