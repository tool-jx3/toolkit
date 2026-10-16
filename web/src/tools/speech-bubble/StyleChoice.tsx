/**
 * 造型的縮圖格線（F23）：「泡泡」分頁的單一泡泡、「樣式」分頁的兩側預設共用。
 * 縮圖是各造型的預設配色＋範例文字，畫在中性的灰底上。
 */
import { useCallback, useMemo } from 'react';
import { canvasMeasure } from '@/core/typeset/measure';
import { ThumbChoice } from '@/ui';
import { drawBubble, FULL_TEXT } from './draw';
import { useFontTick } from './fontTick';
import { cachedUnit, layoutBubble } from './layout';
import { STYLE_IDS, type StyleId } from './model';
import { useSb } from './store';
import { STYLE_GROUP_NAMES, STYLE_NAMES } from './strings';
import { STYLE_GROUPS, styleDefaults, styleOf } from './styles';

function useStyleThumb() {
  const font = useSb((s) => s.data.font);
  const tick = useFontTick();
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick 只用來在字型載好後重畫
  return useCallback(
    (ctx: CanvasRenderingContext2D, style: StyleId) => {
      const W = ctx.canvas.width;
      const H = ctx.canvas.height;
      ctx.fillStyle = '#4b505c';
      ctx.fillRect(0, 0, W, H);
      const d = styleDefaults(style);
      const b = {
        style,
        title:
          style === 'news'
            ? '快訊'
            : style === 'card' || style === 'capsule' || style === 'tag'
              ? 'A'
              : '標題',
        text: '對話',
        icon: d.icon,
        button: '好',
        align: 'left' as const,
        colors: d.colors,
      };
      const unit = cachedUnit(canvasMeasure);
      const L = layoutBubble(
        b,
        { font, fontSize: 18, lineHeight: 1.4, wrapWidth: 200, shadow: true },
        unit,
      );
      const vw = L.w + L.ext.l + L.ext.r;
      const vh = L.h + L.ext.t + L.ext.b;
      const k = Math.min((W * 0.9) / vw, (H * 0.86) / vh);
      ctx.translate((W - vw * k) / 2 + L.ext.l * k, (H - vh * k) / 2 + L.ext.t * k);
      ctx.scale(k, k);
      if (L.spec.tilt) {
        ctx.translate(L.w / 2, L.h / 2);
        ctx.rotate((L.spec.tilt * Math.PI) / 180);
        ctx.translate(-L.w / 2, -L.h / 2);
      }
      drawBubble(ctx, L, b, {
        shadow: true,
        u: 0.3,
        seed: 1,
        text: FULL_TEXT,
        shine: null,
        scan: null,
      });
    },
    [font, tick],
  );
}

export function StyleChoice({
  value,
  onChange,
  label,
}: {
  value: StyleId;
  onChange: (style: StyleId) => void;
  label: string;
}) {
  const draw = useStyleThumb();
  const options = useMemo(
    () =>
      STYLE_GROUPS.flatMap((g) =>
        STYLE_IDS.filter((s) => styleOf(s).group === g).map((s) => ({
          value: s,
          label: STYLE_NAMES[s],
          description: STYLE_GROUP_NAMES[g],
        })),
      ),
    [],
  );
  return (
    <ThumbChoice<StyleId>
      aria-label={label}
      options={options}
      value={value}
      onValueChange={onChange}
      draw={(ctx, v) => draw(ctx, v)}
      thumbWidth={160}
      thumbHeight={96}
      minItemWidth={76}
    />
  );
}
