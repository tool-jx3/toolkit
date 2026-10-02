/**
 * 統計（F10～F14）：跑團天數、劇本數、總遊玩時間、同團玩家。數值改變時從 0 跑到新值（約 0.7 秒、ease-out 三次方）。
 */
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { computeStats, countUpProgress, formatStat } from './logic';
import { useLog, useSelfNames } from './store';
import { S } from './strings';

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** 數字從 0 跑到 target（target 沒變時不重跑） */
function useCountUp(target: number): number {
  const [value, setValue] = useState(target);
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (last.current === target) return;
    last.current = target;
    if (prefersReducedMotion() || typeof requestAnimationFrame === 'undefined') {
      setValue(target);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const eased = countUpProgress(now - start);
      setValue(target * eased);
      if (eased < 1) raf = requestAnimationFrame(tick);
    };
    setValue(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return value;
}

function Stat({
  label,
  unit,
  target,
  suffix = '',
  testId,
}: {
  label: string;
  unit: string;
  target: number;
  suffix?: string;
  testId: string;
}) {
  const value = useCountUp(target);
  const decimal = !Number.isInteger(target);
  return (
    <div className="flex min-w-0 items-end justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2">
      <div className="min-w-0">
        <p className="m-0 truncate text-xs text-muted">{label}</p>
        <p
          className="m-0 text-xl font-semibold tabular-nums text-fg"
          data-testid={testId}
          data-value={formatStat(target, decimal) + suffix}
        >
          {formatStat(value, decimal)}
          {suffix}
        </p>
      </div>
      <span className="shrink-0 pb-0.5 text-xs text-muted" aria-hidden>
        {unit}
      </span>
    </div>
  );
}

export function Stats() {
  const rows = useDeferredValue(useLog((s) => s.data.rows));
  const self = useSelfNames();
  const stats = useMemo(() => computeStats(rows, self), [rows, self]);
  return (
    <section aria-label={S.stats.aria} className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <Stat
        label={S.stats.days.label}
        unit={S.stats.days.unit}
        target={stats.days}
        testId="stat-days"
      />
      <Stat
        label={S.stats.scenarios.label}
        unit={S.stats.scenarios.unit}
        target={stats.scenarios}
        testId="stat-scenarios"
      />
      <Stat
        label={S.stats.hours.label}
        unit={S.stats.hours.unit}
        target={stats.hours}
        suffix="h"
        testId="stat-hours"
      />
      <Stat
        label={S.stats.coPlayers.label}
        unit={S.stats.coPlayers.unit}
        target={stats.coPlayers}
        testId="stat-coplayers"
      />
    </section>
  );
}
