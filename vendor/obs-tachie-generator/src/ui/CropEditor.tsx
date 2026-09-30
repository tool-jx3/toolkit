import { useEffect, useRef, useState } from 'react'
import {
  cropDataUri,
  dataUriBytes,
  detectTrimRect,
  isFullRect,
  normalizeCropRect,
  readDimensions,
  type CropRect,
} from '../lib/crop'
import type { Dimensions } from '../lib/image'
import { errorMsg, msgText, t, tRich, type Msg } from '../i18n'

interface Props {
  /** 要裁切的對象（建議是已匯入的 data URI）。空白時什麼都不顯示。 */
  imageUrl: string
  /** 裁切後的 data URI。由呼叫端替換 `Preset.imageUrl`。 */
  onApply: (dataUrl: string) => void
}

/** 確認階段持有的「實際裁切的結果」。按下時就計算好，先給使用者看再確定。 */
interface Pending {
  dataUrl: string
  rect: CropRect
  /** 來自哪個操作（用來區分確認文字）。 */
  source: 'trim' | 'rect'
}

/** 讓位元組數好讀一點。 */
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

/**
 * 立繪圖片的裁切 UI。**「修掉留白」（自動修剪）與「指定範圍裁切」**兩條路。
 *
 * 裁切是破壞性的（不保留原圖），所以**套用前一定要確認**。確認不用瀏覽器的
 * `confirm()`，而是面板內的兩段式按鈕——有些環境（例如 OBS 的內建瀏覽器）會擋掉
 * `confirm()`，而且**想當場顯示裁切後的尺寸與嵌入大小**
 * （固定為 PNG，原圖是 JPEG/WebP 時反而可能變大）。
 *
 * 確認階段持有的是**實際裁切的結果**（按下時就經過 canvas）。
 * 顯示的數值與實際套用的內容一定一致。
 */
