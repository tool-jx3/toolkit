/**
 * 編輯列：新增角色、批次建立、貼上關係表、排列、對齊與分佈、磁鐵、更多（畫布尺寸、貼合、背景圖、打亂座位、
 * 範例、複製關係表、清空、小地圖）；右邊復原、重做、匯出。
 */
import {
  AlignCenterHorizontal,
  ArrowLeftRight,
  BookOpen,
  ChartSpline,
  ClipboardPaste,
  Copy,
  Download,
  Ellipsis,
  Eraser,
  ImageOff,
  ImagePlus,
  LayoutGrid,
  Magnet,
  Map as MapIcon,
  Maximize2,
  Plus,
  Redo2,
  Ruler,
  Shuffle,
  Sparkles,
  Undo2,
  Users,
} from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useUndoRedo } from '@/core/storage';
import { Button, buttonClass, IconButton, useConfirm, useToast, withShortcut } from '@/ui';
import {
  addChar,
  clearSheet,
  editSheet,
  fitCanvas,
  shuffle,
  updateSettings,
} from '../state/actions';
import { activeSheet, setPrefs, setUi, usePrefs, useProject, useUi } from '../state/store';
import { S } from '../strings';
import { useSheet } from './hooks';
import { MENU_CONTENT, MENU_ITEM, MENU_SEP } from './menu';
import { importBackground } from './SettingsPanel';
import { kickSim, stopSim } from './sim';
import { toggleSwap } from './swap';
import { redo, undo } from './undo';
import { fitView } from './view';

/** 角色資訊：正在編輯的角色 → 唯一選取的 → 聚焦的（原作的 infoTargetChar）；都沒有時提示 */
function openInfo(notify: (m: string, warn?: boolean) => void): void {
  const u = useUi.getState();
  const id =
    u.panel?.kind === 'char' || u.panel?.kind === 'info'
      ? u.panel.id
      : u.sel.length === 1
        ? u.sel[0]
        : u.focus?.kind === 'node'
          ? u.focus.id
          : null;
  if (id === null || !activeSheet().chars.some((c) => c.id === id)) {
    notify(S.info.pickHint, true);
    return;
  }
  setUi({ panel: { kind: 'info', id } });
}

