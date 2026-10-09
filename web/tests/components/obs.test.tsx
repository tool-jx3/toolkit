// @vitest-environment jsdom
/**
 * G4（OBS 疊加）共用元件：CSS 匯出、網址欄、步驟列、錨點、項目清單、測試訊息、測試數值、字型（css 模式）、
 * 電腦字型清單、條件顯示、裁切（數值範圍＋兩段式確認）。
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearLocalFontCache, type FontValue } from '@/core/fonts';
import {
  type Anchor,
  AnchorGrid,
  CROP_HOLD_TO_MOVE_MS,
  CropDialog,
  CssExportPanel,
  Field,
  FontPicker,
  ItemListEditor,
  LOCAL_FONT_SAMPLE,
  LocalFontDialog,
  MessageComposer,
  ObsGuide,
  Show,
  SourceUrlField,
  StepNav,
  Stepper,
  simulateHoverCss,
  TestValueRow,
  TestValueShortcuts,
  UiProvider,
} from '@/ui';

const CSS = '/* 測試 */\n#root { color: red !important; }\n';

function mockClipboard(ok: boolean) {
  const writeText = vi.fn(async () => {
    if (!ok) throw new Error('denied');
  });
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  document.execCommand = vi.fn(() => false);
  return writeText;
}

describe('CssExportPanel', () => {
  it('複製成功顯示訊息；行數與大小', async () => {
    const user = userEvent.setup();
    const writeText = mockClipboard(true);
    const onCopy = vi.fn();
    render(<CssExportPanel css={CSS} fileName="狀態條" onCopy={onCopy} copiedMessage="已複製！" />);
    expect(screen.getByRole('button', { name: /查看 CSS/ })).toHaveTextContent('2 行');
    await user.click(screen.getByRole('button', { name: '複製 CSS' }));
    expect(writeText).toHaveBeenCalledWith(CSS);
    expect(await screen.findByText('已複製！')).toBeInTheDocument();
    expect(onCopy).toHaveBeenCalledWith(true);
  });

  it('複製失敗：錯誤訊息、自動展開「查看 CSS」並選取全文', async () => {
    const user = userEvent.setup();
    mockClipboard(false);
    render(<CssExportPanel css={CSS} fileName="x" />);
    const toggle = screen.getByRole('button', { name: /查看 CSS/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(screen.getByRole('button', { name: '複製 CSS' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('無法自動複製');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const area = screen.getByRole('textbox', { name: '目前的 CSS（唯讀）' }) as HTMLTextAreaElement;
    expect(area.value).toBe(CSS);
    await waitFor(() => expect(document.activeElement).toBe(area));
  });

  it('儲存 .css：檔名清掉不合法的字元；沒有 CSS 時停用', async () => {
    const user = userEvent.setup();
    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push(this.download);
    });
    const { rerender } = render(<CssExportPanel css={CSS} fileName={' 狀態條:艾琳? '} />);
    await user.click(screen.getByRole('button', { name: '儲存 .css' }));
    expect(clicks).toEqual(['狀態條_艾琳_.css']);
    expect(screen.getByRole('status')).toHaveTextContent('已儲存「狀態條_艾琳_.css」');
    rerender(<CssExportPanel css="" fileName="x" disabledReason="還沒有可以匯出的內容" />);
    expect(screen.getByRole('button', { name: '複製 CSS' })).toBeDisabled();
    expect(screen.getByText('還沒有可以匯出的內容')).toBeInTheDocument();
  });
});

describe('SourceUrlField', () => {
  it('沒有網址：按鈕停用、顯示警告與動作；有網址可以複製', async () => {
    const user = userEvent.setup();
    const writeText = mockClipboard(true);
    const { rerender } = render(
      <Field label="瀏覽器來源網址">
        <SourceUrlField
          url={null}
          missingWarning="要先填房間網址"
          missingAction={<button type="button">前往房間網址</button>}
        />
      </Field>,
    );
    expect(screen.getByRole('textbox', { name: '瀏覽器來源網址' })).toHaveValue('');
    expect(screen.getByRole('button', { name: '複製網址' })).toBeDisabled();
    expect(screen.getByText('要先填房間網址')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '前往房間網址' })).toBeInTheDocument();
    rerender(
      <Field label="瀏覽器來源網址">
        <SourceUrlField url="https://ccfolia.com/rooms/abcd/chat" missingWarning="要先填房間網址" />
      </Field>,
    );
    expect(screen.queryByText('要先填房間網址')).toBeNull();
    await user.click(screen.getByRole('button', { name: '複製網址' }));
    expect(writeText).toHaveBeenCalledWith('https://ccfolia.com/rooms/abcd/chat');
    expect(await screen.findByText(/已複製網址/)).toBeInTheDocument();
  });
});

describe('Stepper／StepNav', () => {
  function Steps() {
    const [v, setV] = useState(0);
    const steps = [
      { label: '使用者', description: '登錄是誰' },
      { label: '立繪與效果', description: '外觀' },
      { label: '組合與輸出' },
    ];
    return (
      <>
        <Stepper steps={steps} value={v} onValueChange={setV} />
        <StepNav value={v} count={steps.length} onValueChange={setV} />
      </>
    );
  }

  it('目前步驟、已完成、直接點過去、上一步隱藏、下一步停用、方向鍵移動焦點', async () => {
    const user = userEvent.setup();
    render(<Steps />);
    const step = (name: RegExp) => screen.getByRole('button', { name });
    expect(step(/使用者/)).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('步驟 1／3')).toBeInTheDocument();
    expect(screen.getByText('上一步').closest('button')).toHaveClass('invisible');
    await user.click(screen.getByRole('button', { name: '下一步' }));
    expect(step(/立繪與效果/)).toHaveAttribute('aria-current', 'step');
    expect(step(/使用者/)).toHaveTextContent('（已完成）');
    await user.click(step(/組合與輸出/));
    expect(screen.getByRole('button', { name: '下一步' })).toBeDisabled();
    step(/組合與輸出/).focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(step(/使用者/));
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(step(/組合與輸出/));
  });
});

