import { getFont } from '../../core/fonts';
import type { RenderParams } from '../../core/types';
import { t } from '../../i18n';

interface Props {
  params: RenderParams;
  onText: (text: string) => void;
  maxChars: number;
}

/**
 * プレビュー直下に常設するテキスト欄。
 * タブを切り替えなくても、いつでも文字を打ち替えられるようにする。
 */
export function TextPanel({ params, onText, maxChars }: Props) {
  const font = getFont(params.text.fontId);
  const chars = params.text.lines.join('').length;
  const limit = Math.min(maxChars, font.recommendedMaxChars);
  const over = chars > limit;

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-medium text-neutral-300">{t('text.label')}</span>
        <span className={`text-[11px] ${over ? 'text-amber-400' : 'text-neutral-500'}`}>
          {t('text.count', chars, limit)}
        </span>
      </div>
      <textarea
        className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-base"
        rows={2}
        value={params.text.lines.join('\n')}
        placeholder={t('text.placeholder')}
        onChange={(e) => onText(e.target.value)}
      />
    </div>
  );
}
