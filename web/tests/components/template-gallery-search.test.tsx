// @vitest-environment jsdom
/** TemplateGallery 的搜尋欄（floor-plan 2026-10 第三批新增的選填 `search`；不給時行為不變） */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { TemplateGallery, type TemplateItem, type TemplateSearch, UiProvider } from '@/ui';

const templates: TemplateItem<string>[] = [
  { id: 'a', name: '洋館', tags: ['住宅'], data: '地下 古風' },
  { id: 'b', name: '套房', tags: ['住宅'], data: '現代' },
  { id: 'c', name: '洞窟', tags: ['野外'], data: '地下 荒野' },
];

const search: TemplateSearch<string> = {
  label: '搜尋範本',
  placeholder: '名稱或 #標籤',
  match: (t, q) =>
    q
      .split(/\s+/)
      .every((w) => (w.startsWith('#') ? t.data.includes(w.slice(1)) : t.name.includes(w))),
  suggest: (q) => (q.endsWith('#') ? [{ label: '#地下', value: `${q}地下 ` }] : []),
  suggestLabel: '標籤',
};

const names = () =>
  screen
    .getAllByRole('listitem')
    .map((li) => li.textContent ?? '')
    .filter(Boolean);

describe('TemplateGallery 的搜尋欄', () => {
  it('沒有 search 時沒有搜尋欄（行為不變）', () => {
    render(
      <UiProvider>
        <TemplateGallery confirm={false} onApply={() => {}} templates={templates} />
      </UiProvider>,
    );
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('搜尋與分類同時套用；分類按鈕照全部範本算；沒有結果時寫 empty；建議按一下換掉搜尋字串', async () => {
    const user = userEvent.setup();
    render(
      <UiProvider>
        <TemplateGallery confirm={false} onApply={() => {}} templates={templates} search={search} />
      </UiProvider>,
    );
    const box = screen.getByRole('searchbox', { name: '搜尋範本' });
    expect(box).toHaveAttribute('placeholder', '名稱或 #標籤');
    await user.type(box, '#地下');
    expect(names()).toEqual(['洋館', '洞窟']);
    /* 分類按鈕不因為搜尋而消失 */
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual([
      '全部',
      '住宅',
      '野外',
    ]);
    await user.click(screen.getByRole('radio', { name: '住宅' }));
    expect(names()).toEqual(['洋館']);
    await user.clear(box);
    await user.type(box, 'zzz');
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByText('找不到符合的範本。')).toBeInTheDocument();
    await user.clear(box);
    await user.type(box, '#');
    await user.click(screen.getByRole('button', { name: '#地下' }));
    expect(box).toHaveValue('#地下 ');
    expect(box).toHaveFocus();
    expect(names()).toEqual(['洋館']);
  });
});
