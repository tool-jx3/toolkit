// @vitest-environment jsdom
/**
 * G1 共用層的元件：IssueList、ThumbChoice、TemplateGallery（停留時播放）、AdvancedToggle、TextOutputPanel、
 * ColorPairList、FontPoolList、PathPad、AudioPlayer、ExportPanel（鎖定 FPS、色數、用途上限與自動縮小、多檔結果）。
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Point } from '@/core/path';
import {
  AdvancedToggle,
  AudioPlayer,
  animationFormats,
  type ColorPairItem,
  ColorPairList,
  type ExportOutput,
  ExportPanel,
  type ExportSettings,
  Field,
  type FontPoolItem,
  FontPoolList,
  IssueList,
  PathPad,
  TemplateGallery,
  TextOutputPanel,
  ThumbChoice,
  UiProvider,
  useAdvancedMode,
} from '@/ui';

const out = (bytes: number, name = 'a.png'): ExportOutput => ({
  blob: new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
  fileName: name,
  width: 10,
  height: 10,
});

describe('IssueList', () => {
  it('錯誤排最前面、各級有標示；上方的訊息；沒有問題時的文字', () => {
    const { rerender } = render(
      <IssueList
        items={[
          { level: 'info', message: '資訊一' },
          { level: 'error', message: '錯誤一' },
          { level: 'warning', message: '警告一' },
        ]}
        notice={{ tone: 'error', message: '匯出失敗' }}
      />,
    );
    const items = within(screen.getByRole('status', { name: '檢查結果' })).getAllByRole('listitem');
    expect(items.map((li) => li.dataset.level)).toEqual(['error', 'warning', 'info']);
    expect(items[0]).toHaveTextContent('錯誤：錯誤一');
    expect(screen.getByRole('alert')).toHaveTextContent('匯出失敗');
    rerender(<IssueList items={[]} empty="沒有問題。" />);
    expect(screen.getByText('沒有問題。')).toBeInTheDocument();
  });
});

describe('ThumbChoice', () => {
  it('radiogroup：點選、方向鍵；停留或聚焦的那一個標成播放中', async () => {
    const user = userEvent.setup();
    const draw = vi.fn();
    function Demo() {
      const [v, setV] = useState<'a' | 'b' | 'c'>('a');
      return (
        <Field label="樣式">
          <ThumbChoice
            value={v}
            onValueChange={setV}
            options={[
              { value: 'a', label: '甲' },
              { value: 'b', label: '乙' },
              { value: 'c', label: '丙' },
            ]}
            draw={draw}
          />
        </Field>
      );
    }
    render(<Demo />);
    expect(screen.getByRole('radiogroup', { name: '樣式' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '甲' })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('radio', { name: '乙' }));
    expect(screen.getByRole('radio', { name: '乙' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '乙' })).toHaveAttribute('data-playing');
    /* Radix：方向鍵按著時焦點（非同步）移過去才選取，所以先按住再放開 */
    await user.keyboard('{ArrowRight>}');
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: '丙' })).toHaveAttribute('aria-checked', 'true'),
    );
    await user.keyboard('{/ArrowRight}');
    expect(screen.getByRole('radio', { name: '丙' })).toHaveAttribute('data-playing');
    expect(screen.getByRole('radio', { name: '甲' })).not.toHaveAttribute('data-playing');
  });
});

describe('TemplateGallery', () => {
  it('縮圖是函式時，停留或聚焦的卡片 playing＝true', async () => {
    const user = userEvent.setup();
    render(
      <UiProvider>
        <TemplateGallery
          confirm={false}
          onApply={() => {}}
          templates={['一', '二'].map((n) => ({
            id: n,
            name: n,
            data: n,
            thumbnail: ({ playing }: { playing: boolean }) => (
              <span data-testid={`thumb-${n}`}>{playing ? '播放' : '靜止'}</span>
            ),
          }))}
        />
      </UiProvider>,
    );
    expect(screen.getByTestId('thumb-一')).toHaveTextContent('靜止');
    await user.hover(screen.getByRole('button', { name: /一/ }));
    expect(screen.getByTestId('thumb-一')).toHaveTextContent('播放');
    expect(screen.getByTestId('thumb-二')).toHaveTextContent('靜止');
    await user.unhover(screen.getByRole('button', { name: /一/ }));
    expect(screen.getByTestId('thumb-一')).toHaveTextContent('靜止');
  });
});

