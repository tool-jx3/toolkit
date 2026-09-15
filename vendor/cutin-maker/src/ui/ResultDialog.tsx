import { fmtBytes, type ExportTarget } from '../core/targets';
import type { OutputFormat } from '../core/types';
import { t } from '../i18n';
import { Button, Dialog } from './kit';

export interface ExportResult {
  url: string;
  bytes: number;
  format: OutputFormat;
  filename: string;
}

interface Props {
  result: ExportResult | null;
  target: ExportTarget;
  /** カットイン名として案内する文字列（テキスト1行目） */
  triggerWord: string;
  onClose: () => void;
  onLighten: () => void;
}

/** 配布先ごとの「このあとどうするか」 */
function usage(target: ExportTarget, word: string): string[] {
  switch (target.id) {
    case 'ccfolia-cutin':
      return [
        t('usage.ccfolia.1'),
        t('usage.ccfolia.2', word || t('recipe.success.text')),
        t('usage.ccfolia.3'),
      ];
    case 'discord-sticker':
      return [t('usage.sticker.1'), t('usage.sticker.2')];
    case 'discord-attachment':
      return [t('usage.attachment.1'), t('usage.attachment.2')];
    default:
      return target.notes;
  }
}

export function ResultDialog({ result, target, triggerWord, onClose, onLighten }: Props) {
  if (!result) return null;
  const over = result.bytes > target.maxBytes;
  const ratio = Math.round((result.bytes / target.maxBytes) * 100);

  return (
    <Dialog open onClose={onClose} title={t('result.title')}>
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="checker shrink-0 self-start rounded-lg p-2">
          <img src={result.url} alt={t('result.alt')} className="max-h-[240px] max-w-[240px]" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded bg-neutral-800 px-2 py-1 font-semibold">{result.format.toUpperCase()}</span>
            <span className={over ? 'text-red-400' : 'text-emerald-400'}>
              {t('result.size', fmtBytes(result.bytes), fmtBytes(target.maxBytes), ratio)}
            </span>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <a
              className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-sky-400"
              href={result.url}
              download={result.filename}
            >
              {t('result.download')}
            </a>
            {over && <Button onClick={onLighten}>{t('result.lighten')}</Button>}
            <Button variant="ghost" onClick={onClose}>{t('result.keepEditing')}</Button>
          </div>

          {over && (
            <p className="mb-3 text-xs text-red-400">
              {t('result.overNote')}
            </p>
          )}

          <h3 className="mb-1 text-[11px] font-semibold tracking-wide text-neutral-400">{t('result.usage', target.label)}</h3>
          <ol className="list-inside list-decimal space-y-1 text-xs text-neutral-300">
            {usage(target, triggerWord).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
          <p className="mt-2 text-[11px] text-neutral-500">{t('result.filename', result.filename)}</p>
        </div>
      </div>
    </Dialog>
  );
}
