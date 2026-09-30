import type { AppUser, Pairing, Preset } from '../lib/types'
import { t, tRich } from '../i18n'

interface Props {
  users: AppUser[]
  presets: Preset[]
  pairings: Pairing[]
  /** 作業中的選擇（有效值。只要清單不是空的就不會是 null）。 */
  userId: string | null
  presetId: string | null
  onSelectUser: (id: string) => void
  onSelectPreset: (id: string) => void
  /** 把目前的選擇加進儲存清單。 */
  onSave: () => void
  /** 把儲存的配對叫回作業中的選擇。 */
  onRecall: (pairing: Pairing) => void
  /** 刪除儲存的配對。 */
  onRemove: (index: number) => void
}

function userLabel(u: AppUser): string {
  return u.name ? `${u.name}（${u.id}）` : u.id
}

/**
 * 選擇作業中的一組（使用者 × 預設集）。使用者 select 就是<b>替換 ID</b>的入口。
 * 輸出 CSS 立即跟著這個選擇。按「儲存」把選擇存進儲存清單（pairings），點一列就能叫回。
 */
export default function CombinePanel({
  users,
  presets,
  pairings,
  userId,
  presetId,
  onSelectUser,
  onSelectPreset,
  onSave,
  onRecall,
  onRemove,
}: Props) {
  const canPair = users.length > 0 && presets.length > 0
  const alreadySaved =
    userId != null &&
    presetId != null &&
    pairings.some((p) => p.userId === userId && p.presetId === presetId)

  return (
    <div className="panel">
      <h2>{t('combine.heading')}</h2>

      {!canPair ? (
        <p className="empty">{t('combine.empty')}</p>
      ) : (
        <>
          <div className="pair-add">
            <div className="field">
              <label htmlFor="cp-user">{t('combine.user')}</label>
              <select
                id="cp-user"
                value={userId ?? ''}
                onChange={(e) => onSelectUser(e.target.value)}
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {userLabel(u)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="cp-preset">{t('combine.preset')}</label>
              <select
                id="cp-preset"
                value={presetId ?? ''}
                onChange={(e) => onSelectPreset(e.target.value)}
              >
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || t('preset.unnamed')}
                  </option>
                ))}
              </select>
            </div>
            <button className="primary" onClick={onSave} disabled={alreadySaved}>
              {alreadySaved ? t('combine.saved') : t('combine.save')}
            </button>
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            {tRich('combine.hint', <b style={{ color: 'var(--text)' }}>{t('combine.hint.ownId')}</b>)}
          </p>
        </>
      )}

      <div className="subhead">{t('combine.savedHeading', pairings.length)}</div>
      {pairings.length === 0 ? (
        <p className="empty">{t('combine.savedEmpty')}</p>
      ) : (
        pairings.map((pair, i) => {
          const u = users.find((x) => x.id === pair.userId)
          const p = presets.find((x) => x.id === pair.presetId)
          const isCurrent = pair.userId === userId && pair.presetId === presetId
          return (
            <div className={`pair-item${isCurrent ? ' active' : ''}`} key={`${pair.userId}-${pair.presetId}-${i}`}>
              <button
                type="button"
                className="pair-recall"
                aria-label={t('combine.recall.aria', i + 1)}
                onClick={() => onRecall(pair)}
              >
                {(u ? u.name || u.id : pair.userId)} × {p?.name || t('preset.unnamed')}
              </button>
              <button className="danger" onClick={() => onRemove(i)}>
                {t('action.remove')}
              </button>
            </div>
          )
        })
      )}
    </div>
  )
}