describe('AnchorGrid', () => {
  it('九格單選、方向鍵在兩個方向移動', async () => {
    const user = userEvent.setup();
    function G() {
      const [v, setV] = useState<Anchor>('bottom-left');
      return (
        <UiProvider>
          <Field label="基準位置">
            <AnchorGrid value={v} onValueChange={setV} />
          </Field>
          <output>{v}</output>
        </UiProvider>
      );
    }
    render(<G />);
    const group = screen.getByRole('radiogroup', { name: '基準位置' });
    expect(within(group).getAllByRole('radio')).toHaveLength(9);
    const bl = within(group).getByRole('radio', { name: '左下' });
    expect(bl).toHaveAttribute('aria-checked', 'true');
    bl.focus();
    await user.keyboard('{ArrowUp}');
    expect(document.querySelector('output')).toHaveTextContent('left');
    await user.keyboard('{ArrowRight}');
    expect(document.querySelector('output')).toHaveTextContent('center');
    await user.click(within(group).getByRole('radio', { name: '右上' }));
    expect(document.querySelector('output')).toHaveTextContent('top-right');
  });
});

describe('ItemListEditor', () => {
  interface Item {
    id: string;
    name: string;
  }
  function List({ onRemove }: { onRemove: (id: string) => void }) {
    const [items, setItems] = useState<Item[]>([{ id: 'a', name: '艾琳' }]);
    const [sel, setSel] = useState<string | null>('a');
    return (
      <UiProvider>
        <ItemListEditor<Item>
          aria-label="角色"
          title="角色清單"
          items={items}
          getId={(i) => i.id}
          getName={(i) => i.name}
          selectedId={sel}
          onSelect={setSel}
          onAdd={() => setItems((l) => [...l, { id: `n${l.length}`, name: '' }])}
          addLabel="新增角色"
          onRename={(id, name) => setItems((l) => l.map((i) => (i.id === id ? { ...i, name } : i)))}
          onRemove={(id) => {
            onRemove(id);
            setItems((l) => l.filter((i) => i.id !== id));
          }}
          confirmRemove={(i) => ({ title: `刪除「${i.name || '未命名'}」？` })}
        />
      </UiProvider>
    );
  }

  it('新增後游標在新項目的名稱欄；改名；刪除前確認', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<List onRemove={onRemove} />);
    expect(screen.getByRole('heading', { name: /角色清單（1）/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '新增角色' }));
    const inputs = screen.getAllByRole('textbox');
    expect(inputs).toHaveLength(2);
    expect(document.activeElement).toBe(inputs[1]);
    await user.type(inputs[1], '凱');
    expect(screen.getByRole('textbox', { name: '名稱（凱）' })).toHaveValue('凱');
    await user.click(screen.getByRole('button', { name: '刪除「凱」' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('刪除「凱」？');
    await user.click(within(dialog).getByRole('button', { name: '刪除' }));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('n1'));
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
  });
});