describe('AdvancedToggle', () => {
  it('記在瀏覽器裡，同一工具的其他地方同步', async () => {
    const user = userEvent.setup();
    localStorage.removeItem('trpg-toolkit:demo-tool:advanced');
    function Reader() {
      const [on] = useAdvancedMode('demo-tool');
      return <span data-testid="adv">{on ? '開' : '關'}</span>;
    }
    render(
      <>
        <AdvancedToggle toolId="demo-tool" />
        <Reader />
      </>,
    );
    expect(screen.getByTestId('adv')).toHaveTextContent('關');
    await user.click(screen.getByRole('switch', { name: '顯示進階設定' }));
    expect(screen.getByTestId('adv')).toHaveTextContent('開');
    expect(localStorage.getItem('trpg-toolkit:demo-tool:advanced')).toBe('1');
  });
});

describe('TextOutputPanel', () => {
  it('複製原封不動、字數、不折行；空白時提示沒有內容', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const text = '　甲 \n乙';
    const { rerender } = render(
      <UiProvider>
        <TextOutputPanel
          text={text}
          title="結果"
          font="mono"
          wrap="off"
          count={(t) => `${Array.from(t).length} 字`}
        />
      </UiProvider>,
    );
    const area = screen.getByRole('textbox', { name: '結果' });
    expect(area).toHaveValue(text);
    expect(area).toHaveAttribute('wrap', 'off');
    expect(screen.getByTestId('text-output-count')).toHaveTextContent('5 字');
    await user.click(screen.getByRole('button', { name: '複製' }));
    expect(writeText).toHaveBeenCalledWith(text);
    expect(await screen.findByText('已複製到剪貼簿')).toBeInTheDocument();
    rerender(
      <UiProvider>
        <TextOutputPanel text="" title="結果" />
      </UiProvider>,
    );
    await user.click(screen.getByRole('button', { name: '複製' }));
    expect(await screen.findByText('還沒有內容可以複製')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledTimes(1);
  });
});

describe('ColorPairList', () => {
  it('勾選、新增（預設勾選）、只有自訂的能刪', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    function Demo() {
      const [items, setItems] = useState<ColorPairItem[]>([
        { id: 'a', name: '白底黑字', a: '#ffffff', b: '#000000', enabled: true },
      ]);
      return (
        <UiProvider>
          <ColorPairList
            aria-label="配色"
            items={items}
            onChange={(next) => {
              onChange(next);
              setItems(next);
            }}
          />
        </UiProvider>
      );
    }
    render(<Demo />);
    await user.click(screen.getByRole('checkbox', { name: /白底黑字/ }));
    expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ enabled: false })]);
    expect(screen.queryByRole('button', { name: /刪除配色/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: '新增配色' }));
    expect(onChange.mock.lastCall?.[0][1]).toMatchObject({
      name: '自訂',
      enabled: true,
      custom: true,
    });
    expect(screen.getByText('已勾選 1／2 組')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '刪除配色「自訂」' }));
    expect(onChange.mock.lastCall?.[0]).toHaveLength(1);
  });
});