export default function CropEditor({ imageUrl, onApply }: Props) {
  const [dims, setDims] = useState<Dimensions | null>(null)
  /** 尺寸的讀取狀態。不把「讀取中」與「讀不到」分開，失敗時會永遠看起來像「取得中…」。 */
  const [dimsState, setDimsState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [rectMode, setRectMode] = useState(false)
  const [rect, setRect] = useState<CropRect | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)
  // 訊息存 key（Msg），算繪時才取譯文，切換語言後跟著換。
  const [info, setInfo] = useState<Msg | null>(null)
  const [error, setError] = useState<Msg | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const dragging = useRef<{ x: number; y: number } | null>(null)

  // 圖片變了，就把尺寸、選取中的範圍、待確認的結果都丟掉（前一張圖的座標沒有意義）。
  useEffect(() => {
    setRect(null)
    setPending(null)
    setInfo(null)
    setError(null)
    setRectMode(false)
    setDims(null)
    if (!imageUrl) {
      setDimsState('failed')
      return
    }
    setDimsState('loading')
    let alive = true
    readDimensions(imageUrl)
      .then((d) => {
        if (!alive) return
        setDims(d)
        setDimsState('ready')
      })
      .catch(() => {
        if (!alive) return
        setDimsState('failed')
      })
    return () => {
      alive = false
    }
  }, [imageUrl])

  if (!imageUrl) return null

  const bytes = dataUriBytes(imageUrl)

  /** 畫面座標 → 圖片的像素座標。 */
  function toImagePoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const el = imgRef.current
    if (!el || !dims) return null
    const b = el.getBoundingClientRect()
    if (b.width < 1 || b.height < 1) return null
    return {
      x: ((clientX - b.left) / b.width) * dims.width,
      y: ((clientY - b.top) / b.height) * dims.height,
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!dims) return
    const p = toImagePoint(e.clientX, e.clientY)
    if (!p) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragging.current = p
    setRect({ x: p.x, y: p.y, width: 0, height: 0 })
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const start = dragging.current
    if (!start || !dims) return
    const p = toImagePoint(e.clientX, e.clientY)
    if (!p) return
    // 以原始矩形（含負的寬度）保存，確定時由 normalizeCropRect 修正方向。
    setRect({ x: start.x, y: start.y, width: p.x - start.x, height: p.y - start.y })
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current || !dims) return
    dragging.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
    // 拖曳結束時對齊成整數矩形（與數值輸入的值一致）。
    setRect((r) => (r && dims ? normalizeCropRect(r, dims) : r))
  }

  /** 從數值輸入更新一個邊。 */
  function setRectField(key: keyof CropRect, value: number) {
    if (!dims) return
    const base = rect ?? { x: 0, y: 0, width: dims.width, height: dims.height }
    // 輸入中不正規化（刪掉寬度重打的途中被自動修正的話就打不下去）。
    setRect({ ...base, [key]: value })
  }

  /** 為了顯示而正規化的矩形（用於畫框與判斷能不能「裁切」）。 */
  const safeRect = rect && dims ? normalizeCropRect(rect, dims) : null

  async function runTrim() {
    if (!imageUrl) return
    setBusy(true)
    setInfo(null)
    setError(null)
    try {
      const found = await detectTrimRect(imageUrl)
      if (!found) {
        setInfo({ key: 'crop.info.noMargin' })
        return
      }
      const out = await cropDataUri(imageUrl, found)
      setPending({ dataUrl: out.dataUrl, rect: out.rect, source: 'trim' })
    } catch (e) {
      setError(errorMsg(e, 'crop.err.failed'))
    } finally {
      setBusy(false)
    }
  }

  async function runRectCrop() {
    if (!imageUrl || !safeRect) return
    setBusy(true)
    setInfo(null)
    setError(null)
    try {
      const out = await cropDataUri(imageUrl, safeRect)
      setPending({ dataUrl: out.dataUrl, rect: out.rect, source: 'rect' })
    } catch (e) {
      setError(errorMsg(e, 'crop.err.failed'))
    } finally {
      setBusy(false)
    }
  }

  function confirmApply() {
    if (!pending) return
    onApply(pending.dataUrl)
    setPending(null)
    setRect(null)
    setRectMode(false)
    setInfo({ key: 'crop.info.applied' })
  }

  // 框的預覽（以相對於圖片的 % 放置，顯示倍率變了也會跟著）。
  const boxStyle =
    safeRect && dims
      ? {
          left: `${(safeRect.x / dims.width) * 100}%`,
          top: `${(safeRect.y / dims.height) * 100}%`,
          width: `${(safeRect.width / dims.width) * 100}%`,
          height: `${(safeRect.height / dims.height) * 100}%`,
        }
      : undefined

  const pendingBytes = pending ? dataUriBytes(pending.dataUrl) : 0

  return (
    <>
      <div className="subhead">{t('crop.heading')}</div>
      <p className="hint" style={{ marginTop: 0 }}>
        {t('crop.current')}{' '}
        {dims
          ? `${dims.width}×${dims.height}px`
          : dimsState === 'loading'
            ? t('crop.sizeLoading')
            : t('crop.sizeUnknown')}{' '}
        {t('crop.embedded', formatBytes(bytes))}
        {'　'}
        <strong>{t('crop.marginWarn')}</strong>
      </p>
      {dimsState === 'failed' && (
        <p className="hint" style={{ color: 'var(--warn)' }} role="status">
          {t('crop.unreadable')}
        </p>
      )}

      <div className="chips" style={{ marginBottom: 10 }}>
        <button
          type="button"
          className="chip"
          disabled={busy || !dims || pending != null}
          onClick={runTrim}
        >
          {t('crop.trim')}
        </button>
        <button
          type="button"
          className="chip"
          data-on={rectMode}
          aria-pressed={rectMode}
          disabled={busy || !dims || pending != null}
          onClick={() => {
            const next = !rectMode
            setRectMode(next)
            setInfo(null)
            setError(null)
            // 打開時以整張圖片為初始值（從那裡往內縮的操作最自然）。
            setRect(next && dims ? { x: 0, y: 0, width: dims.width, height: dims.height } : null)
          }}
        >
          {t('crop.rect')}
        </button>
      </div>

      {rectMode && dims && (
        <div className="crop-edit">
          <div
            className="crop-stage"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            aria-label={t('crop.stage.aria')}
          >
            <img ref={imgRef} src={imageUrl} alt="" draggable={false} />
            {boxStyle && <div className="crop-box" style={boxStyle} />}
          </div>

          <div className="row">
            {(
              [
                ['x', 'X(px)', dims.width - 1],
                ['y', 'Y(px)', dims.height - 1],
                ['width', t('crop.width'), dims.width],
                ['height', t('crop.height'), dims.height],
              ] as Array<[keyof CropRect, string, number]>
            ).map(([key, label, max]) => (
              <div className="field" key={key}>
                <label htmlFor={`pr-crop-${key}`}>{label}</label>
                <input
                  id={`pr-crop-${key}`}
                  type="number"
                  min={key === 'width' || key === 'height' ? 1 : 0}
                  max={max}
                  value={rect ? Math.round(rect[key]) : ''}
                  onChange={(e) => setRectField(key, Number(e.target.value))}
                />
              </div>
            ))}
          </div>

          <p className="hint" style={{ marginTop: 0 }}>
            {safeRect
              ? t('crop.after', `${safeRect.width}×${safeRect.height}`)
              : t('crop.outside')}
          </p>

          <button
            type="button"
            className="chip"
            disabled={busy || !safeRect || isFullRect(safeRect, dims) || pending != null}
            onClick={runRectCrop}
          >
            {t('crop.doRect')}
          </button>
          {safeRect && isFullRect(safeRect, dims) && (
            <p className="hint" style={{ marginTop: 6 }}>
              {t('crop.fullSelected')}
            </p>
          )}
        </div>
      )}

      {/* 第二階段：先給使用者看實際裁切的結果，再確定。 */}
      {pending && dims && (
        <div className="crop-confirm" role="alertdialog" aria-labelledby="pr-crop-confirm-title">
          <p id="pr-crop-confirm-title" style={{ margin: '0 0 6px', fontWeight: 700 }}>
            {pending.source === 'trim' ? t('crop.confirm.trim') : t('crop.confirm.rect')}
          </p>
          <p className="hint" style={{ margin: '0 0 4px' }}>
            {dims.width}×{dims.height}px → <strong>{pending.rect.width}×{pending.rect.height}px</strong>
            {'　'}
            {tRich('crop.confirm.bytes', formatBytes(bytes), <strong>{formatBytes(pendingBytes)}</strong>)}
            {pendingBytes > bytes && t('crop.confirm.grew')}
          </p>
          <p className="hint" style={{ margin: '0 0 8px', color: 'var(--warn)' }}>
            {tRich('crop.confirm.irreversible', <strong>{t('crop.confirm.irreversible.strong')}</strong>)}
          </p>
          <div className="chips">
            <button type="button" className="chip" data-on onClick={confirmApply}>
              {t('crop.confirm.apply')}
            </button>
            <button type="button" className="chip" onClick={() => setPending(null)}>
              {t('crop.confirm.cancel')}
            </button>
          </div>
        </div>
      )}

      {busy && <p className="hint">{t('status.busy')}</p>}
      {info && <p className="hint">{msgText(info)}</p>}
      {error && (
        <p className="hint" style={{ color: 'var(--danger)' }} role="alert">
          {msgText(error)}
        </p>
      )}
    </>
  )
}
