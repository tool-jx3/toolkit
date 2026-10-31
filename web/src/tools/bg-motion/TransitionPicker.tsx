/**
 * 「看效果選」：效果按鈕＋對話框（F117、F118）。對話框裡是所有效果的縮圖格，平常靜止，滑過或聚焦時動起來
 * （停一下、切過去、停一下、再切回來）；選一個就套用並關閉。縮圖畫的是兩張示意圖 A、B 套上該效果。
 */
import { ChevronDown } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Button, Dialog } from '@/ui';
import { EffectGrid, type EffectGridItem } from '@/ui/EffectGrid';
import { TRANS_KINDS, type TransKind } from './deck';
import { easeAt } from './deckPlan';
import { drawMiniScene } from './sample';
import { DECK, TRANS_TEXT } from './strings';
import { drawFx, transitionOps } from './switchFx';

const TW = 192;
const TH = 108;
/** 示意動畫一輪的秒數：A 停 0.35 → 切 0.9 → 停 0.35，再倒回來 */
export const PICK_PERIOD = 3.2;

let samples: { a: HTMLCanvasElement; b: HTMLCanvasElement } | null = null;

/** 兩張示意圖（白天 A、黃昏 B，各畫一個大字母方便看出切換） */
function pickSamples() {
  if (samples) return samples;
  const make = (kind: 'day' | 'dusk', letter: string) => {
    const c = document.createElement('canvas');
    c.width = TW;
    c.height = TH;
    const ctx = c.getContext('2d');
    if (ctx) {
      drawMiniScene(ctx, TW, TH, kind);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = `bold ${Math.round(TH * 0.6)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 6;
      ctx.fillText(letter, TW / 2, TH / 2 + 4);
    }
    return c;
  };
  samples = { a: make('day', 'A'), b: make('dusk', 'B') };
  return samples;
}

/** 縮圖的一格：t（0～1）是一輪裡的位置 */
export function drawPickThumb(ctx: CanvasRenderingContext2D, kind: TransKind, t: number): void {
  const { a, b } = pickSamples();
  const T = t * PICK_PERIOD;
  const fwd = T < PICK_PERIOD / 2;
  const u = fwd ? T : T - PICK_PERIOD / 2;
  const p = easeAt('inout', (u - 0.35) / 0.9);
  const from = fwd ? a : b;
  const to = fwd ? b : a;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, w, h);
  if (kind === 'random') {
    ctx.drawImage(a, 0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#7b5ea7';
    ctx.font = `bold ${Math.round(h * 0.6)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', w / 2, h / 2 + 4);
    return;
  }
  drawFx(ctx, transitionOps(kind, p, w, h), from, to, w, h);
}

const itemsFor = (edge: boolean): EffectGridItem<TransKind>[] =>
  TRANS_KINDS.map((k) => ({
    value: k,
    label: edge && k === 'cut' ? DECK.edgeNone : TRANS_TEXT[k].label,
    description: TRANS_TEXT[k].description,
    group: TRANS_TEXT[k].group,
  }));

export interface TransitionPickerProps {
  value: TransKind;
  onChange: (kind: TransKind) => void;
  /** 按鈕與對話框的對象（第 1 張、一次設定、第一張出現…），給無障礙名稱用 */
  target: string;
  /** 第一張出現、最後一張消失：「不切換」顯示成「無」 */
  edge?: boolean;
  /** 「隨機」目前抽到的效果（顯示在按鈕上） */
  resolved?: TransKind | null;
  disabled?: boolean;
  'data-testid'?: string;
}

export function TransitionPicker({
  value,
  onChange,
  target,
  edge = false,
  resolved = null,
  disabled,
  ...rest
}: TransitionPickerProps) {
  const [open, setOpen] = useState(false);
  /* 對話框裡的選取只是草稿：方向鍵移動不套用，點一下或 Enter／空白鍵才套用並關閉，Esc 放棄 */
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  /* 開啟時焦點在目前的效果上（Radix 不給 initialFocus 時落在「關閉」鈕） */
  const focusRef = useRef<HTMLElement | null>(null);
  const items = useMemo(() => itemsFor(edge), [edge]);
  const name = edge && value === 'cut' ? DECK.edgeNone : TRANS_TEXT[value].label;
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, k: TransKind, t: number) => drawPickThumb(ctx, k, t),
    [],
  );
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={`${DECK.pickTitle}：${target}`}
      description={DECK.pickDescription}
      size="xl"
      initialFocus={focusRef}
      /* 按鈕當成對話框的 trigger：關閉後 Radix 把焦點還給它 */
      trigger={
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled}
          aria-label={DECK.pickButton(target, name)}
          data-testid={rest['data-testid']}
          data-kind={value}
          onClick={() => {
            draftRef.current = value;
            setDraft(value);
          }}
          className="min-w-0 max-w-full justify-between"
        >
          <span className="truncate">{name}</span>
          {value === 'random' && resolved ? (
            <span className="truncate text-xs text-muted" data-testid="picked-kind">
              （{DECK.randomPicked(TRANS_TEXT[resolved].label)}）
            </span>
          ) : null}
          <ChevronDown aria-hidden className="size-3.5 shrink-0 opacity-70" />
        </Button>
      }
    >
      {/* 滑鼠點一下（click）、Enter、空白鍵（keydown）：在這裡套用草稿並關閉 */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 只接住格子裡按鈕冒上來的 click */}
      <div
        ref={(el) => {
          focusRef.current =
            el?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]') ?? null;
        }}
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('[role="radio"]')) return;
          onChange(draftRef.current);
          setOpen(false);
        }}
        onKeyDown={(e) => {
          /* 格子自己處理 Enter、空白鍵（不送 click），這裡補上：套用草稿並關閉 */
          if (e.key !== 'Enter' && e.key !== ' ') return;
          if (!(e.target as HTMLElement).closest('[role="radio"]')) return;
          onChange(draftRef.current);
          setOpen(false);
        }}
      >
        <EffectGrid<TransKind>
          aria-label={DECK.pickAria}
          items={items}
          value={draft}
          onValueChange={(k) => {
            if (!k) return;
            draftRef.current = k;
            setDraft(k);
          }}
          draw={draw}
          thumbWidth={TW}
          thumbHeight={TH}
          period={PICK_PERIOD}
          stillTime={0.25}
          minItemWidth={150}
        />
      </div>
    </Dialog>
  );
}
