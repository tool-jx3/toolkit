// @vitest-environment jsdom
/**
 * useToast 的 replace（emotion-maker 移植時新增）：新通知取代畫面上現有的通知；不給時照舊疊起來（最多 4 則）。
 * dismissOnClick（bg-motion 修正時新增）：點通知本體立刻關閉；不給時點本體不會關（只有 ×）。
 * Esc（room-zip 修正時新增）：有對話框時 Esc 交給對話框（通知留著）；沒有對話框時照舊關閉通知。
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Dialog, UiProvider, useConfirm, useToast } from '@/ui';

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

/* ---------- Esc 與對話框（room-zip 修正時新增） ---------- */

function DialogProbe({ keepOnEscape }: { keepOnEscape?: boolean }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [open, setOpen] = useState(true);
  const [answer, setAnswer] = useState('');
  return (
    <>
      <span data-testid="state">{open ? '開著' : '關了'}</span>
      <span data-testid="answer">{answer}</span>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="測試對話框"
        onEscapeKeyDown={keepOnEscape ? (e) => e.preventDefault() : undefined}
      >
        <button type="button" onClick={() => toast({ title: '已儲存' })}>
          通知
        </button>
        <button
          type="button"
          onClick={async () => setAnswer(String(await confirm({ title: '要刪除嗎？' })))}
        >
          確認
        </button>
      </Dialog>
    </>
  );
}

const pressEscape = (el: Element | null) =>
  fireEvent.keyDown(el ?? document.body, { key: 'Escape', code: 'Escape' });

describe('useToast：Esc 與對話框', () => {
  it('沒有對話框時，Esc 照舊關閉通知（向下相容）', async () => {
    render(
      <UiProvider>
        <Probe />
      </UiProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: '一' }));
    expect(await screen.findByText('第一則')).toBeTruthy();
    pressEscape(document.body);
    await waitFor(() => expect(screen.queryByText('第一則')).toBeNull());
  });

  it('焦點在對話框裡：有通知時一次 Esc 就關閉對話框，通知留著', async () => {
    render(
      <UiProvider>
        <DialogProbe />
      </UiProvider>,
    );
    const btn = await screen.findByRole('button', { name: '通知' });
    fireEvent.click(btn);
    expect(await screen.findByText('已儲存')).toBeTruthy();
    btn.focus();
    pressEscape(btn);
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('關了'));
    expect(screen.getByText('已儲存')).toBeTruthy();
  });

  it('焦點在 body 時，Esc 關閉最上層的對話框', async () => {
    render(
      <UiProvider>
        <DialogProbe />
      </UiProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: '通知' }));
    expect(await screen.findByText('已儲存')).toBeTruthy();
    (document.activeElement as HTMLElement | null)?.blur();
    pressEscape(document.body);
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('關了'));
    expect(screen.getByText('已儲存')).toBeTruthy();
  });

  it('onEscapeKeyDown 呼叫 preventDefault 時不關閉（有通知時也一樣）', async () => {
    render(
      <UiProvider>
        <DialogProbe keepOnEscape />
      </UiProvider>,
    );
    const btn = await screen.findByRole('button', { name: '通知' });
    btn.focus();
    pressEscape(btn);
    fireEvent.click(btn);
    expect(await screen.findByText('已儲存')).toBeTruthy();
    btn.focus();
    pressEscape(btn);
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.getByTestId('state').textContent).toBe('開著');
  });

  it('確認對話框：有通知時 Esc＝取消', async () => {
    render(
      <UiProvider>
        <DialogProbe />
      </UiProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: '確認' }));
    const ok = await screen.findByRole('button', { name: '確定' });
    /* 確認對話框開著時才跳出通知：通知是最上層的圖層 */
    fireEvent.click(screen.getByRole('button', { name: '通知', hidden: true }));
    expect(await screen.findByText('已儲存')).toBeTruthy();
    ok.focus();
    pressEscape(ok);
    await waitFor(() => expect(screen.getByTestId('answer').textContent).toBe('false'));
    expect(screen.getByTestId('state').textContent).toBe('開著');
    expect(screen.getByText('已儲存')).toBeTruthy();
  });
});

/* ---------- 關閉後焦點回到開啟前的元素（coc-dice 對等驗證後修正） ---------- */

function ConfirmFocusProbe({ removeTrigger }: { removeTrigger?: boolean }) {
  const confirm = useConfirm();
  const [shown, setShown] = useState(true);
  return shown ? (
    <button
      type="button"
      onClick={async () => {
        await confirm({ title: '全部刪除？' });
        if (removeTrigger) setShown(false);
      }}
    >
      全部刪除
    </button>
  ) : (
    <span>按鈕已移除</span>
  );
}

describe('useConfirm：關閉後焦點回到開啟前的元素', () => {
  for (const answer of ['確定', '取消'] as const) {
    it(`按「${answer}」後焦點回到觸發的按鈕`, async () => {
      render(
        <UiProvider>
          <ConfirmFocusProbe />
        </UiProvider>,
      );
      const trigger = screen.getByRole('button', { name: '全部刪除' });
      trigger.focus();
      fireEvent.click(trigger);
      const dlg = await screen.findByRole('alertdialog');
      fireEvent.click(within(dlg).getByRole('button', { name: answer }));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(trigger));
    });
  }

  it('觸發的元素已經不在頁面上時不出錯', async () => {
    render(
      <UiProvider>
        <ConfirmFocusProbe removeTrigger />
      </UiProvider>,
    );
    const trigger = screen.getByRole('button', { name: '全部刪除' });
    trigger.focus();
    fireEvent.click(trigger);
    const dlg = await screen.findByRole('alertdialog');
    fireEvent.click(within(dlg).getByRole('button', { name: '確定' }));
    expect(await screen.findByText('按鈕已移除')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
});
