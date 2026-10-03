import { useEffect, useRef } from 'react';
import { createRandom, EASE, EASING_CHOICES, type EasingName } from '@/core/timeline';
import { Section } from '@/ui';
import { FlowDemo } from './FlowDemo';
import { PagedDemo } from './PagedDemo';
import { PostDemo } from './PostDemo';
import { TypesetDemo } from './TypesetDemo';
import { VideoDemo } from './VideoDemo';

function Curve({ name }: { name: EasingName }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const css = getComputedStyle(document.documentElement);
    const W = c.width;
    const H = c.height;
    const pad = 10;
    const y = (v: number) => H - pad - v * (H - pad * 2) * 0.8 - (H - pad * 2) * 0.1;
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = css.getPropertyValue('--border').trim() || '#444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, y(0));
    ctx.lineTo(W - pad, y(0));
    ctx.moveTo(pad, y(1));
    ctx.lineTo(W - pad, y(1));
    ctx.stroke();
    ctx.strokeStyle = css.getPropertyValue('--accent').trim() || '#b79ce0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) {
      const u = i / 60;
      const px = pad + u * (W - pad * 2);
      if (i === 0) ctx.moveTo(px, y(EASE[name](u)));
      else ctx.lineTo(px, y(EASE[name](u)));
    }
    ctx.stroke();
  });
  return (
    <canvas ref={ref} width={120} height={72} className="block w-full rounded-sm bg-surface-2" />
  );
}

/** 核心模組的視覺化：緩動曲線、決定性亂數 */
export function ModulesDemo() {
  const rng = createRandom('骰子');
  const rolls = Array.from({ length: 10 }, () => rng.int(1, 20));
  return (
    <div className="flex flex-col gap-3">
      <Section title="緩動曲線（core/timeline 的 EASE）">
        <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-4">
          {EASING_CHOICES.map((c) => (
            <li key={c.value} className="flex flex-col gap-1">
              <Curve name={c.value} />
              <span className="text-xs text-muted">
                {c.label}（{c.value}）
              </span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="決定性亂數（createRandom）">
        <p className="m-0 text-sm">
          種子「骰子」擲 10 次 D20：<span className="font-mono">{rolls.join('、')}</span>
        </p>
        <p className="m-0 text-xs text-muted">
          重新整理頁面，結果也完全一樣；匯出的每一格因此可以重現。
        </p>
      </Section>
      <TypesetDemo />
      <PagedDemo />
      <PostDemo />
      <FlowDemo />
      <VideoDemo />
    </div>
  );
}