describe('FontPoolList', () => {
  it('勾選與移除；加入已存在的字型時不重複', async () => {
    const user = userEvent.setup();
    const onDuplicate = vi.fn();
    function Demo() {
      const [items, setItems] = useState<FontPoolItem[]>([
        {
          id: 'a',
          font: { source: 'google', family: 'Noto Sans TC', weight: 400 },
          enabled: false,
        },
        {
          id: 'b',
          font: { source: 'google', family: 'Jua', weight: 400 },
          enabled: true,
          custom: true,
        },
      ]);
      return (
        <UiProvider>
          <FontPoolList
            aria-label="字型池"
            items={items}
            onChange={setItems}
            onDuplicate={onDuplicate}
          />
        </UiProvider>
      );
    }
    render(<Demo />);
    expect(screen.getByText('已勾選 1／2 套')).toBeInTheDocument();
    /* 預設的 Noto Sans TC 400 已經在清單裡：不重複加入，改成勾選 */
    await user.click(screen.getByRole('button', { name: '加入字型' }));
    expect(onDuplicate).toHaveBeenCalled();
    expect(screen.getByText('已勾選 2／2 套')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '移除字型「Jua」' }));
    expect(screen.getByText('已勾選 1／1 套')).toBeInTheDocument();
  });
});