describe('MessageComposer', () => {
  function C({ onSend }: { onSend: (m: unknown) => void }) {
    const [speaker, setSpeaker] = useState('a');
    const [kind, setKind] = useState('dice');
    return (
      <MessageComposer
        speakers={[{ value: 'a', label: '艾琳' }]}
        speaker={speaker}
        onSpeakerChange={setSpeaker}
        kinds={[
          { value: 'chat', label: '聊天' },
          { value: 'dice', label: '骰子', needsResult: true },
        ]}
        kind={kind}
        onKindChange={setKind}
        onSend={onSend}
      />
    );
  }

  it('空白與缺結果時錯誤；輸入法選字中的 Enter 不送出；送出後清空', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<C onSend={onSend} />);
    const input = screen.getByRole('textbox', { name: '測試訊息' });
    await user.click(screen.getByRole('button', { name: '送出' }));
    expect(screen.getByRole('alert')).toHaveTextContent('請先輸入內容');
    await user.type(input, 'CC<=50');
    await user.keyboard('{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('擲骰要在「|」後面寫結果');
    await user.type(input, ' | ＞ 成功');
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith({
      speaker: 'a',
      kind: 'dice',
      command: 'CC<=50',
      result: '＞ 成功',
    });
    expect(input).toHaveValue('');
  });
});

describe('TestValueRow／TestValueShortcuts', () => {
  it('最大值欄改上限、快捷鈕', async () => {
    const user = userEvent.setup();
    const onMax = vi.fn();
    const onApply = vi.fn();
    render(
      <>
        <TestValueRow
          label="HP"
          onLabelChange={() => {}}
          value={10}
          max={12}
          onValueChange={() => {}}
          onMaxChange={onMax}
        />
        <TestValueShortcuts onApply={onApply} />
      </>,
    );
    expect(screen.getByRole('slider', { name: 'HP 目前值' })).toHaveAttribute(
      'aria-valuemax',
      '12',
    );
    const max = screen.getByRole('spinbutton', { name: 'HP 最大值' });
    await user.clear(max);
    await user.type(max, '20');
    expect(onMax).toHaveBeenLastCalledWith(20);
    for (const label of ['−3', '＋3', '減半', '危急', '歸零', '全部回復'])
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '危急' }));
    expect(onApply).toHaveBeenCalledWith('critical');
  });
});

