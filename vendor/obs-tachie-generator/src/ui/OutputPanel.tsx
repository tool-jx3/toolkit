import { useMemo, useState } from 'react'
import { generateCss } from '../lib/generateCss'
import { copyText, cssFilename, downloadText } from '../lib/download'
import { presetToOptions, renderUser, type AppUser, type Preset } from '../lib/types'
import { t, tRich, useLocale } from '../i18n'

interface Props {
  /** 作業中選擇的使用者（未選擇時為 null）。 */
  user: AppUser | null
  /** 作業中選擇的預設集（未選擇時為 null）。 */
  preset: Preset | null
  /** 立繪圖片的實際尺寸（寬 px）。寬度為原尺寸時，用於名字標籤的對齊與立繪的繪製尺寸。 */
  imageNaturalWidth?: number | null
  /** 立繪圖片的實際尺寸（高 px）。與 imageNaturalWidth 成對，用於立繪的繪製尺寸（背景方式）。 */
  imageNaturalHeight?: number | null
}

/**
 * 輸出步驟。輸出**作業中選擇的那一組**的個別（一人＝一個來源・常駐顯示）CSS。
 * 以 `generateCss([renderUser(user, preset)], presetToOptions(preset))` 合成。
 * 不輸出合併版（lib 的 `generateCombinedCss` 保留著，但 UI 不呼叫）。
 */
export default function OutputPanel({ user, preset, imageNaturalWidth, imageNaturalHeight }: Props) {
  const [copied, setCopied] = useState(false)
  // 輸出 CSS 的註解跟著目前語言，所以語言也放進 useMemo 的相依陣列（切換語言就重新產生）。
  const locale = useLocale()

  const out = useMemo(() => {
    if (!user || !preset) return null
    const userLabel = user.name || user.id
    const presetLabel = preset.name || 'preset'
    return {
      title: `${userLabel} × ${preset.name || t('preset.unnamed')}`,
      filename: cssFilename(`${userLabel}-${presetLabel}`),
      css: generateCss(
        [renderUser(user, preset)],
        presetToOptions(preset, imageNaturalWidth ?? undefined, imageNaturalHeight ?? undefined),
      ),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- locale 不在函式內讀取，是讓譯文重新取值的觸發條件
  }, [user, preset, imageNaturalWidth, imageNaturalHeight, locale])

  // 對齊（靠左以外）或「鋪滿立繪寬度」的字幕條需要框寬。未指定寬度＋量不到實際尺寸時，
  // 設定會留著卻默默從輸出消失，所以把這個狀態明白標示出來。
  const label = preset?.nameLabel
  const needsBoxWidth =
    (label?.show ?? false) &&
    (label?.align !== 'left' || (label.background && label.fit === 'stretch'))
  const alignUnavailable =
    needsBoxWidth && (preset?.width == null || preset.width <= 0) && imageNaturalWidth == null

  async function onCopy() {
    if (!out) return
    const ok = await copyText(out.css)
    setCopied(ok)
    if (ok) window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="panel">
      <h2>{t('output.heading')}</h2>
      <p className="hint" style={{ marginTop: 0 }}>
        {tRich('output.hint', <b style={{ color: 'var(--text)' }}>{t('output.hint.perSource')}</b>)}
      </p>

      {alignUnavailable && (
        <p className="hint" style={{ color: 'var(--warn)' }} role="status">
          {tRich(
            'output.alignUnavailable',
            preset?.nameLabel.align === 'right' ? t('align.right') : t('align.center'),
            <b style={{ color: 'var(--text)' }}>{t('output.alignUnavailable.width')}</b>,
          )}
        </p>
      )}

      {!out ? (
        <p className="empty">{t('output.empty')}</p>
      ) : (
        <div className="output-block">
          <div className="head">
            <span className="title">{out.title}</span>
            <div className="actions">
              {copied && <span className="badge">{t('output.copied')}</span>}
              <button onClick={onCopy}>{t('output.copy')}</button>
              <button onClick={() => downloadText(out.filename, out.css)}>{t('output.download')}</button>
            </div>
          </div>
          <textarea className="css-out" readOnly value={out.css} spellCheck={false} />
        </div>
      )}

      <ol className="paste-steps">
        <li>{tRich('output.paste1', <b>Streamkit Overlay</b>)}</li>
        <li>{tRich('output.paste2', <b>{t('output.paste2.source')}</b>)}</li>
        <li>{tRich('output.paste3', <b>{t('output.paste3.css')}</b>)}</li>
      </ol>
    </div>
  )
}
