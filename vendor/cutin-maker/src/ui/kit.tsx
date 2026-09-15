import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { t } from '../i18n';
import type { RenderParams } from '../core/types';
import { Thumb } from './Thumb';

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block mb-3">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-medium text-neutral-300">{label}</span>
        {hint && <span className="text-[11px] text-neutral-500">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

export function Slider({
  label, value, min, max, step, onChange, format,
}: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <Field label={label} hint={format ? format(value) : String(Math.round(value * 1000) / 1000)}>
      <input
        type="range"
        className="w-full accent-sky-400"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </Field>
  );
}

export function Choice<T extends string>({
  items, value, onChange, columns = 2,
}: {
  items: Array<{ id: T; label: string; style?: React.CSSProperties; sub?: string; disabled?: boolean }>;
  value: T;
  onChange: (v: T) => void;
  columns?: number;
}) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={() => onChange(it.id)}
          className={`rounded-md border px-2 py-2 text-left text-sm transition ${
            value === it.id
              ? 'border-sky-400 bg-sky-400/10 text-sky-100'
              : it.disabled
                ? 'border-dashed border-neutral-800 bg-neutral-900/40 text-neutral-600 hover:border-neutral-600'
                : 'border-neutral-700 bg-neutral-800/50 text-neutral-300 hover:border-neutral-500'
          }`}
        >
          <span style={it.style} className="block truncate">{it.label}</span>
          {it.sub && <span className="block text-[10px] text-neutral-500 truncate">{it.sub}</span>}
        </button>
      ))}
    </div>
  );
}

export function Button({
  children, onClick, variant = 'default', disabled,
}: { children: ReactNode; onClick?: () => void; variant?: 'default' | 'primary' | 'ghost'; disabled?: boolean }) {
  const cls =
    variant === 'primary'
      ? 'bg-sky-500 hover:bg-sky-400 text-neutral-950 font-semibold'
      : variant === 'ghost'
        ? 'bg-transparent hover:bg-neutral-800 text-neutral-300 border border-neutral-700'
        : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-100';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-3 py-2 text-sm transition disabled:opacity-40 disabled:cursor-not-allowed ${cls}`}
    >
      {children}
    </button>
  );
}

export function NumberInput({ value, onChange, min, max, step = 1 }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <input
      type="number"
      className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
    />
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{title}</h3>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* かんたん／詳細                                                       */
/* ------------------------------------------------------------------ */

const AdvancedContext = createContext(false);

export function AdvancedProvider({ value, children }: { value: boolean; children: ReactNode }) {
  return <AdvancedContext.Provider value={value}>{children}</AdvancedContext.Provider>;
}

/** 詳細設定がONのときだけ中身を出す。判定を各パネルに散らさないためのラッパ */
export function Advanced({ children }: { children: ReactNode }) {
  return useContext(AdvancedContext) ? <>{children}</> : null;
}

/** 詳細設定のON/OFFを localStorage に覚える */
export function useAdvanced(): [boolean, (v: boolean) => void] {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem('cutin.advanced') === '1';
    } catch {
      return false;
    }
  });
  const set = (v: boolean) => {
    setOn(v);
    try {
      localStorage.setItem('cutin.advanced', v ? '1' : '0');
    } catch {
      /* プライベートウィンドウ等では黙って諦める */
    }
  };
  return [on, set];
}

/* ------------------------------------------------------------------ */

/** ラベルの上に実際の描画サムネを出す選択肢グリッド */
export function ThumbChoice<T extends string>({
  items, value, onChange, columns = 3, size = 92,
}: {
  items: Array<{ id: T; label: string; params: RenderParams; sub?: string }>;
  value: T | null;
  onChange: (v: T) => void;
  columns?: number;
  size?: number;
}) {
  const [hover, setHover] = useState<T | null>(null);
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={() => onChange(it.id)}
          onMouseEnter={() => setHover(it.id)}
          onMouseLeave={() => setHover((h) => (h === it.id ? null : h))}
          onFocus={() => setHover(it.id)}
          onBlur={() => setHover((h) => (h === it.id ? null : h))}
          className={`flex flex-col items-center gap-1 rounded-lg border p-1.5 transition ${
            value === it.id
              ? 'border-sky-400 bg-sky-400/10'
              : 'border-neutral-700 bg-neutral-800/40 hover:border-neutral-500'
          }`}
        >
          <Thumb params={it.params} size={size} animate={hover === it.id} />
          <span className={`w-full truncate text-center text-[11px] ${value === it.id ? 'text-sky-100' : 'text-neutral-300'}`}>
            {it.label}
          </span>
        </button>
      ))}
    </div>
  );
}

/** 配布先など、常時見えていてほしい排他選択 */
export function Segmented<T extends string>({
  items, value, onChange,
}: { items: Array<{ id: T; label: string; sub?: string }>; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg bg-neutral-800/60 p-1">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={() => onChange(it.id)}
          title={it.sub}
          className={`rounded-md px-3 py-1.5 text-xs transition ${
            value === it.id ? 'bg-sky-400/20 text-sky-100' : 'text-neutral-400 hover:bg-neutral-700/60'
          }`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

/** 書き出し結果など、その場で完結させたいものを重ねて出す */
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-800" aria-label={t('dialog.close')}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
