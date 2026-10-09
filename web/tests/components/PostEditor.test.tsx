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
    area().focus();
    area().setSelectionRange(2, 4);
    act(() => ref.current?.insert('★★'));
    expect(onChange).toHaveBeenLastCalledWith('AB★★EFG', 'insert');
    await waitFor(() => expect(area().selectionStart).toBe(4));
    expect(area().selectionEnd).toBe(4);
    expect(document.activeElement).toBe(area());
  });

  it('欄位沒有焦點時：值沒變用最後的選取位置；值被程式換掉後插在最後面（session-report F29）', async () => {
    const onChange = vi.fn();
    const ref = createRef<PostEditorHandle>();
    function Outer() {
      const [v, setV] = useState('ABCDEF');
      return (
        <UiProvider>
          <PostEditor
            ref={ref}
            value={v}
            onChange={(next, r) => {
              onChange(next, r);
              setV(next);
            }}
          />
          <button type="button" onClick={() => setV('重新產生的團報')}>
            重新產生
          </button>
        </UiProvider>
      );
    }
    render(<Outer />);
    /* 選取 2～4 後焦點移到別處：插入照最後的選取位置 */
    area().focus();
    area().setSelectionRange(2, 4);
    fireEvent.select(area());
    screen.getByRole('button', { name: '重新產生' }).focus();
    fireEvent.blur(area());
    act(() => ref.current?.insert('★'));
    expect(onChange).toHaveBeenLastCalledWith('AB★EF', 'insert');
    await waitFor(() => expect(document.activeElement).toBe(area()));
    /* 焦點移走、值被換掉（瀏覽器這時可能回報選取位置 0）：插在最後面 */
    act(() => screen.getByRole('button', { name: '重新產生' }).focus());
    fireEvent.blur(area());
    fireEvent.click(screen.getByRole('button', { name: '重新產生' }));
    area().setSelectionRange(0, 0);
    act(() => ref.current?.insert('★'));
    expect(onChange).toHaveBeenLastCalledWith('重新產生的團報★', 'insert');
  });

  it('insert({ ownLine })：自成一行；wrap：用括號包住選取的文字、沒有選取時游標在括號中間', async () => {
    const onChange = vi.fn();
    const ref = createRef<PostEditorHandle>();
    render(<Harness initial="甲乙丙" editorRef={ref} onChange={onChange} />);
    area().focus();
    area().setSelectionRange(1, 1);
    act(() => ref.current?.insert('━━', { ownLine: true }));
    expect(onChange).toHaveBeenLastCalledWith('甲\n━━\n乙丙', 'insert');
    await waitFor(() => expect(area().selectionStart).toBe(5));
    /* 選取「乙丙」後包住：選取範圍仍在「乙丙」上 */
    area().setSelectionRange(5, 7);
    act(() => ref.current?.wrap('「', '」'));
    expect(onChange).toHaveBeenLastCalledWith('甲\n━━\n「乙丙」', 'insert');
    await waitFor(() => expect([area().selectionStart, area().selectionEnd]).toEqual([6, 8]));
    /* 沒有選取：插入一對括號，游標在中間 */
    area().setSelectionRange(0, 0);
    act(() => ref.current?.wrap('【', '】'));
    expect(onChange).toHaveBeenLastCalledWith('【】甲\n━━\n「乙丙」', 'insert');
    await waitFor(() => expect([area().selectionStart, area().selectionEnd]).toEqual([1, 1]));
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
