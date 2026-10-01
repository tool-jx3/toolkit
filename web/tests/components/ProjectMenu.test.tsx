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
  pickFiles: vi.fn<() => Promise<File[]>>(async () => []),
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
          statusText="自動保存無法使用"
        />
      </UiProvider>,
    );
    expect(screen.getByText('自動保存無法使用')).toBeTruthy();
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
});
