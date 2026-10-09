// @vitest-environment jsdom
/**
 * ProjectMenu 的選項：完整存檔檔名、開啟前不確認、結果改用 onNotify（工具寫進自己的狀態列）、重設的文字。
 * 不給這些選項時維持原本的行為（日期檔名、確認、toast）。
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { serializeProject } from '@/core/storage';
import { ProjectMenu, type ProjectNotice, UiProvider } from '@/ui';

const files = vi.hoisted(() => ({
  downloadText: vi.fn(),
  pickFiles: vi.fn<(options?: { accept?: string }) => Promise<File[]>>(async () => []),
}));

vi.mock('@/core/files', async (orig) => ({
  ...(await orig<typeof import('@/core/files')>()),
  downloadText: files.downloadText,
  pickFiles: files.pickFiles,
}));

afterEach(() => {
  files.downloadText.mockReset();
  files.pickFiles.mockReset();
});

const file = (name: string, text: string) => new File([text], name, { type: 'application/json' });

async function openMenu() {
  await userEvent.click(screen.getByRole('button', { name: '專案' }));
}

describe('ProjectMenu', () => {
  it('預設：日期檔名、開啟前確認、用 toast 通知', async () => {
    const onLoad = vi.fn();
    render(
      <UiProvider>
        <ProjectMenu toolId="demo" getData={() => ({ a: 1 })} onLoad={onLoad} onReset={() => {}} />
      </UiProvider>,
    );
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: /存成專案檔/ }));
    expect(files.downloadText.mock.calls[0][1]).toMatch(/^demo_\d{8}\.json$/);
    files.pickFiles.mockResolvedValueOnce([file('x.json', serializeProject('demo', 1, { a: 2 }))]);
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: /開啟專案檔/ }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('x.json');
  });

  it('saveFileName、confirmOpen={false}、onNotify、resetText', async () => {
    const notices: ProjectNotice[] = [];
    const onLoad = vi.fn();
    const onReset = vi.fn();
    render(
      <UiProvider>
        <ProjectMenu
          toolId="demo"
          getData={() => ({ a: 1 })}
          onLoad={onLoad}
          onReset={onReset}
          saveFileName={() => 'my.demo.json'}
          confirmOpen={false}
          onNotify={(n) => notices.push(n)}
          resetText={{ label: '全部重來…', title: '全部重來？', description: '會清空復原紀錄。' }}
        />
      </UiProvider>,
    );
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: /存成專案檔/ }));
    expect(files.downloadText.mock.calls[0][1]).toBe('my.demo.json');
    expect(notices.at(-1)).toEqual({ kind: 'saved', tone: 'success', fileName: 'my.demo.json' });

    files.pickFiles.mockResolvedValueOnce([file('ok.json', serializeProject('demo', 1, { a: 2 }))]);
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: /開啟專案檔/ }));
    await waitFor(() =>
      expect(onLoad).toHaveBeenCalledWith(
        { a: 2 },
        expect.anything(),
        expect.anything(),
        expect.anything(),
      ),
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(notices.at(-1)).toEqual({ kind: 'opened', tone: 'success', fileName: 'ok.json' });

    files.pickFiles.mockResolvedValueOnce([file('bad.json', '{ nope')]);
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: /開啟專案檔/ }));
    await waitFor(() => expect(notices.at(-1)?.kind).toBe('open-failed'));
    expect(notices.at(-1)?.message).toContain('JSON');

    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: '全部重來…' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('會清空復原紀錄。');
    await userEvent.click(screen.getByRole('button', { name: '重設' }));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(notices.at(-1)).toEqual({ kind: 'reset', tone: 'info' });
  });

  it('resetDisabled 停用重設項目、statusText 取代自動存檔文字（height-board 新增）', async () => {
    const onReset = vi.fn();
    const { rerender } = render(
      <UiProvider>
        <ProjectMenu
          toolId="demo"
          getData={() => ({})}
          onLoad={() => {}}
          onReset={onReset}
          savedAt={Date.now()}
          resetDisabled
          resetText={{ label: '全部刪除…' }}
          statusText="自動儲存無法使用"
        />
      </UiProvider>,
    );
    expect(screen.getByText('自動儲存無法使用')).toBeTruthy();
    await openMenu();
    const item = screen.getByRole('menuitem', { name: '全部刪除…' });
    expect(item.getAttribute('aria-disabled')).toBe('true');
    await userEvent.click(item);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onReset).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    rerender(
      <UiProvider>
        <ProjectMenu toolId="demo" getData={() => ({})} onLoad={() => {}} onReset={onReset} />
      </UiProvider>,
    );
    expect(screen.getByText('設定會自動儲存')).toBeTruthy();
    await openMenu();
    expect(
      screen.getByRole('menuitem', { name: '重設…' }).getAttribute('aria-disabled'),
    ).toBeNull();
  });

  it('openDisabled 停用「開啟專案檔…」：不開選檔視窗；不給時照常（music-frame 新增）', async () => {
    const onLoad = vi.fn();
    const { rerender } = render(
      <UiProvider>
        <ProjectMenu
          toolId="demo"
          getData={() => ({})}
          onLoad={onLoad}
          onReset={() => {}}
          openDisabled
        />
      </UiProvider>,
    );
    await openMenu();
    const item = screen.getByRole('menuitem', { name: /開啟專案檔/ });
    expect(item.getAttribute('aria-disabled')).toBe('true');
    expect(
      screen.getByRole('menuitem', { name: /存成專案檔/ }).getAttribute('aria-disabled'),
    ).toBeNull();
    await userEvent.click(item);
    expect(files.pickFiles).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    rerender(
      <UiProvider>
        <ProjectMenu toolId="demo" getData={() => ({})} onLoad={onLoad} onReset={() => {}} />
      </UiProvider>,
    );
    files.pickFiles.mockResolvedValueOnce([]);
    await openMenu();
    const enabled = screen.getByRole('menuitem', { name: /開啟專案檔/ });
    expect(enabled.getAttribute('aria-disabled')).toBeNull();
    await userEvent.click(enabled);
    expect(files.pickFiles).toHaveBeenCalledTimes(1);
  });

  it('onForeignFile：不是本工具的專案檔時先交給工具；工具處理了就不顯示錯誤（floor-plan 新增）', async () => {
    const notices: ProjectNotice[] = [];
    const onLoad = vi.fn();
    const onForeignFile = vi.fn(async (_file: File, bytes: Uint8Array) =>
      new TextDecoder().decode(bytes).includes('legacy'),
    );
    render(
      <UiProvider>
        <ProjectMenu
          toolId="demo"
          getData={() => ({})}
          onLoad={onLoad}
          onReset={() => {}}
          confirmOpen={false}
          onNotify={(n) => notices.push(n)}
          onForeignFile={onForeignFile}
          openAccept=".json,.legacy"
        />
      </UiProvider>,
    );
    /* 工具認得的檔案：交給工具，ProjectMenu 不通知、不呼叫 onLoad */
    const legacy = file('old.legacy', '{"app":"legacy","floors":[]}');
    files.pickFiles.mockResolvedValueOnce([legacy]);
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: /開啟專案檔/ }));
    await waitFor(() => expect(onForeignFile).toHaveBeenCalledTimes(1));
    expect(files.pickFiles.mock.calls[0][0]).toMatchObject({ accept: '.json,.legacy' });
    const [f, bytes, error] = onForeignFile.mock.calls[0] as unknown as [File, Uint8Array, Error];
    expect(f).toBe(legacy);
    expect(new TextDecoder().decode(bytes)).toContain('legacy');
    expect(error.message).toBe('這不是 TRPG Toolkit 的專案檔。');
    expect(onLoad).not.toHaveBeenCalled();
    expect(notices).toEqual([]);
    /* 工具也不認得：照常顯示共用的錯誤 */
    files.pickFiles.mockResolvedValueOnce([file('bad.json', '{ nope')]);
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: /開啟專案檔/ }));
    await waitFor(() => expect(notices.at(-1)?.kind).toBe('open-failed'));
    expect(onForeignFile).toHaveBeenCalledTimes(2);
    expect(notices.at(-1)?.message).toBe('這不是有效的專案檔（JSON 格式錯誤）。');
    /* 本工具的專案檔：不經過 onForeignFile */
    files.pickFiles.mockResolvedValueOnce([file('ok.json', serializeProject('demo', 1, { a: 2 }))]);
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: /開啟專案檔/ }));
    await waitFor(() => expect(onLoad).toHaveBeenCalledTimes(1));
    expect(onForeignFile).toHaveBeenCalledTimes(2);
    expect(notices.at(-1)).toEqual({ kind: 'opened', tone: 'success', fileName: 'ok.json' });
  });

  it('onForeignFile 丟出的錯誤照原文顯示；不給 onForeignFile 時別的工具的專案檔照舊是錯誤', async () => {
    const notices: ProjectNotice[] = [];
    const other = () => file('other.json', serializeProject('other', 1, {}));
    const { rerender } = render(
      <UiProvider>
        <ProjectMenu
          toolId="demo"
          getData={() => ({})}
          onLoad={() => {}}
          onReset={() => {}}
          confirmOpen={false}
          onNotify={(n) => notices.push(n)}
          onForeignFile={() => {
            throw new Error('原作的檔案壞掉了。');
          }}
        />
      </UiProvider>,
    );
    files.pickFiles.mockResolvedValueOnce([other()]);
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: /開啟專案檔/ }));
    await waitFor(() => expect(notices.at(-1)?.kind).toBe('open-failed'));
    expect(notices.at(-1)?.message).toBe('原作的檔案壞掉了。');
    rerender(
      <UiProvider>
        <ProjectMenu
          toolId="demo"
          getData={() => ({})}
          onLoad={() => {}}
          onReset={() => {}}
          confirmOpen={false}
          onNotify={(n) => notices.push(n)}
        />
      </UiProvider>,
    );
    files.pickFiles.mockResolvedValueOnce([other()]);
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: /開啟專案檔/ }));
    await waitFor(() => expect(notices).toHaveLength(2));
    expect(notices[1].message).toBe('這是其他工具（other）的專案檔，無法在這裡開啟。');
    expect(files.pickFiles.mock.calls[1][0]).toMatchObject({ accept: '.json,application/json' });
  });

  it('onLoad 丟出的錯誤照原文顯示（不是「專案檔的內容無法使用」）', async () => {
    const notices: ProjectNotice[] = [];
    render(
      <UiProvider>
        <ProjectMenu
          toolId="demo"
          getData={() => ({})}
          onLoad={() => {
            throw new Error('匯出中，請等匯出完成或取消後再操作。');
          }}
          onReset={() => {}}
          confirmOpen={false}
          onNotify={(n) => notices.push(n)}
        />
      </UiProvider>,
    );
    files.pickFiles.mockResolvedValueOnce([file('ok.json', serializeProject('demo', 1, { a: 2 }))]);
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: /開啟專案檔/ }));
    await waitFor(() => expect(notices.at(-1)?.kind).toBe('open-failed'));
    expect(notices.at(-1)?.message).toBe('匯出中，請等匯出完成或取消後再操作。');
  });

  it('onLoad 回傳 warnings：和「已開啟專案檔」合成一則警告色的通知；onNotify 收到 tone warning 與 warnings（圖片資產稽核）', async () => {
    const warn = '專案檔裡的圖片存不進這個瀏覽器，重新整理之後就不見了。';
    render(
      <UiProvider>
        <ProjectMenu
          toolId="demo"
          getData={() => ({})}
          onLoad={async () => ({ warnings: [warn, null, ''] })}
          onReset={() => {}}
          confirmOpen={false}
        />
      </UiProvider>,
    );
    files.pickFiles.mockResolvedValueOnce([file('pics.json', serializeProject('demo', 1, {}))]);
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: /開啟專案檔/ }));
    const title = await screen.findByText('已開啟專案檔');
    const item = title.closest('li') as HTMLElement;
    expect(item.textContent).toContain('pics.json');
    expect(item.textContent).toContain(warn);
    expect(item.className).toContain('border-warning');
    expect(screen.getAllByText(/已開啟專案檔/)).toHaveLength(1);
  });

  it('onLoad 回傳 warnings 且給了 onNotify：opened 的通知帶 warnings；沒有提醒時照舊（不帶 warnings）', async () => {
    const notices: ProjectNotice[] = [];
    let warnings: string[] = ['圖片存不進這個瀏覽器。'];
    render(
      <UiProvider>
        <ProjectMenu
          toolId="demo"
          getData={() => ({})}
          onLoad={() => ({ warnings })}
          onReset={() => {}}
          confirmOpen={false}
          onNotify={(n) => notices.push(n)}
        />
      </UiProvider>,
    );
    files.pickFiles.mockResolvedValueOnce([file('a.json', serializeProject('demo', 1, {}))]);
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: /開啟專案檔/ }));
    await waitFor(() => expect(notices).toHaveLength(1));
    expect(notices[0]).toEqual({
      kind: 'opened',
      tone: 'warning',
      fileName: 'a.json',
      warnings: ['圖片存不進這個瀏覽器。'],
    });
    warnings = [];
    files.pickFiles.mockResolvedValueOnce([file('b.json', serializeProject('demo', 1, {}))]);
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: /開啟專案檔/ }));
    await waitFor(() => expect(notices).toHaveLength(2));
    expect(notices[1]).toStrictEqual({ kind: 'opened', tone: 'success', fileName: 'b.json' });
  });
});