describe('FontPicker（css 模式）', () => {
  function P({ initial, onChange }: { initial: FontValue; onChange?: (v: FontValue) => void }) {
    const [v, setV] = useState(initial);
    return (
      <UiProvider>
        <Field label="標籤字型">
          <FontPicker
            mode="css"
            value={v}
            onChange={(n) => {
              setV(n);
              onChange?.(n);
            }}
          />
        </Field>
      </UiProvider>
    );
  }

  it('字重固定 400～900；字型沒有的字重註明實際使用的字重；沒有上傳字型', async () => {
    const user = userEvent.setup();
    render(<P initial={{ source: 'google', family: 'Klee One', weight: 700 }} />);
    expect(screen.getByText('這套字型沒有 700，實際使用 600。')).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: '字重' }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      '400 標準',
      '500 中等',
      '600 半粗',
      '700 粗',
      '800 特粗',
      '900 極粗',
    ]);
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: /標籤字型/ }));
    const dialog = await screen.findByRole('dialog', { name: '選擇字型' });
    expect(within(dialog).queryByRole('tab', { name: /上傳字型/ })).toBeNull();
    expect(within(dialog).getByRole('tab', { name: /電腦字型/ })).toBeInTheDocument();
  });

  it('電腦字型：常見內建字型、手動輸入；字重保留選的值；提醒在 OBS 電腦安裝', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <P initial={{ source: 'google', family: 'Noto Sans TC', weight: 700 }} onChange={onChange} />,
    );
    await user.click(screen.getByRole('button', { name: /標籤字型/ }));
    const dialog = await screen.findByRole('dialog', { name: '選擇字型' });
    await user.click(within(dialog).getByRole('tab', { name: /電腦字型/ }));
    const group = within(dialog).getByRole('radiogroup', { name: '常見的電腦字型' });
    expect(
      within(group)
        .getAllByRole('radio')
        .map((r) => (r as HTMLInputElement).value),
    ).toEqual([
      'Microsoft JhengHei',
      'PMingLiU',
      'DFKai-SB',
      'Yu Gothic UI',
      'Meiryo',
      'Yu Mincho',
    ]);
    await user.click(within(group).getByRole('radio', { name: /微軟正黑體/ }));
    expect(onChange).toHaveBeenLastCalledWith({
      source: 'local',
      family: 'Microsoft JhengHei',
      weight: 700,
    });
    await user.type(
      within(dialog).getByRole('textbox', { name: '手動輸入電腦字型名稱' }),
      '源樣黑體',
    );
    await user.click(within(dialog).getByRole('button', { name: '套用' }));
    expect(onChange).toHaveBeenLastCalledWith({ source: 'local', family: '源樣黑體', weight: 700 });
    await user.keyboard('{Escape}');
    expect(screen.getByText('跑 OBS 的電腦也要安裝這套字型。')).toBeInTheDocument();
  });

  it('「從清單選」的預設樣張一律含「永」字與英數，不沿用欄位的 previewText（status-bar F120、chat-window F84）', async () => {
    const user = userEvent.setup();
    clearLocalFontCache();
    (window as unknown as { queryLocalFonts: () => Promise<unknown[]> }).queryLocalFonts = vi.fn(
      async () => [{ family: 'Arial', fullName: 'Arial', style: 'Regular', postscriptName: 'a' }],
    );
    try {
      render(
        <UiProvider>
          <Field label="數值字型">
            <FontPicker
              mode="css"
              previewText="HP 理智 123/456"
              value={{ source: 'local', family: 'Arial', weight: 400 }}
              onChange={() => {}}
            />
          </Field>
        </UiProvider>,
      );
      await user.click(screen.getByRole('button', { name: /數值字型/ }));
      const dialog = await screen.findByRole('dialog', { name: '選擇字型' });
      await user.click(within(dialog).getByRole('tab', { name: /電腦字型/ }));
      await user.click(within(dialog).getByRole('button', { name: '從清單選' }));
      const sample = (await screen.findByRole('textbox', { name: '樣張文字' })) as HTMLInputElement;
      expect(sample.value).toBe(LOCAL_FONT_SAMPLE);
      expect(sample.value).toContain('永');
      expect(sample.value).toMatch(/[A-Za-z]/);
      expect(sample.value).toMatch(/[0-9]/);
    } finally {
      delete (window as unknown as { queryLocalFonts?: unknown }).queryLocalFonts;
    }
  });
});