export function EditorBar() {
  const { canUndo, canRedo } = useUndoRedo(useProject);
  const sheet = useSheet();
  const simRunning = useUi((u) => u.simRunning);
  const minimap = usePrefs((p) => p.data.minimap);
  const swapping = useUi((u) => !!u.swap);
  const toast = useToast();
  const confirm = useConfirm();
  const magnet = sheet.settings.snapMode;
  const notify = (m: string, warn?: boolean) =>
    toast({ title: m, tone: warn ? 'warning' : 'success' });
  const toggleMagnet = () => {
    const on = !magnet;
    /* 先停：模擬的那一步（移動）和關掉磁鐵分成兩步復原 */
    if (!on) stopSim();
    updateSettings((s) => {
      s.snapMode = on;
    });
    if (on) kickSim(1);
  };
  const clear = async () => {
    const ok = await confirm({
      title: S.msg.clearTitle,
      description: S.msg.clearText,
      confirmLabel: S.msg.clearConfirm,
      danger: true,
    });
    if (!ok) return;
    clearSheet();
    toast({
      title: S.msg.sheetCleared,
      tone: 'info',
      action: { label: S.msg.undo, onClick: undo },
    });
  };
  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1.5"
      data-testid="editor-bar"
    >
      <Button
        size="sm"
        variant="primary"
        icon={<Plus />}
        onClick={() => addChar()}
        data-testid="add-char"
      >
        {S.bar.addChar}
      </Button>
      <Button
        size="sm"
        icon={<Users />}
        onClick={() => setUi({ dialog: 'batch' })}
        data-testid="open-batch"
      >
        {S.bar.batch}
      </Button>
      <Button
        size="sm"
        icon={<ClipboardPaste />}
        onClick={() => setUi({ dialog: 'paste' })}
        data-testid="open-paste"
      >
        {S.bar.paste}
      </Button>
      <Button
        size="sm"
        icon={<LayoutGrid />}
        onClick={() => setUi({ dialog: 'layout' })}
        data-testid="open-layout"
      >
        {S.bar.layout}
      </Button>
      <Button
        size="sm"
        icon={<AlignCenterHorizontal />}
        onClick={() => setUi({ dialog: 'align' })}
        data-testid="open-align"
      >
        {S.bar.align}
      </Button>
      <Button
        size="sm"
        variant={magnet ? 'primary' : 'secondary'}
        icon={<Magnet className={simRunning ? 'animate-pulse' : undefined} />}
        aria-pressed={magnet}
        title={S.bar.magnetTip}
        onClick={toggleMagnet}
        data-testid="magnet"
      >
        {S.bar.magnet}
      </Button>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          className={buttonClass('secondary', 'sm')}
          aria-label={S.bar.moreMenu}
          data-testid="more-menu"
        >
          <Ellipsis aria-hidden className="size-4" />
          <span className="ml-1">{S.bar.more}</span>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="start" sideOffset={6} className={MENU_CONTENT}>
            <DropdownMenu.Item
              className={MENU_ITEM}
              onSelect={() => setUi({ dialog: 'canvas' })}
              data-testid="menu-canvas"
            >
              <Ruler />
              {S.more.canvasSize}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={MENU_ITEM}
              onSelect={() => {
                if (fitCanvas()) {
                  const s = activeSheet();
                  notify(S.canvas.fitted(s.W, s.H));
                  requestAnimationFrame(fitView);
                } else notify(S.canvas.fitEmpty, true);
              }}
              data-testid="menu-fit-canvas"
            >
              <Maximize2 />
              {S.more.fitCanvas}
            </DropdownMenu.Item>
            <DropdownMenu.Item className={MENU_ITEM} onSelect={() => void importBackground(notify)}>
              <ImagePlus />
              {S.more.bgImport}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={MENU_ITEM}
              disabled={!sheet.bg}
              onSelect={() =>
                editSheet((d) => {
                  d.bg = null;
                })
              }
            >
              <ImageOff />
              {S.more.bgRemove}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={MENU_ITEM}
              title={S.more.shuffleTip}
              onSelect={() => {
                const sel = new Set(useUi.getState().sel);
                const pool = sel.size ? sheet.chars.filter((c) => sel.has(c.id)) : sheet.chars;
                if (pool.filter((c) => !c.locked).length < 2) {
                  notify(S.msg.shuffleNone, true);
                  return;
                }
                shuffle();
              }}
              data-testid="menu-shuffle"
            >
              <Shuffle />
              {S.more.shuffle}
            </DropdownMenu.Item>
            <DropdownMenu.CheckboxItem
              className={MENU_ITEM}
              checked={swapping}
              title={S.swap.tip}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(v) => toggleSwap(v)}
              data-testid="menu-swap"
            >
              <ArrowLeftRight />
              {S.swap.menu}
              <DropdownMenu.ItemIndicator className="ml-auto text-xs">✓</DropdownMenu.ItemIndicator>
            </DropdownMenu.CheckboxItem>
            <DropdownMenu.Separator className={MENU_SEP} />
            <DropdownMenu.Item
              className={MENU_ITEM}
              onSelect={() => openInfo(notify)}
              data-testid="menu-info"
            >
              <BookOpen />
              {S.info.open}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={MENU_ITEM}
              onSelect={() => {
                const u = useUi.getState();
                const a =
                  u.panel?.kind === 'char'
                    ? u.panel.id
                    : u.sel.length === 1
                      ? u.sel[0]
                      : u.focus?.kind === 'node'
                        ? u.focus.id
                        : null;
                setUi({ dialog: 'radarCompare', compare: { a, b: null } });
              }}
              data-testid="menu-compare"
            >
              <ChartSpline />
              {S.radar.compareTitle}…
            </DropdownMenu.Item>
            <DropdownMenu.Separator className={MENU_SEP} />
            <DropdownMenu.Item
              className={MENU_ITEM}
              onSelect={() => setUi({ dialog: 'samples' })}
              data-testid="menu-samples"
            >
              <Sparkles />
              {S.more.samples}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={MENU_ITEM}
              onSelect={() => setUi({ dialog: 'copy' })}
              data-testid="menu-copy-table"
            >
              <Copy />
              {S.more.copyTable}
            </DropdownMenu.Item>
            <DropdownMenu.CheckboxItem
              className={MENU_ITEM}
              checked={minimap}
              onCheckedChange={(v) => setPrefs({ minimap: v })}
              data-testid="menu-minimap"
            >
              <MapIcon />
              {S.more.minimap}
              <DropdownMenu.ItemIndicator className="ml-auto text-xs">✓</DropdownMenu.ItemIndicator>
            </DropdownMenu.CheckboxItem>
            <DropdownMenu.Separator className={MENU_SEP} />
            <DropdownMenu.Item
              className={MENU_ITEM}
              disabled={!sheet.chars.length && !sheet.rels.length}
              onSelect={() => void clear()}
              data-testid="menu-clear"
            >
              <Eraser />
              {S.more.clear}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <div className="ml-auto flex items-center gap-1">
        <IconButton
          size="sm"
          icon={<Undo2 />}
          label={withShortcut(S.bar.undo, 'mod+z')}
          disabled={!canUndo}
          onClick={undo}
          data-testid="undo"
        />
        <IconButton
          size="sm"
          icon={<Redo2 />}
          label={withShortcut(S.bar.redo, 'shift+mod+z')}
          disabled={!canRedo}
          onClick={redo}
          data-testid="redo"
        />
        <Button
          size="sm"
          icon={<Download />}
          onClick={() => setUi({ dialog: 'export' })}
          data-testid="open-export"
        >
          {S.bar.export}
        </Button>
      </div>
    </div>
  );
}
