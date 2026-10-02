// @vitest-environment jsdom
/**
 * PostEditor（貼文編輯欄）：字數與上限、打字、在游標位置插入、複製、貼到 X、帳號列與工具列。
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PostEditor, type PostEditorHandle, UiProvider } from '@/ui';

function Harness({
  initial = '',
  editorRef,
  onChange,
}: {
  initial?: string;
  editorRef?: React.Ref<PostEditorHandle>;
  onChange?: (v: string, reason: 'input' | 'insert') => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <UiProvider>
      <PostEditor
        ref={editorRef}
        value={value}
        onChange={(v, r) => {
          onChange?.(v, r);
          setValue(v);
        }}
        toolbar={<button type="button">工具列按鈕</button>}
        actions={<button type="button">其他動作</button>}
        hint="簡易計算"
      />
    </UiProvider>
  );
}

const area = () => screen.getByRole('textbox', { name: '貼文內容' }) as HTMLTextAreaElement;

describe('PostEditor', () => {
  it('字數：X 的簡易計算、上限 280；超過時「超過 N 字」並標 data-over', () => {
    render(<Harness initial="團報 abc" />);
    expect(screen.getByTestId('post-count')).toHaveTextContent('8 / 280');
    expect(screen.getByTestId('post-limit')).toHaveTextContent('在上限內');
    fireEvent.change(area(), { target: { value: '團'.repeat(141) } });
    expect(screen.getByTestId('post-count')).toHaveTextContent('282 / 280');
    expect(screen.getByTestId('post-limit')).toHaveTextContent('超過 2 字');
    expect(screen.getByTestId('post-count')).toHaveAttribute('data-over', 'true');
    /* 帳號列、工具列、其他動作、說明都在卡片裡；文字欄以說明與字數描述 */
    expect(screen.getByText('你的帳號')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '工具列按鈕' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '其他動作' })).toBeInTheDocument();
    expect(area().getAttribute('aria-describedby')).toContain(screen.getByTestId('post-count').id);
  });

  it('打字回報 input；insert 在游標位置插入（取代選取的部分），之後游標在插入的文字後面', async () => {
    const onChange = vi.fn();
    const ref = createRef<PostEditorHandle>();
    render(<Harness initial="ABCDEF" editorRef={ref} onChange={onChange} />);
    fireEvent.change(area(), { target: { value: 'ABCDEFG' } });
    expect(onChange).toHaveBeenLastCalledWith('ABCDEFG', 'input');
    area().setSelectionRange(2, 4);
    act(() => ref.current?.insert('★★'));
    expect(onChange).toHaveBeenLastCalledWith('AB★★EFG', 'insert');
    await waitFor(() => expect(area().selectionStart).toBe(4));
    expect(area().selectionEnd).toBe(4);
    expect(document.activeElement).toBe(area());
  });

  it('focus({ atEnd })：游標放在最後', () => {
    const ref = createRef<PostEditorHandle>();
    render(<Harness initial="ABC" editorRef={ref} />);
    act(() => ref.current?.focus({ atEnd: true }));
    expect(document.activeElement).toBe(area());
    expect(area().selectionStart).toBe(3);
  });

  it('複製：原封不動（不去空白）；空白時提示沒有內容', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { unmount } = render(<Harness initial={'  團報\n'} />);
    fireEvent.click(screen.getByRole('button', { name: '複製' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('  團報\n'));
    expect(await screen.findByText('已複製到剪貼簿')).toBeInTheDocument();
    unmount();
    render(<Harness initial="" />);
    fireEvent.click(screen.getByRole('button', { name: '複製' }));
    expect(await screen.findByText('還沒有內容可以複製')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it('貼到 X：去頭尾空白後開啟發文網址；空白時提示、不開分頁', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const ref = createRef<PostEditorHandle>();
    const { unmount } = render(<Harness initial={'\n 團報 #CoC \n'} editorRef={ref} />);
    fireEvent.click(screen.getByRole('button', { name: '貼到 X' }));
    expect(open).toHaveBeenCalledTimes(1);
    const [url, target, features] = open.mock.calls[0];
    expect(new URL(String(url)).searchParams.get('text')).toBe('團報 #CoC');
    expect(target).toBe('_blank');
    expect(features).toContain('noopener');
    unmount();
    render(<Harness initial="  " editorRef={ref} />);
    let opened = true;
    act(() => {
      opened = ref.current?.post() ?? true;
    });
    expect(opened).toBe(false);
    expect(open).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('沒有可以發文的內容')).toBeInTheDocument();
  });
});