describe('PathPad', () => {
  it('一筆畫完才交出軌跡；最小點距；開始畫時通知；沒有軌跡時顯示提示', () => {
    const onChange = vi.fn();
    const onDrawStart = vi.fn();
    render(
      <PathPad
        aria-label="繪製區"
        width={600}
        height={300}
        points={[]}
        onChange={onChange}
        onDrawStart={onDrawStart}
        hint="請在這裡畫線"
      />,
    );
    expect(screen.getByText('請在這裡畫線')).toBeInTheDocument();
    const pad = screen.getByRole('img', { name: '繪製區' });
    /* 顯示成一半大小（300 × 150）：座標換算回邏輯尺寸（× 2） */
    pad.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 300, height: 150, right: 300, bottom: 150 }) as DOMRect;
    fireEvent.pointerDown(pad, { clientX: 10, clientY: 10, button: 0, pointerType: 'mouse' });
    expect(onDrawStart).toHaveBeenCalled();
    fireEvent.pointerMove(pad, { clientX: 11, clientY: 10 });
    fireEvent.pointerMove(pad, { clientX: 20, clientY: 10 });
    fireEvent.pointerMove(pad, { clientX: 30, clientY: 15 });
    fireEvent.pointerUp(pad);
    const pts = onChange.mock.lastCall?.[0] as Point[];
    /* (11, 10) 離第一點只有 2 邏輯 px 以內？換算後是 2 px → 剛好等於最小點距，加入；之後各點都遠 */
    expect(pts.map((p) => [p.x, p.y])).toEqual([
      [20, 20],
      [22, 20],
      [40, 20],
      [60, 30],
    ]);
    /* 放開之後的移動不加點、不再呼叫 */
    fireEvent.pointerMove(pad, { clientX: 50, clientY: 50 });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('AudioPlayer', () => {
  it('有音訊時顯示播放器與下載連結', () => {
    const { rerender } = render(<AudioPlayer blob={null} fileName="音效.wav" />);
    expect(screen.queryByRole('link')).toBeNull();
    rerender(<AudioPlayer blob={new Blob(['x'], { type: 'audio/wav' })} fileName="音效.wav" />);
    expect(screen.getByRole('link', { name: '下載 WAV' })).toHaveAttribute('download', '音效.wav');
    expect(document.querySelector('audio')).toHaveAttribute('aria-label', '試聽');
  });
});

describe('ExportPanel（G1 擴充）', () => {
  it('鎖定 FPS：不顯示 FPS 選單，onExport 收到內容的 FPS（GIF 也不夾到 50）', async () => {
    const user = userEvent.setup();
    const onExport = vi.fn(async (_s: ExportSettings) => out(10));
    render(
      <UiProvider>
        <ExportPanel
          formats={animationFormats(['apng', 'gif'])}
          fixedFps={60}
          onExport={onExport}
        />
      </UiProvider>,
    );
    expect(screen.queryByRole('combobox', { name: 'FPS' })).toBeNull();
    expect(screen.getByTestId('export-fixed-fps')).toHaveTextContent('60 fps');
    await user.click(screen.getByRole('radio', { name: 'GIF' }));
    await user.click(screen.getByRole('button', { name: '匯出 GIF' }));
    expect(onExport.mock.calls[0][0]).toMatchObject({ format: 'gif', fps: 60 });
  });

  it('色數選單取代減色開關（APNG、PNG）', async () => {
    const user = userEvent.setup();
    const onExport = vi.fn(async (_s: ExportSettings) => out(10));
    render(
      <UiProvider>
        <ExportPanel
          formats={animationFormats(['apng', 'gif', 'png'])}
          colorOptions={[0, 256, 64]}
          onExport={onExport}
        />
      </UiProvider>,
    );
    expect(screen.queryByRole('switch', { name: '減色（256 色）' })).toBeNull();
    expect(screen.getByRole('combobox', { name: '色數' })).toHaveTextContent('256 色');
    await user.click(screen.getByRole('radio', { name: 'GIF' }));
    expect(screen.queryByRole('combobox', { name: '色數' })).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'PNG' }));
    await user.click(screen.getByRole('combobox', { name: '色數' }));
    await user.click(screen.getByRole('option', { name: '無損（全彩）' }));
    await user.click(screen.getByRole('button', { name: '匯出 PNG' }));
    expect(onExport.mock.calls[0][0]).toMatchObject({ format: 'png', colors: 0 });
  });

  it('用途上限：超過時紅字；自動縮小後以新的設定重新匯出並說明降了什麼；無可再降時提示', async () => {
    const user = userEvent.setup();
    function Demo() {
      const [frames, setFrames] = useState(30);
      return (
        <UiProvider>
          <ExportPanel
            formats={animationFormats(['apng'])}
            limit={{ bytes: 1000, label: '上限' }}
            autoShrink={() => {
              if (frames <= 10) return null;
              setFrames(frames - 10);
              return `影格數 ${frames} → ${frames - 10} 格`;
            }}
            onExport={async () => out(frames * 120, `f${frames}.png`)}
          />
        </UiProvider>
      );
    }
    render(<Demo />);
    await user.click(screen.getByRole('button', { name: '匯出 APNG' }));
    const limit = await screen.findByTestId('export-limit');
    expect(limit).toHaveTextContent('3.5 KB／1000 B（360%）・超過上限');
    expect(limit).toHaveAttribute('data-over');
    await user.click(screen.getByRole('button', { name: '自動縮小檔案' }));
    expect(await screen.findByText('f20.png')).toBeInTheDocument();
    expect(screen.getByTestId('export-shrink-note')).toHaveTextContent('已降低：影格數 30 → 20 格');
    await user.click(screen.getByRole('button', { name: '自動縮小檔案' }));
    expect(await screen.findByText('f10.png')).toBeInTheDocument();
    expect(screen.getByTestId('export-limit')).toHaveAttribute('data-over');
    await user.click(screen.getByRole('button', { name: '自動縮小檔案' }));
    expect(screen.getByTestId('export-shrink-note')).toHaveTextContent('已無可再降的項目。');
    expect(screen.getByText('f10.png')).toBeInTheDocument();
  });

  it('多檔結果：每個檔案一張卡、全部下載、打包成 ZIP', async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    render(
      <UiProvider>
        <ExportPanel
          formats={animationFormats(['apng'])}
          onResult={onResult}
          onExport={async () => ({
            files: [out(10, '1_片頭.png'), out(20, '2_片尾.png')],
            zipName: '片尾名單',
            details: [{ label: '分段', value: '2 段' }],
          })}
        />
      </UiProvider>,
    );
    await user.click(screen.getByRole('button', { name: '匯出 APNG' }));
    const batch = await screen.findByTestId('export-batch');
    expect(within(batch).getByText('共 2 個檔案')).toBeInTheDocument();
    expect(within(batch).getAllByTestId('export-result')).toHaveLength(2);
    expect(within(batch).getAllByRole('link', { name: '下載' })[1]).toHaveAttribute(
      'download',
      '2_片尾.png',
    );
    expect(within(batch).getByText('2 段')).toBeInTheDocument();
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ zipName: '片尾名單' }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await act(async () => {
      await user.click(within(batch).getByRole('button', { name: '打包成 ZIP' }));
    });
    expect(click).toHaveBeenCalled();
  });
});
