// @vitest-environment jsdom
/**
 * 確認對話框（ConfirmDialog、ChoiceDialog）內容很長、視窗很矮時：標題與按鈕列不被擠出視窗，
 * 說明可以自己捲動（room-zip 讀入房間 ZIP 的確認對話框驗證後修正）。
 * jsdom 沒有版面，這裡檢查結構：對話框是限高的直向 flex，說明是可捲動的、可縮小的區塊，標題與按鈕列不縮小；
 * 實際的版面（矮視窗按鈕在視窗內）在 tests/e2e/room-zip.spec.ts 量。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChoiceDialog, ConfirmDialog } from '@/ui';

const classes = (el: HTMLElement) => el.className.split(/\s+/);
const long = Array.from({ length: 60 }, (_, i) => `第 ${i + 1} 行的說明`).join('、');

function check(content: HTMLElement, buttonName: string) {
  /* 內容：限高、直向 flex */
  expect(classes(content)).toContain('flex-col');
  expect(classes(content).some((c) => c.startsWith('max-h-'))).toBe(true);
  const description = screen.getByText(/第 1 行的說明/);
  expect(classes(description)).toEqual(expect.arrayContaining(['min-h-0', 'overflow-y-auto']));
  const title = screen.getByRole('heading', { name: '很長的確認' });
  expect(classes(title)).toContain('shrink-0');
  const buttonRow = screen.getByRole('button', { name: buttonName }).parentElement as HTMLElement;
  expect(classes(buttonRow)).toContain('shrink-0');
}

describe('確認對話框：長內容', () => {
  it('ConfirmDialog：說明可捲動、標題與按鈕列不縮小', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={() => undefined}
        onConfirm={() => undefined}
        title="很長的確認"
        description={long}
        confirmLabel="讀入"
      />,
    );
    check(screen.getByRole('alertdialog'), '讀入');
  });

  it('ChoiceDialog：同上', () => {
    render(
      <ChoiceDialog
        open
        onOpenChange={() => undefined}
        onChoose={() => undefined}
        title="很長的確認"
        description={long}
        choices={[{ value: 'a', label: '選項甲' }]}
      />,
    );
    check(screen.getByRole('alertdialog'), '選項甲');
  });
});
