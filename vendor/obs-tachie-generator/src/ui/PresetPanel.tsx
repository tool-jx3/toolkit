import { useState } from 'react'
import CropEditor from './CropEditor'
import { fileToDataUri, isWithinSizeLimit } from '../lib/image'
import { resolveImageSource, type ImageSourceMode } from '../lib/imageSource'
import { requiredSpeakMargin, speakMarginNote } from '../lib/speakMargin'
import {
  resetPresetOptions,
  resolveAnchors,
  type AnchorX,
  type AnchorY,
  type NameAlign,
  type NameFit,
  type NameLabel,
  type Preset,
  type SpeakEffect,
} from '../lib/types'
import { msgText, t, tRich, type Msg } from '../i18n'

interface Props {
  presets: Preset[]
  editingId: string | null
  onSelect: (id: string) => void
  onAdd: () => void
  onRemove: (id: string) => void
  onChange: (preset: Preset) => void
  /** 編輯中預設集圖片的實際尺寸（寬 px）。寬度為原尺寸時用於對齊。量測前為 null。 */
  imageNaturalWidth?: number | null
}

/** 嵌入最大寬度的預設值。0 表示原尺寸（＝不縮放）。 */
const DEFAULT_MAX_WIDTH = 0

/** 立繪圖片的輸入方式（互斥）。 */
type ImageInputMode = 'upload' | 'url'

/** 3×3 的錨點選擇（依畫面的排列 上→下／左→右）。 */
const ANCHOR_ROWS: AnchorY[] = ['top', 'middle', 'bottom']
const ANCHOR_COLS: AnchorX[] = ['left', 'center', 'right']

/* 以下幾張表存的都是 i18n key，算繪時才用 t() 取譯文（頂層不能先取，否則語言會凍結在載入時）。 */
const ANCHOR_LABEL: Record<AnchorY, Record<AnchorX, string>> = {
  top: { left: 'anchor.topLeft', center: 'anchor.topCenter', right: 'anchor.topRight' },
  middle: { left: 'anchor.middleLeft', center: 'anchor.middleCenter', right: 'anchor.middleRight' },
  bottom: { left: 'anchor.bottomLeft', center: 'anchor.bottomCenter', right: 'anchor.bottomRight' },
}

/** 偏移輸入欄的標籤。是「距錨點的距離」，所以意思隨錨點而變。 */
const OFFSET_X_LABEL: Record<AnchorX, string> = {
  left: 'offset.fromLeft',
  center: 'offset.fromCenterX',
  right: 'offset.fromRight',
}
const OFFSET_Y_LABEL: Record<AnchorY, string> = {
  bottom: 'offset.fromBottom',
  middle: 'offset.fromCenterY',
  top: 'offset.fromTop',
}
/** 中央錨點不是「距離」而是帶正負號的偏移，所以補充方向。 */
const OFFSET_X_HINT: Partial<Record<AnchorX, string>> = { center: 'offset.positiveRight' }
const OFFSET_Y_HINT: Partial<Record<AnchorY, string>> = { middle: 'offset.positiveUp' }

/** 名字附在立繪的哪一邊（垂直方向取不到立繪的高度，所以是錨點那一側的邊）。 */
const NAME_EDGE: Record<AnchorY, string> = {
  bottom: 'name.edge.bottom',
  middle: 'name.edge.middle',
  top: 'name.edge.top',
}

/**
 * 立繪・效果（預設集）的建立/編輯。上段兩個區塊（左=清單／右=圖片＋選項）。
 * 圖片輸入是「上傳 ⇄ 圖片 URL」的互斥切換。預覽由 App 放在下段全寬。
 */