describe('FontPicker 的「沿用頁面字型」（obs-tachie F36）', () => {
  function Inherit({ onChange }: { onChange: (v: FontValue) => void }) {
    const [v, setV] = useState<FontValue>({
      source: 'google',
      family: 'Noto Sans TC',
      weight: 700,
    });
    return (
      <UiProvider>
        <Field label="名字字型">
          <FontPicker
            mode="css"
            inherit={{ description: '沿用 Streamkit 頁面原本的字型。' }}
            showWeight={false}
            value={v}
            onChange={(n) => {
              setV(n);
              onChange(n);
            }}
          />
        </Field>
      </UiProvider>
    );
  }

  it('選了就是空白字型名稱、欄位顯示「沿用頁面字型」；再選別的字型可以換回', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Inherit onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /名字字型/ }));
    let dialog = await screen.findByRole('dialog', { name: '選擇字型' });
    const opt = within(dialog).getByRole('button', { name: /沿用頁面字型/ });
    expect(opt).toHaveAttribute('aria-pressed', 'false');
    expect(opt).toHaveTextContent('沿用 Streamkit 頁面原本的字型。');
    await user.click(opt);
    expect(onChange).toHaveBeenLastCalledWith({ source: 'local', family: '', weight: 700 });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '選擇字型' })).toBeNull());
    const trigger = screen.getByRole('button', { name: /名字字型/ });
    expect(trigger).toHaveTextContent('沿用頁面字型');
    expect(trigger).toHaveTextContent('頁面');
    /* 選了沿用時沒有「要在 OBS 電腦安裝」的提醒 */
    expect(screen.queryByText('跑 OBS 的電腦也要安裝這套字型。')).toBeNull();
    await user.click(trigger);
    dialog = await screen.findByRole('dialog', { name: '選擇字型' });
    expect(within(dialog).getByRole('button', { name: /沿用頁面字型/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(within(dialog).getByRole('tab', { name: /電腦字型/ }));
    await user.click(
      within(within(dialog).getByRole('radiogroup', { name: '常見的電腦字型' })).getByRole(
        'radio',
        { name: /微軟正黑體/ },
      ),
    );
    expect(onChange).toHaveBeenLastCalledWith({
      source: 'local',
      family: 'Microsoft JhengHei',
      weight: 700,
    });
  });

  it('沒有給 inherit 時沒有這個選項（向下相容）', async () => {
    const user = userEvent.setup();
    render(
      <UiProvider>
        <Field label="字型">
          <FontPicker
            mode="css"
            value={{ source: 'google', family: 'Noto Sans TC', weight: 400 }}
            onChange={() => {}}
          />
        </Field>
      </UiProvider>,
    );
    await user.click(screen.getByRole('button', { name: /字型/ }));
    const dialog = await screen.findByRole('dialog', { name: '選擇字型' });
    expect(within(dialog).queryByRole('button', { name: /沿用頁面字型/ })).toBeNull();
  });
});

