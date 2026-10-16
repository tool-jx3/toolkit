/**
 * 編輯列：新增角色、批次建立、貼上關係表、排列、對齊與分佈、磁鐵、更多（新增便利貼與圖表節點、畫布尺寸、貼合、背景圖、
 * 打亂座位、範例、複製關係表、清空、小地圖）、檢視（唯讀瀏覽、世界觀、備忘錄、統計與尋路）；右邊復原、重做、匯出。
 * 唯讀瀏覽中只剩「檢視」選單與匯出。
 */
import {
  AlignCenterHorizontal,
  ArrowLeftRight,
  BarChart3,
  BookOpen,
  ChartNoAxesCombined,
  ChartSpline,
  ClipboardPaste,
  Copy,
  Download,
  Ellipsis,
  Eraser,
  Eye,
  Film,
  FlipHorizontal2,
  Globe,
  ImageOff,
  ImagePlus,
  LayoutGrid,
  Magnet,
  Map as MapIcon,
  Maximize2,
  NotebookPen,
  Plus,
  Redo2,
  Ruler,
  Shuffle,
  Sparkles,
  StickyNote,
  TextQuote,
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
import { addChartNote, addNote } from '../state/noteActions';
import { activeSheet, setPrefs, setUi, usePrefs, useProject, useUi } from '../state/store';
import { convertFromTimeline, convertToTimeline } from '../state/tlActions';
import { S } from '../strings';
import { ExportAgain } from './ExportAgain';
import { useSheet } from './hooks';
import { MENU_CONTENT, MENU_ITEM, MENU_SEP } from './menu';
import { setReadonly } from './readonly';
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

/** 剛從「更多」新增的便利貼：選單關掉時打開它的編輯框 */
let editAfterMenu: number | null = null;

/** 「檢視」選單：唯讀瀏覽、世界觀、備忘錄、統計與尋路 */
function ViewMenu() {
  const readonly = useUi((u) => u.readonly);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={buttonClass(readonly ? 'primary' : 'secondary', 'sm')}
        aria-label={S.view.menuLabel}
        data-testid="view-menu"
      >
        <Eye aria-hidden className="size-4" />
        <span className="ml-1">{S.view.menu}</span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={6} className={MENU_CONTENT}>
          <DropdownMenu.CheckboxItem
            className={MENU_ITEM}
            checked={readonly}
            title={S.readonly.menuTip}
            onCheckedChange={(v) => setReadonly(v)}
            data-testid="menu-readonly"
          >
            <Eye />
            {S.readonly.menu}
            <DropdownMenu.ItemIndicator className="ml-auto text-xs">✓</DropdownMenu.ItemIndicator>
          </DropdownMenu.CheckboxItem>
          {readonly ? null : (
            <>
              <DropdownMenu.Separator className={MENU_SEP} />
              <DropdownMenu.Item
                className={MENU_ITEM}
                onSelect={() => setUi({ panel: { kind: 'lore' } })}
                data-testid="menu-lore"
              >
                <Globe />
                {S.lore.menu}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={MENU_ITEM}
                onSelect={() => setUi({ panel: { kind: 'memo' } })}
                data-testid="menu-memo"
              >
                <NotebookPen />
                {S.memo.menu}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={MENU_ITEM}
                onSelect={() => setUi({ panel: { kind: 'stats' } })}
                data-testid="menu-stats"
              >
                <BarChart3 />
                {S.stats.menu}
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** 唯讀瀏覽中的編輯列 */
function ReadonlyBar() {
  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1.5"
      data-testid="editor-bar"
    >
      <ViewMenu />
      <span className="text-sm text-muted" data-testid="readonly-bar">
        {S.readonly.bar}
      </span>
      <Button size="sm" onClick={() => setReadonly(false)} data-testid="readonly-exit">
        {S.readonly.exit}
      </Button>
      <div className="ml-auto flex items-center gap-1">
        <ExportAgain />
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

export function EditorBar() {
  const readonly = useUi((u) => u.readonly);
  return readonly ? <ReadonlyBar /> : <EditBar />;
}

function EditBar() {
  const { canUndo, canRedo } = useUndoRedo(useProject);
  const sheet = useSheet();
  const simRunning = useUi((u) => u.simRunning);
  const minimap = usePrefs((p) => p.data.minimap);
  const tweenOff = usePrefs((p) => p.data.tweenOff);
  const flipAnim = usePrefs((p) => p.data.flipAnim);
  const noteFade = usePrefs((p) => p.data.noteFade);
  const swapping = useUi((u) => !!u.swap);
  const bgLocked = !!sheet.tl?.locked.includes('bg');
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
  /* 編輯 › 時間軸分頁（原作的 toggleTimelineSheet；兩個方向都先確認，可以復原） */
  const toggleTimeline = async (on: boolean) => {
    const ok = await confirm(
      on
        ? { title: S.tl.convertTitle, description: S.tl.convertText, confirmLabel: S.tl.convertOk }
        : {
            title: S.tl.revertTitle,
            description: S.tl.revertText,
            confirmLabel: S.tl.revertOk,
            danger: true,
          },
    );
    if (!ok) return;
    stopSim();
    if (on) convertToTimeline();
    else convertFromTimeline();
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
          <DropdownMenu.Content
            align="start"
            sideOffset={6}
            className={MENU_CONTENT}
            onCloseAutoFocus={(e) => {
              if (editAfterMenu === null) return;
              e.preventDefault();
              const id = editAfterMenu;
              editAfterMenu = null;
              setUi({ noteEdit: id });
            }}
          >
            <DropdownMenu.Item
              className={MENU_ITEM}
              onSelect={() => {
                /* 新增即進入輸入：等選單關掉（不把焦點還給選單鈕）再打開編輯框 */
                editAfterMenu = addNote();
              }}
              data-testid="menu-add-note"
            >
              <StickyNote />
              {S.more.addNote}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={MENU_ITEM}
              onSelect={() => {
                const id = addChartNote();
                setUi({ panel: { kind: 'note', id } });
              }}
              data-testid="menu-add-chart"
            >
              <ChartNoAxesCombined />
              {S.more.addChartNote}
            </DropdownMenu.Item>
            <DropdownMenu.Separator className={MENU_SEP} />
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
            <DropdownMenu.Item
              className={MENU_ITEM}
              disabled={bgLocked}
              title={bgLocked ? S.tl.lockBg : undefined}
              onSelect={() => void importBackground(notify)}
            >
              <ImagePlus />
              {S.more.bgImport}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={MENU_ITEM}
              disabled={!sheet.bg || bgLocked}
              title={bgLocked ? S.tl.lockBg : undefined}
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
            <DropdownMenu.CheckboxItem
              className={MENU_ITEM}
              checked={!!sheet.tl}
              title={S.tl.menuTip}
              onCheckedChange={(v) => void toggleTimeline(v)}
              data-testid="menu-timeline"
            >
              <Film />
              {S.tl.menu}
              <DropdownMenu.ItemIndicator className="ml-auto text-xs">✓</DropdownMenu.ItemIndicator>
            </DropdownMenu.CheckboxItem>
            <DropdownMenu.CheckboxItem
              className={MENU_ITEM}
              checked={flipAnim}
              disabled={!sheet.tl || tweenOff}
              title={S.tl.flipTip}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(v) => setPrefs({ flipAnim: v })}
              data-testid="menu-flip"
            >
              <FlipHorizontal2 />
              {S.tl.flip}
              <DropdownMenu.ItemIndicator className="ml-auto text-xs">✓</DropdownMenu.ItemIndicator>
            </DropdownMenu.CheckboxItem>
            <DropdownMenu.CheckboxItem
              className={MENU_ITEM}
              checked={noteFade}
              disabled={!sheet.tl || tweenOff}
              title={S.tl.noteFadeTip}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(v) => setPrefs({ noteFade: v })}
              data-testid="menu-note-fade"
            >
              <TextQuote />
              {S.tl.noteFade}
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
      <ViewMenu />
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
        <ExportAgain />
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
