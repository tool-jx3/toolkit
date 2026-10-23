// @vitest-environment jsdom
/**
 * ShareLinkDialog：標題旁的字數和上限用同一個量法（網址 `#` 後面的字數；clue-map 對等驗證後修正）。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ShareLinkDialog, type ShareLinkStrings, UiProvider } from '@/ui';

const strings: ShareLinkStrings = {
  title: '分享連結',
  lead: '說明',
  note: '備註',
  generating: '正在產生…',
  tooLong: '太長了',
  link: '連結',
  copy: '複製連結',
  copied: '已複製',
  count: (n, max) =>
    `內容 ${n.toLocaleString('en-US')} 字（上限 ${max.toLocaleString('en-US')} 字）`,
  open: '開啟連結',
};

const BASE = 'https://example.com/next/clue-map/';

function show(url: string | null, tooLong = false, maxLength = 8000) {
  render(
    <UiProvider>
      <ShareLinkDialog
        open
        onOpenChange={() => {}}
        strings={strings}
        url={url}
        tooLong={tooLong}
        maxLength={maxLength}
      />
    </UiProvider>,
  );
}

describe('ShareLinkDialog 的字數', () => {
  it('只算 # 後面（含鍵名），不含網址前面的部分；有千分位', () => {
    const hash = `#m=${'a'.repeat(7995)}`;
    const url = BASE + hash;
    /* # 後面 7997 字沒超過上限，整個網址卻超過 8000：顯示的要是前者 */
    expect(url.length).toBeGreaterThan(8000);
    show(url);
    expect(screen.getByTestId('text-output-count').textContent).toBe(
      '內容 7,997 字（上限 8,000 字）',
    );
  });

  it('上限由呼叫端帶入；沒有 # 時算 0 字', () => {
    show(`${BASE}#c=abc`, false, 5000);
    expect(screen.getByTestId('text-output-count').textContent).toBe('內容 5 字（上限 5,000 字）');
  });

  it('沒有 # 的網址算 0 字', () => {
    show(BASE);
    expect(screen.getByTestId('text-output-count').textContent).toBe('內容 0 字（上限 8,000 字）');
  });

  it('太長時只顯示說明，不顯示連結與字數', () => {
    show(`${BASE}#m=x`, true);
    expect(screen.getByText('太長了')).toBeInTheDocument();
    expect(screen.queryByTestId('text-output-count')).toBeNull();
  });

  it('還在算（url 是 null）時顯示進度說明', () => {
    show(null);
    expect(screen.getByText('正在產生…')).toBeInTheDocument();
    expect(screen.queryByTestId('text-output-count')).toBeNull();
  });
});