export default function PresetPanel({
  presets,
  editingId,
  onSelect,
  onAdd,
  onRemove,
  onChange,
  imageNaturalWidth,
}: Props) {
  const editing = presets.find((p) => p.id === editingId) ?? null

  const [imgMode, setImgMode] = useState<ImageInputMode>('url')
  const [urlInput, setUrlInput] = useState('')
  const [mode, setMode] = useState<ImageSourceMode>('auto')
  const [maxWidth, setMaxWidth] = useState(DEFAULT_MAX_WIDTH)
  const [busy, setBusy] = useState(false)
  // 訊息存 key（Msg），算繪時才取譯文，切換語言後跟著換。
  const [info, setInfo] = useState<Msg | null>(null)
  const [error, setError] = useState<Msg | null>(null)

  function set<K extends keyof Preset>(key: K, value: Preset[K]) {
    if (!editing) return
    onChange({ ...editing, [key]: value })
  }
  function setSpeak<K extends keyof SpeakEffect>(key: K, value: SpeakEffect[K]) {
    if (!editing) return
    onChange({ ...editing, speak: { ...editing.speak, [key]: value } })
  }
  function setName<K extends keyof NameLabel>(key: K, value: NameLabel[K]) {
    if (!editing) return
    onChange({ ...editing, nameLabel: { ...editing.nameLabel, [key]: value } })
  }

  // 沒決定「立繪的寬度」就無從對齊。即使沒有指定寬度，只要量得到圖片的實際尺寸
  // 就能以它為基準（＝只有連圖片都沒有／讀不到時才停用）。
  const alignBaseWidth = editing?.width ?? imageNaturalWidth ?? null
  const alignDisabled = alignBaseWidth == null

  // 錨點（未指定時為左下）。偏移的標籤與名字的基準邊也跟著這裡變。
  const anchors = resolveAnchors(editing ?? {})
  const margin = editing ? requiredSpeakMargin(editing.speak, anchors.x, anchors.y) : null
  const noteX = editing ? speakMarginNote(margin?.x ?? null, editing.left) : null
  const noteY = editing ? speakMarginNote(margin?.y ?? null, editing.bottom) : null
  const offsetHintX = OFFSET_X_HINT[anchors.x]
  const offsetHintY = OFFSET_Y_HINT[anchors.y]

  async function onFile(file: File | undefined) {
    if (!file || !editing) return
    setError(null)
    setInfo(null)
    if (!isWithinSizeLimit(file)) {
      setError({ key: 'image.err.tooLarge' })
      return
    }
    setBusy(true)
    try {
      const dataUri = await fileToDataUri(file, { maxWidth: maxWidth > 0 ? maxWidth : undefined })
      onChange({ ...editing, imageUrl: dataUri })
      setInfo({ key: 'image.info.uploaded' })
    } catch {
      setError({ key: 'image.err.readFailed' })
    } finally {
      setBusy(false)
    }
  }

  async function applyUrl() {
    if (!editing) return
    setError(null)
    setInfo(null)
    const value = urlInput.trim()
    if (!value) {
      setError({ key: 'image.err.noUrl' })
      return
    }
    setBusy(true)
    try {
      const resolved = await resolveImageSource(value, mode, maxWidth > 0 ? maxWidth : undefined)
      onChange({ ...editing, imageUrl: resolved.imageUrl })
      setInfo(
        resolved.warningKey
          ? {
              key: 'image.info.setWithWarning',
              args: [{ key: resolved.noteKey }, { key: resolved.warningKey }],
            }
          : { key: 'image.info.set', args: [{ key: resolved.noteKey }] },
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="preset-top">
      {/* 上段左：預設集清單 */}
      <div className="panel preset-list-panel">
        <h2>{t('presetList.heading')}</h2>
        <div className="preset-list">
          <button type="button" className="preset-add" onClick={onAdd}>
            {t('presetList.add')}
          </button>
          {presets.map((p) => (
            <div key={p.id} className={`preset-item${p.id === editingId ? ' active' : ''}`}>
              <button type="button" className="preset-pick" onClick={() => onSelect(p.id)}>
                <span className="thumb">
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt="" />
                  ) : (
                    <span className="thumb-empty">?</span>
                  )}
                </span>
                <span className="preset-name">{p.name || t('preset.unnamed')}</span>
              </button>
              <button className="danger" onClick={() => onRemove(p.id)}>
                {t('action.remove')}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 上段右：圖片＋選項 */}
      <div className="panel preset-editor-panel">
        {!editing ? (
          <p className="empty">{t('presetEditor.empty')}</p>
        ) : (
          <>
            <div className="field">
              <label htmlFor="pr-name">{t('presetEditor.name')}</label>
              <input
                id="pr-name"
                type="text"
                placeholder={t('presetEditor.name.placeholder')}
                value={editing.name}
                onChange={(e) => set('name', e.target.value)}
              />
            </div>

            <div className="subhead">{t('image.heading')}</div>
            <div className="preset-image-row">
              <span className="thumb lg">
                {editing.imageUrl ? (
                  <img src={editing.imageUrl} alt={t('image.current.alt')} />
                ) : (
                  <span className="thumb-empty">{t('image.unset')}</span>
                )}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="seg" role="group" aria-label={t('image.mode.aria')}>
                  <button
                    type="button"
                    aria-pressed={imgMode === 'upload'}
                    onClick={() => setImgMode('upload')}
                  >
                    {t('image.mode.upload')}
                  </button>
                  <button
                    type="button"
                    aria-pressed={imgMode === 'url'}
                    onClick={() => setImgMode('url')}
                  >
                    {t('image.mode.url')}
                  </button>
                </div>

                {imgMode === 'upload' ? (
                  <div className="field">
                    <label htmlFor="pr-file">{t('image.upload')}</label>
                    <input
                      id="pr-file"
                      type="file"
                      accept="image/*"
                      onChange={(e) => onFile(e.target.files?.[0])}
                    />
                  </div>
                ) : (
                  <>
                    <div className="field">
                      <label htmlFor="pr-url">{t('image.url')}</label>
                      <div className="row" style={{ alignItems: 'stretch' }}>
                        <input
                          id="pr-url"
                          type="url"
                          style={{ flex: '1 1 180px' }}
                          placeholder={t('image.url.placeholder')}
                          value={urlInput}
                          onChange={(e) => setUrlInput(e.target.value)}
                        />
                        <button onClick={applyUrl} disabled={busy}>
                          {t('image.url.apply')}
                        </button>
                      </div>
                    </div>
                    <div className="field">
                      <label htmlFor="pr-mode">{t('image.urlMode')}</label>
                      <select
                        id="pr-mode"
                        value={mode}
                        onChange={(e) => setMode(e.target.value as ImageSourceMode)}
                      >
                        <option value="auto">{t('image.urlMode.auto')}</option>
                        <option value="url">{t('image.urlMode.url')}</option>
                        <option value="dataUri">{t('image.urlMode.dataUri')}</option>
                      </select>
                    </div>
                  </>
                )}

                <div className="field">
                  <label htmlFor="pr-maxw">
                    {t('image.maxWidth')}
                    <small>{t('image.maxWidth.hint')}</small>
                  </label>
                  <input
                    id="pr-maxw"
                    type="number"
                    min={0}
                    value={maxWidth}
                    onChange={(e) => setMaxWidth(Number(e.target.value))}
                  />
                </div>
              </div>
            </div>
            {busy && <p className="hint">{t('status.busy')}</p>}
            {info && <p className="hint">{msgText(info)}</p>}
            {error && (
              <p className="hint" style={{ color: 'var(--danger)' }} role="alert">
                {msgText(error)}
              </p>
            )}

            {/* 裁切只是替換圖片（輸出 CSS 的形式不變）。 */}
            <CropEditor
              imageUrl={editing.imageUrl}
              onApply={(dataUrl) => set('imageUrl', dataUrl)}
            />

            <div className="subhead">{t('position.heading')}</div>
            <div className="anchor-block">
              <div className="field" style={{ flex: '0 0 auto' }}>
                <span id="pr-anchor-label" className="anchor-legend">
                  {t('position.anchor')}
                </span>
                <div
                  className="anchor-grid"
                  role="radiogroup"
                  aria-labelledby="pr-anchor-label"
                >
                  {ANCHOR_ROWS.map((ay) =>
                    ANCHOR_COLS.map((ax) => {
                      const on = anchors.x === ax && anchors.y === ay
                      return (
                        <button
                          key={`${ax}-${ay}`}
                          type="button"
                          className="anchor-cell"
                          role="radio"
                          aria-checked={on}
                          data-on={on}
                          title={t(ANCHOR_LABEL[ay][ax])}
                          onClick={() => {
                            if (!editing) return
                            onChange({ ...editing, anchorX: ax, anchorY: ay })
                          }}
                        >
                          <span className="sr-only">{t(ANCHOR_LABEL[ay][ax])}</span>
                        </button>
                      )
                    }),
                  )}
                </div>
              </div>
              <p className="hint" style={{ margin: 0, flex: '1 1 160px' }}>
                {t('position.anchorHint', t(ANCHOR_LABEL[anchors.y][anchors.x]))}
              </p>
            </div>
            <div className="row">
              <div className="field">
                <label htmlFor="pr-left">
                  {t(OFFSET_X_LABEL[anchors.x])}
                  {offsetHintX && <small>{t(offsetHintX)}</small>}
                  {noteX && <small className={noteX.warn ? 'why' : undefined}>{noteX.text}</small>}
                </label>
                <input
                  id="pr-left"
                  type="number"
                  value={editing.left}
                  onChange={(e) => set('left', Number(e.target.value))}
                />
              </div>
              <div className="field">
                <label htmlFor="pr-bottom">
                  {t(OFFSET_Y_LABEL[anchors.y])}
                  {offsetHintY && <small>{t(offsetHintY)}</small>}
                  {noteY && <small className={noteY.warn ? 'why' : undefined}>{noteY.text}</small>}
                </label>
                <input
                  id="pr-bottom"
                  type="number"
                  value={editing.bottom}
                  onChange={(e) => set('bottom', Number(e.target.value))}
                />
              </div>
              <div className="field">
                <label htmlFor="pr-width">{t('position.width')}</label>
                <input
                  id="pr-width"
                  type="number"
                  min={0}
                  value={editing.width ?? ''}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    // 空白・0 以下是「原尺寸」（寬度 0 只會讓立繪消失，所以不接受）。
                    set('width', e.target.value === '' || v <= 0 ? undefined : v)
                  }}
                />
              </div>
            </div>

            <div className="subhead">{t('speak.heading')}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '4px 0 8px' }}>
              {t('speak.lead')}
            </div>
            <div className="chips">
              <button
                type="button"
                className="chip"
                data-on={editing.speak.bounce}
                aria-pressed={editing.speak.bounce}
                onClick={() => setSpeak('bounce', !editing.speak.bounce)}
              >
                <span className="dot" />
                {t('speak.bounce')}
              </button>
              <button
                type="button"
                className="chip"
                data-on={editing.speak.outline}
                aria-pressed={editing.speak.outline}
                onClick={() => setSpeak('outline', !editing.speak.outline)}
              >
                <span className="dot" />
                {t('speak.outline')}
              </button>
              <button
                type="button"
                className="chip"
                data-on={editing.speak.blink}
                aria-pressed={editing.speak.blink}
                onClick={() => setSpeak('blink', !editing.speak.blink)}
              >
                <span className="dot" />
                {t('speak.blink')}
              </button>
            </div>

            <div className="row" style={{ marginTop: 12 }}>
              <div className="field">
                <label htmlFor="pr-jump">
                  {t('speak.jump')}
                  {!editing.speak.bounce && (
                    <small className="why">{t('speak.jump.why')}</small>
                  )}
                </label>
                <input
                  id="pr-jump"
                  type="number"
                  min={0}
                  value={editing.speak.jumpPx}
                  disabled={!editing.speak.bounce}
                  onChange={(e) => setSpeak('jumpPx', Number(e.target.value))}
                />
              </div>
              <div className="field">
                <label htmlFor="pr-dur">{t('speak.duration')}</label>
                <input
                  id="pr-dur"
                  type="number"
                  min={50}
                  value={editing.speak.durationMs}
                  onChange={(e) => setSpeak('durationMs', Number(e.target.value))}
                />
              </div>
              <div className="field">
                <label htmlFor="pr-color">
                  {t('speak.outlineColor')}
                  {!editing.speak.outline && (
                    <small className="why">{t('speak.outline.why')}</small>
                  )}
                </label>
                <input
                  id="pr-color"
                  type="color"
                  value={editing.speak.outlineColor ?? '#FFFFFF'}
                  disabled={!editing.speak.outline}
                  onChange={(e) => setSpeak('outlineColor', e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="pr-outw">
                  {t('speak.outlineWidth')}
                  {!editing.speak.outline && (
                    <small className="why">{t('speak.outline.why')}</small>
                  )}
                </label>
                <input
                  id="pr-outw"
                  type="number"
                  min={1}
                  value={editing.speak.outlineWidth}
                  disabled={!editing.speak.outline}
                  onChange={(e) => setSpeak('outlineWidth', Number(e.target.value))}
                />
              </div>
            </div>

            <div className="subhead">{t('name.heading')}</div>
            <label className="toggle" htmlFor="pr-name-show">
              <input
                id="pr-name-show"
                type="checkbox"
                checked={editing.nameLabel.show}
                onChange={(e) => setName('show', e.target.checked)}
              />
              <span className="sw" />
              <span className="lab">
                {t('name.show')}
                <small>{t('name.show.hint')}</small>
              </span>
            </label>

            {editing.nameLabel.show && (
              <>
                <div className="row">
                  <div className="field">
                    <label htmlFor="pr-name-x">
                      {t('name.x')}
                      <small>{t('name.x.hint')}</small>
                    </label>
                    <input
                      id="pr-name-x"
                      type="number"
                      value={editing.nameLabel.offsetX}
                      onChange={(e) => setName('offsetX', Number(e.target.value))}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="pr-name-y">
                      {t('name.y')}
                      <small>{t(NAME_EDGE[anchors.y])}</small>
                    </label>
                    <input
                      id="pr-name-y"
                      type="number"
                      value={editing.nameLabel.offsetY}
                      onChange={(e) => setName('offsetY', Number(e.target.value))}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="pr-name-size">{t('name.size')}</label>
                    <input
                      id="pr-name-size"
                      type="number"
                      min={1}
                      value={editing.nameLabel.fontSize}
                      onChange={(e) => setName('fontSize', Number(e.target.value))}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="pr-name-color">{t('name.color')}</label>
                    <input
                      id="pr-name-color"
                      type="color"
                      value={editing.nameLabel.color}
                      onChange={(e) => setName('color', e.target.value)}
                    />
                  </div>
                </div>

                <div className="row">
                  <div className="field">
                    <label htmlFor="pr-name-font">
                      {t('name.font')}
                      <small>{t('name.font.hint')}</small>
                    </label>
                    <input
                      id="pr-name-font"
                      type="text"
                      placeholder={t('name.font.placeholder')}
                      value={editing.nameLabel.fontFamily}
                      onChange={(e) => setName('fontFamily', e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="pr-name-align">
                      {t('name.align')}
                      {alignDisabled ? (
                        <small className="why">{t('name.align.why')}</small>
                      ) : (
                        <small>
                          {t('name.align.within', alignBaseWidth)}
                          {editing.width == null && t('name.align.natural')}
                        </small>
                      )}
                    </label>
                    <select
                      id="pr-name-align"
                      value={editing.nameLabel.align}
                      onChange={(e) => setName('align', e.target.value as NameAlign)}
                      disabled={alignDisabled}
                      title={
                        alignDisabled
                          ? t('name.align.disabledTitle')
                          : editing.width == null
                            ? t('name.align.naturalTitle', alignBaseWidth)
                            : undefined
                      }
                    >
                      <option value="left">{t('align.left')}</option>
                      <option value="center">{t('align.center')}</option>
                      <option value="right">{t('align.right')}</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="pr-name-outw">
                      {t('name.outlineWidth')}
                      {!editing.nameLabel.outline && (
                        <small className="why">{t('name.outline.why')}</small>
                      )}
                    </label>
                    <input
                      id="pr-name-outw"
                      type="number"
                      min={0}
                      value={editing.nameLabel.outlineWidth}
                      disabled={!editing.nameLabel.outline}
                      onChange={(e) => setName('outlineWidth', Number(e.target.value))}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="pr-name-outc">
                      {t('name.outlineColor')}
                      {!editing.nameLabel.outline && (
                        <small className="why">{t('name.outline.why')}</small>
                      )}
                    </label>
                    <input
                      id="pr-name-outc"
                      type="color"
                      value={editing.nameLabel.outlineColor}
                      disabled={!editing.nameLabel.outline}
                      onChange={(e) => setName('outlineColor', e.target.value)}
                    />
                  </div>
                </div>

                <div className="chips">
                  <button
                    type="button"
                    className="chip"
                    data-on={editing.nameLabel.bold}
                    aria-pressed={editing.nameLabel.bold}
                    onClick={() => setName('bold', !editing.nameLabel.bold)}
                  >
                    <span className="dot" />
                    {t('name.bold')}
                  </button>
                  <button
                    type="button"
                    className="chip"
                    data-on={editing.nameLabel.outline}
                    aria-pressed={editing.nameLabel.outline}
                    onClick={() => setName('outline', !editing.nameLabel.outline)}
                  >
                    <span className="dot" />
                    {t('name.outline')}
                  </button>
                  <button
                    type="button"
                    className="chip"
                    data-on={editing.nameLabel.background}
                    aria-pressed={editing.nameLabel.background}
                    onClick={() => setName('background', !editing.nameLabel.background)}
                  >
                    <span className="dot" />
                    {t('name.background')}
                  </button>
                </div>

                {editing.nameLabel.background && (
                  <>
                    <div className="row" style={{ marginTop: 12 }}>
                      <div className="field">
                        <label htmlFor="pr-name-bgfit">
                          {t('band.fit')}
                          {editing.nameLabel.fit === 'stretch' && alignDisabled ? (
                            <small className="why">{t('band.fit.why')}</small>
                          ) : (
                            <small>{t('band.fit.hint')}</small>
                          )}
                        </label>
                        <select
                          id="pr-name-bgfit"
                          value={editing.nameLabel.fit}
                          onChange={(e) => setName('fit', e.target.value as NameFit)}
                        >
                          <option value="text">{t('band.fit.text')}</option>
                          <option value="stretch">{t('band.fit.stretch')}</option>
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor="pr-name-bgc">{t('band.color')}</label>
                        <input
                          id="pr-name-bgc"
                          type="color"
                          value={editing.nameLabel.backgroundColor}
                          onChange={(e) => setName('backgroundColor', e.target.value)}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="pr-name-bgo">
                          {t('band.opacity')}
                          <small>{t('band.opacity.hint')}</small>
                        </label>
                        <input
                          id="pr-name-bgo"
                          type="number"
                          min={0}
                          max={100}
                          value={editing.nameLabel.backgroundOpacity}
                          onChange={(e) => setName('backgroundOpacity', Number(e.target.value))}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="pr-name-bgr">{t('band.radius')}</label>
                        <input
                          id="pr-name-bgr"
                          type="number"
                          min={0}
                          value={editing.nameLabel.backgroundRadius}
                          onChange={(e) => setName('backgroundRadius', Number(e.target.value))}
                        />
                      </div>
                    </div>

                    <div className="row">
                      <div className="field">
                        <label htmlFor="pr-name-bgpx">
                          {t('band.padX')}
                          <small>{t('band.padX.hint')}</small>
                        </label>
                        <input
                          id="pr-name-bgpx"
                          type="number"
                          min={0}
                          value={editing.nameLabel.backgroundPadX}
                          onChange={(e) => setName('backgroundPadX', Number(e.target.value))}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="pr-name-bgpy">
                          {t('band.padY')}
                          <small>{t('band.padY.hint')}</small>
                        </label>
                        <input
                          id="pr-name-bgpy"
                          type="number"
                          min={0}
                          value={editing.nameLabel.backgroundPadY}
                          onChange={(e) => setName('backgroundPadY', Number(e.target.value))}
                        />
                      </div>
                    </div>
                  </>
                )}

                <p className="hint" style={{ marginTop: 10 }}>
                  {tRich(
                    'name.note',
                    <code>body::before</code>,
                    <code>body::after</code>,
                    <b style={{ color: 'var(--text)' }}>{t('name.note.limit')}</b>,
                  )}
                </p>
              </>
            )}

            <div className="subhead">{t('other.heading')}</div>
            <label className="toggle" htmlFor="pr-dim">
              <input
                id="pr-dim"
                type="checkbox"
                checked={editing.dimWhenQuiet}
                onChange={(e) => set('dimWhenQuiet', e.target.checked)}
              />
              <span className="sw" />
              <span className="lab">
                {t('other.dim')}
                <small>{t('other.dim.hint')}</small>
              </span>
            </label>

            <label className="toggle" htmlFor="pr-hide">
              <input
                id="pr-hide"
                type="checkbox"
                checked={editing.hideWhenAway}
                onChange={(e) => set('hideWhenAway', e.target.checked)}
              />
              <span className="sw" />
              <span className="lab">
                {t('other.hide')}
                <small>{t('other.hide.hint')}</small>
              </span>
            </label>

            <div style={{ marginTop: 14 }}>
              <button
                type="button"
                className="sm ghost"
                onClick={() => onChange(resetPresetOptions(editing))}
              >
                {t('other.reset')}
              </button>
              <span className="hint" style={{ marginLeft: 8 }}>
                {t('other.reset.hint')}
              </span>
            </div>

            <p className="hint" style={{ marginTop: 12 }}>
              {tRich('other.hasNote', <code>:has()</code>)}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