describe('LocalFontDialog', () => {
  const fonts = [
    { family: 'Noto Sans TC', fullName: 'Noto Sans TC Bold', style: 'Bold', postscriptName: 'a' },
    {
      family: 'Noto Sans TC',
      fullName: 'Noto Sans TC Regular',
      style: 'Regular',
      postscriptName: 'b',
    },
    {
      family: '微軟正黑體',
      fullName: 'Microsoft JhengHei UI',
      style: 'Regular',
      postscriptName: 'c',
    },
    { family: 'Arial', fullName: 'Arial Black', style: 'Black', postscriptName: 'd' },
  ];
  beforeEach(() => clearLocalFontCache());
  afterEach(() => {
    delete (window as unknown as { queryLocalFonts?: unknown }).queryLocalFonts;
  });

  it('讀取清單（同家族一次）、多關鍵字搜尋、Enter 選第一個、標示目前的字型', async () => {
    const user = userEvent.setup();
    (window as unknown as { queryLocalFonts: () => Promise<typeof fonts> }).queryLocalFonts = vi.fn(
      async () => fonts,
    );
    const onPick = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <UiProvider>
        <LocalFontDialog open onOpenChange={onOpenChange} value="Arial" onPick={onPick} />
      </UiProvider>,
    );
    const list = await screen.findByRole('list', { name: '電腦字型' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('共 3 套')).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: /Arial/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    const search = screen.getByRole('textbox', { name: '搜尋電腦字型' });
    await waitFor(() => expect(document.activeElement).toBe(search));
    await user.type(search, 'noto bold');
    expect(screen.getByText('3 套之中的 1 套')).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(onPick).toHaveBeenCalledWith('Noto Sans TC');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('權限被拒時說明怎麼允許，並可重新讀取', async () => {
    const user = userEvent.setup();
    const err = Object.assign(new Error('no'), { name: 'NotAllowedError' });
    const q = vi.fn(async () => {
      throw err;
    });
    (window as unknown as { queryLocalFonts: typeof q }).queryLocalFonts = q;
    render(
      <UiProvider>
        <LocalFontDialog open onOpenChange={() => {}} onPick={() => {}} />
      </UiProvider>,
    );
    expect(await screen.findByText(/沒有取得讀取電腦字型的權限/)).toBeInTheDocument();
    q.mockImplementationOnce(async () => {
      throw err;
    });
    await user.click(screen.getByRole('button', { name: '重新讀取' }));
    await waitFor(() => expect(q).toHaveBeenCalledTimes(2));
  });
});

describe('CssPreviewFrame 的滑鼠移入模擬', () => {
  it(':hover 同時對 .tk-hover 生效（不動到 ::hover 這類偽元素名稱）', () => {
    expect(simulateHoverCss('html:hover .a, body:hover>.b, .c:hover::after { x: 1 }')).toBe(
      'html:is(:hover, .tk-hover) .a, body:is(:hover, .tk-hover)>.b, .c:is(:hover, .tk-hover)::after { x: 1 }',
    );
    expect(simulateHoverCss('.a:hovering, .b::hover')).toBe('.a:hovering, .b::hover');
  });
});

describe('條件顯示與 OBS 說明', () => {
  it('Field hidden、Show', () => {
    render(
      <>
        <Field label="欄數" hidden>
          <input />
        </Field>
        <Field label="寬度">
          <input />
        </Field>
        <Show when={false}>
          <p>不該出現</p>
        </Show>
        <Show when={1}>
          <p>出現了</p>
        </Show>
      </>,
    );
    expect(screen.queryByText('欄數')).toBeNull();
    expect(screen.getByText('寬度')).toBeInTheDocument();
    expect(screen.queryByText('不該出現')).toBeNull();
    expect(screen.getByText('出現了')).toBeInTheDocument();
  });

  it('ObsGuide 依選項列出步驟與注意事項', () => {
    render(
      <ObsGuide
        urlLabel="房間網址（不加 /chat）"
        url="https://ccfolia.com/rooms/abcd"
        size={{ width: 1280, height: 720 }}
        login="swap-url"
        audio
        obs={{ version: 31, features: ['依成敗上色'] }}
        multipleSources
        localFonts={['微軟正黑體']}
      />,
    );
    const guide = screen.getByRole('region', { name: '在 OBS 裡設定' });
    expect(guide).toHaveTextContent('寬 1280 × 高 720');
    expect(guide).toHaveTextContent('https://ccfolia.com/rooms/abcd');
    expect(guide).toHaveTextContent('自訂 CSS');
    expect(guide).toHaveTextContent('https://ccfolia.com/');
    expect(guide).toHaveTextContent('透過 OBS 控制音訊');
    expect(guide).toHaveTextContent('依成敗上色需要 OBS 31 以上');
    expect(guide).toHaveTextContent('複製變換');
    expect(guide).toHaveTextContent('用到電腦字型（微軟正黑體）');
    expect(guide).toHaveTextContent('本工具與 CCFOLIA 官方無關');
  });
});

describe('CropDialog（數值範圍＋兩段式確認）', () => {
  it('數字欄不即時修正、顯示裁切後尺寸或範圍在圖外；確認畫面顯示前後尺寸與大小', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const image = { width: 300, height: 600 } as unknown as ImageBitmap;
    render(
      <UiProvider>
        <CropDialog
          open
          onOpenChange={() => {}}
          image={image}
          aspect={null}
          rawInputs
          freeDraw
          initialRect={{ x: 0, y: 0, width: 300, height: 600 }}
          confirm={{ beforeBytes: 9318, estimateBytes: async () => 6554 }}
          onConfirm={onConfirm}
        />
      </UiProvider>,
    );
    const status = () => screen.getByText(/裁切後|範圍在圖片外|範圍等於整張圖片/);
    expect(status()).toHaveTextContent('範圍等於整張圖片');
    expect(screen.getByRole('button', { name: '確定' })).toBeDisabled();
    const x = screen.getByRole('spinbutton', { name: 'X' });
    await user.clear(x);
    await user.type(x, '9999');
    expect(status()).toHaveTextContent('範圍在圖片外');
    expect(x).toHaveValue('9999');
    await user.clear(x);
    await user.type(x, '70');
    const w = screen.getByRole('spinbutton', { name: '寬' });
    await user.clear(w);
    await user.type(w, '160');
    expect(status()).toHaveTextContent('裁切後 160×600px');
    await user.click(screen.getByRole('button', { name: '確定' }));
    const summary = await screen.findByTestId('crop-summary');
    expect(summary).toHaveTextContent('原尺寸 300×600px → 裁切後 160×600px');
    await waitFor(() => expect(summary).toHaveTextContent('嵌入大小 9.1 KB → 6.4 KB'));
    expect(summary).toHaveTextContent('無法復原');
    await act(async () => {
      await user.click(screen.getByRole('button', { name: '套用' }));
    });
    expect(onConfirm).toHaveBeenCalledWith({ x: 70, y: 0, width: 160, height: 600 });
  });

  describe('freeDraw：框蓋滿整張圖也能畫新範圍；拖曳時數字欄跟著更新（obs-tachie F21）', () => {
    const image = { width: 300, height: 600 } as unknown as ImageBitmap;
    let rectSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      /* 畫面上的圖片＝原圖大小（螢幕座標＝影像座標） */
      rectSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        right: 300,
        bottom: 600,
        width: 300,
        height: 600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);
    });
    afterEach(() => {
      rectSpy.mockRestore();
      vi.restoreAllMocks();
    });
    const renderDialog = (onConfirm = vi.fn()) => {
      render(
        <UiProvider>
          <CropDialog
            open
            onOpenChange={() => {}}
            image={image}
            aspect={null}
            rawInputs
            freeDraw
            initialRect={{ x: 0, y: 0, width: 300, height: 600 }}
            confirm={{ beforeBytes: 9318 }}
            onConfirm={onConfirm}
          />
        </UiProvider>,
      );
      return onConfirm;
    };
    const box = () => screen.getByRole('group', { name: /^裁切範圍/ });
    const values = () =>
      ['X', 'Y', '寬', '高'].map(
        (n) => (screen.getByRole('spinbutton', { name: n }) as HTMLInputElement).value,
      );

    it('從初始範圍（整張圖）在框內按住拖曳＝畫出新範圍（任何方向）', () => {
      renderDialog();
      fireEvent.pointerDown(box(), { button: 0, clientX: 180, clientY: 420, pointerId: 1 });
      fireEvent.pointerMove(box(), { clientX: 100, clientY: 300, pointerId: 1 });
      fireEvent.pointerMove(box(), { clientX: 60, clientY: 120, pointerId: 1 });
      fireEvent.pointerUp(box(), { pointerId: 1 });
      expect(values()).toEqual(['60', '120', '120', '300']);
      expect(screen.getByText('裁切後 120×300px')).toBeInTheDocument();
    });

    it('拖中央的把手＝移動；在框內按住不動一下再拖也是移動', () => {
      const now = vi.spyOn(Date, 'now');
      now.mockReturnValue(1000);
      renderDialog();
      /* 先畫一個 100×200 的範圍 */
      fireEvent.pointerDown(box(), { button: 0, clientX: 0, clientY: 0, pointerId: 1 });
      fireEvent.pointerMove(box(), { clientX: 100, clientY: 200, pointerId: 1 });
      fireEvent.pointerUp(box(), { pointerId: 1 });
      expect(values()).toEqual(['0', '0', '100', '200']);
      /* 中央把手：拖了就移動 */
      const handle = screen.getByTestId('crop-move-handle');
      fireEvent.pointerDown(handle, { button: 0, clientX: 50, clientY: 100, pointerId: 2 });
      fireEvent.pointerMove(handle, { clientX: 80, clientY: 140, pointerId: 2 });
      fireEvent.pointerUp(handle, { pointerId: 2 });
      expect(values()).toEqual(['30', '40', '100', '200']);
      /* 框內按住不動（超過門檻時間）再拖：移動 */
      fireEvent.pointerDown(box(), { button: 0, clientX: 40, clientY: 50, pointerId: 3 });
      now.mockReturnValue(1000 + CROP_HOLD_TO_MOVE_MS + 10);
      fireEvent.pointerMove(box(), { clientX: 60, clientY: 60, pointerId: 3 });
      fireEvent.pointerUp(box(), { pointerId: 3 });
      expect(values()).toEqual(['50', '50', '100', '200']);
      /* 框內按下立刻拖：畫新範圍 */
      fireEvent.pointerDown(box(), { button: 0, clientX: 60, clientY: 60, pointerId: 4 });
      fireEvent.pointerMove(box(), { clientX: 90, clientY: 100, pointerId: 4 });
      fireEvent.pointerUp(box(), { pointerId: 4 });
      expect(values()).toEqual(['60', '60', '30', '40']);
    });

    it('欄位打到一半就拖曳：四個欄位都跟著更新，確定時以畫面上的範圍為準', async () => {
      const user = userEvent.setup();
      const onConfirm = renderDialog();
      const h = screen.getByRole('spinbutton', { name: '高' });
      await user.clear(h);
      await user.type(h, '100');
      expect(document.activeElement).toBe(h);
      fireEvent.pointerDown(box(), { button: 0, clientX: 60, clientY: 60, pointerId: 1 });
      fireEvent.pointerMove(box(), { clientX: 240, clientY: 540, pointerId: 1 });
      fireEvent.pointerUp(box(), { pointerId: 1 });
      expect(values()).toEqual(['60', '60', '180', '480']);
      expect(screen.getByText('裁切後 180×480px')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: '確定' }));
      expect(await screen.findByTestId('crop-summary')).toHaveTextContent(
        '原尺寸 300×600px → 裁切後 180×480px',
      );
      await act(async () => {
        await user.click(screen.getByRole('button', { name: '套用' }));
      });
      expect(onConfirm).toHaveBeenCalledWith({ x: 60, y: 60, width: 180, height: 480 });
    });
  });
});

describe('ItemListEditor：每一項的佔位（getPlaceholder，coc-sheet 加的）', () => {
  it('名稱空白時改顯示 getPlaceholder 給的字：輸入框的灰字、改名欄與刪除鈕的名稱都用它；沒給時照舊用 placeholder', () => {
    render(
      <UiProvider>
        <ItemListEditor<{ id: string; title: string; who: string }>
          aria-label="角色卡"
          items={[
            { id: 'a', title: '', who: '林子安' },
            { id: 'b', title: '', who: '' },
          ]}
          getId={(i) => i.id}
          getName={(i) => i.title}
          placeholder="未命名的角色卡"
          getPlaceholder={(i) => i.who || '未命名的角色卡'}
          renameLabel="角色卡名稱"
          onRename={() => {}}
          onRemove={() => {}}
        />
      </UiProvider>,
    );
    const inputs = screen.getAllByRole('textbox');
    expect(inputs.map((i) => i.getAttribute('placeholder'))).toEqual(['林子安', '未命名的角色卡']);
    expect(screen.getByRole('textbox', { name: '角色卡名稱（林子安）' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '刪除「林子安」' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '刪除「未命名的角色卡」' })).toBeTruthy();
  });
});
