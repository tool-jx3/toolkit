/**
 * 模型資訊與診斷（規格 F89）：部件數、擺動部件數、尺寸、去雜訊，必要圖層的檢查清單與警告。
 */
import { CircleAlert, CircleCheck, Sparkles, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { warningText } from './rigText';
import { type ModelInfo, useSession } from './store';
import { S } from './strings';

export type DiagLevel = 'ok' | 'warn' | 'bad' | 'auto';

export interface DiagItem {
  level: DiagLevel;
  text: string;
  note?: string;
}

/** 檢查清單（順序、判斷照原作） */
export function diagnose(m: ModelInfo): DiagItem[] {
  const out: DiagItem[] = [];
  const real = (bn: string) => m.layers.filter((l) => l.bn === bn && !l.synthetic);
  const synth = (bn: string) => m.layers.some((l) => l.bn === bn && l.synthetic);
  const sides = (bn: string) =>
    new Set(
      real(bn)
        .map((l) => l.side)
        .filter(Boolean),
    ).size;
  const add = (level: DiagLevel, text: string, note?: string) => out.push({ level, text, note });
  const eyePart = (bn: string, label: string, required: boolean) => {
    const n = sides(bn);
    if (n >= 2) add('ok', label);
    else if (n === 1) add('warn', label, S.diag.oneSide);
    else add(required ? 'bad' : 'warn', label, S.diag.missing);
  };
  const hasFace = real('face').length > 0;
  add(hasFace ? 'ok' : 'bad', S.diag.face, hasFace ? undefined : S.diag.faceGuess);
  eyePart('eyewhite', S.diag.eyewhite, true);
  eyePart('irides', S.diag.irides, true);
  eyePart('eyelash', S.diag.eyelash, false);
  if (sides('eye_close') >= 2) add('ok', S.diag.eyeClose);
  else if (synth('eye_close')) add('auto', S.diag.eyeCloseShort, S.diag.eyeCloseAuto);
  else add('warn', S.diag.eyeClose, S.diag.eyeCloseNone);
  if (m.layers.some((l) => l.bn === 'eye_close2')) add('ok', S.diag.eyeClose2);
  eyePart('eyebrow', S.diag.eyebrow, false);
  const hasOpen = real('mouth_open').length > 0;
  add(hasOpen ? 'ok' : 'bad', S.diag.mouthOpen, hasOpen ? undefined : S.diag.noLipSync);
  if (real('mouth_close').length) add('ok', S.diag.mouthClose);
  else if (synth('mouth_close')) add('auto', S.diag.mouthCloseShort, S.diag.mouthCloseAuto);
  else add('warn', S.diag.mouthClose, S.diag.missing);
  const strands = (bn: string) =>
    m.layers.filter((l) => l.bn === bn).reduce((s, l) => s + l.strands, 0);
  const hair = ['front hair', 'side hair', 'ahoge', 'back hair'].filter((bn) =>
    m.layers.some((l) => l.bn === bn),
  );
  if (hair.length)
    add(
      'ok',
      S.diag.hair,
      hair.map((bn) => S.diag.hairStrands(S.roles[bn] ?? bn, strands(bn))).join('、'),
    );
  else add('warn', S.diag.hair, S.diag.hairNone);
  const unknown = m.layers.filter((l) => l.unknown);
  if (unknown.length)
    add(
      'warn',
      S.diag.unknown(unknown.length),
      S.diag.unknownNote(unknown.map((l) => l.source || l.name).join('、')),
    );
  for (const w of m.warnings) {
    if (w.code === 'emptyLayer' || w.code === 'eyeAnchor') add('warn', warningText(w));
  }
  return out;
}

const ICON: Record<DiagLevel, ReactNode> = {
  ok: <CircleCheck aria-hidden className="size-4 text-success" />,
  warn: <TriangleAlert aria-hidden className="size-4 text-warning" />,
  bad: <CircleAlert aria-hidden className="size-4 text-danger" />,
  auto: <Sparkles aria-hidden className="size-4 text-accent" />,
};

export function DiagnosticsPanel() {
  const m = useSession((s) => s.model);
  if (!m) return <p className="m-0 text-sm text-muted">{S.infoNone}</p>;
  const nStrands = m.layers.reduce((s, l) => s + l.strands, 0);
  return (
    <div className="flex flex-col gap-2" data-testid="rig-info">
      <p className="m-0 text-sm text-fg">
        {S.modelLabel(m.name)}
        <br />
        {S.infoSummary(m.layers.length, nStrands)}
        <br />
        {S.infoSize(m.width, m.height)}
        {m.noise ? (
          <>
            <br />
            {S.infoNoise(m.noise.noisy, m.noise.layers)}
          </>
        ) : null}
      </p>
      <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label={S.diagAria}>
        {diagnose(m).map((d) => (
          <li
            key={`${d.text}|${d.note ?? ''}`}
            className="flex items-start gap-1.5 text-sm"
            data-level={d.level}
          >
            <span className="mt-0.5 shrink-0">{ICON[d.level]}</span>
            <span className="sr-only">{S.diagLevels[d.level]}：</span>
            <span className="min-w-0">
              {d.text}
              {d.note ? <span className="text-xs text-muted">：{d.note}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
