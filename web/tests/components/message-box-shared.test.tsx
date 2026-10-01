// @vitest-environment jsdom
/**
 * 訊息框產生器補進共用層的部分：ProjectMenu 的完整檔名／存檔與開檔通知／重設文字、
 * MessageComposer 的 requireCommand、GestureScope（按下到放開算一步復原）。
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { downloadText, pickFiles } from '@/core/files';
import { createToolStore, historyGesture, serializeProject } from '@/core/storage';
import { GestureScope, MessageComposer, ProjectMenu, UiProvider } from '@/ui';

vi.mock('@/core/files', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/core/files')>();
  return { ...orig, downloadText: vi.fn(), pickFiles: vi.fn() };
});

describe('ProjectMenu（訊息框產生器補的選項）', () => {
  function setup(extra: Partial<Parameters<typeof ProjectMenu>[0]> = {}) {
    const onLoad = vi.fn();
    const onReset = vi.fn();
    const onSaved = vi.fn();
    const onLoadError = vi.fn();
    render(
      <UiProvider>
        <ProjectMenu
          toolId="message-box"
          getData={() => ({ a: 1 })}
          onLoad={onLoad}
          onReset={onReset}
          onSaved={onSaved}
          onLoadError={onLoadError}
          exactFileName="直播.messagebox.json"
          resetLabel="全部重來…"
          resetConfirm={{ title: '全部重來？', confirmLabel: '全部重來' }}
          {...extra}
        />
      </UiProvider>,
    );
    return { onLoad, onReset, onSaved, onLoadError };
  }

  const openMenu = async (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole('button', { name: /專案/ }));

  it('完整檔名（不加日期）＋存好後通知', async () => {
    const user = userEvent.setup();
    const { onSaved } = setup();
    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: /存成專案檔/ }));
    expect(vi.mocked(downloadText).mock.calls.at(-1)?.[1]).toBe('直播.messagebox.json');
    expect(onSaved).toHaveBeenCalledWith('直播.messagebox.json');
  });

  it('開啟：onLoad 拿到選的檔案；不是本工具的檔案時 onLoadError', async () => {
    const user = userEvent.setup();
    const { onLoad, onLoadError } = setup();
    const good = new File([serializeProject('message-box', 1, { a: 2 })], '舊的.json', {
      type: 'application/json',
    });
    vi.mocked(pickFiles).mockResolvedValueOnce([good]);
    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: /開啟專案檔/ }));
    await user.click(await screen.findByRole('button', { name: '開啟' }));
    await waitFor(() => expect(onLoad).toHaveBeenCalled());
    expect(onLoad.mock.calls[0][0]).toEqual({ a: 2 });
    expect(onLoad.mock.calls[0][2]).toBe(good);

    const other = new File([serializeProject('status-bar', 1, {})], 'x.json');
    vi.mocked(pickFiles).mockResolvedValueOnce([other]);
    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: /開啟專案檔/ }));
    await waitFor(() => expect(onLoadError).toHaveBeenCalled());
    expect(onLoadError.mock.calls[0][0]).toContain('其他工具');

    vi.mocked(pickFiles).mockResolvedValueOnce([new File(['{oops'], 'bad.json')]);
    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: /開啟專案檔/ }));
    await waitFor(() => expect(onLoadError).toHaveBeenCalledTimes(2));
    expect(onLoadError.mock.calls[1][0]).toContain('JSON');
  });

  it('重設的選單文字與確認對話框可以換', async () => {
    const user = userEvent.setup();
    const { onReset } = setup();
    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: '全部重來…' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('全部重來？');
    await user.click(screen.getByRole('button', { name: '全部重來' }));
    await waitFor(() => expect(onReset).toHaveBeenCalledTimes(1));
  });
});

describe('MessageComposer requireCommand', () => {
  function C({ onSend }: { onSend: (m: unknown) => void }) {
    const [kind, setKind] = useState('dice');
    return (
      <MessageComposer
        speakers={[{ value: 'a', label: '伊凡' }]}
        speaker="a"
        onSpeakerChange={() => {}}
        kinds={[
          { value: 'chat', label: '聊天' },
          { value: 'dice', label: '骰子', needsResult: true },
        ]}
        kind={kind}
        onKindChange={setKind}
        onSend={onSend}
        requireCommand
      />
    );
  }

  it('骰子時「|」前面空白 → 錯誤；聊天不受影響', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<C onSend={onSend} />);
    const input = screen.getByRole('textbox', { name: '測試訊息' });
    await user.type(input, '| ＞ 成功{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('請在「|」前面輸入內文');
    expect(onSend).not.toHaveBeenCalled();
    await user.clear(input);
    await user.type(input, '聆聽 | ＞ 成功{Enter}');
    expect(onSend).toHaveBeenCalledWith({
      speaker: 'a',
      kind: 'dice',
      command: '聆聽',
      result: '＞ 成功',
    });
  });
});

describe('GestureScope', () => {
  it('按下到放開之間的變更合成一步復原', async () => {
    const store = createToolStore(
      'gesture-scope-test',
      { v: 0 },
      { persist: false, coalesceMs: 0 },
    );
    const g = historyGesture(store);
    render(
      <GestureScope gesture={g}>
        <button type="button">色盤</button>
      </GestureScope>,
    );
    const btn = screen.getByRole('button', { name: '色盤' });
    fireEvent.pointerDown(btn);
    act(() => {
      for (let i = 1; i <= 5; i++) store.getState().patch({ v: i });
    });
    expect(store.temporal.getState().pastStates).toHaveLength(0);
    fireEvent.pointerUp(window);
    await waitFor(() => expect(store.temporal.getState().pastStates).toHaveLength(1));
    expect(store.getState().data.v).toBe(5);
    /* 放開之後的變更是新的一步 */
    act(() => store.getState().patch({ v: 6 }));
    expect(store.temporal.getState().pastStates).toHaveLength(2);
    store.temporal.getState().undo();
    store.temporal.getState().undo();
    expect(store.getState().data.v).toBe(0);
  });
});
