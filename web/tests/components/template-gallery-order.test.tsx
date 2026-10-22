// @vitest-environment jsdom
/**
 * TemplateGallery 的分類按鈕：`tagOrder`（順序）與 `wrapFilter`（換行）。floor-plan 2026-10 第三批後半新增的選填屬性：
 * 一個範本放在好幾個分類時，照「標籤第一次出現的順序」會亂掉；分類 13 類時要換行。不給時行為不變。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { TemplateGallery, type TemplateItem, UiProvider } from '@/ui';

/** 洋館先出現「野外」（其他分類），照第一次出現的順序「野外」會排在「公共」前面 */
const templates: TemplateItem<string>[] = [
  { id: 'a', name: '山莊', tags: ['住宅', '野外'], data: 'a' },
  { id: 'b', name: '飯店', tags: ['公共'], data: 'b' },
  { id: 'c', name: '洞窟', tags: ['野外'], data: 'c' },
  { id: 'blank', name: '空白地圖', tags: ['住宅', '公共', '野外'], data: 'blank' },
];

const radios = () => screen.getAllByRole('radio').map((r) => r.textContent);

describe('TemplateGallery 的分類順序與換行', () => {
  it('沒有 tagOrder 時照第一次出現的順序（行為不變），分類按鈕不換行', () => {
    render(
      <UiProvider>
        <TemplateGallery confirm={false} onApply={() => {}} templates={templates} />
      </UiProvider>,
    );
    expect(radios()).toEqual(['全部', '住宅', '野外', '公共']);
    expect(screen.getByLabelText('範本分類').className).not.toContain('flex-wrap');
  });

  it('tagOrder：照給的順序；沒有範本用到的分類不列，沒列到的接在後面；wrapFilter 換行', async () => {
    const user = userEvent.setup();
    render(
      <UiProvider>
        <TemplateGallery
          confirm={false}
          onApply={() => {}}
          templates={templates}
          tagOrder={['住宅', '商店', '公共']}
          wrapFilter
        />
      </UiProvider>,
    );
    expect(radios()).toEqual(['全部', '住宅', '公共', '野外']);
    expect(screen.getByLabelText('範本分類').className).toContain('flex-wrap');
    /* 一個範本放在好幾個分類：山莊在「住宅」與「野外」都看得到 */
    await user.click(screen.getByRole('radio', { name: '野外' }));
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '山莊',
      '洞窟',
      '空白地圖',
    ]);
  });
});
